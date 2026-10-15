import { GameState, Player, Position, Wall, WallOrientation } from './types';
import { getShortestPath, getValidMoves, isValidWallPlacement } from './index';

export type WallBotLevel = 'santai' | 'sedang' | 'sempurna';

export const WALL_BOT_LEVELS: { id: WallBotLevel; label: string; note: string }[] = [
  {
    id: 'santai',
    label: 'Santai',
    note: 'Bot kadang melangkah ke arah yang tidak membawa ke inti dan tidak pernah memasang dinding.',
  },
  {
    id: 'sedang',
    label: 'Sedang',
    note: 'Bot mengejar inti lewat rute terpendek dan menahan pemain terdepan dengan dinding kalau jelas untung.',
  },
  {
    id: 'sempurna',
    label: 'Sempurna',
    note: 'Bot menjaga selisih langkah ke inti, memasang dinding hanya saat itu membalikkan balapan, dan menghindari jebakan lompatan lawan.',
  },
];

export type WallBotAction = { type: 'MOVE'; target: Position } | { type: 'WALL'; wall: Wall };

const UNREACHABLE = 99;

// Wander rate for the easy tier: enough to be outpaced, low enough that games still finish.
const SANTAI_WANDER_CHANCE = 0.35;

// Only the nearest rivals are looked ahead against: every extra seat multiplies the BFS count.
const LOOKAHEAD_THREAT_SEATS = 2;

const MIN_WALL_GAIN = 2;

function distanceToCore(from: Position, state: GameState, walls: Wall[] = state.walls): number {
  const path = getShortestPath(from, state.corePosition, walls, state.gridSize);
  return path ? path.length - 1 : UNREACHABLE;
}

const rivalSeats = (state: GameState): number[] =>
  state.players
    .filter((p) => p.id !== state.activePlayerIndex)
    .map((p) => p.id)
    .sort((a, b) => state.players[a].distanceToCore - state.players[b].distanceToCore);

// getValidMoves only reads activePlayerIndex, so a shallow clone is enough to ask what the rival
// can do once the bot is standing on the square being scored. Their best reply prices a hop-over.
function rivalBestDistance(state: GameState, mySeat: number, target: Position): number {
  const seated: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === mySeat ? { ...p, position: target } : p)),
  };

  let best = UNREACHABLE;
  for (const rivalId of rivalSeats(state).slice(0, LOOKAHEAD_THREAT_SEATS)) {
    const probe: GameState = { ...seated, activePlayerIndex: rivalId };
    for (const move of getValidMoves(probe)) {
      const distance = distanceToCore(move, probe);
      if (distance < best) best = distance;
    }
  }

  return best;
}

