import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  applyPresence,
  createPresenceMessage,
  normalizeRoom,
  prunePeers,
  shouldWarnAboutPeers,
  watchRoomPeers,
  PresenceMessage,
} from '@/games/common/roomPresence';

// Transport tiruan: satu hub in-memory yang menyalurkan pesan ke saluran lain kecuali pengirimnya,
// seperti BroadcastChannel asli. Logika presence di bawah diuji terhadapnya.
class FakeChannel {
  static open = new Map<string, Set<FakeChannel>>();
  static sent: PresenceMessage[] = [];
  onmessage: ((event: { data: PresenceMessage }) => void) | null = null;
  closed = false;

  constructor(public name: string) {
    const bucket = FakeChannel.open.get(name) || new Set<FakeChannel>();
    bucket.add(this);
    FakeChannel.open.set(name, bucket);
  }

  postMessage(message: PresenceMessage) {
    FakeChannel.sent.push(message);
    const bucket = FakeChannel.open.get(this.name) || new Set<FakeChannel>();
    for (const peer of bucket) {
      if (peer !== this && !peer.closed && peer.onmessage) {
        queueMicrotask(() => peer.onmessage?.({ data: message }));
      }
    }
  }

  close() {
    this.closed = true;
    FakeChannel.open.get(this.name)?.delete(this);
  }
}

const T0 = 1_000_000;

describe('Room presence protocol', () => {
  it('normalizes the room code the same way the sync layer does', () => {
    expect(normalizeRoom(' abc123 ')).toBe('ABC123');
  });

  it('counts a foreign ping as a peer and answers it, but ignores itself', () => {
    const peers = new Map<string, number>();

    expect(applyPresence(peers, 'self', createPresenceMessage('ping', 'self', 'ABC123'), T0)).toBe(false);
    expect(peers.size).toBe(0);

    const needsAnswer = applyPresence(peers, 'self', createPresenceMessage('ping', 'other', 'ABC123'), T0);
    expect(needsAnswer).toBe(true);
    expect(peers.get('other')).toBe(T0);

    expect(applyPresence(peers, 'self', createPresenceMessage('pong', 'third', 'ABC123'), T0)).toBe(false);
    expect(peers.size).toBe(2);
  });

  it('drops a peer that says goodbye and one that went quiet', () => {
    const peers = new Map<string, number>([['a', T0], ['b', T0]]);

    applyPresence(peers, 'self', createPresenceMessage('bye', 'a', 'ABC123'), T0 + 500);
    expect(peers.has('a')).toBe(false);

    expect(prunePeers(peers, T0 + 5_000)).toBe(1);
    expect(prunePeers(peers, T0 + 61_000)).toBe(0);
  });

  it('ignores malformed messages instead of trusting them', () => {
    const peers = new Map<string, number>();
    expect(applyPresence(peers, 'self', null, T0)).toBe(false);
    expect(applyPresence(peers, 'self', { kind: 'ping', id: 42, room: 'X' } as never, T0)).toBe(false);
    expect(peers.size).toBe(0);
  });

  it('only warns when at least one other window is present', () => {
    expect(shouldWarnAboutPeers(0)).toBe(false);
    expect(shouldWarnAboutPeers(1)).toBe(true);
  });

  describe('watchRoomPeers with a fake transport', () => {
    beforeEach(() => {
      FakeChannel.sent = [];
      FakeChannel.open.clear();
      vi.stubGlobal('BroadcastChannel', FakeChannel);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('announces itself on start and on every heartbeat', () => {
      const seen: number[] = [];
      const stop = watchRoomPeers('abc123', (n) => seen.push(n));

      expect(FakeChannel.sent[0]).toMatchObject({ kind: 'ping', room: 'ABC123' });

      vi.advanceTimersByTime(4000);
      const pings = FakeChannel.sent.filter((m) => m.kind === 'ping');
      expect(pings.length).toBeGreaterThanOrEqual(3);

      stop();
      expect(FakeChannel.sent[FakeChannel.sent.length - 1].kind).toBe('bye');
    });

    it('warns when a second window joins the same room and clears when it leaves', async () => {
      const countsA: number[] = [];
      const countsB: number[] = [];

      const stopA = watchRoomPeers('QQ7WZZ', (n) => countsA.push(n));
      await vi.advanceTimersByTimeAsync(0);

      const stopB = watchRoomPeers('qq7wzz', (n) => countsB.push(n));
      await vi.advanceTimersByTimeAsync(10);

      expect(countsA[countsA.length - 1]).toBe(1);
      expect(countsB[countsB.length - 1]).toBe(1);

      stopB();
      await vi.advanceTimersByTimeAsync(10);
      expect(countsA[countsA.length - 1]).toBe(0);

      stopA();
    });

    it('does not warn about a window in a different room', async () => {
      const counts: number[] = [];
      const stopA = watchRoomPeers('AAA111', (n) => counts.push(n));
      const stopB = watchRoomPeers('BBB222', (n) => counts.push(n));
      await vi.advanceTimersByTimeAsync(50);

      expect(counts.every((c) => c === 0)).toBe(true);

      stopA();
      stopB();
    });

    it('becomes a no-op when the browser has no BroadcastChannel', () => {
      vi.unstubAllGlobals();
      const spy = vi.fn();
      expect(watchRoomPeers('ABC123', spy)).toBeTypeOf('function');
    });

    it('refuses an empty room code', () => {
      const spy = vi.fn();
      expect(watchRoomPeers('   ', spy)).toBeTypeOf('function');
      expect(FakeChannel.sent.length).toBe(0);
    });
  });
});
