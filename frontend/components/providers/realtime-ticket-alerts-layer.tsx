'use client';

import { useRealtimeTicketAlerts } from '@/hooks/useRealtimeTicketAlerts';

/**
 * Mounts the global realtime ticket alert layer (once, inside RealtimeProvider).
 * Renders nothing — alerts live in the Sonner toaster.
 */
export function RealtimeTicketAlertsLayer() {
  useRealtimeTicketAlerts();
  return null;
}
