import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRoomCode } from '../../src/games/common/multiplayer';
import {
  isSupabaseConfigured,
  getPlayerSessionId,
  getStoredPlayerName,
  setStoredPlayerName,
} from '../../src/lib/supabase';

describe('Multiplayer Core Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateRoomCode', () => {
    it('generates a 6-character room code', () => {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(typeof code).toBe('string');
    });

    it('generates uppercase characters without ambiguous letters', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(/^[A-Z2-9]{6}$/);
        expect(code).not.toContain('O');
        expect(code).not.toContain('0');
        expect(code).not.toContain('I');
        expect(code).not.toContain('1');
      }
    });

    it('generates randomized room codes across repeated invocations', () => {
      const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
      expect(codes.size).toBeGreaterThanOrEqual(48);
    });
  });

  describe('Supabase Client Helpers', () => {
    it('reports Supabase configuration status accurately', () => {
      const configured = isSupabaseConfigured();
      expect(typeof configured).toBe('boolean');
    });

    it('generates and persists player session ID', () => {
      const id1 = getPlayerSessionId();
      expect(id1).toMatch(/^p_/);
      const id2 = getPlayerSessionId();
      expect(id1).toBe(id2);
    });

    it('handles player name storage safely', () => {
      setStoredPlayerName('Ksatria Emas');
      expect(getStoredPlayerName()).toBe('Ksatria Emas');
    });
  });

  describe('leaveOnlineMatch', () => {
    it('marks match as abandoned when leaving a completed match', async () => {
      const { leaveOnlineMatch } = await import('../../src/games/common/multiplayer');
      const supabaseModule = await import('../../src/lib/supabase');

      const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const deleteMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'test-match-123',
          status: 'completed',
          max_players: 2,
          game_state: { winner: 'O' },
        },
      });

      const channelMock = {
        subscribe: vi.fn().mockResolvedValue({}),
        send: vi.fn(),
      };
      const removeChannelMock = vi.fn().mockResolvedValue({});

      const mockClient: any = {
        from: vi.fn((table: string) => {
          if (table === 'matches') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ single: singleMock }),
              }),
              update: updateMock,
            };
          }
          if (table === 'match_players') {
            return {
              delete: deleteMock,
            };
          }
          return {};
        }),
        channel: vi.fn().mockReturnValue(channelMock),
        removeChannel: removeChannelMock,
      };

      vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(mockClient);

      await leaveOnlineMatch({
        matchId: 'test-match-123',
        roomCode: 'TEST99',
        playerIndex: 1,
        playerName: 'Pemain 176',
      });

      // Verify player deleted from match_players
      expect(deleteMock).toHaveBeenCalled();

      // Verify match marked as abandoned in matches table
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'abandoned',
          game_state: expect.objectContaining({
            abandonedBy: 'Pemain 176',
            abandonedReason: expect.stringContaining('Pemain 176 telah meninggalkan room'),
          }),
        })
      );

      // A throwaway channel must be released, otherwise every exit leaks one realtime channel.
      expect(channelMock.subscribe).toHaveBeenCalled();
      expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
    });

    it('sends through the caller channel without creating or removing one', async () => {
      const { leaveOnlineMatch } = await import('../../src/games/common/multiplayer');
      const supabaseModule = await import('../../src/lib/supabase');

      const singleMock = vi.fn().mockResolvedValue({
        data: { id: 'm1', status: 'waiting', max_players: 2, game_state: {} },
      });
      const callerChannel = { send: vi.fn(), subscribe: vi.fn() };

      vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleMock }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }),
        })),
        channel: vi.fn(),
        removeChannel: vi.fn(),
      } as any);

      await leaveOnlineMatch({
        matchId: 'm1',
        roomCode: 'AAA222',
        playerIndex: 0,
        playerName: 'Host',
        channel: callerChannel as any,
      });

      expect(callerChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'player_left' })
      );
      expect(callerChannel.subscribe).not.toHaveBeenCalled();
    });
  });
});

interface FakeRow {
  id: string;
  room_code: string;
  game_type: string;
  status: string;
  current_turn: number;
  game_state: any;
  winner_index: number | null;
  max_players: number;
  updated_at: string;
}

