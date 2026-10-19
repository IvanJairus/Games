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

Enam belas tes tiket plus dua tes timer, semuanya lulus pada `wrangler dev --local` (n = 1 rangkaian,
19 Oktober). Suite ini dijalankan lebih dulu terhadap worker tanpa fitur yang dijaganya, dan gagal di
sana, jadi penjaganya terbukti bisa merah.

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
| kamar diam total | server tetap menyiarkan ~19 state per detik dan tick naik sendiri tanpa satu byte pun dari klien |
| banjir 30 input | siaran yang diterima klien tidak menempel ke jumlah input (dibatasi <= 15 untuk 30 input dalam 400 ms) |

## Deploy

Sudah dilakukan sebagai deploy uji, atas izin user, pada 19 Oktober:

```bash
cd cloudflare
npx wrangler secret put TICKET_SECRET   # sekali saja
npx wrangler deploy
```

Worker aktif di `https://ij-game-rooms.filemonivanjairus.workers.dev` dengan `TEST_MODE = "0"`.
Frontend belum ada yang menunjuk ke sini: tidak ada satu pun berkas di `src/` yang memanggil URL ini,
jadi jalur Supabase hari ini tidak berubah.

Terukur pada deploy uji itu, dari laptop ini ke edge Cloudflare:

| Yang diukur | Hasil |
| --- | --- |
| Suite 16 tes dijalankan terhadap URL tayang (`TEST_MODE=1` sementara) | 16 lulus dari 16, n = 1 rangkaian |
| `POST /room/<kode>/ticket` | n = 8: min 28 ms, median 41 ms, max 546 ms |
| Handshake WebSocket dengan tiket sah | n = 5: min 59 ms, median 61 ms, max 70 ms |
| Konfigurasi produksi setelah revert | `/health` 200, mint 200, `?probe=1` menolak 426, koneksi bertiket 101 |

Angka latensi ini satu sampel dari satu laptop, dan catatan `macos-environment` berlaku: jaringan
kantor tidak layak untuk mengukur latensi. Interval dunia (`applied`/`held`) belum terukur karena
protokolnya belum membawa keduanya.

Setelah deploy nyata, `ALLOWED_ORIGINS` harus memuat domain Vercel produksi, dan frontend perlu env
`VITE_TRANSPORT=cloudflare` plus URL Worker.

## Batas yang dijaga kode ini

- `MAX_PLAYERS = 6`, kursi ketujuh ditolak 409 saat mint, jadi sebelum ada socket yang dibuat.
- Handshake WebSocket butuh tiket HMAC-SHA256 yang ditandatangani Worker untuk kamar itu. Tanpa tiket,
  tiket palsu, tiket kamar lain, atau tiket kedaluwarsa: 401, tidak ada sesi yang diterima.
- Tiket default 1 jam (`TICKET_TTL_SECONDS = 3600`), dan `ttl` hanya bisa dikecilkan saat `TEST_MODE=1`.
- Pesan masuk maksimal 1024 karakter, payload di luar itu dibuang.
- Origin harus sama dengan host Worker atau ada di `ALLOWED_ORIGINS`.
- Nama dibersihkan dari `<`, `>`, `&` dan dipotong 12 karakter, dan hanya diterima lewat mint.
- Dunia dimajukan timer 50 ms selama ada pemain, dan setiap tick menghasilkan tepat satu siaran,
  termasuk saat tidak ada satu pesan masuk pun. Timer mati saat kamar kosong atau laga selesai.

## Yang belum benar, diketahui, dan jadi pekerjaan berikutnya

Satu temuan audit yang tersisa dari `netbench/audits/do-slap-arena-2026-10-19.md`:

1. Protokol tidak membawa `applied` dan `held`, sehingga loop latency tidak terukur dari sisi klien.
   Timer sekarang mengirim tepat satu siaran per tick (terukur 19,0 siaran per detik, 57 tick unik,
   0 dobel, gap median 52,6 ms pada satu jendela lokal), tapi tanpa dua field itu tidak bisa dibuktikan
   klien menerimanya dengan laju yang sama.

Ditambah tiga hal lebih kecil: batas pesan masih menghitung karakter UTF-16 bukan byte (PR #75 sudah
membuktikan versi byte di sisi klien), belum ada batas laju per koneksi, dan hasil laga belum ditulis
ke Postgres dari sisi server.

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
- [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) untuk daftar
  algoritma yang tersedia di runtime: HMAC mendukung `sign`, `verify`, dan `importKey`, yang dipakai
  `src/ticket.ts`.
- [Environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
  untuk pemisahan `[vars]` di `wrangler.toml`, `wrangler secret put`, dan `.dev.vars` lokal.
