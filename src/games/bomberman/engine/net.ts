/**
 * Realtime link for the arena.
 *
 * The room's database row only carries lifecycle: who is seated, when the match
 * started, who won. Everything that moves at frame rate goes over broadcast, because
 * `submitOnlineMove` is a compare-and-swap on one row: at tick rate it would reject
 * nearly every input as stale and fan a REST refetch out to every client.
 *
 * One message per tick, not two. `eventsPerSecond` in src/lib/supabase.ts is 20 and is
 * shared by everything this client sends; the snapshot and the effect batch therefore
 * travel together, or the host would try to push 30 messages through a 20 message pipe.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';

import type { BombermanState, Facing, InputState, SimEvent } from './types';

export const EV_INPUT = 'bm_in';
export const EV_WORLD = 'bm_world';
export const EV_CHAR = 'bm_char';
export const TICK_MS = 66;
/** Stated so the tests can hold the sender to it. */
export const CHANNEL_BUDGET_PER_SECOND = 20;

export interface BombermanInput {
  seat: number;
  dir: Facing | null;
  bomb: boolean;
  seq: number;
}

/** A seat announcing which character its owner picked. Cosmetic, and sent once. */
export interface CharClaim {
  seat: number;
  charId: string;
}

export interface WorldPayload {
  /** Host clock. Anything older than the last accepted frame is dropped. */
  t: number;
  state: BombermanState;
  fx: SimEvent[];
}

const DIRS: Facing[] = ['up', 'down', 'left', 'right'];

export function encodeInput(msg: BombermanInput): BombermanInput {
  const seq = Number.isFinite(msg.seq) ? Math.max(0, Math.floor(msg.seq)) : 0;
  return {
    seat: Number.isFinite(msg.seat) ? Math.floor(msg.seat) : -1,
    dir: DIRS.includes(msg.dir as Facing) ? (msg.dir as Facing) : null,
    bomb: msg.bomb === true,
    seq,
  };
}

export const encodeChar = (msg: CharClaim | null | undefined): CharClaim | null => {
  const seat = msg && Number.isFinite(msg.seat) ? Math.floor(msg.seat) : -1;
  const charId = typeof msg?.charId === 'string' ? msg.charId.slice(0, 16) : '';
  return seat >= 0 && charId ? { seat, charId } : null;
};

export function isInput(payload: unknown): payload is BombermanInput {
  const p = payload as Partial<BombermanInput> | null;
  return !!p && typeof p.seat === 'number' && (p.dir === null || DIRS.includes(p.dir as Facing)) && typeof p.seq === 'number';
}

export function isWorld(payload: unknown): payload is WorldPayload {
  const p = payload as Partial<WorldPayload> | null;
  return (
    !!p &&
    typeof p.t === 'number' &&
    !!p.state &&
    Array.isArray(p.state.players) &&
    typeof p.state.phase === 'string' &&
    Array.isArray(p.fx)
  );
}

/* A press is carried as an edge, not a flag: the sender bumps `seq` and the sim's own
   per-seat memory decides whether that is a new action. One owner, no double bookkeeping. */

export interface NetOptions {
  channel: RealtimeChannel;
  /** Read live: host election happens after the first room sync, not at construction. */
  isHost: () => boolean;
  /**
   * Also read live. The channel can be open before this tab's own seat row exists, and a
   * seat captured at construction would stay -1 for the rest of the match: every input the
   * guest sent would name a seat nobody has, and the runner would never move while its bomb
   * press, which passes the seat at call time, still worked.
   */
  localSeat: () => number;
  getInput: () => InputState;
  getWorld: () => WorldPayload;
  /** Null until this tab knows both its seat and its player's character. */
  getCharClaim?: () => CharClaim | null;
  onInput: (seat: number, input: InputState) => void;
  onWorld: (world: WorldPayload) => void;
  onChar?: (seat: number, charId: string) => void;
  onDrop?: (count: number) => void;
}

