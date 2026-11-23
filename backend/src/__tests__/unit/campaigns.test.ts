import { CampaignMessageService } from '../../services/campaigns/campaign-message.service';
import { WebhookController } from '../../controllers/webhook.controller';
import { createIdempotencyMiddleware } from '../../middlewares/idempotency.middleware';
import {
  buildCampaignPayload,
  createCampaignSchema,
  normalizePhone,
  resolveVariables,
  templateVariables,
} from '../../services/campaigns/campaign-contract';
import {
  CampaignStatusService,
  allowedPreviousStatuses,
} from '../../services/campaigns/campaign-status.service';
import {
  CampaignWorkerService,
  retryDelay,
} from '../../services/campaigns/campaign-worker.service';
import { CampaignService } from '../../services/campaigns/campaign.service';
import { TemplateManagementService } from '../../services/templates/template-management.service';
import { WebhookParserService } from '../../services/whatsapp/webhook-parser.service';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';
const id = '00000000-0000-4000-8000-000000000001';
const template = {
  id: '123',
  name: 'saludo',
  language: 'es_MX',
  category: 'UTILITY',
  status: 'APPROVED',
  components: [
    { type: 'BODY', text: 'Hola {{2}}, {{1}}' },
    { type: 'HEADER', format: 'TEXT', text: '{{1}}' },
  ],
};
const config = {
  messagesUrl: 'https://example.invalid/messages',
  accessToken: 'fake',
  phoneNumberId: '12345',
};
const body = (status: string, callback = id, recipientId = '525512345678') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: '12345' },
            statuses: [
              {
                id: 'wamid.test',
                recipient_id: recipientId,
                status,
                timestamp: '1700000000',
                biz_opaque_callback_data: callback,
              },
            ],
          },
        },
      ],
    },
  ],
});

describe('Campaign contract', () => {
  it('orders numeric positions within their components and evaluates mappings', () => {
    const vars = templateVariables(template);
    const values = resolveVariables(
      vars,
      {
        'body.1': { mode: 'dynamic', field: 'nombre' },
        'body.2': { mode: 'static', value: 'vecino' },
        'header.1': { mode: 'static', value: 'Aviso' },
      },
      { nombre: 'Ana' },
    );
    expect(buildCampaignPayload(template, values, '525512345678', id).template.components).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'Aviso' }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ana' },
          { type: 'text', text: 'vecino' },
        ],
      },
    ]);
  });
  it('supports named variables and templates without variables', () => {
    const named = {
      ...template,
      parameter_format: 'NAMED',
      components: [{ type: 'BODY', text: 'Hola {{nombre}}' }],
    };
    expect(
      buildCampaignPayload(named, { 'body.nombre': 'Ana' }, '525512345678', id).template
        .components[0].parameters[0],
    ).toEqual({ type: 'text', text: 'Ana', parameter_name: 'nombre' });
    expect(
      buildCampaignPayload(
        { ...template, components: [{ type: 'BODY', text: 'Hola' }] },
        {},
        '525512345678',
        id,
      ).template.components,
    ).toEqual([]);
  });
  it('rejects unapproved/unsupported templates, missing values, inherited fields and invalid phones', () => {
    expect(() => templateVariables({ ...template, status: 'PAUSED' })).toThrow();
    expect(() =>
      templateVariables({ ...template, components: [{ type: 'HEADER', format: 'LOCATION' }] }),
    ).toThrow();
    expect(() =>
      resolveVariables(
        [{ key: 'body.1', component: 'body', parameter: '1' }],
        { 'body.1': { mode: 'dynamic', field: 'toString' } },
        {},
      ),
    ).toThrow();
    expect(() => normalizePhone('123abc456789')).toThrow();
    expect(() => normalizePhone('')).toThrow();
    expect(normalizePhone('+52 (55) 1234-5678')).toBe('5215512345678');
    expect(normalizePhone('55 1234-5678')).toBe('5215512345678');
    expect(normalizePhone('5215512345678')).toBe('5215512345678');
    expect(normalizePhone('34600123456')).toBe('34600123456');
  });
});

