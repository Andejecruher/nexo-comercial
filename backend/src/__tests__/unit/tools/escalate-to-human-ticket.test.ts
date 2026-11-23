/**
 * Tests unitarios: EscalateToHumanTool con integración TicketService
 *
 * RED: verifica que al escalar, el ticket activo pasa a IN_PROGRESS
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EscalateToHumanTool } from '../../../ai/tools/escalate-to-human.tool';
import { TicketService } from '../../../services/tickets/ticket.service';
import { TicketStatus } from '../../../services/tickets/ticket.types';

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeTicketServiceMock() {
  return {
    getActiveTicketByConversation: asyncMock(),
    updateStatus: asyncMock(),
    createTicket: asyncMock(),
    getOrCreateActiveTicket: asyncMock(),
    attachMessageToTicket: asyncMock(),
    assignTicket: asyncMock(),
    closeTicket: asyncMock(),
  } as unknown as jest.Mocked<TicketService>;
}

function makePrismaMock() {
  return {
    conversationMeta: {
      findUnique: asyncMock(),
      update: asyncMock(),
    },
    $transaction: jest.fn().mockImplementation((fn: unknown) => {
      if (typeof fn === 'function')
        return (fn as (tx: unknown) => Promise<unknown>)({
          conversationMeta: { update: asyncMock<unknown>() },
        });
      return Promise.resolve();
    }),
  };
}

describe('EscalateToHumanTool — ticket integration', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let ticketService: jest.Mocked<TicketService>;
  let tool: EscalateToHumanTool;

  beforeEach(() => {
    prisma = makePrismaMock();
    ticketService = makeTicketServiceMock();

    tool = new EscalateToHumanTool(prisma as any, ticketService);
    jest.clearAllMocks();
  });

  it('transiciona ticket activo a IN_PROGRESS al escalar', async () => {
    prisma.conversationMeta.findUnique.mockResolvedValue({ flowState: 'BOT_FLOW' } as never);
    ticketService.getActiveTicketByConversation.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
    } as never);
    ticketService.updateStatus.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.IN_PROGRESS,
    } as never);

    await tool.execute({ conversationId: 'conv-1' });

    expect(ticketService.getActiveTicketByConversation.mock.calls).toContainEqual(['conv-1']);
    expect(ticketService.updateStatus.mock.calls).toContainEqual([
      'ticket-1',
      TicketStatus.IN_PROGRESS,
      {},
    ]);
  });

  it('NO falla si no hay ticket activo (silently skips)', async () => {
    prisma.conversationMeta.findUnique.mockResolvedValue({ flowState: 'BOT_FLOW' } as never);
    ticketService.getActiveTicketByConversation.mockResolvedValue(undefined as never);

    const result = (await tool.execute({ conversationId: 'conv-1' })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(ticketService.updateStatus.mock.calls).toHaveLength(0);
  });

  it('retorna escalated=true incluso al integrar ticket', async () => {
    prisma.conversationMeta.findUnique.mockResolvedValue({
      flowState: 'DEPARTMENT_ROUTING',
    } as never);
    ticketService.getActiveTicketByConversation.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
    } as never);
    ticketService.updateStatus.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.IN_PROGRESS,
    } as never);

    const result = (await tool.execute({
      conversationId: 'conv-1',
      reason: 'usuario agresivo',
    })) as Record<string, unknown>;

    expect(result.escalated).toBe(true);
    expect(result.flowState).toBe('ESCALATED');
  });
});
