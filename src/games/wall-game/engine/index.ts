import {
  Position,
  Wall,
  PlayerTheme,
  Player,
  GameState,
  CreateGameOptions,
  GameActionLog,
} from './types';

export * from './types';

export const PLAYER_GOLD_THEMES: PlayerTheme[] = [
  { name: 'Player 1', hex: '#c2410c', label: 'Terracotta', border: '#9a3412', text: '#ffffff' },
  { name: 'Player 2', hex: '#1d4ed8', label: 'Biru Kobalt', border: '#1e40af', text: '#ffffff' },
  { name: 'Player 3', hex: '#047857', label: 'Hijau Zamrud', border: '#065f46', text: '#ffffff' },
  { name: 'Player 4', hex: '#d97706', label: 'Emas Kuning', border: '#b45309', text: '#ffffff' },
  { name: 'Player 5', hex: '#7c3aed', label: 'Ungu Amethyst', border: '#6d28d9', text: '#ffffff' },
  { name: 'Player 6', hex: '#334155', label: 'Batu Basalt', border: '#1e293b', text: '#ffffff' },
];

export function getRecommendedGridSize(playerCount: number): number {
  if (playerCount <= 3) return 9;
  if (playerCount <= 5) return 11;
  return 13;
}

export function getInitialWallQuota(playerCount: number): number {
  if (playerCount <= 2) return 10;
  if (playerCount === 3) return 7;
  if (playerCount === 4) return 5;
  if (playerCount === 5) return 4;
  return 3;
}

export function getSpawnPositions(playerCount: number, gridSize: number): Position[] {
  const mid = Math.floor(gridSize / 2);
  const max = gridSize - 1;

  switch (playerCount) {
    case 2:
      return [
        { x: mid, y: max }, // South
        { x: mid, y: 0 },   // North
      ];
    case 3:
      return [
        { x: mid, y: max }, // South
        { x: 0, y: mid },   // West
        { x: max, y: mid }, // East
      ];
    case 4:
      return [
        { x: mid, y: max }, // South
        { x: 0, y: mid },   // West
        { x: mid, y: 0 },   // North
        { x: max, y: mid }, // East
      ];
    case 5: {
      const q = Math.max(1, Math.floor(gridSize / 4));
      return [
        { x: mid, y: max },
        { x: 0, y: mid },
        { x: mid - q, y: 0 },
        { x: mid + q, y: 0 },
        { x: max, y: mid },
      ];
    }
    case 6: {
      const q = Math.max(1, Math.floor(gridSize / 4));
      return [
        { x: mid - q, y: max },
        { x: mid + q, y: max },
        { x: 0, y: mid },
        { x: mid - q, y: 0 },
        { x: mid + q, y: 0 },
        { x: max, y: mid },
      ];
    }
    default: {
      const res: Position[] = [];
      for (let i = 0; i < playerCount; i++) {
        res.push({ x: (i * 2) % gridSize, y: i % 2 === 0 ? 0 : max });
      }
      return res;
    }
  }
}

export function isPathBlockedByWall(c1: Position, c2: Position, wallList: Wall[]): boolean {
  if (c1.x === c2.x) {
    const minY = Math.min(c1.y, c2.y);
    const col = c1.x;
    for (const w of wallList) {
      if (w.orientation === 'H' && w.y === minY) {
        if (w.x === col || w.x === col - 1) {
          return true;
        }
      }
    }
  } else if (c1.y === c2.y) {
    const minX = Math.min(c1.x, c2.x);
    const row = c1.y;
    for (const w of wallList) {
      if (w.orientation === 'V' && w.x === minX) {
        if (w.y === row || w.y === row - 1) {
          return true;
        }
      }
    }
  }
  return false;
}

export function getShortestPath(
  start: Position,
  goal: Position,
  walls: Wall[],
  gridSize: number
): Position[] | null {
  if (start.x === goal.x && start.y === goal.y) return [start];

  const visited = new Set<string>();
  const parent = new Map<string, Position>();
  const queue: Position[] = [start];
  visited.add(`${start.x}:${start.y}`);

  let found = false;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === goal.x && curr.y === goal.y) {
      found = true;
      break;
    }

    const neighbors: Position[] = [
      { x: curr.x, y: curr.y - 1 },
      { x: curr.x, y: curr.y + 1 },
      { x: curr.x - 1, y: curr.y },
      { x: curr.x + 1, y: curr.y },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= gridSize || n.y < 0 || n.y >= gridSize) continue;
      const key = `${n.x}:${n.y}`;
      if (visited.has(key)) continue;

      if (!isPathBlockedByWall(curr, n, walls)) {
        visited.add(key);
        parent.set(key, curr);
        queue.push(n);
      }
    }
  }

  if (!found) return null;

  const path: Position[] = [];
  let currKey: string | undefined = `${goal.x}:${goal.y}`;
  while (currKey) {
    const [px, py] = currKey.split(':').map(Number);
    const pos = { x: px, y: py };
    path.unshift(pos);
    if (pos.x === start.x && pos.y === start.y) break;
    const p = parent.get(currKey);
    currKey = p ? `${p.x}:${p.y}` : undefined;
  }

  return path;
}

