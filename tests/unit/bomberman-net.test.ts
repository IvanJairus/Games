import { describe, expect, it, vi } from 'vitest';

import {
  BombermanNet,
  EV_CHAR,
  EV_INPUT,
  EV_WORLD,
  TICK_MS,
  encodeChar,
  encodeInput,
  isInput,
  isWorld,
} from '@/games/bomberman/engine/net';
import { BombermanSim } from '@/games/bomberman/engine/sim';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { InputState } from '@/games/bomberman/engine/types';

/**
 * A relay that behaves like the realtime bus the app actually uses: one channel per
 * room, every member receives what another member sends, and nothing is delivered to
 * the sender. Two sims wired through it are a real client/server pair minus the network.
 */
class FakeChannel {
  static bus = new Map<string, FakeChannel[]>();
  sent: { event: string; payload: unknown }[] = [];
  /** Public so a test can push a payload straight at one binding. */
  handlers = new Map<string, (msg: { payload: unknown }) => void>();
  name: string;

  constructor(name: string) {
    this.name = name;
    const peers = FakeChannel.bus.get(name) ?? [];
    peers.push(this);
    FakeChannel.bus.set(name, peers);
  }

  on(_type: string, opts: { event: string }, cb: (msg: { payload: unknown }) => void): this {
    this.handlers.set(opts.event, cb);
    return this;
  }

  send(args: { event: string; payload: unknown }): Promise<string> {
    this.sent.push(args);
    for (const peer of FakeChannel.bus.get(this.name) ?? []) {
      if (peer === this) continue;
      peer.handlers.get(args.event)?.({ payload: structuredClone(args.payload) });
    }
    return Promise.resolve('ok');
  }

  static reset(): void {
    FakeChannel.bus = new Map();
  }
}

const seatInfo = (seat: number) => ({ seat, name: `P${seat}`, charId: 'robo', bot: false });

const makeSim = (seats: number): BombermanSim =>
  new BombermanSim({
    seats,
    seed: 'net-seed',
    floor: 'grass',
    players: Array.from({ length: seats }, (_, i) => seatInfo(i)),
    phase: 'battle',
  });

function wire(seats: number, hostSeat: number) {
  const sims = Array.from({ length: seats }, () => makeSim(seats));
  const inputs: InputState[] = Array.from({ length: seats }, () => ({ dir: null, bomb: false, seq: 0 }));
  const nets: BombermanNet[] = [];

  sims.forEach((sim, seat) => {
    const net = new BombermanNet({
      channel: new FakeChannel('room') as unknown as RealtimeChannel,
      isHost: () => seat === hostSeat,
      localSeat: () => seat,
      getInput: () => inputs[seat],
      getWorld: () => ({ t: performance.now(), state: sim.snapshot(), fx: sim.drainEvents() }),
      onInput: (from, input) => sim.setInput(from, input),
      onWorld: (world) => {
        sim.applySnapshot(world.state);
        world.fx.length;
      },
    });
    net.start();
    nets.push(net);
  });

  return { sims, inputs, nets };
}

describe('payload guards', () => {
  it('accepts only inputs with a seat, a legal direction and a number', () => {
    expect(isInput({ seat: 1, dir: 'left', bomb: true, seq: 4 })).toBe(true);
    expect(isInput({ seat: 1, dir: null, bomb: false, seq: 0 })).toBe(true);
    expect(isInput(null)).toBe(false);
    expect(isInput({ seat: 'one', dir: 'left', seq: 1 })).toBe(false);
    expect(isInput({ seat: 1, dir: 'sideways', seq: 1 })).toBe(false);
    expect(isInput({ not: 'an input' })).toBe(false);
  });

  it('neutralises a non-finite sequence instead of poisoning the sender memory', () => {
    expect(encodeInput({ seat: 2, dir: 'up', bomb: true, seq: Number.NaN }).seq).toBe(0);
    expect(encodeInput({ seat: 2, dir: 'nowhere' as never, bomb: true, seq: 3 }).dir).toBeNull();
    expect(encodeInput({ seat: -1.5, dir: null, bomb: false, seq: 1 }).seat).toBe(-2);
  });

  it('rejects a world that is not shaped like a world', () => {
    const sim = makeSim(2);
    expect(isWorld({ t: 1, state: sim.state, fx: [] })).toBe(true);
    expect(isWorld({ t: 1, state: { players: 'nope' }, fx: [] })).toBe(false);
    expect(isWorld(null)).toBe(false);
    expect(isWorld({ t: 1, state: sim.state })).toBe(false);
  });
});

