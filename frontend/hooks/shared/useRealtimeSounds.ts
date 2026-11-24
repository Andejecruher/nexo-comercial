'use client';

import {
  RealtimeUserEvent,
  type RealtimeUserEventId,
} from '@/lib/shared/realtime/realtime-user-events';
import { realtimeSoundPlayer } from '@/lib/shared/realtime/sound-player';
import {
  isAdminNotificationPayload,
  SocketEventName,
  type AdminNotificationPayload,
} from '@/lib/shared/realtime/types';
import { useSoundPreferencesStore } from '@/store/shared/use-sound-preferences-store';
import { useEffect, useState } from 'react';
import { useRealtimeEvent } from '@/hooks/shared/useRealtimeEvent';

const SOUND_TRIGGER_EVENTS = [
  SocketEventName.AdminNotification,
  RealtimeUserEvent.CIERRE_TICKET,
  RealtimeUserEvent.TRANSFERENCIA_TICKET,
];

function resolvePreferenceEvent(event: string, payload: unknown): RealtimeUserEventId | undefined {
  if (event === SocketEventName.AdminNotification) {
    return isAdminNotificationPayload(payload) && payload.type === 'message.received'
      ? RealtimeUserEvent.NUEVO_TICKET
      : undefined;
  }

  if (
    event === RealtimeUserEvent.CIERRE_TICKET ||
    event === RealtimeUserEvent.TRANSFERENCIA_TICKET
  ) {
    return event;
  }

  return undefined;
}

/**
 * Reads the Zustand store at call time so socket callbacks never use stale
 * React state. Returns whether Web Audio actually started playback.
 */
export function playNotificationSound(event: RealtimeUserEventId): boolean {
  const { muted, volume, events } = useSoundPreferencesStore.getState();
  if (muted) return false;

  const prefs = events[event];
  if (!prefs || prefs.muted) return false;

  return realtimeSoundPlayer.play(prefs.sound, volume);
}

function showDesktopNotification(payload: AdminNotificationPayload): void {
  const { desktopNotificationsEnabled } = useSoundPreferencesStore.getState();
  if (
    !desktopNotificationsEnabled ||
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    window.Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    new window.Notification('Nuevo mensaje en Nexo Comercial', {
      body: payload.contactName
        ? `${payload.contactName} envió un mensaje nuevo.`
        : 'Hay una nueva conversación por atender.',
      tag: `vc-message-${payload.conversationId}`,
    });
  } catch {
    // Browser-level notifications are best-effort and must not stop audio.
  }
}

/**
 * Global sound layer. Mount ONCE inside RealtimeProvider (admin layout).
 *
 * Sound is just another router consumer: it subscribes to every semantic
 * event and reads the preferences store via getState() on each payload —
 * preference changes apply instantly without ever re-registering.
 */
export function useRealtimeSounds(): { audioUnlocked: boolean } {
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    realtimeSoundPlayer.prepare();
    setAudioUnlocked(realtimeSoundPlayer.isUnlocked());
    return realtimeSoundPlayer.onUnlocked(() => setAudioUnlocked(true));
  }, []);

  useRealtimeEvent(SOUND_TRIGGER_EVENTS, (event, payload) => {
    const preferenceEvent = resolvePreferenceEvent(event, payload);
    if (!preferenceEvent) return;

    if (
      event === SocketEventName.AdminNotification &&
      isAdminNotificationPayload(payload) &&
      payload.type === 'message.received'
    ) {
      showDesktopNotification(payload);
    }

    playNotificationSound(preferenceEvent);
  });

  return { audioUnlocked };
}
