import { apiClient, tryRefreshToken } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { useActiveConversationStore } from '@/stores/use-active-conversation-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useNotificationStore, type NotificationEntry } from '@/stores/use-notification-store';
import { usePresenceStore } from '@/stores/use-presence-store';
import { useSubscriptionStore } from '@/stores/use-subscription-store';
import { io, type Socket } from 'socket.io-client';
import { EventRouter } from './event-router';
import { deriveUserEvents } from './realtime-user-events';
import { reportTicketLifecycle } from './telemetry';
import {
  isAdminNotificationPayload,
  isDurableEventPayload,
  isPresenceUpdatePayload,
  type ConnectionStatus,
} from './types';

const WS_ENABLED = process.env.NEXT_PUBLIC_WS_ENABLED !== 'false';
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const WS_PATH = process.env.NEXT_PUBLIC_WS_PATH ?? '/socket.io';

const CONVERSATION_EVENTS = [
  'conversation.message.new',
  'conversation.updated',
  'conversation.handover',
  'conversation.typing',
  'conversation.ai.chunk',
  'conversation.ai.done',
  'message.status.changed',
];

const MAX_SEEN_DURABLE_EVENT_IDS = 500;

// Catch-up del centro de notificaciones (docs/notifications-architecture.md §2).
const NOTIFICATIONS_LAST_SEEN_KEY = 'vc_notifications_last_seen';
const NOTIFICATIONS_SEED_LIMIT = 30;

// Error messages sent by socketAuthMiddleware in the backend
const AUTH_ERROR_PATTERNS = ['Invalid auth token', 'Missing auth token', 'Invalid token type'];

function isAuthError(err: Error): boolean {
  return AUTH_ERROR_PATTERNS.some((pattern) => err.message.includes(pattern));
}

function logRealtimeClientEvent(
  level: 'info' | 'warn' | 'error',
  status: string,
  eventName: string,
  payload: unknown,
): void {
  const durable = isDurableEventPayload(payload)
    ? {
        eventId: payload.eventId,
        eventType: payload.eventType,
        correlationId: payload.correlationId,
        conversationId: payload.conversationId,
        socketEventName: payload.socketEventName,
      }
    : {};

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    component: 'RealtimeManager',
    status,
    eventName,
    ...durable,
  });

  if (level === 'error') {
    console.error(entry);
    return;
  }

  if (level === 'warn') {
    console.warn(entry);
    return;
  }

  console.info(entry);
}

type SocketFactory = () => Socket | undefined;

/** Fila del endpoint de catch-up GET /admin/notifications (contracts del backend). */
interface NotificationRowApi {
  id: string;
  eventId: string;
  ticketId?: string;
  createdAt?: string;
  type: string;
  conversationId: string | null;
  occurredAt: string;
  contactName?: string;
  phone?: string;
  messagePreview?: string;
  flowState?: string;
  channel?: string;
  priority?: string;
  departmentSlug?: string;
  assignedUserId?: string;
}

type NotificationsCatchUpResponse = {
  success: true;
  data: {
    notifications: NotificationRowApi[];
    nextCursor?: string;
    checkpoint?: string;
    hasMore?: boolean;
    until?: string;
  };
};

function defaultSocketFactory(): Socket | undefined {
  if (typeof window === 'undefined' || !WS_ENABLED) return undefined;

  // Require a token for initial connection; once the socket exists, the
  // dynamic auth callback reads the freshest token on every reconnect.
  const token = authStorage.getAccessToken();
  if (!token) return undefined;

  return io(`${WS_URL}/admin`, {
    path: WS_PATH,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    timeout: 10000,
    // Dynamic callback: evaluated before every connection attempt (including
    // reconnects) so a refreshed access token is always sent to the server.
    auth: (cb: (data: object) => void) => {
      cb({ token: authStorage.getAccessToken() ?? '' });
    },
  });
}

export class RealtimeManager {
  readonly router = new EventRouter();
  private socket: Socket | undefined;
  private readonly socketFactory: SocketFactory;

