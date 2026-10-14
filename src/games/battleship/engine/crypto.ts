import { Placement } from './types';

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(input: string): Promise<string> {
  const subtle = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto?.subtle : undefined;
  if (!subtle) throw new Error('WebCrypto tidak tersedia, komitmen kapal tidak dapat dihitung');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(digest);
}

export const canonicalLayout = (placements: Placement[]): string =>
  placements
    .map((p) => `${p.kind}:${[...p.cells].sort((a, b) => a - b).join('-')}`)
    .sort()
    .join('|');

// The seed is in the preimage so a reveal needs both the layout and the seed that produced it.
export const computeCommitment = (seed: string, placements: Placement[]): Promise<string> =>
  sha256Hex(`${seed}|${canonicalLayout(placements)}`);
