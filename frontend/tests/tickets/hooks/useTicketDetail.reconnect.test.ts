import { act, renderHook, waitFor } from '@testing-library/react';
import type { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { useConnectionStore } from '@/store/shared/use-connection-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDetailDto } from '@/lib/shared/conversations-api';
import { useTicketDetail } from '@/hooks/tickets/useTicketDetail';

const mocks = vi.hoisted(() => {
  const callbacks = {
    getById: vi.fn(),
    getMessages: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
  };
  return {
    ...callbacks,
    manager: {
      subscribe: callbacks.subscribe,
      unsubscribe: callbacks.unsubscribe,
      router: { register: callbacks.register, unregister: callbacks.unregister },
    },
  };
});

vi.mock('@/components/shared/providers/realtime-provider', () => ({
  useRealtimeManager: () => mocks.manager as unknown as RealtimeManager,
}));

vi.mock('@/lib/shared/tickets-api', async () => {
  const actual = (await vi.importActual('@/lib/shared/tickets-api')) as {
    ticketsApi: Record<string, unknown>;
  };

  return {
    ...actual,
    ticketsApi: {
      ...actual.ticketsApi,
      getById: (...args: unknown[]) => mocks.getById(...args),
      getMessages: (...args: unknown[]) => mocks.getMessages(...args),
    },
  };
});

const ticketId = '550e8400-e29b-41d4-a716-446655440001';

function buildConversation(): ConversationDetailDto {
  return {
    id: ticketId,
    citizenId: 'citizen-1',
    status: 'open',
    channel: 'whatsapp',
    assignedDept: undefined,
    assignedUserId: undefined,
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:00:00.000Z',
    meta: {
      id: 'meta-1',
      conversationId: ticketId,
      flowState: 'BOT_FLOW',
      version: 1,
      createdAt: '2026-06-27T10:00:00.000Z',
      updatedAt: '2026-06-27T10:00:00.000Z',
    },
    citizen: { id: 'citizen-1', phone: '123', name: 'Ana' },
  };
}

function buildTicket() {
  const conversation = buildConversation();
  return {
    id: 'ticket-1',
    folio: '20260627100000_0000_0001',
    conversationId: conversation.id,
    citizenId: conversation.citizenId,
    citizenName: 'Ana',
    citizenPhone: '123',
    status: 'OPEN',
    priority: 'MEDIUM',
    source: 'WHATSAPP',
    departmentSlug: null,
    assignedUserId: null,
    flowState: 'BOT_FLOW',
    conversationStatus: 'open',
    channel: 'whatsapp',
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:00:00.000Z',
    closedAt: null,
    conversation,
  };
}

describe('useTicketDetail reconnect fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });

    mocks.getById.mockResolvedValue({
      ok: true,
      data: { ticket: buildTicket() },
    });
    mocks.getMessages.mockResolvedValue({
      ok: true,
      data: {
        items: [],
        meta: { hasNextPage: false, nextCursor: undefined },
      },
    });
  });

  it('refetches ticket and messages when socket reconnects after a disconnect', async () => {
    renderHook(() => useTicketDetail(ticketId));

    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(1);
      expect(mocks.getMessages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useConnectionStore.getState().setStatus('connected');
    });

    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(2);
      expect(mocks.getMessages).toHaveBeenCalledTimes(2);
    });
  });

  it('does not run an extra reconnect refetch when mount starts already connected', async () => {
    useConnectionStore.setState({
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });

    renderHook(() => useTicketDetail(ticketId));

    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(1);
      expect(mocks.getMessages).toHaveBeenCalledTimes(1);
    });
  });
  it('keeps messages from another case out of the current ticket thread', async () => {
    const { result } = renderHook(() => useTicketDetail(ticketId));
    await waitFor(() => expect(result.current.ticket).toBeDefined());
    const handler = mocks.register.mock.calls.at(-1)?.[0]?.handler as (
      event: string,
      payload: unknown,
    ) => void;
    const event = {
      eventId: '550e8400-e29b-41d4-a716-446655440010',
      correlationId: 'scope',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-10-13T10:00:00.000Z',
      source: 'test',
      conversationId: ticketId,
      action: 'message',
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440011',
        conversationId: ticketId,
        ticketId: '550e8400-e29b-41d4-a716-446655440099',
        body: 'other case',
        direction: 'inbound',
        createdAt: '2026-10-13T10:00:00.000Z',
      },
    };
    act(() => handler('conversation.message.new', event));
    expect(result.current.messages).toEqual([]);
    act(() =>
      handler('conversation.message.new', {
        ...event,
        messagePatch: { ...event.messagePatch, ticketId, body: 'current case' },
      }),
    );
    expect(result.current.messages.map((message) => message.body)).toEqual(['current case']);
  });

  it('repairs a legacy message without a case id through ticket-scoped REST', async () => {
    renderHook(() => useTicketDetail(ticketId));
    await waitFor(() => expect(mocks.getMessages).toHaveBeenCalledTimes(1));
    const handler = mocks.register.mock.calls.at(-1)?.[0]?.handler as (
      event: string,
      payload: unknown,
    ) => void;
    act(() => handler('conversation.message.new', { conversationId: ticketId }));
    await waitFor(() => expect(mocks.getMessages).toHaveBeenCalledTimes(2));
  });
});
