import { TICK_MS } from './net';
import type { InputState, SimEvent, WorldSnapshot } from './types';

export interface DoorState {
  t: 'state';
  phase: string;
  master: string | null;
  tick: number;
  players: { id: string; name: string }[];
  world: WorldSnapshot | null;
  applied: Record<number, number>;
  held: Record<number, number>;
  fx: SimEvent[];
}

export interface DoorWelcome {
  t: 'welcome';
  id: string;
  seat: number;
  name: string;
  master: string | null;
  players: { id: string; name: string }[];
  exp: number;
}

/** What the room looks like right now, independent of the world inside it. */
export interface DoorMeta {
  master: string | null;
  phase: string;
  players: { id: string; name: string }[];
}

export interface ServerNetOptions {
  /** URL socket lengkap, sudah membawa tiket. Dibuat pemanggil supaya engine tidak kenal env. */
  wsUrl: string;
  getInput: () => InputState;
  onWelcome: (info: DoorWelcome) => void;
  /**
   * `applied` is the highest input sequence the host has already simulated for this seat.
   * Reconciliation needs it to know which pending inputs are still worth replaying.
   */
  onWorld: (snap: WorldSnapshot, applied?: number) => void;
  /** Fired for every state frame, including the ones whose world is null. */
  onMeta?: (meta: DoorMeta) => void;
  onFx: (events: SimEvent[]) => void;
  /** 'up' saat socket siap, 'down' saat tertutup atau ditolak. */
  onLink: (state: 'up' | 'down', detail?: string) => void;
  /** Called with the exact input and sequence that just went on the wire. */
  onInputSent?: (seq: number, input: InputState) => void;
  /**
   * Dipanggil setelah tick membaca input dan menghitung tepi slap/dash. Pengirim memakai ini
   * untuk melipat bendera aksinya; tanpa ini bendera yang tidak pernah turun membuat tepi
   * berikutnya dianggap replay dan hanya slap pertama yang pernah sampai ke server.
   */
  onActionsRead?: () => void;
  socket?: typeof WebSocket;
  /** Reconnect attempts after an abnormal drop. 0 disables the retry loop. */
  maxRetries?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

const isWorld = (v: unknown): v is WorldSnapshot =>
  isRecord(v) && Array.isArray(v.players) && typeof v.phase === 'string' && typeof v.round === 'number';

/** Codes the server sends on purpose: retrying would only knock on a closed door. */
const TERMINAL_CODES = new Set([1000, 4001, 4002]);
const RETRY_BASE_MS = 400;
const RETRY_CAP_MS = 6000;
/**
 * A ping a second is enough to follow a phone changing networks, and cheap enough that it
 * never competes with the 30 inputs a second the same socket carries.
 */
const PING_INTERVAL_MS = 1000;
/** One bad sample must nudge the rewind, not throw the slap across the island. */
const RTT_SMOOTHING = 0.75;

/**
 * Pintu klien untuk Durable Object: dunia dihitung server, jadi kursi ini tidak pernah memegang
 * aturan. Yang dikirim hanya niat, dan nomor aksi maju setiap tick supaya gerak yang berubah di
 * tengah tick tidak dianggap replay oleh pintu di server.
 *
 * Itu beda dari konvensi `ArenaNet`: di sana `seq` naik saat aksi dan host memakai `actionEdge`
 * untuk menolak flag yang tertahan. Pintu server menolak seq yang tidak maju, jadi nomornya yang
 * jalan terus dan slap/dash yang dipotong ke satu tick.
 */
export class ArenaServerNet {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private firedSlap = false;
  private firedDash = false;
  /** Seat yang diberikan Worker, dipakai untuk membaca `applied[seat]`. */
  private seat: number | null = null;
  /** A deliberate stop must never be turned into a reconnect loop. */
  private stopped = false;
  private retries = 0;
  /** Sama seperti ArenaNet: dibaca lewat window.__slapNet untuk memisahkan "tidak kirim" dan "tidak terima". */
  readonly stats = { sent: 0, received: 0, drop: 0, lastError: 'init', lastTick: -1, reconnects: 0, rtt: 0 };
  /** Smoothed round trip in milliseconds. 0 until the first pong comes back. */
  private rttMs = 0;
  private lastPingAt = 0;

  constructor(private opts: ServerNetOptions) {}

  start(): void {
    this.stopped = false;
    this.retries = 0;
    this.open();
  }

