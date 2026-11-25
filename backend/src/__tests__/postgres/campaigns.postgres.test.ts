import { CampaignMessageService } from '../../services/campaigns/campaign-message.service';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { CampaignStatusService } from '../../services/campaigns/campaign-status.service';
import { CampaignWorkerService } from '../../services/campaigns/campaign-worker.service';
import { CampaignService } from '../../services/campaigns/campaign.service';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';
import { dropIsolatedDatabase, migrateIsolatedDatabase } from './baseline-schema';

// Isolated temporary schema: never migrates or deletes application tables.
describe('campaigns — real PostgreSQL', () => {
  const database = `campaign_test_${randomUUID().replace(/-/g, '')}`;
  const userId = randomUUID(),
    lineId = randomUUID();
  let admin: PrismaClient, prisma: PrismaClient;
  beforeEach(() => {
    jest.spyOn(CampaignMessageService.prototype, 'sync').mockResolvedValue(undefined);
  });
  beforeAll(async () => {
    admin = new PrismaClient();
    const url = await migrateIsolatedDatabase(admin, database);
    prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.invalid`, hashedPassword: 'test-only' },
    });
    await prisma.communicationLine.create({
      data: { id: lineId, externalIdentifier: '12345', displayName: 'Test line' },
    });
  }, 60000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma?.$disconnect();
    if (admin) {
      await dropIsolatedDatabase(admin, database);
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
