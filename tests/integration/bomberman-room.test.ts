import { describe, expect, it } from 'vitest';

import { BombermanSim } from '@/games/bomberman/engine/sim';
import { BombermanBot } from '@/games/bomberman/engine/ai';
import { boardFor } from '@/games/bomberman/engine/types';
import type { FloorKind } from '@/games/bomberman/engine/types';

/**
 * What has to hold for a room to work at all.
 *
 * The database row carries a seed and a roster, never a world: the host broadcasts the
 * world. So the property worth testing against the real protocol is that a client given
 * only that config rebuilds the identical arena, and that the config stays inside the
 * 64 kB game_state budget the trigger enforces.
 */

interface RoomConfig {
  gameType: 'bomberman';
  seed: string;
  floor: FloorKind;
  seats: number;
  roster: { seat: number; name: string; charId: string; bot: boolean }[];
}

const configFor = (seats: number, seed: string, floor: FloorKind = 'grass'): RoomConfig => {
  const board = boardFor(seats);
  return {
    gameType: 'bomberman',
    seed,
    floor,
    seats: board.seats,
    roster: Array.from({ length: board.seats }, (_, i) => ({
      seat: i,
      name: `P${i}`,
      charId: ['robo', 'tupai', 'radar', 'biskuit'][i % 4],
      bot: i > 0,
    })),
  };
};

const fromConfig = (cfg: RoomConfig): BombermanSim => {
  const board = boardFor(cfg.seats);
  return new BombermanSim({
    seats: board.seats,
    seed: cfg.seed,
    floor: cfg.floor,
    players: cfg.roster.map((r) => ({ seat: r.seat, name: r.name, charId: r.charId, bot: r.bot })),
  });
};

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

describe('room config handshake', () => {
  it('rebuilds the identical arena on a second device', () => {
    for (const seats of [2, 4]) {
      const cfg = configFor(seats, 'handshake-seed');
      const host = fromConfig(cfg);
      const client = fromConfig(cfg);
      expect(client.state.grid).toEqual(host.state.grid);
      expect(client.state.cols).toBe(host.state.cols);
      expect(client.state.rows).toBe(host.state.rows);
      expect(client.state.players.map((p) => [p.x, p.y, p.charId])).toEqual(
        host.state.players.map((p) => [p.x, p.y, p.charId]),
      );
    }
  });

  it('is small enough for the 64 kB game_state budget', () => {
    const cfg = configFor(4, 'x'.repeat(12));
    expect(bytes(cfg)).toBeLessThan(2048);
  });

  it('carries no per-frame state, because the row is written on lifecycle only', () => {
    const cfg = configFor(4, 'lifecycle') as unknown as Record<string, unknown>;
    for (const frameKey of ['grid', 'bombs', 'flames', 'powers', 'players']) {
      expect(cfg).not.toHaveProperty(frameKey);
    }
    expect(cfg.roster).toBeInstanceOf(Array);
  });

  it('grows the arena with the seat count', () => {
    expect(fromConfig(configFor(2, 'a')).state.cols).toBe(11);
    expect(fromConfig(configFor(4, 'b')).state.cols).toBe(15);
    expect(fromConfig(configFor(4, 'b')).state.rows).toBe(11);
  });
});

describe('host and client agree after a match', () => {
  it('a snapshot applied on a client reproduces the host board', () => {
    const host = fromConfig(configFor(2, 'sync'));
    const client = fromConfig(configFor(2, 'sync'));
    const brains = host.state.players.filter((p) => p.bot).map((p) => new BombermanBot(p.seat, 'sedang'));

    for (let i = 0; i < 60 * 12; i++) {
      for (const brain of brains) host.setInput(brain.seat, brain.update(host.state, 1 / 60));
      host.setInput(0, { dir: i % 90 === 0 ? 'right' : null, bomb: false, seq: 0 });
      host.step(1 / 60);
    }

    client.applySnapshot(host.snapshot());
    expect(client.state.grid).toEqual(host.state.grid);
    expect(client.state.round).toBe(host.state.round);
    expect(client.state.players.map((p) => [p.x, p.y, p.alive, p.wins])).toEqual(
      host.state.players.map((p) => [p.x, p.y, p.alive, p.wins]),
    );
  });

  it('survives a client applying a stale frame after a fresh one', () => {
    const host = fromConfig(configFor(2, 'stale'));
    const client = fromConfig(configFor(2, 'stale'));
    const early = host.snapshot();
    for (let i = 0; i < 300; i++) host.step(1 / 60);
    const late = host.snapshot();

    client.applySnapshot(late);
    client.applySnapshot(early);
    // The link drops an older frame before it ever reaches applySnapshot; applied out of
    // order it must still be a board the host actually had, never a torn mixture.
    expect(client.state.grid).toEqual(early.grid);
    expect(JSON.stringify(client.state)).not.toBe(JSON.stringify(late));
  });

  it('can be rebuilt from a world frame alone, before any lifecycle sync', () => {
    // A broadcast can overtake this tab's first room sync. The page then has the world
    // but no readable game_state yet, and used to read .seats off a null config.
    const host = fromConfig(configFor(2, 'frame-first'));
    for (let i = 0; i < 400; i++) host.step(1 / 60);
    const frame = host.snapshot();

    const late = new BombermanSim({
      seats: frame.seats,
      seed: frame.seed,
      floor: frame.floor,
      players: frame.players.map((p) => ({ seat: p.seat, name: p.name, charId: p.charId, bot: p.bot })),
    });
    expect(() => late.applySnapshot(frame)).not.toThrow();
    expect(late.state.grid).toEqual(frame.grid);
    expect(late.state.players.map((p) => [p.seat, p.x, p.y])).toEqual(frame.players.map((p) => [p.seat, p.x, p.y]));
  });

  it('finishes with exactly one winner and a result that fits the row', () => {
    const host = fromConfig(configFor(2, 'finish'));
    const brains = host.state.players.filter((p) => p.bot).map((p) => new BombermanBot(p.seat, 'sempurna'));
    let guard = 0;
    while (host.state.phase !== 'finished' && guard++ < 60 * 60 * 6) {
      for (const brain of brains) host.setInput(brain.seat, brain.update(host.state, 1 / 60));
      host.step(1 / 60);
    }
    expect(host.state.phase).toBe('finished');
    expect(host.state.winner).not.toBeNull();
    // A round can now end on the clock with everybody alive, so the invariant is about
    // the score, not about survivors: the champion is the seat that won enough rounds.
    const champion = host.state.players.find((p) => p.seat === host.state.winner);
    expect(champion?.wins).toBeGreaterThanOrEqual(host.state.scoreToWin);
    expect(host.state.players.filter((p) => p.alive).length).toBeLessThanOrEqual(host.state.seats);
    expect(bytes({ winner: host.state.winner, round: host.state.round })).toBeLessThan(128);
  });
});
