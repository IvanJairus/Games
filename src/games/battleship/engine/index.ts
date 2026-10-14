import {
  BOARD_SIZE,
  BattleshipState,
  FLEET,
  Mark,
  Placement,
  RevealPayload,
  ShipKind,
  cellKey,
  otherSeat,
} from './types';
import { canonicalLayout, computeCommitment } from './crypto';
import { validatePlacements } from './rng';

export type { RevealPayload };

export interface Transition {
  state: BattleshipState;
  error?: string;
}

export interface Verdict {
  mark: Mark;
  sunk?: ShipKind;
}

export interface ShotContext {
  placements: Placement[];
  marks: Record<string, Mark>;
}

export interface SeatVerification {
  ok: boolean;
  reasons: string[];
}

export const createInitialState = (): BattleshipState => ({
  phase: 'PLACEMENT',
  commitment: [null, null],
  marks: [{}, {}],
  sunk: [[], []],
  pendingShot: null,
  shotsTaken: [0, 0],
  currentTurn: 0,
  winner: null,
  reveal: [null, null],
  tampered: [false, false],
  endReason: null,
});

export const shipAt = (placements: Placement[], cell: number): ShipKind | undefined =>
  placements.find((p) => p.cells.includes(cell))?.kind;

export const isFleetSunk = (placements: Placement[], marks: Record<string, Mark>): boolean =>
  placements.every((p) => p.cells.every((c) => marks[cellKey(c)] === 'hit'));

// The defender owns this call: only its device holds the layout, so the verdict is judged locally.
export const judgeShot = (ctx: ShotContext, cell: number): Verdict => {
  const kind = shipAt(ctx.placements, cell);
  if (!kind) return { mark: 'miss' };

  const ship = ctx.placements.find((p) => p.kind === kind) as Placement;
  const afterHit = { ...ctx.marks, [cellKey(cell)]: 'hit' as Mark };

  return ship.cells.every((c) => afterHit[cellKey(c)] === 'hit') ? { mark: 'hit', sunk: kind } : { mark: 'hit' };
};

export const applyCommitment = (state: BattleshipState, seat: 0 | 1, commitment: string): Transition => {
  if (state.phase !== 'PLACEMENT') return { state, error: 'Pertandingan sudah dimulai' };

  const existing = state.commitment[seat];
  // A retry after a failed write must be idempotent, but a different second commitment would
  // let a player commit one layout and reveal another.
  if (existing && existing !== commitment) {
    return { state, error: 'Komitmen sudah terkirim untuk kursi ini' };
  }

  const commitmentPair: [string | null, string | null] =
    seat === 0 ? [commitment, state.commitment[1]] : [state.commitment[0], commitment];

  const bothReady = Boolean(commitmentPair[0] && commitmentPair[1]);

  return {
    state: {
      ...state,
      commitment: commitmentPair,
      phase: bothReady ? 'BATTLE' : state.phase,
      currentTurn: bothReady ? 0 : state.currentTurn,
    },
  };
};

export const legalShots = (state: BattleshipState, seat: 0 | 1): number[] => {
  if (state.phase !== 'BATTLE' || state.pendingShot || state.currentTurn !== seat) return [];

  const marks = state.marks[otherSeat(seat)];
  const cells: number[] = [];
  for (let cell = 0; cell < BOARD_SIZE * BOARD_SIZE; cell++) {
    if (!marks[cellKey(cell)]) cells.push(cell);
  }
  return cells;
};

export const fireShot = (state: BattleshipState, seat: 0 | 1, cell: number): Transition => {
  if (state.phase !== 'BATTLE') return { state, error: 'Pertandingan belum dimulai' };
  if (state.currentTurn !== seat) return { state, error: 'Giliran pemain lain' };
  if (state.pendingShot) return { state, error: 'Tembakan terakhir belum dinilai' };
  if (cell < 0 || cell >= BOARD_SIZE * BOARD_SIZE) return { state, error: 'Petak di luar papan' };

  const target = otherSeat(seat);
  if (state.marks[target][cellKey(cell)]) {
    return { state, error: `Petak ${cellKey(cell)} sudah pernah ditembak` };
  }

  return {
    state: {
      ...state,
      pendingShot: { by: seat, cell },
      // Passing the turn to the defender is what makes the verdict write atomic.
      currentTurn: target,
    },
  };
};

