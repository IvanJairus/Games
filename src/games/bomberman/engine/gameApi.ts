/**
 * The Bomberman room rule book.
 *
 * This is the same shape as Slap Arena's `gameApi.ts`: the Durable Object owns the world and
 * this module decides what an action is allowed to do. It has no DOM, no network, and no
 * Supabase imports, so the Worker and the unit tests run exactly the same rules.
 *
 * One difference from Slap Arena: a Bomberman lobby is not a world yet. The room knows its
 * board size and seat count from the ticket mint, but `BombermanSim` is only built when the
 * master starts. Until then `sim` is null and the room reports the lobby phase.
 */

import { BombermanBot, type BotLevel } from './ai';
import { BombermanSim, type SeatConfig } from './sim';
import {
  CHARACTER_IDS,
  DIRS,
  sizeForBoard,
  type BoardSize,
  type BombermanState,
  type Facing,
  type FloorKind,
  type InputState,
} from './types';

/** The id the Worker uses for its own tick action; no player may claim it. */
export const SERVER_ID = '__server__';
export const MAX_MESSAGE_BYTES = 512;
const MAX_TICK_SECONDS = 0.25;
const NAME_LIMIT = 12;
const FALLBACK_NAME = 'Pemain';
const SEED_SHAPE = /^[A-Za-z0-9-]{4,40}$/;
const FLOORS: FloorKind[] = ['grass', 'sand', 'stone'];
const DEFAULT_BOT_LEVEL: BotLevel = 'sedang';

export interface BombermanRoomConfig {
  seats: 2 | 4;
  size: BoardSize;
  /** Two teams of two. Only four-seat rooms can turn this on. */
  teams?: boolean;
}

export const DEFAULT_ROOM_CONFIG: BombermanRoomConfig = { seats: 4, size: 'kecil', teams: false };

export type RejectReason =
  | 'unknown_player'
  | 'room_full'
  | 'wrong_phase'
  | 'not_master'
  | 'duplicate_seq'
  | 'bad_payload'
  | 'name_rejected'
  | 'too_few_players';

export type ActionResult = { ok: true } | { ok: false; reason: RejectReason };

export type Action =
  | { t: 'join'; id: string; name: string; seat?: number }
  | { t: 'char'; charId: string }
  | { t: 'start'; fillBots?: boolean; seed?: string; floor?: FloorKind }
  | { t: 'input'; seq: number; dir: Facing | null; bomb: boolean }
  | { t: 'tick'; dt: number };

export interface RosterSeat {
  id: string;
  seat: number;
  name: string;
  charId: string;
  /** Always false here: a bot is created by `start`/`removePlayer`, never by a ticket. */
  bot: false;
}

export interface BombermanRoom {
  config: BombermanRoomConfig;
  roster: Map<string, RosterSeat>;
  /** playerId -> sequence terakhir yang diterima. Hanya untuk sesi yang hidup. */
  seq: Map<string, number>;
  master: string | null;
  sim: BombermanSim | null;
  bots: Map<number, BombermanBot>;
  botSeed: string;
}

/**
 * Board settings are part of the room, not part of the start action: the ticket mint uses
 * `seats` to cap the room before anyone connects, and the master cannot shrink the board
 * after guests have taken seats.
 */
export function parseRoomConfig(get: (name: string) => string | null): {
  ok: true;
  config: BombermanRoomConfig;
  provided: boolean;
} | { ok: false; reason: 'bad_room_options' } {
  const seatsRaw = get('seats');
  const sizeRaw = get('size');
  const teamsRaw = get('teams');
  const provided = seatsRaw !== null || sizeRaw !== null || teamsRaw !== null;
  if (seatsRaw !== null && seatsRaw !== '2' && seatsRaw !== '4') return { ok: false, reason: 'bad_room_options' };
  if (sizeRaw !== null && sizeRaw !== 'kecil' && sizeRaw !== 'besar' && sizeRaw !== 'luas') {
    return { ok: false, reason: 'bad_room_options' };
  }
  if (teamsRaw !== null && teamsRaw !== '0' && teamsRaw !== '1') return { ok: false, reason: 'bad_room_options' };
  const size: BoardSize = sizeRaw === 'luas' ? 'luas' : sizeRaw === 'besar' ? 'besar' : 'kecil';
  const seats: 2 | 4 = seatsRaw === '2' ? 2 : 4;
  return {
    ok: true,
    config: {
      seats,
      // The widest board only exists for four seats; a duel asking for it gets the
      // largest duel board instead of a geometry nobody can play.
      size: seats === 2 && size === 'luas' ? 'besar' : size,
      teams: seats === 4 && teamsRaw === '1',
    },
    provided,
  };
}

/** The widest board has no duel twin, and a duel has no `luas` geometry to restore. */
const normalizeSize = (seats: 2 | 4, size: BoardSize | undefined): BoardSize =>
  seats === 2 ? (size === 'kecil' ? 'kecil' : 'besar') : size === 'luas' ? 'luas' : size === 'besar' ? 'besar' : 'kecil';

