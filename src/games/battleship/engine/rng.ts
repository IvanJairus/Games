import {
  BOARD_SIZE,
  CELL_COUNT,
  FLEET,
  Orientation,
  Placement,
  ShipKind,
  cellKey,
  isOnBoard,
} from './types';

import { randomHex } from '../../../lib/random';

const hashSeed = (seed: string): number => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
};

// mulberry32: small, deterministic, good enough to spread a fleet.
const mulberry32 = (a: number): (() => number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const generateSeed = (): string => randomHex(12);

export const shipCells = (row: number, col: number, size: number, orientation: Orientation): number[] | null => {
  const cells: number[] = [];
  for (let i = 0; i < size; i++) {
    const r = orientation === 'V' ? row + i : row;
    const c = orientation === 'H' ? col + i : col;
    if (!isOnBoard(r, c)) return null;
    cells.push(r * BOARD_SIZE + c);
  }
  return cells;
};

const overlaps = (cells: number[], occupied: Set<number>): boolean =>
  cells.some((c) => occupied.has(c));

export const buildPlacements = (seed: string): Placement[] => {
  const rand = mulberry32(hashSeed(seed));
  const occupied = new Set<number>();
  const placements: Placement[] = [];

  for (const ship of FLEET) {
    // Scan order is fixed so a seed always yields the same fleet, even when random picks collide.
    let placed: number[] | null = null;

    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const orientation: Orientation = rand() < 0.5 ? 'H' : 'V';
      const row = Math.floor(rand() * BOARD_SIZE);
      const col = Math.floor(rand() * BOARD_SIZE);
      const cells = shipCells(row, col, ship.size, orientation);
      if (cells && !overlaps(cells, occupied)) placed = cells;
    }

    if (!placed) {
      outer: for (const orientation of ['H', 'V'] as Orientation[]) {
        for (let row = 0; row < BOARD_SIZE; row++) {
          for (let col = 0; col < BOARD_SIZE; col++) {
            const cells = shipCells(row, col, ship.size, orientation);
            if (cells && !overlaps(cells, occupied)) {
              placed = cells;
              break outer;
            }
          }
        }
      }
    }

    if (!placed) break;

    placed.forEach((c) => occupied.add(c));
    placements.push({ kind: ship.kind, cells: placed });
  }

  return placements;
};

export interface PlacementValidation {
  ok: boolean;
  errors: string[];
}

export const validatePlacements = (placements: Placement[]): PlacementValidation => {
  const errors: string[] = [];
  const seen = new Map<number, ShipKind>();
  const counts = new Map<ShipKind, number>();

  for (const placement of placements) {
    const spec = FLEET.find((s) => s.kind === placement.kind);
    if (!spec) {
      errors.push(`Kapal tidak dikenal: ${placement.kind}`);
      continue;
    }
    if (placement.cells.length !== spec.size) {
      errors.push(`${placement.kind}: jumlah petak ${placement.cells.length}, seharusnya ${spec.size}`);
    }

    counts.set(placement.kind, (counts.get(placement.kind) || 0) + 1);

    const rows = new Set(placement.cells.map((c) => Math.floor(c / BOARD_SIZE)));
    const cols = new Set(placement.cells.map((c) => c % BOARD_SIZE));
    if (rows.size > 1 && cols.size > 1) {
      errors.push(`${placement.kind}: petak tidak segaris`);
    }

    const sorted = [...placement.cells].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1 && sorted[i] !== sorted[i - 1] + BOARD_SIZE) {
        errors.push(`${placement.kind}: petak tidak berurutan`);
        break;
      }
    }

    for (const cell of placement.cells) {
      if (cell < 0 || cell >= CELL_COUNT) {
        errors.push(`${placement.kind}: petak ${cellKey(cell)} di luar papan`);
      } else if (seen.has(cell)) {
        errors.push(`${placement.kind}: tumpang tindih dengan ${seen.get(cell)}`);
      } else {
        seen.set(cell, placement.kind);
      }
    }
  }

  for (const ship of FLEET) {
    if ((counts.get(ship.kind) || 0) !== 1) {
      errors.push(`${ship.kind}: harus tepat satu, ditemukan ${counts.get(ship.kind) || 0}`);
    }
  }

  return { ok: errors.length === 0, errors };
};

export const layoutFromPlacements = (placements: Placement[]): Map<number, ShipKind> => {
  const layout = new Map<number, ShipKind>();
  placements.forEach((p) => p.cells.forEach((c) => layout.set(c, p.kind)));
  return layout;
};
