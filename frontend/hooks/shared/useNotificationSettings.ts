'use client';

import { realtimeSoundPlayer } from '@/lib/shared/realtime/sound-player';
import { useNotificationPreferencesStore } from '@/store/shared/use-notification-preferences-store';
import { useSoundPreferencesStore } from '@/store/shared/use-sound-preferences-store';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export type NotificationPermissionStatus = NotificationPermission | 'checking' | 'unsupported';

export function useNotificationSettings() {
  const store = useNotificationPreferencesStore();
  const preferences = store.preferences();

  const volume = useSoundPreferencesStore((state) => state.volume);
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationPermissionStatus>('checking');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionStatus('unsupported');
      return;
    }
    setPermissionStatus(window.Notification.permission);
  }, []);

  const requestBrowserPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (window.Notification.permission === 'denied') return false;
    if (window.Notification.permission === 'granted') return true;

    setIsRequestingPermission(true);
    try {
      const result = await window.Notification.requestPermission();
      setPermissionStatus(result);
      return result === 'granted';
    } catch {
      setPermissionStatus(window.Notification.permission);
      return false;
    } finally {
      setIsRequestingPermission(false);
    }
  }, []);

  const save = useCallback(async () => {
    setSaveStatus('saving');
    const ok = await useNotificationPreferencesStore.getState().save();
    setSaveStatus(ok ? 'idle' : 'error');
    return ok;
  }, []);

  const reset = useCallback(() => {
    useNotificationPreferencesStore.getState().resetToServer();
    setSaveStatus('idle');
  }, []);

  const previewSound = useCallback(() => {
    void realtimeSoundPlayer.playAfterUnlock('bell', volume);
  }, [volume]);

  const previewToast = useCallback(() => {
    toast.info('Prueba de notificación', {
      id: 'notification-preview',
      duration: 3_000,
      description: 'Así se verá una alerta cuando llegue un evento.',
    });
  }, []);

  return {
    // Preferences (current local state)
    enabled: preferences.enabled,
    soundEnabled: preferences.soundEnabled,
    toastEnabled: preferences.toastEnabled,
    events: preferences.events,
    scope: preferences.scope,

    // Permission
    permissionStatus,
    isRequestingPermission,
    requestBrowserPermission,

    // Persistence
    isSaving: saveStatus === 'saving' || store.status === 'saving',
    saveError: saveStatus === 'error' ? 'No se pudieron guardar las preferencias' : null,
    save,
    reset,

    // Setters
    setEnabled: store.setEnabled,
    setSoundEnabled: store.setSoundEnabled,
    setToastEnabled: store.setToastEnabled,
    setEventChannel: store.setEventChannel,
    setDepartmentIds: store.setDepartmentIds,
    setAgentIds: store.setAgentIds,

    // Preview
    previewSound,
    previewToast,
  };
}
