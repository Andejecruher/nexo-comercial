import { useConnectionStore } from '@/store/shared/use-connection-store';
import { useNotificationStore } from '@/store/shared/use-notification-store';
import { useSubscriptionStore } from '@/store/shared/use-subscription-store';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import {
  deriveUserEvents,
  REALTIME_USER_EVENT_CATALOG,
  REALTIME_USER_EVENT_IDS,
  RealtimeUserEvent,
} from '@/lib/shared/realtime/realtime-user-events';

vi.mock('@/lib/shared/api-client', () => ({
  tryRefreshToken: vi.fn().mockResolvedValue(true),
  apiClient: { post: vi.fn() },
}));

// ─── Payload builders ─────────────────────────────────────────────────────────

const CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440001';

function buildDurableEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-1',
    schemaVersion: 1,
    eventType: 'conversation.updated',
    socketEventName: 'conversation.updated',
    occurredAt: '2026-09-27T12:00:00.000Z',
    source: 'conversation.service',
    conversationId: CONVERSATION_ID,
    ...overrides,
  };
}

function buildAdminNotification(overrides: Record<string, unknown> = {}) {
  return {
    type: 'message.received',
    conversationId: CONVERSATION_ID,
    occurredAt: '2026-09-27T12:00:00.000Z',
    ...overrides,
  };
}

// ─── Catalog matcher tests ────────────────────────────────────────────────────

describe('REALTIME_USER_EVENT_CATALOG matchers', () => {
  it('derives NUEVO_TICKET from a durable ticket.created event', () => {
    expect(
      deriveUserEvents('conversation.updated', buildDurableEvent({ eventType: 'ticket.created' })),
    ).toEqual([RealtimeUserEvent.NUEVO_TICKET]);
  });

  it('does not derive NUEVO_TICKET from admin notifications (retired provisional source)', () => {
    expect(deriveUserEvents('admin.notification', buildAdminNotification())).not.toContain(
      RealtimeUserEvent.NUEVO_TICKET,
    );
    expect(
      deriveUserEvents(
        'admin.notification',
        buildAdminNotification({ type: 'conversation.handover' }),
      ),
    ).not.toContain(RealtimeUserEvent.NUEVO_TICKET);
  });

  it('derives CIERRE_TICKET from eventType ticket.closed', () => {
    expect(
      deriveUserEvents('conversation.updated', buildDurableEvent({ eventType: 'ticket.closed' })),
    ).toEqual([RealtimeUserEvent.CIERRE_TICKET]);
  });

  it('derives CIERRE_TICKET from action close', () => {
    expect(
      deriveUserEvents('conversation.updated', buildDurableEvent({ action: 'close' })),
    ).toEqual([RealtimeUserEvent.CIERRE_TICKET]);
  });

  it('derives CIERRE_TICKET from ticketPatch.status CLOSED', () => {
    expect(
      deriveUserEvents(
        'conversation.updated',
        buildDurableEvent({ ticketPatch: { id: CONVERSATION_ID, status: 'CLOSED' } }),
      ),
    ).toEqual([RealtimeUserEvent.CIERRE_TICKET]);
  });

  it('derives CIERRE_TICKET from conversationPatch.status closed', () => {
    expect(
      deriveUserEvents(
        'conversation.updated',
        buildDurableEvent({ conversationPatch: { id: CONVERSATION_ID, status: 'closed' } }),
      ),
    ).toEqual([RealtimeUserEvent.CIERRE_TICKET]);
  });

  it('does not derive CIERRE_TICKET from a plain conversation update', () => {
    expect(deriveUserEvents('conversation.updated', buildDurableEvent())).toEqual([]);
  });

  it('derives TRANSFERENCIA_TICKET from action transfer', () => {
    expect(
      deriveUserEvents('conversation.updated', buildDurableEvent({ action: 'transfer' })),
    ).toEqual([RealtimeUserEvent.TRANSFERENCIA_TICKET]);
  });

  it('derives TRANSFERENCIA_TICKET from a conversation.handover socket event', () => {
    expect(
      deriveUserEvents(
        'conversation.handover',
        buildDurableEvent({
          eventType: 'conversation.handover',
          socketEventName: 'conversation.handover',
        }),
      ),
    ).toEqual([RealtimeUserEvent.TRANSFERENCIA_TICKET]);
  });

  it('does not derive TRANSFERENCIA_TICKET from an assign action', () => {
    expect(
      deriveUserEvents('conversation.updated', buildDurableEvent({ action: 'assign' })),
    ).toEqual([]);
  });

  it('ignores events outside sourceEvents even when the semantics match', () => {
    // 'conversation.typing' is not a source event for any catalog entry.
    expect(deriveUserEvents('conversation.typing', buildDurableEvent({ action: 'close' }))).toEqual(
      [],
    );
  });

  it('ignores non-durable payloads for ticket semantics', () => {
    expect(
      deriveUserEvents('conversation.updated', { conversationId: 'conv-1', action: 'close' }),
    ).toEqual([]);
  });

  it('exposes every catalog id in REALTIME_USER_EVENT_IDS', () => {
    expect(REALTIME_USER_EVENT_IDS).toEqual(Object.keys(REALTIME_USER_EVENT_CATALOG));
  });
});

