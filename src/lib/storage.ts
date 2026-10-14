const inMemoryStore: Record<string, string> = {};

export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Private-mode Safari and embedded webviews throw on any localStorage access, not just writes.
export const getSafeStorage = (): SafeStorage => {
  try {
    if (
      typeof window !== 'undefined' &&
      window.localStorage &&
      typeof window.localStorage.getItem === 'function'
    ) {
      return window.localStorage;
    }
  } catch {}

  return {
    getItem: (key: string) => inMemoryStore[key] ?? null,
    setItem: (key: string, value: string) => {
      inMemoryStore[key] = value;
    },
    removeItem: (key: string) => {
      delete inMemoryStore[key];
    },
  };
};