// The fake mirrors PostgREST: an update with predicates only returns rows that still match them.
function makeFakeSupabase(row: FakeRow) {
  const inserts: { table: string; payload: any }[] = [];
  const matches = {
    update(data: Partial<FakeRow>) {
      const filters: [string, string | number | number[]][] = [];
      const api: any = {
        eq: (col: string, val: string | number) => {
          filters.push([col, val]);
          return api;
        },
        in: (col: string, vals: number[]) => {
          filters.push([col, vals]);
          return api;
        },
        select: () => {
          const matchesAll = filters.every(([col, val]) => {
            const actual = (row as any)[col];
            return Array.isArray(val) ? val.includes(actual) : actual === val;
          });
          if (!matchesAll) return Promise.resolve({ data: [], error: null });
          Object.assign(row, data);
          if ('game_state' in data) row.updated_at = `${row.updated_at}+1`;
          return Promise.resolve({ data: [{ id: row.id }], error: null });
        },
      };
      return api;
    },
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: { current_turn: row.current_turn, status: row.status, updated_at: row.updated_at },
          }),
      }),
    }),
  };

  return {
    row,
    inserts,
    client: {
      from: (table: string) => {
        if (table === 'matches') return matches;
        return {
          insert: (payload: any) => {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      },
      channel: () => ({ subscribe: () => {}, send: () => {} }),
      removeChannel: () => {},
    } as any,
  };
}

const baseRow = (): FakeRow => ({
  id: 'm1',
  room_code: 'AAA111',
  game_type: 'battleship',
  status: 'playing',
  current_turn: 0,
  game_state: { phase: 'BATTLE' },
  winner_index: null,
  max_players: 2,
  updated_at: 'v0',
});

describe('Sync layer concurrency guards', () => {
  it('accepts a move only from the seat holding the turn', async () => {
    const fake = makeFakeSupabase(baseRow());
    const mod = await import('../../src/lib/supabase');
    vi.spyOn(mod, 'getSupabase').mockReturnValue(fake.client);

    const { submitOnlineMove } = await import('../../src/games/common/multiplayer');

    const wrong = await submitOnlineMove({
      matchId: 'm1',
      playerIndex: 1,
      action: 'SHOT',
      nextState: { phase: 'BATTLE', marks: [{}, { 3: 'miss' }] },
      nextTurn: 1,
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.failure).toBe('turn');
    expect(fake.row.game_state.phase).toBe('BATTLE');

    const right = await submitOnlineMove({
      matchId: 'm1',
      playerIndex: 0,
      action: 'SHOT',
      nextState: { phase: 'BATTLE', marks: [{}, { 3: 'miss' }] },
      nextTurn: 1,
    });
    expect(right.ok).toBe(true);
    expect(fake.row.current_turn).toBe(1);
  });

  it('lets exactly one of two simultaneous moves land', async () => {
    const row = baseRow();
    const mod = await import('../../src/lib/supabase');
    const { submitOnlineMove } = await import('../../src/games/common/multiplayer');

    const fakeA = makeFakeSupabase(row);
    const fakeB = makeFakeSupabase(row);
    const spy = vi.spyOn(mod, 'getSupabase');
    let turn = 0;
    spy.mockImplementation(() => (turn++ === 0 ? fakeA.client : fakeB.client));

    // Both clients read the same row version and both believe their move is legal: seat 0 holds
    // the turn, seat 1 would hold it after seat 0 lands. Only the version token tells them apart.
    const version = row.updated_at;

    const results = await Promise.all([
      submitOnlineMove({
        matchId: 'm1',
        playerIndex: 0,
        action: 'SHOT',
        nextState: { by: 'p0' },
        nextTurn: 1,
        basedOn: version,
      }),
      submitOnlineMove({
        matchId: 'm1',
        playerIndex: 1,
        action: 'SHOT',
        nextState: { by: 'p1' },
        nextTurn: 0,
        basedOn: version,
      }),
    ]);

    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    expect(results[1].failure).toBe('stale');
    expect(row.game_state).toEqual({ by: 'p0' });
  });

  it('writes the compact summary instead of the whole state when the caller supplies one', async () => {
    const fake = makeFakeSupabase(baseRow());
    const mod = await import('../../src/lib/supabase');
    vi.spyOn(mod, 'getSupabase').mockReturnValue(fake.client);
    const { submitOnlineMove } = await import('../../src/games/common/multiplayer');

    await submitOnlineMove({
      matchId: 'm1',
      playerIndex: 0,
      action: 'SHOT',
      nextState: { secret: 'never log this', marks: [{}, { 5: 'hit' }] },
      nextTurn: 1,
      moveSummary: { shot: 'F6', result: 'hit' },
    });

    const moveLog = fake.inserts.find((i) => i.table === 'match_moves');
    expect(moveLog?.payload.payload).toEqual({ shot: 'F6', result: 'hit' });
    expect(JSON.stringify(moveLog?.payload)).not.toContain('never log this');
  });

  it('resumes a finished room for the next round without a turn guard', async () => {
    const row = { ...baseRow(), status: 'completed', current_turn: 1 };
    const fake = makeFakeSupabase(row);
    const mod = await import('../../src/lib/supabase');
    vi.spyOn(mod, 'getSupabase').mockReturnValue(fake.client);
    const { submitOnlineMove } = await import('../../src/games/common/multiplayer');

    const blocked = await submitOnlineMove({
      matchId: 'm1',
      playerIndex: 0,
      action: 'NEXT_ROUND',
      nextState: { round: 2 },
      nextTurn: 0,
      newStatus: 'playing',
    });
    expect(blocked.ok).toBe(false);

    const resumed = await submitOnlineMove({
      matchId: 'm1',
      playerIndex: 0,
      action: 'NEXT_ROUND',
      nextState: { round: 2 },
      nextTurn: 0,
      newStatus: 'playing',
      expectTurn: false,
      statusGuard: 'completed',
    });
    expect(resumed.ok).toBe(true);
    expect(row.status).toBe('playing');
  });

  it('starts a match only from the statuses the caller allows', async () => {
    const mod = await import('../../src/lib/supabase');
    const { startOnlineMatch } = await import('../../src/games/common/multiplayer');

    const abandoned = makeFakeSupabase({ ...baseRow(), status: 'abandoned' });
    vi.spyOn(mod, 'getSupabase').mockReturnValue(abandoned.client);
    const restart = await startOnlineMatch('m1', { fresh: true }, ['completed', 'abandoned']);
    expect(restart.ok).toBe(true);
    expect(abandoned.row.status).toBe('playing');

    const waiting = makeFakeSupabase({ ...baseRow(), status: 'waiting' });
    vi.spyOn(mod, 'getSupabase').mockReturnValue(waiting.client);
    const wrongPhase = await startOnlineMatch('m1', { fresh: true }, ['completed']);
    expect(wrongPhase.ok).toBe(false);
    expect(waiting.row.status).toBe('waiting');
  });
});
