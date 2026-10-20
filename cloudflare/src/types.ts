export interface Env {
  ROOM: DurableObjectNamespace<GameRoom>;
  ALLOWED_ORIGINS: string;
  TEST_MODE: string;
}

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const MAX_MESSAGE_CHARS = 1024;
export const TICK_SECONDS = 0.05;
export const MAX_STEP_SECONDS = 0.25;
export const SNAPSHOT_MIN_INTERVAL_SECONDS = 15;

export interface Session {
  id: string;
  token: string;
  name: string;
}

export type ServerMessage =
  | { t: 'welcome'; id: string; token: string; master: string | null; players: { id: string; name: string }[] }
  | { t: 'state'; phase: string; master: string | null; tick: number; players: { id: string; name: string }[]; world: unknown }
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
