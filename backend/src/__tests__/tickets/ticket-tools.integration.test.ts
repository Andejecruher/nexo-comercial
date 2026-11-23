/**
 * Tests de integración ticket ↔ tools.
 *
 * Cubre:
 * - sendMessage: asocia outbound message al ticket activo
 * - assignDepartment: asegura ticket activo + set departmentSlug
 * - escalateToHuman: ticket.status = IN_PROGRESS
 * - closeConversation: ticket.status = CLOSED
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { TicketService } from '../../services/tickets/ticket.service';
import {
  TicketStatus,
  TicketPriority,
  TicketSource,
  TicketActorType,
} from '../../services/tickets/ticket.types';

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
    $transaction: jest.fn<(fn: unknown) => Promise<unknown>>(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketService — integración con tools', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TicketService;

  beforeEach(() => {
    prisma = makePrismaMock();

    service = new TicketService(prisma as any);
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // sendMessage — asocia outbound message al ticket activo
  // ──────────────────────────────────────────────────────────────────────────

  describe('sendMessage integration: attachMessageToTicket', () => {
    it('asocia mensaje outbound al ticket activo (idempotente)', async () => {
      const ticket = makeTicketMock();
      // findFirst para idempotencia → no existe aún
      prisma.ticketMessage.findFirst.mockResolvedValue(null as never);
      prisma.ticket.findUnique.mockResolvedValue(ticket as never);
      const tm = {
        id: 'tm-1',
        ticketId: 'ticket-uuid-1',
        messageId: 'outbound-msg-1',
        actorType: TicketActorType.BOT,
        createdAt: new Date(),
      };
      prisma.ticketMessage.create.mockResolvedValue(tm as never);

      const result = await service.attachMessageToTicket('ticket-uuid-1', 'outbound-msg-1');

      expect(result.ticketId).toBe('ticket-uuid-1');
      expect(result.messageId).toBe('outbound-msg-1');
    });

    it('no duplica TicketMessage en segundo attach', async () => {
      const existing = {
        id: 'tm-1',
        ticketId: 'ticket-uuid-1',
        messageId: 'outbound-msg-1',
        actorType: TicketActorType.BOT,
        createdAt: new Date(),
      };
      prisma.ticketMessage.findFirst.mockResolvedValue(existing as never);

      const result = await service.attachMessageToTicket('ticket-uuid-1', 'outbound-msg-1');

      expect(result.id).toBe('tm-1');
      expect(prisma.ticketMessage.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // assignDepartment — set departmentSlug en ticket activo
  // ──────────────────────────────────────────────────────────────────────────

  describe('assignDepartment integration: assignTicket', () => {
    it('asigna departmentSlug al ticket activo', async () => {
      const updated = makeTicketMock({ departmentSlug: 'obras-publicas' });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.assignTicket('ticket-uuid-1', {
        departmentSlug: 'obras-publicas',
      });

      expect(result.departmentSlug).toBe('obras-publicas');
    });

    it('getOrCreateActiveTicket retorna ticket existente para assignDepartment', async () => {
      const existing = makeTicketMock();
      prisma.ticket.findFirst.mockResolvedValue(existing as never);

      const result = await service.getOrCreateActiveTicket(CONVERSATION_ID, 'citizen-uuid-1');

      expect(result.ticket.id).toBe('ticket-uuid-1');
      expect(result.created).toBe(false);
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // escalateToHuman — ticket.status = IN_PROGRESS
  // ──────────────────────────────────────────────────────────────────────────

  describe('escalateToHuman integration: updateStatus → IN_PROGRESS', () => {
    it('transiciona ticket a IN_PROGRESS al escalar', async () => {
      const current = makeTicketMock({ status: TicketStatus.OPEN });
      prisma.ticket.findUnique.mockResolvedValue(current as never);
      const updated = makeTicketMock({ status: TicketStatus.IN_PROGRESS });
      prisma.ticket.update.mockResolvedValue(updated as never);

      const result = await service.updateStatus('ticket-uuid-1', TicketStatus.IN_PROGRESS);

      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // closeConversation — ticket.status = CLOSED
  // ──────────────────────────────────────────────────────────────────────────

  describe('closeConversation integration: closeTicket', () => {
    it('cierra el ticket cuando se cierra la conversación', async () => {
      const closed = makeTicketMock({ status: TicketStatus.CLOSED, closedAt: new Date() });
      prisma.ticket.update.mockResolvedValue(closed as never);

      const result = await service.closeTicket('ticket-uuid-1');

      expect(result.status).toBe(TicketStatus.CLOSED);
      expect(result.closedAt).toBeDefined();
    });

    it('getActiveTicketByConversation retorna undefined después del cierre', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null as never);

      const result = await service.getActiveTicketByConversation(CONVERSATION_ID);

      expect(result).toBeUndefined();
    });
  });
});
