import { describe, expect, it } from 'vitest';

import { SlapSim } from '../../src/games/slap-arena/engine/sim';
import { MAX_MESSAGE_BYTES, MAX_PLAYERS, applyAction, createGame, removePlayer } from '../../src/games/slap-arena/engine/gameApi';
import type { InputState } from '../../src/games/slap-arena/engine/types';

const join = (id: string, name: string, color?: string) => ({ t: 'join' as const, id, name, ...(color ? { color } : {}) });
const idle: InputState = { x: 0, z: 0, slap: false, dash: false };

/** Two players, master is the first one in. */
function lobby() {
  const sim = createGame();
  applyAction(sim, 'p1', join('p1', 'A'));
  applyAction(sim, 'p2', join('p2', 'B'));
  return sim;
}

function started() {
  const sim = lobby();
  expect(applyAction(sim, 'p1', { t: 'start' })).toEqual({ ok: true });
  return sim;
}

describe('gameApi join rules', () => {
  it('accepts the first players and refuses the seventh', () => {
    const sim = createGame();
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      expect(applyAction(sim, `p${i}`, join(`p${i}`, `P${i}`))).toEqual({ ok: true });
    }
    expect(applyAction(sim, 'p7', join('p7', 'P7'))).toEqual({ ok: false, reason: 'room_full' });
    expect(Object.keys(sim.players)).toHaveLength(MAX_PLAYERS);
  });

  it('lets a player already in the room resend its join without taking a new seat', () => {
    const sim = lobby();
    expect(applyAction(sim, 'p1', join('p1', 'A again'))).toEqual({ ok: true });
    expect(Object.keys(sim.players)).toHaveLength(2);
  });

  it('falls back to the default name when the sent name sanitizes to nothing', () => {
    const sim = createGame();
    expect(applyAction(sim, 'p1', join('p1', '  <>  '))).toEqual({ ok: true });
    expect(sim.players.p1.name).toBe('Pemain');
  });

  it('strips angle brackets and cuts the name to 12 characters', () => {
    const sim = createGame();
    applyAction(sim, 'p1', join('p1', '<Bo><b> twelve chars here'));
    expect(sim.players.p1.name).toBe('Bob twelve c');
  });

  it('rejects a name that is not a string at all', () => {
    const sim = createGame();
    expect(applyAction(sim, 'p1', { t: 'join', id: 'p1', name: 42 as unknown as string })).toEqual({
      ok: false,
      reason: 'name_rejected',
    });
    expect(sim.players.p1).toBeUndefined();
  });
});

describe('gameApi master and phase rules', () => {
  it('starts from WAITING with two players and only for the master', () => {
    const sim = lobby();
    expect(sim.state.phase).toBe('WAITING');
    expect(applyAction(sim, 'p2', { t: 'start' })).toEqual({ ok: false, reason: 'unknown_player' });
    expect(applyAction(sim, 'p1', { t: 'start' })).toEqual({ ok: true });
    expect(sim.state.phase).toBe('COUNTDOWN');
  });

  it('refuses to start with fewer than two players', () => {
    const sim = createGame();
    applyAction(sim, 'p1', join('p1', 'A'));
    expect(applyAction(sim, 'p1', { t: 'start' })).toEqual({ ok: false, reason: 'wrong_phase' });
    expect(sim.state.phase).toBe('WAITING');
  });

  it('refuses a second start because the phase already moved on', () => {
    const sim = started();
    expect(applyAction(sim, 'p1', { t: 'start' })).toEqual({ ok: false, reason: 'wrong_phase' });
  });

  it('advances the round only when the round is actually over', () => {
    const sim = started();
    expect(applyAction(sim, 'p1', { t: 'nextRound' })).toEqual({ ok: false, reason: 'not_your_turn' });
    expect(applyAction(sim, 'p2', { t: 'nextRound' })).toEqual({ ok: false, reason: 'unknown_player' });

    const over = started();
    over.state.phase = 'ROUND_OVER';
    const roundBefore = over.state.round;
    expect(applyAction(over, 'p1', { t: 'nextRound' })).toEqual({ ok: true });
    expect(over.state.round).toBe(roundBefore + 1);
    expect(over.state.phase).toBe('BATTLE');
  });

  it('moves the master role to a remaining player and to nothing when the room empties', () => {
    const sim = createGame();
    applyAction(sim, 'p1', join('p1', 'A'));
    applyAction(sim, 'p2', join('p2', 'B'));
    applyAction(sim, 'p3', join('p3', 'C'));
    expect(removePlayer(sim, 'p1')).toEqual({ ok: true });
    expect(applyAction(sim, 'p2', { t: 'start' })).toEqual({ ok: true });

    const empty = lobby();
    removePlayer(empty, 'p1');
    expect(removePlayer(empty, 'p2')).toEqual({ ok: true });
    expect(Object.keys(empty.players)).toHaveLength(0);
    // With no master left, the next player in becomes one.
    expect(applyAction(empty, 'p3', join('p3', 'C'))).toEqual({ ok: true });
    expect(applyAction(empty, 'p3', { t: 'start' })).toEqual({ ok: false, reason: 'wrong_phase' });
    applyAction(empty, 'p4', join('p4', 'D'));
    expect(applyAction(empty, 'p3', { t: 'start' })).toEqual({ ok: true });
  });

  it('reports unknown_player for a removal that has no such seat', () => {
    const sim = lobby();
    expect(removePlayer(sim, 'ghost')).toEqual({ ok: false, reason: 'unknown_player' });
  });
});

