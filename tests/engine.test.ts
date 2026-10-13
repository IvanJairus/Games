import { describe, it, expect } from 'vitest';
import {
  createGame,
  getValidMoves,
  applyMove,
  isValidWallPlacement,
  applyWall,
  getShortestPath,
  isPathBlockedByWall,
  getRecommendedGridSize,
  getSpawnPositions,
  getInitialWallQuota,
} from '../supabase/functions/_shared/wallgame/engine';

describe('WallGo: Race to the Golden Core Engine', () => {
  describe('Game Initialization & Symmetric Balance', () => {
    it('creates 2-player game with equidistant spawn points to the Golden Core', () => {
      const game = createGame({ playerCount: 2, gridSize: 9 });
      expect(game.gridSize).toBe(9);
      expect(game.corePosition).toEqual({ x: 4, y: 4 });
      expect(game.players).toHaveLength(2);
      expect(game.players[0].wallsRemaining).toBe(10);
      expect(game.players[1].wallsRemaining).toBe(10);

      // Both players start with identical distance to core (4 steps)
      expect(game.players[0].distanceToCore).toBe(4);
      expect(game.players[1].distanceToCore).toBe(4);
    });

    it('creates balanced games for 3, 4, 5, and 6 players with appropriate quotas', () => {
      const g3 = createGame({ playerCount: 3, gridSize: 9 });
      expect(g3.players[0].wallsRemaining).toBe(7);
      expect(g3.players[0].distanceToCore).toBe(4);
      expect(g3.players[1].distanceToCore).toBe(4);
      expect(g3.players[2].distanceToCore).toBe(4);

      const g4 = createGame({ playerCount: 4, gridSize: 11 });
      expect(g4.corePosition).toEqual({ x: 5, y: 5 });
      expect(g4.players[0].wallsRemaining).toBe(5);
      expect(g4.players[0].distanceToCore).toBe(5);

      const g5 = createGame({ playerCount: 5, gridSize: 11 });
      expect(g5.players[0].wallsRemaining).toBe(4);

      const g6 = createGame({ playerCount: 6, gridSize: 13 });
      expect(g6.players[0].wallsRemaining).toBe(3);
    });

    it('enforces odd grid size', () => {
      const game = createGame({ playerCount: 2, gridSize: 10 });
      expect(game.gridSize).toBe(11); // Rounded up to odd
    });

    it('covers recommended grid sizes and default spawn positions', () => {
      expect(getRecommendedGridSize(2)).toBe(9);
      expect(getRecommendedGridSize(5)).toBe(11);
      expect(getRecommendedGridSize(6)).toBe(13);

      const spawnsDefault = getSpawnPositions(7, 11);
      expect(spawnsDefault).toHaveLength(7);
      expect(getInitialWallQuota(2)).toBe(10);
    });
  });

  describe('Move Mechanics & Pawn Jumping', () => {
    it('allows legal orthogonal steps at start', () => {
      const game = createGame({ playerCount: 2, gridSize: 9 });
      const moves = getValidMoves(game);

      // P0 at (4, 8): can step North (4, 7), West (3, 8), East (5, 8). South is off-board.
      expect(moves).toHaveLength(3);
      expect(moves).toContainEqual({ x: 4, y: 7 });
      expect(moves).toContainEqual({ x: 3, y: 8 });
      expect(moves).toContainEqual({ x: 5, y: 8 });
    });

    it('blocks movement across horizontal and vertical walls', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Place horizontal wall at (3, 7) -> blocks movement between row 7 and row 8 at col 3 and col 4!
      game.walls.push({ orientation: 'H', x: 3, y: 7 });

      const moves = getValidMoves(game);
      // North step (4, 7) should now be blocked
      expect(moves).not.toContainEqual({ x: 4, y: 7 });
      expect(moves).toContainEqual({ x: 3, y: 8 });
      expect(moves).toContainEqual({ x: 5, y: 8 });
    });

    it('allows jumping straight over an opponent pawn', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Place P1 directly in front of P0 at (4, 7)
      game.players[1].position = { x: 4, y: 7 };

      const moves = getValidMoves(game);
      // P0 at (4, 8) can jump over P1 at (4, 7) to land on (4, 6)!
      expect(moves).toContainEqual({ x: 4, y: 6 });
      expect(moves).not.toContainEqual({ x: 4, y: 7 }); // Cannot land on opponent
    });

    it('allows diagonal jump when straight jump is blocked by a wall', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      game.players[1].position = { x: 4, y: 7 };
      // Wall behind opponent at (4, 6)
      game.walls.push({ orientation: 'H', x: 3, y: 6 });

      const moves = getValidMoves(game);
      // Straight jump to (4, 6) is blocked, diagonal jumps to (3, 7) and (5, 7) are allowed!
      expect(moves).not.toContainEqual({ x: 4, y: 6 });
      expect(moves).toContainEqual({ x: 3, y: 7 });
      expect(moves).toContainEqual({ x: 5, y: 7 });
    });

    it('detects victory immediately upon stepping onto The Golden Core', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Place P0 adjacent to Core (4, 4) at (4, 5)
      game.players[0].position = { x: 4, y: 5 };

      const updated = applyMove(game, { x: 4, y: 4 });
      expect(updated.phase).toBe('GAME_OVER');
      expect(updated.winnerId).toBe(0);
      expect(updated.players[0].position).toEqual({ x: 4, y: 4 });
    });
  });

  describe('Wall Placement & BFS Anti-Trap Rule', () => {
    it('rejects wall placement when player has 0 walls remaining', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      game.players[0].wallsRemaining = 0;

      expect(isValidWallPlacement(game, { orientation: 'H', x: 2, y: 2 })).toBe(false);
    });

    it('rejects overlapping and crossing walls', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      game.walls.push({ orientation: 'H', x: 3, y: 3 });

      // Direct duplicate
      expect(isValidWallPlacement(game, { orientation: 'H', x: 3, y: 3 })).toBe(false);
      // Overlap adjacent horizontal
      expect(isValidWallPlacement(game, { orientation: 'H', x: 2, y: 3 })).toBe(false);
      expect(isValidWallPlacement(game, { orientation: 'H', x: 4, y: 3 })).toBe(false);
      // Cross cut at same intersection
      expect(isValidWallPlacement(game, { orientation: 'V', x: 3, y: 3 })).toBe(false);
      // Non-overlapping vertical wall is valid
      expect(isValidWallPlacement(game, { orientation: 'V', x: 1, y: 1 })).toBe(true);
    });

    it('enforces Fair Rule (BFS Anti-Trap) preventing complete blockage of the Core', () => {
      let game = createGame({ playerCount: 2, gridSize: 7 });
      // Surround player 0 at (3, 6) with walls
      game.walls.push({ orientation: 'H', x: 2, y: 5 });
      game.walls.push({ orientation: 'H', x: 4, y: 5 });
      game.walls.push({ orientation: 'V', x: 1, y: 5 });

      // Wall that would completely trap P0 from reaching Core (3, 3)
      const trappingWall = { orientation: 'V' as const, x: 4, y: 5 };
      expect(isValidWallPlacement(game, trappingWall)).toBe(false);
    });

    it('applies wall, decrements quota, updates distances, and cycles turn', () => {
      let game = createGame({ playerCount: 3, gridSize: 9 });
      const initialQuota = game.players[0].wallsRemaining;

      game = applyWall(game, { orientation: 'H', x: 2, y: 2 });
      expect(game.players[0].wallsRemaining).toBe(initialQuota - 1);
      expect(game.walls).toHaveLength(1);
      expect(game.activePlayerIndex).toBe(1); // Turn advanced to P1
      expect(game.turn).toBe(2);
    });
  });

  describe('Pathfinding & Utilities', () => {
    it('getShortestPath returns correct path and handles blocked routes', () => {
      const path = getShortestPath({ x: 0, y: 0 }, { x: 2, y: 0 }, [], 5);
      expect(path).toHaveLength(3); // (0,0) -> (1,0) -> (2,0)

      // Block with vertical wall
      const walls = [{ orientation: 'V' as const, x: 0, y: 0 }];
      const blockedPath = getShortestPath({ x: 0, y: 0 }, { x: 1, y: 0 }, walls, 5);
      // Must detour around wall
      expect(blockedPath?.length).toBeGreaterThan(2);
    });

    it('isPathBlockedByWall checks accurate spans', () => {
      const walls = [{ orientation: 'H' as const, x: 2, y: 1 }];
      // Wall at (2, 1) blocks col 2 and col 3 between row 1 and row 2
      expect(isPathBlockedByWall({ x: 2, y: 1 }, { x: 2, y: 2 }, walls)).toBe(true);
      expect(isPathBlockedByWall({ x: 3, y: 1 }, { x: 3, y: 2 }, walls)).toBe(true);
      expect(isPathBlockedByWall({ x: 1, y: 1 }, { x: 1, y: 2 }, walls)).toBe(false);
    });
  });
});
