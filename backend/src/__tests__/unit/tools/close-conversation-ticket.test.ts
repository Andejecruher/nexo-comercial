/**
 * Tests unitarios: CloseConversationTool con integración TicketService
 *
 * RED: verifica que al cerrar conversación, el ticket activo pasa a CLOSED
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CloseConversationTool } from '../../../ai/tools/close-conversation.tool';
import { TicketService } from '../../../services/tickets/ticket.service';
import { TicketStatus } from '../../../services/tickets/ticket.types';

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeTicketServiceMock() {
  return {
    getActiveTicketByConversation: asyncMock(),
    closeTicket: asyncMock(),
    updateStatus: asyncMock(),
    createTicket: asyncMock(),
    getOrCreateActiveTicket: asyncMock(),
    attachMessageToTicket: asyncMock(),
    assignTicket: asyncMock(),
  } as unknown as jest.Mocked<TicketService>;
}

describe('CloseConversationTool — ticket integration', () => {
  let ticketService: jest.Mocked<TicketService>;
  let tool: CloseConversationTool;

  beforeEach(() => {
    ticketService = makeTicketServiceMock();
    tool = new CloseConversationTool(ticketService);
    jest.clearAllMocks();
  });

  it('cierra el ticket activo al cerrar la conversación', async () => {
    ticketService.getActiveTicketByConversation.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
    } as never);
    ticketService.closeTicket.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.CLOSED,
    } as never);

    await tool.execute({ conversationId: 'conv-1', reason: 'resolved' });

    expect(ticketService.getActiveTicketByConversation.mock.calls).toContainEqual(['conv-1']);
    expect(ticketService.closeTicket.mock.calls).toContainEqual([
      'ticket-1',
      { reason: 'resolved' },
    ]);
  });

  it('NO falla si no hay ticket activo (silently skips)', async () => {
    ticketService.getActiveTicketByConversation.mockResolvedValue(undefined as never);

    const result = (await tool.execute({ conversationId: 'conv-1', reason: 'resolved' })) as Record<
      string,
      unknown
    >;

    expect(result.error).toBeUndefined();
    expect(ticketService.closeTicket.mock.calls).toHaveLength(0);
  });

  it('retorna closed=true incluso al integrar ticket', async () => {
    ticketService.getActiveTicketByConversation.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
    } as never);
    ticketService.closeTicket.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.CLOSED,
    } as never);

    const result = (await tool.execute({ conversationId: 'conv-1', reason: 'resolved' })) as Record<
      string,
      unknown
    >;

    expect(result.closed).toBe(true);
    expect(result.conversationId).toBe('conv-1');
  });
});
