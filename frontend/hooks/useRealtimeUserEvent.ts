'use client';

import { useRealtimeEvent } from './useRealtimeEvent';
import type {
  RealtimeUserEventId,
  RealtimeUserEventPayload,
} from '@/lib/realtime/realtime-user-events';

/**
 * Subscribes to a semantic realtime event (NUEVO_TICKET, CIERRE_TICKET, ...).
 * The semantic id is dispatched by RealtimeManager after derivation, so
 * components never hardcode transport details (socket names, patches).
 */
export function useRealtimeUserEvent(
  eventId: RealtimeUserEventId,
  handler: (payload: RealtimeUserEventPayload) => void,
  options: { conversationId?: string } = {},
): void {
  useRealtimeEvent(
    [eventId],
    (_event, payload) => handler(payload as RealtimeUserEventPayload),
    options,
  );
}
