import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const BASE = process.env.ROOM_BASE || 'http://localhost:8787';
const WSBASE = BASE.replace(/^http/, 'ws');
const ORIGIN = 'http://localhost:5199';
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
const room = (n) => `R${RUN}${n}`;

/** Semua socket dicatat supaya runner bisa keluar bersih tanpa menunggu socket mati sendiri. */
const opened = [];
after(() => {
  for (const ws of opened) {
    try {
      ws.terminate();
    } catch {
      /* sudah mati */
    }
  }
});

/** Tiket selalu dari server; tes tidak pernah mengirim id atau nama mentah ke jalur ws. */
async function mint(code, opts = {}) {
  const q = new URLSearchParams({ game: opts.game ?? 'selftest' });
  if (opts.name) q.set('name', opts.name);
  if (opts.player) q.set('player', opts.player);
  if (opts.ttl) q.set('ttl', String(opts.ttl));
  const res = await fetch(`${BASE}/room/${code}/ticket?${q}`, {
    method: 'POST',
    headers: { origin: ORIGIN },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function dial(code, query) {
  const q = new URLSearchParams(query);
  const ws = new WebSocket(`${WSBASE}/room/${code}/ws?${q}`, { origin: ORIGIN });
  opened.push(ws);
  const queue = [];
  const waiters = [];
  const closes = [];
  /** Semua pesan yang pernah masuk, supaya tes bisa menghitung yang datang setelah titik tertentu. */
  const log = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    log.push(msg);
    const w = waiters.shift();
    if (w) w(msg); else queue.push(msg);
  };
  ws.onclose = (info) => closes.push(info);
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
  return { ws, recv, open, recvPhase, closes, queue, log, code, query: q.toString() };
}

/** Masuk kamar lewat jalur sah: mint tiket lalu pakai untuk handshake. */
async function connect(code, opts = {}) {
  const ticket = await mint(code, opts);
  if (ticket.status !== 200) throw new Error(`mint gagal ${ticket.status}: ${JSON.stringify(ticket.body)}`);
  return dial(code, { ticket: ticket.body.ticket, ...opts.wsQuery });
}

/** Hadiah handshake tanpa menerima socket: 'terbuka' atau teks error. */
const handshake = (code, query, origin = ORIGIN) => new Promise((res) => {
  const q = new URLSearchParams(query);
  const ws = new WebSocket(`${WSBASE}/room/${code}/ws?${q}`, { origin });
  opened.push(ws);
  ws.onerror = (e) => res(String(e.message || e));
  ws.onopen = () => { ws.terminate(); res('terbuka'); };
  setTimeout(() => res('timeout'), 5000);
});

/** Alasan penolacan dibaca lewat probe, satu-satunya cara melihat body tanpa socket. */
async function probeReason(code, ticket) {
  const q = new URLSearchParams({ probe: '1' });
  if (ticket !== null) q.set('ticket', ticket);
  const res = await fetch(`${BASE}/room/${code}/ws?${q}`, { headers: { origin: ORIGIN } });
  return { status: res.status, reason: (await res.json().catch(() => null))?.reason };
}

const forged = 'v1:ABCDEF012345:00000000000000000000000000000000:selftest:9999999999.' + '0'.repeat(64);

test('origin asing ditolak 403', async () => {
  assert.match(await handshake(room('A'), {}, 'https://evil.example'), /403/);
});

test('tanpa upgrade ditolak 426', async () => {
  const res = await fetch(`${BASE}/room/${room('B')}/ws`, { headers: { origin: ORIGIN } });
  assert.equal(res.status, 426);
});

test('path di luar /room/<kode> 404', async () => {
  const res = await fetch(`${BASE}/room/ab/ws`, { headers: { origin: ORIGIN } });
  assert.equal(res.status, 404);
});

test('koneksi tanpa tiket ditolak, bukan dilayani kursi baru', async () => {
  const code = room('T');
  const first = await mint(code, { name: 'Tari' });
  assert.equal(first.status, 200, 'mint pertama harus berhasil');
  const got = await handshake(code, {});
  assert.match(got, /401/, `tanpa tiket seharusnya ditolak, dapat: ${got}`);
  assert.equal((await probeReason(code, null)).reason, 'missing_ticket');
});

test('tiket dengan tanda tangan palsu ditolak', async () => {
  const code = room('U');
  assert.equal((await mint(code, { name: 'Umar' })).status, 200, 'kamar harus punya tiket sah lebih dulu');
  const got = await handshake(code, { ticket: forged });
  assert.match(got, /401/, `tiket palsu seharusnya ditolak, dapat: ${got}`);
  assert.equal((await probeReason(code, forged)).reason, 'bad_signature');
});

test('tiket yang dipakai di kamar lain ditolak', async () => {
  const mine = await mint(room('V'), { name: 'Vina' });
  assert.equal(mine.status, 200, 'mint di kamar asal harus berhasil');
  const other = room('W');
  assert.equal((await mint(other, { name: 'Wati' })).status, 200, 'kamar sasaran harus hidup lebih dulu');
  const got = await handshake(other, { ticket: mine.body.ticket });
  assert.match(got, /401/, `tiket kamar lain tidak boleh masuk, dapat: ${got}`);
  assert.equal((await probeReason(other, mine.body.ticket)).reason, 'wrong_room');
});

test('tiket kedaluwarsa ditolak saat connect', async () => {
  const code = room('X');
  const short = await mint(code, { name: 'Xena', ttl: 1 });
  assert.equal(short.status, 200);
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal((await probeReason(code, short.body.ticket)).reason, 'expired');
  assert.match(await handshake(code, { ticket: short.body.ticket }), /401/);
});

test('tiket yang kedaluwarsa di tengah sesi menutup socket dengan 4001', async () => {
  const c = await connect(room('Y'), { name: 'Yuda', ttl: 1 });
  await c.open();
  await c.recv('welcome');
  await new Promise((r) => setTimeout(r, 1300));
  c.ws.send(JSON.stringify({ t: 'ping', ts: 1 }));
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(c.closes.at(-1)?.code, 4001, `harus ditutup 4001, dapat ${JSON.stringify(c.closes)}`);
});

test('welcome membawa id, kursi, dan jatuh tempo; pembuat kamar jadi master', async () => {
  const c = await connect(room('C'), { name: 'Amin' });
  await c.open();
  const w = await c.recv('welcome');
  assert.ok(w.id && w.exp > 0);
  assert.equal(w.seat, 0);
  assert.equal(w.name, 'Amin');
  assert.equal(w.master, w.id);
  c.ws.terminate();
});

test('nama diambil dari tiket, bukan dari query koneksi', async () => {
  const code = room('N');
  const c = await connect(code, { name: 'Rina', wsQuery: { name: 'Peretas' } });
  await c.open();
  const w = await c.recv('welcome');
  assert.equal(w.name, 'Rina');
  c.ws.terminate();
});

test('game terkunci pada mint pertama', async () => {
  const code = room('K');
  assert.equal((await mint(code, { game: 'selftest' })).status, 200);
  const second = await mint(code, { game: 'bomberman' });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'game_conflict');
});

test('mint dengan id pemain lama mengembalikan kursi yang sama', async () => {
  const code = room('F');
  const first = await mint(code, { name: 'Eka' });
  assert.equal(first.status, 200);
  const again = await mint(code, { player: first.body.playerId });
  assert.equal(again.status, 200);
  assert.equal(again.body.seat, first.body.seat);
  assert.equal(again.body.playerId, first.body.playerId);
});

test('kursi ketujuh ditolak saat mint', async () => {
  const code = room('G');
  const sockets = [];
  for (let i = 0; i < 6; i += 1) {
    const c = await connect(code, { name: `P${i}` });
    await c.open();
    await c.recv('welcome');
    sockets.push(c);
  }
  const seventh = await mint(code, { name: 'P7' });
  assert.equal(seventh.status, 409);
  assert.equal(seventh.body.error, 'room_full');
  for (const c of sockets) c.ws.terminate();
});

test('koneksi baru untuk kursi yang sama mengambil alih, socket lama berhenti menerima siaran', async () => {
  const code = room('S');
  const first = await mint(code, { name: 'Sari' });
  const a = dial(code, { ticket: first.body.ticket });
  await a.open();
  await a.recv('welcome');

  const second = await mint(code, { player: first.body.playerId });
  const b = dial(code, { ticket: second.body.ticket });
  await b.open();
  await b.recv('welcome');

  // Kursi tidak boleh dihitung dua kali: pendatang baru melihat dua kursi, bukan tiga.
  const third = await mint(code, { name: 'Tini' });
  const c = dial(code, { ticket: third.body.ticket });
  await c.open();
  const wc = await c.recv('welcome');
  assert.equal(wc.players.length, 2, `kursi lama tidak boleh dihitung dua kali: ${JSON.stringify(wc.players)}`);
  assert.equal(wc.players.filter((p) => p.id === first.body.playerId).length, 1);

  // Socket yang kalah tidak boleh ikut dapat siaran lagi.
  const seen = a.log.length;
  const fourth = await mint(code, { name: 'Upik' });
  const d = dial(code, { ticket: fourth.body.ticket });
  await d.open();
  await d.recv('welcome');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(a.log.length, seen, 'socket lama masih menerima siaran setelah kursi diambil alih');

  assert.equal(first.body.playerId, second.body.playerId);
  a.ws.terminate();
  b.ws.terminate(); c.ws.terminate(); d.ws.terminate();
});

test('aksi sebelum mulai dibalas wrong_phase, start sendirian dibalas too_few_players', async () => {
  const c = await connect(room('D'), { name: 'Bima' });
  await c.open();
  await c.recv('welcome');
  c.ws.send(JSON.stringify({ t: 'setvx', vx: 4 }));
  assert.equal((await c.recv('error')).reason, 'wrong_phase');
  c.ws.send(JSON.stringify({ t: 'start' }));
  assert.equal((await c.recv('error')).reason, 'too_few_players');
  c.ws.terminate();
});

test('start dengan dua pemain mengubah fase dan dunia maju seiring waktu', async () => {
  const code = room('E');
  const a = await connect(code, { name: 'Citra' });
  await a.open();
  const wa = await a.recv('welcome');
  const b = await connect(code, { name: 'Dewi' });
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
