// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { ArenaServerNet } from '@/games/slap-arena/engine/serverNet';
import { mintRoomTicket, socketUrl } from '@/lib/transport';
import type { InputState, WorldSnapshot } from '@/games/slap-arena/engine/types';

/**
 * Test nyata terhadap Worker yang ter-deploy, tanpa browser dan tanpa Supabase: yang dibuktikan di
 * sini adalah kode klien yang shipped bertemu server sungguhan.
 *
 * Hanya jalan kalau RUN_LIVE_WS=1, karena CI tidak boleh bergantung pada jaringan luar. Angka di
 * badan PR berasal dari satu rangkaian (n = 1) pada saat yang ditulis.
 */
const BASE = (process.env.LIVE_WS_URL ?? 'https://ij-game-rooms.filemonivanjairus.workers.dev').replace(/\/+$/, '');
const live = process.env.RUN_LIVE_WS === '1';
const code = `CL${Date.now().toString(36).slice(-6).toUpperCase()}`;

/**
 * Browser selalu mengirim Origin sendiri. Node tidak, untuk fetch maupun WebSocket, jadi keduanya
 * dibantu di sini; tanpa itu allowlist Worker menolak permintaan sebelum tiket sempat diperiksa.
 */
/** tipe DOM tidak mengenal opsi headers; undici WebSocket memang mendukungnya. */
const UndiciSocket = WebSocket as unknown as new (url: string | URL, opts: { headers: Record<string, string> }) => WebSocket;
class OriginSocket {
  static [Symbol.hasInstance](v: unknown) {
    return v instanceof WebSocket;
  }
  constructor(url: string | URL) {
    return new UndiciSocket(url, { headers: { origin: BASE } });
  }
}

const originFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, headers: { ...(init?.headers ?? {}), origin: BASE } });

const idle = (): InputState => ({ x: 0, z: 0, slap: false, dash: false, held: false, charge: 0 }) as InputState;

const openNet = async (ticket: string) => {
  const seen: { welcomes: unknown[]; worlds: WorldSnapshot[]; fx: unknown[][]; link: [string, string?][] } = {
    welcomes: [],
    worlds: [],
    fx: [],
    link: [],
  };
  const net = new ArenaServerNet({
    wsUrl: socketUrl(BASE, code, ticket),
    getInput: idle,
    onWelcome: (w) => seen.welcomes.push(w),
    onWorld: (w) => seen.worlds.push(w),
    onFx: (f) => seen.fx.push(f),
    onLink: (state, detail) => seen.link.push([state, detail]),
    socket: OriginSocket as unknown as typeof WebSocket,
  });
  net.start();
  return { net, seen };
};

/** diagnostics dipanggil saat batas waktu habis, supaya kegagalan jaringan tidak dibaca sebagai cacat. */
const waitFor = async (pred: () => boolean, ms = 15000, label = 'kondisi', diagnostics = () => '') => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`tidak mencapai ${label} dalam ${ms} ms | ${diagnostics()}`);
};

describe.skipIf(!live)('pintu klien terhadap Worker tayang', () => {
  it('tiket, handshake, dunia, dan efek benar-benar lewat', async () => {
    vi.stubEnv('VITE_CF_ROOMS_URL', BASE);
    const a = await mintRoomTicket(code, 'slap-arena', 'Ama', originFetch);
    const b = await mintRoomTicket(code, 'slap-arena', 'Bla', originFetch);
    expect([a.seat, b.seat]).toEqual([0, 1]);
    expect(a.playerId).toMatch(/^[0-9a-f]{32}$/);

    const master = await openNet(a.ticket);
    const other = await openNet(b.ticket);
    await waitFor(() => master.seen.welcomes.length > 0, 15000, 'welcome master');
    const welcome = master.seen.welcomes[0] as { id: string; seat: number; master: string | null };
    expect(welcome.id).toBe(a.playerId);
    expect(welcome.master).toBe(a.playerId);
    await waitFor(
      () => master.seen.worlds.some((w) => w.players.length === 2),
      15000,
      'dunia berisi dua kursi',
      () =>
        `master worlds=${JSON.stringify(master.seen.worlds.map((w) => w.players.length))} ` +
        `masterLink=${JSON.stringify(master.seen.link)} otherLink=${JSON.stringify(other.seen.link)} ` +
        `otherWelcomes=${other.seen.welcomes.length} otherWorlds=${other.seen.worlds.length}`,
    );

    master.net.sendStart();
    await waitFor(() => master.seen.worlds.some((w) => w.phase !== 'WAITING'), 15000, 'fase bergerak dari WAITING');
    await waitFor(() => master.seen.fx.some((batch) => batch.some((e) => (e as { kind?: string }).kind === 'roundStart')), 15000, 'event ronde dari server');

    const tickOf = (list: typeof master.seen.worlds) => list.length;
    expect(tickOf(master.seen.worlds)).toBeGreaterThan(3);
    expect(master.net.stats.received).toBeGreaterThan(3);
    expect(other.seen.worlds.length).toBeGreaterThan(3);
    expect(master.seen.link[0]?.[0]).toBe('up');

    master.net.stop();
    other.net.stop();
    vi.unstubAllEnvs();
  }, 45000);

  /**
   * Dengan Origin yang benar, satu-satunya alasan Worker menolak handshake adalah tiket itu sendiri
   * (401). Kode close yang terlihat di sisi klien adalah 1006 karena WebSocket tidak exposes status
   * handshake, jadi yang diuji di sini perilaku klien: penolakan harus menjadi link turun, bukan
   * exception, dan tidak ada dunia yang diterima.
   */
  it('koneksi yang ditolak server dilaporkan sebagai link turun, bukan exception', async () => {
    const link: [string, string?][] = [];
    const worlds: WorldSnapshot[] = [];
    const net = new ArenaServerNet({
      wsUrl: socketUrl(BASE, code, `v1:${code}:00000000000000000000000000000000:slap-arena:9999999999.${'0'.repeat(64)}`),
      getInput: idle,
      onWelcome: () => {},
      onWorld: (w) => worlds.push(w),
      onFx: () => {},
      onLink: (state, detail) => link.push([state, detail]),
      socket: OriginSocket as unknown as typeof WebSocket,
    });
    net.start();
    await waitFor(() => link.some(([s]) => s === 'down'), 15000, 'status down');
    expect(worlds).toHaveLength(0);
    expect(net.stats.received).toBe(0);
    expect(link.at(-1)?.[1]).toMatch(/^close-/);
    net.stop();
  }, 45000);
});
