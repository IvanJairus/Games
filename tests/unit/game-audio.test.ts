import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let contextsBuilt = 0;
let tonesStarted = 0;

const param = () => ({
  value: 0,
  setValueAtTime: () => {},
  exponentialRampToValueAtTime: () => {},
  linearRampToValueAtTime: () => {},
  setTargetAtTime: () => {},
});

/** jsdom ships a window.localStorage without its methods, so the app's own guards
 *  swallow every read. The mute preference is worth testing, so stub the shape. */
function installStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
  return store;
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = this.node();
  constructor() {
    contextsBuilt += 1;
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  private node() {
    return {
      connect: (n: unknown) => n,
      disconnect: () => {},
      start: () => {
        tonesStarted += 1;
      },
      stop: () => {},
      frequency: param(),
      gain: param(),
    };
  }
}

async function freshAudio() {
  vi.resetModules();
  return import('../../src/games/common/audio');
}

function installAudio(ctor: unknown) {
  Object.defineProperty(window, 'AudioContext', { value: ctor, configurable: true });
}

let storage: Map<string, string> = new Map();

beforeEach(() => {
  // Victory jingles are scheduled with setTimeout. Without fake timers their
  // callbacks land in the next test and inflate the context count.
  vi.useFakeTimers();
  storage = installStorage();
  contextsBuilt = 0;
  tonesStarted = 0;
});

afterEach(() => {
  vi.useRealTimers();
  installAudio(undefined);
  storage.clear();
});

describe('shared game audio', () => {
  it('does not throw when the browser refuses an AudioContext', async () => {
    installAudio(undefined);
    const audio = await freshAudio();
    expect(() => {
      audio.unlockAudio();
      audio.playSlapSound();
      audio.playPlace();
      audio.playVictory();
    }).not.toThrow();
  });

  it('builds one context for every cue instead of one per sound', async () => {
    installAudio(FakeAudioContext);
    const audio = await freshAudio();
    audio.unlockAudio();
    audio.playSelect();
    audio.playPlace();
    audio.playHit();
    expect(contextsBuilt).toBe(1);
  });

  it('throttles the same cue inside one frame so simultaneous events stay quiet', async () => {
    installAudio(FakeAudioContext);
    const audio = await freshAudio();
    audio.unlockAudio();
    audio.playSelect();
    const afterFirst = tonesStarted;
    audio.playSelect();
    audio.playSelect();
    expect(tonesStarted).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThan(0);
  });

  it('every shared cue reaches the oscillator, not just the slap ones', async () => {
    installAudio(FakeAudioContext);
    const audio = await freshAudio();
    audio.unlockAudio();
    const cues: Array<[string, () => void]> = [
      ['playSelect', audio.playSelect],
      ['playPlace', audio.playPlace],
      ['playBlocked', audio.playBlocked],
      ['playHit', audio.playHit],
      ['playMiss', audio.playMiss],
      ['playVictory', audio.playVictory],
      ['playDefeat', audio.playDefeat],
    ];
    for (const [name, cue] of cues) {
      // Drain any tone scheduled by the previous cue before measuring this one.
      vi.advanceTimersByTime(2000);
      tonesStarted = 0;
      cue();
      vi.advanceTimersByTime(2000);
      expect(tonesStarted, name).toBeGreaterThan(0);
    }
  });

  it('starts no tones once muted, and the choice survives a reload', async () => {
    installAudio(FakeAudioContext);
    let audio = await freshAudio();
    audio.unlockAudio();
    audio.playPlace();
    expect(tonesStarted).toBeGreaterThan(0);

    tonesStarted = 0;
    audio.setMuted(true);
    audio.playPlace();
    audio.playHit();
    expect(tonesStarted).toBe(0);
    expect(storage.get('ij_games_muted')).toBe('1');

    audio = await freshAudio();
    expect(audio.isMuted()).toBe(true);
    audio.unlockAudio();
    audio.playPlace();
    expect(tonesStarted).toBe(0);
  });
});
