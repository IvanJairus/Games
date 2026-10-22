import type { Env } from './types';

export interface FinishedMatch {
  roomCode: string;
  game: string;
  /** Kapasitas kursi di DO, dipakai hanya kalau kamar ini belum punya baris sama sekali. */
  seats: number;
  winnerSeat: number | null;
}

export type ResultOutcome = 'written' | 'already' | 'not_configured' | 'rejected';

interface MatchRow {
  id?: string;
  max_players?: number;
  status?: string;
}

/**
 * Menulis satu laga yang sudah selesai ke tabel yang sama dengan yang diisi jalur browser.
 *
 * Urutannya disengaja. Lobi Slap Arena dan kamar Bomberman sudah membuat baris `matches` lebih
 * dulu, jadi langkah pertama adalah menuntaskan baris itu: satu PATCH `waiting|playing -> completed`
 * dan pemicu di `005_match_results_are_history.sql` menuliskan riwayatnya. Kalau klien lebih cepat
 * menutup baris yang sama, filter status membuat upaya DO tidak menghasilkan apa-apa, jadi satu laga
 * tetap satu baris riwayat. Baris baru hanya dibuat kalau kamarnya memang tidak punya jejak di
 * database, dan itu harus dua permintaan: `003_protect_finished_matches.sql` melarang baris lahir
 * sebagai `completed`, dan riwayat hanya ditulis saat baris *berpindah* status.
 *
 * Kuncinya `SUPABASE_SERVICE_KEY`, jadi kebijakan RLS untuk klien tidak perlu dilonggarkan sedikit
 * pun demi jalur server.
 */
export class MatchRecorder {
  /** Status kegagalan terakhir, untuk log worker. Tidak pernah memuat kunci. */
  lastError = 'ok';

  constructor(private env: Env) {}

  get enabled(): boolean {
    return !!(this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_KEY);
  }

  async record(match: FinishedMatch): Promise<ResultOutcome> {
    if (!this.enabled) return 'not_configured';
    const base = (this.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    const key = this.env.SUPABASE_SERVICE_KEY ?? '';
    const headers = {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    };
    const table = `${base}/rest/v1/matches`;

    const found = await this.send('GET', `${table}?select=id,max_players,status&room_code=eq.${encodeURIComponent(match.roomCode)}&game_type=eq.${encodeURIComponent(match.game)}&order=created_at.desc&limit=1`, headers);
    const row = found.rows[0] as MatchRow | undefined;
    if (row?.id) {
      if (row.status === 'completed') return 'already';
      const seats = typeof row.max_players === 'number' && row.max_players > 0 ? row.max_players : match.seats;
      return (await this.close(table, headers, row.id, seats, match.winnerSeat, row.status === 'waiting'))
        ? 'written'
        : 'rejected';
    }

    const created = await this.send('POST', `${table}?select=id`, headers, {
      room_code: match.roomCode,
      game_type: match.game,
      status: 'waiting',
      max_players: match.seats,
      current_turn: 0,
      game_state: { recorded_by: 'cloudflare-door' },
    });
    const newId = (created.rows[0] as MatchRow | undefined)?.id;
    if (!created.ok || !newId) return 'rejected';
    return (await this.close(table, headers, newId, match.seats, match.winnerSeat, true)) ? 'written' : 'rejected';
  }

  /**
   * Laga yang lahir di jalur Worker tidak pernah punya momen "mulai" di database: lobi membuat baris
   * `waiting` dan tidak ada klien yang memindahkannya. Pemicu `002_match_protocol.sql:17` menolak
   * `waiting -> completed` dengan "a match cannot finish before it starts", jadi DO mencatat dulu
   * bahwa laganya memang pernah berjalan, baru menutupnya.
   */
  private async start(
    table: string,
    headers: Record<string, string>,
    id: string
  ): Promise<boolean> {
    const up = await this.send(
      'PATCH',
      `${table}?id=eq.${encodeURIComponent(id)}&status=eq.waiting&select=id`,
      headers,
      { status: 'playing' }
    );
    return up.ok && up.rows.length > 0;
  }

  /** `winner_index` di luar rentang kursi ditolak pemicu, jadi angkanya dilucuti lebih dulu. */
  private async close(
    table: string,
    headers: Record<string, string>,
    id: string,
    seats: number,
    winnerSeat: number | null,
    fromWaiting: boolean
  ): Promise<boolean> {
    if (fromWaiting && !(await this.start(table, headers, id))) return false;
    const winner =
      typeof winnerSeat === 'number' && winnerSeat >= 0 && winnerSeat < seats ? winnerSeat : null;
    const done = await this.send(
      'PATCH',
      `${table}?id=eq.${encodeURIComponent(id)}&status=in.(waiting,playing)&select=id`,
      headers,
      { status: 'completed', winner_index: winner }
    );
    return done.ok && done.rows.length > 0;
  }

  private async send(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    headers: Record<string, string>
  ): Promise<{ ok: boolean; rows: unknown[] }>;
  private async send(
    method: 'POST' | 'PATCH',
    url: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<{ ok: boolean; rows: unknown[] }>;
  private async send(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<{ ok: boolean; rows: unknown[] }> {
    try {
      const res = await fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      if (!res.ok) {
        // PostgREST menaruh alasan penolakan pemicu di body, dan itu yang dicari di log.
        this.lastError = `${method} ${res.status} ${text.slice(0, 180)}`;
        return { ok: false, rows: [] };
      }
      const parsed = text ? JSON.parse(text) : [];
      return { ok: true, rows: Array.isArray(parsed) ? parsed : [parsed] };
    } catch (err) {
      this.lastError = `${method} threw ${String(err).slice(0, 160)}`;
      return { ok: false, rows: [] };
    }
  }
}
