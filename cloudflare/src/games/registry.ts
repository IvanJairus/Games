import type { Env, GameAdapter } from '../types';
import { MAX_PLAYERS } from '../types';
import { selfTestGame } from './selfTest';
import { slapArenaGame } from './slapArena';
import { bombermanGame } from './bomberman';
import {
  DEFAULT_ROOM_CONFIG,
  parseRoomConfig,
  type BombermanRoomConfig,
} from '../../../src/games/bomberman/engine/gameApi';

export interface RoomOptions {
  data: unknown;
  provided: boolean;
}

export type RoomOptionsResult = { ok: true } & RoomOptions | { ok: false; reason: 'bad_room_options' };

/**
 * Room settings are negotiated once, at the first ticket mint, and then stored in the
 * Durable Object. The alternative — letting the master send a board size at start — would
 * let a room allocate six seats and then discover the board only has two.
 */
export function parseRoomOptions(code: string, get: (name: string) => string | null): RoomOptionsResult {
  if (code === 'bomberman') {
    const parsed = parseRoomConfig(get);
    return parsed.ok
      ? { ok: true, data: parsed.config, provided: parsed.provided }
      : { ok: false, reason: 'bad_room_options' };
  }
  return { ok: true, data: {}, provided: false };
}

export function roomCapacity(code: string, options: unknown): number {
  if (code !== 'bomberman') return MAX_PLAYERS;
  const config = options as Partial<BombermanRoomConfig> | null;
  return config?.seats === 2 ? 2 : 4;
}

const isBombermanConfig = (value: unknown): value is BombermanRoomConfig => {
  const config = value as Partial<BombermanRoomConfig> | null;
  return (
    !!config &&
    (config.seats === 2 || config.seats === 4) &&
    (config.size === 'kecil' || config.size === 'besar' || config.size === 'luas') &&
    (config.teams === undefined || typeof config.teams === 'boolean')
  );
};

export function createAdapter(code: string, env: Env, options?: unknown): GameAdapter | null {
  if (code === 'slap-arena') return slapArenaGame();
  if (code === 'bomberman') {
    return bombermanGame(isBombermanConfig(options) ? options : DEFAULT_ROOM_CONFIG);
  }
  if (code === 'selftest' && env.TEST_MODE === '1') return selfTestGame();
  return null;
}
