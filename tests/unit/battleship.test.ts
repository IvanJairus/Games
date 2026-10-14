import { describe, it, expect } from 'vitest';
import {
  BOARD_SIZE,
  CELL_COUNT,
  FLEET,
  BattleshipState,
  Mark,
  Placement,
  ShipKind,
  cellKey,
  otherSeat,
} from '../../src/games/battleship/engine/types';
import { buildPlacements, validatePlacements, generateSeed } from '../../src/games/battleship/engine/rng';
import { canonicalLayout, computeCommitment } from '../../src/games/battleship/engine/crypto';
import {
  applyCommitment,
  chooseAiShot,
  createInitialState,
  fireShot,
  isFleetSunk,
  judgeShot,
  legalShots,
  parseCanonicalLayout,
  revealFleet,
  resolveShot,
  verifySeat,
} from '../../src/games/battleship/engine';

const seat = (n: number): 0 | 1 => (n === 0 ? 0 : 1);

const placementsFor = (seed: string): Placement[] => buildPlacements(seed);

const commitOf = (seed: string, placements: Placement[]) => computeCommitment(seed, placements);

const playShot = (
  state: BattleshipState,
  attacker: 0 | 1,
  defenderPlacements: Placement[],
  cell: number
): BattleshipState => {
  const fired = fireShot(state, attacker, cell);
  if (fired.error) throw new Error(fired.error);

  const defender = otherSeat(attacker);
  const verdict = judgeShot(
    { placements: defenderPlacements, marks: fired.state.marks[defender] },
    cell
  );
  const resolved = resolveShot(fired.state, defender, verdict);
  if (resolved.error) throw new Error(resolved.error);
  return resolved.state;
};

