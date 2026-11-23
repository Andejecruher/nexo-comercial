import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ConversationsService,
  normalizeInboxListStatus,
} from '../../services/conversations.service';

const mockEmit = jest.fn<(...args: unknown[]) => void>();

jest.mock('../../services/events/event-bus.service', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEmit(...args),
  },
}));

const asyncMock = <T = unknown>() => jest.fn<(...args: unknown[]) => Promise<T>>();

describe('ConversationsService — acciones', () => {
  const conversationId = 'conv-1';
  const agentId = 'agent-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assign desde BOT_FLOW debe llamar stateMachine.transition y crear assignment', async () => {
    const mockCtx = { id: conversationId, meta: { flowState: 'BOT_FLOW', version: 1 } };

    const conversationRepo: any = {
      getConversationContext: asyncMock().mockResolvedValue(mockCtx),
    };

    const stateMachine: any = {
      isValidTransition: jest.fn().mockReturnValue(true),
      transition: asyncMock<void>().mockResolvedValue(undefined),
    };

    conversationRepo.applyAssignment = asyncMock<void>().mockResolvedValue(undefined);

    const svc = new ConversationsService(conversationRepo, stateMachine);

    const res = await svc.assign(conversationId, agentId, 'dept-a');

    expect(conversationRepo.getConversationContext).toHaveBeenCalledWith(conversationId);
    expect(stateMachine.isValidTransition).toHaveBeenCalled();
    expect(stateMachine.transition).toHaveBeenCalledWith(
      conversationId,
      'HUMAN_FLOW',
      1,
      expect.objectContaining({ suppressEventBus: true }),
    );
    expect(mockEmit).toHaveBeenCalledWith(
      'conversation.handover',
      expect.objectContaining({
        conversationId,
        fromState: 'BOT_FLOW',
        toState: 'HUMAN_FLOW',
      }),
    );
    expect(mockEmit).not.toHaveBeenCalledWith('conversation.updated', expect.anything());
    expect(res).toEqual({ assigned: true, conversationId, agentId });
  });

  it('assign desde HUMAN_FLOW no debe transicionar y debe emitir el flowState actual', async () => {
    const mockCtx = { id: conversationId, meta: { flowState: 'HUMAN_FLOW', version: 2 } };

    const conversationRepo: any = {
      getConversationContext: asyncMock().mockResolvedValue(mockCtx),
      applyAssignment: asyncMock<void>().mockResolvedValue(undefined),
    };

    const stateMachine: any = {
      isValidTransition: jest.fn(),
      transition: asyncMock<void>().mockResolvedValue(undefined),
    };

    const svc = new ConversationsService(conversationRepo, stateMachine);

    await svc.assign(conversationId, agentId, 'dept-a');

    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(
      'conversation.updated',
      expect.objectContaining({ flowState: 'HUMAN_FLOW', action: 'assign' }),
    );
  });

  it('assign desde ESCALATED no debe transicionar ni reportar HUMAN_FLOW', async () => {
    const mockCtx = { id: conversationId, meta: { flowState: 'ESCALATED', version: 4 } };

    const conversationRepo: any = {
      getConversationContext: asyncMock().mockResolvedValue(mockCtx),
      applyAssignment: asyncMock<void>().mockResolvedValue(undefined),
    };

    const stateMachine: any = {
      isValidTransition: jest.fn(),
      transition: asyncMock<void>().mockResolvedValue(undefined),
    };

    const svc = new ConversationsService(conversationRepo, stateMachine);

    await svc.assign(conversationId, agentId);

    expect(stateMachine.transition).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(
      'conversation.updated',
      expect.objectContaining({ flowState: 'ESCALATED', action: 'assign' }),
    );
  });

  it('close debe fallar si la transición es inválida', async () => {
    const mockCtx = { id: conversationId, meta: { flowState: 'CLOSED', version: 5 } };
    const conversationRepo: any = {
      getConversationContext: asyncMock().mockResolvedValue(mockCtx),
    };
    const stateMachine: any = {
      isValidTransition: jest.fn().mockReturnValue(false),
      transition: jest.fn(),
    };
    const svc = new ConversationsService(conversationRepo, stateMachine);

    await expect(svc.close(conversationId, 'actor-1')).rejects.toThrow();
  });

  it('close con ticketService cierra el ticket activo y libera la asignación', async () => {
    const mockCtx = { id: conversationId, meta: { flowState: 'HUMAN_FLOW', version: 3 } };
    const conversationRepo: any = {
      getConversationContext: asyncMock().mockResolvedValue(mockCtx),
      updateConversationStatus: asyncMock<void>().mockResolvedValue(undefined),
      clearInboxOwnership: asyncMock<void>().mockResolvedValue(undefined),
      closeActiveTickets: asyncMock<number>().mockResolvedValue(1),
    };
    const stateMachine: any = {
      isValidTransition: jest.fn().mockReturnValue(true),
      transition: asyncMock<void>().mockResolvedValue(undefined),
    };
    const activeTicket = { id: 'ticket-1', status: 'OPEN' };
    const ticketService: any = {
      getActiveTicketByConversation: asyncMock().mockResolvedValue(activeTicket),
      closeTicket: asyncMock().mockResolvedValue({ id: 'ticket-1', status: 'CLOSED' }),
    };

    const svc = new ConversationsService(
      conversationRepo,
      stateMachine,
      undefined,
      undefined,
      ticketService,
    );
    await svc.close(conversationId, 'agent-1');

    expect(conversationRepo.clearInboxOwnership).toHaveBeenCalledWith(conversationId);
    expect(ticketService.getActiveTicketByConversation).toHaveBeenCalledWith(conversationId);
    expect(ticketService.closeTicket).toHaveBeenCalledWith('ticket-1', { reason: 'user_request' });
    expect(conversationRepo.closeActiveTickets).not.toHaveBeenCalled();
  });

  it('close sin ticketService cierra tickets y libera asignación vía repositorio', async () => {
    const mockCtx = { id: conversationId, meta: { flowState: 'HUMAN_FLOW', version: 3 } };
    const conversationRepo: any = {
      getConversationContext: asyncMock().mockResolvedValue(mockCtx),
      updateConversationStatus: asyncMock<void>().mockResolvedValue(undefined),
      clearInboxOwnership: asyncMock<void>().mockResolvedValue(undefined),
      closeActiveTickets: asyncMock<number>().mockResolvedValue(0),
    };
    const stateMachine: any = {
      isValidTransition: jest.fn().mockReturnValue(true),
      transition: asyncMock<void>().mockResolvedValue(undefined),
    };

    const svc = new ConversationsService(conversationRepo, stateMachine);
    const result = await svc.close(conversationId, 'agent-1');

    expect(result.closed).toBe(true);
    expect(conversationRepo.clearInboxOwnership).toHaveBeenCalledWith(conversationId);
    expect(conversationRepo.closeActiveTickets).toHaveBeenCalledWith(
      conversationId,
      'user_request',
    );
  });

  it('list proyecta inboxStatus, preview del último mensaje y responsable', async () => {
    const conversationRepo: any = {
      listWithContext: asyncMock().mockResolvedValue({
        items: [
          {
            id: conversationId,
            citizenId: 'cit-1',
            status: 'open',
            updatedAt: new Date('2026-09-20T18:00:00.000Z'),
            assignedUser: { id: 'agent-1', fullName: 'Ana López', email: 'ana@voz.test' },
            messages: [
              {
                body: 'Se cortó el agua en toda la colonia.',
                messageType: 'text',
                createdAt: new Date('2026-09-20T18:00:00.000Z'),
              },
            ],
            tickets: [{ id: 'ticket-open' }],
            citizen: { id: 'cit-1', phone: '9661234567', name: 'María' },
            meta: { flowState: 'HUMAN_FLOW' },
          },
          {
            id: 'conv-2',
            citizenId: 'cit-2',
            status: 'closed',
            updatedAt: new Date('2026-09-19T18:00:00.000Z'),
            assignedUser: null,
            messages: [],
            tickets: [],
            citizen: { id: 'cit-2', phone: '9660000000', name: 'Carlos' },
            meta: { flowState: 'CLOSED' },
          },
        ],
        hasNextPage: false,
      }),
      findBotAgentsByLineIds: asyncMock<
        Map<string, { id: string; name: string }>
      >().mockResolvedValue(new Map()),
    };
    const stateMachine: any = {
      isValidTransition: jest.fn(),
      transition: asyncMock<void>(),
    };
    const svc = new ConversationsService(conversationRepo, stateMachine);
    const result = await svc.list({ limit: 20 });

    expect(conversationRepo.listWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );

    expect(result.items[0]?.inboxStatus).toBe('active');
    expect(result.items[0]?.lastMessagePreview).toBe('Se cortó el agua en toda la colonia.');
    expect(result.items[0]?.assignedUser).toEqual(
      expect.objectContaining({ fullName: 'Ana López' }),
    );
    expect(result.items[0]).not.toHaveProperty('messages');
    expect(result.items[0]).not.toHaveProperty('tickets');
    expect(result.items[1]?.inboxStatus).toBe('inactive');
    expect(result.items[1]?.lastMessagePreview).toBeNull();
    expect(result.items[0]?.unreadCount).toBe(0);
  });

  it('list reenvía filtros de bandeja al repositorio', async () => {
    const conversationRepo: any = {
      listWithContext: asyncMock().mockResolvedValue({ items: [], hasNextPage: false }),
      findBotAgentsByLineIds: asyncMock<
        Map<string, { id: string; name: string }>
      >().mockResolvedValue(new Map()),
    };
    const stateMachine: any = {
      isValidTransition: jest.fn(),
      transition: asyncMock<void>(),
    };
    const svc = new ConversationsService(conversationRepo, stateMachine);

    await svc.list({
      limit: 50,
      inboxStatus: 'active',
      departmentIds: [
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
      ],
      communicationLineId: '22222222-2222-2222-2222-222222222222',
      search: 'juan',
    });

    expect(conversationRepo.listWithContext).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 50,
      citizenId: undefined,
      inboxStatus: 'active',
      departmentId: undefined,
      departmentIds: [
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
      ],
      departmentSlug: undefined,
      communicationLineId: '22222222-2222-2222-2222-222222222222',
      search: 'juan',
    });
  });

  it('ensureOpenForCitizen busca o crea la conversación canónica y devuelve el contexto', async () => {
    const citizenId = 'cit-1';
    const ctx = { id: conversationId, citizenId, status: 'open', meta: { flowState: 'BOT_FLOW' } };
    const conversationRepo: any = {
      findOrCreateCanonical: asyncMock().mockResolvedValue({ id: conversationId, status: 'open' }),
      getConversationContext: asyncMock().mockResolvedValue(ctx),
    };
    const stateMachine: any = {
      isValidTransition: jest.fn(),
      transition: asyncMock<void>(),
    };
    const svc = new ConversationsService(conversationRepo, stateMachine);

    const result = await svc.ensureOpenForCitizen(citizenId);

    expect(conversationRepo.findOrCreateCanonical).toHaveBeenCalledWith(citizenId, {
      allowUnbound: true,
    });
    expect(conversationRepo.getConversationContext).toHaveBeenCalledWith(conversationId);
    expect(result).toEqual(ctx);
  });
});

describe('normalizeInboxListStatus', () => {
  it('acepta aliases en español e inglés', () => {
    expect(normalizeInboxListStatus('activa')).toBe('active');
    expect(normalizeInboxListStatus('activas')).toBe('active');
    expect(normalizeInboxListStatus('active')).toBe('active');
    expect(normalizeInboxListStatus('inactiva')).toBe('inactive');
    expect(normalizeInboxListStatus('inactivas')).toBe('inactive');
    expect(normalizeInboxListStatus('inactive')).toBe('inactive');
    expect(normalizeInboxListStatus('nope')).toBeUndefined();
  });
});
