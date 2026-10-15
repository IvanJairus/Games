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
} from '@/games/wall-game/engine';

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
      expect(getInitialWallQuota(1)).toBe(10);
    });
  });

  describe('Move Mechanics & Pawn Jumping', () => {
    it('allows legal orthogonal steps at start', () => {
      const game = createGame({ playerCount: 2, gridSize: 9 });
      // Player 0 at (4, 8)
      const valid = getValidMoves(game);
      expect(valid).toEqual(
        expect.arrayContaining([
          { x: 4, y: 7 }, // North
          { x: 3, y: 8 }, // West
          { x: 5, y: 8 }, // East
        ])
      );
      expect(valid).toHaveLength(3); // South is out of bounds
    });

    it('blocks movement across horizontal and vertical walls', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Player 0 at (4, 8). Place horizontal wall right in front at (4, 7)
      game = {
        ...game,
        walls: [{ orientation: 'H', x: 4, y: 7 }],
      };

      const valid = getValidMoves(game);
      // North step (4, 7) must be blocked
      const canMoveNorth = valid.some((m) => m.x === 4 && m.y === 7);
      expect(canMoveNorth).toBe(false);
    });

    it('allows jumping straight over an opponent pawn', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Move Player 0 to (4, 5) and Player 1 to (4, 4)
      game.players[0].position = { x: 4, y: 5 };
      game.players[1].position = { x: 4, y: 4 };

      const valid = getValidMoves(game);
      // Can jump straight over Player 1 to (4, 3)
      const canJumpStraight = valid.some((m) => m.x === 4 && m.y === 3);
      expect(canJumpStraight).toBe(true);
    });

    it('allows diagonal jump when straight jump is blocked by a wall', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Player 0 at (4, 5), Player 1 at (4, 4).
      // Place a horizontal wall between Player 1 (4, 4) and (4, 3)
      game.players[0].position = { x: 4, y: 5 };
      game.players[1].position = { x: 4, y: 4 };
      game.walls = [{ orientation: 'H', x: 4, y: 3 }];

      const valid = getValidMoves(game);
      // Straight jump to (4, 3) should NOT be allowed
      expect(valid.some((m) => m.x === 4 && m.y === 3)).toBe(false);
      // Diagonal jumps to (3, 4) and (5, 4) SHOULD be allowed
      expect(valid.some((m) => m.x === 3 && m.y === 4)).toBe(true);
      expect(valid.some((m) => m.x === 5 && m.y === 4)).toBe(true);
    });

    it('detects victory immediately upon stepping onto The Golden Core', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      // Position Player 0 adjacent to Core (4, 4), e.g. at (4, 5)
      game.players[0].position = { x: 4, y: 5 };

      const nextState = applyMove(game, { x: 4, y: 4 });
      expect(nextState.phase).toBe('GAME_OVER');
      expect(nextState.winnerId).toBe(0);
      expect(nextState.players[0].position).toEqual({ x: 4, y: 4 });
    });
  });

  describe('Wall Placement & BFS Anti-Trap Rule', () => {
    it('rejects wall placement when player has 0 walls remaining', () => {
      let game = createGame({ playerCount: 2, gridSize: 9 });
      game.players[0].wallsRemaining = 0;

      const isValid = isValidWallPlacement(game, { orientation: 'H', x: 3, y: 3 });
      expect(isValid).toBe(false);
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
      expect(() => applyWall(game, trappingWall)).toThrow(/Invalid or illegal wall placement/);
    });

    it('applies wall, decrements quota, updates distances, and cycles turn', () => {
      const initial = createGame({ playerCount: 2, gridSize: 9 });
      const next = applyWall(initial, { orientation: 'H', x: 1, y: 1 });

      expect(next.walls).toHaveLength(1);
      expect(next.players[0].wallsRemaining).toBe(9);
      expect(next.players[1].wallsRemaining).toBe(10);
      expect(next.activePlayerIndex).toBe(1);
      expect(next.turn).toBe(2);
      expect(next.history).toHaveLength(1);
      expect(next.history[0].type).toBe('WALL');
    });

    it('stamps the wall with the seat that placed it, whoever is on turn', () => {
      const first = applyWall(createGame({ playerCount: 2, gridSize: 9 }), { orientation: 'H', x: 1, y: 1 });
      expect(first.walls[0]).toMatchObject({ orientation: 'H', x: 1, y: 1, owner: 0 });

      const second = applyWall(first, { orientation: 'V', x: 5, y: 5 });
      expect(second.walls[1].owner).toBe(1);
    });
  });

  describe('Pathfinding & Utilities', () => {
    it('getShortestPath returns correct path and handles blocked routes', () => {
      const path = getShortestPath({ x: 0, y: 0 }, { x: 2, y: 0 }, [], 9);
      expect(path).toHaveLength(3);

      const pathSelf = getShortestPath({ x: 3, y: 3 }, { x: 3, y: 3 }, [], 9);
      expect(pathSelf).toHaveLength(1);
    });

    it('isPathBlockedByWall checks accurate spans', () => {
      const wallH = [{ orientation: 'H' as const, x: 2, y: 2 }];
      // Vertical step crossing wall
      expect(isPathBlockedByWall({ x: 2, y: 2 }, { x: 2, y: 3 }, wallH)).toBe(true);
      expect(isPathBlockedByWall({ x: 3, y: 2 }, { x: 3, y: 3 }, wallH)).toBe(true);
      expect(isPathBlockedByWall({ x: 4, y: 2 }, { x: 4, y: 3 }, wallH)).toBe(false);
    });
  });
});
