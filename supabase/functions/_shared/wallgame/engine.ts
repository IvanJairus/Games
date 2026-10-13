/**
 * WallGo Core Game Engine (Pure TypeScript, zero DOM/Node dependencies).
 * Source of truth for both client and Supabase Edge Functions.
 */

export type WallOrientation = 'H' | 'V';

export interface Wall {
  orientation: WallOrientation;
  x: number;
  y: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  borderColor: string;
  position: Position;
  score: number;
  isTrapped: boolean;
}

export type GamePhase = 'MOVE' | 'WALL' | 'GAME_OVER';

export interface Territory {
  playerId: number | null; // null if neutral (no player inside)
  cells: Position[];
  size: number;
}

export interface GameState {
  gridSize: number;
  playerCount: number;
  players: Player[];
  walls: Wall[];
  activePlayerIndex: number;
  phase: GamePhase;
  turn: number;
  winnerIds: number[] | 'TIE' | null;
  territories: Territory[];
  history: GameActionLog[];
}

export interface GameActionLog {
  turn: number;
  playerId: number;
  type: 'MOVE' | 'PASS_MOVE' | 'WALL';
  detail: string;
}

export interface CreateGameOptions {
  playerCount: number;
  gridSize?: number;
  playerNames?: string[];
}

export const DEFAULT_PLAYER_THEMES = [
  { name: 'Player 1', hex: '#EF4444', borderColor: '#DC2626' }, // Red
  { name: 'Player 2', hex: '#3B82F6', borderColor: '#2563EB' }, // Blue
  { name: 'Player 3', hex: '#10B981', borderColor: '#059669' }, // Emerald
  { name: 'Player 4', hex: '#F59E0B', borderColor: '#D97706' }, // Amber
  { name: 'Player 5', hex: '#8B5CF6', borderColor: '#7C3AED' }, // Purple
  { name: 'Player 6', hex: '#06B6D4', borderColor: '#0891B2' }, // Cyan
];

/**
 * Calculates recommended grid size for a given player count.
 */
export function getRecommendedGridSize(playerCount: number): number {
  if (playerCount <= 2) return 7;
  if (playerCount <= 3) return 9;
  if (playerCount <= 4) return 11;
  return 13;
}

/**
 * Returns balanced spawn positions for N players around perimeter.
 */
export function getSpawnPositions(playerCount: number, gridSize: number): Position[] {
  const mid = Math.floor(gridSize / 2);
  const max = gridSize - 1;

  switch (playerCount) {
    case 2:
      return [
        { x: mid, y: 0 },
        { x: mid, y: max },
      ];
    case 3:
      return [
        { x: mid, y: 0 },
        { x: 1, y: max },
        { x: max - 1, y: max },
      ];
    case 4:
      return [
        { x: mid, y: 0 },
        { x: max, y: mid },
        { x: mid, y: max },
        { x: 0, y: mid },
      ];
    case 5:
      return [
        { x: mid, y: 0 },
        { x: max, y: 1 },
        { x: max, y: max - 1 },
        { x: 1, y: max },
        { x: 0, y: mid },
      ];
    case 6: {
      const q = Math.max(1, Math.floor(gridSize / 3));
      return [
        { x: q, y: 0 },
        { x: max - q, y: 0 },
        { x: max, y: mid },
        { x: max - q, y: max },
        { x: q, y: max },
        { x: 0, y: mid },
      ];
    }
    default: {
      // Fallback for any count
      const positions: Position[] = [];
      for (let i = 0; i < playerCount; i++) {
        const x = Math.min(max, (i * 2) % gridSize);
        const y = i % 2 === 0 ? 0 : max;
        positions.push({ x, y });
      }
      return positions;
    }
  }
}

/**
 * Creates canonical string key for wall identification.
 */
export function getWallKey(wall: Wall): string {
  return `${wall.orientation}:${wall.x}:${wall.y}`;
}

/**
 * Checks whether an edge between cell (x1, y1) and (x2, y2) is blocked by a wall.
 */
export function isWallBlocking(
  c1: Position,
  c2: Position,
  wallSet: Set<string>
): boolean {
  if (c1.x === c2.x) {
    // Vertical movement -> separated by a Horizontal wall
    const minY = Math.min(c1.y, c2.y);
    return wallSet.has(`H:${c1.x}:${minY}`);
  }
  if (c1.y === c2.y) {
    // Horizontal movement -> separated by a Vertical wall
    const minX = Math.min(c1.x, c2.x);
    return wallSet.has(`V:${minX}:${c1.y}`);
  }
  return false;
}

/**
 * Creates a new GameState.
 */
