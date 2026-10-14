import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ARENA_RADIUS,
  PLAYER_RADIUS,
  SLAP_COOLDOWN,
  SLAP_FORCE,
  createInitialArena,
  createPlayer,
  executeDash,
  executeSlap,
  normalizeAngle,
  resolvePlayerCollisions,
  spawnPlayersInCircle,
  updatePlayerMovement,
} from '../../src/games/slap-arena/engine/physics';
import { computeBotAi } from '../../src/games/slap-arena/engine/botAi';
import { SlapSim } from '../../src/games/slap-arena/engine/sim';
import type { PlayerState } from '../../src/games/slap-arena/engine/types';
import { EV_FX, EV_INPUT, EV_SNAPSHOT, isFxBatch, isInputMessage, isSnapshot } from '../../src/games/slap-arena/engine/net';

function mockPlayer(id: string, x = 0, z = 0, angle = 0): PlayerState {
  return createPlayer({ id, x, z, angle, name: `Player_${id}`, isBot: id.startsWith('bot'), isHost: id === 'p1' });
}

describe('Slap Arena physics & math', () => {
  it('normalizes angles within -PI to PI correctly', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI);
  });

  it('spawns players in a balanced circle facing the arena center', () => {
    const players: Record<string, PlayerState> = {
      p1: mockPlayer('p1'),
      p2: mockPlayer('p2'),
      p3: mockPlayer('p3'),
      p4: mockPlayer('p4'),
    };
    spawnPlayersInCircle(players, 6);
    const list = Object.values(players);
    expect(list).toHaveLength(4);
    list.forEach((p) => {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(6, 1);
      expect(p.isFalling).toBe(false);
      expect(p.eliminated).toBe(false);
      expect(p.vx).toBe(0);
      expect(p.slapCooldown).toBe(0);
      expect(p.slapAnimT).toBe(-1);
    });
  });

  it('integrates movement vector with friction', () => {
    const player = mockPlayer('p1', 0, 0, 0);
    updatePlayerMovement(player, 0, 1, 1 / 60);
    expect(player.vz).toBeGreaterThan(0);
    expect(player.z).toBeGreaterThan(0);
    expect(player.angle).toBeCloseTo(Math.PI / 2, 2);
  });

  it('detects falling when player crosses island boundary', () => {
    const player = mockPlayer('p1', ARENA_RADIUS + 0.5, 0, 0);
    updatePlayerMovement(player, 0, 0, 1 / 60);
    expect(player.isFalling).toBe(true);
  });

  it('clears the slap flag from simulation time, not a wall-clock timer', () => {
    const player = mockPlayer('p1');
    executeSlap(player, [player]);
    expect(player.isSlapping).toBe(true);
    for (let i = 0; i < 40; i++) updatePlayerMovement(player, 0, 0, 1 / 60);
    expect(player.isSlapping).toBe(false);
    expect(player.slapAnimT).toBe(-1);
  });

  it('resolves player-to-player overlapping collisions via separation impulse', () => {
    const p1 = mockPlayer('p1', 0, 0, 0);
    const p2 = mockPlayer('p2', 0.5, 0, 0);
    resolvePlayerCollisions([p1, p2]);
    expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeGreaterThanOrEqual(PLAYER_RADIUS * 2 - 0.01);
  });

  it('executes slap hitting opponent in front cone and applying knockback', () => {
    const attacker = mockPlayer('p1', 0, 0, 0);
    const victim = mockPlayer('p2', 1.5, 0, 0);
    const hits = executeSlap(attacker, [attacker, victim]);
    expect(hits).toHaveLength(1);
    expect(hits[0].attackerId).toBe('p1');
    expect(hits[0].victimId).toBe('p2');
    expect(victim.vx).toBeGreaterThanOrEqual(SLAP_FORCE);
    expect(victim.isHit).toBe(true);
    expect(victim.bump).toBe(1);
    expect(attacker.isSlapping).toBe(true);
    expect(attacker.slapCooldown).toBeCloseTo(SLAP_COOLDOWN, 2);
  });

  it('does NOT slap opponents behind attacker or out of cone', () => {
    const attacker = mockPlayer('p1', 0, 0, 0);
    const victim = mockPlayer('p2', -1.5, 0, 0);
    expect(executeSlap(attacker, [attacker, victim])).toHaveLength(0);
    expect(victim.vx).toBe(0);
    expect(victim.isHit).toBe(false);
  });

  it('ignores slaps from a brawler still reeling from a hit', () => {
    const attacker = mockPlayer('p1', 0, 0, 0);
    attacker.isHit = true;
    attacker.hitTimer = 0.2;
    const victim = mockPlayer('p2', 1.2, 0, 0);
    expect(executeSlap(attacker, [attacker, victim])).toHaveLength(0);
  });

  it('executes dash impulse and triggers cooldown', () => {
    const player = mockPlayer('p1', 0, 0, 0);
    expect(executeDash(player)).toBe(true);
    expect(player.isDashing).toBe(true);
    expect(player.dashCooldown).toBeGreaterThan(0);
    expect(player.vx).toBeGreaterThan(0);
    expect(executeDash(player)).toBe(false);
  });

  it('creates an arena with valid defaults and clean state', () => {
    const arena = createInitialArena('ROOM42', 3);
    expect(arena.roomId).toBe('ROOM42');
    expect(arena.scoreToWin).toBe(3);
    expect(arena.round).toBe(1);
    expect(arena.phase).toBe('WAITING');
    expect(arena.winnerId).toBeNull();
  });
});

