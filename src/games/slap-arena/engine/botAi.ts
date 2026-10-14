import { PlayerState, ARENA_RADIUS, SLAP_RANGE, SLAP_CONE, normalizeAngle } from './physics';
import type { InputState } from './types';

export interface BotDecision {
  inputX: number;
  inputZ: number;
  shouldSlap: boolean;
  shouldDash: boolean;
}

/** Stable per-bot personality so three bots do not move as one clone. */
function personality(id: string): { aggression: number; jitter: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 16) >>> 0) % 1000) / 1000;
  return { aggression: 0.65 + a * 0.35, jitter: (b - 0.5) * 0.5 };
}

export function computeBotAi(
  bot: PlayerState,
  allPlayers: PlayerState[],
  _dt?: number,
  time = 0,
  roundElapsed = 99
): BotDecision {
  if (bot.isFalling || bot.eliminated) {
    return { inputX: 0, inputZ: 0, shouldSlap: false, shouldDash: false };
  }

  const { aggression, jitter } = personality(bot.id);
  const distFromCenter = Math.hypot(bot.x, bot.z);

  // Recovery: a knocked brawler gives up the fight and gets back on the grass.
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

  // Each bot weighs opponents by personality: the bold one hunts the player, the
  // wary one picks on another bot. Without this all three converge on whoever is
  // standing still, so an idle player loses in seconds.
  let nearestTarget: PlayerState | null = null;
  let minScore = Infinity;
  let minDistance = Infinity;

  for (const other of allPlayers) {
    if (other.id === bot.id || other.isFalling || other.eliminated) continue;
    const dist = Math.hypot(other.x - bot.x, other.z - bot.z);
    // Early in the round everyone sizes up the other bots; the boldest one warms to
    // the player as the clock runs down.
    const interest = Math.min(1, roundElapsed / 6);
    const bias = other.isBot
      ? 1.55 - aggression - jitter * 0.5
      : 0.9 + (1 - aggression) * 0.8 + (1 - interest) * 1.1;
    const score = dist * Math.max(0.45, bias);
    if (score < minScore) {
      minScore = score;
      minDistance = dist;
      nearestTarget = other;
    }
  }

  if (!nearestTarget) {
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
  // A wary bot circles in instead of walking into the same pile as its siblings.
  const orbit = minDistance < 3.2 ? jitter * 1.2 : jitter * 0.45;
  const targetAngle = Math.atan2(dz, dx) + orbit * (1 - aggression) + jitter * 0.15 * Math.sin(time * 1.7);
  const angleDiff = Math.abs(normalizeAngle(Math.atan2(dz, dx) - bot.angle));

  const shouldSlap =
    minDistance <= SLAP_RANGE * 0.95 * aggression && angleDiff <= SLAP_CONE * 0.45 && bot.slapCooldown <= 0;

  const targetDistFromCenter = Math.hypot(nearestTarget.x, nearestTarget.z);
  const shouldDash =
    !shouldSlap &&
    minDistance > 2.6 &&
    minDistance < 5.0 &&
    targetDistFromCenter > ARENA_RADIUS * 0.6 &&
    angleDiff <= 0.35 &&
    bot.dashCooldown <= 0;

  return {
    inputX: Math.cos(targetAngle),
    inputZ: Math.sin(targetAngle),
    shouldSlap,
    shouldDash,
  };
}

export function botInputToState(decision: BotDecision): InputState {
  return { x: decision.inputX, z: decision.inputZ, slap: decision.shouldSlap, dash: decision.shouldDash };
}
