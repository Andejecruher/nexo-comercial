import { describe, expect, it, jest } from '@jest/globals';
import { MessageDirection } from '@prisma/client';
import {
  MessageRepository,
  type MessageWithStatuses,
  serializeMessageForJson,
} from '../../repositories/message.repository';

describe('serializeMessageForJson', () => {
  it('serializa fileSizeBytes como string sin perder precisión', () => {
    const fileSizeBytes = 9_007_199_254_740_993n;
    const message = {
      id: 'msg-1',
      attachmentsViaMessageId: [{ id: 'attachment-1', fileSizeBytes }],
    } as unknown as MessageWithStatuses;

    const serialized = serializeMessageForJson(message);

    expect(serialized.attachmentsViaMessageId[0].fileSizeBytes).toBe('9007199254740993');
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});

describe('MessageRepository.bindProviderMessageId', () => {
  it('actualiza por idempotencyKey y no usa el fallback legado', async () => {
    const tx = {
      message: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const repo = new MessageRepository({} as never);

    await expect(
      repo.bindProviderMessageId(tx as never, { idempotencyKey: 'idem-1', wamid: 'wamid.1' }),
    ).resolves.toBe(1);

    expect(tx.message.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.message.updateMany).toHaveBeenCalledWith({
      where: { idempotencyKey: 'idem-1' },
      data: { externalMessageId: 'wamid.1' },
    });
  });

  it('cae al patrón legado cuando el mensaje guardó la clave en externalMessageId', async () => {
    const tx = {
      message: {
        updateMany: jest
          .fn<() => Promise<{ count: number }>>()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
      },
    };
    const repo = new MessageRepository({} as never);

    await expect(
      repo.bindProviderMessageId(tx as never, { idempotencyKey: 'idem-legacy', wamid: 'wamid.2' }),
    ).resolves.toBe(1);

    expect(tx.message.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        direction: MessageDirection.outbound,
        externalMessageId: 'idem-legacy',
      },
      data: { externalMessageId: 'wamid.2' },
    });
  });

  it('devuelve 0 si no hay mensaje correlacionado', async () => {
    const tx = {
      message: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const repo = new MessageRepository({} as never);

    await expect(
      repo.bindProviderMessageId(tx as never, { idempotencyKey: 'invite:1:2', wamid: 'wamid.3' }),
    ).resolves.toBe(0);
  });
});

describe('MessageRepository.upsertStatus', () => {
  it('crea el timeline cuando el mensaje ya tiene el wamid del proveedor', async () => {
    const created = { id: 'status-1' };
    const prisma: any = {
      $executeRaw: jest.fn(async () => 1),
      $transaction: jest.fn(async (fn: any): Promise<unknown> => fn(prisma)),
      message: {
        findFirst: jest.fn(async () => ({
          id: 'msg-1',
          externalMessageId: 'wamid.out',
          conversationId: 'conv-1',
        })),
      },
      messageStatus: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async () => created),
      },
    };
    const repo = new MessageRepository(prisma as never);
    const timestamp = new Date('2026-09-23T12:00:00.000Z');

    await expect(
      repo.upsertStatus({
        wamid: 'wamid.out',
        status: 'delivered',
        timestamp,
      }),
    ).resolves.toEqual({
      created: true,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wamid: 'wamid.out',
      status: 'delivered',
      timestamp,
    });

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { externalMessageId: 'wamid.out' },
    });
    expect(prisma.messageStatus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageId: 'msg-1',
          wamid: 'wamid.out',
          status: 'delivered',
        }),
      }),
    );
  });

  it('no inserta ni marca created si el status entrante es anterior o igual', async () => {
    const prisma: any = {
      $executeRaw: jest.fn(async () => 1),
      $transaction: jest.fn(async (fn: any): Promise<unknown> => fn(prisma)),
      message: {
        findFirst: jest.fn(async () => ({
          id: 'msg-1',
          externalMessageId: 'wamid.out',
          conversationId: 'conv-1',
        })),
      },
      messageStatus: {
        findMany: jest.fn(async () => [{ status: 'delivered' }]),
        create: jest.fn(),
      },
    };
    const repo = new MessageRepository(prisma as never);
    const timestamp = new Date('2026-09-23T12:00:00.000Z');

    await expect(
      repo.upsertStatus({ wamid: 'wamid.out', status: 'sent', timestamp }),
    ).resolves.toEqual({
      created: false,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      wamid: 'wamid.out',
      status: 'sent',
      timestamp,
    });

    expect(prisma.messageStatus.create).not.toHaveBeenCalled();
  });

  it('ignora el status si no hay mensaje con ese externalMessageId', async () => {
    const prisma: any = {
      $executeRaw: jest.fn(async () => 1),
      $transaction: jest.fn(async (fn: any): Promise<unknown> => fn(prisma)),
      message: {
        findFirst: jest.fn(async () => null),
      },
      messageStatus: {
        findMany: jest.fn(async () => []),
        create: jest.fn(),
      },
    };
    const repo = new MessageRepository(prisma as never);

    await expect(
      repo.upsertStatus({
        wamid: 'wamid.unknown',
        status: 'read',
        timestamp: new Date(),
      }),
    ).resolves.toBeNull();

    expect(prisma.messageStatus.create).not.toHaveBeenCalled();
  });
});
