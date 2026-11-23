/**
 * Tests unitarios: WebhookController.receiveWebhookMessage
 *
 * Cubre la garantía de durabilidad: el InboxEvent se persiste ANTES de responder 200,
 * y un fallo de persistencia devuelve 500 (para que Meta reintente el webhook).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockEnv = {
  WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
  BATCHING_WINDOW_MS: 0,
};

jest.mock('../../config/env.config', () => ({
  env: mockEnv,
}));

import { WebhookController } from '../../controllers/webhook.controller';
import { eventBus } from '../../services/events/event-bus.service';
import { WebhookParserService } from '../../services/whatsapp/webhook-parser.service';

function makeRes() {
  const res: {
    statusCode?: number;
    body?: unknown;
    locals: Record<string, unknown>;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    locals: { correlationId: 'corr-1' },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: '123456' },
            contacts: [{ wa_id: '521999', profile: { name: 'Ana' } }],
            messages: [
              {
                id: 'wamid-1',
                from: '521999',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'hola' },
              },
            ],
          },
        },
      ],
    },
  ],
};

function makeReq(body: unknown = PAYLOAD) {
  return { body, ip: '1.2.3.4' } as never;
}

describe('WebhookController.receiveWebhookMessage — durabilidad', () => {
  let prisma: {
    campaignRecipient: { findFirst: ReturnType<typeof jest.fn> };
    inboxEvent: { upsert: ReturnType<typeof jest.fn> };
    webhookEventLog: { create: ReturnType<typeof jest.fn> };
    $transaction: ReturnType<typeof jest.fn>;
  };
  let inboxProcessor: { enqueue: ReturnType<typeof jest.fn> };
  let messageRepo: { upsertStatusInTransaction: ReturnType<typeof jest.fn> };
  let whatsappProvider: { sendTypingIndicator: ReturnType<typeof jest.fn> };
  let realtimeNotifier: {
    isEnabled: ReturnType<typeof jest.fn>;
    notifyCritical: ReturnType<typeof jest.fn>;
  };
  let controller: WebhookController;

  beforeEach(() => {
    prisma = {
      campaignRecipient: { findFirst: jest.fn(async () => null) },
      inboxEvent: { upsert: jest.fn(async () => ({ id: 'inbox-1', status: 'pending' })) },
      webhookEventLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    inboxProcessor = { enqueue: jest.fn(async () => undefined) };
    messageRepo = { upsertStatusInTransaction: jest.fn(async () => null) };
    whatsappProvider = { sendTypingIndicator: jest.fn(async () => undefined) };
    realtimeNotifier = {
      isEnabled: jest.fn(() => true),
      notifyCritical: jest.fn(async () => undefined),
    };

    controller = new WebhookController(
      prisma as never,
      inboxProcessor as never,
      new WebhookParserService(),
      messageRepo as never,
      whatsappProvider as never,
      realtimeNotifier as never,
    );
  });

  it('persiste el InboxEvent antes de responder 200', async () => {
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq(), res as never);

    expect(prisma.inboxEvent.upsert).toHaveBeenCalledTimes(1);
    expect(inboxProcessor.enqueue).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('responde 500 si la persistencia del InboxEvent falla (Meta reintenta)', async () => {
    prisma.inboxEvent.upsert.mockRejectedValueOnce(new Error('DB down') as never);
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq(), res as never);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'processing_failed' });
  });

  it('ignora con 200 los payloads que no son de WhatsApp', async () => {
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq({ object: 'other' }), res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'ignored' });
    expect(prisma.inboxEvent.upsert).not.toHaveBeenCalled();
  });

  it('zero batching window keeps the immediate path and does not call typing', async () => {
    mockEnv.BATCHING_WINDOW_MS = 0;
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq(), res as never);

    expect(prisma.inboxEvent.upsert).toHaveBeenCalledTimes(1);
    expect(inboxProcessor.enqueue).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(whatsappProvider.sendTypingIndicator).not.toHaveBeenCalled();
  });

  it('positive batching window persists before typing, enqueue and 200', async () => {
    mockEnv.BATCHING_WINDOW_MS = 2500;
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq(), res as never);

    expect(prisma.inboxEvent.upsert).toHaveBeenCalledTimes(1);
    expect(inboxProcessor.enqueue).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(whatsappProvider.sendTypingIndicator).toHaveBeenCalledWith(
      '521999',
      'wamid-1',
      expect.objectContaining({ lineExternalIdentifier: '123456', allowDefault: true }),
    );
  });

  it('typing indicator failure still returns 200 after durable persistence', async () => {
    mockEnv.BATCHING_WINDOW_MS = 2500;
    whatsappProvider.sendTypingIndicator.mockRejectedValueOnce(new Error('Meta API down'));
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq(), res as never);

    expect(prisma.inboxEvent.upsert).toHaveBeenCalledTimes(1);
    expect(inboxProcessor.enqueue).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('persiste delivery statuses por wamid del proveedor después del 200', async () => {
    mockEnv.BATCHING_WINDOW_MS = 0;
    messageRepo.upsertStatusInTransaction.mockResolvedValueOnce({
      created: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wamid: 'wamid.HBgL123',
      status: 'delivered',
      timestamp: new Date('2026-09-23T12:00:00.000Z'),
    });
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123456' },
                statuses: [
                  {
                    id: 'wamid.HBgL123',
                    status: 'delivered',
                    timestamp: '1700000000',
                    recipient_id: '521999888777',
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const res = makeRes();

    await controller.receiveWebhookMessage(makeReq(statusPayload), res as never);

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(messageRepo.upsertStatusInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        wamid: 'wamid.HBgL123',
        status: 'delivered',
      }),
    );
  });

  it('emite un evento durable message.status.changed al persistir un status nuevo', async () => {
    mockEnv.BATCHING_WINDOW_MS = 0;
    messageRepo.upsertStatusInTransaction.mockResolvedValueOnce({
      created: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wamid: 'wamid.HBgL123',
      status: 'delivered',
      timestamp: new Date('2026-09-23T12:00:00.000Z'),
    });
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123456' },
                statuses: [
                  {
                    id: 'wamid.HBgL123',
                    status: 'delivered',
                    timestamp: '1700000000',
                    recipient_id: '521999888777',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await controller.receiveWebhookMessage(makeReq(statusPayload), makeRes() as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(realtimeNotifier.notifyCritical).toHaveBeenCalledTimes(1);
    const [, event] = realtimeNotifier.notifyCritical.mock.calls[0];
    expect(event).toMatchObject({
      eventType: 'message.status.changed',
      socketEventName: 'message.status.changed',
      conversationId: 'conv-1',
      messageStatusPatch: expect.objectContaining({
        messageId: 'msg-1',
        providerMessageId: 'wamid.HBgL123',
        status: 'delivered',
      }),
    });
  });

  it('no emite evento durable cuando el status es duplicado o anterior', async () => {
    mockEnv.BATCHING_WINDOW_MS = 0;
    messageRepo.upsertStatusInTransaction.mockResolvedValueOnce({
      created: false,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wamid: 'wamid.HBgL123',
      status: 'sent',
      timestamp: new Date('2026-09-23T12:00:00.000Z'),
    });
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123456' },
                statuses: [
                  { id: 'wamid.HBgL123', status: 'sent', timestamp: '1700000000' },
                ],
              },
            },
          ],
        },
      ],
    };

    await controller.receiveWebhookMessage(makeReq(statusPayload), makeRes() as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(realtimeNotifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('emite el envelope por el bus legacy cuando el path durable está apagado', async () => {
    mockEnv.BATCHING_WINDOW_MS = 0;
    realtimeNotifier.isEnabled.mockReturnValue(false);
    messageRepo.upsertStatusInTransaction.mockResolvedValueOnce({
      created: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wamid: 'wamid.HBgL123',
      status: 'delivered',
      timestamp: new Date('2026-09-23T12:00:00.000Z'),
    });
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123456' },
                statuses: [
                  { id: 'wamid.HBgL123', status: 'delivered', timestamp: '1700000000' },
                ],
              },
            },
          ],
        },
      ],
    };
    const emitSpy = jest.spyOn(eventBus, 'emit');

    await controller.receiveWebhookMessage(makeReq(statusPayload), makeRes() as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(realtimeNotifier.notifyCritical).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(
      'message.status.changed',
      expect.objectContaining({
        eventType: 'message.status.changed',
        socketEventName: 'message.status.changed',
        conversationId: 'conv-1',
        messageStatusPatch: expect.objectContaining({
          messageId: 'msg-1',
          providerMessageId: 'wamid.HBgL123',
          status: 'delivered',
        }),
      }),
    );

    emitSpy.mockRestore();
  });
});
