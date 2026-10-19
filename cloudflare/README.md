# Worker room untuk game real-time

Satu Cloudflare Worker, satu Durable Object per room. Server yang memutuskan aksi sah atau tidak,
tidak ada pemain yang jadi host.

## Menjalankan lokal

```bash
cd cloudflare
npm install
npx wrangler dev --local --port 8790 --var TEST_MODE:1
```

`TEST_MODE=1` mengizinkan game `selftest`, dipakai hanya oleh suite tes. Jangan nyalakan di produksi.

## Menguji

```bash
cd cloudflare
ROOM_BASE=http://localhost:8787 node --test --test-timeout=25000 tests/ws.test.mjs
```

Delapan tes, semuanya lulus pada `wrangler dev --local` (n = 1 rangkaian, 19 Oktober):

| Tes | Yang dijaga |
| --- | --- |
| origin asing | 403 sebelum handshake |
| tanpa upgrade | 426 |
| path salah | 404 |
| welcome | id dan token terbit, pemain pertama jadi master |
| aksi sebelum mulai | `wrong_phase`, mulai sendirian | `too_few_players` |
| dua pemain mulai | fase `playing` dan `tick` naik 0 ke 5 ke 10, dunia benar-benar maju |
| klaim ulang token | koneksi baru dengan token lama mendapat id yang sama |
| kursi ketujuh | 409 |

## Deploy

Belum dilakukan. Perintahnya nanti:

```bash
cd cloudflare
npx wrangler deploy
```

Setelah itu `ALLOWED_ORIGINS` harus memuat domain Vercel produksi, dan frontend perlu env
`VITE_TRANSPORT=cloudflare` plus URL Worker.

## Batas yang dijaga kode ini

- `MAX_PLAYERS = 6`, koneksi ke tujuh ditolak 409 sebelum handshake.
- Pesan masuk maksimal 1024 karakter, payload di luar itu dibuang.
- Origin harus sama dengan host Worker atau ada di `ALLOWED_ORIGINS`.
- Nama dibersihkan dari `<`, `>`, `&` dan dipotong 12 karakter.

## Yang belum benar, diketahui, dan jadi pekerjaan berikutnya

Empat temuan dari audit `netbench/audits/do-slap-arena-2026-10-19.md`, semuanya terverifikasi
coordinator terhadap kode di branch ini:

1. Token diterbitkan sendiri oleh objek, jadi bukan admission control. Yang menahan akses hanya
   allowlist Origin, dan Origin bisa dipalsukan dari skrip mana pun.
2. Tick didorong pesan masuk klien. Komentar yang melarangnya salah: yang dilarang dokumentasi
   Cloudflare adalah memakai `waitUntil()` untuk menahan objek tetap hidup, bukan memakai timer
   selama masih ada WebSocket terbuka.
3. Satu pesan masuk memicu satu siaran keluar, jadi siaran tumbuh mengikuti jumlah pesan masuk,
   bukan mengikuti tick.
4. Protokol tidak membawa `applied` dan `held`, sehingga loop latency tidak terukur di game ini.

Ditambah tiga hal lebih kecil: batas pesan menghitung karakter bukan byte, `gameCode` diambil dari
query koneksi terakhir, dan tidak ada batas laju per koneksi.

## Sumber

- [Durable Object SQL storage](https://developers.cloudflare.com/durable-objects/api/sql-storage/)
  untuk `ctx.storage.sql.exec` dan aturan bahwa cursor harus dihabiskan sebelum `await`.
- [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/api/websockets/)
  untuk `acceptWebSocket`, `getWebSockets`, dan `webSocketMessage`.
- [Workers Runtime APIs, Context](https://developers.cloudflare.com/workers/runtime-apis/context/)
  untuk larangan `waitUntil()` sebagai penahan hidup objek.