  /** Terminal: closes the socket so the Worker drops the seat instead of counting a ghost. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close(1000, 'client_stop');
      } catch {
        /* sudah tertutup */
      }
    }
  }

  /** Perintah lorong. Master ditentukan server; kalau bukan, pintu membalas unknown_player. */
  sendStart(): void {
    this.raw({ t: 'start' });
  }

  sendNextRound(): void {
    this.raw({ t: 'nextRound' });
  }

  private open(): void {
    const SocketImpl = this.opts.socket ?? (globalThis.WebSocket as typeof WebSocket | undefined);
    if (!SocketImpl) {
      this.opts.onLink('down', 'websocket-tidak-tersedia');
      return;
    }
    const ws = new SocketImpl(this.opts.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.opts.onLink('up');
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), TICK_MS);
    };
    ws.onmessage = (event) => this.receive(String(event.data));
    ws.onclose = (event) => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.ws === ws) this.ws = null;
      if (this.stopped) return;
      const code = typeof event.code === 'number' ? event.code : 1006;
      if (TERMINAL_CODES.has(code)) {
        this.stopped = true;
        this.opts.onLink('down', `close-${code}`);
        return;
      }
      this.stats.lastError = `close-${code}`;
      this.scheduleRetry();
    };
    ws.onerror = () => {
      this.stats.lastError = 'socket-error';
    };
  }

  /**
   * A dropped socket is usually a tunnel or a phone switching networks, not a dead room. The
   * seat id is persisted by the caller, so re-opening the same ticket reclaims the same seat
   * instead of minting a ghost.
   */
  private scheduleRetry(): void {
    const max = this.opts.maxRetries ?? 5;
    if (this.retries >= max) {
      this.stopped = true;
      this.opts.onLink('down', 'give-up');
      return;
    }
    this.opts.onLink('down', 'retrying');
    const delay = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** this.retries);
    this.retries += 1;
    this.stats.reconnects += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private tick(): void {
    const now = Date.now();
    // The door answers ping with the same `ts`, which is the only clock both ends agree on.
    if (now - this.lastPingAt >= PING_INTERVAL_MS) {
      this.lastPingAt = now;
      this.raw({ t: 'ping', ts: now });
    }

    const input = this.opts.getInput();
    this.seq += 1;
    const slapPressed = !!input.slap && !this.firedSlap;
    const dashPressed = !!input.dash && !this.firedDash;
    this.firedSlap = !!input.slap;
    this.firedDash = !!input.dash;
    this.opts.onActionsRead?.();
    // Record before the send: the sender is the only place that knows which seq this input
    // was given, and reconciliation needs the pair.
    this.opts.onInputSent?.(this.seq, {
      x: input.x,
      z: input.z,
      slap: slapPressed,
      dash: dashPressed,
      held: !!input.held,
      charge: input.charge ?? 0,
    });
    this.raw({
      t: 'input',
      seq: this.seq,
      // The door turns this into a rewind for the hit test. It is a measurement, not a
      // claim: the door clamps it and computes the window itself.
      rtt: Math.round(this.rttMs),
      input: {
        x: input.x,
        z: input.z,
        held: !!input.held,
        charge: input.charge ?? 0,
        // Satu tekanan satu aksi: server menyimpan flag ini sampai dimakan sim.
        slap: slapPressed,
        dash: dashPressed,
      },
    });
  }

  private raw(action: Record<string, unknown>): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) {
      this.stats.drop += 1;
      return;
    }
    this.stats.sent += 1;
    try {
      ws.send(JSON.stringify(action));
    } catch {
      this.stats.drop += 1;
    }
  }

  private receive(text: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      this.stats.lastError = 'bad-json';
      return;
    }
    if (!isRecord(msg) || typeof msg.t !== 'string') return;
    this.stats.received += 1;
    if (msg.t === 'welcome') {
      const welcome = msg as unknown as DoorWelcome;
      this.seat = typeof welcome.seat === 'number' ? welcome.seat : null;
      this.opts.onWelcome(welcome);
      return;
    }
    if (msg.t === 'error') {
      this.stats.lastError = String(msg.reason ?? 'error');
      return;
    }
    if (msg.t === 'pong') {
      const sentAt = typeof msg.ts === 'number' ? msg.ts : 0;
      if (sentAt > 0) {
        const sample = Math.max(0, Date.now() - sentAt);
        this.rttMs = this.rttMs > 0 ? this.rttMs * RTT_SMOOTHING + sample * (1 - RTT_SMOOTHING) : sample;
        this.stats.rtt = Math.round(this.rttMs);
      }
      return;
    }
    if (msg.t !== 'state') return;
    const state = msg as unknown as DoorState;
    if (state.tick > this.stats.lastTick) this.stats.lastTick = state.tick;
    this.opts.onMeta?.({
      master: state.master ?? null,
      phase: state.phase,
      players: Array.isArray(state.players) ? state.players : [],
    });
    if (isWorld(state.world)) {
      const applied =
        this.seat !== null && isRecord(state.applied) ? state.applied[this.seat] : undefined;
      this.opts.onWorld(state.world, typeof applied === 'number' ? applied : undefined);
    }
    if (Array.isArray(state.fx) && state.fx.length) this.opts.onFx(state.fx);
  }
}
