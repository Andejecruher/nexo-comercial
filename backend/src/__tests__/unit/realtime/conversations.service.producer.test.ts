import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConversationStatus } from '@prisma/client';
import { ConversationsService } from '../../../services/conversations.service';
import {
  CriticalEventType,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../../../services/realtime/realtime-notifier.service';

function makeCtx(flowState: string, version = 1) {
  return {
    id: 'conv-1',
    meta: { flowState, version },
  };
}

describe('ConversationsService — durable realtime producer', () => {
  const conversationRepo: any = {
    getConversationContext: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    getConversationContextInTransaction: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    applyAssignment: jest.fn<() => Promise<void>>(),
    applyAssignmentInTransaction: jest.fn<() => Promise<void>>(),
    updateConversationStatus: jest.fn<() => Promise<void>>(),
    updateConversationStatusInTransaction: jest.fn<() => Promise<void>>(),
    clearInboxOwnership: jest.fn<() => Promise<void>>(),
    clearInboxOwnershipInTransaction: jest.fn<() => Promise<void>>(),
    closeActiveTickets: jest.fn<() => Promise<number>>(),
    closeActiveTicketsInTransaction: jest.fn<() => Promise<number>>(),
    findActiveTicketsInTransaction: jest.fn<() => Promise<Array<{ id: string }>>>(),
    setHandoffKindInTransaction: jest.fn<() => Promise<void>>(),
    updateActiveTicketInTransaction: jest.fn<() => Promise<void>>(),
  };

  const stateMachine: any = {
    isValidTransition: jest.fn<() => boolean>(),
    transition: jest.fn<() => Promise<void>>(),
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
  const ticketService = {
    getActiveTicketByConversation: jest
      .fn<(conversationId: string, tx?: unknown) => Promise<undefined>>()
      .mockResolvedValue(undefined),
  };
  const messageRepo = {
    createInTransaction: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { tx: true };
      return fn(tx);
    });
    stateMachine.isValidTransition.mockReturnValue(true);
    stateMachine.transition.mockResolvedValue(undefined);
    conversationRepo.applyAssignment.mockResolvedValue(undefined);
    conversationRepo.updateConversationStatus.mockResolvedValue(undefined);
    conversationRepo.clearInboxOwnership.mockResolvedValue(undefined);
    conversationRepo.clearInboxOwnershipInTransaction.mockResolvedValue(undefined);
    conversationRepo.closeActiveTickets.mockResolvedValue(0);
    conversationRepo.closeActiveTicketsInTransaction.mockResolvedValue(1);
    conversationRepo.findActiveTicketsInTransaction.mockResolvedValue([]);
    conversationRepo.getConversationContextInTransaction.mockImplementation(
      async (_tx: unknown, conversationId: string) =>
        conversationRepo.getConversationContext(conversationId),
    );
    notifier.isEnabled.mockReturnValue(true);
  });

  it('writes conversation.updated outbox event on close inside the transaction', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.close('conv-1', 'agent-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'CLOSED',
      3,
      {
        triggeredBy: 'agent',
        agentId: 'agent-1',
        suppressEventBus: true,
      },
      expect.any(Object),
    );
    expect(conversationRepo.updateConversationStatusInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      'conv-1',
      ConversationStatus.closed,
    );
    expect(conversationRepo.clearInboxOwnershipInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      'conv-1',
    );
    expect(conversationRepo.closeActiveTicketsInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      'conv-1',
      'user_request',
    );
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(1);

    const call = notifier.notifyCritical.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(call[1].eventType).toBe(CriticalEventType.ConversationUpdated);
    expect(call[1].socketEventName).toBe(SocketEventName.ConversationUpdated);
    expect(call[1].conversationPatch).toEqual(
      expect.objectContaining({ id: 'conv-1', status: 'closed', flowState: 'CLOSED' }),
    );
    expect(call[1].action).toBe('close');
    expect(call[1].inboxPatch).toEqual(
      expect.objectContaining({ inboxStatus: 'inactive', status: 'closed' }),
    );
  });

  it('writes conversation.updated with action transfer and inboxPatch', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    conversationRepo.applyAssignmentInTransaction.mockResolvedValue(undefined);
    conversationRepo.setHandoffKindInTransaction.mockResolvedValue(undefined);
    conversationRepo.updateActiveTicketInTransaction.mockResolvedValue(undefined);
    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.transfer(
      'conv-1',
      { type: 'agent', toUserId: 'agent-2' },
      { performedBy: 'agent-1' },
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
    });
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(1);
    const call = notifier.notifyCritical.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(call[1].eventType).toBe(CriticalEventType.ConversationUpdated);
    expect(call[1].action).toBe('transfer');
    expect(call[1].inboxPatch).toEqual(
      expect.objectContaining({ assignedUserId: 'agent-2', flowState: 'HUMAN_FLOW' }),
    );
  });

  it('looks up the active transfer ticket through the transaction client', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    conversationRepo.setHandoffKindInTransaction.mockResolvedValue(undefined);
    conversationRepo.updateActiveTicketInTransaction.mockResolvedValue(undefined);
    const transactionClients: unknown[] = [];
    prisma.$transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const tx = { tx: true, index: transactionClients.length };
      transactionClients.push(tx);
      return fn(tx);
    });
    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
      ticketService as unknown as ConstructorParameters<typeof ConversationsService>[4],
      messageRepo as unknown as ConstructorParameters<typeof ConversationsService>[5],
    );

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        service.transfer(`conv-${index}`, { type: 'agent', toUserId: 'agent-2' }),
      ),
    );

    expect(ticketService.getActiveTicketByConversation).toHaveBeenCalledTimes(10);
    for (const [conversationId, tx] of ticketService.getActiveTicketByConversation.mock.calls) {
      const index = Number(conversationId.slice('conv-'.length));
      expect(tx).toBe(transactionClients[index]);
    }
  });

  it('writes conversation.handover outbox event when assigning from BOT_FLOW', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('BOT_FLOW', 0));
    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.assign('conv-1', 'agent-1', 'dept-a');

    expect(notifier.notifyCritical).toHaveBeenCalledTimes(1);
    const call = notifier.notifyCritical.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(call[1].eventType).toBe(CriticalEventType.ConversationHandover);
    expect(call[1].socketEventName).toBe(SocketEventName.ConversationHandover);
  });

  it('falls back to EventBus emits when durable realtime is disabled', async () => {
    notifier.isEnabled.mockReturnValue(false);
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.close('conv-1', 'agent-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifier.notifyCritical).not.toHaveBeenCalled();
    expect(stateMachine.transition).toHaveBeenCalledWith('conv-1', 'CLOSED', 3, {
      triggeredBy: 'agent',
      agentId: 'agent-1',
    });
  });

  it('does not write outbox events when the transaction aborts', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    stateMachine.transition.mockImplementation(async () => {
      throw new Error('lock conflict');
    });
    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await expect(service.close('conv-1', 'agent-1')).rejects.toThrow('lock conflict');

    expect(notifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('uses the same transaction client for state update, assignment, and outbox write', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    let capturedTx: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      capturedTx = { tx: true };
      return fn(capturedTx);
    });

    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await service.close('conv-1', 'agent-1');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'CLOSED',
      3,
      expect.any(Object),
      capturedTx,
    );
    expect(conversationRepo.updateConversationStatusInTransaction).toHaveBeenCalledWith(
      capturedTx,
      'conv-1',
      ConversationStatus.closed,
    );
    expect(conversationRepo.clearInboxOwnershipInTransaction).toHaveBeenCalledWith(
      capturedTx,
      'conv-1',
    );
    expect(conversationRepo.closeActiveTicketsInTransaction).toHaveBeenCalledWith(
      capturedTx,
      'conv-1',
      'user_request',
    );
    expect(conversationRepo.getConversationContextInTransaction).toHaveBeenCalledWith(
      capturedTx,
      'conv-1',
    );

    const notifyCalls = notifier.notifyCritical.mock.calls as Array<[unknown, unknown]>;
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0][0]).toBe(capturedTx);
  });

  it('rolls back the conversation mutation and outbox write when the transaction fails to commit', async () => {
    conversationRepo.getConversationContext.mockResolvedValue(makeCtx('HUMAN_FLOW', 3));
    let capturedTx: unknown;
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      capturedTx = { tx: true };
      await fn(capturedTx);
      throw new Error('commit failed');
    });

    const service = new ConversationsService(
      conversationRepo,
      stateMachine,
      notifier as unknown as RealtimeNotifier,
      prisma,
    );

    await expect(service.close('conv-1', 'agent-1')).rejects.toThrow('commit failed');

    expect(stateMachine.transition).toHaveBeenCalledWith(
      'conv-1',
      'CLOSED',
      3,
      expect.any(Object),
      capturedTx,
    );
    expect(conversationRepo.updateConversationStatusInTransaction).toHaveBeenCalledWith(
      capturedTx,
      'conv-1',
      ConversationStatus.closed,
    );
    expect(notifier.notifyCritical).toHaveBeenCalledTimes(1);
    expect(notifier.notifyCritical.mock.calls[0][0]).toBe(capturedTx);
  });
});
