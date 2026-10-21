// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { mintRoomTicket } from '@/lib/transport';

const ticket = {
  ticket: 'stub-ticket',
  playerId: 'a'.repeat(32),
  seat: 0,
  name: 'A',
  game: 'bomberman',
  exp: 0,
};

const fakeFetch = (seen: string[]): typeof fetch => async (input) => {
  seen.push(String(input));
  return new Response(JSON.stringify(ticket), { status: 200, headers: { 'content-type': 'application/json' } });
};

/**
 * The Worker caches the room settings from the first mint. A flag that never reaches that
 * request is a mode the server cannot play, no matter what the invite URL says.
 */
describe('door ticket mint', () => {
  it('sends the board and the team flag with the first mint', async () => {
    vi.stubEnv('VITE_CF_ROOMS_URL', 'https://rooms.example');
    const seen: string[] = [];

    await mintRoomTicket('ABCD', 'bomberman', 'A', undefined, fakeFetch(seen), {
      seats: 4,
      size: 'luas',
      teams: true,
    });

    const query = new URL(seen[0]).searchParams;
    expect(query.get('seats')).toBe('4');
    expect(query.get('size')).toBe('luas');
    expect(query.get('teams')).toBe('1');
  });

  it('leaves the team flag out when the room is free-for-all', async () => {
    vi.stubEnv('VITE_CF_ROOMS_URL', 'https://rooms.example');
    const seen: string[] = [];

    await mintRoomTicket('ABCD', 'bomberman', 'A', undefined, fakeFetch(seen), {
      seats: 4,
      size: 'kecil',
      teams: false,
    });

    expect(new URL(seen[0]).searchParams.get('teams')).toBeNull();
  });
});