function wallCandidates(state: GameState, threatPositions: Position[]): Wall[] {
  const maxSlot = state.gridSize - 2;
  const found: Wall[] = [];
  const seen = new Set<string>();

  const push = (orientation: WallOrientation, x: number, y: number) => {
    if (x < 0 || y < 0 || x > maxSlot || y > maxSlot) return;
    const key = `${orientation}${x}:${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ orientation, x, y });
  };

  for (const threat of threatPositions) {
    for (const orientation of ['H', 'V'] as WallOrientation[]) {
      for (const dx of [-2, -1, 0, 1, 2]) {
        for (const dy of [-2, -1, 0, 1, 2]) {
          push(orientation, threat.x + dx, threat.y + dy);
        }
      }
    }
  }

  return found;
}

// Every slot on the board. The hard tier needs this because the wall that decides a race usually
// sits on the shared approach to the core, far from where the rival is standing.
function allWallSlots(state: GameState): Wall[] {
  const maxSlot = state.gridSize - 2;
  const found: Wall[] = [];

  for (const orientation of ['H', 'V'] as WallOrientation[]) {
    for (let x = 0; x <= maxSlot; x++) {
      for (let y = 0; y <= maxSlot; y++) {
        found.push({ orientation, x, y });
      }
    }
  }

  return found;
}

// Medium: the behaviour the game shipped with. Slow the front-runner when the wall pays for more
// than it costs the bot, and never try to wall a rival that is already one step from the core.
function leaderWall(state: GameState, mePlayer: Player): Wall | null {
  const rivals = rivalSeats(state);
  if (rivals.length === 0) return null;

  const leader = state.players[rivals[0]];
  const leaderDistance = leader.distanceToCore;
  if (leaderDistance <= 1 || leaderDistance > mePlayer.distanceToCore + 1) return null;

  const myDistance = distanceToCore(mePlayer.position, state);
  let best: { wall: Wall; gain: number } | null = null;

  for (const wall of wallCandidates(state, [leader.position])) {
    if (!isValidWallPlacement(state, wall)) continue;

    const walls = [...state.walls, wall];
    const gain =
      distanceToCore(leader.position, state, walls) -
      leaderDistance -
      (distanceToCore(mePlayer.position, state, walls) - myDistance);

    if (gain >= MIN_WALL_GAIN && (!best || gain > best.gain)) best = { wall, gain };
  }

  return best ? best.wall : null;
}

// Hard: a wall costs the turn the bot would have spent closing in, and it hands the rival one free
// step while it is being placed. So the margin a wall really adds is (rival delay) - (cost to the
// bot's own route) - 1, and the bot walls whenever that is positive, whether it leads or trails.
// Every rival has to be delayed for that to hold on a wide table, which is what keeps this tier
// from burning its quota on walls a second rival walks around.
function marginWall(state: GameState, mePlayer: Player): Wall | null {
  const rivals = rivalSeats(state);
  if (rivals.length === 0) return null;

  const myDistance = distanceToCore(mePlayer.position, state);
  let best: { wall: Wall; net: number } | null = null;

  for (const wall of allWallSlots(state)) {
    if (!isValidWallPlacement(state, wall)) continue;

    const walls = [...state.walls, wall];
    const myCost = distanceToCore(mePlayer.position, state, walls) - myDistance;

    let delay = Number.POSITIVE_INFINITY;
    for (const id of rivals) {
      const gained = distanceToCore(state.players[id].position, state, walls) - state.players[id].distanceToCore;
      if (gained < delay) delay = gained;
    }

    // The wall buys the rival one free step, so only a delay past that is a real gain.
    const net = delay - myCost - 1;
    if (net > 0 && (!best || net > best.net)) best = { wall, net };
  }

  return best ? best.wall : null;
}

function bestWall(state: GameState, level: WallBotLevel): Wall | null {
  const mePlayer = state.players[state.activePlayerIndex];
  if (mePlayer.wallsRemaining <= 0) return null;
  return level === 'sedang' ? leaderWall(state, mePlayer) : marginWall(state, mePlayer);
}

export function chooseWallBotAction(
  state: GameState,
  level: WallBotLevel,
  rand: () => number = Math.random
): WallBotAction {
  if (state.phase !== 'ACTION') throw new Error('Pertandingan sudah selesai');

  const me = state.players[state.activePlayerIndex];
  if (!me) throw new Error('Kursi bot tidak ada di room ini');

  if (level !== 'santai') {
    const wall = bestWall(state, level);
    if (wall) return { type: 'WALL', wall };
  }

  const moves = getValidMoves(state);
  if (moves.length === 0) throw new Error('Bot tidak punya langkah legal');

  if (level === 'santai' && rand() < SANTAI_WANDER_CHANCE) {
    return { type: 'MOVE', target: moves[Math.floor(rand() * moves.length)] };
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let choices: Position[] = [];

  for (const target of moves) {
    let score = distanceToCore(target, state);
    if (level === 'sempurna') score -= rivalBestDistance(state, me.id, target);

    if (score < bestScore) {
      bestScore = score;
      choices = [target];
    } else if (score === bestScore) {
      choices.push(target);
    }
  }

  return { type: 'MOVE', target: choices[Math.floor(rand() * choices.length)] };
}

export function describeWallBotLevel(level: WallBotLevel): string {
  return WALL_BOT_LEVELS.find((l) => l.id === level)?.note ?? '';
}
