import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArenaServerNet } from '@/games/slap-arena/engine/serverNet';
import { TICK_MS } from '@/games/slap-arena/engine/net';
import type { InputState, SimEvent, WorldSnapshot } from '@/games/slap-arena/engine/types';

const world = (over: Partial<WorldSnapshot> = {}): WorldSnapshot =>
  ({
    phase: 'BATTLE',
    round: 1,
    scoreToWin: 3,
    winnerId: null,
    matchWinnerId: null,
    countdown: 0,
    players: [],
    ...over,
  }) as unknown as WorldSnapshot;

/** Socket palsu: cukup untuk membuktikan apa yang dikirim dan apa yang dilakukan saat diterima. */
class FakeSocket {
  static last: FakeSocket | null = null;
  sent: string[] = [];
  handlers = { open: [] as (() => void)[], message: [] as ((e: { data: string }) => void)[], close: [] as ((e: { code: number }) => void)[], error: [] as (() => void)[] };
  readyState = 1;

  constructor(public url: string) {
    FakeSocket.last = this;
  }

  /** Dibuka seketika saat handler dipasang: microtask tidak jalan di dalam fake timers. */
  set onopen(cb: () => void) {
    this.handlers.open.push(cb);
    cb();
  }

  set onmessage(cb: (e: { data: string }) => void) {
    this.handlers.message.push(cb);
  }

  set onclose(cb: (e: { code: number }) => void) {
    this.handlers.close.push(cb);
  }

  set onerror(cb: () => void) {
    this.handlers.error.push(cb);
  }

  addEventListener() {}

  send(text: string) {
    this.sent.push(text);
  }

  close() {
    this.readyState = 3;
    this.handlers.close.forEach((h) => h({ code: 1000 }));
  }

  emitMessage(obj: unknown) {
    this.handlers.message.forEach((h) => h({ data: JSON.stringify(obj) }));
  }

  /** Teks mentah, untuk membuktikan jalur JSON yang rusak. */
  emitRaw(text: string) {
    this.handlers.message.forEach((h) => h({ data: text }));
  }

  parsed() {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

const fakeSocket = FakeSocket as unknown as typeof WebSocket;

const makeNet = (input: () => InputState) => {
  const welcome: unknown[] = [];
  const worlds: WorldSnapshot[] = [];
  const fx: SimEvent[][] = [];
  const link: [string, string?][] = [];
  const net = new ArenaServerNet({
    wsUrl: 'ws://door.test/room/ABC123/ws?ticket=t',
    getInput: input,
    onWelcome: (w) => welcome.push(w),
    onWorld: (w) => worlds.push(w),
    onFx: (f) => fx.push(f),
    onLink: (state, detail) => link.push([state, detail]),
    socket: fakeSocket,
  });
  return { net, welcome, worlds, fx, link };
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.last = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ArenaServerNet kirim', () => {
  it('naik nomor setiap tick supaya gerak tidak dianggap replay', () => {
    let x = 0;
    const { net } = makeNet(() => ({ x, z: 0, slap: false, dash: false, held: false, charge: 0 }) as InputState);
    net.start();
    vi.advanceTimersByTime(TICK_MS * 4);
    x = 0.5;
    vi.advanceTimersByTime(TICK_MS * 2);
    const seqs = (FakeSocket.last?.parsed() ?? []).map((m) => m.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FakeSocket.last?.parsed()[5]).toMatchObject({ t: 'input', input: { x: 0.5 } });
    net.stop();
  });

  it('slap dan dash hanya sekali per tekanan, bukan setiap tick', () => {
    let pressed = false;
    const { net } = makeNet(() => ({ x: 0, z: 0, slap: pressed, dash: pressed, held: false, charge: 0 }) as InputState);
    net.start();
    vi.advanceTimersByTime(TICK_MS);
    pressed = true;
    vi.advanceTimersByTime(TICK_MS * 3);
    const flags = (FakeSocket.last?.parsed() ?? []).map((m) => (m.input as Record<string, unknown>).slap);
    expect(flags).toEqual([false, true, false, false]);
    const dash = (FakeSocket.last?.parsed() ?? []).map((m) => (m.input as Record<string, unknown>).dash);
    expect(dash).toEqual([false, true, false, false]);
    net.stop();
  });

  it('held dan charge ikut terkirim terus karena dipakai pengisian slap', () => {
    const { net } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false, held: true, charge: 0.6 }) as InputState);
    net.start();
    vi.advanceTimersByTime(TICK_MS * 2);
    expect(FakeSocket.last?.parsed()[1]).toMatchObject({ input: { held: true, charge: 0.6 } });
    net.stop();
  });

  it('menyimpan aksi lorong apa adanya: start dan nextRound', () => {
    const { net } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false }) as InputState);
    net.start();
    net.sendStart();
    net.sendNextRound();
    const sent = FakeSocket.last?.parsed() ?? [];
    expect(sent[0]).toEqual({ t: 'start' });
    expect(sent[1]).toEqual({ t: 'nextRound' });
    net.stop();
  });
});

