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
  if (opts.seats) q.set('seats', String(opts.seats));
  if (opts.size) q.set('size', opts.size);
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
  /**
   * Membaca log, bukan antrean recv: recvState bisa dibiarkan berjalan sambil tes lain mengirim
   * pesan, dan lewat antrean ia meninggalkan janji yang meledak setelah tes selesai. State pertama
   * sering datang sesaat setelah welcome, jadi log lama ikut diperiksa sebelum menunggu yang baru.
   */
  const recvState = (pred, ms = 8000) => new Promise((res, rej) => {
    const already = [...log].reverse().find((m) => m.t === 'state' && pred(m));
    if (already) return res(already);
    const seen = log.length;
    const poll = setInterval(() => {
      const hit = log.slice(seen).find((m) => m.t === 'state' && pred(m));
      if (hit) { clearTimeout(stop); clearInterval(poll); res(hit); }
    }, 25);
    const stop = setTimeout(() => {
      clearInterval(poll);
      rej(new Error('tidak ada state yang memenuhi syarat dalam batas waktu'));
    }, ms);
  });
  return { ws, recv, open, recvPhase, recvState, closes, queue, log, code, query: q.toString() };
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

test('kursi pemain yang keluar tanpa socket hidup dilepas, id yang sama bisa duduk lagi', async () => {
  const code = room('L');
  const first = await mint(code, { name: 'Fara' });
  const a = dial(code, { ticket: first.body.ticket });
  await a.open();
  await a.recv('welcome');
  a.ws.terminate();

  // dropSession berjalan async di DO; beri waktu sebelum mint ulang.
  await new Promise((r) => setTimeout(r, 400));
  const again = await mint(code, { player: first.body.playerId, name: 'Fara' });
  assert.equal(again.status, 200, `kursi harus bisa diduduki lagi, bukan jadi hantu: ${JSON.stringify(again.body)}`);
  assert.equal(again.body.playerId, first.body.playerId);
});

test('kursi yang ditinggalkan tidak menggembungkan kamar sampai penuh', async () => {
  const code = room('P');
  const sockets = [];
  for (let i = 0; i < 6; i += 1) {
    const c = await connect(code, { name: `K${i}` });
    await c.open();
    await c.recv('welcome');
    sockets.push(c);
  }
  for (let i = 0; i < 5; i += 1) sockets[i].ws.terminate();
  await new Promise((r) => setTimeout(r, 400));
  const newcomer = await mint(code, { name: 'Baru' });
  assert.equal(newcomer.status, 200, `kursi pemain yang pergi harus dilepas: ${JSON.stringify(newcomer.body)}`);
  const back = dial(code, { ticket: newcomer.body.ticket });
  await back.open();
  await back.recv('welcome');
  back.ws.terminate();
  sockets[5].ws.terminate();
});

