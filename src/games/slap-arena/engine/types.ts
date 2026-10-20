export interface PlayerState {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  isSlapping: boolean;
  slapCooldown: number;
  dashCooldown: number;
  isDashing: boolean;
  dashTimer: number;
  isHit: boolean;
  hitTimer: number;
  isFalling: boolean;
  fallY: number;
  fallSpin: number;
  /** Height above the grass while a charged knockback has the brawler airborne. */
  y: number;
  vy: number;
  /** Seconds this brawler has been holding the slap button. -1 = not charging. */
  chargeT: number;
  score: number;
  eliminated: boolean;
  /** Seconds since the slap swing started; drives the arm animation. -1 = idle. */
  slapAnimT: number;
  /** 1 on impact, decayed by the sim for actors it owns and by the renderer for the rest. */
  bump: number;
  /**
   * Visual-only offset that absorbs a reconciliation snap. The sim has already put the
   * body at the authoritative position; the renderer draws it at `x + corrX` and decays
   * this to zero, so a correction reads as a slide instead of a teleport. Never on the wire.
   */
  corrX: number;
  corrZ: number;
}

export interface InputState {
  x: number;
  z: number;
  slap: boolean;
  dash: boolean;
  /** True while the slap button is held down. Optional so older callers stay valid. */
  held?: boolean;
  /** 0..1 charge released with the slap. Optional for the same reason. */
  charge?: number;
  /** Counts actions, so a peer can tell a fresh slap from a flag still held up. */
  seq?: number;
}

export type ArenaPhase = 'WAITING' | 'COUNTDOWN' | 'BATTLE' | 'ROUND_OVER' | 'MATCH_OVER';

export interface ArenaState {
  roomId: string;
  round: number;
  phase: ArenaPhase;
  countdown: number;
  radius: number;
  players: Record<string, PlayerState>;
  winnerId: string | null;
  matchWinnerId: string | null;
  scoreToWin: number;
  lastEventTime: number;
}

export interface SlapActionPayload {
  playerId: string;
  x: number;
  z: number;
  angle: number;
}

export interface MovePayload {
  playerId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
}

export type SimEvent =
  | {
      kind: 'slap';
      playerId: string;
      x: number;
      z: number;
      angle: number;
      charge: number;
      /** Absent on a client's own prediction, where only the host knows the outcome. */
      hitCount?: number;
    }
  | {
      kind: 'hit';
      attackerId: string;
      victimId: string;
      x: number;
      z: number;
      angle: number;
      force: number;
      charge: number;
    }
  | { kind: 'dash'; playerId: string; x: number; z: number; angle: number }
  | { kind: 'ko'; playerId: string; x: number; z: number }
  | { kind: 'roundEnd'; winnerId: string | null; round: number; matchOver: boolean }
  | { kind: 'roundStart'; round: number };

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  score: number;
  isFalling: boolean;
  eliminated: boolean;
  slapCooldown: number;
  dashCooldown: number;
  /** Airborne height and wind-up. Absent from an older host, so readers default them. */
  y?: number;
  chargeT?: number;
  /**
   * Stun and vertical speed are decided by the host when a slap lands. A client that does
   * not learn them keeps pushing its own body with movement input while the host holds it
   * still, and reconciliation then yanks the body back: the "hit once and I fly to the rim"
   * rubber-band. Optional so an older host still parses.
   */
  isHit?: boolean;
  hitTimer?: number;
  vy?: number;
}

export interface WorldSnapshot {
  round: number;
  phase: ArenaPhase;
  countdown: number;
  scoreToWin: number;
  winnerId: string | null;
  matchWinnerId: string | null;
  players: PlayerSnapshot[];
  /** Host clock, used by clients to drop stale snapshots. */
  t: number;
}
