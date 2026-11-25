import { RealtimeUserEvent } from '@/lib/shared/realtime/realtime-user-events';
import { SoundId } from '@/lib/shared/realtime/sound-player';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoundPreferencesStore } from '@/store/shared/use-sound-preferences-store';

const STORAGE_KEY = 'vc-realtime-sound-preferences';

describe('useSoundPreferencesStore', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    useSoundPreferencesStore.getState().resetPreferences();
  });

  it('starts with default preferences', () => {
    const state = useSoundPreferencesStore.getState();
    expect(state.muted).toBe(false);
    expect(state.desktopNotificationsEnabled).toBe(false);
    expect(state.volume).toBe(0.6);
    expect(state.events[RealtimeUserEvent.NUEVO_TICKET]).toEqual({
      muted: false,
      sound: SoundId.BELL,
    });
    expect(state.events[RealtimeUserEvent.CIERRE_TICKET]).toEqual({
      muted: false,
      sound: SoundId.CHIME,
    });
    expect(state.events[RealtimeUserEvent.TRANSFERENCIA_TICKET]).toEqual({
      muted: false,
      sound: SoundId.PING,
    });
  });

  it('toggles the global mute', () => {
    useSoundPreferencesStore.getState().setMuted(true);
    expect(useSoundPreferencesStore.getState().muted).toBe(true);
  });

  it('persists the desktop notification preference', () => {
    useSoundPreferencesStore.getState().setDesktopNotificationsEnabled(true);

    expect(useSoundPreferencesStore.getState().desktopNotificationsEnabled).toBe(true);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state.desktopNotificationsEnabled).toBe(true);
  });

  it('clamps volume to the 0..1 range', () => {
    const { setVolume } = useSoundPreferencesStore.getState();

    setVolume(1.5);
    expect(useSoundPreferencesStore.getState().volume).toBe(1);

    setVolume(-0.5);
    expect(useSoundPreferencesStore.getState().volume).toBe(0);

    setVolume(0.4);
    expect(useSoundPreferencesStore.getState().volume).toBe(0.4);
  });

  it('mutes a single event without touching the others', () => {
    useSoundPreferencesStore.getState().setEventMuted(RealtimeUserEvent.CIERRE_TICKET, true);

    const { events } = useSoundPreferencesStore.getState();
    expect(events[RealtimeUserEvent.CIERRE_TICKET].muted).toBe(true);
    expect(events[RealtimeUserEvent.NUEVO_TICKET].muted).toBe(false);
    expect(events[RealtimeUserEvent.TRANSFERENCIA_TICKET].muted).toBe(false);
  });

  it('changes the sound of a single event', () => {
    useSoundPreferencesStore
      .getState()
      .setEventSound(RealtimeUserEvent.TRANSFERENCIA_TICKET, SoundId.ALERT);

    const { events } = useSoundPreferencesStore.getState();
    expect(events[RealtimeUserEvent.TRANSFERENCIA_TICKET].sound).toBe(SoundId.ALERT);
    expect(events[RealtimeUserEvent.NUEVO_TICKET].sound).toBe(SoundId.BELL);
  });

  it('restores defaults via resetPreferences', () => {
    const { setMuted, setVolume, setEventMuted, resetPreferences } =
      useSoundPreferencesStore.getState();

    setMuted(true);
    setVolume(0.1);
    setEventMuted(RealtimeUserEvent.NUEVO_TICKET, true);
    resetPreferences();

    const state = useSoundPreferencesStore.getState();
    expect(state.muted).toBe(false);
    expect(state.desktopNotificationsEnabled).toBe(false);
    expect(state.volume).toBe(0.6);
    expect(state.events[RealtimeUserEvent.NUEVO_TICKET].muted).toBe(false);
  });

  it('keeps catalog defaults for events missing from an older persisted snapshot', async () => {
    // Snapshot persisted before NUEVO_TICKET existed: CIERRE muted, no NUEVO key.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          muted: true,
          volume: 0.3,
          events: { CIERRE_TICKET: { muted: true, sound: 'alert' } },
        },
        version: 1,
      }),
    );

    vi.resetModules();
    const { useSoundPreferencesStore: freshStore } =
      await import('@/store/shared/use-sound-preferences-store');
    await freshStore.persist.rehydrate();

    const state = freshStore.getState();
    expect(state.muted).toBe(true);
    expect(state.desktopNotificationsEnabled).toBe(false);
    expect(state.volume).toBe(0.3);
    expect(state.events.CIERRE_TICKET).toEqual({ muted: true, sound: 'alert' });
    expect(state.events.NUEVO_TICKET).toEqual({ muted: false, sound: 'bell' });
    expect(state.events.TRANSFERENCIA_TICKET).toEqual({ muted: false, sound: 'ping' });
  });
});
