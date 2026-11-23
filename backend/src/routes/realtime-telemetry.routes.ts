/**
 * Endpoint de telemetría client-side (admin frontend).
 *
 * Recibe avisos fire-and-forget de eventos realtime durables que ya
 * aterrizaron en el navegador:
 *   - status 'received': el evento llegó al cliente (RealtimeManager).
 *   - status 'applied': el patch se aplicó a la vista (hook de detalle).
 *
 * Solo incrementa métricas log-based (`fe_realtime_event`) y registra el
 * boundary; no persiste nada en base.
 */
import { Router } from 'express';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import {
  logRealtimeBoundary,
  noopRealtimeMetrics,
  RealtimeMetrics,
} from '../services/realtime/realtime-observability.service';

const MAX_BODY_BYTES = 2048;
const ALLOWED_STATUSES = new Set(['received', 'applied']);
const ALLOWED_EVENT_TYPES = new Set([
  'message.created',
  'conversation.updated',
  'ticket.created',
  'ticket.closed',
  'ticket.transferred',
  'conversation.handover',
]);

export interface RealtimeTelemetryDeps {
  metrics?: RealtimeMetrics;
}

export function createRealtimeTelemetryRouter(deps: RealtimeTelemetryDeps = {}): Router {
  const metrics = deps.metrics ?? noopRealtimeMetrics;
  const router = Router();

  router.use(jwtMiddleware);

  router.post('/telemetry', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (JSON.stringify(body).length > MAX_BODY_BYTES) {
      res.status(413).json({ error: 'Telemetry payload too large' });
      return;
    }

    const { eventType, status, conversationId, eventId, socketEventName } = body;

    if (typeof eventType !== 'string' || !ALLOWED_EVENT_TYPES.has(eventType)) {
      res.status(400).json({ error: 'Unsupported eventType' });
      return;
    }

    if (!ALLOWED_STATUSES.has(status as string)) {
      res.status(400).json({ error: 'Unsupported status' });
      return;
    }

    const conversation =
      typeof conversationId === 'string' && conversationId.length > 0
        ? conversationId.slice(0, 64)
        : undefined;
    const event =
      typeof eventId === 'string' && eventId.length > 0 ? eventId.slice(0, 64) : undefined;
    const socketName =
      typeof socketEventName === 'string' && socketEventName.length > 0
        ? socketEventName.slice(0, 48)
        : undefined;

    metrics.incrementCounter('fe_realtime_event', {
      eventType,
      status: String(status),
      ...(socketName ? { socketEventName: socketName } : {}),
    });

    logRealtimeBoundary('info', 'RealtimeTelemetry', 'fe.event', {
      status,
      eventType,
      conversationId: conversation,
      eventId: event,
      socketEventName: socketName,
      userId: req.user?.id,
      correlationId:
        typeof body.correlationId === 'string' ? body.correlationId.slice(0, 255) : undefined,
      browserTimestamp:
        typeof body.browserTimestamp === 'string' ? body.browserTimestamp.slice(0, 40) : undefined,
      occurredAt: typeof body.occurredAt === 'string' ? body.occurredAt.slice(0, 40) : undefined,
    });

    res.status(204).end();
  });

  return router;
}
