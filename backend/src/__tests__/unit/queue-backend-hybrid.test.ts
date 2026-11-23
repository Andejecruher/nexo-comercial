import { describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import { InboxProcessorService } from '../../services/events/inbox-processor.service';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';
import { withEnvConfig } from '../helpers/with-env';

function buildInboxProcessor(overrides: {
  findUnique?: unknown;
  updateMany?: unknown;
  dispatcher?: { dispatchInboxEvent: jest.Mock };
}) {
  const prisma = {
    inboxEvent: {
      findUnique: jest.fn(async () => overrides.findUnique),
      updateMany: jest.fn(async () => overrides.updateMany ?? { count: 1 }),
    },
  };
  const whatsapp = { send: jest.fn() };
  const outbox = {} as unknown as ConstructorParameters<typeof InboxProcessorService>[2];
  return new InboxProcessorService(
    prisma as never,
    whatsapp as never,
    outbox,
    undefined,
    overrides.dispatcher as never,
    undefined,
    undefined,
    { pollIntervalMs: 1000 },
  );
}

describe('Events processors — request-driven idempotency', () => {
  it('inbox: devuelve not_found cuando el evento no existe', async () => {
    const processor = buildInboxProcessor({ findUnique: null });

    await expect(processor.processEventById('550e8400-e29b-41d4-a716-446655440000')).resolves.toBe(
      'not_found',
    );
  });

  it('inbox: no reprocesa un evento ya procesado', async () => {
    const processor = buildInboxProcessor({ findUnique: { status: 'processed', payload: {} } });

    await expect(processor.processEventById('550e8400-e29b-41d4-a716-446655440000')).resolves.toBe(
      'noop',
    );
  });

  it('inbox: enqueue despacha el evento vía Cloud Tasks cuando hay dispatcher', async () => {
    const dispatchInboxEvent = jest.fn(async () => undefined);
    const processor = buildInboxProcessor({
      dispatcher: { dispatchInboxEvent },
    });

    // Aísla el test del valor de `.env` local (BATCHING_WINDOW_MS>0 activaría la
    // rama de batching que usa $queryRaw y dispatchBatchEvent, no la ruta directa).
    const restore = withEnvConfig(env, { BATCHING_WINDOW_MS: 0 });
    try {
      await processor.enqueue(
        { wamid: 'wamid-1' } as never,
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(dispatchInboxEvent).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    } finally {
      restore();
    }
  });

  it('outbox: no reenvía un evento ya enviado', async () => {
    const prisma = {
      outboxEvent: {
        findUnique: jest.fn(async () => ({ status: 'sent' })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const waSend = jest.fn(async () => ({ messages: [{ id: 'wamid.out' }] }));
    const processor = new OutboxProcessorService(prisma as never, { send: waSend } as never);

    await expect(processor.processEventById('550e8400-e29b-41d4-a716-446655440001')).resolves.toBe(
      'noop',
    );
    expect(waSend).not.toHaveBeenCalled();
  });

  it('outbox: enqueue registra idempotencia sin dispatcher y no lanza', async () => {
    let captured: { data: { idempotencyKey: string } } | undefined;
    const prisma = {
      outboxEvent: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args: { data: { idempotencyKey: string } }) => {
          captured = args;
          return { id: 'evt-new' };
        }),
      },
    };
    const processor = new OutboxProcessorService(prisma as never, { send: jest.fn() } as never);

    await expect(
      processor.enqueue(
        '521100000000',
        { type: 'text', text: { body: 'hola' } } as never,
        'idem-key-1',
      ),
    ).resolves.toBeUndefined();
    expect(prisma.outboxEvent.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idem-key-1' },
    });
    expect(captured?.data).toEqual(
      expect.objectContaining({
        phone: '521100000000',
        idempotencyKey: 'idem-key-1',
      }),
    );
  });
});
