import { CampaignMessageService } from '../../services/campaigns/campaign-message.service';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { CampaignStatusService } from '../../services/campaigns/campaign-status.service';
import { CampaignWorkerService } from '../../services/campaigns/campaign-worker.service';
import { CampaignService } from '../../services/campaigns/campaign.service';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';

// Isolated temporary schema: never migrates or deletes application tables.
describe('campaigns — real PostgreSQL', () => {
  const schema = `campaign_test_${randomUUID().replace(/-/g, '')}`;
  const userId = randomUUID(),
    lineId = randomUUID();
  let admin: PrismaClient, prisma: PrismaClient;
  beforeEach(() => {
    jest.spyOn(CampaignMessageService.prototype, 'sync').mockResolvedValue(undefined);
  });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1', 'postgres'].includes(url.hostname))
      throw new Error('This suite requires local PostgreSQL');
    admin = new PrismaClient();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('schema', schema);
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    for (const table of ['users', 'communication_lines', 'citizens'])
      await prisma.$executeRawUnsafe(`CREATE TABLE "${table}" (id UUID PRIMARY KEY)`);
    await prisma.$executeRawUnsafe('CREATE TABLE messages (idempotency_key VARCHAR(255))');
    const migration = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261014060000_whatsapp_campaigns/migration.sql'),
      'utf8',
    );
    for (const statement of migration.split(';').filter((s) => s.trim()))
      await prisma.$executeRawUnsafe(statement);
    const attachmentMigration = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20261014080000_campaign_attachments/migration.sql',
      ),
      'utf8',
    );
    for (const statement of attachmentMigration.split(';').filter((s) => s.trim()))
      await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRawUnsafe(
      'CREATE TABLE rate_limit_counters (scope VARCHAR(50), bucket_key VARCHAR(255), window_start TIMESTAMPTZ, count INT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(scope, bucket_key, window_start))',
    );
    await prisma.$executeRaw`INSERT INTO users (id) VALUES (${userId}::uuid)`;
    await prisma.$executeRaw`INSERT INTO communication_lines (id) VALUES (${lineId}::uuid)`;
  }, 30000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.$disconnect();
    }
  });
  async function fixture() {
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Test',
        purpose: 'Test',
        lineId,
        phoneNumberId: '12345',
        templateId: '123',
        templateSnapshot: {
          id: '123',
          name: 'saludo',
          language: 'es_MX',
          category: 'UTILITY',
          status: 'APPROVED',
          components: [{ type: 'BODY', text: 'Hola' }],
        },
        mappings: {},
        source: 'csv',
        total: 1,
        createdBy: userId,
        idempotencyKey: randomUUID(),
        requestHash: 'test',
        consentConfirmedAt: new Date(),
        recipients: { create: { phone: '525512345678', variables: {} } },
      },
      include: { recipients: true },
    });
    return { campaign, recipient: campaign.recipients[0] };
  }
  const payload = (recipientId: string, wamid: string, status: string) => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '12345' },
              statuses: [
                {
                  id: wamid,
                  status,
                  recipient_id: '525512345678',
                  timestamp: '1700000000',
                  biz_opaque_callback_data: recipientId,
                },
              ],
            },
          },
        ],
      },
    ],
  });
  it('handles early, duplicate and concurrent out-of-order statuses without regression', async () => {
    const { campaign, recipient } = await fixture();
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { dispatchState: 'sending', lockedAt: new Date() },
    });
    const service = new CampaignStatusService(prisma as never);
    const wamid = `wamid.${recipient.id}`;
    await service.ingest(payload(recipient.id, wamid, 'read') as never);
    await Promise.all(
      ['sent', 'delivered', 'failed', 'read'].map((status) =>
        service.ingest(payload(recipient.id, wamid, status) as never),
      ),
    );
    const row = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    expect(row.status).toBe('read');
    expect(row.messageId).toBe(wamid);
    expect(row.dispatchState).toBe('accepted');
    const metrics = await new CampaignService(prisma as never).detail(campaign.id, 1);
    expect(metrics.counts).toEqual({ pending: 0, sent: 0, delivered: 0, read: 1, failed: 0 });
    expect(metrics.deliveredTotal).toBe(1);
  });
  it('claims one recipient across two workers and avoids replay after acceptance', async () => {
    const { campaign } = await fixture();
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
      messagesUrl: 'https://example.invalid',
      accessToken: 'fake',
      phoneNumberId: '12345',
    } as never);
    const send = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: `wamid.${campaign.id}` }] }), {
        status: 200,
      }),
    );
    await Promise.all([
      new CampaignWorkerService(prisma as never).processBatch(campaign.id),
      new CampaignWorkerService(prisma as never).processBatch(campaign.id),
    ]);
    await new CampaignWorkerService(prisma as never).processBatch(campaign.id);
    expect(send).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
  it('allows only one concurrent campaign to claim a draft attachment', async () => {
    const [first, second] = await Promise.all([fixture(), fixture()]);
    const attachment = await prisma.campaignAttachment.create({
      data: {
        createdBy: userId,
        lineId,
        templateId: '123',
        fileId: randomUUID(),
        folderId: 'folder',
        filename: 'aviso.pdf',
        mimeType: 'application/pdf',
        mediaType: 'DOCUMENT',
        url: 'https://drive.google.com/uc?id=file',
        viewUrl: 'https://drive.google.com/file/d/file/view',
      },
    });
    const claims = await Promise.all(
      [first, second].map(({ campaign }) =>
        prisma.campaignAttachment.updateMany({
          where: { id: attachment.id, createdBy: userId, campaignId: null },
          data: { campaignId: campaign.id },
        }),
      ),
    );
    expect(claims.reduce((total, claim) => total + claim.count, 0)).toBe(1);
  });
  it('moves a stale in-flight send to review and never resends it', async () => {
    const { campaign, recipient } = await fixture();
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { dispatchState: 'sending', lockedAt: new Date(Date.now() - 180000) },
    });
    const send = jest.spyOn(global, 'fetch');
    await new CampaignWorkerService(prisma as never).processBatch(campaign.id);
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe(
      'needs_review',
    );
    jest.restoreAllMocks();
  });
});
