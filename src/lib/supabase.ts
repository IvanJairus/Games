import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
          // Slap Arena sends one world snapshot per host tick at 20 Hz. Anything lower
          // makes the server drop messages and silently fall back to REST.
          eventsPerSecond: 20,
        },
      },
    });
  }
  return clientInstance;
};

const SESSION_KEY = 'ij_player_session_id';
const NAME_KEY = 'ij_player_name';

const inMemoryStore: Record<string, string> = {};

const getStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage;
    }
  } catch {}
  return {
    getItem: (key: string) => inMemoryStore[key] ?? null,
    setItem: (key: string, val: string) => {
      inMemoryStore[key] = val;
    },
    removeItem: (key: string) => {
      delete inMemoryStore[key];
    },
  };
};

export const getPlayerSessionId = (): string => {
  try {
    const storage = getStorage();
    let sessionId = storage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = 'p_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      storage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return 'p_guest_' + Math.random().toString(36).substring(2, 8);
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
