import type { GameAdapter } from '../types';

interface Body {
  x: number;
  vx: number;
}

/**
 * Dunia paling sederhana yang cukup untuk membuktikan tick, broadcast, dan validasi
 * tanpa menunggu adapter game sungguhan. Hanya terdaftar saat TEST_MODE = "1".
 */
export function selfTestGame(): GameAdapter {
  const bodies = new Map<string, Body>();
  let done = false;

  return {
    step(dt) {
      for (const b of bodies.values()) b.x += b.vx * dt;
    },
    apply(playerId, action) {
      const msg = action as { t?: string; vx?: number };
      if (msg.t !== 'setvx' || typeof msg.vx !== 'number' || !Number.isFinite(msg.vx)) {
        return { ok: false, reason: 'bad_payload' };
      }
      if (Math.abs(msg.vx) > 20) return { ok: false, reason: 'out_of_range' };
      const body = bodies.get(playerId) ?? { x: 0, vx: 0 };
      body.vx = msg.vx;
      bodies.set(playerId, body);
      if (body.x > 1000) done = true;
      return { ok: true };
    },
    snapshot() {
      return [...bodies.entries()].map(([id, b]) => ({ id, x: Math.round(b.x * 100) / 100, vx: b.vx }));
    },
    load(world) {
      const rows = Array.isArray(world) ? world : [];
      for (const r of rows) {
        if (typeof r?.id === 'string') bodies.set(r.id, { x: Number(r.x) || 0, vx: Number(r.vx) || 0 });
      }
    },
    removePlayer(playerId) {
      bodies.delete(playerId);
    },
    finished() {
      return done;
    },
  };
}
