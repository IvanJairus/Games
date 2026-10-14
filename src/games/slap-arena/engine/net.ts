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
}

export function encodeInput(msg: InputMessage): InputMessage {
  return { ...msg, x: Math.round(msg.x * 100) / 100, z: Math.round(msg.z * 100) / 100 };
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
  private dropped = 0;
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
        payload: encodeInput({ id: localId, name: playerName, color: playerColor, x: input.x, z: input.z, slap: input.slap, dash: input.dash }),
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
        if (state !== 'sent' && state !== 'pending') this.noteDrop(state);
      });
    }
  }

  private noteDrop(state: string): void {
    // supabase-js answers 'timedOut'/'closed' instead of throwing and quietly falls back
    // to one REST POST per message when the socket cannot push.
    this.dropped++;
    if (this.dropped >= 20 && !this.warned) {
      this.warned = true;
      console.warn(`[slap-arena] realtime ${state}: ${this.dropped} pesan gagal, koneksi mungkin terputus`);
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
