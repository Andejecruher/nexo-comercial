import { Router, Request, Response } from 'express';
import {
  AIStreamChunkPubSubEvent,
  AIStreamDonePubSubEvent,
} from '../services/realtime/ai-stream-pubsub.service';
import {
  RealtimeDurableEventSchema,
  RealtimeEphemeralEventSchema,
} from '../services/realtime/realtime-event.contracts';
import { logRealtimeBoundary } from '../services/realtime/realtime-observability.service';
import { RealtimeTransportEvent } from '../services/realtime/realtime-transport.contracts';
import type { RealtimeApiSubscriber } from '../services/realtime/realtime-api-subscriber.service';
import type { WebsocketGatewayService } from '../services/realtime/websocket-gateway.service';

/**
 * Google Pub/Sub push subscription HTTP endpoints.
 *
 * Push subscriptions deliver a JSON envelope:
 *   { "message": { "data": "<base64>", "messageId": "...", "attributes": {} }, "subscription": "..." }
 * A 2xx response acknowledges the message; non-2xx responses trigger retries
 * according to the subscription retry/dead-letter policy.
 *
 * Endpoints:
 *   POST /pubsub/realtime  → realtime durable + ephemeral events
 *   POST /pubsub/ai-stream → AI streaming chunk/done events
 */
export function createPubSubRouter(deps: {
  realtimeSubscriber?: RealtimeApiSubscriber;
  gateway?: WebsocketGatewayService;
}): Router {
  const router = Router();

  router.post('/realtime', (req: Request, res: Response): void => {
    const payload = decodePushPayload(req);
    if (payload === null) {
      logRealtimeBoundary('error', 'PubSubPush', 'realtime.receive', {
        status: 'dropped_malformed_message',
      });
      res.status(400).json({ error: 'Malformed Pub/Sub push message' });
      return;
    }

    const event = parseRealtimeEvent(payload);
    if (!event) {
      logRealtimeBoundary('error', 'PubSubPush', 'realtime.receive', {
        status: 'dropped_invalid_payload',
      });
      res.status(400).json({ error: 'Invalid realtime event payload' });
      return;
    }

    if (!deps.realtimeSubscriber) {
      logRealtimeBoundary('debug', 'PubSubPush', 'realtime.receive', {
        status: 'subscriber_disabled',
      });
      res.status(503).json({ error: 'Realtime delivery is unavailable' });
      return;
    }

    deps.realtimeSubscriber
      .handleEvent(event)
      .then(() => {
        res.status(200).json({ ok: true });
      })
      .catch((error: unknown) => {
        logRealtimeBoundary('error', 'PubSubPush', 'realtime.receive', {
          status: 'delivery_failed',
          eventId: 'eventId' in event ? (event.eventId as string) : undefined,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: 'Processing failed' });
      });
  });

  router.post('/ai-stream', (req: Request, res: Response): void => {
    const payload = decodePushPayload(req);
    if (payload === null) {
      logRealtimeBoundary('error', 'PubSubPush', 'ai-stream.receive', {
        status: 'dropped_malformed_message',
      });
      res.status(400).json({ error: 'Malformed Pub/Sub push message' });
      return;
    }

    const event = parseAIStreamEvent(payload);
    if (!event) {
      logRealtimeBoundary('error', 'PubSubPush', 'ai-stream.receive', {
        status: 'dropped_invalid_payload',
      });
      res.status(400).json({ error: 'Invalid AI stream event payload' });
      return;
    }

    if (!deps.gateway) {
      logRealtimeBoundary('debug', 'PubSubPush', 'ai-stream.receive', {
        status: 'gateway_disabled',
      });
      res.status(503).json({ error: 'Realtime delivery is unavailable' });
      return;
    }

    if (event.kind === 'chunk') {
      deps.gateway.emitAiStreamChunk(event);
    } else {
      deps.gateway.emitAiStreamDone(event);
    }
    res.status(200).json({ ok: true });
  });

  return router;
}

function decodePushPayload(req: Request): unknown {
  const message = (req.body as { message?: { data?: unknown } } | undefined)?.message;
  if (!message || typeof message.data !== 'string' || message.data.length === 0) {
    return null;
  }

  try {
    const json = Buffer.from(message.data, 'base64').toString('utf8');
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function parseRealtimeEvent(payload: unknown): RealtimeTransportEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const durable = RealtimeDurableEventSchema.safeParse(payload);
  if (durable.success) return durable.data;

  const ephemeral = RealtimeEphemeralEventSchema.safeParse(payload);
  return ephemeral.success ? ephemeral.data : null;
}

function parseAIStreamEvent(
  payload: unknown,
): AIStreamChunkPubSubEvent | AIStreamDonePubSubEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const event = payload as AIStreamChunkPubSubEvent | AIStreamDonePubSubEvent;
  if (typeof event.conversationId !== 'string') return null;
  if (event.kind === 'chunk' || event.kind === 'done') return event;
  return null;
}
