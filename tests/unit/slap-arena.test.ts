import { describe, it, expect } from 'vitest';
import {
  ARENA_RADIUS,
  PLAYER_RADIUS,
  SLAP_FORCE,
  createInitialArena,
  spawnPlayersInCircle,
  updatePlayerMovement,
  resolvePlayerCollisions,
  executeSlap,
  executeDash,
  normalizeAngle,
} from '../../src/games/slap-arena/engine/physics';
import { computeBotAi } from '../../src/games/slap-arena/engine/botAi';
import { PlayerState } from '../../src/games/slap-arena/engine/types';

function createMockPlayer(id: string, x = 0, z = 0, angle = 0): PlayerState {
  return {
    id,
    name: `Player_${id}`,
    color: '#3b82f6',
    isHost: id === 'p1',
    isBot: id.startsWith('bot'),
    x,
    z,
    vx: 0,
    vz: 0,
    angle,
    isSlapping: false,
    slapCooldown: 0,
    dashCooldown: 0,
    isDashing: false,
    dashTimer: 0,
    isHit: false,
    hitTimer: 0,
    isFalling: false,
    fallY: 0,
    score: 0,
    eliminated: false,
  };
}

describe('Slap Arena Physics & Math', () => {
  it('normalizes angles within -PI to PI correctly', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI);
  });

  it('spawns players in a balanced circle facing the arena center', () => {
    const players: Record<string, PlayerState> = {
      p1: createMockPlayer('p1'),
      p2: createMockPlayer('p2'),
      p3: createMockPlayer('p3'),
      p4: createMockPlayer('p4'),
    };

    spawnPlayersInCircle(players, 6);

    const pList = Object.values(players);
    expect(pList).toHaveLength(4);

    pList.forEach((p) => {
      const dist = Math.hypot(p.x, p.z);
      expect(dist).toBeCloseTo(6, 1);
      expect(p.isFalling).toBe(false);
      expect(p.eliminated).toBe(false);
      expect(p.vx).toBe(0);
      expect(p.vz).toBe(0);
    });
  });

  it('integrates movement vector with friction', () => {
    const player = createMockPlayer('p1', 0, 0, 0);
    const dt = 1 / 60;

    // Move forward in Z direction
    updatePlayerMovement(player, 0, 1, dt);

    expect(player.vz).toBeGreaterThan(0);
    expect(player.z).toBeGreaterThan(0);
    expect(player.angle).toBeCloseTo(Math.PI / 2, 2);
  });

  it('detects falling when player crosses island boundary', () => {
    const player = createMockPlayer('p1', ARENA_RADIUS + 0.5, 0, 0);
    const dt = 1 / 60;

    updatePlayerMovement(player, 0, 0, dt);

    expect(player.isFalling).toBe(true);
  });

  it('resolves player-to-player overlapping collisions via separation impulse', () => {
    // Two players overlapping
    const p1 = createMockPlayer('p1', 0, 0, 0);
    const p2 = createMockPlayer('p2', 0.5, 0, 0); // distance 0.5, but min distance is 2 * PLAYER_RADIUS (1.7)

    resolvePlayerCollisions([p1, p2]);

    const distAfter = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    expect(distAfter).toBeGreaterThanOrEqual(PLAYER_RADIUS * 2 - 0.01);
  });

  it('executes slap hitting opponent in front cone and applying knockback', () => {
    // Attacker at (0, 0) facing +X (angle = 0)
    const attacker = createMockPlayer('p1', 0, 0, 0);
    // Victim at (1.5, 0) directly in front within SLAP_RANGE (2.4)
    const victim = createMockPlayer('p2', 1.5, 0, 0);

    const hits = executeSlap(attacker, [attacker, victim]);

    expect(hits).toHaveLength(1);
    expect(hits[0].attackerId).toBe('p1');
    expect(hits[0].victimId).toBe('p2');
    expect(victim.vx).toBeGreaterThanOrEqual(SLAP_FORCE);
    expect(victim.isHit).toBe(true);
    expect(attacker.isSlapping).toBe(true);
    expect(attacker.slapCooldown).toBeGreaterThan(0);
  });

  it('does NOT slap opponents behind attacker or out of cone', () => {
    // Attacker facing +X (angle = 0)
    const attacker = createMockPlayer('p1', 0, 0, 0);
    // Victim behind attacker at (-1.5, 0)
    const victim = createMockPlayer('p2', -1.5, 0, 0);

    const hits = executeSlap(attacker, [attacker, victim]);

    expect(hits).toHaveLength(0);
    expect(victim.vx).toBe(0);
    expect(victim.isHit).toBe(false);
  });

  it('executes dash impulse and triggers cooldown', () => {
    const player = createMockPlayer('p1', 0, 0, 0);

    const success = executeDash(player);

    expect(success).toBe(true);
    expect(player.isDashing).toBe(true);
    expect(player.dashCooldown).toBeGreaterThan(0);
    expect(player.vx).toBeGreaterThan(0);

    // Second dash should fail while on cooldown
    const secondTry = executeDash(player);
    expect(secondTry).toBe(false);
  });
});

describe('Slap Arena Bot AI', () => {
  it('steers bot back inward when dangerously close to island edge', () => {
    // Bot near the positive X edge (x = 10, arena radius = 11)
    const bot = createMockPlayer('bot_1', 10, 0, 0);
    const target = createMockPlayer('p1', 10.5, 0, 0);

    const decision = computeBotAi(bot, [bot, target]);

    // Should steer back inward (negative X direction)
    expect(decision.inputX).toBeLessThan(0);
  });

  it('moves towards opponent and slaps when in range and facing', () => {
    const bot = createMockPlayer('bot_1', 0, 0, 0);
    const opponent = createMockPlayer('p1', 1.2, 0, 0); // directly in front

    const decision = computeBotAi(bot, [bot, opponent]);

    expect(decision.inputX).toBeGreaterThan(0);
    expect(decision.shouldSlap).toBe(true);
  });
});

describe('Multiplayer Abnormal Flow Safeguards', () => {
  it('creates initial arena with valid defaults and clean state', () => {
    const arena = createInitialArena('ROOM42', 3);
    expect(arena.roomId).toBe('ROOM42');
    expect(arena.scoreToWin).toBe(3);
    expect(arena.round).toBe(1);
    expect(arena.phase).toBe('WAITING');
    expect(arena.winnerId).toBeNull();
  });
});
