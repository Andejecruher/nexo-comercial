'use client';

import { useRealtimeNotifications } from '@/hooks/shared/useRealtimeNotifications';
import { useNotificationPreferencesStore } from '@/store/shared/use-notification-preferences-store';
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
