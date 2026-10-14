import type { PlayerState, ArenaState } from './types';
export type { PlayerState, ArenaState };

export const ARENA_RADIUS = 11;
export const PLAYER_RADIUS = 0.85;
export const MOVE_SPEED = 9.0;
export const DASH_SPEED = 24.0;
export const FRICTION = 0.86;
export const SLAP_RANGE = 2.4;
export const SLAP_CONE = Math.PI / 1.8; // ~100 degrees
export const SLAP_FORCE = 20.0;
export const SLAP_COOLDOWN = 0.48;
export const DASH_COOLDOWN = 2.2;
export const DASH_DURATION = 0.18;

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createInitialArena(roomId: string, scoreToWin = 3): ArenaState {
  return {
    roomId,
    round: 1,
    phase: 'WAITING',
    countdown: 3,
    radius: ARENA_RADIUS,
    players: {},
    winnerId: null,
    matchWinnerId: null,
    scoreToWin,
    lastEventTime: Date.now(),
  };
}

export function spawnPlayersInCircle(players: Record<string, PlayerState>, radius = 5.5): void {
  const ids = Object.keys(players);
  const count = ids.length;
  if (count === 0) return;

  ids.forEach((id, index) => {
    const angle = (index / count) * Math.PI * 2;
    const p = players[id];
    p.x = Math.cos(angle) * radius;
    p.z = Math.sin(angle) * radius;
    p.vx = 0;
    p.vz = 0;
    // Face toward island center
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
    p.eliminated = false;
  });
}

export function updatePlayerMovement(
  player: PlayerState,
  inputX: number,
  inputZ: number,
  dt: number
): void {
  // Update timers
  if (player.slapCooldown > 0) {
    player.slapCooldown = Math.max(0, player.slapCooldown - dt);
  }
  if (player.dashCooldown > 0) {
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  }
  if (player.hitTimer > 0) {
    player.hitTimer = Math.max(0, player.hitTimer - dt);
    if (player.hitTimer === 0) player.isHit = false;
  }

  // Dash timer
  if (player.isDashing) {
    player.dashTimer -= dt;
    if (player.dashTimer <= 0) {
      player.isDashing = false;
    }
  }

  // Falling state
  if (player.isFalling) {
    player.fallY -= 30 * dt;
    player.x += player.vx * dt * 0.7;
    player.z += player.vz * dt * 0.7;
    if (player.fallY < -20) {
      player.eliminated = true;
    }
    return;
  }

  // Active control
  const inputMagnitude = Math.hypot(inputX, inputZ);
  if (inputMagnitude > 0.05 && !player.isHit) {
    const normX = inputX / inputMagnitude;
    const normZ = inputZ / inputMagnitude;

    player.angle = Math.atan2(normZ, normX);

    const speed = player.isDashing ? DASH_SPEED : MOVE_SPEED;
    player.vx += normX * speed * dt * 10;
    player.vz += normZ * speed * dt * 10;
  }

  // Physics friction
  player.vx *= Math.pow(FRICTION, dt * 60);
  player.vz *= Math.pow(FRICTION, dt * 60);

  // Position integration
  player.x += player.vx * dt;
  player.z += player.vz * dt;

  // Island boundary check
  const distFromCenter = Math.hypot(player.x, player.z);
  if (distFromCenter > ARENA_RADIUS) {
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
      }
    }
  }
}

export interface SlapResult {
  attackerId: string;
  victimId: string;
  force: number;
}

export function executeSlap(
  attacker: PlayerState,
  allPlayers: PlayerState[]
): SlapResult[] {
  if (attacker.slapCooldown > 0 || attacker.isFalling || attacker.eliminated) {
    return [];
  }

  attacker.isSlapping = true;
  attacker.slapCooldown = SLAP_COOLDOWN;
  setTimeout(() => {
    attacker.isSlapping = false;
  }, 180);

  const results: SlapResult[] = [];

  for (const victim of allPlayers) {
    if (victim.id === attacker.id || victim.isFalling || victim.eliminated) continue;

    const dx = victim.x - attacker.x;
    const dz = victim.z - attacker.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= SLAP_RANGE) {
      const angleToVictim = Math.atan2(dz, dx);
      const angleDiff = Math.abs(normalizeAngle(angleToVictim - attacker.angle));

      if (angleDiff <= SLAP_CONE * 0.5) {
        // Successful slap! Apply directional knockback impulse
        const knockAngle = attacker.angle;
        victim.vx += Math.cos(knockAngle) * SLAP_FORCE;
        victim.vz += Math.sin(knockAngle) * SLAP_FORCE;
        victim.isHit = true;
        victim.hitTimer = 0.35;

        results.push({
          attackerId: attacker.id,
          victimId: victim.id,
          force: SLAP_FORCE,
        });
      }
    }
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
