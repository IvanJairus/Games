import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BombermanServerNet,
  parseDoorConfig,
  type DoorState,
  type DoorWelcome,
} from '@/games/bomberman/engine/serverNet';
import { BombermanSim } from '@/games/bomberman/engine/sim';
import type { Facing } from '@/games/bomberman/engine/types';

const makeWorld = () =>
  new BombermanSim({
    seats: 2,
    seed: 'door-seed',
    floor: 'grass',
    players: [
      { seat: 0, name: 'A', charId: 'robo', bot: false },
      { seat: 1, name: 'B', charId: 'tupai', bot: false },
    ],
    phase: 'battle',
  }).snapshot();

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  /** A drop the client did not ask for. */
  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
});

const sockets = () => FakeSocket.instances;

function door(options: { dir?: () => Facing | null; reconnect?: () => Promise<string> } = {}) {
  const welcome: DoorWelcome[] = [];
  const worlds: unknown[] = [];
  const metas: unknown[] = [];
  const fx: unknown[] = [];
  const links: { state: string; detail?: string }[] = [];
  let dir: Facing | null = options.dir?.() ?? null;
  const net = new BombermanServerNet({
    wsUrl: 'wss://rooms.example/room/ABCD/ws?ticket=one',
    getDir: () => dir,
    onWelcome: (info) => welcome.push(info),
    onWorld: (world) => worlds.push(world),
    onMeta: (meta) => metas.push(meta),
    onFx: (events) => fx.push(events),
    onLink: (state, detail) => links.push({ state, detail }),
    reconnect: options.reconnect,
    socket: FakeSocket as unknown as typeof WebSocket,
  });
  return {
    net,
    welcome,
    worlds,
    metas,
    fx,
    links,
    setDir: (next: Facing | null) => {
      dir = next;
    },
  };
}

const welcome = (over: Partial<DoorWelcome> = {}): DoorWelcome => ({
  t: 'welcome',
  id: 'a'.repeat(32),
  seat: 1,
  name: 'Bomber',
  master: 'b'.repeat(32),
  players: [{ id: 'a'.repeat(32), name: 'Bomber', seat: 1 }],
  exp: 9999999999,
  config: { seats: 2, size: 'kecil' },
  ...over,
});

const state = (over: Partial<DoorState> = {}): DoorState => ({
  t: 'state',
  phase: 'playing',
  master: 'b'.repeat(32),
  tick: 10,
  players: [{ id: 'a'.repeat(32), name: 'Bomber', seat: 1 }],
  world: makeWorld(),
  applied: { 1: 4 },
  held: { 1: 0 },
  fx: [],
  ...over,
});

describe('door welcome and config', () => {
  it('parses only a complete board config', () => {
    expect(parseDoorConfig({ seats: 2, size: 'besar' })).toEqual({ seats: 2, size: 'besar' });
    expect(parseDoorConfig({ seats: 3, size: 'kecil' })).toBeNull();
    expect(parseDoorConfig({ seats: 2, size: 'raksasa' })).toBeNull();
    expect(parseDoorConfig(null)).toBeNull();
  });

  it('records the seat and sends the character claim it was waiting for', () => {
    const d = door();
    d.net.start();
    const socket = sockets().at(-1)!;
    socket.open();
    socket.receive(welcome());

    expect(d.welcome).toHaveLength(1);
    expect(d.net.seat).toBe(1);
    expect(d.links[0]).toEqual({ state: 'up', detail: undefined });

    d.net.sendChar('radar');
    expect(socket.sent.map((m) => JSON.parse(m))).toContainEqual({ t: 'char', charId: 'radar' });
    d.net.stop();
  });
});