describe('host-authoritative link', () => {
  it('delivers the host world to a client and ignores junk', () => {
    FakeChannel.reset();
    const { sims, nets, inputs } = wire(2, 0);

    // A junk payload must not throw and must not change the client.
    const channel = (nets[1] as unknown as { opts: { channel: FakeChannel } }).opts.channel;
    const before = JSON.stringify(sims[1].state);
    channel.handlers.get(EV_WORLD)?.({ payload: { nonsense: true } });
    channel.handlers.get(EV_WORLD)?.({ payload: null });
    channel.handlers.get(EV_INPUT)?.({ payload: { seat: 9, dir: 'left', seq: 'x' } });
    expect(JSON.stringify(sims[1].state)).toBe(before);

    inputs[1].dir = 'right';
    inputs[1].seq = 1;
    nets[1].sendPress(1, 'right', 1);
    // A press arrives between ticks; the held direction is read by the next one.
    sims[0].step(1 / 60);
    expect(sims[0].state.players[1].facing).toBe('right');

    for (const n of nets) n.stop();
  });

  it('sends exactly one message per tick, because the channel budget is shared', () => {
    FakeChannel.reset();
    // The intervals are made inside wire(), so the clock has to be fake before then.
    vi.useFakeTimers();
    const { nets } = wire(2, 0);
    const host = (nets[0] as unknown as { opts: { channel: FakeChannel } }).opts.channel;
    const client = (nets[1] as unknown as { opts: { channel: FakeChannel } }).opts.channel;
    host.sent.length = 0;
    client.sent.length = 0;

    vi.advanceTimersByTime(TICK_MS * 10);
    vi.useRealTimers();

    // Ten ticks, one message each. Two per tick would put the host over the 20/s budget.
    expect(host.sent).toHaveLength(10);
    expect(client.sent).toHaveLength(10);
    expect(host.sent.every((m) => m.event === EV_WORLD)).toBe(true);
    expect(client.sent.every((m) => m.event === EV_INPUT)).toBe(true);
    for (const n of nets) n.stop();
  });

  it('carries the effect batch inside the world message', () => {
    FakeChannel.reset();
    const { sims, nets } = wire(2, 0);
    const host = sims[0];
    host.setInput(0, { dir: null, bomb: false, seq: 0 });
    // Walk into the open and drop a bomb so the next world carries a place event.
    for (let i = 0; i < 60; i++) host.step(1 / 60);
    host.place(0);
    const world = (nets[0] as unknown as { opts: { getWorld: () => { fx: unknown[] } } }).opts.getWorld();
    expect(world.fx.some((e) => (e as { t: string }).t === 'place')).toBe(true);
    for (const n of nets) n.stop();
  });

  it('drops a frame older than the one already applied', () => {
    FakeChannel.reset();
    const { sims, nets } = wire(2, 0);
    const client = sims[1];
    const channel = (nets[1] as unknown as { opts: { channel: FakeChannel } }).opts.channel;

    const fresh = makeSim(2);
    fresh.state.round = 7;
    channel.handlers.get(EV_WORLD)?.({ payload: { t: 1000, state: fresh.snapshot(), fx: [] } });
    expect(client.state.round).toBe(7);

    const stale = makeSim(2);
    stale.state.round = 2;
    channel.handlers.get(EV_WORLD)?.({ payload: { t: 500, state: stale.snapshot(), fx: [] } });
    expect(client.state.round).toBe(7);
    for (const n of nets) n.stop();
  });

  it('treats a repeated sequence number as a held key, not a second press', () => {
    FakeChannel.reset();
    const { sims, nets } = wire(2, 0);
    const channel = (nets[0] as unknown as { opts: { channel: FakeChannel } }).opts.channel;
    // Two slots, so a second accepted press is visible on the floor rather than
    // swallowed by the one-bomb quota.
    sims[0].state.players[1].maxBombs = 2;

    channel.handlers.get(EV_INPUT)?.({ payload: { seat: 1, dir: 'right', bomb: true, seq: 5 } });
    const afterFirst = sims[0].state.bombs.length;
    channel.handlers.get(EV_INPUT)?.({ payload: { seat: 1, dir: 'right', bomb: true, seq: 5 } });
    channel.handlers.get(EV_INPUT)?.({ payload: { seat: 1, dir: 'right', bomb: true, seq: 5 } });
    expect(sims[0].state.bombs.length).toBe(afterFirst);

    // Clear the plant cooldown and step off the first bomb, so the only thing left to
    // reject a second press is a sequence number that never changed.
    const p1 = sims[0].state.players[1];
    p1.cool = 0;
    p1.x = 5;
    p1.y = 5;

    channel.handlers.get(EV_INPUT)?.({ payload: { seat: 1, dir: 'right', bomb: true, seq: 6 } });
    expect(sims[0].state.bombs.length).toBeGreaterThan(afterFirst);
    for (const n of nets) n.stop();
  });

  it('keeps the world payload small enough for a shared channel', () => {
    const sim = makeSim(4);
    for (let i = 0; i < 200; i++) sim.step(1 / 60);
    const bytes = new TextEncoder().encode(JSON.stringify(sim.snapshot())).length;
    // Four seats on a 15x11 board must still leave room for the effect batch.
    expect(bytes).toBeLessThan(12_000);
  });
});