export const createGame = (config: BombermanRoomConfig = DEFAULT_ROOM_CONFIG): BombermanRoom => {
  const seats: 2 | 4 = config.seats === 2 ? 2 : 4;
  return {
    config: {
      seats,
      size: normalizeSize(seats, config.size),
      teams: seats === 4 && config.teams === true,
    },
    roster: new Map(),
    seq: new Map(),
    master: null,
    sim: null,
    bots: new Map(),
    botSeed: '',
  };
};

const reject = (reason: RejectReason): ActionResult => ({ ok: false, reason });

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

const sanitizeName = (raw: string): string => raw.replace(/[<>&]/g, '').trim().slice(0, NAME_LIMIT);

const isFacing = (value: unknown): value is Facing =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(DIRS, value);

const isFloor = (value: unknown): value is FloorKind =>
  typeof value === 'string' && (FLOORS as string[]).includes(value);

const defaultChar = (seat: number): string => CHARACTER_IDS[seat % CHARACTER_IDS.length];

const randomSeed = (): string => Math.random().toString(36).slice(2, 14) || 'bomber-seed';

const bySeat = (room: BombermanRoom): Map<number, RosterSeat> =>
  new Map([...room.roster.values()].map((entry) => [entry.seat, entry]));

const lowestHuman = (room: BombermanRoom): string | null => {
  const sorted = [...room.roster.values()].sort((a, b) => a.seat - b.seat);
  return sorted[0]?.id ?? null;
};

/** The DO reads this instead of keeping its own copy, so the button and the rule cannot drift. */
export const masterOf = (room: BombermanRoom): string | null => room.master ?? lowestHuman(room);

export const phaseOf = (room: BombermanRoom): 'lobby' | 'playing' | 'finished' => {
  const phase = room.sim?.state.phase;
  if (!phase) return 'lobby';
  if (phase === 'finished') return 'finished';
  return 'playing';
};

export const isFinished = (room: BombermanRoom): boolean => room.sim?.state.phase === 'finished';

export const snapshotOf = (room: BombermanRoom): BombermanState | null => room.sim?.snapshot() ?? null;

export const drainFx = (room: BombermanRoom): ReturnType<BombermanSim['drainEvents']> =>
  room.sim?.drainEvents() ?? [];

/**
 * A world restored from storage has players but no roster ids: a `PlayerState` carries a seat
 * and a name, never a ticket. The DO re-joins every live socket by seat right after this, so
 * the room is complete again before it can accept an action.
 */
export function loadWorld(room: BombermanRoom, world: unknown): void {
  const next = world as BombermanState | null;
  if (!next || !Array.isArray(next.players) || typeof next.phase !== 'string') return;
  // Read the geometry back out of the saved world rather than trusting the current room
  // config: a room created before `room_config` existed can be restored with the default
  // config, and a mismatch here would make the next round spawn seats on the wrong corners.
  const seats = next.seats === 2 ? 2 : 4;
  const size = sizeForBoard(seats, next.cols);
  const teams = next.teams === true;
  const sim = new BombermanSim({
    seats,
    size,
    teams,
    seed: next.seed,
    floor: next.floor,
    players: next.players.map(
      (p): SeatConfig => ({ seat: p.seat, name: p.name, charId: p.charId, bot: p.bot }),
    ),
  });
  sim.applySnapshot(next);
  // A rematch after a reload must use the mode the saved world was played in.
  room.config = { seats, size, teams };
  room.sim = sim;
  room.bots.clear();
  room.botSeed = sim.state.seed;
}

