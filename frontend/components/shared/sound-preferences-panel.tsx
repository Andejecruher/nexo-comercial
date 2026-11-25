'use client';

import {
  REALTIME_USER_EVENT_CATALOG,
  type RealtimeUserEventId,
} from '@/lib/shared/realtime/realtime-user-events';
import { SoundId, realtimeSoundPlayer } from '@/lib/shared/realtime/sound-player';
import { useSoundPreferencesStore } from '@/store/shared/use-sound-preferences-store';

/**
 * User-facing sound preferences: global mute, master volume, per-event mute
 * and per-event sound choice. The "Probar sonido" button doubles as the
 * user gesture that unlocks audio under browser autoplay policies.
 */
export function SoundPreferencesPanel() {
  const muted = useSoundPreferencesStore((s) => s.muted);
  const volume = useSoundPreferencesStore((s) => s.volume);
  const setMuted = useSoundPreferencesStore((s) => s.setMuted);
  const setVolume = useSoundPreferencesStore((s) => s.setVolume);
  const events = useSoundPreferencesStore((s) => s.events);
  const setEventMuted = useSoundPreferencesStore((s) => s.setEventMuted);
  const setEventSound = useSoundPreferencesStore((s) => s.setEventSound);

  return (
    <section aria-label="Preferencias de sonido" className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
        Sonidos habilitados
      </label>

      <label className="block text-sm font-medium">
        Volumen
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={muted}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="mt-1 block w-full"
        />
      </label>

      {(Object.keys(REALTIME_USER_EVENT_CATALOG) as RealtimeUserEventId[]).map((eventId) => {
        const prefs = events[eventId];
        return (
          <fieldset key={eventId} className="space-y-1" disabled={muted}>
            <legend className="text-sm font-medium">
              {REALTIME_USER_EVENT_CATALOG[eventId].label}
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!prefs.muted}
                onChange={(e) => setEventMuted(eventId, !e.target.checked)}
              />
              Sonar al recibirlo
            </label>
            <label className="flex items-center gap-2 text-sm">
              Sonido
              <select
                disabled={muted || prefs.muted}
                value={prefs.sound}
                onChange={(e) => setEventSound(eventId, e.target.value as SoundId)}
              >
                {Object.values(SoundId).map((sound) => (
                  <option key={sound} value={sound}>
                    {sound}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => realtimeSoundPlayer.play(prefs.sound, volume)}
            >
              Probar sonido
            </button>
          </fieldset>
        );
      })}
    </section>
  );
}
