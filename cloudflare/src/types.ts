export interface Env {
  ROOM: DurableObjectNamespace<GameRoom>;
  ALLOWED_ORIGINS: string;
  TEST_MODE: string;
  /** Secret di `wrangler secret put`, tidak pernah masuk wrangler.toml. */
  TICKET_SECRET: string;
}

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const MAX_MESSAGE_CHARS = 1024;
export const TICK_SECONDS = 0.05;
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
      players: { id: string; name: string }[];
      exp: number;
    }
  | {
      t: 'state';
      phase: string;
      master: string | null;
      tick: number;
      players: { id: string; name: string }[];
      world: unknown;
      /** seat -> seq terakhir yang benar-benar sudah dieksekusi. */
      applied: Record<number, number>;
      /** seat -> milidetik aksi tertahan di pemegang sim sebelum ikut terbit. */
      held: Record<number, number>;
    }
  | { t: 'error'; reason: string };

export interface GameAdapter {
  step(dt: number): void;
  apply(playerId: string, action: unknown): { ok: true } | { ok: false; reason: string };
  snapshot(): unknown;
  removePlayer(playerId: string): void;
  load(world: unknown): void;
  finished(): boolean;
}

import type { GameRoom } from './room';
