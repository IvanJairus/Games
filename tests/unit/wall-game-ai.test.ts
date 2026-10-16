import { describe, it, expect } from 'vitest';
import {
  applyMove,
  applyWall,
  createGame,
  getShortestPath,
  getValidMoves,
  isValidWallPlacement,
  GameState,
} from '@/games/wall-game/engine';
import {
  WALL_BOT_LEVELS,
  WallBotAction,
  WallBotLevel,
  chooseWallBotAction,
  describeWallBotLevel,
} from '@/games/wall-game/engine/ai';

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const seat = (state: GameState, index: number) => state.players[index];

const applyAction = (state: GameState, action: WallBotAction): GameState =>
  action.type === 'WALL' ? applyWall(state, action.wall) : applyMove(state, action.target);

function runGame(playerCount: number, level: WallBotLevel, seed: number, maxTurns = 400) {
  const rand = lcg(seed);
  let state = createGame({ playerCount, playerNames: Array.from({ length: playerCount }, (_, i) => `Bot ${i + 1}`) });
  let turns = 0;

  while (state.phase === 'ACTION' && turns < maxTurns) {
    const action = chooseWallBotAction(state, level, rand);
    const actorId = state.activePlayerIndex;
    const before = seat(state, actorId).wallsRemaining;

    if (action.type === 'MOVE') {
      expect(getValidMoves(state).some((m) => m.x === action.target.x && m.y === action.target.y)).toBe(true);
      state = applyMove(state, action.target);
    } else {
      expect(isValidWallPlacement(state, action.wall)).toBe(true);
      state = applyWall(state, action.wall);
      expect(seat(state, actorId).wallsRemaining).toBe(before - 1);
    }
    turns += 1;
  }

  return { state, turns };
}

// One game per pair, with the opening seat handed to each side in turn, so the first-move edge
// cannot decide a matchup on its own.
function runMatchup(left: WallBotLevel, right: WallBotLevel, games: number, baseSeed = 1) {
  const wins: Record<WallBotLevel, number> = { santai: 0, sedang: 0, sempurna: 0 };
  let unfinished = 0;

  for (let i = 0; i < games; i++) {
    const levels: [WallBotLevel, WallBotLevel] = i % 2 === 0 ? [left, right] : [right, left];
    const rand = lcg(baseSeed + i * 7919);
    let state = createGame({ playerCount: 2, playerNames: ['Left', 'Right'] });
    let turns = 0;

    while (state.phase === 'ACTION' && turns < 400) {
      const action = chooseWallBotAction(state, levels[state.activePlayerIndex], rand);
      state = action.type === 'MOVE' ? applyMove(state, action.target) : applyWall(state, action.wall);
      turns += 1;
    }

    if (state.phase !== 'GAME_OVER' || state.winnerId === null) {
      unfinished += 1;
      continue;
    }
    wins[levels[state.winnerId]] += 1;
  }

  return { wins, unfinished, games };
}

