import { SlapSim } from './sim';
import type { InputState } from './types';

export const MAX_PLAYERS = 6;
export const MAX_MESSAGE_BYTES = 512;
/** Matches the clamp already inside SlapSim.step, so an accepted action is never trimmed by the sim. */
const MAX_TICK_SECONDS = 0.25;
const NAME_LIMIT = 12;
const FALLBACK_NAME = 'Pemain';
/** The server owns the world, so nobody joins under this id. */
const SERVER_ID = '__server__';

export type RejectReason =
  | 'unknown_player'
  | 'room_full'
  | 'wrong_phase'
  | 'not_your_turn'
  | 'duplicate_seq'
  | 'bad_payload'
  | 'name_rejected';

export type ActionResult = { ok: true } | { ok: false; reason: RejectReason };

export type Action =
  | { t: 'join'; id: string; name: string; color?: string }
  | { t: 'start' }
  | { t: 'nextRound' }
  | { t: 'input'; seq: number; input: InputState }
  | { t: 'tick'; dt: number };

interface RoomRules {
  master: string | null;
  seq: Map<string, number>;
}

/** Rule bookkeeping lives here so no property is added to the game object itself. */
const ROOMS = new WeakMap<SlapSim, RoomRules>();

function rulesOf(state: SlapSim): RoomRules {
  let rules = ROOMS.get(state);
  if (!rules) {
    rules = { master: state.listIds()[0] ?? null, seq: new Map<string, number>() };
    ROOMS.set(state, rules);
  }
  return rules;
}

export function createGame(): SlapSim {
  const sim = new SlapSim({ localId: SERVER_ID, authoritative: true });
  ROOMS.set(sim, { master: null, seq: new Map<string, number>() });
  return sim;
}

const reject = (reason: RejectReason): ActionResult => ({ ok: false, reason });

const inRange = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1;

function isInputShape(input: unknown): input is InputState {
  if (!input || typeof input !== 'object') return false;
  const shape = input as Record<string, unknown>;
  if (!inRange(shape.x) || !inRange(shape.z)) return false;
  if (typeof shape.slap !== 'boolean' || typeof shape.dash !== 'boolean') return false;
  if ('held' in shape && typeof shape.held !== 'boolean') return false;
  if ('charge' in shape) {
    const charge = shape.charge;
    if (typeof charge !== 'number' || !Number.isFinite(charge) || charge < 0 || charge > 1) return false;
  }
  return true;
}

const sanitizeName = (raw: string): string => raw.replace(/[<>]/g, '').trim().slice(0, NAME_LIMIT);

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export function applyAction(state: SlapSim, playerId: string, action: Action): ActionResult {
  if (!action || typeof action !== 'object' || typeof action.t !== 'string') return reject('bad_payload');
  if (byteLength(JSON.stringify(action)) > MAX_MESSAGE_BYTES) return reject('bad_payload');

  const rules = rulesOf(state);

  switch (action.t) {
    case 'join': {
      const id = action.id;
      if (typeof id !== 'string' || id.length === 0 || id === SERVER_ID) return reject('bad_payload');
      // A seat that already exists keeps its state; a client may resend its join on every reconnect.
      if (state.players[id]) return { ok: true };
      if (state.listIds().length >= MAX_PLAYERS) return reject('room_full');
      // An empty name is repaired, a name that is not text at all cannot be.
      if (typeof action.name !== 'string') return reject('name_rejected');
      const name = sanitizeName(action.name) || FALLBACK_NAME;
      const color = typeof action.color === 'string' ? action.color : undefined;
      state.addPlayer(color ? { id, name, color } : { id, name });
      if (rules.master === null) rules.master = id;
      return { ok: true };
    }

    case 'start': {
      if (playerId !== rules.master) return reject('unknown_player');
      if (state.state.phase !== 'WAITING' || state.listIds().length < 2) return reject('wrong_phase');
      state.startCountdown();
      return { ok: true };
    }

    case 'nextRound': {
      if (playerId !== rules.master) return reject('unknown_player');
      if (state.state.phase !== 'ROUND_OVER' && state.state.phase !== 'MATCH_OVER') {
        return reject('not_your_turn');
      }
      state.nextRound();
      return { ok: true };
    }

    case 'input': {
      if (!state.players[playerId]) return reject('unknown_player');
      if (!isInputShape(action.input)) return reject('bad_payload');
      const last = rules.seq.get(playerId);
      // The counter only moves for a payload that was actually taken.
      if (typeof action.seq === 'number' && Number.isFinite(action.seq)) {
        if (last !== undefined && action.seq <= last) return reject('duplicate_seq');
        rules.seq.set(playerId, action.seq);
      }
      state.setInput(playerId, action.input);
      return { ok: true };
    }

    case 'tick': {
      const dt = action.dt;
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0 || dt > MAX_TICK_SECONDS) {
        return reject('bad_payload');
      }
      state.step(dt);
      return { ok: true };
    }

    default:
      return reject('bad_payload');
  }
}

export function removePlayer(state: SlapSim, playerId: string): ActionResult {
  const rules = rulesOf(state);
  if (!state.players[playerId]) return reject('unknown_player');
  state.removePlayer(playerId);
  rules.seq.delete(playerId);
  if (rules.master === playerId) rules.master = state.listIds()[0] ?? null;
  return { ok: true };
}