export function applyAction(room: BombermanRoom, playerId: string, action: Action): ActionResult {
  if (!action || typeof action !== 'object' || typeof action.t !== 'string') return reject('bad_payload');
  if (byteLength(JSON.stringify(action)) > MAX_MESSAGE_BYTES) return reject('bad_payload');

  switch (action.t) {
    case 'join': {
      if (typeof action.id !== 'string' || !action.id || action.id === SERVER_ID) return reject('bad_payload');
      const existing = room.roster.get(action.id);
      if (existing) return { ok: true };
      if (room.roster.size >= room.config.seats) return reject('room_full');
      if (typeof action.name !== 'string') return reject('name_rejected');

      const taken = bySeat(room);
      let seat: number | null = null;
      if (action.seat !== undefined) {
        const asked = action.seat;
        if (!Number.isInteger(asked) || asked < 0 || asked >= room.config.seats) return reject('bad_payload');
        if (taken.has(asked)) return reject('room_full');
        seat = asked;
      } else {
        for (let i = 0; i < room.config.seats; i += 1) {
          if (!taken.has(i)) {
            seat = i;
            break;
          }
        }
      }
      if (seat === null) return reject('room_full');

      room.roster.set(action.id, {
        id: action.id,
        seat,
        name: sanitizeName(action.name) || FALLBACK_NAME,
        charId: defaultChar(seat),
        bot: false,
      });
      // A seat kept through a mid-match disconnect is played by a bot until its owner comes
      // back. Reclaiming it hands the body back instead of leaving the tab on a bot it cannot
      // control; the bot brain stops because the live player is no longer flagged as one.
      const live = room.sim?.state.players.find((p) => p.seat === seat);
      if (live && live.bot) {
        live.bot = false;
        live.name = room.roster.get(action.id)?.name ?? live.name;
      }
      if (room.master === null) room.master = action.id;
      return { ok: true };
    }

    case 'char': {
      const entry = room.roster.get(playerId);
      if (!entry) return reject('unknown_player');
      if (typeof action.charId !== 'string' || !(CHARACTER_IDS as readonly string[]).includes(action.charId)) {
        return reject('bad_payload');
      }
      entry.charId = action.charId;
      // A claim can arrive after the master started; apply it to the live world too.
      const live = room.sim?.state.players.find((p) => p.seat === entry.seat);
      if (live) live.charId = action.charId;
      return { ok: true };
    }

    case 'start': {
      if (playerId !== masterOf(room)) return reject('not_master');
      if (room.sim && room.sim.state.phase !== 'finished') return reject('wrong_phase');

      const fillBots = action.fillBots !== false;
      const humans = bySeat(room);
      const players: SeatConfig[] = [];
      for (let seat = 0; seat < room.config.seats; seat += 1) {
        const human = humans.get(seat);
        if (human) {
          players.push({ seat, name: human.name, charId: human.charId, bot: false });
        } else if (fillBots) {
          players.push({
            seat,
            name: `Bot ${seat + 1}`,
            charId: CHARACTER_IDS[(seat + 2) % CHARACTER_IDS.length],
            bot: true,
          });
        }
      }
      // A one-seat match has no opponent and its first round ends immediately. Bots make this
      // rare, but a room with bot fill off and one human must be told to wait.
      if (players.length < 2) return reject('too_few_players');

      const seed = typeof action.seed === 'string' && SEED_SHAPE.test(action.seed) ? action.seed : randomSeed();
      const floor = isFloor(action.floor) ? action.floor : FLOORS[Math.floor(Math.random() * FLOORS.length)];
      room.sim = new BombermanSim({
        seats: room.config.seats,
        size: room.config.size,
        teams: room.config.teams === true,
        seed,
        floor,
        players,
      });
      room.bots.clear();
      room.botSeed = room.sim.state.seed;
      return { ok: true };
    }

    case 'input': {
      const entry = room.roster.get(playerId);
      if (!entry) return reject('unknown_player');
      if (action.dir !== null && !isFacing(action.dir)) return reject('bad_payload');
      if (typeof action.bomb !== 'boolean') return reject('bad_payload');
      if (!Number.isFinite(action.seq) || !Number.isInteger(action.seq) || action.seq <= 0) {
        return reject('bad_payload');
      }
      const last = room.seq.get(playerId) ?? 0;
      if (action.seq <= last) return reject('duplicate_seq');
      room.seq.set(playerId, action.seq);
      // Input can arrive before the master starts. Keeping the seq moving means the first
      // held direction after `start` is still accepted, not treated as a replay.
      const input: InputState = { dir: action.dir, bomb: action.bomb, seq: action.seq };
      room.sim?.setInput(entry.seat, input);
      return { ok: true };
    }

    case 'tick': {
      if (typeof action.dt !== 'number' || !Number.isFinite(action.dt) || action.dt <= 0 || action.dt > MAX_TICK_SECONDS) {
        return reject('bad_payload');
      }
      const sim = room.sim;
      if (!sim) return { ok: true };
      if (sim.state.seed !== room.botSeed) {
        room.bots.clear();
        room.botSeed = sim.state.seed;
      }
      for (const p of sim.state.players) {
        if (!p.bot) continue;
        let brain = room.bots.get(p.seat);
        if (!brain) {
          // Same level the old host used; a room does not offer a per-seat difficulty.
          brain = new BombermanBot(p.seat, DEFAULT_BOT_LEVEL);
          room.bots.set(p.seat, brain);
        }
        sim.setInput(p.seat, brain.update(sim.state, action.dt));
      }
      sim.step(action.dt);
      return { ok: true };
    }

    default:
      return reject('bad_payload');
  }
}

/**
 * A seat that leaves mid-match becomes a bot instead of opening a hole in the arena. The
 * match was already started with that seat on the board, and a four-seat room dropping to
 * three because somebody closed a tab is worse than a bot taking over.
 */
export function removePlayer(room: BombermanRoom, playerId: string): ActionResult {
  const entry = room.roster.get(playerId);
  if (!entry) return reject('unknown_player');
  room.roster.delete(playerId);
  room.seq.delete(playerId);

  const live = room.sim?.state.players.find((p) => p.seat === entry.seat);
  if (live && !live.bot) {
    live.bot = true;
    live.name = `Bot ${entry.seat + 1}`;
  }
  room.bots.delete(entry.seat);
  restoreMaster(room);
  return { ok: true };
}

/** Keeps the master pointer valid after the seat that held it leaves. */
function restoreMaster(room: BombermanRoom): void {
  if (!room.master || !room.roster.has(room.master)) room.master = lowestHuman(room);
}
