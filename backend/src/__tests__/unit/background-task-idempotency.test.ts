import { describe, expect, it, jest } from '@jest/globals';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';
import { IneOcrService } from '../../services/ine/ine-ocr.service';

describe('single-record task processing idempotency', () => {
  it('does not repeat a completed OCR job', async () => {
    const prisma = {
      ineOcrJob: {
        findUnique: jest.fn(async () => ({ status: 'completed' })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const storage = { get: jest.fn() };
    const ocr = { process: jest.fn() };
    const service = new IneOcrService(prisma as never, storage as never, ocr as never);

    await expect(service.processJobById('550e8400-e29b-41d4-a716-446655440000')).resolves.toBe(
      'noop',
    );
    expect(storage.get).not.toHaveBeenCalled();
    expect(ocr.process).not.toHaveBeenCalled();
  });

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

  it('reclaims an OCR processing job whose lease was never written', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const service = new IneOcrService(
      { ineOcrJob: { updateMany } } as never,
      {} as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          claimJobById: (id: string) => Promise<{ id: string } | null>;
        }
      ).claimJobById('550e8400-e29b-41d4-a716-446655440003'),
    ).resolves.toEqual({ id: '550e8400-e29b-41d4-a716-446655440003' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              status: 'processing',
              OR: expect.arrayContaining([{ lockedAt: null }]),
            }),
          ]),
        }),
      }),
    );
  });
});
