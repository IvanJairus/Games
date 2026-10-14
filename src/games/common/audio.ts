let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const lastPlayed = new Map<string, number>();

// One preference for the whole hub: muting one game mutes every game.
const MUTE_KEY = 'ij_games_muted';

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      muted = readMuted();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Browsers only allow audio after a gesture; call this from the first tap/click. */
export function unlockAudio(): void {
  ensure();
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    /* private mode */
  }
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return readMuted();
}

/** Keeps three bots slapping in the same frame from stacking into a wall of noise. */
function throttle(key: string, ms: number): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = lastPlayed.get(key) ?? -1e9;
  if (now - last < ms) return false;
  lastPlayed.set(key, now);
  return true;
}

interface ToneOptions {
  type?: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain?: number;
  ramp?: 'exp' | 'lin';
  curve?: 'exp' | 'lin';
}

function tone(opts: ToneOptions): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(opts.from, now);
  if (opts.curve === 'lin') osc.frequency.linearRampToValueAtTime(opts.to, now + opts.duration);
  else osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), now + opts.duration);
  const peak = opts.gain ?? 0.3;
  gain.gain.setValueAtTime(peak, now);
  if (opts.ramp === 'lin') gain.gain.linearRampToValueAtTime(0.001, now + opts.duration);
  else gain.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);
  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + opts.duration + 0.01);
}

function noise(duration: number, gainValue: number, filterHz: number): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const frames = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterHz;
  const gain = c.createGain();
  gain.gain.value = gainValue;
  src.connect(filter).connect(gain).connect(master);
  src.start();
}

function arpeggio(freqs: number[], stepMs: number, duration: number, gain: number): void {
  freqs.forEach((freq, i) => {
    window.setTimeout(() => tone({ type: 'triangle', from: freq, to: freq, duration, gain }), i * stepMs);
  });
}

/* ------------------------------------------------------------------ Slap Arena */

export function playSlapSound(): void {
  if (!throttle('slap', 45)) return;
  noise(0.07, 0.22, 1800);
  tone({ type: 'triangle', from: 300, to: 70, duration: 0.11, gain: 0.32 });
}

export function playKnockbackSound(): void {
  if (!throttle('knock', 60)) return;
  tone({ type: 'sine', from: 150, to: 430, duration: 0.09, gain: 0.28, curve: 'lin' });
  tone({ type: 'sine', from: 430, to: 170, duration: 0.16, gain: 0.2 });
}

export function playDashSound(): void {
  if (!throttle('dash', 90)) return;
  noise(0.16, 0.12, 900);
  tone({ type: 'sine', from: 420, to: 120, duration: 0.15, gain: 0.16 });
}

export function playFallSound(): void {
  if (!throttle('fall', 120)) return;
  tone({ type: 'sawtooth', from: 620, to: 90, duration: 0.5, gain: 0.2 });
}

export function playCountTick(final = false): void {
  if (!throttle(final ? 'tick-final' : 'tick', 120)) return;
  tone({ type: 'square', from: final ? 880 : 520, to: final ? 1180 : 520, duration: final ? 0.22 : 0.09, gain: 0.16 });
}

export function playRoundWinSound(): void {
  if (!throttle('win', 200)) return;
  arpeggio([523.25, 659.25, 783.99, 1046.5], 95, 0.24, 0.22);
}

export function playMatchWinSound(): void {
  if (!throttle('matchwin', 400)) return;
  arpeggio([392, 523.25, 659.25, 783.99, 1046.5, 1318.5], 110, 0.3, 0.24);
}

/* ------------------------------------------------- Board games, shared cues */

/** Hovering or picking a cell before it is committed. */
export function playSelect(): void {
  if (!throttle('select', 40)) return;
  tone({ type: 'sine', from: 660, to: 660, duration: 0.05, gain: 0.12 });
}

/** A move that is now final: the sound of a piece settling. */
export function playPlace(): void {
  if (!throttle('place', 50)) return;
  noise(0.05, 0.14, 420);
  tone({ type: 'triangle', from: 220, to: 120, duration: 0.09, gain: 0.2 });
}

/** Something that could not happen: occupied cell, wall on yourself, fired twice. */
export function playBlocked(): void {
  if (!throttle('blocked', 120)) return;
  tone({ type: 'square', from: 150, to: 110, duration: 0.13, gain: 0.14 });
}

/** Battleship: a shell landing. */
export function playHit(): void {
  if (!throttle('hit', 60)) return;
  noise(0.09, 0.2, 700);
  tone({ type: 'sawtooth', from: 180, to: 60, duration: 0.16, gain: 0.22 });
}

/** Battleship: splash, nothing there. */
export function playMiss(): void {
  if (!throttle('miss', 60)) return;
  noise(0.14, 0.1, 2400);
}

export function playVictory(): void {
  if (!throttle('victory', 400)) return;
  arpeggio([523.25, 659.25, 783.99, 1046.5], 105, 0.26, 0.22);
}

/** Deliberately flatter than victory: this one should not feel like a reward. */
export function playDefeat(): void {
  if (!throttle('defeat', 400)) return;
  arpeggio([392, 349.23, 261.63], 150, 0.3, 0.16);
}