export function createGame(options: CreateGameOptions): GameState {
  const playerCount = Math.max(2, Math.min(6, options.playerCount));
  let gridSize = options.gridSize ?? getRecommendedGridSize(playerCount);

  if (gridSize % 2 === 0) gridSize += 1;
  gridSize = Math.max(7, Math.min(19, gridSize));

  const corePosition: Position = {
    x: Math.floor(gridSize / 2),
    y: Math.floor(gridSize / 2),
  };

  const spawnPositions = getSpawnPositions(playerCount, gridSize);
  const wallQuota = getInitialWallQuota(playerCount);

  const players: Player[] = [];
  for (let i = 0; i < playerCount; i++) {
    const theme = PLAYER_GOLD_THEMES[i % PLAYER_GOLD_THEMES.length];
    const initialPos = spawnPositions[i];
    const path = getShortestPath(initialPos, corePosition, [], gridSize);
    players.push({
      id: i,
      name: options.playerNames?.[i]?.trim() || `Pemain ${i + 1}`,
      theme,
      position: initialPos,
      wallsRemaining: wallQuota,
      distanceToCore: path ? path.length - 1 : 99,
      movesTaken: 0,
    });
  }

  return {
    gridSize,
    playerCount,
    corePosition,
    players,
    walls: [],
    activePlayerIndex: 0,
    phase: 'ACTION',
    turn: 1,
    winnerId: null,
    history: [],
  };
}

export function getValidMoves(state: GameState): Position[] {
  if (state.phase !== 'ACTION') return [];

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return [];

  const { x, y } = activePlayer.position;
  const occupiedMap = new Map<string, Player>();
  for (const p of state.players) {
    occupiedMap.set(`${p.position.x}:${p.position.y}`, p);
  }

  const validMoves: Position[] = [];

  const directions = [
    { dx: 0, dy: -1 }, // North
    { dx: 0, dy: 1 },  // South
    { dx: -1, dy: 0 }, // West
    { dx: 1, dy: 0 },  // East
  ];

  for (const { dx, dy } of directions) {
    const target: Position = { x: x + dx, y: y + dy };

    if (target.x < 0 || target.x >= state.gridSize || target.y < 0 || target.y >= state.gridSize) {
      continue;
    }

    if (isPathBlockedByWall(activePlayer.position, target, state.walls)) {
      continue;
    }

    const opponent = occupiedMap.get(`${target.x}:${target.y}`);
    if (!opponent) {
      validMoves.push(target);
    } else {
      const jumpTarget: Position = { x: target.x + dx, y: target.y + dy };
      const canJumpStraight =
        jumpTarget.x >= 0 &&
        jumpTarget.x < state.gridSize &&
        jumpTarget.y >= 0 &&
        jumpTarget.y < state.gridSize &&
        !isPathBlockedByWall(target, jumpTarget, state.walls) &&
        !occupiedMap.has(`${jumpTarget.x}:${jumpTarget.y}`);

      if (canJumpStraight) {
        validMoves.push(jumpTarget);
      } else {
        const diagonals = dx === 0 ? [{ ddx: -1, ddy: 0 }, { ddx: 1, ddy: 0 }] : [{ ddx: 0, ddy: -1 }, { ddx: 0, ddy: 1 }];

        for (const { ddx, ddy } of diagonals) {
          const diagTarget: Position = { x: target.x + ddx, y: target.y + ddy };
          if (
            diagTarget.x >= 0 &&
            diagTarget.x < state.gridSize &&
            diagTarget.y >= 0 &&
            diagTarget.y < state.gridSize &&
            !isPathBlockedByWall(target, diagTarget, state.walls) &&
            !occupiedMap.has(`${diagTarget.x}:${diagTarget.y}`)
          ) {
            validMoves.push(diagTarget);
          }
        }
      }
    }
  }

  return validMoves;
}

