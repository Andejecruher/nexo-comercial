/**
 * Test del cierre durable de ticket: closeTicket emite ticket.closed vía outbox
 * en la misma transacción cuando el modo realtime está habilitado, y conserva la
 * ruta legacy (única actualización + log) cuando no lo está.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  RealtimeNotifier,
  type RealtimePrismaTransactionClient,
} from '../../../services/realtime/realtime-notifier.service';
import { TicketService } from '../../../services/tickets/ticket.service';
import { TicketPriority, TicketSource, TicketStatus } from '../../../services/tickets/ticket.types';

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeClosedTicket() {
  return {
    id: 'ticket-uuid-1',
    conversationId: 'conv-uuid-1',
    citizenId: 'citizen-uuid-1',
    status: TicketStatus.CLOSED,
    priority: TicketPriority.MEDIUM,
    source: TicketSource.WHATSAPP,
    title: null,
    description: null,
    departmentSlug: null,
    assignedUserId: 'agent-uuid-1',
    closeReason: 'resolved',
    closeSummary: null,
    escalationReason: null,
    closedAt: new Date('2024-01-02T03:04:05Z'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02T03:04:05Z'),
  } as never;
}

function makeDurableHarness() {
  const tx = {
    ticket: { update: asyncMock<Record<string, unknown>>() },
    conversation: {
      updateMany: asyncMock<Record<string, unknown>>(),
      update: asyncMock<Record<string, unknown>>(),
    },
    realtimeOutboxEvent: {
      create: jest.fn<RealtimePrismaTransactionClient['realtimeOutboxEvent']['create']>(),
    },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const notifier = new RealtimeNotifier(undefined, true, {});
  return { tx, prisma, notifier };
}

describe('TicketService.closeTicket (modo durable)', () => {
  let service: TicketService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emite ticket.closed dentro de la misma transacción cuando realtime está habilitado', async () => {
    const { tx, prisma, notifier } = makeDurableHarness();
    tx.ticket.update.mockResolvedValue(makeClosedTicket());
    tx.realtimeOutboxEvent.create.mockResolvedValue({ id: 'outbox-1' });
    service = new TicketService(prisma, notifier, prisma);

    const result = await service.closeTicket('ticket-uuid-1', { reason: 'resolved' });

    expect(result.id).toBe('ticket-uuid-1');
    expect(tx.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-uuid-1' },
      data: expect.objectContaining({ status: TicketStatus.CLOSED }),
    });

    // El outbox (RealtimeNotifier real) escribe el evento en el MISMO tx que el update.
    expect(tx.realtimeOutboxEvent.create).toHaveBeenCalledTimes(1);
    const outboxArg = tx.realtimeOutboxEvent.create.mock.calls[0][0];
    expect(outboxArg.data.eventType).toBe('ticket.closed');
    expect(outboxArg.data.socketEventName).toBe('conversation.updated');
    const payload = outboxArg.data.payload as {
      conversationId: string;
      ticketPatch: { id: string; status: string };
      inboxPatch: { inboxStatus: string };
    };
    expect(payload.conversationId).toBe('conv-uuid-1');
    expect(payload.ticketPatch).toMatchObject({ id: 'ticket-uuid-1', status: 'CLOSED' });
    expect(payload.inboxPatch).toMatchObject({ inboxStatus: 'inactive' });
  });

  it('conserva la ruta legacy (sin outbox) cuando realtime está deshabilitado', async () => {
    const prisma: any = {
      ticket: { update: asyncMock<Record<string, unknown>>() },
      conversation: { update: asyncMock<Record<string, unknown>>() },
      realtimeOutboxEvent: { create: asyncMock<Record<string, unknown>>() },
    };
    prisma.ticket.update.mockResolvedValue(makeClosedTicket());
    const notifier = new RealtimeNotifier(undefined, false, {});
    service = new TicketService(prisma, notifier);

    const result = await service.closeTicket('ticket-uuid-1', { reason: 'resolved' });

    expect(result.id).toBe('ticket-uuid-1');
    expect(prisma.realtimeOutboxEvent.create).not.toHaveBeenCalled();
  });
});
