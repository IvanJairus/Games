import { describe, it, expect } from 'vitest';
import {
  applyMove,
  applyWall,
  createGame,
  getValidMoves,
  isValidWallPlacement,
  GameState,
} from '@/games/wall-game/engine';
import { chooseWallBotAction, describeWallBotStyle, WALL_BOT_STYLES } from '@/games/wall-game/engine/ai';

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const seat = (state: GameState, index: number) => state.players[index];

function runGame(playerCount: number, style: 'jalan' | 'agresif', seed: number, maxTurns = 400) {
  const rand = lcg(seed);
  let state = createGame({ playerCount, playerNames: Array.from({ length: playerCount }, (_, i) => `Bot ${i + 1}`) });
  let turns = 0;

  while (state.phase === 'ACTION' && turns < maxTurns) {
    const action = chooseWallBotAction(state, style, rand);
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

describe('WallGo bot', () => {
  it('exposes two styles with readable copy', () => {
    expect(WALL_BOT_STYLES.map((s) => s.id)).toEqual(['jalan', 'agresif']);
    expect(describeWallBotStyle('agresif')).toContain('dinding');
  });

  it('never places a wall in the walk-only style', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = runGame(3, 'jalan', seed);
      expect(state.walls).toHaveLength(0);
    }
  });

  it('reaches the core in every game it plays, with 2 to 6 seats', () => {
    for (const playerCount of [2, 3, 4, 6]) {
      for (const style of ['jalan', 'agresif'] as const) {
        const { state, turns } = runGame(playerCount, style, playerCount * 13 + 7);
        expect(state.phase, `${playerCount} seats ${style}`).toBe('GAME_OVER');
        expect(state.winnerId).not.toBeNull();
        expect(turns).toBeLessThan(400);
        const winner = seat(state, state.winnerId as number);
        expect(winner.position).toEqual(state.corePosition);
      }
    }
  });

  it('spends walls in the aggressive style but stays inside the quota', () => {
    let walled = 0;

    for (let seed = 1; seed <= 10; seed++) {
      const { state } = runGame(2, 'agresif', seed * 31);
      walled += state.walls.length;
      for (const player of state.players) {
        expect(player.wallsRemaining).toBeGreaterThanOrEqual(0);
      }
    }

    expect(walled).toBeGreaterThan(0);
  });

  it('keeps every player reachable after each wall it places', () => {
    const rand = lcg(99);
    let state = createGame({ playerCount: 2 });
    let guard = 0;

    while (state.phase === 'ACTION' && guard++ < 200) {
      const action = chooseWallBotAction(state, 'agresif', rand);
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
      const action = chooseWallBotAction(state, 'agresif', lcg(moves + 1));
      state = action.type === 'MOVE' ? applyMove(state, action.target) : applyWall(state, action.wall);
      moves += 1;
    }

    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('refuses to move in a finished game', () => {
    const finished = createGame({ playerCount: 2 });
    const over: GameState = { ...finished, phase: 'GAME_OVER', winnerId: 0 };
    expect(() => chooseWallBotAction(over, 'jalan')).toThrow(/sudah selesai/);
  });
});