  // Bounded LRU tracking of durable eventIds for frontend-side deduplication.
  private conversationVersions = new Map<string, number>();
  private activeUserId: string | undefined;
  private joinTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private seenDurableEventIds = new Set<string>();
  private seenDurableEventIdQueue: string[] = [];

  // Window-level event handlers stored for cleanup
  private _onTokenRefreshed: (() => void) | undefined;
  private _onOnline: (() => void) | undefined;
  private _onVisibilityChange: (() => void) | undefined;

  constructor(socketFactory?: SocketFactory) {
    this.socketFactory = socketFactory ?? defaultSocketFactory;
  }

  connect(): void {
    const userId = authStorage.getUser()?.id;
    if (userId !== this.activeUserId) {
      this.socket?.disconnect();
      this.seenDurableEventIds.clear();
      this.seenDurableEventIdQueue.length = 0;
      this.conversationVersions.clear();
      useNotificationStore.setState({ notifications: [] });
      this.activeUserId = userId;
    }
    if (!this.socket) {
      this.socket = this.socketFactory();
      if (!this.socket) return;
      this.bindSocketEvents();
      this.bindManagerEvents();
    }
    this.unbindWindowEvents();
    this.bindWindowEvents();

    useConnectionStore.getState().setStatus('connecting');
    this.socket.connect();
  }

  disconnect(): void {
    this.unbindWindowEvents();
    for (const timer of this.joinTimers.values()) clearTimeout(timer);
    this.joinTimers.clear();
    const rooms = useSubscriptionStore.getState().getActiveRooms();
    for (const room of rooms) {
      this.socket?.emit('conversation.unsubscribe', room);
    }
    useSubscriptionStore.getState().clearRooms();
    this.socket?.disconnect();
    useConnectionStore.getState().setStatus('disconnected');
  }

  subscribe(conversationId: string): void {
    const alreadySubscribed = useSubscriptionStore.getState().activeRooms.has(conversationId);
    useSubscriptionStore.getState().subscribe(conversationId);
    if (!alreadySubscribed) this.joinConversation(conversationId);
  }

  unsubscribe(conversationId: string): void {
    useSubscriptionStore.getState().unsubscribe(conversationId);
    if (!useSubscriptionStore.getState().activeRooms.has(conversationId)) {
      const timer = this.joinTimers.get(conversationId);
      if (timer) clearTimeout(timer);
      this.joinTimers.delete(conversationId);
      this.socket?.emit('conversation.unsubscribe', conversationId);
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return useConnectionStore.getState().status;
  }

  onStatusChange(cb: (status: ConnectionStatus) => void): () => void {
    cb(this.getConnectionStatus());
    return useConnectionStore.subscribe((state) => cb(state.status));
  }

  getSocket(): Socket | undefined {
    return this.socket;
  }

  private bindSocketEvents(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      useConnectionStore.getState().setStatus('connected');
      this.resubscribeAll();
      void this.catchUpNotifications();
    });

    this.socket.on('disconnect', () => {
      useConnectionStore.getState().setStatus('disconnected');
    });

    this.socket.on('connect_error', (err: Error) => {
      useConnectionStore.getState().setStatus('disconnected');

      if (isAuthError(err)) {
        // Token may be expired. Proactively refresh so the next automatic
        // reconnect attempt (via reconnectionAttempts: Infinity) picks up the
        // new token through the dynamic auth callback. The vc:token-refreshed
        // window event will also trigger an immediate reconnect.
        void tryRefreshToken();
      }
    });

