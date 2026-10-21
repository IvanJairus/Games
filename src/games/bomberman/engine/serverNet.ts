import type { BombermanState, Facing, SimEvent } from './types';

/**
 * The client door for Bomberman's Durable Object.
 *
 * Different from the Supabase `BombermanNet`: this tab never holds the world. It sends
 * intent and renders the frames the server publishes. Two decisions keep the upload small
 * and the controls responsive:
 *
 * - only a *change* of direction is sent, not one message every tick. The server holds the
 *   last direction, exactly like the old host did, so a held key needs no traffic at all;
 * - a bomb press is its own immediate message, so it does not wait for the next 50 ms sample.
 *
 * `seq` still moves on every message. The rule book rejects a sequence that does not advance,
 * which is what stops a reconnect from replaying an old press.
 */

// The Worker ticks at 30 Hz (TICK_SECONDS = 0.033). The poll is only a safety net:
// key/touch changes call flush() immediately and the render loop also calls it per frame.
const POLL_MS = 33;
const RETRY_BASE_MS = 400;
const RETRY_CAP_MS = 6000;
/** Codes the server sends on purpose: retrying would only knock on a closed door. */
const TERMINAL_CODES = new Set([1000, 4001, 4002]);

export interface DoorConfig {
  seats: 2 | 4;
  size: 'kecil' | 'besar';
}

export interface DoorWelcome {
  t: 'welcome';
  id: string;
  seat: number;
  name: string;
  master: string | null;
  players: { id: string; name: string; seat?: number }[];
  exp: number;
  config?: unknown;
}

export interface DoorState {
  t: 'state';
  phase: string;
  master: string | null;
  tick: number;
  players: { id: string; name: string; seat?: number }[];
  world: BombermanState | null;
  applied: Record<number, number>;
  held: Record<number, number>;
  fx: SimEvent[];
}

export interface DoorMeta {
  master: string | null;
  phase: string;
  players: { id: string; name: string; seat?: number }[];
  tick: number;
}

export interface ServerNetOptions {
  /** Complete socket URL, ticket already attached. The engine never reads import.meta.env. */
  wsUrl: string;
  /** Read live: the seat and the direction can change between ticks. */
  getDir: () => Facing | null;
  onWelcome: (info: DoorWelcome) => void;
  onWorld: (world: BombermanState) => void;
  onMeta?: (meta: DoorMeta) => void;
  onFx: (events: SimEvent[]) => void;
  /** 'up' when the socket is ready, 'down' when it closes or is refused. */
  onLink: (state: 'up' | 'down', detail?: string) => void;
  /** Mint a fresh ticket after an abnormal close. Without it, a retry keeps the old seat. */
  reconnect?: () => Promise<string>;
  socket?: typeof WebSocket;
  maxRetries?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

const isWorld = (value: unknown): value is BombermanState => {
  const world = value as Partial<BombermanState> | null;
  return (
    !!world &&
    Array.isArray(world.players) &&
    Array.isArray(world.grid) &&
    typeof world.phase === 'string' &&
    typeof world.round === 'number' &&
    typeof world.cols === 'number' &&
    typeof world.rows === 'number'
  );
};

export const parseDoorConfig = (raw: unknown): DoorConfig | null => {
  if (!isRecord(raw)) return null;
  const seats = raw.seats === 2 ? 2 : raw.seats === 4 ? 4 : null;
  const size = raw.size === 'kecil' || raw.size === 'besar' ? raw.size : null;
  return seats !== null && size !== null ? { seats, size } : null;
};

export class BombermanServerNet {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private lastDir: Facing | null | undefined = undefined;
  private stopped = false;
  private retries = 0;
  private currentUrl: string;
  /** Seat assigned by the Worker, used to read `applied[seat]`. */
  seat: number | null = null;
  readonly stats = { sent: 0, received: 0, drop: 0, lastError: 'init', lastTick: -1, reconnects: 0 };

  constructor(private opts: ServerNetOptions) {
    this.currentUrl = opts.wsUrl;
  }

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
        /* already closed */
      }
    }
  }

  sendStart(fillBots: boolean): void {
    this.raw({ t: 'start', fillBots });
  }

  sendChar(charId: string): void {
    this.raw({ t: 'char', charId });
  }

  /** One press, one message. The server's sim decides whether it is a legal plant. */
  sendPress(): void {
    const dir = this.opts.getDir();
    this.lastDir = dir;
    this.seq += 1;
    this.raw({ t: 'input', seq: this.seq, dir, bomb: true });
  }

  /**
   * Sends the held direction if it changed. The render loop can call this every frame: it
   * costs one comparison and no traffic while the player keeps a key down.
   */
  flush(force = false): void {
    const dir = this.opts.getDir();
    if (!force && dir === this.lastDir) return;
    this.lastDir = dir;
    this.seq += 1;
    this.raw({ t: 'input', seq: this.seq, dir, bomb: false });
  }

  private open(): void {
    const SocketImpl = this.opts.socket ?? (globalThis.WebSocket as typeof WebSocket | undefined);
    if (!SocketImpl) {
      this.opts.onLink('down', 'websocket-tidak-tersedia');
      return;
    }
    const ws = new SocketImpl(this.currentUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.lastDir = undefined;
      this.opts.onLink('up');
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this.flush(), POLL_MS);
      // The server starts with no held direction. Say the current one once.
      this.flush(true);
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
   * A dropped socket is usually a phone changing network. The ticket is bound to a seat that
   * the Worker releases when the socket closes, so the retry asks for a fresh ticket for the
   * same player id instead of presenting a ticket whose seat no longer exists.
   */
  private scheduleRetry(): void {
    const max = this.opts.maxRetries ?? 4;
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
      void this.retry();
    }, delay);
  }

  private async retry(): Promise<void> {
    if (this.stopped) return;
    try {
      if (this.opts.reconnect) this.currentUrl = await this.opts.reconnect();
    } catch (err) {
      this.stats.lastError = 'reconnect-failed';
      this.opts.onLink('down', err instanceof Error ? err.message : 'reconnect-failed');
      return;
    }
    if (!this.stopped) this.open();
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
    if (msg.t !== 'state') return;

    const state = msg as unknown as DoorState;
    if (typeof state.tick === 'number' && state.tick > this.stats.lastTick) this.stats.lastTick = state.tick;
    this.opts.onMeta?.({
      master: state.master ?? null,
      phase: typeof state.phase === 'string' ? state.phase : 'lobby',
      players: Array.isArray(state.players) ? state.players : [],
      tick: typeof state.tick === 'number' ? state.tick : 0,
    });
    if (isWorld(state.world)) this.opts.onWorld(state.world);
    if (Array.isArray(state.fx) && state.fx.length) this.opts.onFx(state.fx);
  }
}
