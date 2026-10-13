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
});
