import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MessageDirection, MessageType } from '@prisma/client';
import { MessageOrchestratorService } from '../../../services/orchestrator/message-orchestrator.service';
import {
  CriticalEventType,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../../../services/realtime/realtime-notifier.service';

function makeInboundText(text: string) {
  return {
    type: 'text' as const,
    id: 'wamid-1',
    from: '521999888777',
    timestamp: '1700000000',
    text: { body: text },
  };
}

function makePersistedMessage() {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    body: 'hola',
    direction: MessageDirection.inbound,
    messageType: MessageType.text,
    externalMessageId: 'wamid-1',
    meta: {},
    createdAt: new Date('2026-06-27T12:00:00.000Z'),
    updatedAt: new Date('2026-06-27T12:00:00.000Z'),
    status: 'sent',
  };
}

describe('MessageOrchestratorService — durable realtime producer', () => {
  const citizenRepo: any = {
    findOrCreate: jest.fn<() => Promise<Record<string, unknown>>>(),
  };

  const conversationRepo: any = {
    findOrCreateCanonical: jest.fn<() => Promise<Record<string, unknown>>>(),
    getConversationContext: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    findActiveCommunicationLineByExternalIdentifier: jest.fn<() => Promise<null>>(),
    bindCommunicationLine: jest.fn<() => Promise<void>>(),
  };

  const messageRepo: any = {
    create: jest.fn<() => Promise<Record<string, unknown>>>(),
    createInTransaction: jest.fn<() => Promise<Record<string, unknown>>>(),
    findByExternalId: jest.fn<() => Promise<Record<string, unknown> | null>>(),
  };

  const stateMachine: any = {
    transition: jest.fn<() => Promise<void>>(),
  };

  const deptRouter: any = {
    route: jest.fn<() => Promise<undefined>>(),
  };

  const whatsappProvider: any = {
    markAsRead: jest.fn<() => Promise<void>>(),
  };

  const redis: any = {
    incr: jest.fn<() => Promise<number>>(),
    del: jest.fn<() => Promise<void>>(),
  };

  const notifier: any = {
    notifyCritical: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    notifyEphemeral: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isEnabled: jest.fn<() => boolean>().mockReturnValue(true),
  };

  const prisma: any = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { tx: true };
      return fn(tx);
    }),
  };

  function makeOrchestrator() {
    return new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      undefined,
      'corr-1',
      undefined,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { tx: true };
      return fn(tx);
    });
    citizenRepo.findOrCreate.mockResolvedValue({
      id: 'cit-1',
      phone: '521999888777',
      name: 'Ana',
      email: null,
      neighborhoodId: 'nbhd-1',
      neighborhood: 'Centro',
      interests: ['agua_servicios'],
    });
    conversationRepo.findOrCreateCanonical.mockResolvedValue({ id: 'conv-1' });
    conversationRepo.findActiveCommunicationLineByExternalIdentifier.mockResolvedValue(null);
    conversationRepo.bindCommunicationLine.mockResolvedValue(undefined);
    conversationRepo.getConversationContext.mockResolvedValue({
      meta: { flowState: 'BOT_FLOW', version: 0 },
    });
    messageRepo.create.mockResolvedValue(makePersistedMessage());
    messageRepo.createInTransaction.mockResolvedValue(makePersistedMessage());
    messageRepo.findByExternalId.mockResolvedValue(null);
    whatsappProvider.markAsRead.mockResolvedValue(undefined);
    deptRouter.route.mockResolvedValue(undefined);
    redis.incr.mockResolvedValue(1);
    redis.del.mockResolvedValue(undefined);
    notifier.isEnabled.mockReturnValue(true);
  });

  it('writes message.created and conversation.updated outbox events inside the transaction', async () => {
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

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
  });

  it('reuses a persisted inbound message without writing duplicate realtime events', async () => {
    messageRepo.findByExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePersistedMessage());
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');
    await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

    expect(messageRepo.findByExternalId).toHaveBeenCalledTimes(2);
    expect(messageRepo.createInTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(2);
  });

  it('includes notificationPatch with citizen context in message.created event', async () => {
    const messageBody = 'necesito ayuda urgente';
    messageRepo.createInTransaction.mockResolvedValue({
      ...makePersistedMessage(),
      body: messageBody,
    });
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage('521999888777', makeInboundText(messageBody), 'Ana');

    const calls = notifier.notifyCritical.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const messageCreatedCall = calls.find(
      (call) => (call[1] as { eventType: string }).eventType === CriticalEventType.MessageCreated,
    );

    const notificationPatch = (
      messageCreatedCall?.[1] as { notificationPatch?: Record<string, unknown> }
    )?.notificationPatch;
    expect(notificationPatch).toBeDefined();
    expect(notificationPatch?.type).toBe('message.received');
    expect(notificationPatch?.contactName).toBe('Ana');
    expect(notificationPatch?.phone).toBe('521999888777');
    expect(notificationPatch?.messagePreview).toBe(messageBody);
    expect(notificationPatch?.flowState).toBeDefined();
  });

  it('ports communicationLineId resolved by the line bind into notificationPatch', async () => {
    conversationRepo.findActiveCommunicationLineByExternalIdentifier.mockResolvedValue({
      id: 'line-1',
    });
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage(
      '521999888777',
      makeInboundText('hola'),
      'Ana',
      'phone-id-1',
    );

    expect(conversationRepo.bindCommunicationLine).toHaveBeenCalledWith('conv-1', 'line-1');

    const calls = notifier.notifyCritical.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const messageCreatedCall = calls.find(
      (call) => (call[1] as { eventType: string }).eventType === CriticalEventType.MessageCreated,
    );
    const notificationPatch = (
      messageCreatedCall?.[1] as { notificationPatch?: Record<string, unknown> }
    )?.notificationPatch;
    expect(notificationPatch?.communicationLineId).toBe('line-1');
  });

  it('rejects an unknown receiving line before persistence or realtime events', async () => {
    const orchestrator = makeOrchestrator();
    await expect(
      orchestrator.handleInboundMessage(
        '521999888777',
        makeInboundText('hola'),
        'Ana',
        'phone-id-unknown',
      ),
    ).rejects.toThrow('Línea receptora desconocida o inactiva');
    expect(messageRepo.createInTransaction).not.toHaveBeenCalled();
    expect(notifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('truncates long message body in notificationPatch to max 120 chars', async () => {
    const longBody = 'a'.repeat(200);
    messageRepo.createInTransaction.mockResolvedValue({
      ...makePersistedMessage(),
      body: longBody,
    });
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage('521999888777', makeInboundText(longBody), 'Ana');

    const calls = notifier.notifyCritical.mock.calls as Array<[unknown, Record<string, unknown>]>;
    const messageCreatedCall = calls.find(
      (call) => (call[1] as { eventType: string }).eventType === CriticalEventType.MessageCreated,
    );

    const notificationPatch = (
      messageCreatedCall?.[1] as { notificationPatch?: Record<string, unknown> }
    )?.notificationPatch;
    const preview = notificationPatch?.messagePreview as string | undefined;
    expect(preview).toBeDefined();
    expect(preview!.length).toBeLessThanOrEqual(120);
    expect(preview).toMatch(/…$/);
  });

  it('emits ephemeral typing around the bot-active FSM turn', async () => {
    const fsmRouter = {
      handle: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
        decision: { kind: 'ai_handled' },
        flowState: 'BOT_FLOW',
        transitioned: false,
        durationMs: 12,
      }),
    };
    const orchestrator = new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      fsmRouter as never,
      'corr-1',
      undefined,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

    expect(fsmRouter.handle).toHaveBeenCalled();
    const typingCalls = notifier.notifyEphemeral.mock.calls as Array<[Record<string, unknown>]>;
    expect(typingCalls.length).toBeGreaterThanOrEqual(2);
    expect(typingCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        eventType: 'conversation.typing',
        socketEventName: 'conversation.typing',
        payload: expect.objectContaining({ conversationId: 'conv-1', typing: true }),
      }),
    );
    expect(typingCalls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ conversationId: 'conv-1', typing: false }),
      }),
    );
  });

  it('falls back to legacy EventBus emits when durable realtime is disabled', async () => {
    notifier.isEnabled.mockReturnValue(false);
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifier.notifyCritical).not.toHaveBeenCalled();
    expect(messageRepo.create).toHaveBeenCalledTimes(1);
  });

  it('does not write outbox events when the transaction aborts', async () => {
    messageRepo.createInTransaction.mockRejectedValue(new Error('DB deadlock'));
    const orchestrator = makeOrchestrator();

    await expect(
      orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana'),
    ).rejects.toThrow('DB deadlock');

    expect(notifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('uses the same transaction client for message creation and outbox writes', async () => {
    let capturedTx: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      capturedTx = { tx: true };
      return fn(capturedTx);
    });
    const orchestrator = makeOrchestrator();

    await orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

    expect(messageRepo.createInTransaction).toHaveBeenCalledTimes(1);
    expect(messageRepo.createInTransaction).toHaveBeenCalledWith(capturedTx, expect.any(Object));

    const notifyCalls = notifier.notifyCritical.mock.calls as Array<[unknown, unknown]>;
    expect(notifyCalls).toHaveLength(2);
    for (const [txArg] of notifyCalls) {
      expect(txArg).toBe(capturedTx);
    }
  });

  it('rolls back both the inbound message and outbox writes when the transaction fails to commit', async () => {
    let capturedTx: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      capturedTx = { tx: true };
      await fn(capturedTx);
      throw new Error('commit failed');
    });
    const orchestrator = makeOrchestrator();

    await expect(
      orchestrator.handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana'),
    ).rejects.toThrow('commit failed');

    expect(messageRepo.createInTransaction).toHaveBeenCalledWith(capturedTx, expect.any(Object));
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(2);
    for (const [txArg] of notifier.notifyCritical.mock.calls as Array<[unknown, unknown]>) {
      expect(txArg).toBe(capturedTx);
    }
  });
});
