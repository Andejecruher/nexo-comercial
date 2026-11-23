import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TicketRepository } from '../../repositories/ticket.repository';
import { MAX_PAGE_SIZE, TicketService } from '../../services/tickets/ticket.service';
import { clearTotalCache } from '../../services/tickets/ticket-total-cache';
import { TicketPriority, TicketStatus } from '../../services/tickets/ticket.types';

const asyncMock = <T = unknown>() => jest.fn<(...args: unknown[]) => Promise<T>>();

function buildRow(id: string) {
  return {
    id,
    folio: `FOL-${id}`,
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
  };
}

/**
 * El doble de Prisma solo necesita `ticket.findMany` y `ticket.count` para
 * ejercitar la ruta offset. TicketPrismaLike exige el resto de métodos, pero
 * el repositorio no los toca en este camino.
 */
function buildService() {
  const ticket = {
    findMany: asyncMock(),
    count: asyncMock<number>(),
  };
  const service = new TicketService({ ticket } as never);
  const repo = new TicketRepository({ ticket } as never);
  return { service, repo, ticket };
}

describe('TicketRepository.listTicketsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pagina por offset con tiebreaker por id en el orden', async () => {
    const { repo, ticket } = buildService();
    ticket.findMany.mockResolvedValue([buildRow('t-1')] as never);
    ticket.count.mockResolvedValue(150);

    const result = await repo.listTicketsPage({ page: 3, limit: 25 });

    expect(ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 25,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result.totalItems).toBe(150);
    expect(result.rows).toHaveLength(1);
  });

  it('aplica el filtro de estado al listado y al count', async () => {
    const { repo, ticket } = buildService();
    ticket.findMany.mockResolvedValue([] as never);
    ticket.count.mockResolvedValue(0);

    await repo.listTicketsPage({ page: 1, limit: 10, status: TicketStatus.OPEN });

    expect(ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: TicketStatus.OPEN }) }),
    );
    expect(ticket.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: TicketStatus.OPEN }),
    });
  });

  it('ordena por prioridad manteniendo un orden determinista', async () => {
    const { repo, ticket } = buildService();
    ticket.findMany.mockResolvedValue([] as never);
    ticket.count.mockResolvedValue(0);

    await repo.listTicketsPage({ page: 1, limit: 10, sortBy: 'priority', sort: 'asc' });

    expect(ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});

describe('TicketService.listTicketsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTotalCache();
  });

  it('clampa limit por encima del máximo permitido', async () => {
    const { service, ticket } = buildService();
    ticket.findMany.mockResolvedValue([] as never);
    ticket.count.mockResolvedValue(0);

    const result = await service.listTicketsPage({ page: 1, limit: 500 });

    expect(result.itemsPerPage).toBe(MAX_PAGE_SIZE);
    expect(ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: MAX_PAGE_SIZE }));
  });

  it('calcula metadata de paginación', async () => {
    const { service, ticket } = buildService();
    ticket.findMany.mockResolvedValue([buildRow('t-51')] as never);
    ticket.count.mockResolvedValue(150);

    const result = await service.listTicketsPage({
      page: 3,
      limit: 25,
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
    });

    expect(result).toMatchObject({
      totalItems: 150,
      totalPages: 6,
      currentPage: 3,
      itemsPerPage: 25,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  it('clampea la página al total real cuando se pide fuera de rango', async () => {
    const { service, ticket } = buildService();
    ticket.findMany.mockResolvedValue([] as never);
    ticket.count.mockResolvedValue(10);

    const result = await service.listTicketsPage({ page: 99, limit: 25 });

    expect(result).toMatchObject({
      totalItems: 10,
      totalPages: 1,
      currentPage: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('no repite el COUNT para filtros idénticos dentro del TTL', async () => {
    const { service, ticket } = buildService();
    ticket.findMany.mockResolvedValue([] as never);
    ticket.count.mockResolvedValue(42);

    await service.listTicketsPage({ page: 1, limit: 25, status: TicketStatus.OPEN });
    await service.listTicketsPage({ page: 2, limit: 25, status: TicketStatus.OPEN });

    expect(ticket.count).toHaveBeenCalledTimes(1);
  });

  it('vuelve a contar para un filtro distinto', async () => {
    const { service, ticket } = buildService();
    ticket.findMany.mockResolvedValue([] as never);
    ticket.count.mockResolvedValue(42);

    await service.listTicketsPage({ page: 1, limit: 25, status: TicketStatus.OPEN });
    await service.listTicketsPage({ page: 1, limit: 25, status: TicketStatus.CLOSED });

    expect(ticket.count).toHaveBeenCalledTimes(2);
  });
});
