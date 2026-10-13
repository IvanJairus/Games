import { describe, it, expect } from 'vitest';
import {
  createGame,
  getValidMoves,
  applyMove,
  passMove,
  isValidWallPlacement,
  applyWall,
  computeTerritories,
  getWallKey,
  isWallBlocking,
  getRecommendedGridSize,
  getSpawnPositions,
} from '../supabase/functions/_shared/wallgame/engine';

describe('WallGo Core Engine', () => {
  describe('Game Initialization & Dynamic Scaling', () => {
    it('creates a 2-player game with default 7x7 grid', () => {
      const game = createGame({ playerCount: 2 });
      expect(game.gridSize).toBe(7);
      expect(game.playerCount).toBe(2);
      expect(game.players).toHaveLength(2);
      expect(game.activePlayerIndex).toBe(0);
      expect(game.phase).toBe('MOVE');
      expect(game.turn).toBe(1);
      expect(game.winnerIds).toBeNull();

      // Check spawn positions: North and South
      expect(game.players[0].position).toEqual({ x: 3, y: 0 });
      expect(game.players[1].position).toEqual({ x: 3, y: 6 });
    });

    it('creates dynamic games for 3, 4, 5, and 6 players with appropriate grid sizes', () => {
      const g3 = createGame({ playerCount: 3 });
      expect(g3.gridSize).toBe(9);
      expect(g3.players).toHaveLength(3);

      const g4 = createGame({ playerCount: 4 });
      expect(g4.gridSize).toBe(11);
      expect(g4.players).toHaveLength(4);

      const g5 = createGame({ playerCount: 5 });
      expect(g5.gridSize).toBe(13);
      expect(g5.players).toHaveLength(5);

      const g6 = createGame({ playerCount: 6 });
      expect(g6.gridSize).toBe(13);
      expect(g6.players).toHaveLength(6);
    });

    it('enforces odd grid size for symmetry', () => {
      const game = createGame({ playerCount: 2, gridSize: 8 });
      expect(game.gridSize).toBe(9); // Rounded up to odd
    });

    it('applies custom player names', () => {
      const game = createGame({
        playerCount: 2,
        playerNames: ['Alice', 'Bob'],
      });
      expect(game.players[0].name).toBe('Alice');
      expect(game.players[1].name).toBe('Bob');
    });

    it('generates valid spawn positions within bounds', () => {
      for (const count of [2, 3, 4, 5, 6]) {
        const size = getRecommendedGridSize(count);
        const spawns = getSpawnPositions(count, size);
        expect(spawns).toHaveLength(count);
        for (const pos of spawns) {
          expect(pos.x).toBeGreaterThanOrEqual(0);
          expect(pos.x).toBeLessThan(size);
          expect(pos.y).toBeGreaterThanOrEqual(0);
          expect(pos.y).toBeLessThan(size);
        }
      }
    });
  });

  describe('Move Phase', () => {
    it('returns legal moves at start for Player 1', () => {
      const game = createGame({ playerCount: 2, gridSize: 7 });
      const moves = getValidMoves(game);

      // Player 1 at (3, 0): can move Left (2, 0), Right (4, 0), Down (3, 1). Cannot move Up (-1).
      expect(moves).toHaveLength(3);
      expect(moves).toContainEqual({ x: 2, y: 0 });
      expect(moves).toContainEqual({ x: 4, y: 0 });
      expect(moves).toContainEqual({ x: 3, y: 1 });
    });

    it('prevents moving into cell occupied by another player', () => {
      const game = createGame({ playerCount: 2, gridSize: 7 });
      // Move Player 2 directly next to Player 1 for testing
      game.players[1].position = { x: 3, y: 1 };

      const moves = getValidMoves(game);
      expect(moves).not.toContainEqual({ x: 3, y: 1 });
      expect(moves).toContainEqual({ x: 2, y: 0 });
      expect(moves).toContainEqual({ x: 4, y: 0 });
    });

    it('prevents moving across a horizontal wall', () => {
      let game = createGame({ playerCount: 2, gridSize: 7 });
      // Place horizontal wall below (3, 0)
      game.walls.push({ orientation: 'H', x: 3, y: 0 });

      const moves = getValidMoves(game);
      expect(moves).not.toContainEqual({ x: 3, y: 1 });
      expect(moves).toContainEqual({ x: 2, y: 0 });
      expect(moves).toContainEqual({ x: 4, y: 0 });
    });

    it('prevents moving across a vertical wall', () => {
      let game = createGame({ playerCount: 2, gridSize: 7 });
      // Place vertical wall to the right of (3, 0)
      game.walls.push({ orientation: 'V', x: 3, y: 0 });

      const moves = getValidMoves(game);
      expect(moves).not.toContainEqual({ x: 4, y: 0 });
      expect(moves).toContainEqual({ x: 2, y: 0 });
      expect(moves).toContainEqual({ x: 3, y: 1 });
    });

    it('successfully applies a move and transitions to WALL phase', () => {
      const game = createGame({ playerCount: 2, gridSize: 7 });
      const updated = applyMove(game, { x: 3, y: 1 });

      expect(updated.players[0].position).toEqual({ x: 3, y: 1 });
      expect(updated.phase).toBe('WALL');
      expect(updated.activePlayerIndex).toBe(0); // Still player 0 until wall placed
      expect(updated.history).toHaveLength(1);
      expect(updated.history[0].type).toBe('MOVE');
    });

    it('throws error when attempting invalid move', () => {
      const game = createGame({ playerCount: 2, gridSize: 7 });
      expect(() => applyMove(game, { x: 0, y: 0 })).toThrow('Invalid move');
    });

    it('allows passMove only when trapped with no legal moves', () => {
      const game = createGame({ playerCount: 2, gridSize: 7 });
      // Should throw if valid moves exist
      expect(() => passMove(game)).toThrow('Cannot pass move when valid moves are available');

      // Trap player 0 at (3, 0) with walls
      game.walls.push({ orientation: 'V', x: 2, y: 0 }); // Left
      game.walls.push({ orientation: 'V', x: 3, y: 0 }); // Right
      game.walls.push({ orientation: 'H', x: 3, y: 0 }); // Bottom

      expect(getValidMoves(game)).toHaveLength(0);
      const passed = passMove(game);
      expect(passed.players[0].isTrapped).toBe(true);
      expect(passed.phase).toBe('WALL');
      expect(passed.history[0].type).toBe('PASS_MOVE');
    });
  });

  describe('Wall Placement & Turn Cycling', () => {
    it('validates wall placement bounds and rejects duplicates', () => {
      const game = createGame({ playerCount: 2, gridSize: 7 });
      game.phase = 'WALL';

      expect(isValidWallPlacement(game, { orientation: 'H', x: 0, y: 0 })).toBe(true);
      expect(isValidWallPlacement(game, { orientation: 'H', x: 0, y: 6 })).toBe(false); // Out of bounds y for H
      expect(isValidWallPlacement(game, { orientation: 'V', x: 6, y: 0 })).toBe(false); // Out of bounds x for V

      game.walls.push({ orientation: 'H', x: 2, y: 2 });
      expect(isValidWallPlacement(game, { orientation: 'H', x: 2, y: 2 })).toBe(false); // Duplicate
    });

    it('places wall and cycles turn to next player', () => {
      let game = createGame({ playerCount: 3, gridSize: 9 });
      game = applyMove(game, { x: 4, y: 1 });
      expect(game.phase).toBe('WALL');

      game = applyWall(game, { orientation: 'H', x: 4, y: 0 });
      expect(game.phase).toBe('MOVE');
      expect(game.activePlayerIndex).toBe(1); // Player 2 turn now
      expect(game.turn).toBe(2);
      expect(game.walls).toHaveLength(1);
    });

    it('cycles from last player back to first player in 5-player game', () => {
      let game = createGame({ playerCount: 5, gridSize: 11 });
      game.activePlayerIndex = 4; // Last player
      game.phase = 'WALL';

      game = applyWall(game, { orientation: 'H', x: 0, y: 0 });
      expect(game.activePlayerIndex).toBe(0); // Back to Player 1
    });
  });

  describe('Territory & Game Over Evaluation', () => {
    it('computes territories correctly on open board', () => {
      const game = createGame({ playerCount: 2, gridSize: 5 });
      const territories = computeTerritories(game);

      // Open board: 1 single territory containing both players
      expect(territories).toHaveLength(1);
      expect(territories[0].size).toBe(25);
      expect(territories[0].playerId).toBeNull(); // Contested by both players
    });

    it('detects game over when all players are isolated into distinct territories', () => {
      let game = createGame({ playerCount: 2, gridSize: 5 });
      // Player 0 at (2, 0), Player 1 at (2, 4)
      // Build a full horizontal wall across row 2: y = 2
      // Cells x = 0..4, y = 2
      for (let x = 0; x < 5; x++) {
        game.walls.push({ orientation: 'H', x, y: 1 });
      }

      game.phase = 'WALL';
      // Placing final wall triggers recomputation
      const finalState = applyWall(game, { orientation: 'H', x: 0, y: 3 });

      expect(finalState.phase).toBe('GAME_OVER');
      expect(finalState.winnerIds).not.toBeNull();
      expect(finalState.players[0].score).toBeGreaterThan(0);
      expect(finalState.players[1].score).toBeGreaterThan(0);
    });
  });

  describe('Helper Functions', () => {
    it('isWallBlocking identifies blocking walls properly', () => {
      const wallSet = new Set(['H:2:1', 'V:1:2']);
      // Movement between (2, 1) and (2, 2) is vertical -> blocked by H:2:1
      expect(isWallBlocking({ x: 2, y: 1 }, { x: 2, y: 2 }, wallSet)).toBe(true);
      // Movement between (1, 2) and (2, 2) is horizontal -> blocked by V:1:2
      expect(isWallBlocking({ x: 1, y: 2 }, { x: 2, y: 2 }, wallSet)).toBe(true);
      // Movement between (2, 2) and (2, 3) is unblocked
      expect(isWallBlocking({ x: 2, y: 2 }, { x: 2, y: 3 }, wallSet)).toBe(false);
    });

    it('getWallKey produces consistent format', () => {
      expect(getWallKey({ orientation: 'H', x: 4, y: 2 })).toBe('H:4:2');
      expect(getWallKey({ orientation: 'V', x: 0, y: 5 })).toBe('V:0:5');
    });
  });
});
