import {
  applyAction,
  createGame,
  drainFx,
  isFinished,
  loadWorld,
  masterOf,
  phaseOf,
  removePlayer,
  snapshotOf,
  type Action,
  type BombermanRoomConfig,
} from '../../../src/games/bomberman/engine/gameApi';
import type { FloorKind } from '../../../src/games/bomberman/engine/types';
import type { GameAdapter } from '../types';

/** The room rule book uses this id for its own tick, so no seat can send it. */
const SERVER_ID = '__server__';
const FLOORS: FloorKind[] = ['grass', 'sand', 'stone'];

const newSeed = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/**
 * Thin adapter over `gameApi.ts`, the same arrangement Slap Arena uses. No rule is written
 * twice: `join`, `start`, `input`, `char`, and `tick` all go through one pure module that the
 * unit tests exercise without a Worker.
 *
 * Two things are decided here and nowhere else:
 * - the seed and floor of a new match are generated server-side, so a client cannot pick a
 *   map for everyone by sending a start payload;
 * - bots are driven inside the server tick, not by whichever tab happens to be master.
 */
export function bombermanGame(config: BombermanRoomConfig): GameAdapter {
  const room = createGame(config);

  return {
    door: true,
    join: (playerId, name, seat) => applyAction(room, playerId, { t: 'join', id: playerId, name, seat }),
    apply: (playerId, action) => {
      const msg = action as Action;
      if (msg && typeof msg === 'object' && msg.t === 'start') {
        return applyAction(room, playerId, {
          t: 'start',
          fillBots: msg.fillBots,
          seed: newSeed(),
          floor: FLOORS[Math.floor(Math.random() * FLOORS.length)],
        });
      }
      return applyAction(room, playerId, msg);
    },
    step: (dt) => {
      applyAction(room, SERVER_ID, { t: 'tick', dt });
    },
    snapshot: () => snapshotOf(room),
    removePlayer: (playerId) => {
      removePlayer(room, playerId);
    },
    load: (world) => loadWorld(room, world),
    phase: () => phaseOf(room),
    master: () => masterOf(room),
    drainFx: () => drainFx(room),
    finished: () => isFinished(room),
  };
}
