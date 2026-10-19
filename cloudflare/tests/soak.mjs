#!/usr/bin/env node
/**
 * Harness untuk mengukur kamar Cloudflare dari sisi klien.
 *
 * Definisinya diambil dari netbench (src/client/metrics.ts): loop latency dihitung dari SATU jam,
 * jam klien sendiri. Klien mencatat t0 saat mengirim aksi bernomor seq, lalu membaca applied[seat]
 * pada state. Tidak ada timestamp server yang dipercaya, dan tidak ada sinkronisasi clock antar
 * mesin. `held` adalah waktu tahan di dalam pemegang sim, jadi ia memisahkan antrean server dari
 * perjalanan jaringan tanpa jam bersama.
 *
 * Pemakaian:
 *   node tests/soak.mjs --base http://localhost:8792 --seats 4 --seconds 30 --out /tmp/soak-local.csv
 */
import { WebSocket } from 'ws';
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = (arg('base', 'http://localhost:8787')).replace(/\/+$/, '');
const WSBASE = BASE.replace(/^http/, 'ws');
const SEATS = Math.min(6, Math.max(2, Number(arg('seats', 2))));
const SECONDS = Math.min(900, Math.max(1, Number(arg('seconds', 20))));
const OUT = arg('out', `/tmp/soak-${Date.now()}.csv`);
const ORIGIN = 'http://localhost:5199';
const SEND_MS = 50;
const TICK_MS = 50;
const code = `SOAK${Date.now().toString(36).slice(-6).toUpperCase()}`;

const now = () => performance.now();
const rows = [];
const push = (seat, kind, t, v) => rows.push({ seat, kind, t: Math.round((t - t00) * 10) / 10, v: Math.round(v * 100) / 100 });
let t00 = 0;

const mint = async (name) => {
  const res = await fetch(`${BASE}/room/${code}/ticket?game=selftest&name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { origin: ORIGIN },
  });
  if (!res.ok) throw new Error(`mint ${name} gagal ${res.status}: ${await res.text()}`);
  return res.json();
};

const connect = (ticket) =>
  new Promise((res, rej) => {
    const ws = new WebSocket(`${WSBASE}/room/${code}/ws?ticket=${ticket}`, { origin: ORIGIN });
    ws.onerror = (e) => rej(new Error(String(e.message || e)));
    ws.onopen = () => res(ws);
  });

const stats = (name, values) => {
  if (!values.length) return `${name.padEnd(22)} n=0`;
  const s = [...values].sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `${name.padEnd(22)} n=${String(s.length).padStart(4)}  p50=${p(0.5).toFixed(1)}  p90=${p(0.9).toFixed(1)}  max=${s.at(-1).toFixed(1)}  mean=${mean.toFixed(1)}`;
};

console.log(`kamar ${code}: ${SEATS} kursi x ${SECONDS} s, kirim tiap ${SEND_MS} ms, target 20 Hz`);

const seats = [];
for (let i = 0; i < SEATS; i += 1) {
  const t = await mint(`S${i}`);
  const ws = await connect(t.ticket);
  seats.push({ ...t, ws, seq: 0, sentAt: new Map(), lastTick: Number.NaN, lastAt: Number.NaN, bytesIn: 0, bytesOut: 0, loops: [], intervals: [], holds: [], stalls: [], lost: 0 });
  await new Promise((res) => { ws.onmessage = (e) => res(); });
}

t00 = now();

for (const s of seats) {
  s.ws.onmessage = (e) => {
    const at = now();
    s.bytesIn += Buffer.byteLength(String(e.data));
    const m = JSON.parse(String(e.data));
    if (m.t !== 'state') return;
    if (Number.isFinite(s.lastAt)) {
      const gap = at - s.lastAt;
      s.intervals.push(gap);
      push(s.seat, 'interval', at, gap);
      if (gap > TICK_MS * 4) { s.stalls.push(gap); push(s.seat, 'stall', at, gap); }
    }
    s.lastAt = at;
    if (Number.isFinite(m.tick)) {
      if (Number.isFinite(s.lastTick)) s.lost += Math.max(0, m.tick - s.lastTick - 1);
      s.lastTick = m.tick;
    }
    const applied = m.applied?.[s.seat];
    const held = m.held?.[s.seat];
    if (Number.isFinite(held)) { s.holds.push(held); push(s.seat, 'queue', at, held); }
    if (!Number.isFinite(applied)) return;
    for (const [seq, t0] of s.sentAt) {
      if (seq > applied) continue;
      s.sentAt.delete(seq);
      const loop = at - t0;
      s.loops.push(loop);
      push(s.seat, 'loop', at, loop);
    }
  };
}

const master = seats.reduce((a, b) => (a.seat < b.seat ? a : b));
master.ws.send(JSON.stringify({ t: 'start' }));
await new Promise((r) => setTimeout(r, 200));

const timer = setInterval(() => {
  const at = now();
  for (const s of seats) {
    s.seq += 1;
    const payload = JSON.stringify({ t: 'setvx', vx: s.seq % 2 ? 6 : -6, seq: s.seq });
    s.bytesOut += Buffer.byteLength(payload);
    s.sentAt.set(s.seq, at);
    s.ws.send(payload);
  }
}, SEND_MS);

await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(timer);
await new Promise((r) => setTimeout(r, 400));

const loops = seats.flatMap((s) => s.loops);
const intervals = seats.flatMap((s) => s.intervals);
const holds = seats.flatMap((s) => s.holds);
const stalls = seats.flatMap((s) => s.stalls);
const totalSent = seats.reduce((a, s) => a + s.bytesOut, 0);
const totalRecv = seats.reduce((a, s) => a + s.bytesIn, 0);
const attempted = seats.reduce((a, s) => a + s.seq, 0);

for (const s of seats) {
  push(s.seat, 'loss', now(), s.lost);
  push(s.seat, 'bytes', now(), (s.bytesIn + s.bytesOut) / SECONDS);
}

console.log('');
console.log(stats('loop latency ms', loops));
console.log(stats('interval ms', intervals));
console.log(stats('held ms di server', holds));
console.log(stats('stall ms (>200ms)', stalls));
console.log(`aksi dikirim         ${attempted} total (${(attempted / SEATS).toFixed(0)} per kursi), balasan loop tercatat ${loops.length}`);
console.log(`tick hilang total    ${seats.reduce((a, s) => a + s.lost, 0)}`);
console.log(`byte per detik       satu kursi menerima ${Math.round(totalRecv / SECONDS / SEATS)}, satu kursi mengirim ${Math.round(totalSent / SECONDS / SEATS)}`);
console.log(`state per detik      ${(intervals.length / SECONDS / SEATS).toFixed(1)} per kursi (target 20)`);

writeFileSync(OUT, `seat,kind,t,v\n${rows.map((r) => `${r.seat},${r.kind},${r.t},${r.v}`).join('\n')}\n`);
console.log(`baris metrik: ${rows.length} -> ${OUT}`);

for (const s of seats) s.ws.terminate();
process.exit(0);
