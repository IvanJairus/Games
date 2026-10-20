/**
 * Saklar transport realtime. Dibaca dari env build, jadi memindahkan satu game ke Worker berarti
 * build ulang, bukan membalik flag di produksi. Defaultnya `supabase` dan jalur Broadcast lama
 * sengaja tidak dihapus sampai dua game real-time selesai di-soak di kedua pintu.
 */
export type Transport = 'supabase' | 'cloudflare';

export const activeTransport = (): Transport =>
  import.meta.env.VITE_TRANSPORT === 'cloudflare' ? 'cloudflare' : 'supabase';

/** URL Worker, misalnya https://ij-game-rooms.<account>.workers.dev. Tanpa slash di ujung. */
export const roomsBaseUrl = (): string =>
  ((import.meta.env.VITE_CF_ROOMS_URL as string | undefined) ?? '').replace(/\/+$/, '');

export interface RoomTicket {
  ticket: string;
  playerId: string;
  seat: number;
  name: string;
  game: string;
  exp: number;
}

/**
 * Kursi selalu dialokasikan Worker, tidak pernah dipilih klien. Kegagalan di sini berarti kamar
 * belum siap dipakai: tanpa tiket, handshake WebSocket akan ditolak 401.
 */
export async function mintRoomTicket(
  code: string,
  game: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RoomTicket> {
  const base = roomsBaseUrl();
  if (!base) throw new Error('VITE_CF_ROOMS_URL belum diisi');
  const url = `${base}/room/${encodeURIComponent(code)}/ticket?game=${encodeURIComponent(game)}&name=${encodeURIComponent(name)}`;
  const res = await fetchImpl(url, { method: 'POST' });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`tiket kamar ditolak ${res.status} ${detail}`.trim());
  }
  return (await res.json()) as RoomTicket;
}

/** http/https ke ws/wss, supaya satu env dipakai bersama oleh tiket dan socket. */
export const socketUrl = (baseUrl: string, code: string, ticket: string): string => {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/room/${encodeURIComponent(code)}/ws`;
  url.search = `?ticket=${encodeURIComponent(ticket)}`;
  return url.toString();
};

const DOOR_ID_KEY = 'ij_door_player_id';

/**
 * Id kursi di Worker, 128 bit heks. Dibuat di sini dan disimpan supaya reconnect memakai kursi yang
 * sama. Id sesi Supabase tidak dipakai: ruangnya hanya 32 bit, dan Worker memakai id kursi untuk
 * klaim ulang, jadi id yang mudah ditebak membuka lagi celah merebut kursi orang lain.
 */
export const getOrCreateDoorId = (): string => {
  const random = (): string => crypto.randomUUID().replace(/-/g, '');
  try {
    const stored = window.localStorage.getItem(DOOR_ID_KEY);
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
    const fresh = random();
    window.localStorage.setItem(DOOR_ID_KEY, fresh);
    return fresh;
  } catch {
    return random();
  }
};