describe('ArenaServerNet terima', () => {
  it('welcome, dunia, dan efek diteruskan ke pemanggil', () => {
    const { net, welcome, worlds, fx, link } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false }) as InputState);
    net.start();
    vi.advanceTimersByTime(1);
    expect(link[0]?.[0]).toBe('up');
    const socket = FakeSocket.last!;
    socket.emitMessage({ t: 'welcome', id: 'aa', seat: 0, name: 'A', master: 'aa', players: [], exp: 9 });
    socket.emitMessage({ t: 'state', phase: 'playing', master: 'aa', tick: 12, players: [], world: world({ round: 2 }), applied: { 0: 3 }, held: { 0: 20 }, fx: [] });
    socket.emitMessage({ t: 'state', phase: 'playing', master: 'aa', tick: 13, players: [], world: world(), applied: {}, held: {}, fx: [{ kind: 'roundStart', round: 2 }] });
    expect(welcome).toHaveLength(1);
    expect(worlds.map((w) => w.round)).toEqual([2, 1]);
    expect(fx).toEqual([[{ kind: 'roundStart', round: 2 }]]);
    expect(net.stats.lastTick).toBe(13);
    net.stop();
  });

  it('state tanpa dunia atau dengan world null tidak memanggil onWorld', () => {
    const { net, worlds } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false }) as InputState);
    net.start();
    const socket = FakeSocket.last!;
    socket.emitMessage({ t: 'state', phase: 'lobby', master: null, tick: 1, players: [], world: null, applied: {}, held: {}, fx: [] });
    socket.emitMessage({ t: 'state', phase: 'lobby', master: null, tick: 2, players: [], world: { nope: true }, applied: {}, held: {}, fx: [] });
    expect(worlds).toHaveLength(0);
    net.stop();
  });

  it('alasan penolakan pintu tercatat, tidak dilempar', () => {
    const { net, worlds } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false }) as InputState);
    net.start();
    const socket = FakeSocket.last!;
    socket.emitMessage({ t: 'error', reason: 'duplicate_seq' });
    socket.emitMessage({ t: 'error' });
    socket.emitRaw('bukan json');
    expect(net.stats.lastError).toBe('bad-json');
    expect(worlds).toHaveLength(0);
    net.stop();
  });

  it('kode close ikut dilaporkan dan tick berhenti', () => {
    const { net, link } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false }) as InputState);
    net.start();
    const socket = FakeSocket.last!;
    socket.readyState = 3;
    socket.handlers.close.forEach((h) => h({ code: 4001 }));
    expect(link.at(-1)).toEqual(['down', 'close-4001']);
    const before = socket.sent.length;
    vi.advanceTimersByTime(TICK_MS * 3);
    expect(socket.sent.length).toBe(before);
    net.stop();
  });

  it('aksi saat socket belum siap dihitung sebagai drop, bukan hilang diam-diam', () => {
    const { net } = makeNet(() => ({ x: 0, z: 0, slap: false, dash: false }) as InputState);
    net.start();
    FakeSocket.last!.readyState = 0;
    net.sendStart();
    net.sendStart();
    expect(net.stats.drop).toBe(2);
    expect(FakeSocket.last!.sent).toHaveLength(0);
    net.stop();
  });
});
