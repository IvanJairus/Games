import { randomHex } from '../../../lib/random';
import {
  CellKind,
  Coord,
  spawnCells,
  spawnClearance,
} from './types';

const hashSeed = (seed: string): number => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
};

// mulberry32: small, deterministic, good enough to spread a field of soft blocks.
const mulberry32 = (a: number): (() => number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const generateSeed = (): string => randomHex(12);

export const SOFT_DENSITY = 0.62;

/**
 * Border walls plus a pillar lattice at every even/even cell.
 *
 * The clearance ring around each spawn is forced open on purpose: with both
 * exits of a corner pocket sealed by soft blocks, a seat cannot bomb its own
 * cell and stay alive, and a bot parked there never plants anything at all.
 */
export const buildGrid = (
  seed: string,
  cols: number,
  rows: number,
  seats: number,
  rand: () => number = mulberry32(hashSeed(seed)),
): CellKind[][] => {
  const clear = new Set<string>();
  for (const spawn of spawnCells(cols, rows, seats)) {
    for (const c of spawnClearance(spawn)) clear.add(`${c.x},${c.y}`);
  }

  const grid: CellKind[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: CellKind[] = [];
    for (let x = 0; x < cols; x++) {
      let kind: CellKind;
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) kind = 'hard';
      else if (x % 2 === 0 && y % 2 === 0) kind = 'hard';
      else if (clear.has(`${x},${y}`)) kind = 'empty';
      else kind = rand() < SOFT_DENSITY ? 'soft' : 'empty';
      row.push(kind);
    }
    grid.push(row);
  }
  return grid;
};

export const isSpawnCell = (spawns: Coord[], x: number, y: number): boolean =>
  spawns.some((s) => s.x === x && s.y === y);

/** A generated board must always be playable; the tests lean on this. */
export const validateGrid = (grid: CellKind[][], spawns: Coord[]): string[] => {
  const errors: string[] = [];
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (const s of spawns) {
    const onBoard = s.x >= 0 && s.y >= 0 && s.x < cols && s.y < rows;
    if (!onBoard) {
      errors.push(`Spawn ${s.x},${s.y} di luar papan`);
      continue;
    }
    if (grid[s.y][s.x] !== 'empty') errors.push(`Spawn ${s.x},${s.y} terhalang ${grid[s.y][s.x]}`);
  }
  return errors;
};
