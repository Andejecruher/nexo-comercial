import { useConnectionStore } from '@/store/shared/use-connection-store';
import { useActiveConversationStore } from '@/store/shared/use-active-conversation-store';
import { useNotificationStore } from '@/store/shared/use-notification-store';
import { useSubscriptionStore } from '@/store/shared/use-subscription-store';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventRouter } from '@/lib/shared/realtime/event-router';
import { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { reportTicketLifecycle } from '@/lib/shared/realtime/telemetry';

vi.mock('@/lib/shared/api-client', () => ({
  tryRefreshToken: vi.fn().mockResolvedValue(true),
  apiClient: { get: vi.fn() },
}));

vi.mock('@/lib/shared/realtime/telemetry', () => ({
  reportTicketLifecycle: vi.fn(),
}));

import { apiClient, tryRefreshToken } from '@/lib/shared/api-client';

const mockApiGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const reportTicketLifecycleMock = reportTicketLifecycle as ReturnType<typeof vi.fn>;

/** Row shape of GET /admin/notifications (backend contract). */
interface NotificationRowApi {
  id: string;
  eventId: string;
  type: string;
  conversationId: string | null;
  occurredAt: string;
  contactName?: string;
  phone?: string;
  messagePreview?: string;
}

function buildCatchUpResponse(notifications: NotificationRowApi[]) {
  return { ok: true, data: { success: true, data: { notifications } } };
}

function buildNotificationRow(overrides: Partial<NotificationRowApi> = {}): NotificationRowApi {
  return {
    id: 'row-uuid-1',
    eventId: 'evt-1',
    type: 'message.received',
    conversationId: 'conv-1',
    occurredAt: '2026-06-27T12:00:00.000Z',
    ...overrides,
  };
}

function createMockSocketFactory(): () => Socket {
  return () => createMockSocket() as unknown as Socket;
}

type Listener = (...args: unknown[]) => void;
type ManagerListener = (...args: unknown[]) => void;

interface MockManager {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  trigger: (event: string, ...args: unknown[]) => void;
}

interface MockSocket {
  connected: boolean;
  auth: { token?: string } | ((cb: (data: object) => void) => void);
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  trigger: (event: string, ...args: unknown[]) => void;
  io: MockManager;
}

function createMockSocket(): MockSocket {
  const listeners = new Map<string, Listener>();
  const managerListeners = new Map<string, ManagerListener>();

  return {
    connected: false,
    auth: {},
    connect: vi.fn(() => {
      // connected is toggled via the returned reference in tests
    }),
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
    io: {
      on: vi.fn((event: string, handler: ManagerListener) => {
        managerListeners.set(event, handler);
      }),
      off: vi.fn((event: string) => {
        managerListeners.delete(event);
      }),
      trigger: (event: string, ...args: unknown[]) => {
        const handler = managerListeners.get(event);
        if (handler) handler(...args);
      },
    },
  };
}

describe('RealtimeManager', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });
    useActiveConversationStore.setState({ activeConversationId: undefined });
    useNotificationStore.setState({ notifications: [] });
    useSubscriptionStore.setState({ activeRooms: new Set(), roomReferences: new Map() });
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('vc_user', JSON.stringify({ id: 'test-user' }));
    mockApiGet.mockResolvedValue(buildCatchUpResponse([]));
  });

  it('exposes a router and initializes disconnected', () => {
    const manager = new RealtimeManager(createMockSocketFactory());
    expect(manager.router).toBeInstanceOf(EventRouter);
    expect(manager.getConnectionStatus()).toBe('disconnected');
  });

  it('connect creates the socket and starts connecting', () => {
    const mockSocket = createMockSocket();
    const factory = vi.fn(() => mockSocket as unknown as Socket);
    const manager = new RealtimeManager(factory);

    manager.connect();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().status).toBe('connecting');
  });

  it('does not create a socket without an auth token', () => {
    localStorage.removeItem('vc_access_token');
    const manager = new RealtimeManager();

    manager.connect();

    expect(manager.getSocket()).toBeUndefined();
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('reflects connected status and resets reconnect attempt on socket connect', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    useConnectionStore.setState({ reconnectAttempt: 2 });
    mockSocket.trigger('connect');

    expect(manager.getConnectionStatus()).toBe('connected');
    expect(useConnectionStore.getState().status).toBe('connected');
    expect(useConnectionStore.getState().reconnectAttempt).toBe(0);
    expect(useConnectionStore.getState().lastConnectedAt).toBeDefined();
  });

  it('reflects disconnected status on socket disconnect', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('connect');
    mockSocket.trigger('disconnect');

    expect(manager.getConnectionStatus()).toBe('disconnected');
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('increments reconnect attempt on manager reconnect_attempt', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.io.trigger('reconnect_attempt', 1);
    mockSocket.io.trigger('reconnect_attempt', 2);

    expect(useConnectionStore.getState().reconnectAttempt).toBe(2);
  });

  it('resets reconnect attempt on manager reconnect', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    useConnectionStore.setState({ reconnectAttempt: 3 });
    mockSocket.io.trigger('reconnect');

    expect(useConnectionStore.getState().reconnectAttempt).toBe(0);
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('sets status disconnected on manager reconnect_failed', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('connect');
    mockSocket.io.trigger('reconnect_failed');

    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('subscribes to a room and emits conversation.subscribe', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    manager.subscribe('conv-123');

    expect(useSubscriptionStore.getState().getActiveRooms()).toContain('conv-123');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'conversation.subscribe',
      'conv-123',
      expect.any(Function),
    );
  });

  it('unsubscribes from a room and emits conversation.unsubscribe', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    manager.subscribe('conv-123');
    manager.unsubscribe('conv-123');

    expect(useSubscriptionStore.getState().getActiveRooms()).not.toContain('conv-123');
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation.unsubscribe', 'conv-123');
  });

  it('releases all room subscriptions on disconnect', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    manager.subscribe('conv-123');
    manager.subscribe('conv-456');
    mockSocket.emit.mockClear();

    manager.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation.unsubscribe', 'conv-123');
    expect(mockSocket.emit).toHaveBeenCalledWith('conversation.unsubscribe', 'conv-456');
    expect(useSubscriptionStore.getState().getActiveRooms()).toHaveLength(0);
  });

  it('resubscribes to tracked rooms on reconnect', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    manager.subscribe('conv-123');
    manager.subscribe('conv-456');
    mockSocket.emit.mockClear();

    mockSocket.trigger('connect');

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'conversation.subscribe',
      'conv-123',
      expect.any(Function),
    );
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'conversation.subscribe',
      'conv-456',
      expect.any(Function),
    );
  });

  it('routes conversation events through the router', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();

    manager.router.register({
      id: 'c1',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();
    mockSocket.trigger('conversation.message.new', { conversationId: 'conv-1', text: 'hi' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('writes structured receive/apply logs for durable realtime events', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();

    manager.router.register({
      id: 'c1',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();
    mockSocket.trigger('conversation.message.new', {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-frontend',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: new Date().toISOString(),
      source: 'message.service',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId: '550e8400-e29b-41d4-a716-446655440001',
        body: 'hello',
        createdAt: new Date().toISOString(),
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"component":"RealtimeManager"'));

    infoSpy.mockRestore();
  });

  it('reports fe.received telemetry for ticket lifecycle events', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('conversation.updated', {
      eventId: '550e8400-e29b-41d4-a716-446655440010',
      correlationId: 'corr-ticket',
      schemaVersion: 1,
      eventType: 'ticket.closed',
      socketEventName: 'conversation.updated',
      occurredAt: new Date().toISOString(),
      source: 'conversations.service',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      conversationPatch: { id: '550e8400-e29b-41d4-a716-446655440001', status: 'closed' },
      ticketPatch: { id: '550e8400-e29b-41d4-a716-446655440002', status: 'CLOSED' },
    });

    expect(reportTicketLifecycleMock).toHaveBeenCalledTimes(1);
    expect(reportTicketLifecycleMock.mock.calls[0][0]).toMatchObject({
      eventType: 'ticket.closed',
    });
    expect(reportTicketLifecycleMock.mock.calls[0][1]).toBe('received');
  });

  it('stores notifications immediately and delegates toast delivery to the unified layer', () => {
    const socket = createMockSocket();
    const manager = new RealtimeManager(() => socket as unknown as Socket);
    useActiveConversationStore.getState().setActiveConversation('conv-other');
    manager.connect();
    const received = vi.fn();
    manager.router.register({ id: 'notifier', events: ['NUEVO_MENSAJE'], handler: received });
    socket.trigger('admin.notification', {
      eventId: 'evt-1',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
      contactName: 'Ana',
      messagePreview: 'Hola',
    });
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      eventId: 'evt-1',
      contactName: 'Ana',
      messagePreview: 'Hola',
    });
    expect(received).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('keeps incoming notifications for the active conversation out of secondary notification flows', () => {
    const socket = createMockSocket();
    const manager = new RealtimeManager(() => socket as unknown as Socket);
    const received = vi.fn();
    useActiveConversationStore.getState().setActiveConversation('conv-1');
    manager.router.register({ id: 'notifier', events: ['NUEVO_MENSAJE'], handler: received });

    manager.connect();
    socket.trigger('admin.notification', {
      eventId: 'evt-active',
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(received).not.toHaveBeenCalled();
  });

  it('ignores admin.notification payloads with an unknown type', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('admin.notification', {
      type: 'unknown.type',
      conversationId: 'conv-1',
      occurredAt: new Date().toISOString(),
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('ignores admin.notification payloads with missing fields', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('admin.notification', { conversationId: 'conv-1' });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('does not unsubscribe a shared room until its final consumer leaves', () => {
    const socket = createMockSocket();
    const manager = new RealtimeManager(() => socket as unknown as Socket);
    manager.connect();
    manager.subscribe('shared');
    manager.subscribe('shared');
    manager.unsubscribe('shared');
    expect(socket.emit).not.toHaveBeenCalledWith('conversation.unsubscribe', 'shared');
    manager.unsubscribe('shared');
    expect(socket.emit).toHaveBeenCalledWith('conversation.unsubscribe', 'shared');
    manager.disconnect();
  });

  it('disconnects the socket and clears status', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('connect');
    manager.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(manager.getConnectionStatus()).toBe('disconnected');
  });

  it('onStatusChange notifies when status changes', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const cb = vi.fn();

    const unsubscribe = manager.onStatusChange(cb);
    manager.connect();
    mockSocket.trigger('connect');

    expect(cb).toHaveBeenCalledWith('connecting');
    expect(cb).toHaveBeenCalledWith('connected');

    unsubscribe();
  });

  // ── Auth-aware reconnect tests ────────────────────────────────────────────

  it('calls tryRefreshToken when connect_error is an auth error', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('connect_error', new Error('Invalid auth token'));

    expect(tryRefreshToken).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('does not call tryRefreshToken for non-auth connect_error', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.trigger('connect_error', new Error('Network error'));

    expect(tryRefreshToken).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('reconnects when vc:token-refreshed fires while disconnected', () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = false;
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.connect.mockClear();

    window.dispatchEvent(new CustomEvent('vc:token-refreshed'));

    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect via vc:token-refreshed when already connected', () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = true;
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.connect.mockClear();

    window.dispatchEvent(new CustomEvent('vc:token-refreshed'));

    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  it('reconnects on browser online event while disconnected', () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = false;
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    mockSocket.connect.mockClear();

    window.dispatchEvent(new Event('online'));

    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('removes window listeners after disconnect', () => {
    const mockSocket = createMockSocket();
    mockSocket.connected = false;
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);

    manager.connect();
    manager.disconnect();
    mockSocket.connect.mockClear();

    // Fire events after disconnect — should be no-ops
    window.dispatchEvent(new CustomEvent('vc:token-refreshed'));
    window.dispatchEvent(new Event('online'));

    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  // ── Durable-event dedupe tests ────────────────────────────────────────────

  it('dispatches a durable event the first time it is seen', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();
    const conversationId = '550e8400-e29b-41d4-a716-446655440001';

    manager.router.register({
      id: 'dedupe-consumer',
      conversationId,
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();
    mockSocket.trigger('conversation.message.new', {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-1',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-06-27T12:00:00.000Z',
      source: 'message.service',
      conversationId,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('drops a duplicate durable event with the same eventId', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();
    const conversationId = '550e8400-e29b-41d4-a716-446655440001';

    manager.router.register({
      id: 'dedupe-consumer',
      conversationId,
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();
    const payload = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-1',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-06-27T12:00:00.000Z',
      source: 'message.service',
      conversationId,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    mockSocket.trigger('conversation.message.new', payload);
    mockSocket.trigger('conversation.message.new', payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('allows two different durable eventIds through', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();
    const conversationId = '550e8400-e29b-41d4-a716-446655440001';

    manager.router.register({
      id: 'dedupe-consumer',
      conversationId,
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();

    mockSocket.trigger('conversation.message.new', {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-1',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-06-27T12:00:00.000Z',
      source: 'message.service',
      conversationId,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'first',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    });

    mockSocket.trigger('conversation.message.new', {
      eventId: '550e8400-e29b-41d4-a716-446655440010',
      correlationId: 'corr-2',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-06-27T12:00:01.000Z',
      source: 'message.service',
      conversationId,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440011',
        conversationId,
        body: 'second',
        createdAt: '2026-06-27T12:00:01.000Z',
      },
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe non-durable payloads', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();

    manager.router.register({
      id: 'dedupe-consumer',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();

    const legacyPayload = { conversationId: 'conv-1', text: 'legacy' };
    mockSocket.trigger('conversation.message.new', legacyPayload);
    mockSocket.trigger('conversation.message.new', legacyPayload);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('drops invalid durable-like payloads with unknown eventType', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();
    const conversationId = '550e8400-e29b-41d4-a716-446655440001';

    manager.router.register({
      id: 'dedupe-consumer',
      conversationId,
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();

    mockSocket.trigger('conversation.message.new', {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-1',
      schemaVersion: 1,
      eventType: 'unknown.event',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-06-27T12:00:00.000Z',
      source: 'message.service',
      conversationId,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves event dedupe across reconnect so unread increments are not reapplied', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();
    const conversationId = '550e8400-e29b-41d4-a716-446655440001';

    manager.router.register({
      id: 'dedupe-consumer',
      conversationId,
      events: ['conversation.message.new'],
      handler,
    });

    manager.connect();
    const payload = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'corr-1',
      schemaVersion: 1,
      eventType: 'message.created',
      socketEventName: 'conversation.message.new',
      occurredAt: '2026-06-27T12:00:00.000Z',
      source: 'message.service',
      conversationId,
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId,
        body: 'hello',
        createdAt: '2026-06-27T12:00:00.000Z',
      },
    };

    mockSocket.trigger('conversation.message.new', payload);
    expect(handler).toHaveBeenCalledTimes(1);

    mockSocket.io.trigger('reconnect');
    mockSocket.trigger('conversation.message.new', payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── Notification catch-up tests ─────────────────────────────────────────

  it('paginates offline notifications using a user checkpoint without skipping late events', async () => {
    window.localStorage.setItem('vc_notifications_last_seen:v2:test-user', 'previous');
    mockApiGet
      .mockResolvedValueOnce({
        ok: true,
        data: {
          success: true,
          data: {
            notifications: [buildNotificationRow()],
            hasMore: true,
            nextCursor: 'page-1',
            until: '2026-06-27T13:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          success: true,
          data: {
            notifications: [
              buildNotificationRow({
                id: 'row-2',
                eventId: 'evt-2',
                occurredAt: '2026-06-26T12:00:00.000Z',
              }),
            ],
            hasMore: false,
            checkpoint: 'completed',
          },
        },
      });
    const socket = createMockSocket();
    const manager = new RealtimeManager(() => socket as unknown as Socket);
    manager.connect();
    socket.trigger('connect');
    await vi.waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(2));
    expect(mockApiGet.mock.calls[1][0]).toContain('after=page-1');
    expect(window.localStorage.getItem('vc_notifications_last_seen:v2:test-user')).toBe(
      'completed',
    );
    manager.disconnect();
  });

  it('does not advance the checkpoint after a partial replay failure', async () => {
    window.localStorage.setItem('vc_notifications_last_seen:v2:test-user', 'previous');
    mockApiGet.mockRejectedValueOnce(new Error('offline'));
    const socket = createMockSocket();
    const manager = new RealtimeManager(() => socket as unknown as Socket);
    manager.connect();
    socket.trigger('connect');
    await vi.waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(window.localStorage.getItem('vc_notifications_last_seen:v2:test-user')).toBe('previous');
    manager.disconnect();
  });

  it('drops a duplicate live admin.notification redelivery', () => {
    const mockSocket = createMockSocket();
    const manager = new RealtimeManager(() => mockSocket as unknown as Socket);
    const handler = vi.fn();
    manager.router.register({ id: 'raw-consumer', events: ['admin.notification'], handler });

    manager.connect();

    const payload = {
      type: 'message.received',
      conversationId: 'conv-1',
      occurredAt: '2026-06-27T12:00:00.000Z',
    };
    mockSocket.trigger('admin.notification', payload);
    mockSocket.trigger('admin.notification', payload);

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
