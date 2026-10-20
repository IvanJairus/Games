import {
  applyAction,
  createGame,
  masterOf,
  removePlayer,
  type Action,
} from '../../../src/games/slap-arena/engine/gameApi';
import type { SlapSim } from '../../../src/games/slap-arena/engine/sim';
import type { SimEvent, WorldSnapshot } from '../../../src/games/slap-arena/engine/types';
import type { GameAdapter } from '../types';

/** Id yang dicadangkan `gameApi.ts` untuk pemegang sim, jadi tidak ada kursi yang menirunya. */
const SERVER_ID = '__server__';

const ROOM_PHASE: Record<string, 'lobby' | 'playing' | 'finished'> = {
  WAITING: 'lobby',
  COUNTDOWN: 'playing',
  BATTLE: 'playing',
  ROUND_OVER: 'playing',
  MATCH_OVER: 'finished',
};

/**
 * Adapternya tipis dengan sengaja: aturan, validasi payload, dan penolakan sudah diputus
 * `gameApi.ts` dan sudah punya 19 unit test di sisi klien. DO hanya memindahkan dunia ke dalam
 * kamarnya sendiri, jadi tidak ada dua aturan yang bisa berbeda jalan.
 */
export function slapArenaGame(): GameAdapter {
  const sim: SlapSim = createGame();
  const queue: SimEvent[] = [];
  // SlapSim mengeluarkan efek lewat callback, dan kolomnya terbuka (sim.ts:52), jadi DO bisa
  // memungutnya tanpa menyentuh gameApi.ts atau menyalin aturan ke sini.
  sim.onEvent = (event) => {
    queue.push(event);
  };
  const run = (playerId: string, action: Action) => applyAction(sim, playerId, action);

  return {
    door: true,
    join: (playerId, name) => run(playerId, { t: 'join', id: playerId, name }),
    apply: (playerId, action) => run(playerId, action as Action),
    step: (dt) => {
      run(SERVER_ID, { t: 'tick', dt });
    },
    snapshot: () => sim.snapshot(),
    phase: () => ROOM_PHASE[sim.state.phase] ?? 'lobby',
    // The rules door already decides who may start and advance; the DO reads that answer
    // instead of keeping a second copy of it.
    master: () => masterOf(sim),
    drainFx: () => queue.splice(0, queue.length),
    removePlayer: (playerId) => {
      removePlayer(sim, playerId);
    },
    load: (world) => {
      const snap = world as WorldSnapshot | null;
      if (snap && Array.isArray(snap.players)) sim.applySnapshot(snap);
    },
    finished: () => sim.state.phase === 'MATCH_OVER',
  };
}
