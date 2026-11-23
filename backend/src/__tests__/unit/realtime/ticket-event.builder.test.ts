/**
 * Tests del builder ticket.closed (nuevo evento durable por cierre de ticket).
 */
import { describe, expect, it } from '@jest/globals';
import {
  ConversationRealtimeAction,
  isRealtimeDurableEvent,
} from '../../../services/realtime/realtime-event.contracts';
import { buildTicketClosedEvent } from '../../../services/realtime/ticket-event.builder';

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const CONV_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';

describe('buildTicketClosedEvent', () => {
  it('construye un evento durable ticket.closed válido sobre conversation.updated', () => {
    const event = buildTicketClosedEvent(
      {
        id: TICKET_ID,
        conversationId: CONV_ID,
        assignedUserId: AGENT_ID,
        departmentSlug: 'obras-publicas',
        closedAt: new Date('2024-01-02T03:04:05Z'),
      },
      'close-22222222-2222-4222-8222-222222222222-1234',
      '2024-01-02T03:04:05.000Z',
      'conversations.service.close',
    );

    expect(isRealtimeDurableEvent(event)).toBe(true);
    expect(event.eventType).toBe('ticket.closed');
    expect(event.socketEventName).toBe('conversation.updated');
    expect(event.action).toBe(ConversationRealtimeAction.Close);
    expect(event.source).toBe('conversations.service.close');
    expect(event.conversationId).toBe(CONV_ID);
    expect(event.conversationPatch).toEqual({
      id: CONV_ID,
      status: 'closed',
      updatedAt: '2024-01-02T03:04:05.000Z',
    });
    expect(event.ticketPatch).toEqual({
      id: TICKET_ID,
      status: 'CLOSED',
      assignedUserId: AGENT_ID,
      departmentSlug: 'obras-publicas',
      updatedAt: '2024-01-02T03:04:05.000Z',
    });
    expect(event.inboxPatch).toEqual({
      inboxStatus: 'inactive',
      status: 'closed',
    });
    expect(event.notificationPatch).toEqual({
      type: 'ticket.closed',
      conversationId: CONV_ID,
      ticketId: TICKET_ID,
      departmentSlug: 'obras-publicas',
    });
  });

  it('omite campos opcionales ausentes (sin dueño ni departamento)', () => {
    const event = buildTicketClosedEvent(
      { id: TICKET_ID, conversationId: CONV_ID },
      'corr-1',
      '2024-01-02T03:04:05.000Z',
      'ticket.service',
    );

    expect(event.ticketPatch).toEqual({
      id: TICKET_ID,
      status: 'CLOSED',
      updatedAt: '2024-01-02T03:04:05.000Z',
    });
    expect(event.notificationPatch?.ticketId).toBe(TICKET_ID);
  });

  it('tolera closedAt como string y null', () => {
    const event = buildTicketClosedEvent(
      { id: TICKET_ID, conversationId: CONV_ID, closedAt: null },
      'corr-1',
      '2024-01-02T03:04:05.000Z',
      'ticket.service',
    );

    expect(isRealtimeDurableEvent(event)).toBe(true);
    expect(event.ticketPatch?.updatedAt).toBe('2024-01-02T03:04:05.000Z');
  });
});
