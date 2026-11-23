import {
  isRealtimeDurableEvent,
  isRealtimeEphemeralEvent,
  RealtimeDurableEvent,
  RealtimeEphemeralEvent,
} from './realtime-event.contracts';
import {
  logRealtimeBoundary,
  noopRealtimeMetrics,
  RealtimeMetrics,
} from './realtime-observability.service';
import { RealtimeTransportEvent } from './realtime-transport.contracts';
import type { WebsocketGatewayService } from './websocket-gateway.service';

const DEDUPE_TTL_SECONDS = 60;

/**
 * Structural dependency: persists notification-center entries from durable
 * events before they are emitted (see NotificationProjector).
 */
export type NotificationProjectorLike = {
  project(event: RealtimeDurableEvent): Promise<void>;
};

/**
 * API-side consumer of durable/ephemeral realtime events.
 *
 * In the Pub/Sub architecture events arrive via a Google Pub/Sub push
 * subscription (`POST /pubsub/realtime`) instead of an in-process transport
 * subscribe. Deduplication is an in-process LRU keyed by event id (the outbox
 * table already enforces per-event uniqueness; the LRU only guards against
 * duplicate Pub/Sub delivery within the TTL window).
 */
export class RealtimeApiSubscriber {
  private readonly dedupe = new Map<string, number>();

  constructor(
    private readonly gateway: WebsocketGatewayService,
    private readonly enabled: boolean = true,
    private readonly metrics: RealtimeMetrics = noopRealtimeMetrics,
    private readonly projector?: NotificationProjectorLike,
  ) {}

  /**
   * Push-model compatibility hook. Subscription is delivered externally via
   * Pub/Sub push, so startup is a no-op but kept for runtime symmetry.
   */
  start(): Promise<void> {
    return Promise.resolve();
  }

  handleEvent(event: RealtimeTransportEvent): Promise<void> {
    if (!this.enabled) return Promise.resolve();

    if (isRealtimeDurableEvent(event)) {
      return this.handleDurableEvent(event);
    }

    if (isRealtimeEphemeralEvent(event)) {
      this.handleEphemeralEvent(event);
      return Promise.resolve();
    }

    this.metrics.incrementCounter('subscriber_discarded', {
      status: 'dropped_invalid_payload',
    });
    logRealtimeBoundary('error', 'RealtimeApiSubscriber', 'subscriber.receive', {
      status: 'dropped_invalid_payload',
    });
    return Promise.resolve();
  }

  private async handleDurableEvent(event: RealtimeDurableEvent): Promise<void> {
    this.metrics.incrementCounter('subscriber_received', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'received',
    });

    logRealtimeBoundary('info', 'RealtimeApiSubscriber', 'subscriber.receive', {
      status: 'received',
      eventId: event.eventId,
      correlationId: event.correlationId,
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      conversationId: event.conversationId,
    });

    if (!this.tryAcquireDedupe(`realtime:dedupe:${event.eventId}`)) {
      this.metrics.incrementCounter('subscriber_deduped', {
        eventType: event.eventType,
        socketEventName: event.socketEventName,
        status: 'deduped',
      });
      logRealtimeBoundary('info', 'RealtimeApiSubscriber', 'subscriber.dedupe', {
        status: 'deduped',
        eventId: event.eventId,
        correlationId: event.correlationId,
        eventType: event.eventType,
        socketEventName: event.socketEventName,
      });
      return;
    }

    try {
      if (this.projector && !event.notificationPersisted) await this.projector.project(event);
      this.gateway.emitRealtimeEvent(event);
    } catch (error) {
      this.dedupe.delete('realtime:dedupe:' + event.eventId);
      throw error;
    }
    this.metrics.incrementCounter('subscriber_emitted', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'emitted',
    });
    logRealtimeBoundary('info', 'RealtimeApiSubscriber', 'subscriber.emit', {
      status: 'emitted',
      eventId: event.eventId,
      correlationId: event.correlationId,
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      conversationId: event.conversationId,
    });
  }

  private handleEphemeralEvent(event: RealtimeEphemeralEvent): void {
    this.metrics.incrementCounter('subscriber_received', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'received',
    });

    this.gateway.emitRealtimeEvent(event);
    this.metrics.incrementCounter('subscriber_emitted', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'emitted',
    });
    logRealtimeBoundary('info', 'RealtimeApiSubscriber', 'subscriber.emit', {
      status: 'emitted',
      eventType: event.eventType,
      socketEventName: event.socketEventName,
    });
  }

  /**
   * In-process LRU-style dedupe with TTL: returns true when the key was not
   * seen within the TTL window and registers it. Evicts expired entries lazily.
   */
  private tryAcquireDedupe(key: string): boolean {
    const now = Date.now();
    const expiresAt = this.dedupe.get(key);

    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }

    this.dedupe.set(key, now + DEDUPE_TTL_SECONDS * 1000);

    if (this.dedupe.size > 1024) {
      for (const [candidate, candidateExpiry] of this.dedupe) {
        if (candidateExpiry <= now) {
          this.dedupe.delete(candidate);
        }
      }
    }

    return true;
  }

  dispose(): Promise<void> {
    this.dedupe.clear();
    return Promise.resolve();
  }
}