test('ambil alih kursi di tengah game tidak menghapus pemain dari dunia', async () => {
  const code = room('M');
  const first = await mint(code, { name: 'Gita' });
  const a = dial(code, { ticket: first.body.ticket });
  await a.open();
  const wa = await a.recv('welcome');
  const other = await mint(code, { name: 'Hana' });
  const b = dial(code, { ticket: other.body.ticket });
  await b.open();
  await b.recv('welcome');
  a.ws.send(JSON.stringify({ t: 'start' }));
  await a.recvPhase('playing');

  // Pemain membuka ulang halaman: kursi yang sama diambil alih socket baru, lalu peristiwa
  // close socket lama tiba. Dunia tetap harus memuat pemain itu dan inpunya tetap hidup.
  const again = await mint(code, { player: first.body.playerId });
  const a2 = dial(code, { ticket: again.body.ticket });
  await a2.open();
  await a2.recv('welcome');
  await new Promise((r) => setTimeout(r, 400));

  a2.ws.send(JSON.stringify({ t: 'setvx', vx: 10 }));
  const moved = await a2.recvState((m) => (m.world ?? []).some((p) => p.id === wa.id && p.x > 0));
  assert.ok(moved, 'pemain harus masih ada di dunia dan bisa bergerak setelah socket lamanya ditutup');
  a.ws.terminate(); b.ws.terminate(); a2.ws.terminate();
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

test('kamar yang semua pemainnya diam tetap menyiarkan dan memajukan dunia', async () => {
  const code = room('Q');
  const a = await connect(code, { name: 'Aina' });
  await a.open();
  const wa = await a.recv('welcome');
  const b = await connect(code, { name: 'Bella' });
  await b.open();
  await b.recv('welcome');

  a.ws.send(JSON.stringify({ t: 'start' }));
  await a.recvPhase('playing');
  a.ws.send(JSON.stringify({ t: 'setvx', vx: 10 }));
  await a.recvPhase('playing');

  // Setelah ini tidak ada satu byte pun yang dikirim dari klien.
  const mark = a.log.length;
  await new Promise((r) => setTimeout(r, 700));
  const quiet = a.log.slice(mark).filter((m) => m.t === 'state');
  const ticks = quiet.map((m) => m.tick);
  const last = quiet.at(-1)?.world?.find((p) => p.id === wa.id);
  assert.ok(quiet.length >= 5, `selama diam harus ada siaran dari server, dapat ${quiet.length}`);
  assert.ok(ticks.at(-1) > ticks[0], `tick harus naik sendiri: ${ticks[0]} -> ${ticks.at(-1)}`);
  assert.ok(last && last.x > 0, `dunia harus maju tanpa input, x=${last?.x}`);
  a.ws.terminate(); b.ws.terminate();
});

test('banjir tiga puluh input tidak menghasilkan tiga puluh siaran', async () => {
  const code = room('R');
  const a = await connect(code, { name: 'Candra' });
  await a.open();
  await a.recv('welcome');
  const b = await connect(code, { name: 'Dina' });
  await b.open();
  await b.recv('welcome');

  a.ws.send(JSON.stringify({ t: 'start' }));
  await a.recvPhase('playing');

  const mark = a.log.length;
  const sent = 30;
  for (let i = 0; i < sent; i += 1) {
    a.ws.send(JSON.stringify({ t: 'setvx', vx: i % 2 ? 5 : -5 }));
  }
  await new Promise((r) => setTimeout(r, 400));
  const states = a.log.slice(mark).filter((m) => m.t === 'state');
  assert.ok(states.length >= 3, `400 ms harus berisi beberapa tick, dapat ${states.length}`);
  assert.ok(states.length <= sent / 2, `siaran ${states.length} untuk ${sent} input: siaran masih menempel ke pesan masuk`);
  a.ws.terminate(); b.ws.terminate();
});

/** Dua kursi sampai laga berjalan, dipakai tes metrik supaya tidak mengulang perakitan. */
async function table(name) {
  const code = room(name);
  const a = await connect(code, { name: `${name}A` });
  await a.open();
  const wa = await a.recv('welcome');
  const b = await connect(code, { name: `${name}B` });
  await b.open();
  await b.recv('welcome');
  a.ws.send(JSON.stringify({ t: 'start' }));
  await a.recvPhase('playing');
  return { code, a, b, seat: wa.seat };
}

test('pesan state membawa peta applied dan held untuk tiap kursi', async () => {
  const c = await connect(room('M1'), { name: 'Amin' });
  await c.open();
  await c.recv('welcome');
  const st = await c.recv('state');
  assert.ok(st.applied && typeof st.applied === 'object', 'state harus punya peta applied');
  assert.ok(st.held && typeof st.held === 'object', 'state harus punya peta held');
  assert.equal(st.applied[0], 0);
  assert.equal(st.held[0], 0);
  c.ws.terminate();
});

test('applied naik saat aksi dieksekusi dan held mencatat tahanan di dalam server', async () => {
  const { a, b, seat } = await table('M2');
  const t0 = Date.now();
  a.ws.send(JSON.stringify({ t: 'setvx', vx: 3, seq: 1 }));
  const seen = await a.recvState((s) => (s.applied?.[seat] ?? 0) >= 1);
  assert.equal(seen.applied[seat], 1);
  assert.ok(seen.held[seat] >= 0 && seen.held[seat] < 120, `held harus di dalam satu tick, dapat ${seen.held[seat]} ms`);
  assert.ok(Date.now() - t0 < 2000, 'applied harus terlihat dalam dua detik');
  a.ws.terminate(); b.ws.terminate();
});

test('applied tidak pernah mundur walau seq lebih kecil datang kemudian', async () => {
  const { a, b, seat } = await table('M3');
  a.ws.send(JSON.stringify({ t: 'setvx', vx: 2, seq: 7 }));
  await a.recvState((s) => (s.applied?.[seat] ?? 0) >= 7);
  a.ws.send(JSON.stringify({ t: 'setvx', vx: 2, seq: 3 }));
  const after = await a.recvState(() => true);
  assert.equal(after.applied[seat], 7, 'seq lama tidak boleh menarik applied mundur');
  a.ws.terminate(); b.ws.terminate();
});

test('aksi yang ditolak tidak menggeser applied', async () => {
  const { a, b, seat } = await table('M4');
  a.ws.send(JSON.stringify({ t: 'setvx', vx: 999, seq: 4 }));
  assert.equal((await a.recv('error')).reason, 'out_of_range');
  const st = await a.recvState(() => true);
  assert.ok(st.applied, 'state harus punya applied');
  assert.equal(st.applied[seat], 0, 'aksi yang tidak dieksekusi tidak boleh ditandai diterapkan');
  a.ws.terminate(); b.ws.terminate();
});

const SLAP = 'slap-arena';
const moveInput = (seq, x = 0, z = 0) => ({ t: 'input', seq, input: { x, z, slap: false, dash: false } });

/** Dua kursi pada game nyata, lewat mint dan handshake yang sama seperti game lain. */
async function slapTable(tag) {
  const code = room(tag);
  const a = await connect(code, { name: 'Salma', game: SLAP });
  await a.open();
  const wa = await a.recv('welcome');
  const b = await connect(code, { name: 'Tasya', game: SLAP });
  await b.open();
  const wb = await b.recv('welcome');
  return { code, a, b, wa, wb };
}

test('kamar slap-arena menyambut dua brawlers ke lorong lewat dunia nyata', async () => {
  const { a, b, wa, wb } = await slapTable('G1');
  const st = await a.recvState((s) => s.phase === 'lobby');
  assert.ok(Array.isArray(st.world?.players), `world harus berisi pemain, dapat ${JSON.stringify(st.world)}`);
  const ids = st.world.players.map((p) => p.id);
  assert.ok(ids.includes(wa.id) && ids.includes(wb.id), `dua kursi harus duduk di dunia: ${ids.join(', ')}`);
  assert.equal(st.world.phase, 'WAITING');
  assert.equal(st.master, wa.id, 'master adalah yang pertama duduk, sama seperti dihitung pintunya');
  a.ws.terminate(); b.ws.terminate();
});

test('start di game nyata hanya untuk master dan sisanya lewat pintu', async () => {
  const { a, b, wa, wb } = await slapTable('G2');
  await a.recvState((s) => s.phase === 'lobby');
  b.ws.send(JSON.stringify({ t: 'start' }));
  assert.equal((await b.recv('error')).reason, 'unknown_player', 'bukan master tidak boleh mulai');

  a.ws.send(JSON.stringify({ t: 'start' }));
  const st = await a.recvState((s) => s.world?.phase !== 'WAITING');
  assert.ok(['COUNTDOWN', 'BATTLE'].includes(st.world.phase), `fase harus bergerak dari WAITING, dapat ${st.world.phase}`);
  assert.equal(st.phase, 'playing', 'fase DO ikut game berpintu');
  a.ws.terminate(); b.ws.terminate();
});

test('input gerakan nyata masuk ke dunia dan applied mengikutinya', async () => {
  const { a, b, wa } = await slapTable('G3');
  a.ws.send(JSON.stringify({ t: 'start' }));
  await a.recvState((s) => s.phase === 'playing');
  a.ws.send(JSON.stringify(moveInput(1, 1, 0)));
  const st = await a.recvState((s) => (s.applied?.[wa.seat] ?? 0) >= 1);
  assert.equal(st.applied[wa.seat], 1);
  const me = st.world.players.find((p) => p.id === wa.id);
  assert.ok(me, `dunia harus mengenal kursi saya: ${JSON.stringify(st.world.players.map((p) => p.id))}`);

  await new Promise((r) => setTimeout(r, 2500));
  const later = await a.recvState((s) => s.world?.phase === 'BATTLE', 12000);
  assert.ok(later.world.players.length === 2, 'dua brawlers harus masih berdiri di arena');
  a.ws.terminate(); b.ws.terminate();
});

test('payload jahat ditolak pintu dan tidak menyentuh dunia', async () => {
  const { a, b, wa } = await slapTable('G4');
  a.ws.send(JSON.stringify({ t: 'start' }));
  await a.recvState((s) => s.phase === 'playing');
  a.ws.send(JSON.stringify(moveInput(1, 1, 0)));
  await a.recvState((s) => (s.applied?.[wa.seat] ?? 0) >= 1);

  a.ws.send(JSON.stringify(moveInput(2, 5, 0)));
  assert.equal((await a.recv('error')).reason, 'bad_payload', 'x di luar rentang harus tertahan di pintu');
  const st = await a.recvState(() => true);
  assert.equal(st.applied[wa.seat], 1, 'aksi yang ditolak tidak boleh menaikkan applied');

  a.ws.send(JSON.stringify(moveInput(1, 0, 0)));
  assert.equal((await a.recv('error')).reason, 'duplicate_seq');
  a.ws.terminate(); b.ws.terminate();
});

test('efek lahir di server dan ikut terbit lewat fx', async () => {
  const { a, b } = await slapTable('G5');
  const lobby = await a.recvState((s) => s.phase === 'lobby');
  assert.ok(Array.isArray(lobby.fx), `state harus punya array fx, dapat ${JSON.stringify(lobby.fx)}`);
  assert.equal(lobby.fx.length, 0, 'lorong belum menghasilkan efek apa pun');

  a.ws.send(JSON.stringify({ t: 'start' }));
  const started = await a.recvState((s) => s.fx.some((e) => e.kind === 'roundStart'), 12000);
  const round = started.fx.find((e) => e.kind === 'roundStart');
  assert.equal(typeof round.round, 'number', `event ronde harus membawa nomornya: ${JSON.stringify(round)}`);
  // State berikutnya, bukan state yang sama: recvState mengambil yang terbaru dan itu masih
  // membawa event yang baru saja terbit.
  const after = await a.recvState((s) => s.tick > started.tick, 4000);
  assert.deepEqual(after.fx, [], 'event yang sudah terbit tidak boleh ikut siaran tick berikutnya');
  a.ws.terminate(); b.ws.terminate();
});

test('mint menerima id usulan 128 bit dan menolak id yang pendek', async () => {
  const code = room('P1');
  const mine = 'a'.repeat(32);
  const proposed = await mint(code, { name: 'Prop', player: mine });
  assert.equal(proposed.status, 200);
  assert.equal(proposed.body.playerId, mine, 'id usulan yang sah harus dipakai apa adanya');
  const short = await mint(code, { name: 'Pendek', player: 'abc123' });
  assert.equal(short.status, 400);
  assert.equal(short.body.error, 'bad_player');
  const c = dial(code, { ticket: proposed.body.ticket });
  await c.open();
  const w = await c.recv('welcome');
  assert.equal(w.id, mine, 'welcome harus membawa id yang sama dengan yang diusulkan');
  c.ws.terminate();
});

test('jawaban HTTP membawa header CORS untuk origin yang diizinkan', async () => {
  const code = room('C1');
  const mint = await fetch(`${BASE}/room/${code}/ticket?game=selftest&name=Cors`, { method: 'POST', headers: { origin: ORIGIN } });
  assert.equal(mint.status, 200);
  assert.equal(mint.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(mint.headers.get('vary') ?? '', /Origin/);
  const health = await fetch(`${BASE}/health`, { headers: { origin: ORIGIN } });
  assert.equal(health.headers.get('access-control-allow-origin'), ORIGIN);
  const pre = await fetch(`${BASE}/room/${code}/ticket`, { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods') ?? '', /POST/);
});

/* ------------------------------------------------------------------ */
/* Bomberman on the same door                                          */
/* ------------------------------------------------------------------ */

const BOMBER = 'bomberman';

/** Two seats on a real Bomberman room, with the board settings the lobby would send. */
async function bomberTable(tag, opts = {}) {
  const code = room(tag);
  const a = await connect(code, { name: 'BomA', game: BOMBER, ...opts });
  await a.open();
  const wa = await a.recv('welcome');
  const b = await connect(code, { name: 'BomB', game: BOMBER, ...opts });
  await b.open();
  const wb = await b.recv('welcome');
  return { code, a, b, wa, wb };
}

test('kamar bomberman membawa pengaturan papan dari mint pertama', async () => {
  const { a, b, wa } = await bomberTable('H1', { seats: 2, size: 'besar' });
  assert.deepEqual(wa.config, { seats: 2, size: 'besar', teams: false }, `welcome harus membawa config papan: ${JSON.stringify(wa.config)}`);
  const lobby = await a.recvState((s) => s.phase === 'lobby');
  assert.equal(lobby.world, null, 'lorong bomberman belum punya dunia');
  assert.equal(lobby.players.length, 2);
  assert.ok(lobby.players.every((p) => typeof p.seat === 'number'), 'state harus membawa kursi tiap pemain');
  assert.equal(lobby.master, wa.id, 'master adalah yang pertama duduk');
  a.ws.terminate(); b.ws.terminate();
});

test('kapasitas bomberman mengikuti papan, bukan enam kursi transport', async () => {
  const two = room('H2');
  assert.equal((await mint(two, { game: BOMBER, seats: 2, name: 'A' })).status, 200);
  assert.equal((await mint(two, { game: BOMBER, seats: 2, name: 'B' })).status, 200);
  const third = await mint(two, { game: BOMBER, seats: 2, name: 'C' });
  assert.equal(third.status, 409, `kursi ketiga di papan dua harus ditolak: ${JSON.stringify(third.body)}`);
  assert.equal(third.body.error, 'room_full');

  const four = room('H3');
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await mint(four, { game: BOMBER, seats: 4, name: `P${i}` })).status, 200);
  }
  const fifth = await mint(four, { game: BOMBER, seats: 4, name: 'P4' });
  assert.equal(fifth.status, 409);
  assert.equal(fifth.body.error, 'room_full');
});

test('pengaturan papan yang berbeda di kamar yang sama ditolak', async () => {
  const code = room('H4');
  assert.equal((await mint(code, { game: BOMBER, seats: 2, size: 'kecil', name: 'A' })).status, 200);
  const changed = await mint(code, { game: BOMBER, seats: 4, size: 'besar', name: 'B' });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error, 'options_conflict');
});

test('hanya master yang boleh memulai, dan dunia bomberman lahir di server', async () => {
  const { a, b, wa } = await bomberTable('H5', { seats: 2 });
  await a.recvState((s) => s.phase === 'lobby');

  b.ws.send(JSON.stringify({ t: 'start', fillBots: false }));
  assert.equal((await b.recv('error')).reason, 'not_master', 'bukan master tidak boleh mulai');

  a.ws.send(JSON.stringify({ t: 'start', fillBots: false }));
  const started = await a.recvState((s) => s.phase === 'playing');
  assert.ok(started.world, `state harus membawa dunia setelah mulai: ${JSON.stringify(started.world)}`);
  assert.equal(started.world.phase, 'countdown');
  assert.deepEqual(started.world.players.map((p) => p.seat), [0, 1]);
  assert.equal(started.world.players.find((p) => p.seat === wa.seat)?.name, 'BomA');

  // The countdown is owned by the server clock; nobody sends anything after start.
  const battle = await a.recvState((s) => s.world?.phase === 'battle', 9000);
  assert.equal(battle.phase, 'playing');
  a.ws.terminate(); b.ws.terminate();
});

test('input bomberman bergerak dan applied menandai aksi yang dieksekusi', async () => {
  const { a, b, wa } = await bomberTable('H6', { seats: 2 });
  a.ws.send(JSON.stringify({ t: 'start', fillBots: false }));
  await a.recvState((s) => s.phase === 'playing');

  a.ws.send(JSON.stringify({ t: 'input', seq: 1, dir: 'right', bomb: false }));
  const applied = await a.recvState((s) => (s.applied?.[wa.seat] ?? 0) >= 1);
  assert.equal(applied.applied[wa.seat], 1);

  const moved = await a.recvState(
    (s) => s.world?.phase === 'battle' && (s.world.players.find((p) => p.seat === wa.seat)?.x ?? 1) > 1,
    9000,
  );
  assert.equal(moved.world.players.find((p) => p.seat === wa.seat)?.facing, 'right');
  a.ws.terminate(); b.ws.terminate();
});

test('payload bomberman yang jahat tertahan di pintu dan tidak menggeser applied', async () => {
  const { a, b, wa } = await bomberTable('H7', { seats: 2 });
  a.ws.send(JSON.stringify({ t: 'start', fillBots: false }));
  await a.recvState((s) => s.phase === 'playing');
  a.ws.send(JSON.stringify({ t: 'input', seq: 1, dir: 'left', bomb: false }));
  await a.recvState((s) => (s.applied?.[wa.seat] ?? 0) >= 1);

  a.ws.send(JSON.stringify({ t: 'input', seq: 2, dir: 'sideways', bomb: false }));
  assert.equal((await a.recv('error')).reason, 'bad_payload');
  a.ws.send(JSON.stringify({ t: 'input', seq: 1, dir: 'right', bomb: false }));
  assert.equal((await a.recv('error')).reason, 'duplicate_seq');

  await new Promise((r) => setTimeout(r, 150));
  const after = await a.recvState(() => true);
  assert.equal(after.applied[wa.seat], 1, 'aksi yang ditolak tidak boleh menandai seq sebagai diterapkan');
  a.ws.terminate(); b.ws.terminate();
});

test('kursi kosong diisi bot di server, bukan oleh tab master', async () => {
  const code = room('H8');
  const a = await connect(code, { name: 'Solo', game: BOMBER, seats: 2 });
  await a.open();
  await a.recv('welcome');
  a.ws.send(JSON.stringify({ t: 'start', fillBots: true }));
  const started = await a.recvState((s) => s.phase === 'playing');
  assert.equal(started.world.players.length, 2);
  const bot = started.world.players.find((p) => p.seat === 1);
  assert.equal(bot.bot, true, `kursi kedua harus bot: ${JSON.stringify(started.world.players)}`);
  assert.equal(bot.name, 'Bot 2');
  a.ws.terminate();
});

test('klaim karakter dari lorong masuk ke dunia yang dibuat server', async () => {
  const { a, b, wa, wb } = await bomberTable('H9', { seats: 2 });
  a.ws.send(JSON.stringify({ t: 'char', charId: 'radar' }));
  b.ws.send(JSON.stringify({ t: 'char', charId: 'lampu' }));
  // Both claims are on the wire before this start; WebSocket order is preserved per socket,
  // and the small pause covers the two sockets racing each other.
  await new Promise((r) => setTimeout(r, 120));
  a.ws.send(JSON.stringify({ t: 'start', fillBots: false }));
  const started = await a.recvState((s) => s.phase === 'playing');
  assert.equal(started.world.players.find((p) => p.seat === wa.seat)?.charId, 'radar');
  assert.equal(started.world.players.find((p) => p.seat === wb.seat)?.charId, 'lampu');
  a.ws.terminate(); b.ws.terminate();
});

test('pemain yang menyambung ulang memakai kursi yang sama dan mengambil alih botnya', async () => {
  const { code, a, b, wb } = await bomberTable('HA', { seats: 2 });
  a.ws.send(JSON.stringify({ t: 'start', fillBots: false }));
  await a.recvState((s) => s.phase === 'playing');

  b.ws.terminate();
  await new Promise((r) => setTimeout(r, 450));
  // The seat row survives a mid-match close, so a reconnect mints the same seat rather than
  // a second one next to a bot.
  const again = await mint(code, { game: BOMBER, seats: 2, player: wb.id, name: 'BomB' });
  assert.equal(again.status, 200, `mint ulang harus dapat kursi: ${JSON.stringify(again.body)}`);
  assert.equal(again.body.seat, wb.seat, 'reconnect harus memakai kursi yang sama');

  const b2 = dial(code, { ticket: again.body.ticket });
  await b2.open();
  await b2.recv('welcome');
  const taken = await b2.recvState((s) => s.world?.players.find((p) => p.seat === wb.seat)?.bot === false, 6000);
  assert.equal(taken.world.players.find((p) => p.seat === wb.seat)?.name, 'BomB');

  b2.ws.send(JSON.stringify({ t: 'input', seq: 1, dir: 'left', bomb: false }));
  const applied = await b2.recvState((s) => (s.applied?.[wb.seat] ?? 0) >= 1);
  assert.equal(applied.applied[wb.seat], 1, 'kursi yang diambil alih harus menerima input lagi');
  a.ws.terminate(); b2.ws.terminate();
});
