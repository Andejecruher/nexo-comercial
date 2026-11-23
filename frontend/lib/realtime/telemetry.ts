import { apiClient } from '@/lib/api-client';
import { isDurableEventPayload } from './types';

/**
 * Telemetría fire-and-forget del ciclo de vida de eventos realtime en el
 * cliente. Alimenta la métrica log-based `fe_realtime_event` en el backend
 * (POST /api/v1/realtime/telemetry) para completar la cadena end-to-end:
 * emitted → relayed → ws.delivered → fe.received → fe.applied.
 *
 * Se puede desactivar con NEXT_PUBLIC_REALTIME_TELEMETRY=false.
 */

const TELEMETRY_ENABLED = process.env.NEXT_PUBLIC_REALTIME_TELEMETRY !== 'false';
const MAX_REPORTED_KEYS = 1000;

export type RealtimeTelemetryStatus = 'received' | 'applied';
export type TicketLifecycleKind =
  | 'message.created'
  | 'conversation.updated'
  | 'ticket.created'
  | 'ticket.closed'
  | 'ticket.transferred'
  | 'conversation.handover';

interface RealtimeTelemetryInput {
  eventType: TicketLifecycleKind;
  status: RealtimeTelemetryStatus;
  conversationId?: string;
  eventId?: string;
  socketEventName?: string;
  correlationId?: string;
  browserTimestamp?: string;
  occurredAt?: string;
}

const reportedKeys = new Set<string>();

/** Clasifica un payload durable como evento de ciclo de vida de ticket, o null. */
export function isTicketLifecyclePayload(payload: unknown): TicketLifecycleKind | null {
  if (!isDurableEventPayload(payload)) return null;

  if (payload.eventType === 'ticket.created' || payload.eventType === 'ticket.closed') {
    return payload.eventType;
  }

  if (payload.eventType === 'conversation.handover') return 'conversation.handover';

  if (payload.action === 'close') return 'ticket.closed';
  if (payload.action === 'transfer') return 'ticket.transferred';

  if (payload.eventType === 'message.created' || payload.eventType === 'conversation.updated')
    return payload.eventType;

  return null;
}

/** Envía el beacon sin bloquear al caller; silencioso ante cualquier fallo. */
export function reportRealtimeTelemetry(input: RealtimeTelemetryInput): void {
  if (!TELEMETRY_ENABLED || typeof window === 'undefined') return;
  if (!input.eventId) return;

  const key = `${input.eventId}:${input.status}`;
  if (reportedKeys.has(key)) return;
  reportedKeys.add(key);

  if (reportedKeys.size > MAX_REPORTED_KEYS) {
    reportedKeys.clear();
  }

  void apiClient.post('/realtime/telemetry', input);
}

/** Reporta received/applied solo si el payload es un evento de ciclo de vida de ticket. */
export function reportTicketLifecycle(payload: unknown, status: RealtimeTelemetryStatus): void {
  const eventType = isTicketLifecyclePayload(payload);
  if (!eventType || !isDurableEventPayload(payload)) return;

  reportRealtimeTelemetry({
    eventType,
    status,
    conversationId: payload.conversationId,
    eventId: payload.eventId,
    socketEventName: payload.socketEventName,
    correlationId: payload.correlationId,
    browserTimestamp: new Date().toISOString(),
    occurredAt: payload.occurredAt,
  });
}
