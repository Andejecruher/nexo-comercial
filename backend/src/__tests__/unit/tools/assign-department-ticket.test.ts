/**
 * Tests unitarios: AssignDepartmentV2Tool con integración TicketService
 *
 * RED: verifica que al asignar departamento, el ticket activo recibe departmentSlug
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AssignDepartmentV2Tool } from '../../../ai/tools/assign-department-v2.tool';
import { TicketService } from '../../../services/tickets/ticket.service';
import { TicketStatus } from '../../../services/tickets/ticket.types';

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeTicketServiceMock() {
  return {
    getActiveTicketByConversation: asyncMock(),
    assignTicket: asyncMock(),
    updateStatus: asyncMock(),
    createTicket: asyncMock(),
    getOrCreateActiveTicket: asyncMock(),
    attachMessageToTicket: asyncMock(),
    closeTicket: asyncMock(),
  } as unknown as jest.Mocked<TicketService>;
}

describe('AssignDepartmentV2Tool — ticket integration', () => {
  let ticketService: jest.Mocked<TicketService>;
  let tool: AssignDepartmentV2Tool;

  beforeEach(() => {
    ticketService = makeTicketServiceMock();

    tool = new AssignDepartmentV2Tool(ticketService);
    jest.clearAllMocks();
  });

  it('asigna departmentSlug al ticket activo cuando existe', async () => {
    ticketService.getActiveTicketByConversation.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
    } as never);
    ticketService.assignTicket.mockResolvedValue({
      id: 'ticket-1',
      departmentSlug: 'obras-publicas',
    } as never);

    await tool.execute({ conversationId: 'conv-1', departmentSlug: 'obras-publicas' });

    expect(ticketService.getActiveTicketByConversation.mock.calls).toContainEqual(['conv-1']);
    expect(ticketService.assignTicket.mock.calls).toContainEqual([
      'ticket-1',
      { departmentSlug: 'obras-publicas' },
    ]);
  });

  it('NO falla si no hay ticket activo (silently skips)', async () => {
    ticketService.getActiveTicketByConversation.mockResolvedValue(undefined as never);

    const result = (await tool.execute({
      conversationId: 'conv-1',
      departmentSlug: 'salud',
    })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(ticketService.assignTicket.mock.calls).toHaveLength(0);
  });

  it('retorna assigned=true y aiActive=false (handoff silencia IA) incluso al integrar ticket', async () => {
    ticketService.getActiveTicketByConversation.mockResolvedValue({
      id: 'ticket-1',
      status: TicketStatus.OPEN,
    } as never);
    ticketService.assignTicket.mockResolvedValue({
      id: 'ticket-1',
      departmentSlug: 'salud',
    } as never);

    const result = (await tool.execute({
      conversationId: 'conv-1',
      departmentSlug: 'salud',
    })) as Record<string, unknown>;

    expect(result.assigned).toBe(true);
    expect(result.aiActive).toBe(false);
    expect(result.departmentSlug).toBe('salud');
  });
});
