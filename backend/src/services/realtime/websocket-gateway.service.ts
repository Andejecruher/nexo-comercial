import { PubSub } from '@google-cloud/pubsub';
import { createAdapter } from '@socket.io/gcp-pubsub-adapter';
import { Server as HttpServer } from 'http';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../../utils/token.util';
import {
  ConversationHandoverEvent,
  ConversationTypingEvent,
  ConversationUpdatedEvent,
  MessageCreatedEvent,
  MessageReceivedEvent,
  eventBus,
} from '../events/event-bus.service';
import { AIStreamChunkPubSubEvent, AIStreamDonePubSubEvent } from './ai-stream-pubsub.service';
import {
  RealtimeDurableEvent,
  RealtimeEphemeralEvent,
  SocketEventName,
  isRealtimeDurableEvent,
} from './realtime-event.contracts';
import {
  logRealtimeBoundary,
  noopRealtimeMetrics,
  type RealtimeMetrics,
} from './realtime-observability.service';

const ADMIN_NAMESPACE = '/admin';
const PRESENCE_TTL_MS = 30_000;
const PRESENCE_HEARTBEAT_MS = 20_000;

type AdminSocketData = {
  userId: string;
  email: string;
  roles: string[];
};

export type SubscribeAuthorizer = (
  user: AdminSocketData,
  conversationId: string,
) => Promise<boolean>;

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function extractBearerToken(socket: Socket): string | undefined {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken.trim().replace(/^Bearer\s+/i, '');
  }

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim().length === 0) {
    return undefined;
  }
  if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
    return queryToken.trim().replace(/^Bearer\s+/i, '');
  }

  return undefined;
}

function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const token = extractBearerToken(socket);
  if (!token) {
    next(new Error('Missing auth token'));
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    if (decoded.type !== 'access') {
      next(new Error('Invalid token type'));
      return;
    }

    socket.data.user = {
      userId: decoded.sub,
      email: decoded.email,
      roles: decoded.roles,
    } satisfies AdminSocketData;

    next();
  } catch {
    next(new Error('Invalid auth token'));
  }
}

export class WebsocketGatewayService {
  private readonly io: SocketIOServer;
  private readonly legacyCriticalEventBusBridgeEnabled: boolean;
  private readonly authorizeSubscribe?: SubscribeAuthorizer;
  private readonly metrics: RealtimeMetrics;
  private readonly connectedUsers = new Map<string, number>();
  private presenceHeartbeat?: NodeJS.Timeout;

  private readonly onMessageReceived = (payload: MessageReceivedEvent): void => {
    this.emitAdminNotification({
      type: 'message.received',
      conversationId: payload.conversationId,
      occurredAt: new Date().toISOString(),
    });
  };

  private readonly onMessageCreated = (payload: MessageCreatedEvent): void => {
    this.io
      .of(ADMIN_NAMESPACE)
      .to(conversationRoom(payload.conversationId))
      .emit('conversation.message.new', payload);
  };

  private readonly onConversationUpdated = (payload: ConversationUpdatedEvent): void => {
    this.emitConversationEvent('conversation.updated', payload);
  };

  private readonly onConversationHandover = (payload: ConversationHandoverEvent): void => {
    this.emitConversationEvent('conversation.handover', payload);
    this.emitAdminNotification({
      type: 'conversation.handover',
      conversationId: payload.conversationId,
      occurredAt: new Date().toISOString(),
    });
  };

  private readonly onConversationTyping = (payload: ConversationTypingEvent): void => {
    this.io
      .of(ADMIN_NAMESPACE)
      .to(conversationRoom(payload.conversationId))
      .emit('conversation.typing', payload);
  };

  /**
   * Puente legacy para cambios de status de entrega. El webhook emite el
   * envelope durable por el bus cuando `REALTIME_DURABLE_ENABLED=false`; se
   * reusa `emitRealtimeEvent` para enrutar a la room con la misma lógica,
   * métricas y logs que el path durable.
   */
  private readonly onMessageStatusChanged = (event: RealtimeDurableEvent): void => {
    if (!isRealtimeDurableEvent(event)) return;
    this.emitRealtimeEvent(event);
  };

  /** Mutación de un mensaje existente (p. ej. reacción). Mismo routing que el status. */
  private readonly onMessageUpdated = (event: RealtimeDurableEvent): void => {
    if (!isRealtimeDurableEvent(event)) return;
    this.emitRealtimeEvent(event);
  };

