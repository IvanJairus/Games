# Worker room untuk game real-time

Satu Cloudflare Worker, satu Durable Object per room. Server yang memutuskan aksi sah atau tidak,
tidak ada pemain yang jadi host.

## Menjalankan lokal

```bash
cd cloudflare
npm install
npx wrangler dev --local --port 8790 --var TEST_MODE:1 --var TICKET_SECRET:<32-karakter-acak>
```

`TEST_MODE=1` mengizinkan game `selftest` dan rute `?probe=1`, dipakai hanya oleh suite tes. Jangan
nyalakan di produksi. `TICKET_SECRET` adalah kunci HMAC untuk tiket; di produksi ia datang dari
`npx wrangler secret put TICKET_SECRET`, bukan dari `wrangler.toml`.

## Menguji

```bash
cd cloudflare
ROOM_BASE=http://localhost:8790 node --test --test-timeout=20000 tests/ws.test.mjs
```

Enam belas tes, semuanya lulus pada `wrangler dev --local` (n = 1 rangkaian, 19 Oktober). Suite ini
dijalankan lebih dulu terhadap worker versi commit dan gagal 13 dari 16, jadi penjaga barunya terbukti
bisa merah.

| Tes | Yang dijaga |
| --- | --- |
| origin asing | 403 sebelum handshake |
| tanpa upgrade | 426 |
| path salah | 404 |
| tanpa tiket | 401 `missing_ticket`, tidak ada kursi baru yang dibagikan |
| tanda tangan palsu | 401 `bad_signature` |
| tiket kamar lain | 401 `wrong_room` |
| tiket kedaluwarsa saat connect | 401 `expired` |
| tiket kedaluwarsa di tengah sesi | socket ditutup 4001 pada pesan berikutnya |
| welcome | id, nomor kursi, dan jatuh tempo terbit; pembuat kamar (kursi 0) jadi master |
| nama pemain | diambil dari tiket, query `?name=` di koneksi diabaikan |
| game kedua di kamar yang sama | 409 `game_conflict` |
| mint dengan id lama | kursi yang sama dikembalikan, tidak menambah kursi |
| kursi ketujuh | 409 `room_full` saat mint |
| pengambilalihan kursi | socket lama berhenti menerima siaran dan tidak dihitung dua kali |
| aksi sebelum mulai | `wrong_phase`, dan `too_few_players` untuk mulai sendirian |
| dua pemain mulai | fase `playing` dan dunia benar-benar maju |

## Deploy

Belum dilakukan. Perintahnya nanti:

```bash
cd cloudflare
npx wrangler deploy
```

Setelah itu `ALLOWED_ORIGINS` harus memuat domain Vercel produksi, dan frontend perlu env
`VITE_TRANSPORT=cloudflare` plus URL Worker.

## Batas yang dijaga kode ini

- `MAX_PLAYERS = 6`, kursi ketujuh ditolak 409 saat mint, jadi sebelum ada socket yang dibuat.
- Handshake WebSocket butuh tiket HMAC-SHA256 yang ditandatangani Worker untuk kamar itu. Tanpa tiket,
  tiket palsu, tiket kamar lain, atau tiket kedaluwarsa: 401, tidak ada sesi yang diterima.
- Tiket default 1 jam (`TICKET_TTL_SECONDS = 3600`), dan `ttl` hanya bisa dikecilkan saat `TEST_MODE=1`.
- Pesan masuk maksimal 1024 karakter, payload di luar itu dibuang.
- Origin harus sama dengan host Worker atau ada di `ALLOWED_ORIGINS`.
- Nama dibersihkan dari `<`, `>`, `&` dan dipotong 12 karakter, dan hanya diterima lewat mint.

## Yang belum benar, diketahui, dan jadi pekerjaan berikutnya

Tiga temuan audit yang tersisa dari `netbench/audits/do-slap-arena-2026-10-19.md`:

1. Tick didorong pesan masuk klien. Komentar lama yang melarangnya salah: yang dilarang dokumentasi
   Cloudflare adalah memakai `waitUntil()` untuk menahan objek tetap hidup, bukan memakai timer selama
   masih ada WebSocket terbuka.
2. Satu pesan masuk memicu satu siaran keluar, jadi siaran tumbuh mengikuti jumlah pesan masuk,
   bukan mengikuti tick.
3. Protokol tidak membawa `applied` dan `held`, sehingga loop latency tidak terukur di game ini.

Ditambah dua hal lebih kecil: batas pesan masih menghitung karakter UTF-16 bukan byte (PR #75 sudah
membuktikan versi byte di sisi klien), dan belum ada batas laju per koneksi.

Satu catatan lingkungan: saat socket lama ditutup karena kursi diambil alih, workerd lokal mengirim
close frame tapi tidak menuntaskan teardown, jadi klien bertahan di readyState 2 dan event `close`
tidak datang. Yang dijaga tes adalah efek sisi servernya (kursi tidak dihitung dua kali, siaran lama
berhenti), bukan kode close-nya. Perilaku pada `wrangler deploy` belum diukur.

## Sumber

- [Durable Object SQL storage](https://developers.cloudflare.com/durable-objects/api/sql-storage/)
  untuk `ctx.storage.sql.exec` dan aturan bahwa cursor harus dihabiskan sebelum `await`.
- [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/api/websockets/)
  untuk `acceptWebSocket`, `getWebSockets`, dan `webSocketMessage`.
- [Workers Runtime APIs, Context](https://developers.cloudflare.com/workers/runtime-apis/context/)
  untuk larangan `waitUntil()` sebagai penahan hidup objek.
