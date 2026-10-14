import { PlayerState, ARENA_RADIUS, SLAP_RANGE, SLAP_CONE, normalizeAngle } from './physics';

export interface BotDecision {
  inputX: number;
  inputZ: number;
  shouldSlap: boolean;
  shouldDash: boolean;
}

export function computeBotAi(
  bot: PlayerState,
  allPlayers: PlayerState[],
  _dt?: number
): BotDecision {
  if (bot.isFalling || bot.eliminated) {
    return { inputX: 0, inputZ: 0, shouldSlap: false, shouldDash: false };
  }

  const distFromCenter = Math.hypot(bot.x, bot.z);

  // Recovery behavior: if bot gets dangerously close to island edge, steer inward
  if (distFromCenter > ARENA_RADIUS * 0.76) {
    const angleToCenter = Math.atan2(-bot.z, -bot.x);
    const needDash = distFromCenter > ARENA_RADIUS * 0.9 && bot.dashCooldown <= 0;
    return {
      inputX: Math.cos(angleToCenter),
      inputZ: Math.sin(angleToCenter),
      shouldSlap: false,
      shouldDash: needDash,
    };
  }

  // Find nearest active opponent
  let nearestTarget: PlayerState | null = null;
  let minDistance = Infinity;

  for (const other of allPlayers) {
    if (other.id === bot.id || other.isFalling || other.eliminated) continue;

    const dist = Math.hypot(other.x - bot.x, other.z - bot.z);
    if (dist < minDistance) {
      minDistance = dist;
      nearestTarget = other;
    }
  }

  if (!nearestTarget) {
    // Wander towards center with slight circling motion
    const wanderAngle = Math.atan2(-bot.z, -bot.x) + 0.3;
    return {
      inputX: Math.cos(wanderAngle) * 0.5,
      inputZ: Math.sin(wanderAngle) * 0.5,
      shouldSlap: false,
      shouldDash: false,
    };
  }

  const dx = nearestTarget.x - bot.x;
  const dz = nearestTarget.z - bot.z;
  const targetAngle = Math.atan2(dz, dx);
  const angleDiff = Math.abs(normalizeAngle(targetAngle - bot.angle));

  // Attack decision: in range and facing opponent
  const shouldSlap = minDistance <= SLAP_RANGE * 0.95 && angleDiff <= SLAP_CONE * 0.45 && bot.slapCooldown <= 0;

  // Dash surprise attack: if opponent is between 3 and 5 units and near ring edge
  const targetDistFromCenter = Math.hypot(nearestTarget.x, nearestTarget.z);
  const shouldDash =
    !shouldSlap &&
    minDistance > 3.0 &&
    minDistance < 5.5 &&
    targetDistFromCenter > ARENA_RADIUS * 0.65 &&
    angleDiff <= 0.35 &&
    bot.dashCooldown <= 0;

  return {
    inputX: Math.cos(targetAngle),
    inputZ: Math.sin(targetAngle),
    shouldSlap,
    shouldDash,
  };
}
