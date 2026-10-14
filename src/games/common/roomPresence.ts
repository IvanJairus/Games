import { randomHex } from '../../lib/random';

export type PresenceKind = 'ping' | 'pong' | 'bye';

export interface PresenceMessage {
  kind: PresenceKind;
  id: string;
  room: string;
}

const CHANNEL_PREFIX = 'ij-room-presence:';
const HEARTBEAT_MS = 2000;
// Long enough to survive a slow tab switch, short enough that a killed tab stops claiming a seat.
const PEER_TTL_MS = 6000;

export const normalizeRoom = (code: string): string => code.trim().toUpperCase();

export const createPresenceMessage = (kind: PresenceKind, id: string, room: string): PresenceMessage => ({
  kind,
  id,
  room: normalizeRoom(room),
});

export const prunePeers = (peers: Map<string, number>, now: number, ttl = PEER_TTL_MS): number => {
  for (const [id, seenAt] of peers) {
    if (now - seenAt > ttl) peers.delete(id);
  }
  return peers.size;
};

export const applyPresence = (
  peers: Map<string, number>,
  selfId: string,
  message: PresenceMessage | null,
  now: number
): boolean => {
  if (!message || typeof message.id !== 'string' || message.id === selfId) return false;

  if (message.kind === 'bye') {
    peers.delete(message.id);
    return true;
  }

  peers.set(message.id, now);
  return message.kind === 'ping';
};

export const shouldWarnAboutPeers = (peerCount: number): boolean => peerCount > 0;

export function watchRoomPeers(
  roomCode: string,
  onPeerCount: (count: number) => void
): () => void {
  const Channel = typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null;
  if (!Channel) return () => {};

  const room = normalizeRoom(roomCode);
  if (!room) return () => {};

  const selfId = randomHex(6);
  const peers = new Map<string, number>();
  const channel = new Channel(CHANNEL_PREFIX + room);
  let lastCount = 0;

  const publish = (kind: PresenceKind) => {
    channel.postMessage(createPresenceMessage(kind, selfId, room));
  };

  const report = () => {
    const count = prunePeers(peers, Date.now());
    if (count !== lastCount) {
      lastCount = count;
      onPeerCount(count);
    }
  };

  channel.onmessage = (event: MessageEvent) => {
    const answer = applyPresence(peers, selfId, event.data as PresenceMessage, Date.now());
    if (answer) publish('pong');
    report();
  };

  publish('ping');
  const heartbeat = setInterval(() => {
    publish('ping');
    report();
  }, HEARTBEAT_MS);

  const leave = () => publish('bye');
  window.addEventListener('pagehide', leave);

  return () => {
    clearInterval(heartbeat);
    window.removeEventListener('pagehide', leave);
    leave();
    channel.close();
  };
}
