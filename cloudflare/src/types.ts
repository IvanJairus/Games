export interface Env {
  ROOM: DurableObjectNamespace<GameRoom>;
  ALLOWED_ORIGINS: string;
  TEST_MODE: string;
  /** Secret di `wrangler secret put`, tidak pernah masuk wrangler.toml. */
  TICKET_SECRET: string;
  /** Proyek Supabase tempat hasil laga ditulis. Nilai publik, bukan secret. */
  SUPABASE_URL?: string;
  /**
   * Secret: `wrangler secret put SUPABASE_SERVICE_KEY`. Tanpa keduanya hasil laga tidak ditulis dan
   * kamar tetap berjalan, jadi flag ini bisa dinyalakan terpisah dari deploy.
   */
  SUPABASE_SERVICE_KEY?: string;
}

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const MAX_MESSAGE_CHARS = 1024;
/**
 * 30 Hz. The room broadcasts once per tick, so this is also the snapshot rate: a client
 * draws remote brawlers between two of these, and at 50 ms the gap was wide enough that a
 * slap looked like it landed early. A third more CPU and bandwidth for a room of six.
 */
export const TICK_SECONDS = 0.033;
export const MAX_STEP_SECONDS = 0.25;
export const SNAPSHOT_MIN_INTERVAL_SECONDS = 15;

/** Kursi yang direbut dari tiket bertanda tangan, bukan dari query string klien. */
export interface Session {
  id: string;
  seat: number;
  name: string;
  /** epoch detik, saat koneksi harus ditutup lagi. */
  exp: number;
}

export type ServerMessage =
  | {
      t: 'welcome';
      id: string;
      seat: number;
      name: string;
      master: string | null;
      players: { id: string; name: string; seat: number }[];
      exp: number;
      /** Board/room settings chosen at the first ticket mint. Bomberman reads seats and size. */
      config?: unknown;
    }
  | {
      t: 'state';
      phase: string;
      master: string | null;
      tick: number;
      players: { id: string; name: string; seat: number }[];
      world: unknown;
      /** seat -> seq terakhir yang benar-benar sudah dieksekusi. */
      applied: Record<number, number>;
      /** seat -> milidetik aksi tertahan di pemegang sim sebelum ikut terbit. */
      held: Record<number, number>;
      /** Efek yang lahir di tick terakhir. Kosong untuk game yang tidak memproduksinya. */
      fx: unknown[];
    }
  | { t: 'error'; reason: string };

export interface GameAdapter {
  step(dt: number): void;
  apply(playerId: string, action: unknown): { ok: true } | { ok: false; reason: string };
  snapshot(): unknown;
  removePlayer(playerId: string): void;
  load(world: unknown): void;
  finished(): boolean;
  /**
   * Game yang punya pintu aturan sendiri (Slap Arena lewat `gameApi.ts`). DO tidak boleh menilai
   * fase, jumlah pemain, atau siapa master: semua sudah diputus pintu itu.
   */
  door?: boolean;
  /** Hanya untuk game berpintu: kursi yang naik ke panggung saat koneksinya diterima. */
  join?(playerId: string, name: string, seat?: number): { ok: true } | { ok: false; reason: string };
  /** Hanya untuk game berpintu: fase dalam bahasa DO, supaya gerbang transport tetap satu bentuk. */
  phase?(): 'lobby' | 'playing' | 'finished';
  /**
   * Hanya untuk game berpintu: siapa yang berhak memulai/melanjutkan ronde. DO tidak menyimpan
   * salinannya sendiri, karena dua sumber kebenaran bisa berbeda setelah satu kursi keluar.
   */
  master?(): string | null;
  /** Efek yang lahir sejak tick terakhir. Game tanpa efek tidak perlu memasang ini. */
  drainFx?(): unknown[];
  /** Kursi pemenang, hanya berarti setelah `finished()` benar. Null berarti seri atau tanpa pemenang. */
  winnerSeat?(): number | null;
}

import type { GameRoom } from './room';