export function createGame(options: CreateGameOptions): GameState {
  const playerCount = Math.max(2, Math.min(6, options.playerCount));
  let gridSize = options.gridSize ?? getRecommendedGridSize(playerCount);

  // Ensure grid size is odd and at least 5
  if (gridSize % 2 === 0) gridSize += 1;
  gridSize = Math.max(5, Math.min(19, gridSize));

  const spawnPositions = getSpawnPositions(playerCount, gridSize);

  const players: Player[] = [];
  for (let i = 0; i < playerCount; i++) {
    const theme = DEFAULT_PLAYER_THEMES[i % DEFAULT_PLAYER_THEMES.length];
    players.push({
      id: i,
      name: options.playerNames?.[i]?.trim() || `Player ${i + 1}`,
      color: theme.hex,
      borderColor: theme.borderColor,
      position: spawnPositions[i],
      score: 0,
      isTrapped: false,
    });
  }

  const state: GameState = {
    gridSize,
    playerCount,
    players,
    walls: [],
    activePlayerIndex: 0,
    phase: 'MOVE',
    turn: 1,
    winnerIds: null,
    territories: [],
    history: [],
  };

  // Calculate initial territories
  state.territories = computeTerritories(state);
  return state;
}

/**
 * Returns array of legal moves for the active player.
 */
export function getValidMoves(state: GameState): Position[] {
  if (state.phase !== 'MOVE') return [];

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return [];

  const { x, y } = activePlayer.position;
  const wallSet = new Set(state.walls.map(getWallKey));
  const occupiedSet = new Set(
    state.players.map((p) => `${p.position.x}:${p.position.y}`)
  );

  const candidates: Position[] = [
    { x, y: y - 1 }, // North
    { x, y: y + 1 }, // South
    { x: x - 1, y }, // West
    { x: x + 1, y }, // East
  ];

  return candidates.filter((target) => {
    // Bounds check
    if (
      target.x < 0 ||
      target.x >= state.gridSize ||
      target.y < 0 ||
      target.y >= state.gridSize
    ) {
      return false;
    }

    // Occupied by another player check
    if (occupiedSet.has(`${target.x}:${target.y}`)) {
      return false;
    }

    // Wall check
    if (isWallBlocking(activePlayer.position, target, wallSet)) {
      return false;
    }

    return true;
  });
}

/**
 * Checks if a specific wall placement is valid.
 */
export function isValidWallPlacement(state: GameState, wall: Wall): boolean {
  if (state.phase !== 'WALL') return false;

  // Boundary check
  if (wall.orientation === 'H') {
    if (wall.x < 0 || wall.x >= state.gridSize) return false;
    if (wall.y < 0 || wall.y >= state.gridSize - 1) return false;
  } else {
    if (wall.x < 0 || wall.x >= state.gridSize - 1) return false;
    if (wall.y < 0 || wall.y >= state.gridSize) return false;
  }

  // Duplicate check
  const wallKey = getWallKey(wall);
  for (const existing of state.walls) {
    if (getWallKey(existing) === wallKey) {
      return false;
    }
  }

  return true;
}

/**
 * Analyzes connected components on the board.
 */
export function computeTerritories(state: GameState): Territory[] {
  const { gridSize, walls, players } = state;
  const wallSet = new Set(walls.map(getWallKey));
  const visited = new Set<string>();
  const territories: Territory[] = [];

  const playerPositions = new Map<string, number>();
  for (const p of players) {
    playerPositions.set(`${p.position.x}:${p.position.y}`, p.id);
  }

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const key = `${x}:${y}`;
      if (visited.has(key)) continue;

      // BFS to find connected component
      const queue: Position[] = [{ x, y }];
      visited.add(key);
      const cells: Position[] = [];
      const playersInComponent: number[] = [];

      while (queue.length > 0) {
        const curr = queue.shift()!;
        cells.push(curr);

        const occupant = playerPositions.get(`${curr.x}:${curr.y}`);
        if (occupant !== undefined) {
          playersInComponent.push(occupant);
        }

        const neighbors: Position[] = [
          { x: curr.x, y: curr.y - 1 },
          { x: curr.x, y: curr.y + 1 },
          { x: curr.x - 1, y: curr.y },
          { x: curr.x + 1, y: curr.y },
        ];

        for (const next of neighbors) {
          if (
            next.x < 0 ||
            next.x >= gridSize ||
            next.y < 0 ||
            next.y >= gridSize
          ) {
            continue;
          }
          const nextKey = `${next.x}:${next.y}`;
          if (visited.has(nextKey)) continue;

          if (!isWallBlocking(curr, next, wallSet)) {
            visited.add(nextKey);
            queue.push(next);
          }
        }
      }

      const playerId = playersInComponent.length === 1 ? playersInComponent[0] : null;

      territories.push({
        playerId,
        cells,
        size: cells.length,
      });
    }
  }

  return territories;
}

