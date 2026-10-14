import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSafeStorage } from './storage';
import { randomHex } from './random';

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseUrl = rawUrl?.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('<ref>') &&
    !supabaseAnonKey.includes('<your-anon-key>')
  );
};

let clientInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance && supabaseUrl && supabaseAnonKey) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return clientInstance;
};

const SESSION_KEY = 'ij_player_session_id';
const NAME_KEY = 'ij_player_name';

const getStorage = getSafeStorage;

export const getPlayerSessionId = (): string => {
  try {
    const storage = getStorage();
    let sessionId = storage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = 'p_' + randomHex(8);
      storage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return 'p_guest_' + randomHex(4);
  }
};

export const getStoredPlayerName = (): string => {
  try {
    const storage = getStorage();
    return storage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};

export const setStoredPlayerName = (name: string): void => {
  try {
    const storage = getStorage();
    storage.setItem(NAME_KEY, name.trim());
  } catch {}
};