describe('Campaign creation durability', () => {
  const input = createCampaignSchema.parse({
    name: 'Aviso',
    purpose: 'Invitación',
    lineId: id,
    templateId: '123',
    consentConfirmed: true,
    mappings: {},
    audience: { source: 'csv', phoneColumn: 'tel', rows: [{ tel: '525512345678' }] },
  });
  afterEach(() => jest.restoreAllMocks());
  it('commits all rows before enqueue; queue outage leaves a recoverable campaign', async () => {
    jest.spyOn(TemplateManagementService.prototype, 'config').mockResolvedValue(config as never);
    jest
      .spyOn(TemplateManagementService.prototype, 'assertOwnership')
      .mockResolvedValue({ ...template, components: [{ type: 'BODY', text: 'Hola' }] });
    let committed = false;
    const create = jest.fn().mockResolvedValue({});
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      campaign: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn) => {
        await fn({ campaign: { create }, campaignRecipient: { createMany } });
        committed = true;
      }),
    };
    const dispatchCampaign = jest.fn(async () => {
      expect(committed).toBe(true);
      throw new Error('queue down');
    });
    const result = await new CampaignService(prisma as never, { dispatchCampaign } as never).create(
      input,
      id,
      id,
    );
    expect(result.total).toBe(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          campaignId: expect.any(String),
          phone: '5215512345678',
        }),
      ],
    });
    expect(dispatchCampaign).toHaveBeenCalledWith(result.id);
  });
  it('normalizes citizen phones before persisting campaign recipients', async () => {
    jest.spyOn(TemplateManagementService.prototype, 'config').mockResolvedValue(config as never);
    jest
      .spyOn(TemplateManagementService.prototype, 'assertOwnership')
      .mockResolvedValue({ ...template, components: [{ type: 'BODY', text: 'Hola' }] });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const citizenInput = createCampaignSchema.parse({
      ...input,
      audience: { source: 'citizen', citizenIds: [id] },
    });
    const prisma = {
      campaign: { findUnique: jest.fn().mockResolvedValue(null) },
      citizen: {
        findMany: jest.fn().mockResolvedValue([
          {
            id,
            name: 'Ana',
            lastName: 'Pérez',
            phone: '525512345678',
            email: null,
            neighborhood: null,
          },
        ]),
      },
      $transaction: jest.fn(async (fn) =>
        fn({
          campaign: { create: jest.fn().mockResolvedValue({}) },
          campaignRecipient: { createMany },
        }),
      ),
    };
    await new CampaignService(prisma as never).create(citizenInput, id, id);
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ campaignId: expect.any(String), phone: '5215512345678' })],
    });
  });
  it('rejects invalid and equivalent duplicate phones before persistence', async () => {
    jest.spyOn(TemplateManagementService.prototype, 'config').mockResolvedValue(config as never);
    jest
      .spyOn(TemplateManagementService.prototype, 'assertOwnership')
      .mockResolvedValue({ ...template, components: [{ type: 'BODY', text: 'Hola' }] });
    const transaction = jest.fn();
    const service = new CampaignService({
      campaign: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as never);
    const invalidInput = createCampaignSchema.parse({
      ...input,
      audience: { source: 'csv', phoneColumn: 'tel', rows: [{ tel: '' }] },
    });
    const duplicateInput = createCampaignSchema.parse({
      ...input,
      audience: {
        source: 'csv',
        phoneColumn: 'tel',
        rows: [{ tel: '525512345678' }, { tel: '5215512345678' }],
      },
    });
    await expect(service.create(invalidInput, id, id)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.create(duplicateInput, id, id)).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects reuse of an idempotency key with different content before doing external work', async () => {
    const prisma = {
      campaign: { findUnique: jest.fn().mockResolvedValue({ requestHash: 'different' }) },
    };
    await expect(new CampaignService(prisma as never).create(input, id, id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

function workerFixture() {
  const row = {
    id,
    campaignId: id,
    phone: '525512345678',
    variables: {},
    attempts: 0,
    dispatchState: 'queued',
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    campaign: {
      findUnique: jest.fn().mockResolvedValue({
        id,
        lineId: id,
        phoneNumberId: '12345',
        templateSnapshot: { ...template, components: [{ type: 'BODY', text: 'Hola' }] },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    campaignRecipient: {
      updateMany,
      findMany: jest.fn().mockResolvedValue([row]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    rateLimitCounter: { upsert: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  return { prisma, updateMany, worker: new CampaignWorkerService(prisma as never) };
}
describe('Campaign worker', () => {
  beforeEach(() => {
    jest.spyOn(CampaignMessageService.prototype, 'sync').mockResolvedValue(undefined);
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue(config as never);
  });
  afterEach(() => jest.restoreAllMocks());
  it('accepts an HTTP response without claiming that delivery was confirmed', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 }),
      );
    const { worker, updateMany } = workerFixture();
    await worker.processBatch(id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = fetchMock.mock.calls[0][1]?.body;
    expect(typeof requestBody).toBe('string');
    expect(JSON.parse(requestBody as string)).toMatchObject({
      to: '5215512345678',
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ messageId: 'wamid.test', dispatchState: 'accepted' }),
      }),
    );
    expect(updateMany.mock.calls.at(-1)![0].data.status).toBeUndefined();
  });
  it('does not send when another worker has claimed the recipient', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { worker, updateMany } = workerFixture();
    updateMany.mockResolvedValue({ count: 0 });
    await worker.processBatch(id);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a timeout uncertain instead of automatically duplicating the message', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    const { worker, updateMany } = workerFixture();
    await worker.processBatch(id);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { dispatchState: 'uncertain', errorCode: 'NETWORK_OUTCOME_UNKNOWN' },
      }),
    );
  });
  it('reschedules explicit throttling and respects Retry-After', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 130429 } }), {
        status: 429,
        headers: { 'Retry-After': '90' },
      }),
    );
    const { worker, updateMany } = workerFixture();
    const before = Date.now();
    await worker.processBatch(id);
    const data = updateMany.mock.calls.at(-1)![0].data;
    expect(data.dispatchState).toBe('queued');
    expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 90000);
    expect(retryDelay(1, 'Wed, 01 Jan 2031 00:00:00 GMT', 0)).toBe(
      Date.parse('2031-01-01T00:00:00Z'),
    );
  });
  it('defers without HTTP when the distributed rate budget is consumed', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const { worker, prisma } = workerFixture();
    prisma.rateLimitCounter.upsert.mockResolvedValue({ count: 999 });
    await worker.processBatch(id);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Campaign webhooks', () => {
  it('never regresses read/delivered and allows delivered evidence after failure', () => {
    expect(allowedPreviousStatuses('sent')).not.toContain('read');
    expect(allowedPreviousStatuses('failed')).not.toContain('delivered');
    expect(allowedPreviousStatuses('delivered')).toContain('failed');
  });
  it('correlates a webhook arriving before the HTTP response using callback and number scope', async () => {
    jest.spyOn(CampaignMessageService.prototype, 'sync').mockResolvedValue(undefined);
    const findFirst = jest.fn().mockResolvedValue({ id, campaignId: id });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    await new CampaignStatusService({
      campaignRecipient: { findFirst, updateMany },
      $executeRaw: jest.fn(),
    } as never).ingest(body('read') as never);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      campaign: { phoneNumberId: '12345' },
      phone: { in: expect.arrayContaining(['525512345678', '5215512345678']) },
      OR: expect.arrayContaining([expect.objectContaining({ id, messageId: null })]),
    });
    expect(updateMany.mock.calls[1][0].data.status).toBe('read');
  });
  it('correlates legacy stored phones when Meta returns the 521 format', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id, campaignId: id });
    await new CampaignStatusService({
      campaignRecipient: {
        findFirst,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: jest.fn(),
    } as never).ingest(body('read', id, '5215512345678') as never);
    expect(findFirst.mock.calls[0][0].where.phone).toEqual({
      in: expect.arrayContaining(['5215512345678', '525512345678']),
    });
  });
  it('does not discard statuses in a mixed batch with duplicate inbound messages', async () => {
    const payload = body('read');
    (payload.entry[0].changes[0].value as Record<string, unknown>).messages = [{ id: 'existing' }];
    const next = jest.fn();
    const findMany = jest.fn();
    await createIdempotencyMiddleware({ inboxEvent: { findMany } } as never)(
      { body: payload } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('returns 500 when campaign status persistence fails so Meta retries', async () => {
    const prisma = {
      campaignRecipient: { findFirst: jest.fn().mockRejectedValue(new Error('DB down')) },
    };
    const controller = new WebhookController(
      prisma as never,
      {} as never,
      new WebhookParserService(),
      {} as never,
    );
    const res = { locals: {}, status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.receiveWebhookMessage({ body: body('read') } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