/**
 * Checks whether the game has reached the end condition.
 * Game ends when EVERY player is isolated in their own component (no two players share a component),
 * OR when no legal wall placement remains.
 */
export function evaluateEndGame(
  territories: Territory[],
  playerCount: number
): { isOver: boolean; winnerIds: number[] | 'TIE' | null; scores: Map<number, number> } {
  const scores = new Map<number, number>();
  for (let i = 0; i < playerCount; i++) {
    scores.set(i, 0);
  }

  // Count players in shared territories
  let isolatedCount = 0;

  for (const t of territories) {
    if (t.playerId !== null) {
      scores.set(t.playerId, (scores.get(t.playerId) || 0) + t.size);
      isolatedCount += 1;
    }
  }

  const isOver = isolatedCount === playerCount;

  if (!isOver) {
    return { isOver: false, winnerIds: null, scores };
  }

  // Find winner(s)
  let maxScore = -1;
  const winners: number[] = [];

  for (let i = 0; i < playerCount; i++) {
    const s = scores.get(i) || 0;
    if (s > maxScore) {
      maxScore = s;
      winners.length = 0;
      winners.push(i);
    } else if (s === maxScore) {
      winners.push(i);
    }
  }

  const winnerResult = winners.length === playerCount ? 'TIE' : winners;
  return { isOver: true, winnerIds: winnerResult, scores };
}

/**
 * Moves active player to target position.
 */
export function applyMove(state: GameState, target: Position): GameState {
  if (state.phase !== 'MOVE') {
    throw new Error(`Cannot move during phase ${state.phase}`);
  }

  const validMoves = getValidMoves(state);
  const isValid = validMoves.some((m) => m.x === target.x && m.y === target.y);
  if (!isValid) {
    throw new Error(`Invalid move to (${target.x}, ${target.y})`);
  }

  const activePlayer = state.players[state.activePlayerIndex];
  const newPlayers = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, position: target } : p
  );

  const actionLog: GameActionLog = {
    turn: state.turn,
    playerId: activePlayer.id,
    type: 'MOVE',
    detail: `Moved to (${target.x}, ${target.y})`,
  };

  return {
    ...state,
    players: newPlayers,
    phase: 'WALL',
    history: [...state.history, actionLog],
  };
}

/**
 * Passes move phase if active player has no legal moves.
 */
export function passMove(state: GameState): GameState {
  if (state.phase !== 'MOVE') {
    throw new Error(`Cannot pass move during phase ${state.phase}`);
  }

  const validMoves = getValidMoves(state);
  if (validMoves.length > 0) {
    throw new Error('Cannot pass move when valid moves are available');
  }

  const activePlayer = state.players[state.activePlayerIndex];
  const newPlayers = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, isTrapped: true } : p
  );

  const actionLog: GameActionLog = {
    turn: state.turn,
    playerId: activePlayer.id,
    type: 'PASS_MOVE',
    detail: 'Passed move (trapped)',
  };

  return {
    ...state,
    players: newPlayers,
    phase: 'WALL',
    history: [...state.history, actionLog],
  };
}

/**
 * Places a wall on the board.
 */
export function applyWall(state: GameState, wall: Wall): GameState {
  if (state.phase !== 'WALL') {
    throw new Error(`Cannot place wall during phase ${state.phase}`);
  }

  if (!isValidWallPlacement(state, wall)) {
    throw new Error(`Invalid wall placement at ${wall.orientation}:${wall.x}:${wall.y}`);
  }

  const newWalls = [...state.walls, wall];
  const activePlayer = state.players[state.activePlayerIndex];

  const actionLog: GameActionLog = {
    turn: state.turn,
    playerId: activePlayer.id,
    type: 'WALL',
    detail: `Placed wall at ${wall.orientation}(${wall.x}, ${wall.y})`,
  };

  // Recompute territories
  const tempState = { ...state, walls: newWalls };
  const territories = computeTerritories(tempState);

  // Evaluate end game
  const { isOver, winnerIds, scores } = evaluateEndGame(territories, state.playerCount);

  // Update players score
  const updatedPlayers = state.players.map((p) => ({
    ...p,
    score: scores.get(p.id) || 0,
  }));

  if (isOver) {
    return {
      ...state,
      walls: newWalls,
      players: updatedPlayers,
      territories,
      phase: 'GAME_OVER',
      winnerIds,
      history: [...state.history, actionLog],
    };
  }

  // Advance turn to next player
  const nextPlayerIndex = (state.activePlayerIndex + 1) % state.playerCount;
  const nextTurn = state.turn + 1;

  return {
    ...state,
    walls: newWalls,
    players: updatedPlayers,
    territories,
    activePlayerIndex: nextPlayerIndex,
    phase: 'MOVE',
    turn: nextTurn,
    history: [...state.history, actionLog],
  };
}
