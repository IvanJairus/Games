import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const BASE = process.env.ROOM_BASE || 'http://localhost:8787';
const WSBASE = BASE.replace(/^http/, 'ws');
const ORIGIN = 'http://localhost:5199';
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
const room = (n) => `R${RUN}${n}`;

function connect(code, name, token, origin = ORIGIN) {
  const q = new URLSearchParams({ game: 'selftest', name });
  if (token) q.set('token', token);
  const ws = new WebSocket(`${WSBASE}/room/${code}/ws?${q}`, { origin });
  const queue = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    const w = waiters.shift();
    if (w) w(msg); else queue.push(msg);
  };
  const recv = (filter, ms = 6000) => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timeout menunggu ${filter ?? 'pesan'}`)), ms);
    const take = () => {
      const next = queue.shift();
      if (next && (!filter || next.t === filter)) { clearTimeout(timer); return res(next); }
      if (next) queue.push(next);
      waiters.push((m) => { if (!filter || m.t === filter) { clearTimeout(timer); res(m); } else take(); });
    };
    take();
  });
  const open = () => new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const recvPhase = (phase, ms = 8000) => new Promise((res, rej) => {
    const stop = setTimeout(() => rej(new Error(`tidak pernah melihat phase ${phase}`)), ms);
    const hunt = async () => {
      const m = await recv('state', ms);
      if (m.phase === phase) { clearTimeout(stop); return res(m); }
      return hunt();
    };
    hunt();
  });
  return { ws, recv, open, recvPhase };
}

const handshake = (code, origin) => new Promise((res) => {
  const ws = new WebSocket(`${WSBASE}/room/${code}/ws?game=selftest&name=X`, { origin });
  ws.onerror = (e) => res(String(e.message || e));
  ws.onopen = () => { ws.terminate(); res('terbuka'); };
  setTimeout(() => res('timeout'), 5000);
});

test('origin asing ditolak 403', async () => {
  assert.match(await handshake(room('A'), 'https://evil.example'), /403/);
});

test('tanpa upgrade ditolak 426', async () => {
  const res = await fetch(`${BASE}/room/${room('B')}/ws`, { headers: { origin: ORIGIN } });
  assert.equal(res.status, 426);
});

test('path di luar /room/<kode> 404', async () => {
  const res = await fetch(`${BASE}/room/ab/ws`, { headers: { origin: ORIGIN } });
  assert.equal(res.status, 404);
});

test('welcome membawa id dan token, pemain pertama jadi master', async () => {
  const c = connect(room('C'), 'Amin');
  await c.open();
  const w = await c.recv('welcome');
  assert.ok(w.id && w.token);
  assert.equal(w.master, w.id);
  c.ws.terminate();
});

test('aksi sebelum mulai dibalas wrong_phase, start sendirian dibalas too_few_players', async () => {
  const c = connect(room('D'), 'Bima');
  await c.open();
  await c.recv('welcome');
  c.ws.send(JSON.stringify({ t: 'setvx', vx: 4 }));
  assert.equal((await c.recv('error')).reason, 'wrong_phase');
  c.ws.send(JSON.stringify({ t: 'start' }));
  assert.equal((await c.recv('error')).reason, 'too_few_players');
  c.ws.terminate();
});

test('start dengan dua pemain mengubah fase dan dunia maju seiring waktu', async () => {
  const a = connect(room('E'), 'Citra');
  await a.open();
  const wa = await a.recv('welcome');
  const b = connect(room('E'), 'Dewi');
  await b.open();
  await b.recv('welcome');

  a.ws.send(JSON.stringify({ t: 'start' }));
  const s = await a.recvPhase('playing');
  assert.equal(s.players.length, 2);

  a.ws.send(JSON.stringify({ t: 'setvx', vx: 6 }));
  await a.recvPhase('playing');

  a.ws.send(JSON.stringify({ t: 'setvx', vx: 999 }));
  assert.equal((await a.recv('error')).reason, 'out_of_range');

  await new Promise((r) => setTimeout(r, 400));
  a.ws.send(JSON.stringify({ t: 'setvx', vx: 6 }));
  const w2 = await a.recvPhase('playing');
  const mine = w2.world.find((x) => x.id === wa.id);
  assert.ok(mine && mine.x > 0, `dunia harus maju, x=${mine?.x}`);
  a.ws.terminate(); b.ws.terminate();
});

test('token lama mengklaim kembali kursi yang sama', async () => {
  const a = connect(room('F'), 'Eka');
  await a.open();
  const first = await a.recv('welcome');
  a.ws.terminate();
  await new Promise((r) => setTimeout(r, 400));
  const again = connect(room('F'), 'Eka', first.token);
  await again.open();
  const second = await again.recv('welcome');
  assert.equal(second.id, first.id);
  again.ws.terminate();
});

test('kursi ke tujuh ditolak', async () => {
  const sockets = [];
  try {
    for (let i = 0; i < 6; i += 1) {
      const c = connect(room('G'), `P${i}`);
      await c.open();
      await c.recv('welcome');
      sockets.push(c);
    }
    assert.match(await handshake(room('G'), ORIGIN), /409/);
  } finally {
    for (const c of sockets) c.ws.terminate();
  }
});
