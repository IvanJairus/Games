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

export interface ServerNetOptions {
  /** URL socket lengkap, sudah membawa tiket. Dibuat pemanggil supaya engine tidak kenal env. */
  wsUrl: string;
  getInput: () => InputState;
  onWelcome: (info: DoorWelcome) => void;
  onWorld: (snap: WorldSnapshot) => void;
  onFx: (events: SimEvent[]) => void;
  /** 'up' saat socket siap, 'down' saat tertutup atau ditolak. */
  onLink: (state: 'up' | 'down', detail?: string) => void;
  socket?: typeof WebSocket;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

const isWorld = (v: unknown): v is WorldSnapshot =>
  isRecord(v) && Array.isArray(v.players) && typeof v.phase === 'string' && typeof v.round === 'number';

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
  private seq = 0;
  private firedSlap = false;
  private firedDash = false;
  /** Sama seperti ArenaNet: dibaca lewat window.__slapNet untuk memisahkan "tidak kirim" dan "tidak terima". */
  readonly stats = { sent: 0, received: 0, drop: 0, lastError: 'init', lastTick: -1 };

  constructor(private opts: ServerNetOptions) {}

  start(): void {
    const SocketImpl = this.opts.socket ?? (globalThis.WebSocket as typeof WebSocket | undefined);
    if (!SocketImpl) {
      this.opts.onLink('down', 'websocket-tidak-tersedia');
      return;
    }
    const ws = new SocketImpl(this.opts.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.opts.onLink('up');
      this.timer = setInterval(() => this.tick(), TICK_MS);
    };
    ws.onmessage = (event) => this.receive(String(event.data));
    ws.onclose = (event) => {
      this.stop();
      this.opts.onLink('down', typeof event.code === 'number' ? `close-${event.code}` : 'closed');
    };
    ws.onerror = () => {
      this.stats.lastError = 'socket-error';
    };
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Perintah lorong. Master ditentukan server; kalau bukan, pintu membalas unknown_player. */
  sendStart(): void {
    this.raw({ t: 'start' });
  }

  sendNextRound(): void {
    this.raw({ t: 'nextRound' });
  }

  private tick(): void {
    const input = this.opts.getInput();
    this.seq += 1;
    const slapPressed = !!input.slap && !this.firedSlap;
    const dashPressed = !!input.dash && !this.firedDash;
    this.firedSlap = !!input.slap;
    this.firedDash = !!input.dash;
    this.raw({
      t: 'input',
      seq: this.seq,
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
      this.opts.onWelcome(msg as unknown as DoorWelcome);
      return;
    }
    if (msg.t === 'error') {
      this.stats.lastError = String(msg.reason ?? 'error');
      return;
    }
    if (msg.t !== 'state') return;
    const state = msg as unknown as DoorState;
    if (state.tick > this.stats.lastTick) this.stats.lastTick = state.tick;
    if (isWorld(state.world)) this.opts.onWorld(state.world);
    if (Array.isArray(state.fx) && state.fx.length) this.opts.onFx(state.fx);
  }
}
