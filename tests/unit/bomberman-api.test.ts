import { describe, expect, it, vi } from 'vitest';

import { BombermanBot } from '@/games/bomberman/engine/ai';

import {
  DEFAULT_ROOM_CONFIG,
  SERVER_ID,
  applyAction,
  createGame,
  drainFx,
  isFinished,
  loadWorld,
  masterOf,
  parseRoomConfig,
  phaseOf,
  removePlayer,
  snapshotOf,
  type Action,
  type ActionResult,
  type BombermanRoom,
} from '@/games/bomberman/engine/gameApi';
import type { BombermanState } from '@/games/bomberman/engine/types';

const config = { seats: 2 as const, size: 'kecil' as const };

const ok = (result: ActionResult): void => {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
};

const join = (room: BombermanRoom, id: string, seat?: number): void => {
  ok(applyAction(room, id, { t: 'join', id, name: id.toUpperCase(), ...(seat === undefined ? {} : { seat }) }));
};

const start = (room: BombermanRoom, playerId: string, fillBots = false, seed = 'test-seed'): void => {
  ok(applyAction(room, playerId, { t: 'start', fillBots, seed, floor: 'grass' }));
};

const tick = (room: BombermanRoom, count: number, dt = 0.05): void => {
  for (let i = 0; i < count; i += 1) ok(applyAction(room, SERVER_ID, { t: 'tick', dt }));
};

const seated = (room: BombermanRoom): BombermanRoom => {
  join(room, 'aa');
  join(room, 'bb');
  return room;
};

describe('room config at the door', () => {
  it('defaults to four seats on the small board when the invite carries nothing', () => {
    const parsed = parseRoomConfig(() => null);
    expect(parsed).toEqual({ ok: true, config: DEFAULT_ROOM_CONFIG, provided: false });
  });

  it('reads the lobby knobs and marks them provided', () => {
    const params = new Map([
      ['seats', '2'],
      ['size', 'besar'],
    ]);
    const parsed = parseRoomConfig((name) => params.get(name) ?? null);
    expect(parsed).toEqual({ ok: true, config: { seats: 2, size: 'besar', teams: false }, provided: true });
  });

  it('rejects a seat count or board the engine does not know', () => {
    expect(parseRoomConfig((name) => (name === 'seats' ? '3' : null))).toEqual({ ok: false, reason: 'bad_room_options' });
    expect(parseRoomConfig((name) => (name === 'size' ? 'raksasa' : null))).toEqual({ ok: false, reason: 'bad_room_options' });
  });
});

describe('lobby', () => {
  it('seats the first player in its Worker seat and makes it master', () => {
    const room = createGame(config);
    join(room, 'aa', 1);
    const seat = room.roster.get('aa');
    expect(seat?.seat).toBe(1);
    expect(masterOf(room)).toBe('aa');
    expect(phaseOf(room)).toBe('lobby');
  });

  it('refuses a third human in a two-seat room', () => {
    const room = seated(createGame(config));
    const third = applyAction(room, 'cc', { t: 'join', id: 'cc', name: 'CC', seat: 2 });
    expect(third).toEqual({ ok: false, reason: 'room_full' });
    const withoutSeat = applyAction(room, 'cc', { t: 'join', id: 'cc', name: 'CC' });
    expect(withoutSeat).toEqual({ ok: false, reason: 'room_full' });
  });

  it('does not move a player who joins twice', () => {
    const room = createGame(config);
    join(room, 'aa', 0);
    join(room, 'aa', 1);
    expect(room.roster.get('aa')?.seat).toBe(0);
    expect(room.roster.size).toBe(1);
  });

  it('rejects a claim for a character the renderer does not have', () => {
    const room = createGame(config);
    join(room, 'aa');
    expect(applyAction(room, 'aa', { t: 'char', charId: 'naga' })).toEqual({ ok: false, reason: 'bad_payload' });
    ok(applyAction(room, 'aa', { t: 'char', charId: 'radar' }));
    expect(room.roster.get('aa')?.charId).toBe('radar');
  });
});

describe('starting a match', () => {
  it('only lets the master start', () => {
    const room = seated(createGame(config));
    expect(applyAction(room, 'bb', { t: 'start', fillBots: false, seed: 'x-seed' })).toEqual({
      ok: false,
      reason: 'not_master',
    });
    expect(room.sim).toBeNull();
  });

  it('fills empty seats with bots, so one human can still start a two-seat room', () => {
    const room = createGame(config);
    join(room, 'aa');
    start(room, 'aa', true);
    expect(room.sim?.state.seats).toBe(2);
    expect(room.sim?.state.players.map((p) => p.bot)).toEqual([false, true]);
    expect(room.sim?.state.players.map((p) => p.seat)).toEqual([0, 1]);
    expect(phaseOf(room)).toBe('playing');
  });

  it('refuses a one-player match when bot fill is off', () => {
    const room = createGame(config);
    join(room, 'aa');
    expect(applyAction(room, 'aa', { t: 'start', fillBots: false, seed: 'x-seed' })).toEqual({
      ok: false,
      reason: 'too_few_players',
    });
  });

  it('keeps the board the room negotiated, not one the start payload asks for', () => {
    const room = createGame({ seats: 4, size: 'besar' });
    join(room, 'aa', 0);
    start(room, 'aa', true);
    expect(room.sim?.state.cols).toBe(21);
    expect(room.sim?.state.rows).toBe(15);
    expect(room.sim?.state.seats).toBe(4);
  });

  it('refuses to start twice while the match is still running', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    expect(applyAction(room, 'aa', { t: 'start', fillBots: false, seed: 'other' })).toEqual({
      ok: false,
      reason: 'wrong_phase',
    });
  });

  it('allows a rematch once the previous match is finished', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    const state = room.sim!.state;
    state.phase = 'finished';
    state.winner = 0;
    expect(isFinished(room)).toBe(true);
    start(room, 'aa', false, 'rematch-seed');
    expect(room.sim?.state.phase).toBe('countdown');
    expect(room.sim?.state.seed).toBe('rematch-seed');
  });
});

