import type { PlayerState, ArenaState } from './types';
export type { PlayerState, ArenaState };

export const ARENA_RADIUS = 7.2;
export const PLAYER_RADIUS = 0.85;
export const MOVE_SPEED = 7.6;
export const DASH_SPEED = 21.0;
export const FRICTION = 0.86;
export const SLAP_RANGE = 2.25;
export const SLAP_CONE = (78 * Math.PI) / 180;
export const SLAP_FORCE = 20.0;
export const SLAP_COOLDOWN = 0.55;
export const SLAP_ANIM_TIME = 0.22;
export const DASH_COOLDOWN = 1.8;
export const DASH_DURATION = 0.16;
export const HIT_STUN = 0.26;
export const FALL_KILL_Y = -14;
export const COUNTDOWN_TIME = 3;

/** Below this a hold is indistinguishable from a tap, so the tap keeps its old feel. */
export const CHARGE_MIN_TIME = 0.25;
/** A finger that never lifts still gets its slap; the button auto-fires here. */
export const CHARGE_MAX_TIME = 0.7;
/** A hold only stops being useful here; the meter is already full at CHARGE_MAX_TIME. */
export const CHARGE_HOLD_LIMIT = 1.6;
/** Knockback multiplier at a full hold is 1 + this. */
export const CHARGE_FORCE_GAIN = 1.2;
export const CHARGE_STUN_GAIN = 0.14;
export const CHARGE_CD_GAIN = 0.3;
/** Vertical launch speed at a full hold. */
export const CHARGE_LAUNCH_Y = 4.4;
export const AIR_GRAVITY = 22;

/** How much of a slap a hold of `heldSeconds` has bought, in 0..1. */
export function chargeFromHold(heldSeconds: number): number {
  if (!Number.isFinite(heldSeconds) || heldSeconds < CHARGE_MIN_TIME) return 0;
  return Math.min(1, (heldSeconds - CHARGE_MIN_TIME) / (CHARGE_MAX_TIME - CHARGE_MIN_TIME));
}

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createPlayer(partial: Partial<PlayerState> & { id: string }): PlayerState {
  return {
    name: 'Brawler',
    color: '#4f8cff',
    isHost: false,
    isBot: false,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    angle: 0,
    isSlapping: false,
    slapCooldown: 0,
    dashCooldown: 0,
    isDashing: false,
    dashTimer: 0,
    isHit: false,
    hitTimer: 0,
    isFalling: false,
    fallY: 0,
    fallSpin: 0,
    y: 0,
    vy: 0,
    chargeT: -1,
    score: 0,
    eliminated: false,
    slapAnimT: -1,
    bump: 0,
    ...partial,
  };
}

export function createInitialArena(roomId: string, scoreToWin = 3): ArenaState {
  return {
    roomId,
    round: 1,
    phase: 'WAITING',
    countdown: COUNTDOWN_TIME,
    radius: ARENA_RADIUS,
    players: {},
    winnerId: null,
    matchWinnerId: null,
    scoreToWin,
    lastEventTime: Date.now(),
  };
}

export function spawnPlayersInCircle(players: Record<string, PlayerState>, radius = 3.6): void {
  const ids = Object.keys(players);
  const count = ids.length;
  if (count === 0) return;

  ids.forEach((id, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const p = players[id];
    p.x = Math.cos(angle) * radius;
    p.z = Math.sin(angle) * radius;
    p.vx = 0;
    p.vz = 0;
    p.angle = angle + Math.PI;
    p.isSlapping = false;
    p.slapCooldown = 0;
    p.dashCooldown = 0;
    p.isDashing = false;
    p.dashTimer = 0;
    p.isHit = false;
    p.hitTimer = 0;
    p.isFalling = false;
    p.fallY = 0;
    p.fallSpin = 0;
    p.y = 0;
    p.vy = 0;
    p.chargeT = -1;
    p.eliminated = false;
    p.slapAnimT = -1;
    p.bump = 0;
  });
}

