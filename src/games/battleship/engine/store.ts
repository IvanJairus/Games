import { getSafeStorage } from '../../../lib/storage';
import { Placement } from './types';
import { canonicalLayout, parseCanonicalLayout } from './index';

export interface SecretLayout {
  seed: string;
  placements: Placement[];
}

const keyFor = (room: string): string => `ij_bs_secret_${room.trim().toUpperCase()}`;

// Ship coordinates stay on the owner's device. Only the hash leaves it, so a passive reader of
// the matches table cannot see a fleet even while RLS still permits anon selects.
export const saveSecretLayout = (room: string, layout: SecretLayout): void => {
  getSafeStorage().setItem(
    keyFor(room),
    JSON.stringify({ seed: layout.seed, layout: canonicalLayout(layout.placements) })
  );
};

export const loadSecretLayout = (room: string): SecretLayout | null => {
  const raw = getSafeStorage().getItem(keyFor(room));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { seed?: string; layout?: string };
    if (!parsed.seed || !parsed.layout) return null;
    return { seed: parsed.seed, placements: parseCanonicalLayout(parsed.layout) };
  } catch {
    return null;
  }
};

export const clearSecretLayout = (room: string): void => {
  getSafeStorage().removeItem(keyFor(room));
};