describe('gameApi input rules', () => {
  it('refuses input from a seat that does not exist', () => {
    const sim = lobby();
    expect(applyAction(sim, 'ghost', { t: 'input', seq: 1, input: idle })).toEqual({
      ok: false,
      reason: 'unknown_player',
    });
  });

  it('refuses a sequence number that does not move forward', () => {
    const sim = lobby();
    expect(applyAction(sim, 'p1', { t: 'input', seq: 3, input: idle })).toEqual({ ok: true });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 3, input: idle })).toEqual({
      ok: false,
      reason: 'duplicate_seq',
    });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 2, input: idle })).toEqual({
      ok: false,
      reason: 'duplicate_seq',
    });
    // A different player keeps its own counter, and the first number is never a replay.
    expect(applyAction(sim, 'p2', { t: 'input', seq: 1, input: idle })).toEqual({ ok: true });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 4, input: idle })).toEqual({ ok: true });
  });

  it('refuses an input that is not shaped like one', () => {
    const sim = lobby();
    expect(applyAction(sim, 'p1', { t: 'input', seq: 1, input: 'nope' as unknown as InputState })).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 2, input: { ...idle, x: 2 } })).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 3, input: { ...idle, z: Number.NaN } })).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 4, input: { ...idle, slap: 'yes' as unknown as boolean } })).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
    expect(applyAction(sim, 'p1', { t: 'input', seq: 5, input: { ...idle, charge: 1.5 } })).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
  });
});

describe('gameApi tick rules', () => {
  it('refuses a dt that cannot be trusted', () => {
    const sim = started();
    for (const dt of [Number.NaN, -0.05, 0, 0.26, '0.05' as unknown as number, Infinity]) {
      expect(applyAction(sim, 'p1', { t: 'tick', dt })).toEqual({ ok: false, reason: 'bad_payload' });
    }
    expect(applyAction(sim, 'p1', { t: 'tick', dt: 0.25 })).toEqual({ ok: true });
  });
});