describe('Battleship engine', () => {
  it('menurunkan armada yang valid dan identik untuk seed yang sama', () => {
    for (let i = 0; i < 50; i++) {
      const seed = generateSeed();
      const placements = placementsFor(seed);
      expect(placements).toHaveLength(FLEET.length);
      expect(validatePlacements(placements).ok).toBe(true);
      expect(canonicalLayout(placements)).toBe(canonicalLayout(placementsFor(seed)));
    }
  });

  it('menolak penempatan manual yang tumpang tindih atau salah ukuran', () => {
    const overlapping: Placement[] = [
      { kind: 'Battleship', cells: [0, 1, 2, 3] },
      { kind: 'Cruiser', cells: [3, 4, 5] },
      { kind: 'Frigate', cells: [16, 17, 18] },
      { kind: 'Submarine', cells: [32, 33] },
      { kind: 'Patrol', cells: [40, 41] },
    ];
    const result = validatePlacements(overlapping);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('tumpang tindih');

    const wrongSize: Placement[] = [
      { kind: 'Battleship', cells: [0, 1, 2] },
      { kind: 'Cruiser', cells: [8, 9, 10] },
      { kind: 'Frigate', cells: [16, 17, 18] },
      { kind: 'Submarine', cells: [32, 33] },
      { kind: 'Patrol', cells: [40, 41] },
    ];
    expect(validatePlacements(wrongSize).errors.join(' ')).toContain('seharusnya 4');

    const missingShip: Placement[] = wrongSize.slice(0, 4) as Placement[];
    expect(validatePlacements(missingShip).errors.join(' ')).toContain('harus tepat satu');
  });

  it('menjaga giliran: tembakan hanya oleh pemegang giliran dan hanya ke petak baru', () => {
    const committed = applyCommitment(createInitialState(), 0, 'c0').state;
    const state = applyCommitment(committed, 1, 'c1').state;
    expect(state.phase).toBe('BATTLE');

    expect(fireShot(state, 1, 5).error).toBe('Giliran pemain lain');

    const fired = fireShot(state, 0, 5);
    expect(fired.error).toBeUndefined();
    expect(fired.state.currentTurn).toBe(1);
    expect(legalShots(fired.state, 0)).toHaveLength(0);

    const judged = resolveShot(fired.state, 1, { mark: 'miss' });
    expect(judged.error).toBeUndefined();
    expect(judged.state.shotsTaken).toEqual([1, 0]);

    // Judging hands the next shot to the defender, so firing alternates seat by seat.
    expect(judged.state.currentTurn).toBe(1);
    expect(fireShot(judged.state, 0, 7).error).toBe('Giliran pemain lain');
    expect(resolveShot(fired.state, 0, { mark: 'hit' }).error).toContain('Hanya pemilik papan');
    expect(resolveShot(judged.state, 1, { mark: 'hit' }).error).toBe('Tidak ada tembakan tertunda');

    const second = fireShot(judged.state, 1, 5);
    expect(second.error).toBeUndefined();
    const judged2 = resolveShot(second.state, 0, { mark: 'hit' });
    expect(judged2.state.currentTurn).toBe(0);
    expect(judged2.state.shotsTaken).toEqual([1, 1]);
    expect(judged2.state.sunk[0]).toEqual([]);

    // Repeating a cell on the same board is refused even though the seat holds the turn.
    expect(fireShot(judged2.state, 0, 5).error).toContain('sudah pernah ditembak');
    expect(fireShot(judged2.state, 0, CELL_COUNT).error).toBe('Petak di luar papan');
  });

  it('menilai hit dan tenggelam dari layout pemilik papan, bukan dari serangan', () => {
    const placements = [{ kind: 'Battleship', cells: [0, 1, 2, 3] }] as Placement[];
    const first = judgeShot({ placements, marks: {} }, 0);
    expect(first).toEqual({ mark: 'hit' });

    const marks: Record<string, Mark> = { 0: 'hit', 1: 'hit', 2: 'hit' };
    const last = judgeShot({ placements, marks }, 3);
    expect(last).toEqual({ mark: 'hit', sunk: 'Battleship' });

    expect(judgeShot({ placements, marks: {} }, 7)).toEqual({ mark: 'miss' });
  });

  it('menyelesaikan satu pertandingan penuh dua arah sampai armada musnah', async () => {
    const seedA = generateSeed();
    const seedB = generateSeed();
    const fleetA = placementsFor(seedA);
    const fleetB = placementsFor(seedB);

    let state = createInitialState();
    state = applyCommitment(state, 0, await commitOf(seedA, fleetA)).state;
    state = applyCommitment(state, 1, await commitOf(seedB, fleetB)).state;

    const seen = new Set<string>();
    let guard = 0;
    let aiSeat: 0 | 1 = 0;

    while (state.phase === 'BATTLE' && guard++ < 400) {
      const attacker = state.currentTurn;
      const defender = otherSeat(attacker);
      const defenderFleet = defender === 0 ? fleetA : fleetB;
      const marks = state.marks[defender];

      const untried: number[] = [];
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        if (!marks[cellKey(cell)]) untried.push(cell);
      }
      expect(untried.length).toBeGreaterThan(0);

      const cell =
        attacker === aiSeat
          ? chooseAiShot(marks, () => 0.5)
          : untried[Math.floor(untried.length / 2)];

      state = playShot(state, attacker, defenderFleet, cell);
      const key = `${defender}:${cell}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    expect(state.phase).toBe('FINISHED');
    expect(state.winner).not.toBeNull();
    const loser = otherSeat(state.winner as 0 | 1);
    expect(isFleetSunk(loser === 0 ? fleetA : fleetB, state.marks[loser])).toBe(true);
    expect(state.shotsTaken[0] + state.shotsTaken[1]).toBe(seen.size);

    const revealWinner = await revealFleet(state, state.winner as 0 | 1, {
      seed: state.winner === 0 ? seedA : seedB,
      layout: canonicalLayout(state.winner === 0 ? fleetA : fleetB),
    });
    expect(revealWinner.verification.ok).toBe(true);
    expect(revealWinner.state.tampered[state.winner as 0 | 1]).toBe(false);

    const loserFleet = loser === 0 ? fleetA : fleetB;
    const loserSeed = loser === 0 ? seedA : seedB;
    const revealLoser = await revealFleet(revealWinner.state, loser, {
      seed: loserSeed,
      layout: canonicalLayout(loserFleet),
    });
    expect(revealLoser.verification.ok).toBe(true);
  });

  it('mendeteksi klaim tembakan yang dibohongi saat reveal', async () => {
    const liarSeed = 'seed-liar';
    const liarFleet = placementsFor(liarSeed);
    const commitment = await commitOf(liarSeed, liarFleet);
    const occupied = liarFleet.flatMap((p) => p.cells)[0];

    const base: BattleshipState = {
      ...createInitialState(),
      phase: 'BATTLE',
      commitment: [commitment, commitment],
    };

    const fired = fireShot(base, 0, occupied);
    expect(fired.error).toBeUndefined();

    const lying = resolveShot(fired.state, 1, { mark: 'miss' });
    expect(lying.error).toBeUndefined();

    const verdict = await verifySeat(lying.state, 1, { seed: liarSeed, layout: canonicalLayout(liarFleet) }, false);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(' ')).toContain('meleset');

    const revealed = await revealFleet(lying.state, 1, { seed: liarSeed, layout: canonicalLayout(liarFleet) });
    expect(revealed.state.tampered[1]).toBe(true);

    const tellingTruth = resolveShot(fired.state, 1, { mark: 'hit' }).state;
    const honest = await verifySeat(
      tellingTruth,
      1,
      { seed: liarSeed, layout: canonicalLayout(liarFleet) },
      false
    );
    expect(honest.ok).toBe(true);
  });

  it('menolak reveal yang seed dan layoutnya tidak cocok dengan komitmen', async () => {
    const fleet = placementsFor('seed-real');
    const commitment = await commitOf('seed-real', fleet);

    const state: BattleshipState = {
      ...createInitialState(),
      phase: 'FINISHED',
      commitment: [commitment, null],
      endReason: 'fleet-destroyed',
    };

    const swapped = placementsFor('seed-palsu');
    const verification = await verifySeat(state, 0, { seed: 'seed-palsu', layout: canonicalLayout(swapped) }, false);
    expect(verification.ok).toBe(false);
    expect(verification.reasons.join(' ')).toContain('Komitmen tidak cocok');
  });

  it('AI mengejar sisa kapal tanpa mengulang petak dan menenggelamkan seluruh armada', () => {
    const fleet = placementsFor('seed-ai-target');
    const marks: Record<string, Mark> = {};
    let shots = 0;
    const used = new Set<number>();

    while (!isFleetSunk(fleet, marks) && shots < CELL_COUNT) {
      const cell = chooseAiShot(marks, () => 0.42);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(used.has(cell)).toBe(false);
      used.add(cell);

      const verdict = judgeShot({ placements: fleet, marks }, cell);
      marks[cellKey(cell)] = verdict.mark;
      shots++;
    }

    expect(isFleetSunk(fleet, marks)).toBe(true);
    expect(shots).toBeLessThanOrEqual(CELL_COUNT);
  });

  it('AI memprioritaskan petak di sekitar tembakan yang kena', () => {
    const marks: Record<string, Mark> = { [cellKey(27)]: 'hit' };
    const next = chooseAiShot(marks, () => 0);
    const neighbours = [27 - BOARD_SIZE, 27 + BOARD_SIZE, 26, 28];
    expect(neighbours).toContain(next);
  });

  it('parse canonical mengembalikan layout yang identik', () => {
    const fleet = placementsFor('seed-roundtrip');
    expect(canonicalLayout(parseCanonicalLayout(canonicalLayout(fleet)))).toBe(canonicalLayout(fleet));
  });

  it('menolak langkah sebelum kedua komitmen masuk', () => {
    const one = applyCommitment(createInitialState(), 0, 'c0');
    expect(one.state.phase).toBe('PLACEMENT');
    expect(fireShot(one.state, 0, 1).error).toBe('Pertandingan belum dimulai');
    expect(applyCommitment(one.state, 0, 'c0-lain').state.commitment[0]).toBe('c0');
    expect(applyCommitment(one.state, 0, 'c0-lain').error).toContain('Komitmen sudah terkirim');
    expect(applyCommitment(one.state, 0, 'c0').state.commitment[0]).toBe('c0');
    expect(applyCommitment(one.state, 0, 'c0').error).toBeUndefined();
    expect(applyCommitment(one.state, 1, 'c1').state.phase).toBe('BATTLE');
  });

  it('memakai jenis kapal yang dikenal untuk setiap petak', () => {
    const fleet = placementsFor('seed-kinds');
    const kinds: ShipKind[] = fleet.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(FLEET.length);
    expect(otherSeat(seat(0))).toBe(1);
  });
});
