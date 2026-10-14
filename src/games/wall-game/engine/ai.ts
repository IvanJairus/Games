import { GameState, Position, Wall, WallOrientation } from './types';
import { getShortestPath, getValidMoves, isValidWallPlacement } from './index';

export type WallBotStyle = 'jalan' | 'agresif';

export const WALL_BOT_STYLES: { id: WallBotStyle; label: string; note: string }[] = [
  { id: 'jalan', label: 'Hanya Jalan', note: 'Bot mengejar inti tanpa pernah memasang dinding.' },
  { id: 'agresif', label: 'Pakai Dinding', note: 'Bot menahan pemain terdepan dengan dinding kalau menguntungkan.' },
];

export type WallBotAction = { type: 'MOVE'; target: Position } | { type: 'WALL'; wall: Wall };

const UNREACHABLE = 99;

function distanceToCore(from: Position, state: GameState, walls: Wall[] = state.walls): number {
  const path = getShortestPath(from, state.corePosition, walls, state.gridSize);
  return path ? path.length - 1 : UNREACHABLE;
}

const rivalSeats = (state: GameState): number[] =>
  state.players
    .filter((p) => p.id !== state.activePlayerIndex)
    .map((p) => p.id)
    .sort((a, b) => state.players[a].distanceToCore - state.players[b].distanceToCore);

function wallCandidates(state: GameState, leader: Position): Wall[] {
  const maxSlot = state.gridSize - 2;
  const found: Wall[] = [];
  const seen = new Set<string>();

  for (const orientation of ['H', 'V'] as WallOrientation[]) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const x = leader.x + dx;
        const y = leader.y + dy;
        if (x < 0 || y < 0 || x > maxSlot || y > maxSlot) continue;
        const key = `${orientation}${x}:${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ orientation, x, y });
      }
    }
  }

  return found;
}

function bestWall(state: GameState, me: number, leaderId: number): Wall | null {
  const mePlayer = state.players[me];
  const leader = state.players[leaderId];
  const myDistance = distanceToCore(mePlayer.position, state);
  const leaderDistance = distanceToCore(leader.position, state);

  let best: { wall: Wall; gain: number } | null = null;

  for (const wall of wallCandidates(state, leader.position)) {
    if (!isValidWallPlacement(state, wall)) continue;

    const walls = [...state.walls, wall];
    const gain =
      distanceToCore(leader.position, state, walls) -
      leaderDistance -
      (distanceToCore(mePlayer.position, state, walls) - myDistance);

    // A quota spent is only worth it when it costs the rival clearly more than it costs the bot.
    if (gain >= 2 && (!best || gain > best.gain)) best = { wall, gain };
  }

  return best ? best.wall : null;
}

export function chooseWallBotAction(
  state: GameState,
  style: WallBotStyle,
  rand: () => number = Math.random
): WallBotAction {
  if (state.phase !== 'ACTION') throw new Error('Pertandingan sudah selesai');

  const me = state.players[state.activePlayerIndex];
  if (!me) throw new Error('Kursi bot tidak ada di room ini');

  const rivals = rivalSeats(state);

  if (style === 'agresif' && me.wallsRemaining > 0 && rivals.length) {
    const leaderId = rivals[0];
    const leader = state.players[leaderId];
    // Running is pointless when the leader is already one step away from winning.
    if (leader.distanceToCore > 1 && leader.distanceToCore <= me.distanceToCore + 1) {
      const wall = bestWall(state, me.id, leaderId);
      if (wall) return { type: 'WALL', wall };
    }
  }

  const moves = getValidMoves(state);
  if (moves.length === 0) throw new Error('Bot tidak punya langkah legal');

  let bestDistance = UNREACHABLE;
  let choices: Position[] = [];

  for (const target of moves) {
    const distance = distanceToCore(target, state);
    if (distance < bestDistance) {
      bestDistance = distance;
      choices = [target];
    } else if (distance === bestDistance) {
      choices.push(target);
    }
  }

  return { type: 'MOVE', target: choices[Math.floor(rand() * choices.length)] };
}

export function describeWallBotStyle(style: WallBotStyle): string {
  return WALL_BOT_STYLES.find((s) => s.id === style)?.note ?? '';
}
