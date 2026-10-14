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
    });
  });
});
