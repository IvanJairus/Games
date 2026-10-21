/** The subset of Web Crypto this file needs; keeps the Worker build free of the DOM lib. */
type CryptoLike = { getRandomValues?: (array: Uint8Array) => Uint8Array };

export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  const webcrypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes);
    return bytes;
  }

  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
};

// Older browsers and non-secure origins have no getRandomValues; Math.random stays as the
// degraded path so a room can still be opened rather than crashing the page.
export const randomHex = (byteLength: number): string =>
  Array.from(randomBytes(byteLength), (b) => b.toString(16).padStart(2, '0')).join('');
