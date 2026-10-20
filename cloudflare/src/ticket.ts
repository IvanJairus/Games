export const TICKET_TTL_SECONDS = 3600;
export const MAX_TICKET_TTL_SECONDS = 12 * 3600;

const TICKET_SHAPE = /^v1:([A-Z0-9]{4,12}):([0-9a-f]{32}):([a-z0-9-]{2,32}):(\d{1,12})\.([0-9a-f]{64})$/;

export interface TicketClaim {
  code: string;
  playerId: string;
  game: string;
  exp: number;
}

export type TicketReject =
  | 'missing_ticket'
  | 'no_secret'
  | 'malformed_ticket'
  | 'bad_signature'
  | 'wrong_room'
  | 'expired';

export type TicketCheck = { ok: true; claim: TicketClaim } | { ok: false; reason: TicketReject };

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * importKey with usage ['sign','verify'] is what the runtime offers for HMAC-SHA256;
 * the key is never extractable, so a leaked CryptoKey cannot be turned back into the secret.
 */
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export const ticketPayload = (claim: TicketClaim): string =>
  `v1:${claim.code}:${claim.playerId}:${claim.game}:${claim.exp}`;

export async function signTicket(secret: string, claim: TicketClaim): Promise<string> {
  const payload = ticketPayload(claim);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toHex(new Uint8Array(signature))}`;
}

/**
 * The signature is checked before the room and the clock, so a caller cannot use a refusal
 * to learn whether a code, a seat, or an expiry is the part that was wrong.
 */
export async function verifyTicket(
  secret: string | undefined,
  raw: string | null,
  expectedCode: string,
  nowMs: number,
): Promise<TicketCheck> {
  if (!raw) return { ok: false, reason: 'missing_ticket' };
  const trimmed = secret?.trim();
  if (!trimmed) return { ok: false, reason: 'no_secret' };

  const shape = TICKET_SHAPE.exec(raw);
  if (!shape) return { ok: false, reason: 'malformed_ticket' };
  const [, code, playerId, game, expText, signature] = shape;
  const exp = Number(expText);

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(trimmed),
    fromHex(signature),
    encoder.encode(raw.slice(0, raw.length - signature.length - 1)),
  );
  if (!valid) return { ok: false, reason: 'bad_signature' };
  if (code !== expectedCode) return { ok: false, reason: 'wrong_room' };
  if (exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };

  return { ok: true, claim: { code, playerId, game, exp } };
}
