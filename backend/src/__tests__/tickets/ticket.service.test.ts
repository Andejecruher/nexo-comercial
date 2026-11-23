/**
 * Tests unitarios para TicketService.
 *
 * Cubre:
 * - Creación de ticket
 * - Evitar duplicados (solo 1 ticket activo por conversación)
 * - Attach message a ticket
 * - Cierre de ticket
 * - Transición de estados (OPEN→IN_PROGRESS→RESOLVED→CLOSED)
 * - Transiciones inválidas
 * - getActiveTicketByConversation
 * - getOrCreateActiveTicket (idempotente)
 * - assignTicket
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import { TicketService } from '../../services/tickets/ticket.service';
import {
  CreateTicketInput,
  TicketPriority,
  TicketSource,
  TicketStatus,
} from '../../services/tickets/ticket.types';

// ─── Helpers: crear mocks ────────────────────────────────────────────────────

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440000';

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeTicketMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ticket-uuid-1',
    conversationId: CONVERSATION_ID,
    citizenId: 'citizen-uuid-1',
    status: TicketStatus.OPEN,
    priority: TicketPriority.MEDIUM,
    source: TicketSource.WHATSAPP,
    title: undefined,
    description: undefined,
    departmentSlug: undefined,
    assignedUserId: undefined,
    closedAt: undefined,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    ticket: {
      create: asyncMock(),
      findFirst: asyncMock(),
      update: asyncMock(),
      findUnique: asyncMock(),
    },
    ticketMessage: {
      create: asyncMock(),
      findFirst: asyncMock(),
    },
    message: {
      updateMany: asyncMock(),
    },
    conversation: {
      findUnique: asyncMock(),
      update: asyncMock(),
      updateMany: asyncMock(),
    },
    citizen: {
      findUnique: asyncMock(),
    },
    $transaction: jest.fn<(fn: unknown, options?: unknown) => Promise<unknown>>(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TicketService;

  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.$transaction.mockImplementation(async (fn: unknown) => {
      return (fn as (tx: typeof prisma) => Promise<unknown>)(prisma);
    });

    service = new TicketService(prisma as any);
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createTicket
  // ──────────────────────────────────────────────────────────────────────────

  describe('createTicket', () => {
    it('salta un folio ocupado sin abortar la transacción de ingreso', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z') });
      try {
        prisma.conversation.findUnique.mockResolvedValue({
          id: CONVERSATION_ID,
          citizenId: 'citizen-uuid-1',
        });
        prisma.citizen.findUnique.mockResolvedValue({ id: 'citizen-uuid-1' });
        prisma.ticket.findFirst.mockResolvedValue(null);
        prisma.ticket.findUnique
          .mockResolvedValueOnce(makeTicketMock())
          .mockResolvedValueOnce(null);
        prisma.ticket.create.mockResolvedValue(makeTicketMock());
        // Prisma's transaction client has no nested $transaction method.
        const tx = { ...prisma, $transaction: undefined };
        const scoped = service.inTransaction(
          tx as unknown as Parameters<TicketService['inTransaction']>[0],
        );
        await scoped.createTicket({
          conversationId: CONVERSATION_ID,
          citizenId: 'citizen-uuid-1',
        });
        expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
        expect(prisma.ticket.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ folio: '20261013120001_0000_0000' }),
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('crea un ticket cuando la conversación y citizen existen y no hay ticket activo', async () => {
      const input: CreateTicketInput = {
        conversationId: CONVERSATION_ID,
        citizenId: 'citizen-uuid-1',
      };

      prisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        citizenId: 'citizen-uuid-1',
      } as never);
      prisma.citizen.findUnique.mockResolvedValue({ id: 'citizen-uuid-1' } as never);
      prisma.ticket.findFirst.mockResolvedValue(null as never);
      const createdTicket = makeTicketMock();
      prisma.ticket.create.mockResolvedValue(createdTicket as never);

      const result = await service.createTicket(input);

      expect(result.id).toBe('ticket-uuid-1');
      expect(result.status).toBe(TicketStatus.OPEN);
      expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
      );
      expect(prisma.conversation.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
      expect(prisma.citizen.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
      expect(prisma.ticket.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it('lanza error cuando la conversación no existe', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null as never);

      await expect(
        service.createTicket({ conversationId: CONVERSATION_ID, citizenId: 'citizen-1' }),
      ).rejects.toThrow('Conversación no encontrada');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lanza error cuando el citizen no existe', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        citizenId: 'citizen-1',
      } as never);
      prisma.citizen.findUnique.mockResolvedValue(null as never);

      await expect(
        service.createTicket({ conversationId: CONVERSATION_ID, citizenId: 'citizen-invalid' }),
      ).rejects.toThrow('Ciudadano no encontrado');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lanza error cuando ya existe un ticket activo en la conversación', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        citizenId: 'citizen-1',
      } as never);
      prisma.citizen.findUnique.mockResolvedValue({ id: 'citizen-1' } as never);
      prisma.ticket.findFirst.mockResolvedValue(makeTicketMock() as never);

      await expect(
        service.createTicket({ conversationId: CONVERSATION_ID, citizenId: 'citizen-1' }),
      ).rejects.toThrow('Ya existe un ticket activo');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getActiveTicketByConversation
  // ──────────────────────────────────────────────────────────────────────────

  describe('getActiveTicketByConversation', () => {
    it('retorna el ticket activo cuando existe', async () => {
      const ticket = makeTicketMock({ status: TicketStatus.IN_PROGRESS });
      prisma.ticket.findFirst.mockResolvedValue(ticket as never);

      const result = await service.getActiveTicketByConversation(CONVERSATION_ID);

      expect(result).not.toBeUndefined();
      expect(result?.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('retorna undefined cuando no hay ticket activo', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null as never);

      const result = await service.getActiveTicketByConversation(CONVERSATION_ID);

      expect(result).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getOrCreateActiveTicket
  // ──────────────────────────────────────────────────────────────────────────

  describe('getOrCreateActiveTicket', () => {
    it('retorna el ticket existente si ya hay uno activo', async () => {
      const existingTicket = makeTicketMock();
      prisma.ticket.findFirst.mockResolvedValue(existingTicket as never);

      const result = await service.getOrCreateActiveTicket(CONVERSATION_ID, 'citizen-uuid-1');

      expect(result.ticket.id).toBe('ticket-uuid-1');
      expect(result.created).toBe(false);
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('crea un nuevo ticket si no existe ninguno activo', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null as never);
      prisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        citizenId: 'citizen-uuid-1',
      } as never);
      prisma.citizen.findUnique.mockResolvedValue({ id: 'citizen-uuid-1' } as never);
      const newTicket = makeTicketMock();
      prisma.ticket.create.mockResolvedValue(newTicket as never);

      const result = await service.getOrCreateActiveTicket(CONVERSATION_ID, 'citizen-uuid-1');

      expect(result.ticket.id).toBe('ticket-uuid-1');
      expect(result.created).toBe(true);
      expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
    });

    it('si hay carrera y create falla por unique activo, recupera el ticket existente', async () => {
      prisma.ticket.findFirst
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(makeTicketMock({ id: 'ticket-race-1' }) as never);

      prisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        citizenId: 'citizen-uuid-1',
      } as never);
      prisma.citizen.findUnique.mockResolvedValue({ id: 'citizen-uuid-1' } as never);
      prisma.ticket.create.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: uq_tickets_one_active_per_conversation',
      } as never);

      const result = await service.getOrCreateActiveTicket(CONVERSATION_ID, 'citizen-uuid-1');

      expect(result.ticket.id).toBe('ticket-race-1');
      expect(result.created).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // attachMessageToTicket
  // ──────────────────────────────────────────────────────────────────────────

  describe('attachMessageToTicket', () => {
    it('asocia un mensaje al ticket correctamente', async () => {
      prisma.ticketMessage.findFirst.mockResolvedValue(null as never);
      prisma.ticket.findUnique.mockResolvedValue(makeTicketMock() as never);
      const ticketMessage = {
        id: 'tm-uuid-1',
        ticketId: 'ticket-uuid-1',
        messageId: 'msg-uuid-1',
        actorType: 'CITIZEN',
        createdAt: new Date(),
      };
      prisma.ticketMessage.create.mockResolvedValue(ticketMessage as never);

      const result = await service.attachMessageToTicket('ticket-uuid-1', 'msg-uuid-1');

      expect(result.ticketId).toBe('ticket-uuid-1');
      expect(result.messageId).toBe('msg-uuid-1');
    });

    it('no duplica el TicketMessage si ya existe la asociación', async () => {
      const existing = {
        id: 'tm-uuid-1',
        ticketId: 'ticket-uuid-1',
        messageId: 'msg-uuid-1',
        actorType: 'CITIZEN',
        createdAt: new Date(),
      };
      prisma.ticketMessage.findFirst.mockResolvedValue(existing as never);

      const result = await service.attachMessageToTicket('ticket-uuid-1', 'msg-uuid-1');

      expect(result.id).toBe('tm-uuid-1');
      expect(prisma.ticketMessage.create).not.toHaveBeenCalled();
    });

    it('lanza error si el ticket no existe', async () => {
      prisma.ticketMessage.findFirst.mockResolvedValue(null as never);
      prisma.ticket.findUnique.mockResolvedValue(null as never);

      await expect(service.attachMessageToTicket('invalid-ticket', 'msg-uuid-1')).rejects.toThrow(
        'Ticket no encontrado',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // assignTicket
  // ──────────────────────────────────────────────────────────────────────────

  describe('assignTicket', () => {
    it('asigna usuario y departamento al ticket', async () => {
      const updated = makeTicketMock({ assignedUserId: 'user-uuid-1', departmentSlug: 'obras' });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.assignTicket('ticket-uuid-1', {
        userId: 'user-uuid-1',
        departmentSlug: 'obras',
      });

      expect(result.assignedUserId).toBe('user-uuid-1');
      expect(result.departmentSlug).toBe('obras');
    });

    it('asigna solo departamento si no se provee userId', async () => {
      const updated = makeTicketMock({ departmentSlug: 'salud' });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.assignTicket('ticket-uuid-1', { departmentSlug: 'salud' });

      expect(result.departmentSlug).toBe('salud');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // closeTicket
  // ──────────────────────────────────────────────────────────────────────────

  describe('closeTicket', () => {
    it('cierra un ticket activo correctamente', async () => {
      const closed = makeTicketMock({ status: TicketStatus.CLOSED, closedAt: new Date() });
      prisma.ticket.update.mockResolvedValue(closed as never);

      const result = await service.closeTicket('ticket-uuid-1');

      expect(result.status).toBe(TicketStatus.CLOSED);
      expect(result.closedAt).not.toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateStatus — transiciones válidas
  // ──────────────────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('transiciona OPEN → IN_PROGRESS correctamente', async () => {
      const current = makeTicketMock({ status: TicketStatus.OPEN });
      prisma.ticket.findUnique.mockResolvedValue(current as never);
      const updated = makeTicketMock({ status: TicketStatus.IN_PROGRESS });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.updateStatus('ticket-uuid-1', TicketStatus.IN_PROGRESS);

      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('transiciona IN_PROGRESS → RESOLVED correctamente', async () => {
      const current = makeTicketMock({ status: TicketStatus.IN_PROGRESS });
      prisma.ticket.findUnique.mockResolvedValue(current as never);
      const updated = makeTicketMock({ status: TicketStatus.RESOLVED });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.updateStatus('ticket-uuid-1', TicketStatus.RESOLVED);

      expect(result.status).toBe(TicketStatus.RESOLVED);
    });

    it('transiciona RESOLVED → CLOSED correctamente', async () => {
      const current = makeTicketMock({ status: TicketStatus.RESOLVED });
      prisma.ticket.findUnique.mockResolvedValue(current as never);
      const updated = makeTicketMock({ status: TicketStatus.CLOSED, closedAt: new Date() });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.updateStatus('ticket-uuid-1', TicketStatus.CLOSED);

      expect(result.status).toBe(TicketStatus.CLOSED);
    });

    it('lanza error en transición inválida OPEN → CLOSED (saltear pasos)', async () => {
      const current = makeTicketMock({ status: TicketStatus.OPEN });
      prisma.ticket.findUnique.mockResolvedValue(current as never);

      await expect(service.updateStatus('ticket-uuid-1', TicketStatus.CLOSED)).rejects.toThrow(
        'Transición de estado inválida',
      );
    });

    it('lanza error en transición inválida CLOSED → OPEN (regresión)', async () => {
      const current = makeTicketMock({ status: TicketStatus.CLOSED });
      prisma.ticket.findUnique.mockResolvedValue(current as never);

      await expect(service.updateStatus('ticket-uuid-1', TicketStatus.OPEN)).rejects.toThrow(
        'Transición de estado inválida',
      );
    });

    it('lanza error si el ticket no existe', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null as never);

      await expect(service.updateStatus('nonexistent', TicketStatus.IN_PROGRESS)).rejects.toThrow(
        'Ticket no encontrado',
      );
    });
  });
});
