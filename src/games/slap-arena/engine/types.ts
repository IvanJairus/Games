export interface PlayerState {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
  // Position & Velocity in 3D X-Z plane
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number; // Face orientation in radians
  // Combat & State
  isSlapping: boolean;
  slapCooldown: number;
  dashCooldown: number;
  isDashing: boolean;
  dashTimer: number;
  isHit: boolean;
  hitTimer: number;
  isFalling: boolean;
  fallY: number;
  score: number;
  eliminated: boolean;
}

export interface ArenaState {
  roomId: string;
  round: number;
  phase: 'WAITING' | 'COUNTDOWN' | 'BATTLE' | 'ROUND_OVER' | 'MATCH_OVER';
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
