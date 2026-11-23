import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

const WA_PAYLOAD = {
  messaging_product: 'whatsapp',
  type: 'text',
  to: '521100000000',
  text: { body: 'hola' },
};

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    status: 'pending',
    retryCount: 0,
    phone: '521100000000',
    payload: WA_PAYLOAD,
    idempotencyKey: 'idem-key-1',
    wamid: null,
    lockedAt: null,
    conversationId: '550e8400-e29b-41d4-a716-446655440002',
    ...overrides,
  };
}

function makePrisma() {
  const tx = {
    message: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    outboxEvent: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };

  const prisma = {
    outboxEvent: {
      findUnique: jest.fn(async () => makeEvent()),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $queryRaw: jest.fn(async () => [{ lastInboundAt: new Date() }]),
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };

  return prisma;
}

describe('OutboxProcessorService — persistencia de wamid', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let waSend: jest.Mock;
  let processor: OutboxProcessorService;

  beforeEach(() => {
    prisma = makePrisma();
    waSend = jest.fn(async () => ({ messages: [{ id: 'wamid.out' }] }));
    processor = new OutboxProcessorService(prisma as never, { send: waSend } as never);
  });

  it('tras un envío exitoso checkpointea el wamid y lo escribe en messages.external_message_id', async () => {
    await expect(processor.processEventById(EVENT_ID)).resolves.toBe('processed');

    expect(waSend).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EVENT_ID, status: 'sending' },
        data: { wamid: 'wamid.out' },
      }),
    );
    expect(prisma.__tx.message.updateMany).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idem-key-1' },
      data: { externalMessageId: 'wamid.out' },
    });
    expect(prisma.__tx.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          wamid: 'wamid.out',
        }),
      }),
    );
  });

  it('marca dead_lettered si Meta responde 2xx sin messages[0].id', async () => {
    waSend.mockResolvedValueOnce({ messages: [] } as never);

    await expect(processor.processEventById(EVENT_ID)).resolves.toBe('processed');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'dead_lettered',
          lastError: 'Provider returned success without message id',
        }),
      }),
    );
  });

  it('marca dead_lettered si el id del proveedor viene vacío', async () => {
    waSend.mockResolvedValueOnce({ messages: [{ id: '   ' }] } as never);

    await expect(processor.processEventById(EVENT_ID)).resolves.toBe('processed');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'dead_lettered' }),
      }),
    );
  });

  it('si falla la transacción después del checkpoint, no reenvía a Meta en el reintento', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('DB timeout') as never);

    await expect(processor.processEventById(EVENT_ID)).rejects.toThrow('DB timeout');
    expect(waSend).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { wamid: 'wamid.out' } }),
    );

    prisma.outboxEvent.findUnique.mockResolvedValue(
      makeEvent({ status: 'failed', retryCount: 1, wamid: 'wamid.out' }) as never,
    );
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma.__tx));

    await expect(processor.processEventById(EVENT_ID)).resolves.toBe('processed');

    expect(waSend).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.message.updateMany).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idem-key-1' },
      data: { externalMessageId: 'wamid.out' },
    });
    expect(prisma.__tx.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', wamid: 'wamid.out' }),
      }),
    );
  });

  it('marca sent aunque no exista un Message correlacionado', async () => {
    prisma.__tx.message.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(processor.processEventById(EVENT_ID)).resolves.toBe('processed');

    expect(prisma.__tx.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', wamid: 'wamid.out' }),
      }),
    );
  });
});

describe('OutboxProcessorService — uncertain outcomes', () => {
  it('does not automatically resend a request whose network outcome is unknown', async () => {
    const prisma = makePrisma();
    const send = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const processor = new OutboxProcessorService(prisma as never, { send } as never);
    await expect(processor.processEventById(EVENT_ID)).rejects.toThrow('fetch failed');
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'dead_lettered', nextRetryAt: null }),
      }),
    );
    prisma.outboxEvent.findUnique.mockResolvedValue(makeEvent({ status: 'dead_lettered' }));
    await expect(processor.processEventById(EVENT_ID)).resolves.toBe('noop');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('commits terminal queue state, the visible uncertain state and realtime together', async () => {
    const prisma = makePrisma();
    const query = jest.fn(async () => [{ conversationId: '550e8400-e29b-41d4-a716-446655440002' }]);
    Object.assign(prisma.__tx, { $queryRaw: query });
    const notifier = { isEnabled: () => true, notifyCritical: jest.fn(async () => undefined) };
    const processor = new OutboxProcessorService(
      prisma as never,
      {
        send: async () => {
          throw new TypeError('fetch failed');
        },
      } as never,
      undefined,
      { realtimeNotifier: notifier as never },
    );
    await expect(processor.processEventById(EVENT_ID)).rejects.toThrow();
    expect(prisma.__tx.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'dead_lettered' }) }),
    );
    expect(query).toHaveBeenCalled();
    expect((query.mock.calls as unknown as unknown[][])[0]).toContain('uncertain');
    expect(notifier.notifyCritical).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({ eventType: 'conversation.updated' }),
    );
  });
});
