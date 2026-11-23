/**
 * Tests unitarios: InternalToolRunner — integración con TicketService.
 *
 * Verifica que las tools V2 (assignDepartment, escalateToHuman, closeConversation)
 * y sendMessage reciben y usan el TicketService cuando está inyectado.
 *
 * TDD: RED first — estas pruebas fallan hasta que el wiring esté implementado.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TicketStatus } from '../../services/tickets/ticket.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeTicketServiceMock() {
  return {
    getActiveTicketByConversation: asyncMock<{ id: string; status: TicketStatus } | undefined>(),
    getOrCreateActiveTicket: asyncMock<{ id: string; status: TicketStatus }>(),
    attachMessageToTicket: asyncMock<{ id: string }>(),
    assignTicket: asyncMock<{ id: string }>(),
    closeTicket: asyncMock<{ id: string }>(),
    updateStatus: asyncMock<{ id: string }>(),
    createTicket: asyncMock<{ id: string }>(),
  };
}

function makePrismaMock() {
  const tx = {
    outboxEvent: {
      findUnique: jest.fn<() => Promise<object | null>>(),
      create: jest.fn<() => Promise<object>>(),
    },
    message: {
      findFirst: jest.fn<() => Promise<object | null>>(),
      create: jest.fn<() => Promise<{ id: string; body: string }>>(),
    },
    conversationMeta: {
      findUnique: jest.fn<() => Promise<object | null>>(),
      update: jest.fn<() => Promise<object>>(),
    },
  };
  return {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    conversationMeta: {
      findUnique: jest.fn<() => Promise<object | null>>(),
      update: jest.fn<() => Promise<object>>(),
    },
    __tx: tx,
  };
}

function makeDeps(ticketServiceMock: ReturnType<typeof makeTicketServiceMock>) {
  const prismaMock = makePrismaMock();
  return {
    citizenRepo: {
      findByPhone: jest.fn<() => Promise<{ id: string; phone: string } | null>>(),
      findOrCreate: jest.fn<() => Promise<object>>(),
    },
    conversationRepo: {
      findOrCreateOpen: jest.fn<() => Promise<{ id: string }>>(),
    },
    messageRepo: {
      create: jest.fn<() => Promise<{ id: string }>>(),
    },
    outboxProcessor: {
      enqueue: jest.fn<() => Promise<void>>(),
    },
    prisma: prismaMock,
    auditService: {
      log: jest.fn<() => Promise<void>>(),
    },
    ticketService: ticketServiceMock,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InternalToolRunner — TicketService wiring', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('closeConversation — ticket se cierra', () => {
    it('llama closeTicket cuando hay ticket activo', async () => {
      const ticketService = makeTicketServiceMock();
      const activeTicket = { id: 'ticket-1', status: TicketStatus.OPEN };
      ticketService.getActiveTicketByConversation.mockResolvedValue(activeTicket as never);
      ticketService.closeTicket.mockResolvedValue({ id: 'ticket-1' } as never);

      const { InternalToolRunner: Runner } = await import('../../ai/runners/internal-tool.runner');

      const runner = new Runner(makeDeps(ticketService) as any);

      await runner.execute('closeConversation', {
        conversationId: 'conv-uuid-1',
        reason: 'resolved',
      });

      expect(ticketService.getActiveTicketByConversation).toHaveBeenCalledWith('conv-uuid-1');
      expect(ticketService.closeTicket).toHaveBeenCalledWith('ticket-1', { reason: 'resolved' });
    });

    it('no falla si no hay ticket activo', async () => {
      const ticketService = makeTicketServiceMock();
      ticketService.getActiveTicketByConversation.mockResolvedValue(undefined as never);

      const { InternalToolRunner: Runner } = await import('../../ai/runners/internal-tool.runner');

      const runner = new Runner(makeDeps(ticketService) as any);

      const result = await runner.execute('closeConversation', {
        conversationId: 'conv-uuid-1',
      });

      expect(result).toMatchObject({ closed: true });
      expect(ticketService.closeTicket).not.toHaveBeenCalled();
    });
  });

  describe('assignDepartment — ticket recibe departmentSlug', () => {
    it('llama assignTicket con departmentSlug cuando hay ticket activo', async () => {
      const ticketService = makeTicketServiceMock();
      const activeTicket = { id: 'ticket-1', status: TicketStatus.OPEN };
      ticketService.getActiveTicketByConversation.mockResolvedValue(activeTicket as never);
      ticketService.assignTicket.mockResolvedValue({ id: 'ticket-1' } as never);

      const prismaMock = makePrismaMock();
      prismaMock.conversationMeta.findUnique.mockResolvedValue({
        flowState: 'DEPARTMENT_ROUTING',
      } as never);
      prismaMock.conversationMeta.update.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
        return (fn as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
      });

      const deps = {
        ...makeDeps(ticketService),
        prisma: prismaMock,
      };

      const { InternalToolRunner: Runner } = await import('../../ai/runners/internal-tool.runner');

      const runner = new Runner(deps as any);

      await runner.execute('assignDepartment', {
        conversationId: 'conv-uuid-1',
        departmentSlug: 'obras-publicas',
      });

      expect(ticketService.getActiveTicketByConversation).toHaveBeenCalledWith('conv-uuid-1');
      expect(ticketService.assignTicket).toHaveBeenCalledWith('ticket-1', {
        departmentSlug: 'obras-publicas',
      });
    });
  });

  describe('escalateToHuman — ticket pasa a IN_PROGRESS', () => {
    it('llama updateStatus(IN_PROGRESS) cuando hay ticket activo', async () => {
      const ticketService = makeTicketServiceMock();
      const activeTicket = { id: 'ticket-1', status: TicketStatus.OPEN };
      ticketService.getActiveTicketByConversation.mockResolvedValue(activeTicket as never);
      ticketService.updateStatus.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.IN_PROGRESS,
      } as never);

      const prismaMock = makePrismaMock();
      prismaMock.conversationMeta.findUnique.mockResolvedValue({
        flowState: 'DEPARTMENT_ROUTING',
      } as never);
      prismaMock.conversationMeta.update.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
        return (fn as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
      });

      const deps = {
        ...makeDeps(ticketService),
        prisma: prismaMock,
      };

      const { InternalToolRunner: Runner } = await import('../../ai/runners/internal-tool.runner');

      const runner = new Runner(deps as any);

      await runner.execute('escalateToHuman', {
        conversationId: 'conv-uuid-1',
        reason: 'user_request',
      });

      expect(ticketService.getActiveTicketByConversation).toHaveBeenCalledWith('conv-uuid-1');
      expect(ticketService.updateStatus).toHaveBeenCalledWith(
        'ticket-1',
        TicketStatus.IN_PROGRESS,
        {
          escalationReason: 'user_request',
        },
      );
    });
  });
});