describe('input and the tick', () => {
  it('rejects a stale sequence and a direction nobody has', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    ok(applyAction(room, 'aa', { t: 'input', seq: 2, dir: 'right', bomb: false }));
    expect(applyAction(room, 'aa', { t: 'input', seq: 2, dir: 'left', bomb: false })).toEqual({
      ok: false,
      reason: 'duplicate_seq',
    });
    expect(applyAction(room, 'aa', { t: 'input', seq: 3, dir: 'sideways' as never, bomb: false })).toEqual({
      ok: false,
      reason: 'bad_payload',
    });
  });

  it('a held direction moves the seat once the countdown is over', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    ok(applyAction(room, 'aa', { t: 'input', seq: 1, dir: 'right', bomb: false }));
    tick(room, 60);
    const player = room.sim!.state.players[0];
    expect(room.sim?.state.phase).toBe('battle');
    expect(player.x).toBeGreaterThan(1);
  });

  it('a bomb press becomes one bomb, and the same sequence is not a second press', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    tick(room, 60);
    ok(applyAction(room, 'aa', { t: 'input', seq: 1, dir: null, bomb: true }));
    tick(room, 1);
    expect(room.sim?.state.bombs).toHaveLength(1);
    // Replaying the same seq is refused before it reaches the sim.
    expect(applyAction(room, 'aa', { t: 'input', seq: 1, dir: null, bomb: true })).toEqual({
      ok: false,
      reason: 'duplicate_seq',
    });
    expect(room.sim?.state.bombs).toHaveLength(1);
  });

  it('runs the bots inside the server tick, not in a player tab', () => {
    const brain = vi.spyOn(BombermanBot.prototype, 'update');
    try {
      const room = createGame(config);
      join(room, 'aa');
      start(room, 'aa', true);
      tick(room, 4);
      expect(brain).toHaveBeenCalled();
      // One call per tick for the bot, and the human seat never receives one.
      expect(brain.mock.instances.every((bot) => (bot as unknown as BombermanBot).seat === 1)).toBe(true);
      expect(brain.mock.calls.length).toBeGreaterThanOrEqual(4);
    } finally {
      brain.mockRestore();
    }
  });

  it('rejects a tick step that could fast-forward the whole match', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    expect(applyAction(room, SERVER_ID, { t: 'tick', dt: 5 })).toEqual({ ok: false, reason: 'bad_payload' });
  });
});

describe('leaving and coming back', () => {
  it('turns a leaver into a bot instead of leaving a hole on the board', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    ok(removePlayer(room, 'bb'));
    expect(room.roster.has('bb')).toBe(false);
    const live = room.sim?.state.players.find((p) => p.seat === 1);
    expect(live?.bot).toBe(true);
    expect(room.sim?.state.players).toHaveLength(2);
  });

  it('hands the same seat back when its owner rejoins', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    ok(removePlayer(room, 'bb'));
    join(room, 'bb', 1);
    const live = room.sim?.state.players.find((p) => p.seat === 1);
    expect(live?.bot).toBe(false);
    expect(room.roster.get('bb')?.seat).toBe(1);
    expect(masterOf(room)).toBe('aa');
  });

  it('promotes the next seated human when the master leaves', () => {
    const room = seated(createGame(config));
    expect(masterOf(room)).toBe('aa');
    ok(removePlayer(room, 'aa'));
    expect(masterOf(room)).toBe('bb');
  });
});

describe('storage round trip', () => {
  it('rebuilds the same board from a snapshot', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    tick(room, 80);
    const snap = snapshotOf(room) as BombermanState;
    expect(snap).not.toBeNull();

    const restored = createGame(config);
    join(restored, 'aa', 0);
    join(restored, 'bb', 1);
    loadWorld(restored, snap);
    const next = snapshotOf(restored) as BombermanState;
    expect(next.grid).toEqual(snap.grid);
    expect(next.players.map((p) => [p.seat, p.x, p.y])).toEqual(snap.players.map((p) => [p.seat, p.x, p.y]));
    expect(phaseOf(restored)).toBe(phaseOf(room));
  });

  it('does not mistake junk for a world', () => {
    const room = createGame(config);
    loadWorld(room, { players: 'nope' });
    expect(snapshotOf(room)).toBeNull();
  });
});

describe('effects', () => {
  it('drains the events the tick produced exactly once', () => {
    const room = seated(createGame(config));
    start(room, 'aa');
    tick(room, 1);
    const first = drainFx(room);
    expect(first.some((e) => e.t === 'countdown')).toBe(true);
    expect(drainFx(room)).toEqual([]);
  });
});

describe('action budget', () => {
  it('refuses a payload larger than the message cap', () => {
    const room = createGame(config);
    const huge: Action = { t: 'join', id: 'aa', name: 'x'.repeat(600) };
    expect(applyAction(room, 'aa', huge)).toEqual({ ok: false, reason: 'bad_payload' });
  });
});