export function isValidWallPlacement(state: GameState, wall: Wall): boolean {
  if (state.phase !== 'ACTION') return false;

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.wallsRemaining <= 0) return false;

  const maxSlot = state.gridSize - 2;
  if (wall.x < 0 || wall.x > maxSlot || wall.y < 0 || wall.y > maxSlot) {
    return false;
  }

  for (const existing of state.walls) {
    if (existing.orientation === wall.orientation) {
      if (wall.orientation === 'H') {
        if (existing.y === wall.y && Math.abs(existing.x - wall.x) <= 1) {
          return false;
        }
      } else {
        if (existing.x === wall.x && Math.abs(existing.y - wall.y) <= 1) {
          return false;
        }
      }
    } else {
      if (existing.x === wall.x && existing.y === wall.y) {
        return false;
      }
    }
  }

  const simulatedWalls = [...state.walls, wall];
  for (const p of state.players) {
    const path = getShortestPath(p.position, state.corePosition, simulatedWalls, state.gridSize);
    if (!path) {
      return false;
    }
  }

  return true;
}

export function applyMove(state: GameState, target: Position): GameState {
  if (state.phase !== 'ACTION') {
    throw new Error(`Cannot move during phase ${state.phase}`);
  }

  const validMoves = getValidMoves(state);
  const isValid = validMoves.some((m) => m.x === target.x && m.y === target.y);
  if (!isValid) {
    throw new Error(`Invalid move to (${target.x}, ${target.y})`);
  }

  const activePlayer = state.players[state.activePlayerIndex];
  const isWin = target.x === state.corePosition.x && target.y === state.corePosition.y;

  const updatedPlayers = state.players.map((p, idx) => {
    if (idx === state.activePlayerIndex) {
      const path = getShortestPath(target, state.corePosition, state.walls, state.gridSize);
      return {
        ...p,
        position: target,
        distanceToCore: path ? path.length - 1 : 0,
        movesTaken: p.movesTaken + 1,
      };
    }
    const path = getShortestPath(p.position, state.corePosition, state.walls, state.gridSize);
    return {
      ...p,
      distanceToCore: path ? path.length - 1 : p.distanceToCore,
    };
  });

  const actionLog: GameActionLog = {
    turn: state.turn,
    playerId: activePlayer.id,
    type: 'MOVE',
    detail: isWin ? 'Mencapai Golden Core! Menang!' : `Melangkah ke (${target.x}, ${target.y})`,
  };

  if (isWin) {
    return {
      ...state,
      players: updatedPlayers,
      phase: 'GAME_OVER',
      winnerId: activePlayer.id,
      history: [...state.history, actionLog],
    };
  }

  const nextPlayerIndex = (state.activePlayerIndex + 1) % state.playerCount;
  return {
    ...state,
    players: updatedPlayers,
    activePlayerIndex: nextPlayerIndex,
    turn: state.turn + 1,
    history: [...state.history, actionLog],
  };
}

export function applyWall(state: GameState, wall: Wall): GameState {
  if (state.phase !== 'ACTION') {
    throw new Error(`Cannot place wall during phase ${state.phase}`);
  }

  if (!isValidWallPlacement(state, wall)) {
    throw new Error(`Invalid or illegal wall placement at ${wall.orientation}:${wall.x}:${wall.y}`);
  }

  const activePlayer = state.players[state.activePlayerIndex];
  const newWalls = [...state.walls, { ...wall, owner: activePlayer.id }];

  const updatedPlayers = state.players.map((p, idx) => {
    const wallsRemaining = idx === state.activePlayerIndex ? p.wallsRemaining - 1 : p.wallsRemaining;
    const path = getShortestPath(p.position, state.corePosition, newWalls, state.gridSize);
    return {
      ...p,
      wallsRemaining,
      distanceToCore: path ? path.length - 1 : p.distanceToCore,
    };
  });

  const actionLog: GameActionLog = {
    turn: state.turn,
    playerId: activePlayer.id,
    type: 'WALL',
    detail: `Memasang dinding ${wall.orientation === 'H' ? 'Horizontal' : 'Vertikal'} di (${wall.x}, ${wall.y})`,
  };

  const nextPlayerIndex = (state.activePlayerIndex + 1) % state.playerCount;
  return {
    ...state,
    walls: newWalls,
    players: updatedPlayers,
    activePlayerIndex: nextPlayerIndex,
    turn: state.turn + 1,
    history: [...state.history, actionLog],
  };
}
