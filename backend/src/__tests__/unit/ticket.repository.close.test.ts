import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TicketRepository } from '../../repositories/ticket.repository';
import { TicketStatus } from '../../services/tickets/ticket.types';

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440000';

const asyncMock = <T = unknown>() => jest.fn<(...args: unknown[]) => Promise<T>>();

describe('TicketRepository.closeActiveByConversation', () => {
  const ticket = {
    findFirst: asyncMock(),
    findUnique: asyncMock(),
    findMany: asyncMock(),
    update: asyncMock(),
  };
  const conversation = {
    findUnique: asyncMock(),
    update: asyncMock(),
  };
  const repo = new TicketRepository({ ticket, conversation } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna null cuando no hay ticket activo', async () => {
    ticket.findFirst.mockResolvedValue(null);
    await expect(
      repo.closeActiveByConversation(CONVERSATION_ID, {
        reason: 'user_request',
      }),
    ).resolves.toBeNull();
    expect(ticket.update).not.toHaveBeenCalled();
  });

  it('cierra el ticket activo y limpia asignación', async () => {
    ticket.findFirst.mockResolvedValue({ id: 'ticket-1', status: TicketStatus.OPEN } as never);
    ticket.update.mockResolvedValue({ id: 'ticket-1', status: TicketStatus.CLOSED } as never);

    const closed = await repo.closeActiveByConversation(CONVERSATION_ID, {
      reason: 'user_request',
    });

    expect(closed).toEqual({ id: 'ticket-1', status: TicketStatus.CLOSED });
    expect(ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: expect.objectContaining({
        status: TicketStatus.CLOSED,
        closeReason: 'user_request',
        assignedUserId: null,
        departmentSlug: null,
      }),
    });
  });
});

describe('TicketRepository.findRecentByCitizen', () => {
  const ticket = {
    findMany: asyncMock(),
  };
  const repo = new TicketRepository({ ticket } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('limita y ordena los tickets más recientes del ciudadano', async () => {
    ticket.findMany.mockResolvedValue([{ id: 'ticket-1' }] as never);

    const result = await repo.findRecentByCitizen('citizen-1', 5);

    expect(result).toEqual([{ id: 'ticket-1' }]);
    expect(ticket.findMany).toHaveBeenCalledWith({
      where: { citizenId: 'citizen-1' },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    });
  });
});