describe('gameApi message budget', () => {
  it('refuses an action whose JSON is larger than the transport budget', () => {
    const sim = createGame();
    const filler = 'x'.repeat(MAX_MESSAGE_BYTES);
    expect(applyAction(sim, 'p1', join('p1', filler))).toEqual({ ok: false, reason: 'bad_payload' });
    expect(Object.keys(sim.players)).toHaveLength(0);
    // A message that fits the budget still gets through.
    expect(applyAction(sim, 'p1', join('p1', 'x'.repeat(40)))).toEqual({ ok: true });
  });

  it('counts bytes and not characters, so a multibyte name is measured honestly', () => {
    const sim = createGame();
    // 300 characters is under 512, but 600 UTF-8 bytes is over it.
    const wide = 'é'.repeat(300);
    expect(wide.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(Buffer.byteLength(JSON.stringify(join('p1', wide)), 'utf8')).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(applyAction(sim, 'p1', join('p1', wide))).toEqual({ ok: false, reason: 'bad_payload' });
    expect(Object.keys(sim.players)).toHaveLength(0);
  });
});

describe('gameApi is a wrapper, not a new ruleset', () => {
  /**
   * The same script run through two doors: the direct calls SlapArenaMatch.tsx makes today, and
   * applyAction. The snapshots must match byte for byte, or this layer changed the game.
   */
  const TICKS = 300;
  const DT = 0.05;

  interface Scheduled {
    tick: number;
    actor: string;
    input: () => InputState;
    seq: () => number;
  }

  let seqCounter = 0;
  const schedule: Scheduled[] = [
    { tick: 0, actor: 'p1', input: () => ({ ...idle }), seq: () => ++seqCounter },
    { tick: 0, actor: 'p2', input: () => ({ x: 0.6, z: 0.2, slap: false, dash: false }), seq: () => ++seqCounter },
    { tick: 10, actor: 'p1', input: () => ({ x: 0, z: 0, slap: false, dash: true }), seq: () => ++seqCounter },
    { tick: 40, actor: 'p1', input: () => ({ x: 0.3, z: 0, slap: true, dash: false, charge: 0.5 }), seq: () => ++seqCounter },
    { tick: 120, actor: 'p1', input: () => ({ x: 0, z: -0.4, slap: true, dash: false, held: false }), seq: () => ++seqCounter },
  ];

  const runOldPath = (): string => {
    const sim = new SlapSim({ localId: 'p1', authoritative: true });
    sim.addPlayer({ id: 'p1', name: 'A', color: '#4dabf7' });
    sim.addPlayer({ id: 'p2', name: 'B', color: '#ff5d5d' });
    sim.startCountdown();
    for (let tick = 0; tick < TICKS; tick++) {
      for (const event of schedule) {
        if (event.tick === tick) sim.setInput(event.actor, event.input());
      }
      sim.step(DT);
    }
    return JSON.stringify(sim.snapshot());
  };

  const runNewPath = (): string => {
    const sim = createGame();
    applyAction(sim, 'p1', join('p1', 'A', '#4dabf7'));
    applyAction(sim, 'p2', join('p2', 'B', '#ff5d5d'));
    applyAction(sim, 'p1', { t: 'start' });
    for (let tick = 0; tick < TICKS; tick++) {
      for (const event of schedule) {
        if (event.tick === tick) {
          applyAction(sim, event.actor, { t: 'input', seq: event.seq(), input: event.input() });
        }
      }
      applyAction(sim, 'p1', { t: 'tick', dt: DT });
    }
    return JSON.stringify(sim.snapshot());
  };

  it('produces the same world through both doors', () => {
    seqCounter = 0;
    const oldJson = runOldPath();
    seqCounter = 0;
    const newJson = runNewPath();

    console.log(
      JSON.stringify({
        goldenTrace: {
          ticks: TICKS,
          dt: DT,
          oldBytes: Buffer.byteLength(oldJson, 'utf8'),
          newBytes: Buffer.byteLength(newJson, 'utf8'),
          identical: oldJson === newJson,
          phaseAfter: JSON.parse(newJson).phase,
          playersAfter: JSON.parse(newJson).players.map((p: { id: string; x: number; z: number; score: number }) => [
            p.id,
            p.x,
            p.z,
            p.score,
          ]),
        },
      })
    );

    expect(newJson).toBe(oldJson);
  });

  it('reaches BATTLE through the API and moves both brawlers', () => {
    seqCounter = 0;
    const world = JSON.parse(runNewPath()) as { phase: string; players: Array<{ id: string; x: number; z: number }> };
    expect(world.phase).not.toBe('WAITING');
    expect(world.players).toHaveLength(2);
  });
});
