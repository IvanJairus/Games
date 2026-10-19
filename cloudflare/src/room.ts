import { DurableObject } from 'cloudflare:workers';
import type { Env, GameAdapter, Session } from './types';
import {
  MAX_MESSAGE_CHARS,
  MAX_PLAYERS,
  MAX_STEP_SECONDS,
  MIN_PLAYERS,
  SNAPSHOT_MIN_INTERVAL_SECONDS,
  TICK_SECONDS,
} from './types';
import { createAdapter } from './games/registry';

interface RoomRow {
  phase: string;
  master: string | null;
  tick: number;
  world: string | null;
}

export class GameRoom extends DurableObject<Env> {
  private game: GameAdapter | null = null;
  private phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  private master: string | null = null;
  private tick = 0;
  private lastAdvanceMs = 0;
  private lastSnapshotMs = 0;
  private gameCode = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         phase TEXT NOT NULL,
         master TEXT,
         tick INTEGER NOT NULL,
         world TEXT,
         updated_at INTEGER NOT NULL
       )`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_players (
         token TEXT PRIMARY KEY,
         id TEXT NOT NULL,
         name TEXT NOT NULL
       )`,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/ws')) return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (this.sessions().length >= MAX_PLAYERS) return new Response('room full', { status: 409 });

    this.gameCode = url.searchParams.get('game') ?? '';
    await this.restore();

    const requestedToken = url.searchParams.get('token');
    const existing = requestedToken ? this.lookupToken(requestedToken) : null;
    const id = existing?.id ?? crypto.randomUUID().slice(0, 8);
    const token = existing?.token ?? crypto.randomUUID();
    const name = cleanName(url.searchParams.get('name'));

    if (!existing) this.rememberToken(token, id, name);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ id, token, name } satisfies Session);
    this.ctx.acceptWebSocket(server);

    if (!this.master) this.master = id;
    server.send(JSON.stringify({
      t: 'welcome',
      id,
      token,
      master: this.master,
      players: this.playerList(),
    }));
    await this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_CHARS) return;
    const session = this.sessionOf(ws);
    if (!session) return;

    let msg: { t?: string; ts?: number; seq?: number; [k: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return this.send(ws, { t: 'error', reason: 'bad_payload' });
    }

    if (msg.t === 'ping') return this.send(ws, { t: 'pong', ts: msg.ts });

    await this.advanceClock();

    if (msg.t === 'start' || msg.t === 'next') {
      if (session.id !== this.master) return this.send(ws, { t: 'error', reason: 'not_master' });
      if (msg.t === 'start') {
        if (this.sessions().length < MIN_PLAYERS) return this.send(ws, { t: 'error', reason: 'too_few_players' });
        this.game = createAdapter(this.gameCode, this.env);
        if (!this.game) return this.send(ws, { t: 'error', reason: 'unknown_game' });
      }
      this.phase = 'playing';
      await this.persist(true);
      return this.broadcast();
    }

    if (this.phase !== 'playing' || !this.game) return this.send(ws, { t: 'error', reason: 'wrong_phase' });

    const result = this.game.apply(session.id, msg);
    if (!result.ok) return this.send(ws, { t: 'error', reason: result.reason });
    await this.broadcast();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.dropSession(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropSession(ws);
  }

  private async dropSession(ws: WebSocket): Promise<void> {
    const session = this.sessionOf(ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    if (!session) return;
    if (this.game) this.game.removePlayer(session.id);
    if (this.master === session.id) this.master = this.sessions()[0]?.session.id ?? null;
    await this.persist(true);
    await this.broadcast();
  }

  /**
   * Cloudflare melarang waitUntil dipakai untuk menahan objek tetap hidup, jadi dunia
   * dimajukan berdasarkan jam nyata setiap kali ada pesan masuk, bukan dari timer sendiri.
   */
  private async advanceClock(): Promise<void> {
    if (this.phase !== 'playing' || !this.game) {
      this.lastAdvanceMs = Date.now();
      return;
    }
    const now = Date.now();
    if (!this.lastAdvanceMs) this.lastAdvanceMs = now;
    let remaining = Math.min((now - this.lastAdvanceMs) / 1000, MAX_STEP_SECONDS);
    this.lastAdvanceMs = now;
    while (remaining >= TICK_SECONDS) {
      this.game.step(TICK_SECONDS);
      this.tick += 1;
      remaining -= TICK_SECONDS;
    }
    if (this.game.finished()) {
      this.phase = 'finished';
      await this.persist(true);
    } else if (now - this.lastSnapshotMs > SNAPSHOT_MIN_INTERVAL_SECONDS * 1000) {
      await this.persist(false);
    }
  }

  private async broadcast(): Promise<void> {
    const text = JSON.stringify({
      t: 'state',
      phase: this.phase,
      master: this.master,
      tick: this.tick,
      players: this.playerList(),
      world: this.game ? this.game.snapshot() : null,
    });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        /* socket mati, close handler yang membereskan */
      }
    }
  }

  private async persist(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastSnapshotMs < SNAPSHOT_MIN_INTERVAL_SECONDS * 1000) return;
    this.lastSnapshotMs = now;
    const world = this.game ? JSON.stringify(this.game.snapshot()) : null;
    this.ctx.storage.sql.exec(
      `INSERT INTO room_state (id, phase, master, tick, world, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET phase = excluded.phase, master = excluded.master,
         tick = excluded.tick, world = excluded.world, updated_at = excluded.updated_at`,
      this.phase,
      this.master,
      this.tick,
      world,
      now,
    );
  }

  private async restore(): Promise<void> {
    if (!this.gameCode || this.game) return;
    const row = this.ctx.storage.sql.exec(
      'SELECT phase, master, tick, world FROM room_state WHERE id = 1',
    ).toArray()[0] as unknown as RoomRow | undefined;
    if (!row) return;
    this.phase = row.phase as typeof this.phase;
    this.master = row.master;
    this.tick = row.tick;
    if (row.world) {
      const adapter = createAdapter(this.gameCode, this.env);
      if (adapter) {
        adapter.load(JSON.parse(row.world));
        this.game = adapter;
        this.lastSnapshotMs = Date.now();
      }
    }
  }

  private sessions(): { ws: WebSocket; session: Session }[] {
    const out: { ws: WebSocket; session: Session }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Session | null;
      if (attachment?.id) out.push({ ws, session: attachment });
    }
    return out;
  }

  private sessionOf(ws: WebSocket): Session | null {
    return (ws.deserializeAttachment() as Session | null) ?? null;
  }

  private playerList(): { id: string; name: string }[] {
    return this.sessions().map((s) => ({ id: s.session.id, name: s.session.name }));
  }

  private lookupToken(token: string): { token: string; id: string; name: string } | null {
    const hit = this.ctx.storage.sql.exec(
      'SELECT token, id, name FROM room_players WHERE token = ?', token,
    ).toArray()[0] as { token: string; id: string; name: string } | undefined;
    return hit ?? null;
  }

  private rememberToken(token: string, id: string, name: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO room_players (token, id, name) VALUES (?, ?, ?)
       ON CONFLICT (token) DO UPDATE SET id = excluded.id, name = excluded.name`,
      token, id, name,
    );
  }

  private send(ws: WebSocket, msg: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket mati */
    }
  }
}

function cleanName(raw: string | null): string {
  return (raw ?? '').replace(/[<>&]/g, '').trim().slice(0, 12) || 'Pemain';
}