  constructor(
    io: SocketIOServer,
    options: {
      legacyCriticalEventBusBridgeEnabled?: boolean;
      authorizeSubscribe?: SubscribeAuthorizer;
      metrics?: RealtimeMetrics;
    } = {},
  ) {
    this.io = io;
    this.legacyCriticalEventBusBridgeEnabled = options.legacyCriticalEventBusBridgeEnabled ?? false;
    this.authorizeSubscribe = options.authorizeSubscribe;
    this.metrics = options.metrics ?? noopRealtimeMetrics;
    this.configureNamespace();
    this.bindEventBus();
  }

  private configureNamespace(): void {
    const adminNamespace = this.io.of(ADMIN_NAMESPACE);
    adminNamespace.use(socketAuthMiddleware);

    adminNamespace.on('connection', (socket) => {
      const user = socket.data.user as AdminSocketData | undefined;
      if (!user) {
        socket.disconnect(true);
        return;
      }

      void socket.join(userRoom(user.userId));
      this.trackUserConnection(user.userId, 1);

      socket.on(
        'conversation.subscribe',
        (
          conversationId: unknown,
          ack?: (result: { ok: boolean; conversationId?: string; error?: string }) => void,
        ) => {
          void this.handleSubscribe(socket, user, conversationId)
            .then((ok) =>
              ack?.({
                ok,
                conversationId: typeof conversationId === 'string' ? conversationId : undefined,
              }),
            )
            .catch(() => ack?.({ ok: false, error: 'subscribe_failed' }));
        },
      );

      socket.on('conversation.unsubscribe', (conversationId: unknown) => {
        if (typeof conversationId !== 'string' || conversationId.trim().length === 0) return;
        void socket.leave(conversationRoom(conversationId));
      });

      socket.on('disconnect', () => {
        this.trackUserConnection(user.userId, -1);
      });

      socket.emit('socket.ready', {
        connectedAt: new Date().toISOString(),
        userId: user.userId,
      });
    });
  }

  private async handleSubscribe(
    socket: Socket,
    user: AdminSocketData,
    conversationId: unknown,
  ): Promise<boolean> {
    if (typeof conversationId !== 'string' || conversationId.trim().length === 0) return false;

    if (this.authorizeSubscribe) {
      const allowed = await this.authorizeSubscribe(user, conversationId);
      if (!allowed) {
        this.metrics.incrementCounter('socket_subscribe_denied', {
          status: 'denied',
        });
        this.metrics.incrementCounter('gateway_discarded', {
          socketEventName: 'conversation.subscribe',
          status: 'denied',
        });
        socket.emit('conversation.subscribe.denied', { conversationId });
        return false;
      }
    }

    await socket.join(conversationRoom(conversationId));
    return true;
  }

  private trackUserConnection(userId: string, delta: 1 | -1): void {
    const next = (this.connectedUsers.get(userId) ?? 0) + delta;
    if (next <= 0) {
      this.connectedUsers.delete(userId);
      this.emitPresence(userId, 'offline');
      return;
    }
    this.connectedUsers.set(userId, next);
    if (delta > 0 && next === 1) {
      this.emitPresence(userId, 'online');
    }
  }

  startPresenceHeartbeat(): void {
    this.presenceHeartbeat = setInterval(() => {
      for (const userId of this.connectedUsers.keys()) {
        this.emitPresence(userId, 'online');
      }
    }, PRESENCE_HEARTBEAT_MS);
    this.presenceHeartbeat.unref();
  }

  private emitPresence(userId: string, status: 'online' | 'offline'): void {
    this.io.of(ADMIN_NAMESPACE).emit(SocketEventName.PresenceUpdate, {
      userId,
      status,
      ttlMs: PRESENCE_TTL_MS,
      occurredAt: new Date().toISOString(),
    });
  }

  private bindEventBus(): void {
    if (this.legacyCriticalEventBusBridgeEnabled) {
      eventBus.on('message.received', this.onMessageReceived);
      eventBus.on('message.created', this.onMessageCreated);
      eventBus.on('conversation.updated', this.onConversationUpdated);
      eventBus.on('conversation.handover', this.onConversationHandover);
      eventBus.on('message.status.changed', this.onMessageStatusChanged);
      eventBus.on('message.updated', this.onMessageUpdated);
    }
    eventBus.on('conversation.typing', this.onConversationTyping);
  }

