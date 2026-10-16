import { getSafeStorage } from '../../lib/storage';
import { CHAR_IDS } from './sprites';

const KEY = 'ij_bomberman_char';

/**
 * The chosen character, kept on the device.
 *
 * Two things need it: a player expects the robot they picked to still be theirs tomorrow,
 * and an online seat has to be able to tell the host which character it wants. The host
 * owns the simulation, so a guest's pick travels as one broadcast claim instead of a
 * database write.
 */
export const readCharId = (): string => {
  const raw = getSafeStorage().getItem(KEY);
  return CHAR_IDS.includes(raw ?? '') ? (raw as string) : CHAR_IDS[0];
};

export const writeCharId = (id: string): void => {
  if (!CHAR_IDS.includes(id)) return;
  getSafeStorage().setItem(KEY, id);
};
