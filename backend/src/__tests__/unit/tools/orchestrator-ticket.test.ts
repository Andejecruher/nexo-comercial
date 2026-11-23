/**
 * Tests RED: MessageOrchestratorService — integración TicketService
 *
 * Verifica que al procesar un mensaje inbound:
 * 1. Se crea/recupera el ticket activo para la conversación
 * 2. El mensaje inbound queda asociado al ticket
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MessageOrchestratorService } from '../../../services/orchestrator/message-orchestrator.service';
import { TicketService } from '../../../services/tickets/ticket.service';
import { TicketPriority, TicketSource, TicketStatus } from '../../../services/tickets/ticket.types';

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeInboundText() {
  return {
    type: 'text' as const,
    id: 'wamid-test-1',
    from: '521999888777',
    timestamp: '1700000000',
    text: { body: 'hola quiero hacer un reclamo' },
  };
}

function makeTicketServiceMock() {
  return {
    getOrCreateActiveTicket: asyncMock(),
    attachMessageToTicket: asyncMock(),
    getActiveTicketByConversation: asyncMock(),
    updateStatus: asyncMock(),
    createTicket: asyncMock(),
    assignTicket: asyncMock(),
    closeTicket: asyncMock(),
  } as unknown as jest.Mocked<TicketService>;
}

describe('MessageOrchestratorService — ticket integration', () => {
  const citizenRepo: { findOrCreate: ReturnType<typeof asyncMock> } = {
    findOrCreate: asyncMock(),
  };
  const conversationRepo = {
    findOrCreateCanonical: asyncMock(),
    getConversationContext: asyncMock(),
  };
  const messageRepo = { create: asyncMock(), findByExternalId: asyncMock() };
  const stateMachine = { transition: asyncMock() };
  const deptRouter = { route: asyncMock() };
  const whatsappProvider = { markAsRead: asyncMock() };
  const redis = { incr: asyncMock(), del: asyncMock() };

  let ticketService: jest.Mocked<TicketService>;

  function makeOrchestrator() {
    return new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
      undefined,
      '',
      ticketService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ticketService = makeTicketServiceMock();

    citizenRepo.findOrCreate.mockResolvedValue({
      id: 'cit-1',
      interests: [],
      name: 'Ana',
      lastName: 'López',
      neighborhoodId: 'nbhd-1',
    } as never);
    conversationRepo.findOrCreateCanonical.mockResolvedValue({ id: 'conv-1' } as never);
    conversationRepo.getConversationContext.mockResolvedValue({
      meta: { flowState: 'BOT_FLOW', version: 0 },
    } as never);
    messageRepo.create.mockResolvedValue({
      id: 'msg-inbound-1',
      createdAt: new Date(),
      messageType: 'text',
      body: 'hola',
      externalMessageId: 'wamid-test-1',
    } as never);
    messageRepo.findByExternalId.mockResolvedValue(null as never);
    whatsappProvider.markAsRead.mockResolvedValue(undefined as never);
    redis.incr.mockResolvedValue(1 as never);
    redis.del.mockResolvedValue(undefined as never);

    ticketService.getOrCreateActiveTicket.mockResolvedValue({
      ticket: {
        id: 'ticket-1',
        conversationId: 'conv-1',
        citizenId: 'cit-1',
        status: TicketStatus.OPEN,
        priority: TicketPriority.MEDIUM,
        source: TicketSource.WHATSAPP,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      created: false,
    } as never);
    ticketService.attachMessageToTicket.mockResolvedValue({
      id: 'tm-1',
      ticketId: 'ticket-1',
      messageId: 'msg-inbound-1',
    } as never);
  });

  it('llama getOrCreateActiveTicket con conversationId y citizenId al recibir mensaje inbound', async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.handleInboundMessage('521999888777', makeInboundText());

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ticketService.getOrCreateActiveTicket).toHaveBeenCalledWith('conv-1', 'cit-1');
  });

  it('asocia el mensaje inbound al ticket activo', async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.handleInboundMessage('521999888777', makeInboundText());

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ticketService.attachMessageToTicket).toHaveBeenCalledWith('ticket-1', 'msg-inbound-1');
  });

  it('NO falla el flujo si ticketService no está configurado', async () => {
    const orchestratorNoTickets = new MessageOrchestratorService(
      citizenRepo as never,
      conversationRepo as never,
      messageRepo as never,
      stateMachine as never,
      deptRouter as never,
      whatsappProvider as never,
    );

    await expect(
      orchestratorNoTickets.handleInboundMessage('521999888777', makeInboundText()),
    ).resolves.not.toThrow();
  });
});