    this.socket.on('admin.notification', (payload: unknown) => {
      if (!isAdminNotificationPayload(payload)) return;

      const entry: NotificationEntry = {
        id: payload.eventId ?? `${payload.conversationId}-${Date.now()}`,
        eventId: payload.eventId,
        ticketId: payload.ticketId,
        type: payload.type,
        conversationId: payload.conversationId,
        occurredAt: payload.occurredAt,
        read: false,
        contactName: payload.contactName,
        phone: payload.phone,
        messagePreview: payload.messagePreview,
        flowState: payload.flowState,
        channel: payload.channel,
        priority: payload.priority,
        departmentSlug: payload.departmentSlug,
        assignedUserId: payload.assignedUserId,
        communicationLineId: payload.communicationLineId,
      };

      // Dedupe por identidad natural: cubre el redelivery at-least-once de
      // Pub/Sub (admin.notification no pasa por el LRU de eventId, que solo
      // protege CONVERSATION_EVENTS) y la carrera contra el catch-up. El
      // duplicado se suprime para TODOS los consumidores: store, toast,
      // dispatch al router (incluida la capa de sonidos) y eventos semánticos.
      if (this.hasEquivalentNotification(entry)) return;

      // Los eventos de la conversación visible ya actualizan el hilo a través
      // de los eventos de conversación. No deben crear trabajo pendiente ni
      // disparar consumidores secundarios (toast, sonido o desktop notification).
      if (useActiveConversationStore.getState().activeConversationId === payload.conversationId)
        return;

      useNotificationStore.getState().addNotification(entry);
      this.router.dispatch('admin.notification', payload);
      this.dispatchUserEvents('admin.notification', payload);
    });

    this.socket.on('presence.update', (payload: unknown) => {
      if (!isPresenceUpdatePayload(payload)) return;
      usePresenceStore.getState().apply(payload.userId, payload.status, payload.ttlMs);
    });

