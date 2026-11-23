import { createHmac } from 'crypto';
import express from 'express';
import request from 'supertest';
import { createMetaSignatureMiddleware } from '../../middlewares/metaSignature.middleware';
import { createIdempotencyMiddleware } from '../../middlewares/idempotency.middleware';
import { WebhookController } from '../../controllers/webhook.controller';
import { WebhookParserService } from '../../services/whatsapp/webhook-parser.service';
const body = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '998877',
      time: 1720000000,
      changes: [
        {
          field: 'message_template_status_update',
          value: {
            message_template_id: '123456',
            message_template_name: 'saludo',
            event: 'APPROVED',
            reason: 'NONE',
          },
        },
      ],
    },
  ],
};
function app(prisma: unknown) {
  const instance = express();
  instance.use(
    express.json({
      verify: (req, _res, buffer) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buffer;
      },
    }),
  );
  instance.post('/', createMetaSignatureMiddleware(prisma as never), (_req, res) => {
    res.sendStatus(200);
  });
  return instance;
}
describe('Template webhook integration', () => {
  it('accepts a signed WABA event without phone metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([{ whatsappAppSecret: 'secret' }]);
    const signature =
      'sha256=' + createHmac('sha256', 'secret').update(JSON.stringify(body)).digest('hex');
    await request(app({ communicationLine: { findMany } }))
      .post('/')
      .set('X-Hub-Signature-256', signature)
      .send(body)
      .expect(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channel: 'whatsapp', isActive: true, whatsappBusinessAccountId: '998877' },
      }),
    );
  });
  it('rejects a batch containing a WABA whose app secret does not match', async () => {
    const mixed = { ...body, entry: [...body.entry, { ...body.entry[0], id: '112233' }] };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ whatsappAppSecret: 'secret' }])
      .mockResolvedValueOnce([{ whatsappAppSecret: 'different' }]);
    const signature =
      'sha256=' + createHmac('sha256', 'secret').update(JSON.stringify(mixed)).digest('hex');
    await request(app({ communicationLine: { findMany } }))
      .post('/')
      .set('X-Hub-Signature-256', signature)
      .send(mixed)
      .expect(401);
  });
  it('does not discard template updates in a batch of duplicate messages', async () => {
    const next = jest.fn();
    const middleware = createIdempotencyMiddleware({
      inboxEvent: { findMany: jest.fn() },
    } as never);
    await middleware({ body } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('responds only after persistence; database failure=%s', async (fail) => {
    let persisted = false;
    const prisma = {
      $transaction: jest.fn(async (fn) => {
        if (fail) throw new Error('DB down');
        const result = await fn({
          $executeRaw: async () => 0,
          templateStatusEvent: { upsert: async () => ({}) },
        });
        persisted = true;
        return result;
      }),
      webhookEventLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const controller = new WebhookController(
      prisma as never,
      {} as never,
      new WebhookParserService(),
      {} as never,
    );
    const json = jest.fn(() => {
      expect(persisted).toBe(!fail);
    });
    const res = { locals: {}, status: jest.fn().mockReturnThis(), json };
    await controller.receiveWebhookMessage({ body } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(fail ? 500 : 200);
  });
});
