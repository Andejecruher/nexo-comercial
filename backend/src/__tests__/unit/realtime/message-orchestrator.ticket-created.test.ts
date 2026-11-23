import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eventBus } from '../../../services/events/event-bus.service';
import { MessageOrchestratorService } from '../../../services/orchestrator/message-orchestrator.service';

function makeInboundText(text: string) {
  return {
    type: 'text' as const,
    id: 'wamid-ticket-1',
    from: '521999888777',
    timestamp: '1700000000',
    text: { body: text },
  };
}

function makePersistedMessage() {
  return {
    id: 'msg-ticket-1',
    conversationId: 'conv-new',
    body: 'hola',
    direction: 'inbound',
    messageType: 'text',
    externalMessageId: 'wamid-ticket-1',
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'sent',
  };
}

describe('MessageOrchestratorService ticket.created (ciclo nuevo)', () => {
  const citizenRepo: any = { findOrCreate: jest.fn() };
  const conversationRepo: any = {
    findOrCreateCanonical: jest.fn(),
    getConversationContext: jest.fn(),
    findActiveCommunicationLineByExternalIdentifier: jest.fn(),
    bindCommunicationLine: jest.fn(),
  };
  const messageRepo: any = {
    create: jest.fn(),
    createInTransaction: jest.fn(),
    findByExternalId: jest.fn(),
  };
  const stateMachine: any = { transition: jest.fn() };
  const deptRouter: any = { route: jest.fn() };
  const whatsappProvider: any = { markAsRead: jest.fn() };
  const realtimeNotifier: any = {
    isEnabled: jest.fn(),
    notifyCritical: jest.fn(),
    notifyEphemeral: jest.fn(),
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ ticket: { findFirst: jest.fn(async () => null) } }),
    ),
  };

  function makeOrchestrator(ticketService?: unknown) {
    return new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      undefined, // fsmRouter
      'corr-ticket-test',
      ticketService as never,
      realtimeNotifier as never,
      prisma as never,
    );
  }

  function countTicketCreated(): number {
    return realtimeNotifier.notifyCritical.mock.calls.filter(
      ([, event]: [unknown, { eventType?: string }]) => event.eventType === 'ticket.created',
    ).length;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    citizenRepo.findOrCreate.mockResolvedValue({
      id: 'cit-1',
      phone: '521999888777',
      name: 'Ana',
      email: null,
      neighborhoodId: 'nbhd-1',
      neighborhood: 'Centro',
      interests: ['agua_servicios'],
    });
    conversationRepo.findActiveCommunicationLineByExternalIdentifier.mockResolvedValue(null);
    conversationRepo.bindCommunicationLine.mockResolvedValue(undefined);
    conversationRepo.getConversationContext.mockResolvedValue({
      meta: { flowState: 'BOT_FLOW', version: 1 },
      channel: 'whatsapp',
      assignedUserId: null,
    });
    messageRepo.findByExternalId.mockResolvedValue(null);
    messageRepo.createInTransaction.mockResolvedValue(makePersistedMessage());
    stateMachine.transition.mockResolvedValue(undefined);
    deptRouter.route.mockResolvedValue(undefined);
    whatsappProvider.markAsRead.mockResolvedValue(undefined);
    realtimeNotifier.isEnabled.mockReturnValue(true);
    realtimeNotifier.notifyCritical.mockResolvedValue(undefined);
  });

  it('does not announce a ticket before TicketService has created a real ticket', async () => {
    conversationRepo.findOrCreateCanonical.mockResolvedValue({
      id: 'conv-new',
      status: 'open',
      created: true,
    });
    await makeOrchestrator().handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');
    expect(countTicketCreated()).toBe(0);
  });

  it('delegates new-ticket creation and does not produce a second lifecycle event', async () => {
    conversationRepo.findOrCreateCanonical.mockResolvedValue({
      id: 'conv-new',
      status: 'open',
      created: true,
    });
    const ticketService = {
      getOrCreateActiveTicket: jest.fn(async () => ({ ticket: { id: 't-new' }, created: true })),
      attachMessageToTicket: jest.fn(async () => ({ id: 'tm-1' })),
    };
    await makeOrchestrator(ticketService).handleInboundMessage(
      '521999888777',
      makeInboundText('hola'),
      'Ana',
    );
    expect(ticketService.getOrCreateActiveTicket).toHaveBeenCalledWith('conv-new', 'cit-1');
    expect(countTicketCreated()).toBe(0);
  });

  it('reuses the original conversation and ticket for an eagerly ingested message', async () => {
    messageRepo.findByExternalId.mockResolvedValue({
      ...makePersistedMessage(),
      ticketId: 'already-created',
    });
    const ticketService = { getOrCreateActiveTicket: jest.fn(), attachMessageToTicket: jest.fn() };
    await makeOrchestrator(ticketService).handleInboundMessage(
      '521999888777',
      makeInboundText('hola'),
      'Ana',
    );
    expect(conversationRepo.findOrCreateCanonical).not.toHaveBeenCalled();
    expect(ticketService.getOrCreateActiveTicket).not.toHaveBeenCalled();
    expect(realtimeNotifier.notifyCritical).not.toHaveBeenCalled();
  });

  it('sin modo durable, una reactivación emite conversation.updated action reopen', async () => {
    realtimeNotifier.isEnabled.mockReturnValue(false);
    const emitSpy = jest.spyOn(eventBus, 'emit');
    messageRepo.create.mockResolvedValue(makePersistedMessage());
    conversationRepo.findOrCreateCanonical.mockResolvedValue({
      id: 'conv-legacy',
      status: 'open',
      created: false,
      reactivated: true,
    });

    try {
      await makeOrchestrator().handleInboundMessage('521999888777', makeInboundText('hola'), 'Ana');

      expect(emitSpy).toHaveBeenCalledWith(
        'conversation.updated',
        expect.objectContaining({ conversationId: 'conv-legacy', action: 'reopen' }),
      );
      expect(countTicketCreated()).toBe(0);
    } finally {
      emitSpy.mockRestore();
    }
  });
});
