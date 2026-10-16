import { describe, it, expect, vi, afterEach } from 'vitest';
import { ArenaNet, EV_FX, EV_INPUT, EV_SNAPSHOT, makeActionEdge } from '../../src/games/slap-arena/engine/net';
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
        // Realtime resolves a broadcast to 'ok'; a fixture that says otherwise would let
        // the sender's success classification pass while the real socket fails it.
        return Promise.resolve('ok');
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
  const actionEdge = makeActionEdge();
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
      // Mirrors the page: the flags are a level, the sequence number is the edge.
      const edge = actionEdge(msg);
      sim.setInput(msg.id, {
        x: msg.x,
        z: msg.z,
        slap: edge && !!msg.slap,
        dash: edge && !!msg.dash,
        held: !!msg.held,
        charge: edge ? (msg.charge ?? 0) : 0,
      });
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

/** Parks the guest beside the host, both on the grass, off cooldown, not reeling. */
function lineUp(host: Peer) {
  Object.assign(host.sim.players.guest, {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    angle: 0,
    slapCooldown: 0,
    dashCooldown: 0,
    isHit: false,
    hitTimer: 0,
    isFalling: false,
    eliminated: false,
    y: 0,
    vy: 0,
    chargeT: -1,
  });
  Object.assign(host.sim.players.host, {
    x: 1.75,
    z: 0,
    vx: 0,
    vz: 0,
    isHit: false,
    hitTimer: 0,
    isFalling: false,
    eliminated: false,
    y: 0,
    vy: 0,
  });
}

function guestInput(over: Record<string, unknown>) {
  return { id: 'guest', name: 'Guest', color: '#ff5d5d', x: 0, z: 0, slap: false, dash: false, ...over };
}

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

  it('throws a charged client slap further than a tap', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);

    const launch = (charge: number, seq: number) => {
      lineUp(host);
      relay.dispatch('host', EV_INPUT, guestInput({ slap: true, charge, seq }));
      run(200, [host, guest]);
      const h = host.sim.players.host;
      return Math.hypot(h.x - 1.75, h.z);
    };

    const light = launch(0, 1);
    const heavy = launch(1, 2);
    expect(light).toBeGreaterThan(0.5);
    expect(heavy).toBeGreaterThan(light * 1.6);
  });

  it('a charged slap lifts the victim off the grass on the host world', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);

    lineUp(host);
    relay.dispatch('host', EV_INPUT, guestInput({ slap: true, charge: 1, seq: 1 }));
    run(100, [host, guest]);
    expect(host.sim.players.host.y).toBeGreaterThan(0.1);

    lineUp(host);
    relay.dispatch('host', EV_INPUT, guestInput({ slap: true, charge: 0, seq: 2 }));
    run(100, [host, guest]);
    expect(host.sim.players.host.y).toBe(0);
  });

  it('still takes a slap from a client that predates the charge fields', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);

    lineUp(host);
    relay.dispatch('host', EV_INPUT, {
      id: 'guest',
      name: 'Guest',
      color: '#ff5d5d',
      x: 0,
      z: 0,
      slap: true,
      dash: false,
    });
    run(200, [host, guest]);
    expect(Math.hypot(host.sim.players.host.x - 1.75, 0)).toBeGreaterThan(0.5);
    expect(host.sim.players.host.y).toBe(0);
  });

  it('treats a NaN charge as no charge instead of poisoning the world', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);

    lineUp(host);
    relay.dispatch('host', EV_INPUT, guestInput({ slap: true, charge: NaN, seq: 1 }));
    run(200, [host, guest]);
    const h = host.sim.players.host;
    expect(Number.isFinite(h.x)).toBe(true);
    expect(Number.isFinite(h.vx)).toBe(true);
    expect(Math.hypot(h.x - 1.75, h.z)).toBeGreaterThan(0.5);
  });

  it('counts one slap per sequence number, however long the flag stays up', () => {
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    host.sim.startCountdown(0);
    run(4000, [host, guest]);
    lineUp(host);

    // A released key keeps the flag on the wire; only a new number marks a new action.
    guest.input.slap = true;
    guest.input.charge = 0;
    guest.input.seq = 1;
    run(900, [host, guest]);
    expect(guest.received.filter((e) => e.kind === 'slap')).toHaveLength(1);

    guest.input.seq = 2;
    run(900, [host, guest]);
    expect(guest.received.filter((e) => e.kind === 'slap')).toHaveLength(2);
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

  it('counts a healthy broadcast as delivered, not dropped', async () => {
    // Realtime answers a broadcast with 'ok'. The sender used to accept only 'sent' and
    // 'pending', so every working message was tallied as a failure and the room warned
    // "koneksi mungkin terputus" while nothing was wrong.
    vi.useFakeTimers();
    const relay = makeRelay();
    const host = makePeer(relay, 'host', 'host', 'Host', '#4dabf7');
    const guest = makePeer(relay, 'guest', 'client', 'Guest', '#ff5d5d');
    run(1000, [host, guest]);
    // The answer arrives in a promise callback, so the fake timers must flush microtasks
    // before the classification can be read.
    await vi.advanceTimersByTimeAsync(0);

    expect(host.net.stats.sent).toBeGreaterThan(10);
    expect(host.net.stats.drop).toBe(0);
    expect(guest.net.stats.drop).toBe(0);
    expect(host.net.stats.lastState).toBe('ok');
  });

  it('counts a socket that refuses to carry messages as dropped', async () => {
    vi.useFakeTimers();
    const sim = new SlapSim({ localId: 'host', authoritative: true });
    const net = new ArenaNet({
      channel: { on: () => net, send: () => Promise.resolve('timed out') } as never,
      isHost: () => true,
      localId: 'host',
      playerName: 'Host',
      playerColor: '#4dabf7',
      getInput: () => ({ x: 0, z: 0, slap: false, dash: false }),
      getSnapshot: () => sim.snapshot(),
      drainFx: () => [],
      onInput: () => {},
      onSnapshot: () => {},
      onFx: () => {},
    });
    net.start();
    await vi.advanceTimersByTimeAsync(1000);
    net.stop();

    expect(net.stats.sent).toBe(20);
    expect(net.stats.drop).toBe(20);
  });

  it('keeps event names single-sourced', () => {
    expect([EV_INPUT, EV_SNAPSHOT, EV_FX]).toEqual(['sa_in', 'sa_snap', 'sa_fx']);
  });
});
