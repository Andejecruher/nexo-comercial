/**
 * Synthesized realtime sounds (Web Audio API) — no audio assets required.
 *
 * Browser autoplay policy: an AudioContext starts `suspended` until a user
 * gesture happens in the page. This player:
 *  - lazily creates the context on the first play attempt,
 *  - registers one-time pointerdown/keydown listeners to resume it,
 *  - silently skips playback while locked (never throws, never blocks),
 *  - notifies subscribers when audio becomes available (UI hint support).
 */

export const SoundId = {
  CHIME: 'chime',
  PING: 'ping',
  ALERT: 'alert',
  BELL: 'bell',
} as const;

export type SoundId = (typeof SoundId)[keyof typeof SoundId];

type Note = { freq: number; durationMs: number; delayMs?: number; type?: OscillatorType };

const SOUND_PRESETS: Record<SoundId, Note[]> = {
  chime: [
    { freq: 880, durationMs: 120 },
    { freq: 1174.66, durationMs: 180, delayMs: 90 },
  ],
  ping: [{ freq: 1046.5, durationMs: 150 }],
  alert: [
    { freq: 660, durationMs: 140, type: 'square' },
    { freq: 660, durationMs: 140, delayMs: 200, type: 'square' },
  ],
  bell: [
    { freq: 587.33, durationMs: 400 },
    { freq: 880, durationMs: 500, delayMs: 60 },
  ],
};

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

export class RealtimeSoundPlayer {
  private ctx: AudioContext | undefined;
  private unlockedListeners = new Set<() => void>();
  private unlockHandler: (() => void) | undefined;
  private warnedPlaybackBlocked = false;
  private disposed = false;

  isUnlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Subscribes to unlock transitions; returns an unsubscribe function. */
  onUnlocked(cb: () => void): () => void {
    this.unlockedListeners.add(cb);
    return () => this.unlockedListeners.delete(cb);
  }

  /**
   * Arms the browser-gesture listeners before the first realtime event arrives.
   * Without this, the first sound is lost and only that failed attempt starts
   * listening for a later interaction.
   */
  prepare(): void {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running') {
      this.scheduleAutoUnlock();
    }
  }

  unlock(): void {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state === 'running') return;

    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') {
          this.notifyUnlocked();
        }
      })
      .catch((error: unknown) => this.warnPlaybackBlocked(error));
  }

  /**
   * Plays a sound. Returns `true` when playback actually started.
   * Safe to call from any event handler: it never throws.
   */
  play(sound: SoundId, volume: number): boolean {
    if (this.disposed || volume <= 0) return false;

    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') {
      this.scheduleAutoUnlock(); // resume on the first user gesture ASAP
      this.warnPlaybackBlocked();
      return false;
    }

    try {
      const preset = SOUND_PRESETS[sound] ?? SOUND_PRESETS.chime;
      const now = ctx.currentTime;
      for (const note of preset) {
        this.playNote(ctx, note, now + (note.delayMs ?? 0) / 1000, volume);
      }
      return true;
    } catch (error: unknown) {
      this.warnPlaybackBlocked(error);
      return false;
    }
  }

  /**
   * Resumes the audio context and plays from the same user gesture.
   * Intended for explicit preview controls, not background events.
   */
  async playAfterUnlock(sound: SoundId, volume: number): Promise<boolean> {
    if (this.disposed || volume <= 0) return false;

    const ctx = this.ensureContext();
    if (!ctx) return false;

    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
        this.notifyUnlocked();
      } catch (error: unknown) {
        this.warnPlaybackBlocked(error);
        return false;
      }
    }

    return this.play(sound, volume);
  }

  dispose(): void {
    this.disposed = true;
    this.removeUnlockHandler();
    this.unlockedListeners.clear();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = undefined;
  }

  private playNote(ctx: AudioContext, note: Note, start: number, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? 'sine';
    osc.frequency.value = note.freq;

    const end = start + note.durationMs / 1000;
    const safeVolume = Math.min(1, Math.max(0.0001, volume));
    // Exponential envelope avoids audible clicks at note boundaries.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(safeVolume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  private ensureContext(): AudioContext | undefined {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return undefined;
    try {
      this.ctx = new Ctor();
    } catch {
      return undefined;
    }
    if (this.ctx.state === 'running') this.notifyUnlocked();
    return this.ctx;
  }

  /**
   * Autoplay handling: while the context is suspended, listen for the first
   * user gesture (pointer/key) anywhere in the document and resume playback.
   */
  private scheduleAutoUnlock(): void {
    if (this.unlockHandler || typeof document === 'undefined') return;
    this.unlockHandler = () => {
      this.removeUnlockHandler();
      this.unlock();
    };
    document.addEventListener('pointerdown', this.unlockHandler, { once: true });
    document.addEventListener('keydown', this.unlockHandler, { once: true });
  }

  private removeUnlockHandler(): void {
    if (!this.unlockHandler || typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', this.unlockHandler);
    document.removeEventListener('keydown', this.unlockHandler);
    this.unlockHandler = undefined;
  }

  private notifyUnlocked(): void {
    this.warnedPlaybackBlocked = false;
    for (const cb of this.unlockedListeners) {
      try {
        cb();
      } catch {
        // Listener errors are not the pipeline's failure.
      }
    }
  }

  private warnPlaybackBlocked(error?: unknown): void {
    if (this.warnedPlaybackBlocked) return;
    this.warnedPlaybackBlocked = true;
    console.warn(
      '[Nexo Comercial] El navegador bloqueó el sonido automático. Interactúa con la página para habilitar las alertas.',
      error ?? '',
    );
  }
}

/** App-wide singleton — one AudioContext for the whole admin session. */
export const realtimeSoundPlayer = new RealtimeSoundPlayer();