    for (const event of CONVERSATION_EVENTS) {
      this.socket.on(event, (payload: unknown) => {
        logRealtimeClientEvent('info', 'received', event, payload);
        if (this.shouldDropInvalidDurablePayload(payload)) return;
        if (this.trackDurableEventId(payload)) return;
        reportTicketLifecycle(payload, 'received');
        if (isDurableEventPayload(payload) && payload.eventType === 'ticket.created') {
          useNotificationStore.getState().addNotification({
            id: payload.eventId,
            eventId: payload.eventId,
            ticketId: payload.ticketPatch?.id,
            type: 'ticket.created',
            conversationId: payload.conversationId,
            occurredAt: payload.occurredAt,
            read: false,
            contactName: payload.notificationPatch?.contactName,
          });
        }
        let routed = payload;
        if (isDurableEventPayload(payload) && payload.conversationVersion !== undefined) {
          const previous = this.conversationVersions.get(payload.conversationId) ?? -1;
          if (payload.conversationVersion < previous) {
            routed = {
              ...payload,
              conversationPatch: undefined,
              inboxPatch: undefined,
              ticketPatch: undefined,
            };
          } else {
            this.conversationVersions.set(payload.conversationId, payload.conversationVersion);
            if (this.conversationVersions.size > 1000)
              this.conversationVersions.delete(this.conversationVersions.keys().next().value!);
          }
        }
        this.router.dispatch(event, routed);
        this.dispatchUserEvents(event, payload);
        logRealtimeClientEvent('info', 'dispatched', event, payload);
      });
    }
  }

  private bindManagerEvents(): void {
    if (!this.socket) return;

    this.socket.io.on('reconnect_attempt', () => {
      useConnectionStore.getState().incrementReconnect();
    });

    this.socket.io.on('reconnect', () => {
      useConnectionStore.getState().setStatus('connected');
    });

    this.socket.io.on('reconnect_error', () => {
      useConnectionStore.getState().setStatus('disconnected');
    });

    this.socket.io.on('reconnect_failed', () => {
      useConnectionStore.getState().setStatus('disconnected');
    });
  }

  /**
   * Registers window-level listeners that trigger a reconnect when:
   * - A token refresh completes (vc:token-refreshed custom event)
   * - The browser comes back online
   * - The tab regains visibility after being hidden
   *
   * Called once when the socket is first created.
   */
  private bindWindowEvents(): void {
    if (typeof window === 'undefined') return;

    this._onTokenRefreshed = () => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    };

    this._onOnline = () => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    };

    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    };

    window.addEventListener('vc:token-refreshed', this._onTokenRefreshed);
    window.addEventListener('online', this._onOnline);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  /** Removes window-level listeners added by bindWindowEvents. */
  private unbindWindowEvents(): void {
    if (typeof window === 'undefined') return;
    if (this._onTokenRefreshed) {
      window.removeEventListener('vc:token-refreshed', this._onTokenRefreshed);
      this._onTokenRefreshed = undefined;
    }
    if (this._onOnline) {
      window.removeEventListener('online', this._onOnline);
      this._onOnline = undefined;
    }
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      this._onVisibilityChange = undefined;
    }
  }

  getConversationVersion(conversationId: string): number {
    return this.conversationVersions.get(conversationId) ?? -1;
  }

  private joinConversation(conversationId: string): void {
    if (!this.socket) return;
    const previous = this.joinTimers.get(conversationId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.joinTimers.delete(conversationId);
      if (this.socket?.connected && useSubscriptionStore.getState().activeRooms.has(conversationId))
        this.joinConversation(conversationId);
    }, 3000);
    this.joinTimers.set(conversationId, timer);
    this.socket.emit('conversation.subscribe', conversationId, (response: { ok: boolean }) => {
      if (this.joinTimers.get(conversationId) !== timer) return;
      clearTimeout(timer);
      this.joinTimers.delete(conversationId);
      if (response?.ok && useSubscriptionStore.getState().activeRooms.has(conversationId))
        this.router.dispatch('conversation.subscribed', { conversationId });
    });
  }

  private resubscribeAll(): void {
    const rooms = useSubscriptionStore.getState().getActiveRooms();
    for (const room of rooms) {
      this.joinConversation(room);
    }
  }

  /**
   * Catch-up del centro de notificaciones: al (re)conectar recupera lo que
   * llegó mientras el socket estuvo caído. Sin marca `lastSeen` (primera vez
   * o tras un refresh) hace un seed reciente SIN toasts; con marca, pide el
   * delta desde `lastSeen` y avisa con toasts (mensajes que el usuario no vio).
   */
  private async catchUpNotifications(): Promise<void> {
    if (typeof window === 'undefined') return;
    const userId = authStorage.getUser()?.id;
    if (!userId) return;
    const storageKey = NOTIFICATIONS_LAST_SEEN_KEY + ':v2:' + userId;
    try {
      const saved = window.localStorage.getItem(storageKey) ?? undefined;
      let after: string | undefined;
      let until: string | undefined;
      let more = true;
      while (more) {
        const query = new URLSearchParams({
          replay: '1',
          limit: saved ? '100' : String(NOTIFICATIONS_SEED_LIMIT),
        });
        if (saved) query.set('cursor', saved);
        if (after) query.set('after', after);
        if (until) query.set('until', until);
        const res = await apiClient.get<NotificationsCatchUpResponse>(
          '/admin/notifications?' + query.toString(),
        );
        if (!res.ok || authStorage.getUser()?.id !== userId) return;
        const data = res.data.data;
        for (const row of data.notifications) {
          const entry = this.notificationRowToEntry(row);
          if (this.hasEquivalentNotification(entry)) continue;
          useNotificationStore.getState().addNotification(entry);
          if (saved) {
            if (entry.type === 'message.received' || entry.type === 'conversation.handover')
              this.dispatchUserEvents('admin.notification', entry);
            else if (entry.type === 'ticket.created')
              this.router.dispatch('NUEVO_TICKET', {
                ...entry,
                eventType: entry.type,
                notificationPatch: entry,
                ticketPatch: entry.ticketId ? { id: entry.ticketId } : undefined,
              });
          }
        }
        more = data.hasMore === true;
        if (more) {
          if (!data.nextCursor || data.nextCursor === after) return;
          after = data.nextCursor;
          until = data.until;
        } else if (data.checkpoint) {
          window.localStorage.setItem(storageKey, data.checkpoint);
        }
      }
    } catch {
      /* Retry from the old checkpoint on the next reconnect. */
    }
  }

  /**
   * Clave de identidad natural de una notificación: tipo + conversación +
   * instante (epoch ms). Se usa el valor parseado (no el string crudo) porque
   * el backend serializa row.occurredAt con toISOString (".000Z") mientras el
   * payload live trae el string crudo del evento durable — Date.parse
   * normaliza ambos al mismo instante. Si Date.parse devuelve NaN, se cae al
   * string crudo dentro de la clave.
   *
   * Limitación conocida: dos eventos distintos con el mismo tipo +
   * conversationId + occurredAt al mismo milisegundo colisionarían. Aceptable
   * porque el orderingKey de Pub/Sub serializa los eventos por conversación.
   */
  private notificationIdentityKey(entry: NotificationEntry): string {
    const parsed = Date.parse(entry.occurredAt);
    const instant = Number.isNaN(parsed) ? entry.occurredAt : parsed;
    return `${entry.type}|${entry.conversationId}|${instant}`;
  }

  /**
   * Indica si ya existe en el store una notificación equivalente (misma clave
   * de identidad natural). Lee el estado VIGENTE del store (no un snapshot)
   * para cerrar ambas direcciones de la carrera live↔catch-up y sobrevivir a
   * entradas agregadas a mitad del loop del catch-up.
   */
  private hasEquivalentNotification(entry: NotificationEntry): boolean {
    const key = this.notificationIdentityKey(entry);
    return useNotificationStore
      .getState()
      .notifications.some((n) =>
        entry.eventId && n.eventId
          ? n.eventId === entry.eventId
          : this.notificationIdentityKey(n) === key,
      );
  }

  private notificationRowToEntry(row: NotificationRowApi): NotificationEntry {
    return {
      id: row.id,
      eventId: row.eventId,
      ticketId: row.ticketId,
      type: row.type,
      conversationId: row.conversationId ?? '',
      occurredAt: row.occurredAt,
      read: false,
      contactName: row.contactName,
      phone: row.phone,
      messagePreview: row.messagePreview,
      flowState: row.flowState,
      channel: row.channel,
      priority: row.priority,
      departmentSlug: row.departmentSlug,
      assignedUserId: row.assignedUserId,
    };
  }

  /**
   * Derives semantic user events (NUEVO_TICKET, CIERRE_TICKET, ...) from a raw
   * socket event and fans them out through the router under their semantic
   * names. Raw-event consumers are untouched; derivation runs AFTER validation
   * and dedup so semantic consumers never see duplicates.
   */
  private dispatchUserEvents(event: string, payload: unknown): void {
    for (const userEventId of deriveUserEvents(event, payload)) {
      this.router.dispatch(userEventId, payload);
      logRealtimeClientEvent('info', 'dispatched', userEventId, payload);
    }
  }

  /**
   * Tracks a durable eventId and returns `true` when the event is a duplicate
   * and should be dropped. Non-durable payloads are ignored and never deduped.
   */
  private trackDurableEventId(payload: unknown): boolean {
    if (!isDurableEventPayload(payload)) return false;

    const { eventId } = payload;
    if (this.seenDurableEventIds.has(eventId)) {
      logRealtimeClientEvent('warn', 'deduped', payload.socketEventName, payload);
      return true;
    }

    this.seenDurableEventIds.add(eventId);
    this.seenDurableEventIdQueue.push(eventId);

    while (this.seenDurableEventIdQueue.length > MAX_SEEN_DURABLE_EVENT_IDS) {
      const oldest = this.seenDurableEventIdQueue.shift();
      if (oldest) this.seenDurableEventIds.delete(oldest);
    }

    return false;
  }

  private shouldDropInvalidDurablePayload(payload: unknown): boolean {
    if (!this.looksLikeDurableEnvelope(payload)) return false;
    if (isDurableEventPayload(payload)) return false;

    logRealtimeClientEvent('warn', 'dropped_invalid_payload', 'unknown', payload);
    return true;
  }

  private looksLikeDurableEnvelope(payload: unknown): payload is Record<string, unknown> {
    if (typeof payload !== 'object' || payload === null) return false;

    return (
      'eventId' in payload &&
      'correlationId' in payload &&
      'schemaVersion' in payload &&
      'socketEventName' in payload &&
      'occurredAt' in payload &&
      'source' in payload &&
      'conversationId' in payload
    );
  }
}
