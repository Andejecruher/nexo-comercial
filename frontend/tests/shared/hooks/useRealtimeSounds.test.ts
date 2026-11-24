import { EventRouter } from '@/lib/shared/realtime/event-router';
import type { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { RealtimeUserEvent } from '@/lib/shared/realtime/realtime-user-events';
import { realtimeSoundPlayer, SoundId } from '@/lib/shared/realtime/sound-player';
import { SocketEventName } from '@/lib/shared/realtime/types';
import { useSoundPreferencesStore } from '@/store/shared/use-sound-preferences-store';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useRealtimeSounds } from '@/hooks/shared/useRealtimeSounds';

const managerRef = vi.hoisted(() => ({ current: undefined as RealtimeManager | undefined }));

vi.mock('@/components/shared/providers/realtime-provider', () => ({
  useRealtimeManager: () => managerRef.current,
}));

const inboundNotification = {
  type: 'message.received' as const,
  conversationId: 'conv-1',
  occurredAt: '2026-10-07T20:00:00.000Z',
  contactName: 'María',
};

describe('useRealtimeSounds', () => {
  let router: EventRouter;
  let playSpy: MockInstance<(sound: SoundId, volume: number) => boolean>;

  beforeEach(() => {
    router = new EventRouter();
    managerRef.current = { router } as unknown as RealtimeManager;
    localStorage.removeItem('vc-realtime-sound-preferences');
    useSoundPreferencesStore.getState().resetPreferences();
    playSpy = vi.spyOn(realtimeSoundPlayer, 'play').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports audio as locked until a running AudioContext exists', () => {
    const { result } = renderHook(() => useRealtimeSounds());
    expect(result.current.audioUnlocked).toBe(false);
  });

  it('plays the configured sound for an inbound admin notification', () => {
    renderHook(() => useRealtimeSounds());

    act(() => {
      router.dispatch(SocketEventName.AdminNotification, inboundNotification);
    });

    expect(playSpy).toHaveBeenCalledWith(SoundId.BELL, 0.6);
  });

  it('shows a desktop notification for a new ticket when enabled and permitted', () => {
    const NotificationMock = vi.fn();
    Object.defineProperty(NotificationMock, 'permission', {
      configurable: true,
      value: 'granted',
    });
    vi.stubGlobal('Notification', NotificationMock);
    useSoundPreferencesStore.getState().setDesktopNotificationsEnabled(true);
    renderHook(() => useRealtimeSounds());

    act(() => {
      router.dispatch(SocketEventName.AdminNotification, inboundNotification);
    });

    expect(NotificationMock).toHaveBeenCalledWith('Nuevo mensaje en Nexo Comercial', {
      body: 'María envió un mensaje nuevo.',
      tag: 'vc-message-conv-1',
    });
  });

  it('does not show a desktop notification when disabled or permission is not granted', () => {
    const NotificationMock = vi.fn();
    Object.defineProperty(NotificationMock, 'permission', {
      configurable: true,
      value: 'denied',
    });
    vi.stubGlobal('Notification', NotificationMock);
    renderHook(() => useRealtimeSounds());

    act(() => {
      router.dispatch(SocketEventName.AdminNotification, inboundNotification);
    });
    expect(NotificationMock).not.toHaveBeenCalled();

    useSoundPreferencesStore.getState().setDesktopNotificationsEnabled(true);
    act(() => {
      router.dispatch(SocketEventName.AdminNotification, {
        ...inboundNotification,
        conversationId: 'conv-2',
      });
    });
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it('does not play while globally muted', () => {
    renderHook(() => useRealtimeSounds());
    useSoundPreferencesStore.getState().setMuted(true);

    act(() => {
      router.dispatch(SocketEventName.AdminNotification, inboundNotification);
    });

    expect(playSpy).not.toHaveBeenCalled();
  });

  it('does not play for a muted event', () => {
    renderHook(() => useRealtimeSounds());
    useSoundPreferencesStore.getState().setEventMuted(RealtimeUserEvent.NUEVO_TICKET, true);

    act(() => {
      router.dispatch(SocketEventName.AdminNotification, inboundNotification);
    });

    expect(playSpy).not.toHaveBeenCalled();
  });

  it('does not play twice when ticket.created is also dispatched for the same inbound message', () => {
    renderHook(() => useRealtimeSounds());

    act(() => {
      router.dispatch(RealtimeUserEvent.NUEVO_TICKET, { conversationId: 'conv-1' });
      router.dispatch(SocketEventName.AdminNotification, inboundNotification);
    });

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('applies volume and sound changes without re-registering', () => {
    renderHook(() => useRealtimeSounds());
    const store = useSoundPreferencesStore.getState();
    store.setVolume(0.2);
    store.setEventSound(RealtimeUserEvent.CIERRE_TICKET, SoundId.ALERT);

    act(() => {
      router.dispatch(RealtimeUserEvent.CIERRE_TICKET, { conversationId: 'conv-1' });
    });

    expect(playSpy).toHaveBeenCalledWith(SoundId.ALERT, 0.2);
  });

  it('reflects audio unlock transitions', async () => {
    const fakeCtx = {
      state: 'suspended' as AudioContextState,
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => {
        fakeCtx.state = 'running';
      }),
      close: vi.fn(async () => undefined),
      createOscillator: vi.fn(),
      createGain: vi.fn(),
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => fakeCtx),
    );

    const { result } = renderHook(() => useRealtimeSounds());
    expect(result.current.audioUnlocked).toBe(false);

    act(() => {
      realtimeSoundPlayer.unlock();
    });

    await waitFor(() => {
      expect(result.current.audioUnlocked).toBe(true);
    });
  });
});