export const resolveShot = (state: BattleshipState, seat: 0 | 1, verdict: Verdict): Transition => {
  const shot = state.pendingShot;
  if (!shot) return { state, error: 'Tidak ada tembakan tertunda' };
  if (state.currentTurn !== seat) return { state, error: 'Hanya pemilik papan yang menilai tembakan' };

  const marks: [Record<string, Mark>, Record<string, Mark>] = [state.marks[0], state.marks[1]];
  marks[seat] = { ...state.marks[seat], [cellKey(shot.cell)]: verdict.mark };

  const sunk: [ShipKind[], ShipKind[]] = [state.sunk[0], state.sunk[1]];
  if (verdict.sunk) sunk[seat] = [...sunk[seat], verdict.sunk];

  const shotsTaken: [number, number] = [state.shotsTaken[0], state.shotsTaken[1]];
  shotsTaken[shot.by] += 1;

  const fleetDestroyed = FLEET.every((ship) => sunk[seat].includes(ship.kind));

  if (fleetDestroyed) {
    return {
      state: {
        ...state,
        marks,
        sunk,
        shotsTaken,
        pendingShot: null,
        phase: 'FINISHED',
        winner: shot.by,
        endReason: 'fleet-destroyed',
      },
    };
  }

  return {
    state: {
      ...state,
      marks,
      sunk,
      shotsTaken,
      pendingShot: null,
      // The seat that just judged takes the next shot: firing alternates while every write
      // stays behind the current_turn guard.
      currentTurn: seat,
    },
  };
};

export interface SeatReport {
  seat: 0 | 1;
  ok: boolean;
  reasons: string[];
}

export const verifyReveals = async (
  state: BattleshipState,
  reveals: (RevealPayload | null)[]
): Promise<SeatReport[]> => {
  const requireComplete = state.endReason === 'fleet-destroyed';
  const reports: SeatReport[] = [];

  for (const seat of [0, 1] as const) {
    const reveal = reveals[seat];
    if (!reveal) continue;
    const result = await verifySeat(
      state,
      seat,
      reveal,
      requireComplete && state.winner !== seat
    );
    reports.push({ seat, ok: result.ok, reasons: result.reasons });
  }

  return reports;
};

export const abandonGame = (state: BattleshipState, reason: string, winner: 0 | 1 | null): BattleshipState => ({
  ...state,
  phase: 'FINISHED',
  pendingShot: null,
  winner,
  endReason: reason,
});

export const parseCanonicalLayout = (layout: string): Placement[] =>
  layout
    .split('|')
    .filter(Boolean)
    .map((entry) => {
      const [kind, cellPart] = entry.split(':');
      return {
        kind: kind as ShipKind,
        cells: (cellPart || '').split('-').map(Number).filter((n) => Number.isFinite(n)),
      };
    });