export class BombermanNet {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastT = -Infinity;
  private charSent = false;
  private dropped = 0;
  private warnedDrop = false;
  private warnedError = false;
  readonly stats = { sent: 0, drop: 0, byEvent: {} as Record<string, number>, lastState: 'init' };

  constructor(private opts: NetOptions) {}

  start(): void {
    const { channel } = this.opts;

    channel.on('broadcast', { event: EV_INPUT }, (msg: { payload: unknown }) => {
      if (!this.opts.isHost()) return;
      const payload = msg.payload;
      if (!isInput(payload)) return;
      this.opts.onInput(payload.seat, { dir: payload.dir, bomb: payload.bomb, seq: payload.seq });
    });

    channel.on('broadcast', { event: EV_WORLD }, (msg: { payload: unknown }) => {
      if (this.opts.isHost()) return;
      const payload = msg.payload;
      if (!isWorld(payload) || payload.t < this.lastT) return;
      this.lastT = payload.t;
      this.opts.onWorld(payload);
    });

    channel.on('broadcast', { event: EV_CHAR }, (msg: { payload: unknown }) => {
      if (!this.opts.isHost()) return;
      const claim = encodeChar(msg.payload as CharClaim);
      if (claim) this.opts.onChar?.(claim.seat, claim.charId);
    });

    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Called when this client becomes host mid-match so stale frames are ignored. */
  resetClock(): void {
    this.lastT = -Infinity;
  }

  private tick(): void {
    if (this.opts.isHost()) {
      this.send(EV_WORLD, this.opts.getWorld());
      return;
    }
    /* The claim waits until this tab knows its own seat, which can be a few ticks after
       the channel is open. One message for the whole match, so it is not worth a clock. */
    if (!this.charSent && this.opts.getCharClaim) {
      const claim = encodeChar(this.opts.getCharClaim());
      if (claim) {
        this.charSent = true;
        this.send(EV_CHAR, claim);
      }
    }
    const input = this.opts.getInput();
    const seat = this.opts.localSeat();
    // Nothing to say while this tab does not know which seat it owns.
    if (seat < 0) return;
    this.send(EV_INPUT, encodeInput({ seat, dir: input.dir, bomb: input.bomb, seq: input.seq }));
  }

  /** A press is reported as an edge, so the sender bumps the counter, not the flag. */
  sendPress(seat: number, dir: Facing | null, seq: number): void {
    if (this.opts.isHost()) return;
    this.send(EV_INPUT, encodeInput({ seat, dir, bomb: true, seq }));
  }

  private send(event: string, payload: unknown): void {
    this.stats.sent += 1;
    this.stats.byEvent[event] = (this.stats.byEvent[event] ?? 0) + 1;
    let sent: unknown;
    try {
      sent = this.opts.channel.send({ type: 'broadcast', event, payload });
    } catch (err) {
      this.reportError(err);
      return;
    }
    if (sent && typeof (sent as Promise<string>).then === 'function') {
      void (sent as Promise<string>).then((state) => {
        this.stats.lastState = state;
        if (state !== 'ok' && state !== 'sent' && state !== 'pending') this.noteDrop(state);
      });
    }
  }

  private noteDrop(state: string): void {
    // supabase-js answers 'timedOut'/'closed' instead of throwing and quietly falls back
    // to one REST POST per message, which is slower but not silent.
    this.dropped += 1;
    this.opts.onDrop?.(this.dropped);
    if (this.dropped >= 20 && !this.warnedDrop) {
      this.warnedDrop = true;
      console.warn(`[bomberman] realtime ${state}: ${this.dropped} pesan gagal, koneksi mungkin terputus`);
    }
  }

  private reportError(err: unknown): void {
    /* A throw is the same fact the player needs as a 'timedOut' answer: the message never
       left this tab. It joins the same counter so the notice at 20 covers a socket that
       dies outright, and it keeps its own warning flag, because sharing one between the two
       paths let whichever fired first silence the other. */
    this.dropped += 1;
    this.opts.onDrop?.(this.dropped);
    if (this.warnedError) return;
    this.warnedError = true;
    console.warn('[bomberman] broadcast gagal', err);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
