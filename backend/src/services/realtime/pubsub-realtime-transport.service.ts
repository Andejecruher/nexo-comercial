import { env } from '../../config/env.config';
import {
  RealtimeDurableEventSchema,
  RealtimeEphemeralEventSchema,
} from './realtime-event.contracts';
import { logRealtimeBoundary } from './realtime-observability.service';
import {
  createPubSubClient,
  ensureTopicOnce,
  PubSubClientLike,
  publishJsonMessage,
} from './pubsub.util';
import { RealtimeTransport, RealtimeTransportEvent } from './realtime-transport.contracts';

export const REALTIME_EVENTS_TOPIC = 'realtime-events';

type UnknownEvent = { eventType?: string; socketEventName?: string };

/**
 * Worker-side publisher for realtime events. Replaces the Redis pub/sub
 * transport: durable outbox rows and ephemeral typing events are published to a
 * Google Pub/Sub topic and delivered to API instances via push subscriptions.
 *
 * Ordering: durable events are published with `conversationId` as the ordering
 * key so per-conversation message ordering holds end to end.
 */
export class PubSubRealtimeTransport implements RealtimeTransport {
  constructor(
    private readonly pubsub: PubSubClientLike = createPubSubClient(),
    private readonly options: { topicName?: string; ensureTopic?: boolean } = {},
  ) {}

  async publish(event: unknown): Promise<void> {
    const parsed = this.parseEvent(event);
    if (!parsed) {
      const eventType = (event as UnknownEvent | undefined)?.eventType;
      logRealtimeBoundary('error', 'PubSubRealtimeTransport', 'publish', {
        status: 'dropped_invalid_payload',
        eventType,
      });
      return;
    }

    const topicName = this.options.topicName ?? REALTIME_EVENTS_TOPIC;
    const orderingKey = this.conversationIdOf(parsed);

    if (this.options.ensureTopic ?? env.NODE_ENV !== 'production') {
      try {
        await ensureTopicOnce(this.pubsub, topicName);
      } catch (error: unknown) {
        logRealtimeBoundary('warn', 'PubSubRealtimeTransport', 'publish', {
          status: 'topic_ensure_failed',
          topicName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await publishJsonMessage(this.pubsub, {
      topicName,
      payload: parsed as unknown as Record<string, unknown>,
      orderingKey,
    });

    logRealtimeBoundary('debug', 'PubSubRealtimeTransport', 'publish', {
      status: 'published',
      eventType: parsed.eventType,
      socketEventName: parsed.socketEventName,
      orderingKey,
      conversationId: 'conversationId' in parsed ? (parsed.conversationId as string) : undefined,
    });
  }

  private parseEvent(event: unknown): RealtimeTransportEvent | null {
    const durable = RealtimeDurableEventSchema.safeParse(event);
    if (durable.success) return durable.data;

    const ephemeral = RealtimeEphemeralEventSchema.safeParse(event);
    return ephemeral.success ? ephemeral.data : null;
  }

  private conversationIdOf(event: RealtimeTransportEvent): string | undefined {
    if ('conversationId' in event && typeof event.conversationId === 'string') {
      return event.conversationId;
    }
    if ('payload' in event && event.payload && typeof event.payload === 'object') {
      const conversationId = (event.payload as { conversationId?: unknown }).conversationId;
      if (typeof conversationId === 'string') return conversationId;
    }
    return undefined;
  }

  async dispose(): Promise<void> {
    // No in-process subscription to tear down; the shared Pub/Sub client is
    // owned by the runtime bootstrap and closed there.
  }
}
