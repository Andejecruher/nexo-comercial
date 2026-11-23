import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MessageDirection, MessageType } from '@prisma/client';
import { MessageService } from '../../../services/message.service';
import {
  CriticalEventType,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../../../services/realtime/realtime-notifier.service';

function makeMessage() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440003',
    conversationId: '550e8400-e29b-41d4-a716-446655440002',
    body: 'Hola ciudadano',
    direction: MessageDirection.outbound,
    messageType: MessageType.text,
    externalMessageId: null,
    sendByUserId: 'agent-1',
    meta: { senderId: 'agent-1' },
    createdAt: new Date('2026-06-27T12:00:00.000Z'),
    updatedAt: new Date('2026-06-27T12:00:00.000Z'),
    status: 'sent',
  };
}

function makeConversation() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440002',
    citizen: { phone: '521999888777' },
    meta: { communicationLineId: 'line-1' },
  };
}

describe('MessageService — durable realtime producer', () => {
  const messageRepo: any = {
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
    findConversationWithCitizenPhone: jest.fn(),
    customerWindow: jest
      .fn<() => Promise<{ isOpen: boolean }>>()
      .mockResolvedValue({ isOpen: true }),
    create: jest.fn(),
    createInTransaction: jest.fn(),
  };

  const outboxProcessor: any = {
    enqueue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const notifier: any = {
    notifyCritical: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    notifyEphemeral: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isEnabled: jest.fn<() => boolean>().mockReturnValue(true),
  };

  const prisma: any = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        tx: true,
        outboxEvent: { create: jest.fn<() => Promise<object>>().mockResolvedValue({}) },
      };
      return fn(tx);
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        tx: true,
        outboxEvent: { create: jest.fn<() => Promise<object>>().mockResolvedValue({}) },
      };
      return fn(tx);
    });
    messageRepo.findConversationWithCitizenPhone.mockResolvedValue(makeConversation());
    messageRepo.create.mockResolvedValue(makeMessage());
    messageRepo.createInTransaction.mockResolvedValue(makeMessage());
    messageRepo.findByIdempotencyKey.mockResolvedValue(null);
    notifier.isEnabled.mockReturnValue(true);
  });

  it('writes message.created and conversation.updated outbox events inside the transaction when durable is enabled', async () => {
    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.sendMessage({
      conversationId: makeConversation().id,
      body: 'Hola ciudadano',
      messageType: MessageType.text,
      senderId: 'agent-1',
      idempotencyKey: 'idem-1',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(messageRepo.createInTransaction).toHaveBeenCalledTimes(1);
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(2);

    const calls = notifier.notifyCritical.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const eventTypes = calls.map((call) => (call[1] as { eventType: string }).eventType);
    expect(eventTypes).toContain(CriticalEventType.MessageCreated);
    expect(eventTypes).toContain(CriticalEventType.ConversationUpdated);

    const messageCreatedCall = calls.find(
      (call) => (call[1] as { eventType: string }).eventType === CriticalEventType.MessageCreated,
    );
    expect(messageCreatedCall?.[1].socketEventName).toBe(SocketEventName.ConversationMessageNew);
    expect(messageCreatedCall?.[1].messagePatch).toEqual(
      expect.objectContaining({
        id: makeMessage().id,
        conversationId: makeConversation().id,
        body: 'Hola ciudadano',
        direction: 'outbound',
      }),
    );
  });

  it('emits legacy EventBus events when durable realtime is disabled', async () => {
    notifier.isEnabled.mockReturnValue(false);
    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.sendMessage({
      conversationId: makeConversation().id,
      body: 'Hola ciudadano',
      messageType: MessageType.text,
      senderId: 'agent-1',
      idempotencyKey: 'idem-2',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('does not write outbox events when the transaction aborts', async () => {
    const failingRepo = {
      ...messageRepo,
      createInTransaction: jest
        .fn<() => Promise<never>>()
        .mockRejectedValue(new Error('DB deadlock')),
    };
    const service = new MessageService(
      failingRepo,
      outboxProcessor,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await expect(
      service.sendMessage({
        conversationId: makeConversation().id,
        body: 'Hola ciudadano',
        messageType: MessageType.text,
        senderId: 'agent-1',
        idempotencyKey: 'idem-3',
      }),
    ).rejects.toThrow('DB deadlock');

    expect(notifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('uses the same transaction client for message creation and outbox writes', async () => {
    let capturedTx: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      capturedTx = {
        tx: true,
        outboxEvent: { create: jest.fn<() => Promise<object>>().mockResolvedValue({}) },
      };
      return fn(capturedTx);
    });

    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.sendMessage({
      conversationId: makeConversation().id,
      body: 'Hola ciudadano',
      messageType: MessageType.text,
      senderId: 'agent-1',
      idempotencyKey: 'idem-tx',
    });

    expect(messageRepo.createInTransaction).toHaveBeenCalledTimes(1);
    expect(messageRepo.createInTransaction).toHaveBeenCalledWith(capturedTx, expect.any(Object));

    const notifyCalls = notifier.notifyCritical.mock.calls as Array<[unknown, unknown]>;
    expect(notifyCalls).toHaveLength(2);
    for (const [txArg] of notifyCalls) {
      expect(txArg).toBe(capturedTx);
    }
  });

  it('rolls back both the message and outbox writes when the transaction fails to commit', async () => {
    let capturedTx: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      capturedTx = {
        tx: true,
        outboxEvent: { create: jest.fn<() => Promise<object>>().mockResolvedValue({}) },
      };
      await fn(capturedTx);
      throw new Error('commit failed');
    });

    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await expect(
      service.sendMessage({
        conversationId: makeConversation().id,
        body: 'Hola ciudadano',
        messageType: MessageType.text,
        senderId: 'agent-1',
        idempotencyKey: 'idem-rollback',
      }),
    ).rejects.toThrow('commit failed');

    expect(messageRepo.createInTransaction).toHaveBeenCalledWith(capturedTx, expect.any(Object));
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(2);
    for (const [txArg] of notifier.notifyCritical.mock.calls as Array<[unknown, unknown]>) {
      expect(txArg).toBe(capturedTx);
    }
  });

  it('generates valid UUID eventIds for all durable events', async () => {
    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.sendMessage({
      conversationId: makeConversation().id,
      body: 'Hola ciudadano',
      messageType: MessageType.text,
      senderId: 'agent-1',
      idempotencyKey: 'idem-uuid',
    });

    const calls = notifier.notifyCritical.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const eventIds = calls.map((call) => (call[1] as { eventId: string }).eventId);
    for (const eventId of eventIds) {
      expect(eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it('works without notifier/prisma when legacy mode has no optional deps', async () => {
    notifier.isEnabled.mockReturnValue(false);
    const service = new MessageService(messageRepo, outboxProcessor);

    await service.sendMessage({
      conversationId: makeConversation().id,
      body: 'Hola ciudadano',
      messageType: MessageType.text,
      senderId: 'agent-1',
      idempotencyKey: 'idem-4',
    });

    expect(messageRepo.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('MessageService.sendAudio', () => {
  const messageRepo: any = {
    findByIdempotencyKey: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
    findConversationWithCitizenPhone: jest.fn(),
    customerWindow: jest
      .fn<() => Promise<{ isOpen: boolean }>>()
      .mockResolvedValue({ isOpen: true }),
    create: jest.fn(),
    createAttachment: jest.fn(),
    createInTransaction: jest.fn(),
  };
  const outboxProcessor: any = {
    enqueue: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const notifier: any = {
    isEnabled: jest.fn<() => boolean>().mockReturnValue(false),
  };
  const whatsappProvider: any = {
    uploadMedia: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'media-1' }),
  };
  const audioTranscoder: any = {
    transcodeToOggOpus: jest.fn<() => Promise<Buffer>>(),
  };
  const sourceAudio = Buffer.from('source-audio');
  const oggOpusAudio = Buffer.concat([
    Buffer.from('OggS'),
    Buffer.alloc(24),
    Buffer.from('OpusHead'),
    Buffer.alloc(24),
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    messageRepo.findByIdempotencyKey.mockResolvedValue(null);
    messageRepo.findConversationWithCitizenPhone.mockResolvedValue(makeConversation());
    messageRepo.create.mockResolvedValue({
      ...makeMessage(),
      messageType: MessageType.audio,
      body: '0:03',
    });
    messageRepo.createAttachment.mockResolvedValue({ id: 'att-1' });
    messageRepo.createInTransaction.mockResolvedValue({
      ...makeMessage(),
      messageType: MessageType.audio,
      body: '0:03',
    });
    notifier.isEnabled.mockReturnValue(false);
    whatsappProvider.uploadMedia.mockResolvedValue({ id: 'media-1' });
    audioTranscoder.transcodeToOggOpus.mockResolvedValue(oggOpusAudio);
  });

  it('sube a Meta, persiste audio y encola payload WhatsApp', async () => {
    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier,
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            attachment: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
            outboxEvent: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
          }),
      } as any,
      whatsappProvider,
      undefined,
      audioTranscoder,
    );

    const result = await service.sendAudio({
      conversationId: makeConversation().id,
      senderId: 'agent-1',
      idempotencyKey: 'audio-1',
      buffer: sourceAudio,
      mimeType: 'audio/webm',
      filename: 'nota.webm',
      durationSeconds: 3,
    });

    expect(audioTranscoder.transcodeToOggOpus).toHaveBeenCalledWith(sourceAudio);
    expect(whatsappProvider.uploadMedia).toHaveBeenCalledWith(
      oggOpusAudio,
      'audio/ogg',
      'nota.ogg',
      { lineId: 'line-1' },
    );
    expect(messageRepo.createInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messageType: MessageType.audio,
        body: '0:03',
        meta: expect.objectContaining({ media: expect.objectContaining({ id: 'media-1' }) }),
      }),
    );
    expect(messageRepo.createAttachment).not.toHaveBeenCalled(); // Attachment is created in the same transaction as the message and outbox.
    expect(outboxProcessor.enqueue).toHaveBeenCalledWith(
      makeConversation().citizen.phone,
      expect.objectContaining({ type: 'audio', audio: { id: 'media-1' } }),
      'audio-1',
      makeConversation().id,
      expect.any(Object),
    );
    expect(result.isReplay).toBe(false);
  });

  it('reuses an already-valid OGG Opus recording without requiring FFmpeg', async () => {
    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier,
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            attachment: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
            outboxEvent: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
          }),
      } as any,
      whatsappProvider,
      undefined,
      audioTranscoder,
    );

    await service.sendAudio({
      conversationId: makeConversation().id,
      senderId: 'agent-1',
      idempotencyKey: 'audio-ogg-1',
      buffer: oggOpusAudio,
      mimeType: 'audio/ogg; codecs=opus',
      filename: 'nota.ogg',
      durationSeconds: 3,
    });

    expect(audioTranscoder.transcodeToOggOpus).not.toHaveBeenCalled();
    expect(whatsappProvider.uploadMedia).toHaveBeenCalledWith(
      oggOpusAudio,
      'audio/ogg',
      'nota.ogg',
      { lineId: 'line-1' },
    );
  });

  it('rechaza MIME que no es audio', async () => {
    const service = new MessageService(
      messageRepo,
      outboxProcessor,
      notifier,
      {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            attachment: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
            outboxEvent: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
          }),
      } as any,
      whatsappProvider,
      undefined,
      audioTranscoder,
    );

    await expect(
      service.sendAudio({
        conversationId: makeConversation().id,
        senderId: 'agent-1',
        idempotencyKey: 'audio-2',
        buffer: Buffer.from('x'),
        mimeType: 'application/pdf',
        filename: 'x.pdf',
        durationSeconds: 1,
      }),
    ).rejects.toThrow('El archivo debe ser audio');
    expect(whatsappProvider.uploadMedia).not.toHaveBeenCalled();
  });
});