describe('character claim', () => {
  it('reaches the host once, and only after the seat is known', () => {
    FakeChannel.reset();
    vi.useFakeTimers();
    const hostSim = makeSim(2);
    const claims = new Map<number, string>();
    const idle: InputState = { dir: null, bomb: false, seq: 0 };
    /* The channel opens before the first room sync lands, so a client can be asked for its
       claim while it still does not know which seat it owns. Sending seat -1 would hand the
       host a claim it cannot apply, and the guest would then never be able to say its pick. */
    let mySeat = -1;

    const host = new BombermanNet({
      channel: new FakeChannel('claim') as unknown as RealtimeChannel,
      isHost: () => true,
      localSeat: () => 0,
      getInput: () => idle,
      getWorld: () => ({ t: performance.now(), state: hostSim.snapshot(), fx: [] }),
      onInput: () => undefined,
      onWorld: () => undefined,
      onChar: (seat, charId) => claims.set(seat, charId),
    });
    const clientChannel = new FakeChannel('claim');
    const client = new BombermanNet({
      channel: clientChannel as unknown as RealtimeChannel,
      isHost: () => false,
      localSeat: () => mySeat,
      getInput: () => idle,
      getWorld: () => ({ t: 0, state: hostSim.snapshot(), fx: [] }),
      getCharClaim: () => (mySeat < 0 ? null : { seat: mySeat, charId: 'sekrup' }),
      onInput: () => undefined,
      onWorld: () => undefined,
    });
    host.start();
    client.start();

    vi.advanceTimersByTime(TICK_MS * 3);
    expect(claims.size).toBe(0);
    expect(clientChannel.sent.some((m) => m.event === EV_CHAR)).toBe(false);
    // An input naming seat -1 is noise the host cannot apply, so it is not worth sending.
    expect(clientChannel.sent.some((m) => m.event === EV_INPUT)).toBe(false);

    mySeat = 1;
    vi.advanceTimersByTime(TICK_MS * 5);
    expect(claims.get(1)).toBe('sekrup');
    // One message for the whole match. Repeating it would spend the shared budget.
    expect(clientChannel.sent.filter((m) => m.event === EV_CHAR)).toHaveLength(1);
    expect(clientChannel.sent.filter((m) => m.event === EV_INPUT).every((m) => (m.payload as { seat: number }).seat === 1)).toBe(true);

    host.stop();
    client.stop();
    vi.useRealTimers();
  });

  it('moves the seat the tab ended up with, not the one it had when the channel opened', () => {
    /* The live bug: the realtime channel joined before the guest's own seat row came back,
       so the net kept a seat of -1 for the whole match. The guest's bomb press still worked,
       because it passes the seat at call time, which is exactly why the symptom read as
       "the host can walk and the guest is stuck". */
    FakeChannel.reset();
    vi.useFakeTimers();
    const hostSim = makeSim(2);
    let mySeat = -1;
    const input: InputState = { dir: 'right', bomb: false, seq: 0 };

    const host = new BombermanNet({
      channel: new FakeChannel('seat') as unknown as RealtimeChannel,
      isHost: () => true,
      localSeat: () => 0,
      getInput: () => input,
      getWorld: () => ({ t: performance.now(), state: hostSim.snapshot(), fx: [] }),
      onInput: (seat, next) => hostSim.setInput(seat, next),
      onWorld: () => undefined,
    });
    const client = new BombermanNet({
      channel: new FakeChannel('seat') as unknown as RealtimeChannel,
      isHost: () => false,
      localSeat: () => mySeat,
      getInput: () => input,
      getWorld: () => ({ t: 0, state: hostSim.snapshot(), fx: [] }),
      onInput: () => undefined,
      onWorld: () => undefined,
    });
    host.start();
    client.start();

    vi.advanceTimersByTime(TICK_MS * 4);
    mySeat = 1;
    vi.advanceTimersByTime(TICK_MS * 4);
    for (let i = 0; i < 40; i++) hostSim.step(1 / 60);

    expect(hostSim.state.players[1].facing).toBe('right');
    expect(hostSim.state.players[1].x).toBeGreaterThan(1);

    host.stop();
    client.stop();
    vi.useRealTimers();
  });

  it('drops a claim that cannot name a seat and a character', () => {
    expect(encodeChar({ seat: 1, charId: 'robo' })).toEqual({ seat: 1, charId: 'robo' });
    expect(encodeChar({ seat: -1, charId: 'robo' })).toBeNull();
    expect(encodeChar({ seat: 1, charId: '' })).toBeNull();
    expect(encodeChar(null)).toBeNull();
    expect(encodeChar({ seat: Number.NaN, charId: 'robo' })).toBeNull();
    expect(encodeChar({ seat: 1, charId: 'x'.repeat(80) })?.charId).toHaveLength(16);
  });
});