describe('Slap Arena bot AI', () => {
  it('steers bot back inward when dangerously close to island edge', () => {
    const bot = mockPlayer('bot_1', ARENA_RADIUS - 1, 0, 0);
    const target = mockPlayer('p1', ARENA_RADIUS - 0.5, 0, 0);
    expect(computeBotAi(bot, [bot, target]).inputX).toBeLessThan(0);
  });

  it('moves towards opponent and slaps when in range and facing', () => {
    const bot = mockPlayer('bot_1', 0, 0, 0);
    const opponent = mockPlayer('p1', 1.2, 0, 0);
    const decision = computeBotAi(bot, [bot, opponent]);
    expect(decision.inputX).toBeGreaterThan(0);
    expect(decision.shouldSlap).toBe(true);
  });

  it('gives each bot a stable, different aggression', () => {
    const wouldSlap = (id: string) => {
      const bot = mockPlayer(id, 0, 0, 0);
      const foe = mockPlayer('p1', 2.05, 0, 0);
      return computeBotAi(bot, [bot, foe]).shouldSlap;
    };
    const results = ['bot_1', 'bot_2', 'bot_3', 'bot_4', 'bot_5'].map(wouldSlap);
    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});

describe('SlapSim phase machine', () => {
  const build = (players = 2) => {
    const sim = new SlapSim({ localId: 'me', authoritative: true, scoreToWin: 2 });
    sim.addPlayer({ id: 'me', name: 'Me', color: '#4dabf7' });
    for (let i = 1; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, color: '#ff5d5d' });
    return sim;
  };

  it('starts in WAITING and does not move anyone before the countdown', () => {
    const sim = build();
    sim.setInput('me', { x: 1, z: 0, slap: false, dash: false });
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    expect(sim.state.phase).toBe('WAITING');
    expect(sim.players.me.x).toBe(0);
  });

  it('runs the countdown then flips to BATTLE exactly once', () => {
    const sim = build();
    const starts: number[] = [];
    sim.onEvent = (e) => {
      if (e.kind === 'roundStart') starts.push(e.round);
    };
    sim.startCountdown();
    expect(sim.state.phase).toBe('COUNTDOWN');
    for (let i = 0; i < 300; i++) sim.step(1 / 60);
    expect(sim.state.phase).toBe('BATTLE');
    expect(starts).toEqual([1]);
  });

  it('awards exactly one point when the round ends', () => {
    const sim = build();
    sim.startCountdown(0);
    for (let i = 0; i < 300; i++) sim.step(1 / 60);
    sim.players.p1.x = ARENA_RADIUS + 1;
    for (let i = 0; i < 180; i++) sim.step(1 / 60);
    expect(sim.state.phase).toBe('ROUND_OVER');
    expect(sim.players.me.score).toBe(1);
    expect(sim.state.winnerId).toBe('me');
  });

  it('ends the match at the score threshold and stops simulating', () => {
    const sim = build();
    sim.players.me.score = 1;
    sim.startCountdown(0);
    for (let i = 0; i < 300; i++) sim.step(1 / 60);
    sim.players.p1.x = ARENA_RADIUS + 1;
    for (let i = 0; i < 180; i++) sim.step(1 / 60);
    expect(sim.state.phase).toBe('MATCH_OVER');
    expect(sim.state.matchWinnerId).toBe('me');
    const frozen = sim.players.me.x;
    sim.setInput('me', { x: 1, z: 0, slap: false, dash: false });
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    expect(sim.players.me.x).toBe(frozen);
  });

  it('emits one ko event per brawler per round', () => {
    const sim = build();
    const kos: string[] = [];
    sim.onEvent = (e) => {
      if (e.kind === 'ko') kos.push(e.playerId);
    };
    sim.startCountdown(0);
    for (let i = 0; i < 300; i++) sim.step(1 / 60);
    sim.players.p1.x = ARENA_RADIUS + 1;
    for (let i = 0; i < 240; i++) sim.step(1 / 60);
    expect(kos).toEqual(['p1']);
  });
});

describe('SlapSim multiplayer snapshot', () => {
  const hostWithTwo = () => {
    const host = new SlapSim({ localId: 'host', authoritative: true, scoreToWin: 3 });
    host.addPlayer({ id: 'host', name: 'Host', color: '#4dabf7', isHost: true });
    host.addPlayer({ id: 'guest', name: 'Guest', color: '#ff5d5d' });
    host.startCountdown(0);
    for (let i = 0; i < 300; i++) host.step(1 / 60);
    return host;
  };

  it('serialises the fields a client needs to see a fall', () => {
    const host = hostWithTwo();
    host.players.guest.isFalling = true;
    const snap = host.snapshot();
    expect(snap.players.find((p) => p.id === 'guest')).toMatchObject({ isFalling: true, eliminated: false });
    expect(typeof snap.t).toBe('number');
    expect(snap.phase).toBe('BATTLE');
  });

  it('client applies host positions for remote brawlers and keeps its own id', () => {
    const host = hostWithTwo();
    const client = new SlapSim({ localId: 'guest', authoritative: false, scoreToWin: 3 });
    client.addPlayer({ id: 'guest', name: 'Guest', color: '#ff5d5d' });
    client.applySnapshot(host.snapshot());
    expect(client.state.phase).toBe('BATTLE');
    expect(client.players.host.x).toBeCloseTo(host.players.host.x, 2);
    expect(client.players.guest).toBeTruthy();
  });

  it('client snaps its own position when the host disagrees by more than a metre', () => {
    const host = hostWithTwo();
    const client = new SlapSim({ localId: 'host', authoritative: false, scoreToWin: 3 });
    client.addPlayer({ id: 'host', name: 'Host', color: '#4dabf7' });
    host.players.host.x = 4.5;
    client.applySnapshot(host.snapshot());
    expect(client.players.host.x).toBe(4.5);
  });

  it('client keeps predicting its own brawler without running the world', () => {
    const client = new SlapSim({ localId: 'guest', authoritative: false });
    client.addPlayer({ id: 'guest', name: 'Guest', color: '#ff5d5d' });
    client.addPlayer({ id: 'host', name: 'Host', color: '#4dabf7' });
    client.state.phase = 'BATTLE';
    client.setInput('guest', { x: 1, z: 0, slap: false, dash: false });
    const hostBefore = client.players.host.x;
    for (let i = 0; i < 30; i++) client.step(1 / 60);
    expect(client.players.guest.x).toBeGreaterThan(0);
    expect(client.players.host.x).toBe(hostBefore);
  });

  it('drops players the host removed', () => {
    const host = hostWithTwo();
    const client = new SlapSim({ localId: 'guest', authoritative: false });
    client.addPlayer({ id: 'guest', name: 'Guest', color: '#ff5d5d' });
    client.applySnapshot(host.snapshot());
    expect(client.players.host).toBeTruthy();
    host.removePlayer('host');
    host.addPlayer({ id: 'other', name: 'Other', color: '#6fe3b0' });
    client.applySnapshot(host.snapshot());
    expect(client.players.host).toBeUndefined();
    expect(client.players.other?.name).toBe('Other');
  });
});

describe('SlapSim team colours', () => {
  it('refuses to give two brawlers the same kit', () => {
    const sim = new SlapSim({ localId: 'a', authoritative: true });
    sim.addPlayer({ id: 'a', color: '#4dabf7' });
    sim.addPlayer({ id: 'b', color: '#4dabf7' });
    sim.addPlayer({ id: 'c', color: '#4dabf7' });
    const colors = Object.values(sim.players).map((p) => p.color);
    expect(new Set(colors).size).toBe(3);
  });

  it('keeps a colour that nobody else has taken', () => {
    const sim = new SlapSim({ localId: 'a', authoritative: true });
    sim.addPlayer({ id: 'a', color: '#ff5d5d' });
    sim.addPlayer({ id: 'b', color: '#6fe3b0' });
    expect(sim.players.b.color).toBe('#6fe3b0');
  });
});

describe('Slap Arena realtime protocol shape', () => {
  it('keeps event names single-sourced so sender and receiver cannot drift', () => {
    expect(EV_INPUT).toBe('sa_in');
    expect(EV_SNAPSHOT).toBe('sa_snap');
    expect(EV_FX).toBe('sa_fx');
  });

  it('recognises payloads instead of trusting them', () => {
    expect(isInputMessage({ id: 'a', x: 1, z: 2, name: 'A', color: '#fff', slap: false, dash: false })).toBe(true);
    expect(isInputMessage({ id: 'a' })).toBe(false);
    expect(isSnapshot({ players: [], phase: 'BATTLE', round: 1 })).toBe(true);
    expect(isSnapshot({ players: [], phase: 'BATTLE' })).toBe(false);
    expect(isFxBatch([{ kind: 'ko' }])).toBe(true);
    expect(isFxBatch({ kind: 'ko' })).toBe(false);
  });
});

describe('SlapSim bot actions reach the world', () => {
  it('bots actually land slaps when nobody is playing', () => {
    // All 134 tests passed while bots were generating slap decisions that nothing
    // ever executed, so the solo game only ever pushed. This pins that path.
    const sim = new SlapSim({ localId: 'me', authoritative: true, scoreToWin: 3 });
    sim.addPlayer({ id: 'me', name: 'Me', color: '#4dabf7' });
    for (let i = 1; i <= 3; i++) sim.addPlayer({ id: `bot_${i}`, name: `Bot ${i}`, color: '#ff5d5d', isBot: true });
    const botSlaps: string[] = [];
    const hits: string[] = [];
    sim.onEvent = (e) => {
      if (e.kind === 'slap' && e.playerId.startsWith('bot_')) botSlaps.push(e.playerId);
      if (e.kind === 'hit') hits.push(e.victimId);
    };
    sim.startCountdown(0);
    for (let i = 0; i < 60 * 30 && botSlaps.length === 0; i++) sim.step(1 / 60);
    expect(botSlaps.length).toBeGreaterThan(0);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('a round produces a winner within two minutes of bot warfare', () => {
    const sim = new SlapSim({ localId: 'me', authoritative: true, scoreToWin: 1 });
    sim.addPlayer({ id: 'me', name: 'Me', color: '#4dabf7' });
    for (let i = 1; i <= 3; i++) sim.addPlayer({ id: `bot_${i}`, name: `Bot ${i}`, color: '#ff5d5d', isBot: true });
    sim.startCountdown(0);
    const kos: string[] = [];
    let i0 = 0;
    sim.onEvent = (e) => { if (e.kind === 'ko') kos.push(`${e.playerId}@${(i0 / 60).toFixed(0)}s`); };
    for (let i = 0; i < 60 * 120 && sim.state.phase !== 'ROUND_OVER' && sim.state.phase !== 'MATCH_OVER'; i++) {
      i0++;
      sim.step(1 / 60);
    }
    expect(kos.length).toBeGreaterThan(0);
    expect(['ROUND_OVER', 'MATCH_OVER']).toContain(sim.state.phase);
    expect(sim.state.winnerId).toBeTruthy();
  });
});

describe('Slap Arena stays inside the site CSP', () => {
  // The characters are built from three.js primitives, so the arena needs no
  // WebAssembly decoder and no blob: object URLs. This asserts that stays true:
  // re-adding a GLB pipeline would have to widen the policy, and that trade has to
  // be made on purpose, not by editing a string here.
  const csp = (() => {
    // vitest rewrites import.meta.url, so resolve from the repo root it runs in.
    const raw = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8');
    const entry = JSON.parse(raw).headers.flatMap((h: any) => h.headers ?? []).find((h: any) => h.key === 'Content-Security-Policy');
    return entry.value as string;
  })();

  it('needs no WebAssembly or blob exception', () => {
    expect(csp).not.toMatch(/wasm-unsafe-eval/);
    expect(csp).not.toMatch(/blob:/);
  });

  it('refuses arbitrary third-party script origins', () => {
    // style-src keeps 'unsafe-inline' on purpose: React writes style attributes
    // throughout the hub, so tightening it here would break unrelated pages.
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? '';
    const origins = [...scriptSrc.matchAll(/https?:\/\/([^\s';]+)/g)].map((m) => m[1]);
    expect(origins).toEqual(['va.vercel-scripts.com']);
  });

  it('ships no model files', () => {
    expect(existsSync(resolve(process.cwd(), 'public/models'))).toBe(false);
  });
});

describe('Slap Arena audio safety net', () => {
  it('does not throw when the browser refuses an AudioContext', async () => {
    const original = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
    vi.resetModules();
    const audio = await import('../../src/games/slap-arena/engine/audio');
    expect(() => {
      audio.unlockAudio();
      audio.playSlapSound();
      audio.playRoundWinSound();
    }).not.toThrow();
    Object.defineProperty(window, 'AudioContext', { value: original, configurable: true });
  });
});
