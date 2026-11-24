import {
  REALTIME_USER_EVENT_CATALOG,
  RealtimeUserEvent,
  type RealtimeUserEventId,
} from '@/lib/shared/realtime/realtime-user-events';
import { SoundId } from '@/lib/shared/realtime/sound-player';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SoundEventPreference {
  muted: boolean;
  sound: SoundId;
}

export interface SoundPreferencesState {
  /** Global kill switch — mutes every sound. */
  muted: boolean;
  /** User preference for browser-level desktop notifications. */
  desktopNotificationsEnabled: boolean;
  /** 0..1 master volume. */
  volume: number;
  /** Per-event preferences; keys come from the catalog, so new events
   *  appear here with their defaults automatically. */
  events: Record<RealtimeUserEventId, SoundEventPreference>;
  setMuted: (muted: boolean) => void;
  setDesktopNotificationsEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setEventMuted: (eventId: RealtimeUserEventId, muted: boolean) => void;
  setEventSound: (eventId: RealtimeUserEventId, sound: SoundId) => void;
  resetPreferences: () => void;
}

const DEFAULT_VOLUME = 0.6;

const DEFAULT_EVENT_SOUND: Record<RealtimeUserEventId, SoundId> = {
  [RealtimeUserEvent.NUEVO_MENSAJE]: SoundId.BELL,
  [RealtimeUserEvent.NUEVO_TICKET]: SoundId.BELL,
  [RealtimeUserEvent.CIERRE_TICKET]: SoundId.CHIME,
  [RealtimeUserEvent.TRANSFERENCIA_TICKET]: SoundId.PING,
};

function defaultEvents(): Record<RealtimeUserEventId, SoundEventPreference> {
  const events = {} as Record<RealtimeUserEventId, SoundEventPreference>;
  for (const id of Object.keys(REALTIME_USER_EVENT_CATALOG) as RealtimeUserEventId[]) {
    events[id] = { muted: false, sound: DEFAULT_EVENT_SOUND[id] ?? SoundId.CHIME };
  }
  return events;
}

type PersistedSoundPreferences = Pick<
  SoundPreferencesState,
  'muted' | 'desktopNotificationsEnabled' | 'volume' | 'events'
>;

export const useSoundPreferencesStore = create<SoundPreferencesState>()(
  persist(
    (set) => ({
      muted: false,
      desktopNotificationsEnabled: false,
      volume: DEFAULT_VOLUME,
      events: defaultEvents(),

      setMuted: (muted) => set({ muted }),

      setDesktopNotificationsEnabled: (desktopNotificationsEnabled) =>
        set({ desktopNotificationsEnabled }),

      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

      setEventMuted: (eventId, muted) =>
        set((state) => ({
          events: { ...state.events, [eventId]: { ...state.events[eventId], muted } },
        })),

      setEventSound: (eventId, sound) =>
        set((state) => ({
          events: { ...state.events, [eventId]: { ...state.events[eventId], sound } },
        })),

      resetPreferences: () =>
        set({
          muted: false,
          desktopNotificationsEnabled: false,
          volume: DEFAULT_VOLUME,
          events: defaultEvents(),
        }),
    }),
    {
      name: 'vc-realtime-sound-preferences',
      version: 1,
      partialize: (state): PersistedSoundPreferences => ({
        muted: state.muted,
        desktopNotificationsEnabled: state.desktopNotificationsEnabled,
        volume: state.volume,
        events: state.events,
      }),
      // Events added to the catalog in a future release keep their defaults
      // instead of staying undefined after hydration of an older snapshot.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedSoundPreferences>;
        return {
          ...current,
          muted: p.muted ?? current.muted,
          desktopNotificationsEnabled:
            p.desktopNotificationsEnabled ?? current.desktopNotificationsEnabled,
          volume: p.volume ?? current.volume,
          events: { ...defaultEvents(), ...p.events },
        };
      },
    },
  ),
);
