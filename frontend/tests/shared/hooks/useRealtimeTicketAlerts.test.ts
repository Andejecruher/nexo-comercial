import type { RealtimeUserEventPayload } from '@/lib/shared/realtime/realtime-user-events';
import { RealtimeUserEvent } from '@/lib/shared/realtime/realtime-user-events';
import { getMockRouter, setMockPathname } from '@/tests/shared/utils/next-navigation';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useRealtimeTicketAlerts } from '@/hooks/shared/useRealtimeTicketAlerts';

const captured = vi.hoisted(() => ({
  handlers: {} as Record<string, (payload: RealtimeUserEventPayload) => void>,
}));

vi.mock('@/hooks/shared/useRealtimeUserEvent', () => ({
  useRealtimeUserEvent: (eventId: string, handler: (payload: RealtimeUserEventPayload) => void) => {
    captured.handlers[eventId] = handler;
  },
}));

const TICKET_ID = '550e8400-e29b-41d4-a716-446655440001';
const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440002';

function dispatch(eventId: RealtimeUserEventId, payload: RealtimeUserEventPayload) {
  act(() => {
    captured.handlers[eventId]?.(payload);
  });
}

function ticketLifecycle(eventType: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440020',
    correlationId: 'corr-1',
    schemaVersion: 1,
    eventType,
    socketEventName: 'conversation.updated',
    occurredAt: '2026-10-07T20:00:00.000Z',
    source: 'conversations.service',
    conversationId: CONVERSATION_ID,
    ...overrides,
  } as unknown as RealtimeUserEventPayload;
}

type RealtimeUserEventId = (typeof RealtimeUserEvent)[keyof typeof RealtimeUserEvent];

describe('useRealtimeTicketAlerts', () => {
  beforeEach(() => {
    setMockPathname('/');
    getMockRouter().push.mockReset();
    captured.handlers = {};
  });

  it('shows a transient toast for a new ticket with the contact name', () => {
    renderHook(() => useRealtimeTicketAlerts());

    dispatch(RealtimeUserEvent.NUEVO_TICKET, {
      ...ticketLifecycle('ticket.created'),
      notificationPatch: {
        type: 'ticket.created',
        conversationId: CONVERSATION_ID,
        contactName: 'María',
      },
    });

    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
      'Nuevo ticket recibido',
      expect.objectContaining({
        id: `ticket-open-${CONVERSATION_ID}`,
        duration: 6000,
        description: 'María inició una nueva conversación.',
      }),
    );
  });

  it('shows a sticky toast for a ticket closure', () => {
    renderHook(() => useRealtimeTicketAlerts());

    dispatch(
      RealtimeUserEvent.CIERRE_TICKET,
      ticketLifecycle('ticket.closed', {
        conversationPatch: { id: CONVERSATION_ID, status: 'closed' },
      }),
    );

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Ticket cerrado',
      expect.objectContaining({
        id: `ticket-close-${CONVERSATION_ID}`,
        duration: Infinity,
        action: expect.objectContaining({ label: 'Ver ticket' }),
      }),
    );
  });

  it('shows a sticky toast naming the destination department for a handover', () => {
    renderHook(() => useRealtimeTicketAlerts());

    dispatch(
      RealtimeUserEvent.TRANSFERENCIA_TICKET,
      ticketLifecycle('conversation.handover', {
        socketEventName: 'conversation.handover',
        action: 'handover',
        conversationPatch: {
          id: CONVERSATION_ID,
          flowState: 'DEPARTMENT_ROUTING',
          assignedDept: 'sociales',
        },
      }),
    );

    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      'Ticket asignado al departamento sociales',
      expect.objectContaining({
        id: `ticket-transfer-${CONVERSATION_ID}`,
        duration: Infinity,
      }),
    );
  });

  it('does not alert when already viewing the affected ticket', () => {
    setMockPathname(`/admin/tickets/${TICKET_ID}`);
    renderHook(() => useRealtimeTicketAlerts());

    dispatch(
      RealtimeUserEvent.CIERRE_TICKET,
      ticketLifecycle('ticket.closed', { conversationId: TICKET_ID }),
    );
    dispatch(
      RealtimeUserEvent.TRANSFERENCIA_TICKET,
      ticketLifecycle('conversation.handover', { conversationId: TICKET_ID }),
    );

    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
  });

  it('updates the same sticky toast id when the same ticket is re-alerted', () => {
    renderHook(() => useRealtimeTicketAlerts());

    dispatch(
      RealtimeUserEvent.CIERRE_TICKET,
      ticketLifecycle('ticket.closed', { conversationId: TICKET_ID }),
    );
    dispatch(
      RealtimeUserEvent.CIERRE_TICKET,
      ticketLifecycle('ticket.closed', { conversationId: TICKET_ID }),
    );

    expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(toast.success).mock.calls;
    expect(calls[0][1]).toEqual(expect.objectContaining({ id: `ticket-close-${TICKET_ID}` }));
    expect(calls[1][1]).toEqual(expect.objectContaining({ id: `ticket-close-${TICKET_ID}` }));
  });

  it('navigates to the ticket detail when the action is clicked', () => {
    renderHook(() => useRealtimeTicketAlerts());

    dispatch(
      RealtimeUserEvent.NUEVO_TICKET,
      ticketLifecycle('ticket.created', { conversationId: TICKET_ID }),
    );

    const options = vi.mocked(toast.info).mock.calls[0][1] as unknown as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    expect(getMockRouter().push).toHaveBeenCalledWith(`/admin/tickets/${TICKET_ID}`);
  });
});