describe('input traffic', () => {
  it('sends the held direction once, not once per sample', () => {
    const d = door();
    d.net.start();
    const socket = sockets().at(-1)!;
    socket.open();
    // The open handshake says "no direction" once.
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toMatchObject({ t: 'input', seq: 1, dir: null, bomb: false });

    d.setDir('left');
    d.net.flush();
    d.net.flush();
    d.net.flush();
    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1])).toMatchObject({ dir: 'left', bomb: false });

    d.setDir(null);
    d.net.flush();
    expect(JSON.parse(socket.sent[2])).toMatchObject({ dir: null, bomb: false });
    expect(socket.sent.map((m) => JSON.parse(m).seq)).toEqual([1, 2, 3]);
    d.net.stop();
  });

  it('warps a bomb press immediately, with the current direction', () => {
    const d = door({ dir: () => 'up' as Facing });
    d.net.start();
    const socket = sockets().at(-1)!;
    socket.open();
    d.net.sendPress();
    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1])).toMatchObject({ t: 'input', seq: 2, dir: 'up', bomb: true });
    d.net.stop();
  });

  it('does not count a send on a closed socket as traffic that reached the room', () => {
    const d = door();
    d.net.start();
    const socket = sockets().at(-1)!;
    d.net.flush(true);
    expect(d.net.stats.sent).toBe(0);
    expect(d.net.stats.drop).toBe(1);
    socket.open();
    // onopen sends the initial direction once; the explicit flush has nothing new to say.
    d.net.flush();
    expect(d.net.stats.sent).toBe(1);
    d.net.stop();
  });
});

describe('world frames', () => {
  it('forwards the world, meta, and effect batch', () => {
    const d = door();
    d.net.start();
    const socket = sockets().at(-1)!;
    socket.open();
    socket.receive(state({ fx: [{ t: 'boom', x: 1, y: 1, range: 2 }] }));

    expect(d.worlds).toHaveLength(1);
    expect(d.metas).toEqual([{ master: 'b'.repeat(32), phase: 'playing', players: [{ id: 'a'.repeat(32), name: 'Bomber', seat: 1 }], tick: 10 }]);
    expect(d.fx).toEqual([[{ t: 'boom', x: 1, y: 1, range: 2 }]]);
    expect(d.net.stats.lastTick).toBe(10);
    d.net.stop();
  });

  it('keeps lobby frames useful even when the world is null', () => {
    const d = door();
    d.net.start();
    const socket = sockets().at(-1)!;
    socket.open();
    socket.receive(state({ phase: 'lobby', world: null }));
    expect(d.worlds).toHaveLength(0);
    expect(d.metas.at(-1)).toMatchObject({ phase: 'lobby' });
    d.net.stop();
  });

  it('refuses a world that is not shaped like a board', () => {
    const d = door();
    d.net.start();
    const socket = sockets().at(-1)!;
    socket.open();
    socket.receive(state({ world: { players: 'nope' } as never }));
    expect(d.worlds).toHaveLength(0);
    d.net.stop();
  });
});

describe('reconnect', () => {
  it('asks for a fresh ticket after an abnormal close', async () => {
    vi.useFakeTimers();
    try {
      const reconnect = vi.fn(async () => 'wss://rooms.example/room/ABCD/ws?ticket=two');
      const d = door({ reconnect });
      d.net.start();
      const first = sockets().at(-1)!;
      first.open();
      first.serverClose(1006);
      expect(reconnect).not.toHaveBeenCalled();
      expect(d.links.at(-1)).toEqual({ state: 'down', detail: 'retrying' });

      await vi.advanceTimersByTimeAsync(400);
      expect(reconnect).toHaveBeenCalledTimes(1);
      const second = sockets().at(-1)!;
      expect(second).not.toBe(first);
      expect(second.url).toContain('ticket=two');
      second.open();
      expect(d.net.stats.reconnects).toBe(1);
      d.net.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never retries a door the server closed on purpose', () => {
    vi.useFakeTimers();
    try {
      const reconnect = vi.fn(async () => 'wss://elsewhere');
      const d = door({ reconnect });
      d.net.start();
      const first = sockets().at(-1)!;
      first.open();
      first.serverClose(4001);
      vi.advanceTimersByTime(5000);
      expect(reconnect).not.toHaveBeenCalled();
      expect(sockets()).toHaveLength(1);
      expect(d.links.at(-1)).toEqual({ state: 'down', detail: 'close-4001' });
      d.net.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the configured number of retries', async () => {
    vi.useFakeTimers();
    try {
      const reconnect = vi.fn(async () => 'wss://rooms.example/again');
      const d = door({ reconnect });
      d.net.start();
      // A socket that never opens is the case the retry budget exists for: a successful
      // open resets the budget on purpose, so `open()` must not be called here.
      for (let i = 0; i <= 4; i += 1) {
        const socket = sockets().at(-1)!;
        socket.serverClose(1006);
        await vi.advanceTimersByTimeAsync(8000);
      }
      expect(d.links.at(-1)).toEqual({ state: 'down', detail: 'give-up' });
      d.net.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