export function updatePlayerMovement(
  player: PlayerState,
  inputX: number,
  inputZ: number,
  dt: number
): void {
  if (player.slapCooldown > 0) player.slapCooldown = Math.max(0, player.slapCooldown - dt);
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  if (player.slapAnimT >= 0) {
    player.slapAnimT += dt;
    if (player.slapAnimT > SLAP_ANIM_TIME) {
      player.slapAnimT = -1;
      player.isSlapping = false;
    }
  }
  if (player.bump > 0) player.bump = Math.max(0, player.bump - dt * 4);
  if (player.hitTimer > 0) {
    player.hitTimer = Math.max(0, player.hitTimer - dt);
    if (player.hitTimer === 0) player.isHit = false;
  }
  if (player.isDashing) {
    player.dashTimer -= dt;
    if (player.dashTimer <= 0) player.isDashing = false;
  }

  if (player.isFalling) {
    player.fallY -= 30 * dt;
    player.fallSpin += dt * 7;
    player.x += player.vx * dt * 0.7;
    player.z += player.vz * dt * 0.7;
    player.vx *= Math.pow(0.97, dt * 60);
    player.vz *= Math.pow(0.97, dt * 60);
    if (player.fallY < FALL_KILL_Y) player.eliminated = true;
    return;
  }

  // A charged knockback lifts the victim off the grass. Kept out of the x/z path on
  // purpose: being airborne must not quietly make a brawler travel further.
  if (player.y > 0 || player.vy > 0) {
    player.vy -= AIR_GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
    }
  }

  const inputMagnitude = Math.hypot(inputX, inputZ);
  if (inputMagnitude > 0.08 && !player.isHit) {
    const normX = inputX / inputMagnitude;
    const normZ = inputZ / inputMagnitude;
    const clamped = Math.min(1, inputMagnitude);
    player.angle = Math.atan2(normZ, normX);
    const speed = player.isDashing ? DASH_SPEED : MOVE_SPEED;
    player.vx += normX * speed * dt * 10 * clamped;
    player.vz += normZ * speed * dt * 10 * clamped;
  }

  player.vx *= Math.pow(FRICTION, dt * 60);
  player.vz *= Math.pow(FRICTION, dt * 60);
  player.x += player.vx * dt;
  player.z += player.vz * dt;

  if (Math.hypot(player.x, player.z) > ARENA_RADIUS) {
    // Hand the fall over at whatever height the launch reached, or a victim thrown
    // over the rim would snap down to the sea before sinking.
    player.fallY = Math.max(0, player.y);
    player.y = 0;
    player.isFalling = true;
  }
}

export function resolvePlayerCollisions(players: PlayerState[]): void {
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (a.isFalling || a.eliminated) continue;

    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (b.isFalling || b.eliminated) continue;

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const minDist = PLAYER_RADIUS * 2;

      if (dist < minDist && dist > 0.001) {
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;
        // Soft push so bodies never feel glued together at rest.
        a.vx -= nx * 1.6;
        a.vz -= nz * 1.6;
        b.vx += nx * 1.6;
        b.vz += nz * 1.6;
      }
    }
  }
}

export interface SlapResult {
  attackerId: string;
  victimId: string;
  force: number;
  charge: number;
}

/**
 * `knockScale` lets the sim soften hits during the opening seconds of a round, so a
 * player who is still reading the controls does not get shoved into the sea by three
 * bots before they have moved once. `charge` is 0..1 from a held slap button: it buys
 * range through force, not through the hitbox, so who gets hit never changes.
 */
export function executeSlap(
  attacker: PlayerState,
  allPlayers: PlayerState[],
  knockScale = 1,
  charge = 0
): SlapResult[] {
  if (attacker.slapCooldown > 0 || attacker.isFalling || attacker.eliminated || attacker.isHit) {
    return [];
  }

  const c = Math.max(0, Math.min(1, Number.isFinite(charge) ? charge : 0));
  const force = SLAP_FORCE * (1 + CHARGE_FORCE_GAIN * c) * knockScale;

  attacker.isSlapping = true;
  attacker.slapAnimT = 0;
  attacker.chargeT = -1;
  attacker.slapCooldown = SLAP_COOLDOWN + CHARGE_CD_GAIN * c;

  const results: SlapResult[] = [];

  for (const victim of allPlayers) {
    if (victim.id === attacker.id || victim.isFalling || victim.eliminated) continue;

    const dx = victim.x - attacker.x;
    const dz = victim.z - attacker.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SLAP_RANGE) continue;

    const angleDiff = Math.abs(normalizeAngle(Math.atan2(dz, dx) - attacker.angle));
    if (angleDiff > SLAP_CONE * 0.5) continue;

    victim.vx += Math.cos(attacker.angle) * force;
    victim.vz += Math.sin(attacker.angle) * force;
    victim.vy = Math.max(victim.vy, CHARGE_LAUNCH_Y * c);
    victim.isHit = true;
    victim.hitTimer = HIT_STUN + CHARGE_STUN_GAIN * c;
    victim.bump = 1;

    results.push({ attackerId: attacker.id, victimId: victim.id, force, charge: c });
  }

  return results;
}

export function executeDash(player: PlayerState): boolean {
  if (player.dashCooldown > 0 || player.isFalling || player.eliminated || player.isHit) {
    return false;
  }
  player.isDashing = true;
  player.dashTimer = DASH_DURATION;
  player.dashCooldown = DASH_COOLDOWN;
  player.vx += Math.cos(player.angle) * DASH_SPEED * 0.7;
  player.vz += Math.sin(player.angle) * DASH_SPEED * 0.7;
  return true;
}
