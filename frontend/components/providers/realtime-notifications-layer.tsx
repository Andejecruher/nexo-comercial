'use client';

import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useNotificationPreferencesStore } from '@/stores/use-notification-preferences-store';
import { useEffect } from 'react';

/**
 * Mounts the unified realtime notification layer once inside RealtimeProvider.
 * Renders nothing — alerts live in the Sonner toaster and audio layer.
 */
export function RealtimeNotificationsLayer() {
  useRealtimeNotifications();

  useEffect(() => {
    return useNotificationPreferencesStore.getState().startCrossTabSync();
  }, []);

  return null;
}
