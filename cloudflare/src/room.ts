import { DurableObject } from 'cloudflare:workers';
import type { Env, GameAdapter, ServerMessage, Session } from './types';
import {
  MAX_MESSAGE_CHARS,
  MAX_PLAYERS,
  MAX_STEP_SECONDS,
  MIN_PLAYERS,
  SNAPSHOT_MIN_INTERVAL_SECONDS,
  TICK_SECONDS,
} from './types';
import { MAX_TICKET_TTL_SECONDS, TICKET_TTL_SECONDS, signTicket, verifyTicket } from './ticket';
import { createAdapter } from './games/registry';

interface RoomRow {
  phase: string;
  master: string | null;
  tick: number;
  world: string | null;
}

interface RoomInfo {
  code: string;
  game: string;
}

interface Seat {
  playerId: string;
  seat: number;
  name: string;
}

const ROOM_PATH = /^\/room\/([A-Za-z0-9]{4,12})\/(ws|ticket)$/;
const GAME_SHAPE = /^[a-z0-9-]{2,32}$/;
const PLAYER_SHAPE = /^[0-9a-f]{32}$/;

const newPlayerId = (): string => crypto.randomUUID().replace(/-/g, '');

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export class GameRoom extends DurableObject<Env> {
  private game: GameAdapter | null = null;
  private phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  private master: string | null = null;
  private tick = 0;
  private lastAdvanceMs = 0;
  private lastSnapshotMs = 0;
  private info: RoomInfo | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  /** playerId -> seq terakhir yang sudah dieksekusi dan sudah ikut terbit. */
  private appliedSeq = new Map<string, number>();
  private heldMs = new Map<string, number>();
  private pendingSeq = new Map<string, { seq: number; at: number }>();

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
      `CREATE TABLE IF NOT EXISTS room_info (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         code TEXT NOT NULL,
         game TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_seats (
         player_id TEXT PRIMARY KEY,
         seat INTEGER NOT NULL UNIQUE,
         name TEXT NOT NULL
       )`,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = ROOM_PATH.exec(url.pathname);
    if (!match) return new Response('not found', { status: 404 });
    const code = match[1].toUpperCase();

    // Satu objek DO seharusnya hanya melayani satu kode; kalau path lain yang sampai ke sini,
    // itu tanda pemanggil salah.route, bukan kamar yang boleh dipakai bersama.
    const info = await this.loadInfo();
    if (info && info.code !== code) return json({ error: 'room_conflict' }, 409);

    if (!info) {
      if (match[2] !== 'ticket' || request.method !== 'POST') {
        return json({ error: 'mint_a_ticket_first' }, 412);
      }
    }

    return match[2] === 'ticket'
      ? this.mint(url, request, code, info)
      : this.openSocket(request, url, code, info);
  }

  /**
   * Kursi dialokasikan di sini, bukan di sisi klien, supaya identitas pemain tidak pernah
   * berasal dari query string. Tanda tangannya yang membuat tiket tidak bisa dipalsukan.
   */
  private async mint(url: URL, request: Request, code: string, info: RoomInfo | null): Promise<Response> {
    if (request.method !== 'POST') return new Response('expected post', { status: 405 });
    const secret = this.env.TICKET_SECRET?.trim();
    if (!secret) return json({ error: 'no_secret' }, 500);

    const asked = url.searchParams.get('game') ?? '';
    if (info?.game && asked && asked !== info.game) {
      return json({ error: 'game_conflict', game: info.game }, 409);
    }
    if (!info?.game) {
      if (!GAME_SHAPE.test(asked)) return json({ error: 'bad_game' }, 400);
      this.ctx.storage.sql.exec(
        'INSERT INTO room_info (id, code, game, created_at) VALUES (1, ?, ?, ?)',
        code,
        asked,
        Date.now(),
      );
      info = { code, game: asked };
      this.info = info;
    }

    let seat = this.seatOf(url.searchParams.get('player') ?? '');
    if (!seat) {
      if (url.searchParams.has('player') && !PLAYER_SHAPE.test(url.searchParams.get('player') ?? '')) {
        return json({ error: 'bad_player' }, 400);
      }
      const taken = new Set(this.seats().map((s) => s.seat));
      let index = 0;
      while (taken.has(index)) index += 1;
      if (index >= MAX_PLAYERS) return json({ error: 'room_full' }, 409);
      seat = { playerId: newPlayerId(), seat: index, name: cleanName(url.searchParams.get('name')) };
      this.ctx.storage.sql.exec(
        'INSERT INTO room_seats (player_id, seat, name) VALUES (?, ?, ?)',
        seat.playerId,
        seat.seat,
        seat.name,
      );
    } else if (url.searchParams.get('name')) {
      seat = { ...seat, name: cleanName(url.searchParams.get('name')) };
      this.ctx.storage.sql.exec('UPDATE room_seats SET name = ? WHERE player_id = ?', seat.name, seat.playerId);
    }

    const ttl = this.env.TEST_MODE === '1' ? clampTtl(url.searchParams.get('ttl')) : TICKET_TTL_SECONDS;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const ticket = await signTicket(secret, { code: info.code, playerId: seat.playerId, game: info.game, exp });
    return json({ ticket, playerId: seat.playerId, seat: seat.seat, name: seat.name, game: info.game, exp });
  }

  private async openSocket(request: Request, url: URL, code: string, info: RoomInfo | null): Promise<Response> {
    // Probe hanya hidup saat TEST_MODE: cara tes membaca alasan penolakan, karena handshake
    // WebSocket tidak pernah memperlihatkan body ke klien. Jalur nyata tidak berubah.
    const probe = this.env.TEST_MODE === '1' && url.searchParams.get('probe') === '1';
    if (request.headers.get('Upgrade') !== 'websocket' && !probe) {
      return new Response('expected websocket', { status: 426 });
    }
    if (!info) return json({ error: 'mint_a_ticket_first' }, 412);

    const check = await verifyTicket(this.env.TICKET_SECRET, url.searchParams.get('ticket'), code, Date.now());
    if (!check.ok) return probe ? json({ ok: false, reason: check.reason }, 401) : new Response(check.reason, { status: 401 });
    if (probe) return json({ ok: true, claim: check.claim });

    const seat = this.seatOf(check.claim.playerId);
    if (!seat) return new Response('unknown_seat', { status: 401 });
    if (check.claim.game !== info.game) return new Response('wrong_game', { status: 401 });

    await this.restore();

    // Satu kursi hanya boleh punya satu socket: yang lama diusir, bukan ditumpuk.
    for (const live of this.ctx.getWebSockets()) {
      if (this.sessionOf(live)?.id === seat.playerId) {
        try {
          live.close(4002, 'seat_taken');
        } catch {
          /* sudah tertutup */
        }
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({
      id: seat.playerId,
      seat: seat.seat,
      name: seat.name,
      exp: check.claim.exp,
    } satisfies Session);
    this.ctx.acceptWebSocket(server);

    if (!this.master) this.master = this.hostId() ?? seat.playerId;
    server.send(JSON.stringify({
      t: 'welcome',
      id: seat.playerId,
      seat: seat.seat,
      name: seat.name,
      master: this.master,
      players: this.playerList(),
      exp: check.claim.exp,
    } satisfies ServerMessage));
    await this.broadcast();
    // DO bisa dibekukan setelah pemain terakhir keluar; siapa yang masuk duluan menyalakan lagi.
    if (this.phase === 'playing') this.startTicker();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_CHARS) return;
    const session = this.sessionOf(ws);
    if (!session) return;

    // Tiket yang baru kedaluwarsa ketahuan di pesan berikutnya; tidak perlu timer khusus
    // sampai langkah tick masuk.
    if (session.exp * 1000 <= Date.now()) {
      this.send(ws, { t: 'error', reason: 'expired' });
      try {
        ws.close(4001, 'ticket_expired');
      } catch {
        /* sudah tertutup */
      }
      return;
    }

    let msg: { t?: string; ts?: number; seq?: number; [k: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return this.send(ws, { t: 'error', reason: 'bad_payload' });
    }

    if (msg.t === 'ping') return this.send(ws, { t: 'pong', ts: msg.ts });

    if (msg.t === 'start' || msg.t === 'next') {
      if (session.id !== this.master) return this.send(ws, { t: 'error', reason: 'not_master' });
      if (msg.t === 'start') {
        if (this.sessions().length < MIN_PLAYERS) return this.send(ws, { t: 'error', reason: 'too_few_players' });
        this.game = createAdapter(this.info?.game ?? '', this.env);
        if (!this.game) return this.send(ws, { t: 'error', reason: 'unknown_game' });
      }
      this.phase = 'playing';
      await this.persist(true);
      this.startTicker();
      return;
    }

    if (this.phase !== 'playing' || !this.game) return this.send(ws, { t: 'error', reason: 'wrong_phase' });

    const result = this.game.apply(session.id, msg);
    if (!result.ok) return this.send(ws, { t: 'error', reason: result.reason });
    this.noteInput(session.id, msg.seq);
    // Sengaja tidak broadcast di sini. Yang menyiarkan dunia adalah timer, jadi tiga puluh input
    // dalam satu detik tidak berubah menjadi tiga puluh snapshot keluar.
  }

  /**
   * Dicatat saat aksi diterima, diterbitkan saat tick berikutnya. Selisih dua jam itu adalah `held`:
   * antrean di dalam pemegang sim, terpisah dari perjalanan jaringan yang hanya bisa diukur klien.
   */
  private noteInput(playerId: string, seq: unknown): void {
    if (typeof seq !== 'number' || !Number.isFinite(seq)) return;
    const next = Math.trunc(seq);
    if (next <= (this.appliedSeq.get(playerId) ?? 0)) return;
    this.pendingSeq.set(playerId, { seq: next, at: Date.now() });
  }

  private publishApplied(): void {
    if (!this.pendingSeq.size) return;
    const nowMs = Date.now();
    for (const [playerId, entry] of this.pendingSeq) {
      this.appliedSeq.set(playerId, entry.seq);
      this.heldMs.set(playerId, nowMs - entry.at);
    }
    this.pendingSeq.clear();
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
    this.appliedSeq.delete(session.id);
    this.heldMs.delete(session.id);
    this.pendingSeq.delete(session.id);
    if (this.master === session.id) this.master = this.sessions()[0]?.session.id ?? null;
    if (!this.sessions().length) this.stopTicker();
    await this.persist(true);
    await this.broadcast();
  }

  /**
   * Timer biasa, bukan Alarm: Alarm punya granularity detik dan tidak cocok untuk 20 Hz.
   * Yang dilarang dokumentasi Cloudflare adalah memakai `waitUntil()` untuk menahan objek
   * tetap hidup, bukan memakai `setInterval` selama masih ada WebSocket terbuka.
   */
  private startTicker(): void {
    if (this.tickTimer) return;
    this.lastAdvanceMs = Date.now();
    this.tickTimer = setInterval(() => {
      void this.tickOnce();
    }, TICK_SECONDS * 1000);
  }

  private stopTicker(): void {
    if (!this.tickTimer) return;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private async tickOnce(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.advanceClock();
      if (this.sessions().length) await this.broadcast();
    } finally {
      this.ticking = false;
    }
  }

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
      this.stopTicker();
      await this.persist(true);
    } else if (now - this.lastSnapshotMs > SNAPSHOT_MIN_INTERVAL_SECONDS * 1000) {
      await this.persist(false);
    }
  }

  private async broadcast(): Promise<void> {
    this.publishApplied();
    const text = JSON.stringify({
      t: 'state',
      phase: this.phase,
      master: this.master,
      tick: this.tick,
      players: this.playerList(),
      world: this.game ? this.game.snapshot() : null,
      applied: this.mapBySeat(this.appliedSeq),
      held: this.mapBySeat(this.heldMs),
    } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        /* socket mati, close handler yang membereskan */
      }
    }
  }

  /** Peta kursi -> nilai, sama seperti bentuk yang dipakai metrik netbench. */
  private mapBySeat(values: Map<string, number>): Record<number, number> {
    const out: Record<number, number> = {};
    for (const s of this.sessions()) out[s.session.seat] = values.get(s.session.id) ?? 0;
    return out;
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
    if (!this.info?.game || this.game) return;
    const row = this.ctx.storage.sql.exec(
      'SELECT phase, master, tick, world FROM room_state WHERE id = 1',
    ).toArray()[0] as unknown as RoomRow | undefined;
    if (!row) return;
    this.phase = row.phase as typeof this.phase;
    this.master = row.master;
    this.tick = row.tick;
    if (row.world) {
      const adapter = createAdapter(this.info.game, this.env);
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

  private async loadInfo(): Promise<RoomInfo | null> {
    if (this.info) return this.info;
    const row = this.ctx.storage.sql.exec('SELECT code, game FROM room_info WHERE id = 1').toArray()[0] as
      | { code: string; game: string }
      | undefined;
    this.info = row ? { code: row.code, game: row.game } : null;
    return this.info;
  }

  private seats(): Seat[] {
    return this.ctx.storage.sql
      .exec('SELECT player_id AS playerId, seat, name FROM room_seats ORDER BY seat')
      .toArray() as unknown as Seat[];
  }

  private seatOf(playerId: string): Seat | null {
    if (!PLAYER_SHAPE.test(playerId)) return null;
    const hit = this.ctx.storage.sql
      .exec('SELECT player_id AS playerId, seat, name FROM room_seats WHERE player_id = ?', playerId)
      .toArray()[0] as unknown as Seat | undefined;
    return hit ?? null;
  }

  /** Kursi 0 adalah pembuat kamar, jadi tuan rumah tidak ditentukan oleh siapa yang duluan nyambung. */
  private hostId(): string | null {
    const row = this.ctx.storage.sql.exec('SELECT player_id FROM room_seats WHERE seat = 0').toArray()[0] as
      | { player_id: string }
      | undefined;
    return row?.player_id ?? null;
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

/** Hanya dipakai saat TEST_MODE=1, supaya tes bisa membuat tiket yang benar-benar kedaluwarsa. */
function clampTtl(raw: string | null): number {
  const asked = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(asked) || asked < 1) return TICKET_TTL_SECONDS;
  return Math.min(asked, MAX_TICKET_TTL_SECONDS);
}