const collectMarkReasons = (
  state: BattleshipState,
  seat: 0 | 1,
  placements: Placement[],
  requireComplete: boolean,
  reasons: string[]
): void => {
  const marks = state.marks[seat];
  const shipCells = new Set(placements.flatMap((p) => p.cells));

  for (const key of Object.keys(marks)) {
    const cell = Number(key);
    const onShip = shipCells.has(cell);
    if (marks[key] === 'hit' && !onShip) {
      reasons.push(`Klaim ${cellKey(cell)} kena, padahal tidak ada kapal di petak itu`);
    }
    if (marks[key] === 'miss' && onShip) {
      reasons.push(`Klaim ${cellKey(cell)} meleset, padahal kapal berada di petak itu`);
    }
  }

  for (const kind of state.sunk[seat]) {
    const ship = placements.find((p) => p.kind === kind);
    if (!ship) {
      reasons.push(`${kind} diklaim tenggelam padahal tidak ada dalam layout`);
      continue;
    }
    if (!ship.cells.every((c) => marks[cellKey(c)] === 'hit')) {
      reasons.push(`${kind} diklaim tenggelam sebelum semua petaknya kena`);
    }
  }

  if (requireComplete) {
    const hits = Object.values(marks).filter((m) => m === 'hit').length;
    if (hits !== shipCells.size) {
      reasons.push(`Jumlah petak kena (${hits}) tidak sama dengan jumlah petak kapal (${shipCells.size})`);
    }
  }
};

export const verifySeat = async (
  state: BattleshipState,
  seat: 0 | 1,
  reveal: RevealPayload,
  requireComplete: boolean
): Promise<SeatVerification> => {
  const placements = parseCanonicalLayout(reveal.layout);
  const validity = validatePlacements(placements);
  if (!validity.ok) return { ok: false, reasons: validity.errors };

  const reasons: string[] = [];
  const expected = state.commitment[seat];

  if (expected) {
    const actual = await computeCommitment(reveal.seed, placements);
    if (actual !== expected) reasons.push('Komitmen tidak cocok dengan layout yang diungkap');
  }

  collectMarkReasons(state, seat, placements, requireComplete, reasons);
  return { ok: reasons.length === 0, reasons };
};

export const revealFleet = async (
  state: BattleshipState,
  seat: 0 | 1,
  reveal: RevealPayload
): Promise<{ state: BattleshipState; verification: SeatVerification }> => {
  const withReveal: BattleshipState = {
    ...state,
    reveal: seat === 0 ? [reveal, state.reveal[1]] : [state.reveal[0], reveal],
  };

  // Only the destroyed fleet is expected to be fully covered by hits.
  const requireComplete =
    state.endReason === 'fleet-destroyed' && state.winner !== null && seat !== state.winner;

  const verification = await verifySeat(withReveal, seat, reveal, requireComplete);

  const tampered: [boolean, boolean] = [withReveal.tampered[0], withReveal.tampered[1]];
  tampered[seat] = !verification.ok;

  return { state: { ...withReveal, tampered }, verification };
};

// Patrol boats span two adjacent cells, so an even-parity sweep cannot walk past a ship.
export const chooseAiShot = (marks: Record<string, Mark>, rand: () => number = Math.random): number => {
  const total = BOARD_SIZE * BOARD_SIZE;
  const untried: number[] = [];
  for (let cell = 0; cell < total; cell++) {
    if (!marks[cellKey(cell)]) untried.push(cell);
  }
  if (untried.length === 0) return -1;

  const frontier: number[] = [];
  for (const key of Object.keys(marks)) {
    if (marks[key] !== 'hit') continue;
    const cell = Number(key);
    const row = Math.floor(cell / BOARD_SIZE);
    const col = cell % BOARD_SIZE;
    const neighbours = [
      row > 0 ? cell - BOARD_SIZE : -1,
      row < BOARD_SIZE - 1 ? cell + BOARD_SIZE : -1,
      col > 0 ? cell - 1 : -1,
      col < BOARD_SIZE - 1 ? cell + 1 : -1,
    ];
    neighbours.forEach((n) => {
      if (n >= 0 && !marks[cellKey(n)] && !frontier.includes(n)) frontier.push(n);
    });
  }

  if (frontier.length > 0) {
    return frontier[Math.floor(rand() * frontier.length)];
  }

  const parity = untried.filter((cell) => (Math.floor(cell / BOARD_SIZE) + (cell % BOARD_SIZE)) % 2 === 0);
  const pool = parity.length > 0 ? parity : untried;
  return pool[Math.floor(rand() * pool.length)];
};

export { canonicalLayout };