  private emitAdminNotification(payload: {
    type: 'message.received' | 'conversation.handover';
    eventId?: string;
    ticketId?: string;
    conversationId: string;
    occurredAt: string;
    contactName?: string;
    phone?: string;
    messagePreview?: string;
    flowState?: string;
    channel?: string;
    priority?: string;
    departmentSlug?: string;
    assignedUserId?: string;
    /** UUID interno de la línea receptora (communication_lines.id). */
    communicationLineId?: string;
  }): void {
    this.io.of(ADMIN_NAMESPACE).emit('admin.notification', payload);
  }

  private emitConversationEvent<T extends object>(
    eventName: 'conversation.message.new' | 'conversation.updated' | 'conversation.handover',
    payload: T,
  ): void {
    const namespace = this.io.of(ADMIN_NAMESPACE);
    namespace.emit(eventName, payload);
  }

  emitAiStreamChunk(payload: AIStreamChunkPubSubEvent): void {
    this.io
      .of(ADMIN_NAMESPACE)
      .to(conversationRoom(payload.conversationId))
      .emit('conversation.ai.chunk', payload);
  }

  emitAiStreamDone(payload: AIStreamDonePubSubEvent): void {
    this.io
      .of(ADMIN_NAMESPACE)
      .to(conversationRoom(payload.conversationId))
      .emit('conversation.ai.done', payload);
  }

  /**
   * Emits a validated realtime event (durable or ephemeral) through the correct
   * Socket.IO room/namespace. Preserves existing frontend event names.
   */
  emitRealtimeEvent(event: RealtimeDurableEvent | RealtimeEphemeralEvent): void {
    const occurredAt = isRealtimeDurableEvent(event) ? Date.parse(event.occurredAt) : Number.NaN;
    if (Number.isFinite(occurredAt)) {
      this.metrics.observeHistogram('gateway_emit_latency_ms', Date.now() - occurredAt, {
        eventType: event.eventType,
        socketEventName: event.socketEventName,
      });
    }
    this.metrics.incrementCounter('gateway_emit', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'emitted',
    });
    logRealtimeBoundary('info', 'WebsocketGatewayService', 'gateway.emit', {
      status: 'received',
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      eventId: isRealtimeDurableEvent(event) ? event.eventId : undefined,
      correlationId: isRealtimeDurableEvent(event) ? event.correlationId : undefined,
      conversationId: isRealtimeDurableEvent(event)
        ? event.conversationId
        : (event.payload?.conversationId as string | undefined),
    });

    if (isRealtimeDurableEvent(event)) {
      this.emitDurableEvent(event);
      return;
    }