// ─── RealtimeManager integration ──────────────────────────────────────────────

type Listener = (...args: unknown[]) => void;

interface MockSocket {
  connected: boolean;
  auth: Record<string, unknown>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  trigger: (event: string, ...args: unknown[]) => void;
  io: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    trigger: ReturnType<typeof vi.fn>;
  };
}

function createMockSocket(): MockSocket {
  const listeners = new Map<string, Listener>();

  return {
    connected: false,
    auth: {},
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: Listener) => {
      listeners.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event);
    }),
    trigger: (event: string, ...args: unknown[]) => {
      const handler = listeners.get(event);
      if (handler) handler(...args);
    },
    io: { on: vi.fn(), off: vi.fn(), trigger: vi.fn() },
  };
}

function createManagerWithSocket() {
  const socket = createMockSocket();
  const manager = new RealtimeManager(() => socket as unknown as Socket);
  manager.connect();
  return { socket, manager };
}

describe('RealtimeManager semantic dispatch', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });
    useNotificationStore.setState({ notifications: [] });
    useSubscriptionStore.setState({ activeRooms: new Set() });
    vi.clearAllMocks();
  });

  it('routes admin notifications to raw realtime consumers', () => {
    const { socket, manager } = createManagerWithSocket();
    const handler = vi.fn();

    manager.router.register({
      id: 'admin-notification-consumer',
      events: ['admin.notification'],
      handler,
    });

    const payload = buildAdminNotification();
    socket.trigger('admin.notification', payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('admin.notification', payload);
  });

  it('routes a durable ticket.created to NUEVO_TICKET consumers', () => {
    const { socket, manager } = createManagerWithSocket();
    const handler = vi.fn();

    manager.router.register({
      id: 'semantic-1',
      events: [RealtimeUserEvent.NUEVO_TICKET],
      handler,
    });

    const payload = buildDurableEvent({ eventType: 'ticket.created' });
    socket.trigger('conversation.updated', payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(RealtimeUserEvent.NUEVO_TICKET, payload);
  });

  it('routes a durable close action to CIERRE_TICKET consumers', () => {
    const { socket, manager } = createManagerWithSocket();
    const handler = vi.fn();

    manager.router.register({
      id: 'semantic-1',
      events: [RealtimeUserEvent.CIERRE_TICKET],
      handler,
    });

    socket.trigger('conversation.updated', buildDurableEvent({ eventType: 'ticket.closed' }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('routes a durable handover to TRANSFERENCIA_TICKET consumers', () => {
    const { socket, manager } = createManagerWithSocket();
    const handler = vi.fn();

    manager.router.register({
      id: 'semantic-1',
      events: [RealtimeUserEvent.TRANSFERENCIA_TICKET],
      handler,
    });

    socket.trigger(
      'conversation.handover',
      buildDurableEvent({
        eventType: 'conversation.handover',
        socketEventName: 'conversation.handover',
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('derives semantic events only once per durable eventId (dedup applies)', () => {
    const { socket, manager } = createManagerWithSocket();
    const handler = vi.fn();

    manager.router.register({
      id: 'semantic-1',
      events: [RealtimeUserEvent.CIERRE_TICKET],
      handler,
    });

    const payload = buildDurableEvent({ eventType: 'ticket.closed' });
    socket.trigger('conversation.updated', payload);
    socket.trigger('conversation.updated', payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not derive semantic events from invalid durable-like payloads', () => {
    const { socket, manager } = createManagerWithSocket();
    const handler = vi.fn();

    manager.router.register({
      id: 'semantic-1',
      events: [RealtimeUserEvent.CIERRE_TICKET],
      handler,
    });

    socket.trigger('conversation.updated', buildDurableEvent({ eventType: 'unknown.event' }));

    expect(handler).not.toHaveBeenCalled();
  });
});