/**
 * A broadcast that throws is the same fact the player needs to know as one that answers
 * 'timedOut': the message never left this tab. The notice path exists already, so these
 * hold the error path to it.
 */
describe('broadcast that throws', () => {
  class FlakyChannel {
    mode: 'timeout' | 'throw' = 'timeout';
    handlers = new Map<string, (msg: { payload: unknown }) => void>();

    on(_type: string, opts: { event: string }, cb: (msg: { payload: unknown }) => void): this {
      this.handlers.set(opts.event, cb);
      return this;
    }

    send(): Promise<string> {
      if (this.mode === 'throw') throw new Error('websocket is not open');
      return Promise.resolve('timedOut');
    }
  }

  function client(channel: FlakyChannel, onDrop: (n: number) => void): BombermanNet {
    const sim = makeSim(2);
    const idle: InputState = { dir: null, bomb: false, seq: 0 };
    return new BombermanNet({
      channel: channel as unknown as RealtimeChannel,
      isHost: () => false,
      localSeat: () => 1,
      getInput: () => idle,
      getWorld: () => ({ t: 0, state: sim.snapshot(), fx: [] }),
      onInput: () => undefined,
      onWorld: () => undefined,
      onDrop,
    });
  }

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it('counts a send that throws as a dropped message', () => {
    const seen: number[] = [];
    const channel = new FlakyChannel();
    channel.mode = 'throw';
    const net = client(channel, (n) => seen.push(n));
    net.sendPress(1, null, 1);
    expect(seen).toEqual([1]);
  });

  it('keeps counting after a slow link already reached the notice threshold', async () => {
    /* The shared warning flag is what makes this its own case: once 20 timeouts had been
       reported, the throw path answered nothing at all, so a socket that dies outright
       stayed invisible to the player it froze. */
    const seen: number[] = [];
    const channel = new FlakyChannel();
    const net = client(channel, (n) => seen.push(n));

    for (let i = 0; i < 20; i++) net.sendPress(1, null, i + 1);
    await flush();
    expect(seen).toHaveLength(20);

    channel.mode = 'throw';
    net.sendPress(1, null, 21);
    expect(seen).toHaveLength(21);
    expect(seen[20]).toBe(21);
  });
});
