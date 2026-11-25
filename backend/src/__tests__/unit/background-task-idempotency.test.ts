import { describe, expect, it, jest } from '@jest/globals';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';

describe('single-record task processing idempotency', () => {
  it('does not send an already-sent outbox event again', async () => {
    const prisma = {
      outboxEvent: {
        findUnique: jest.fn(async () => ({ status: 'sent' })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const whatsapp = { send: jest.fn() };
    const service = new OutboxProcessorService(prisma as never, whatsapp as never);

    await expect(service.processEventById('550e8400-e29b-41d4-a716-446655440001')).resolves.toBe(
      'noop',
    );
    expect(whatsapp.send).not.toHaveBeenCalled();
  });
});
