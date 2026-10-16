import type { RealtimeChannel } from '@supabase/supabase-js';
import type { InputState, SimEvent, WorldSnapshot } from './types';

export const EV_INPUT = 'sa_in';
export const EV_SNAPSHOT = 'sa_snap';
export const EV_FX = 'sa_fx';
export const TICK_MS = 50;

export interface InputMessage {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  slap: boolean;
  dash: boolean;
  held?: boolean;
  charge?: number;
  /** Bumped by the sender on every action; the host fires on a change, not on the flag. */
  seq?: number;
}

/**
 * The host writes whatever arrives straight into the sim, and `isInputMessage` only
 * checks the movement keys. A `NaN` charge would poison `vx` for the rest of the round,
 * so the number is clamped here rather than trusted later.
 */
export function encodeInput(msg: InputMessage): InputMessage {
  const raw = Number.isFinite(msg.charge) ? (msg.charge as number) : 0;
  const charge = Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
  return {
    ...msg,
    x: Math.round(msg.x * 100) / 100,
    z: Math.round(msg.z * 100) / 100,
    charge,
  };
}

export function isInputMessage(payload: unknown): payload is InputMessage {
  const p = payload as Partial<InputMessage> | null;
  return !!p && typeof p.id === 'string' && typeof p.x === 'number' && typeof p.z === 'number';
}

export function isSnapshot(payload: unknown): payload is WorldSnapshot {
  const p = payload as Partial<WorldSnapshot> | null;
  return !!p && Array.isArray(p.players) && typeof p.phase === 'string' && typeof p.round === 'number';
}

export function isFxBatch(payload: unknown): payload is SimEvent[] {
  return Array.isArray(payload);
}

/**
 * Builds the host-side rule for "is this message an action, or a sender repeating itself".
 *
 * A sender that numbers its actions fires only when the number moves, which is what lets
 * it keep the flags up between 50 ms ticks without firing twice. A sender with no number
 * is a client from before the charge, whose flags were the whole signal, so those are
 * taken at face value.
 */
export function makeActionEdge(): (msg: Pick<InputMessage, 'id' | 'seq'>) => boolean {
  const seen: Record<string, number> = {};
  return (msg) => {
    if (typeof msg.seq !== 'number') return true;
    const changed = msg.seq !== (seen[msg.id] ?? 0);
    seen[msg.id] = msg.seq;
    return changed;
  };
}

export interface ArenaNetOptions {
  channel: RealtimeChannel;
  /** Read live: host election happens after the first room sync, not at construction. */
  isHost: () => boolean;
  localId: string;
  playerName: string;
  playerColor: string;
  getInput: () => InputState;
  getSnapshot: () => WorldSnapshot;
  drainFx: () => SimEvent[];
  onInput: (msg: InputMessage) => void;
  onSnapshot: (snap: WorldSnapshot) => void;
  onFx: (events: SimEvent[]) => void;
}

/**
 * Host-authoritative link. Clients report intent, the host reports the world.
 * Every broadcast binding lives here and is registered before start(), so no event
 * name can drift between sender and receiver.
 */
export class ArenaNet {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshotT = -Infinity;
  private warned = false;
  /** Read through window.__slapNet in dev; the only way to tell "not sent" from "not received". */
  readonly stats = { sent: 0, drop: 0, byEvent: {} as Record<string, number>, lastState: 'init' };

  constructor(private opts: ArenaNetOptions) {}

  start(): void {
    const { channel } = this.opts;
    channel.on('broadcast', { event: EV_INPUT }, (msg: { payload: unknown }) => {
      if (!this.opts.isHost()) return;
      const payload = msg.payload;
      if (isInputMessage(payload) && payload.id !== this.opts.localId) this.opts.onInput(payload);
    });
    channel.on('broadcast', { event: EV_SNAPSHOT }, (msg: { payload: unknown }) => {
      if (this.opts.isHost()) return;
      const payload = msg.payload;
      if (!isSnapshot(payload) || payload.t < this.lastSnapshotT) return;
      this.lastSnapshotT = payload.t;
      this.opts.onSnapshot(payload);
    });
    channel.on('broadcast', { event: EV_FX }, (msg: { payload: unknown }) => {
      if (this.opts.isHost()) return;
      if (isFxBatch(msg.payload)) this.opts.onFx(msg.payload);
    });
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Called when this client becomes host mid-match so old snapshots are ignored. */
  resetClock(): void {
    this.lastSnapshotT = -Infinity;
  }

  private tick(): void {
    const { isHost, localId, playerName, playerColor } = this.opts;
    if (isHost()) {
      this.send({ type: 'broadcast', event: EV_SNAPSHOT, payload: this.opts.getSnapshot() });
      const fx = this.opts.drainFx();
      if (fx.length) this.send({ type: 'broadcast', event: EV_FX, payload: fx });
    } else {
      const input = this.opts.getInput();
      this.send({
        type: 'broadcast',
        event: EV_INPUT,
        payload: encodeInput({
          id: localId,
          name: playerName,
          color: playerColor,
          x: input.x,
          z: input.z,
          slap: input.slap,
          dash: input.dash,
          held: input.held ?? false,
          charge: input.charge ?? 0,
          seq: input.seq ?? 0,
        }),
      });
    }
  }

  private send(args: { type: 'broadcast'; event: string; payload: unknown }): void {
    let sent: unknown;
    this.stats.sent++;
    this.stats.byEvent[args.event] = (this.stats.byEvent[args.event] ?? 0) + 1;
    try {
      sent = this.opts.channel.send(args);
    } catch (err) {
      this.reportError(err);
      return;
    }
    if (sent && typeof (sent as Promise<string>).then === 'function') {
      (sent as Promise<string>).then((state) => {
        this.stats.lastState = state;
        // Realtime answers a broadcast with 'ok', and resolves 'ok' without waiting when
        // the channel has no broadcast ack. 'error' and 'timed out' are the only failures.
        if (state !== 'ok') this.noteDrop(state);
      });
    }
  }

  private noteDrop(state: string): void {
    // supabase-js answers 'timed out'/'error' instead of throwing and quietly falls back
    // to one REST POST per message when the socket cannot push.
    this.stats.drop++;
    if (this.stats.drop >= 20 && !this.warned) {
      this.warned = true;
      console.warn(`[slap-arena] realtime ${state}: ${this.stats.drop} pesan gagal, koneksi mungkin terputus`);
    }
  }

  private reportError(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('[slap-arena] broadcast gagal', err);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
