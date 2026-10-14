import { describe, it, expect, vi, afterEach } from 'vitest';
import { ArenaNet, EV_FX, EV_INPUT, EV_SNAPSHOT } from '../../src/games/slap-arena/engine/net';
import { ARENA_RADIUS } from '../../src/games/slap-arena/engine/physics';
import { SlapSim } from '../../src/games/slap-arena/engine/sim';
import type { InputState, SimEvent, WorldSnapshot } from '../../src/games/slap-arena/engine/types';

/**
 * Two sims wired through a fake realtime channel, so the protocol the old branch
 * broke (sender said `player_move`, listener waited for `game_move`) is now pinned
 * by a test instead of by reading code.
 */
function makeRelay() {
  type Handler = (msg: { payload: unknown }) => void;
  const sides = new Map<string, Map<string, Handler[]>>();

  const makeChannel = (name: string) => {
    const handlers = new Map<string, Handler[]>();
    sides.set(name, handlers);
    return {
      on: (_type: string, filter: { event: string }, cb: Handler) => {
        const list = handlers.get(filter.event) ?? [];
        list.push(cb);
        handlers.set(filter.event, list);
      },
      send: (args: { event: string; payload: unknown }) => {
        for (const [other, map] of sides) {
          if (other === name) continue;
          for (const cb of map.get(args.event) ?? []) cb({ payload: structuredClone(args.payload) });
        }
        return Promise.resolve('sent');
      },
    };
  };

  const dispatch = (to: string, event: string, payload: unknown) => {
    for (const cb of sides.get(to)?.get(event) ?? []) cb({ payload });
  };

  return { makeChannel, dispatch };
}

interface Peer {
  sim: SlapSim;
  net: ArenaNet;
  received: SimEvent[];
  input: InputState;
}

function makePeer(relay: ReturnType<typeof makeRelay>, id: string, role: 'host' | 'client', name: string, color: string): Peer {
  const sim = new SlapSim({ localId: id, authoritative: role === 'host', scoreToWin: 2 });
  sim.addPlayer({ id, name, color, isHost: role === 'host' });
  const received: SimEvent[] = [];
  const queue: SimEvent[] = [];
  sim.onEvent = (e) => {
    if (sim.authoritative && e.kind !== 'roundStart') queue.push(e);
  };
  const input: InputState = { x: 0, z: 0, slap: false, dash: false };
  const net = new ArenaNet({
    channel: relay.makeChannel(id) as never,
    isHost: () => sim.authoritative,
    localId: id,
    playerName: name,
    playerColor: color,
    getInput: () => input,
    getSnapshot: () => sim.snapshot(),
    drainFx: () => queue.splice(0, queue.length),
    onInput: (msg) => {
      if (!sim.players[msg.id]) sim.addPlayer({ id: msg.id, name: msg.name, color: msg.color });
      sim.setInput(msg.id, { x: msg.x, z: msg.z, slap: msg.slap, dash: msg.dash });
    },
    onSnapshot: (snap) => sim.applySnapshot(snap),
    onFx: (events) => events.forEach((e) => received.push(e)),
  });
  net.start();
  return { sim, net, received, input };
}

/** Steps both worlds and lets the 20 Hz senders run, all on fake timers. */
function run(ms: number, peers: Peer[]) {
  const step = 1 / 60;
  const frames = Math.round(ms / 1000 / step);
  for (let i = 0; i < frames; i++) {
    for (const p of peers) p.sim.step(step);
    vi.advanceTimersByTime(step * 1000);
  }
}

const snapshot = (over: Partial<WorldSnapshot>): WorldSnapshot => ({
  round: 1,
  phase: 'BATTLE',
  countdown: 0,
  scoreToWin: 2,
  winnerId: null,
  matchWinnerId: null,
  t: 0,
  players: [],
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Slap Arena host-authoritative link', () => {
  it('teaches both sides about the other through the protocol alone', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');

    run(200, [host, guest]);
    expect(host.sim.players.guest?.name).toBe('Guest');
    expect(guest.sim.players.host?.name).toBe('Host');
  });

  it('carries the countdown and the battle phase to the client', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    run(120, [host, guest]);

    host.sim.startCountdown(0);
    expect(guest.sim.state.phase).not.toBe('BATTLE');
    run(3200, [host, guest]);
    expect(host.sim.state.phase).toBe('BATTLE');
    expect(guest.sim.state.phase).toBe('BATTLE');
  });

  it('both sides agree who won the round', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);
    expect(host.sim.state.phase).toBe('BATTLE');

    host.sim.players.guest.x = ARENA_RADIUS + 1;
    host.sim.players.guest.z = 0;
    run(4000, [host, guest]);

    expect(host.sim.state.phase).toBe('ROUND_OVER');
    expect(guest.sim.state.phase).toBe('ROUND_OVER');
    expect(guest.sim.state.winnerId).toBe('host');
    expect(guest.sim.players.host.score).toBe(1);
  });

  it('tells the client a brawler fell, exactly once', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);

    host.sim.players.guest.x = ARENA_RADIUS + 1;
    run(4000, [host, guest]);

    const kos = guest.received.filter((e) => e.kind === 'ko');
    expect(kos).toHaveLength(1);
    expect(guest.sim.players.guest.isFalling).toBe(true);
  });

  it('drives the host world from client input', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);

    guest.input.x = 1;
    guest.input.z = 0;
    const before = host.sim.players.guest.x;
    run(1000, [host, guest]);
    expect(host.sim.players.guest.x).toBeGreaterThan(before);
  });

  it('drops snapshots that arrive after a newer one', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');

    relay.dispatch('guest', EV_SNAPSHOT, snapshot({ round: 4, t: 10 }));
    expect(guest.sim.state.round).toBe(4);
    relay.dispatch('guest', EV_SNAPSHOT, snapshot({ round: 2, t: 5 }));
    expect(guest.sim.state.round).toBe(4);
    relay.dispatch('guest', EV_SNAPSHOT, snapshot({ round: 5, t: 11 }));
    expect(guest.sim.state.round).toBe(5);
  });

  it('ignores junk payloads instead of throwing', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    expect(() => relay.dispatch('guest', EV_SNAPSHOT, { nonsense: true })).not.toThrow();
    expect(() => relay.dispatch('guest', EV_FX, { not: 'an array' })).not.toThrow();
    expect(() => relay.dispatch('guest', EV_INPUT, null)).not.toThrow();
    expect(guest.sim.state.phase).toBe('WAITING');
    expect(guest.received).toHaveLength(0);
  });

  it('keeps event names single-sourced', () => {
    expect([EV_INPUT, EV_SNAPSHOT, EV_FX]).toEqual(['sa_in', 'sa_snap', 'sa_fx']);
  });
});
