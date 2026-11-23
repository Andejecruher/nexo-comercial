'use client';

import { useRealtimeSounds } from '@/hooks/useRealtimeSounds';
import { useSoundPreferencesStore } from '@/stores/use-sound-preferences-store';

/**
 * Mounts the global realtime sound layer (once, inside RealtimeProvider).
 * Renders a small hint while the browser autoplay policy still blocks audio.
 */
export function RealtimeSoundLayer() {
  const { audioUnlocked } = useRealtimeSounds();
  const soundsEnabled = useSoundPreferencesStore((s) => !s.muted);

  if (audioUnlocked || !soundsEnabled) return null;

  return (
    <p
      role="note"
      className="fixed bottom-2 right-2 z-50 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground shadow"
    >
      Sonidos pausados por el navegador — interactuá con la página para activarlos
    </p>
  );
}