describe('WallGo bot', () => {
  it('exposes three difficulty levels with readable copy', () => {
    expect(WALL_BOT_LEVELS.map((l) => l.id)).toEqual(['santai', 'sedang', 'sempurna']);
    expect(describeWallBotLevel('santai')).toContain('dinding');
    expect(describeWallBotLevel('sempurna')).toContain('lompatan');
  });

  it('never places a wall on the easy tier', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = runGame(3, 'santai', seed);
      expect(state.walls).toHaveLength(0);
    }
  });

  it('wanders on the easy tier while the other tiers close in', () => {
    const base = createGame({ playerCount: 2 });
    // The bot is pinned to the left edge so one direction is clearly best, and the engine lists
    // legal moves north, south, west, east.
    const positions = [
      { x: 0, y: 4 },
      { x: 8, y: 8 },
    ];
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => ({ ...p, position: positions[i], distanceToCore: i === 0 ? 4 : 8 })),
      activePlayerIndex: 0,
    };

    expect(getValidMoves(state).map((m) => `${m.x}:${m.y}`)).toEqual(['0:3', '0:5', '1:4']);

    expect(chooseWallBotAction(state, 'santai', () => 0.01)).toEqual({ type: 'MOVE', target: { x: 0, y: 3 } });
    expect(chooseWallBotAction(state, 'santai', () => 0.99)).toEqual({ type: 'MOVE', target: { x: 1, y: 4 } });

    for (const level of ['sedang', 'sempurna'] as const) {
      expect(chooseWallBotAction(state, level, () => 0.01)).toEqual({ type: 'MOVE', target: { x: 1, y: 4 } });
    }
  });

  it('reaches the core in every game it plays, with 2 to 6 seats', { timeout: 90000 }, () => {
    for (const playerCount of [2, 3, 4, 6]) {
      for (const level of WALL_BOT_LEVELS.map((l) => l.id)) {
        const { state, turns } = runGame(playerCount, level, playerCount * 13 + 7);
        expect(state.phase, `${playerCount} seats ${level}`).toBe('GAME_OVER');
        expect(state.winnerId).not.toBeNull();
        expect(turns).toBeLessThan(400);
        const winner = seat(state, state.winnerId as number);
        expect(winner.position).toEqual(state.corePosition);
      }
    }
  });

  it('spends walls on the two wall-using tiers but stays inside the quota', { timeout: 90000 }, () => {
    for (const level of ['sedang', 'sempurna'] as const) {
      let walled = 0;

      for (let seed = 1; seed <= 10; seed++) {
        const { state } = runGame(2, level, seed * 31);
        walled += state.walls.length;
        for (const player of state.players) {
          expect(player.wallsRemaining).toBeGreaterThanOrEqual(0);
        }
      }

      expect(walled, level).toBeGreaterThan(0);
    }
  });

  it('keeps every player reachable after each wall it places', () => {
    const rand = lcg(99);
    let state = createGame({ playerCount: 2 });
    let guard = 0;

    while (state.phase === 'ACTION' && guard++ < 200) {
      const action = chooseWallBotAction(state, 'sempurna', rand);
      state = action.type === 'MOVE' ? applyMove(state, action.target) : applyWall(state, action.wall);

      for (const player of state.players) {
        expect(player.distanceToCore).toBeLessThan(99);
      }
    }

    expect(state.phase).toBe('GAME_OVER');
  });

  it('answers fast enough for a live turn', () => {
    let state = createGame({ playerCount: 4 });
    const started = Date.now();
    let moves = 0;

    while (state.phase === 'ACTION' && moves < 60) {
      const action = chooseWallBotAction(state, 'sempurna', lcg(moves + 1));
      state = action.type === 'MOVE' ? applyMove(state, action.target) : applyWall(state, action.wall);
      moves += 1;
    }

    expect(Date.now() - started).toBeLessThan(1500);
  });

  it(
    'walls only where every rival is delayed more than the bot itself',
    { timeout: 90000 },
    () => {
      // On a six seat table a wall that slows two rivals hands the other three a free tempo, so
      // this tier mostly runs there. The invariant has to hold for the walls it does play.
      for (const playerCount of [2, 6]) {
        const rand = lcg(4243 + playerCount);
        let state = createGame({ playerCount });
        let wallsSeen = 0;
        let guard = 0;

        while (state.phase === 'ACTION' && guard++ < 300) {
          const action = chooseWallBotAction(state, 'sempurna', rand);

          if (action.type === 'MOVE') {
            state = applyMove(state, action.target);
            continue;
          }

          const before = state.players.map((p) => p.distanceToCore);
          const actor = state.activePlayerIndex;
          const next = applyWall(state, action.wall);
          const selfCost = next.players[actor].distanceToCore - before[actor];

          for (const player of next.players) {
            if (player.id === actor) continue;
            expect(player.distanceToCore - before[player.id], `seat ${player.id}`).toBeGreaterThanOrEqual(
              selfCost + 2
            );
          }

          wallsSeen += 1;
          state = next;
        }

        expect(state.phase, `${playerCount} seats`).toBe('GAME_OVER');
        if (playerCount === 2) expect(wallsSeen).toBeGreaterThan(0);
      }
    }
  );

  // A wall-clock budget is not a property of the code: the same commit measured 2333ms, 2415ms and
  // 2451ms on runs that passed and 3465ms and 4262ms on runs that failed, and one production deploy
  // was skipped because of it. This compares the search against a calibration workload measured in
  // the same process, so the signal (work per bot ply) survives but runner speed does not decide it.
  // The calibration stays small on purpose. The runner measured about 1.7x slower than a laptop on
  // both sides of the ratio, so a 20000-path calibration with three samples turned this one test
  // into a 4.6 second job and it died on Vitest's 5 second default instead. 5000 paths x3 samples
  // costs about 105ms per sample, and the test carries its own timeout so the margin is written down
  // here rather than inherited from a default that can change.
  // Budget basis, measured over five runs: normal code lands at 10.60x to 14.14x, and a search made
  // deliberately twice as expensive lands at 27.89x, 28.66x and 29.89x. 22x therefore has 1.5x room
  // over the worst normal run and still fails a real regression. When the machine is busy both sides
  // slow down together and the ratio drops, which is the point of measuring it this way.
  it('keeps the wide-board search cheap against a calibration workload', { timeout: 30000 }, () => {
    const CALIBRATION_PATHS = 5000;
    const TURN_BUDGET_RATIO = 22;

    const board = createGame({ playerCount: 6, gridSize: 13 });
    const corner = { x: 0, y: 0 };

    // The fastest of three samples: a busy runner inflates a measurement but never beats the
    // machine's own ceiling, so the minimum is the stable estimate of raw pathfinding speed.
    let calibMs = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 3; attempt++) {
      const start = performance.now();
      for (let i = 0; i < CALIBRATION_PATHS; i++) {
        getShortestPath(corner, board.corePosition, board.walls, board.gridSize);
      }
      calibMs = Math.min(calibMs, performance.now() - start);
    }

    let state = board;
    const rand = lcg(11);
    let plies = 0;
    const searchStart = performance.now();

    while (state.phase === 'ACTION' && plies < 60) {
      state = applyAction(state, chooseWallBotAction(state, 'sempurna', rand));
      plies += 1;
    }

    const searchMs = performance.now() - searchStart;
    const ratio = searchMs / calibMs;
    console.log(
      `[wall-bot search cost] ${plies} plies ${searchMs.toFixed(0)}ms / ${CALIBRATION_PATHS} BFS ${calibMs.toFixed(0)}ms = ${ratio.toFixed(2)}x`
    );

    expect(plies).toBeGreaterThan(20);
    expect(calibMs).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(TURN_BUDGET_RATIO);
  });

  it('refuses to move in a finished game', () => {
    const finished = createGame({ playerCount: 2 });
    const over: GameState = { ...finished, phase: 'GAME_OVER', winnerId: 0 };
    expect(() => chooseWallBotAction(over, 'santai')).toThrow(/sudah selesai/);
  });

  it('plays a ladder where no tier is weaker than the one below it', { timeout: 300000 }, () => {
    const GAMES = 100;
    const matchups = [
      { a: 'santai' as WallBotLevel, b: 'sedang' as WallBotLevel },
      { a: 'sedang' as WallBotLevel, b: 'sempurna' as WallBotLevel },
      { a: 'santai' as WallBotLevel, b: 'sempurna' as WallBotLevel },
    ];

    const rows = matchups.map(({ a, b }) => {
      const { wins, unfinished } = runMatchup(a, b, GAMES);
      return { a, b, winsA: wins[a], winsB: wins[b], unfinished };
    });

    const table = rows
      .map((r) => `${r.a} ${r.winsA} - ${r.winsB} ${r.b} (stale ${r.unfinished})`)
      .join('\n');
    // Recorded in CHANGELOG.md so the published numbers match what this test measured.
    console.log(`[wall-bot ladder] ${GAMES} games per pair, seeded\n${table}`);

    for (const row of rows) {
      expect(row.unfinished).toBe(0);
    }

    const [easyVsMedium, mediumVsHard, easyVsHard] = rows;

    // The easy tier never walls, and a race with no walls is lost on tempo: that gap is wide enough
    // to assert. Hard over medium measured 52-48 here, inside noise for a two seat race where the
    // opening seat wins on tempo alone, so it is only held to "not worse".
    expect(easyVsMedium.winsB, table).toBeGreaterThan(GAMES * 0.9);
    expect(easyVsHard.winsB, table).toBeGreaterThan(GAMES * 0.9);
    expect(mediumVsHard.winsB, table).toBeGreaterThanOrEqual(mediumVsHard.winsA);
  });
});
