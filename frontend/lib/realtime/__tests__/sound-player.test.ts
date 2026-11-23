import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeSoundPlayer, SoundId } from '../sound-player';

function createFakeAudioContext(initialState: 'suspended' | 'running' = 'suspended') {
  const destination = { destination: true };

  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => destination),
  };

  const oscillators: Array<{
    type: string;
    frequency: { value: number };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  const ctx = {
    state: initialState as 'suspended' | 'running' | 'closed',
    currentTime: 0,
    destination,
    resume: vi.fn(async () => {
      ctx.state = 'running';
      return 'running' as const;
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
      return undefined;
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(() => gainNode),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => gainNode),
  };

  return { ctx, gainNode, oscillators, destination };
}

describe('RealtimeSoundPlayer', () => {
  let player: RealtimeSoundPlayer;

  beforeEach(() => {
    player = new RealtimeSoundPlayer();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    player.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false and never throws when no AudioContext exists', () => {
    expect(player.play(SoundId.BELL, 0.6)).toBe(false);
  });

  it('returns false while suspended and schedules an unlock gesture listener', () => {
    const { ctx } = createFakeAudioContext('suspended');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );
    const addSpy = vi.spyOn(document, 'addEventListener');

    expect(player.play(SoundId.BELL, 0.6)).toBe(false);
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { once: true });
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { once: true });
  });

  it('arms audio unlock before the first realtime sound arrives', async () => {
    const { ctx } = createFakeAudioContext('suspended');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );
    const addSpy = vi.spyOn(document, 'addEventListener');

    player.prepare();

    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), { once: true });
    document.dispatchEvent(new Event('pointerdown'));

    await vi.waitFor(() => {
      expect(player.isUnlocked()).toBe(true);
    });
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('warns without throwing when autoplay blocks playback', () => {
    const { ctx } = createFakeAudioContext('suspended');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    expect(player.play(SoundId.BELL, 0.6)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('El navegador bloqueó el sonido automático'),
      '',
    );
  });

  it('unlocks on the first user gesture and notifies subscribers', async () => {
    const { ctx } = createFakeAudioContext('suspended');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    const unlocked = vi.fn();
    player.onUnlocked(unlocked);

    expect(player.play(SoundId.BELL, 0.6)).toBe(false);
    expect(player.isUnlocked()).toBe(false);

    document.dispatchEvent(new Event('pointerdown'));

    await vi.waitFor(() => {
      expect(player.isUnlocked()).toBe(true);
    });
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(unlocked).toHaveBeenCalledTimes(1);
    expect(player.play(SoundId.BELL, 0.6)).toBe(true);
  });

  it('resumes and plays a preview from the current user gesture', async () => {
    const { ctx, oscillators } = createFakeAudioContext('suspended');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    await expect(player.playAfterUnlock(SoundId.PING, 0.6)).resolves.toBe(true);

    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(1);
  });

  it('plays notes through the audio graph when the context is running', () => {
    const { ctx, oscillators, gainNode, destination } = createFakeAudioContext('running');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    expect(player.play(SoundId.CHIME, 0.6)).toBe(true);

    // The 'chime' preset has two notes.
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    expect(ctx.createGain).toHaveBeenCalledTimes(2);
    expect(oscillators).toHaveLength(2);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number));
    expect(gainNode.gain.exponentialRampToValueAtTime).toHaveBeenCalledTimes(4);
    for (const osc of oscillators) {
      expect(osc.connect).toHaveBeenCalledWith(gainNode);
      expect(osc.start).toHaveBeenCalledTimes(1);
      expect(osc.stop).toHaveBeenCalledTimes(1);
    }
    expect(gainNode.connect).toHaveBeenCalledWith(destination);
  });

  it('returns false for zero volume without touching the context', () => {
    const { ctx } = createFakeAudioContext('running');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    expect(player.play(SoundId.BELL, 0)).toBe(false);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('stops playing and closes the context after dispose', () => {
    const { ctx } = createFakeAudioContext('running');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    expect(player.play(SoundId.BELL, 0.6)).toBe(true);

    player.dispose();

    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(player.play(SoundId.BELL, 0.6)).toBe(false);
  });

  it('unsubscribes unlock listeners via the returned function', () => {
    const cb = vi.fn();
    const unsubscribe = player.onUnlocked(cb);
    unsubscribe();

    // A running context notifies unlock subscribers on creation; the
    // unsubscribed callback must stay silent.
    const { ctx } = createFakeAudioContext('running');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ctx),
    );

    expect(player.play(SoundId.BELL, 0.6)).toBe(true);
    expect(cb).not.toHaveBeenCalled();
  });
});
