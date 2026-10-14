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
  score: number;
  eliminated: boolean;
  /** Seconds since the slap swing started; drives the arm animation. -1 = idle. */
  slapAnimT: number;
  /** Set by the renderer for squash/stretch; not simulated. */
  bump: number;
}

export interface InputState {
  x: number;
  z: number;
  slap: boolean;
  dash: boolean;
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
  | { kind: 'slap'; playerId: string; x: number; z: number; angle: number }
  | { kind: 'hit'; victimId: string; x: number; z: number; angle: number; force: number }
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