    this.emitEphemeralEvent(event);
  }

  private emitDurableEvent(event: RealtimeDurableEvent): void {
    const namespace = this.io.of(ADMIN_NAMESPACE);
    const assignedUserId =
      event.inboxPatch?.assignedUserId ??
      event.conversationPatch?.assignedUserId ??
      event.notificationPatch?.assignedUserId;

    switch (event.socketEventName) {
      case SocketEventName.ConversationMessageNew:
        namespace.to(conversationRoom(event.conversationId)).emit(event.socketEventName, event);
        if (event.messagePatch?.direction === 'inbound') {
          this.emitAdminNotification({
            type: 'message.received',
            eventId: event.eventId,
            ticketId: event.notificationPatch?.ticketId,
            conversationId: event.conversationId,
            occurredAt: event.occurredAt,
            contactName: event.notificationPatch?.contactName,
            phone: event.notificationPatch?.phone,
            messagePreview: event.notificationPatch?.messagePreview,
            flowState: event.notificationPatch?.flowState,
            channel: event.notificationPatch?.channel,
            priority: event.notificationPatch?.priority,
            departmentSlug: event.notificationPatch?.departmentSlug,
            assignedUserId: event.notificationPatch?.assignedUserId,
            communicationLineId:
              event.notificationPatch?.communicationLineId ?? event.communicationLineId,
          });
        }
        break;

      case SocketEventName.ConversationHandover:
        namespace.emit(event.socketEventName, event);
        if (typeof assignedUserId === 'string' && assignedUserId.length > 0) {
          namespace.to(userRoom(assignedUserId)).emit(event.socketEventName, event);
        }
        this.emitAdminNotification({
          type: 'conversation.handover',
          conversationId: event.conversationId,
          occurredAt: new Date().toISOString(),
          departmentSlug:
            event.notificationPatch?.departmentSlug ??
            event.conversationPatch?.assignedDept ??
            undefined,
          contactName: event.notificationPatch?.contactName,
          phone: event.notificationPatch?.phone,
          assignedUserId: assignedUserId ?? undefined,
          communicationLineId:
            event.notificationPatch?.communicationLineId ?? event.communicationLineId,
        });
        break;

      case SocketEventName.AdminNotification:
        namespace.emit(event.socketEventName, event);
        break;

      case SocketEventName.ConversationUpdated:
        namespace.emit(event.socketEventName, event);
        if (typeof assignedUserId === 'string' && assignedUserId.length > 0) {
          namespace.to(userRoom(assignedUserId)).emit(event.socketEventName, event);
        }
        break;

      case SocketEventName.MessageStatusChanged:
        namespace.to(conversationRoom(event.conversationId)).emit(event.socketEventName, event);
        break;

      default:
        namespace.emit(event.socketEventName, event);
        break;
    }
  }

  private emitEphemeralEvent(event: RealtimeEphemeralEvent): void {
    const namespace = this.io.of(ADMIN_NAMESPACE);

    if (event.socketEventName === SocketEventName.ConversationTyping) {
      const conversationId = (event.payload?.conversationId as string) ?? '';
      if (conversationId.length > 0) {
        namespace.to(conversationRoom(conversationId)).emit(event.socketEventName, event.payload);
      }
      return;
    }

    if (event.socketEventName === SocketEventName.PresenceUpdate) {
      namespace.emit(event.socketEventName, event.payload ?? event);
      return;
    }

    namespace.emit(event.socketEventName, event.payload);
  }

  dispose(): void {
    if (this.presenceHeartbeat) {
      clearInterval(this.presenceHeartbeat);
      this.presenceHeartbeat = undefined;
    }
    if (this.legacyCriticalEventBusBridgeEnabled) {
      eventBus.off('message.received', this.onMessageReceived);
      eventBus.off('message.created', this.onMessageCreated);
      eventBus.off('conversation.updated', this.onConversationUpdated);
      eventBus.off('conversation.handover', this.onConversationHandover);
      eventBus.off('message.status.changed', this.onMessageStatusChanged);
      eventBus.off('message.updated', this.onMessageUpdated);
    }
    eventBus.off('conversation.typing', this.onConversationTyping);
    if (typeof this.io.close === 'function') {
      void this.io.close();
    }
  }

  /**
   * Factory. Each API instance owns local Socket.IO rooms. Durable events still
   * arrive via Pub/Sub push to one instance; `@socket.io/gcp-pubsub-adapter`
   * then fans the resulting emit out to sockets on every Cloud Run replica.
   */
  static async create(
    httpServer: HttpServer,
    config: {
      corsOrigin: string;
      path: string;
      legacyCriticalEventBusBridgeEnabled?: boolean;
      authorizeSubscribe?: SubscribeAuthorizer;
      metrics?: RealtimeMetrics;
      pubsubAdapter?: {
        enabled: boolean;
        projectId?: string;
        topicName: string;
        subscriptionPrefix: string;
      };
    },
  ): Promise<WebsocketGatewayService> {
    const adapter = await buildSocketIoAdapter(config.pubsubAdapter);

    const io = new SocketIOServer(httpServer, {
      path: config.path,
      cors: {
        origin: config.corsOrigin,
        credentials: true,
      },
      ...(adapter ? { adapter } : {}),
    });

    const gateway = new WebsocketGatewayService(io, {
      legacyCriticalEventBusBridgeEnabled: config.legacyCriticalEventBusBridgeEnabled,
      authorizeSubscribe: config.authorizeSubscribe,
      metrics: config.metrics,
    });
    gateway.startPresenceHeartbeat();

    if (adapter) {
      await Promise.all([
        waitForAdapterInit(io.of('/')),
        waitForAdapterInit(io.of(ADMIN_NAMESPACE)),
      ]);
    }

    return gateway;
  }
}

async function waitForAdapterInit(namespace: {
  adapter?: { init?: () => Promise<void> | void };
}): Promise<void> {
  const init = namespace.adapter?.init;
  if (typeof init !== 'function') return;
  await init.call(namespace.adapter);
}

async function buildSocketIoAdapter(
  config:
    | {
        enabled: boolean;
        projectId?: string;
        topicName: string;
        subscriptionPrefix: string;
      }
    | undefined,
) {
  if (!config?.enabled) {
    return undefined;
  }

  const pubsub = new PubSub({
    ...(config.projectId ? { projectId: config.projectId } : {}),
  });
  const topic = pubsub.topic(config.topicName);
  const [exists] = await topic.exists();
  if (!exists) {
    await topic.create();
  }

  // Adapter types still pin @google-cloud/pubsub v4; Topic from v6 is runtime-compatible.
  return createAdapter(topic as never, {
    subscriptionPrefix: config.subscriptionPrefix,
  });
}
