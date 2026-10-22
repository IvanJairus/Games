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

Empat puluh empat tes: enam belas tiket, dua timer, empat metrik protokol, empat Slap Arena nyata,
sepuluh Bomberman nyata, dan tiga hasil laga. Tiga puluh satu tes lama sudah lulus pada `wrangler dev
--local` dan 26 lulus dari 26 terhadap URL tayang (n = 1 rangkaian, 19 Oktober). Sepuluh tes Bomberman
lulus 41 dari 41 pada `wrangler dev --local` (21 Oktober). Tiap kelompok tes dijalankan lebih dulu
terhadap worker tanpa fitur yang dijaganya, dan gagal di sana, jadi penjaganya terbukti bisa merah.

Tiga tes hasil laga butuh worker dijalankan dengan dua env tambahan, karena ia membaca PostgREST
tiruan yang dibuat file tes di port 8791:

```bash
cd cloudflare
npx wrangler dev --local --port 8790 --var TEST_MODE:1 \
  --var TICKET_SECRET:<32-karakter-acak> \
  --var SUPABASE_URL:http://127.0.0.1:8791 --var SUPABASE_SERVICE_KEY:tes
```

Tanpa kedua env itu worker tetap sehat dan tiga tes itu gagal dengan "harus ada insert" persis seperti
sebelum fitur ini ada. Rangkaian penuh pada 22 Oktober: 44 lulus dari 44 (n = 1).

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
| state punya peta | `applied` dan `held` terbit untuk tiap kursi, bernilai 0 sebelum ada aksi |
| aksi dieksekusi | `applied[seat]` naik ke seq-nya dan `held[seat]` di bawah satu tick |
| seq lama datang telat | `applied` tidak pernah mundur |
| aksi ditolak | `applied` tidak bergeser, jadi angka itu berarti "benar-benar dieksekusi" |
| Slap Arena lorong | dua kursi duduk di dunia nyata, `world.players` berisi keduanya dan fase `WAITING` |
| Slap Arena mulai | yang bukan master ditolak pintu (`unknown_player`), master memulai, fase DO ikut fase dunia |
| Slap Arena bergerak | input `{t:'input', seq, input}` mengubah dunia dan `applied` mengikutinya sampai `BATTLE` |
| Slap Arena payload jahat | `x` di luar rentang balas `bad_payload`, seq berulang balas `duplicate_seq`, dan `applied` tidak naik |
| Bomberman config papan | `welcome` membawa `{seats,size}` dari mint pertama, lorong belum punya dunia, `players` membawa kursi |
| Bomberman kapasitas | papan 2 menolak tiket ketiga 409 `room_full`; papan 4 menolak tiket kelima |
| Bomberman opsi bentrok | mint dengan papan berbeda di kamar yang sama balas 409 `options_conflict` |
| Bomberman mulai | bukan master balas `not_master`; master membuat dunia server yang berjalan sendiri ke `battle` |
| Bomberman input | `{t:'input', seq, dir}` menggerakkan kursi dan `applied` mengikutinya |
| Bomberman payload jahat | arah asing balas `bad_payload`, seq berulang balas `duplicate_seq`, `applied` tidak naik |
| Bomberman bot | satu manusia dengan `fillBots:true` mendapat kursi bot di dunia server |
| Bomberman karakter | klaim `char` dari lorong masuk ke `world.players[].charId` |
| Bomberman reconnect | socket putus di tengah match mempertahankan kursi; mint ulang memakai kursi yang sama dan mengambil alih botnya |
| hasil laga tertulis | satu laga selesai menghasilkan satu insert `waiting` lalu satu update `completed`, dan hanya satu pasang |
| hasil laga atas baris lobi | baris `matches` yang sudah dibuat lobi dituntaskan lewat satu PATCH, tanpa insert kedua |
| kamar masih bermain | nol permintaan hasil selama fase belum `finished` |

## Hasil laga

Durable Object yang menulis hasil, bukan tab pemain. Urutannya begini: cari baris `matches` untuk
kode kamar ini, dan kalau ada, tuntaskan dengan satu PATCH `waiting|playing -> completed`. Lobi Slap
Arena dan kamar Bomberman memang sudah membuat baris itu, jadi jalur normal cuma satu permintaan, dan
pemicu `005_match_results_are_history.sql` menuliskan baris riwayat yang dihitung hub. Kalau klien
lebih cepat menutup baris yang sama, filter status membuat upaya DO tidak mengenai apa pun: satu laga
tetap satu riwayat.

Baris baru hanya dibuat kalau kamar tidak punya jejak di database, dan itu butuh dua permintaan karena
`003_protect_finished_matches.sql` melarang baris lahir langsung sebagai `completed`.

Kuncinya `SUPABASE_SERVICE_KEY`, jadi tidak ada kebijakan RLS yang perlu dilonggarkan untuk klien.
Pasang sekali:

```bash
cd cloudflare
npx wrangler secret put SUPABASE_URL            # https://<ref>.supabase.co
npx wrangler secret put SUPABASE_SERVICE_KEY    # kunci service_role
npx wrangler deploy
```

Keduanya dibaca sebagai env biasa, jadi memakai `--var` saat dev juga sah. Kalau salah satu belum
ada, `recordResult()` langsung keluar dan kamar tetap berjalan tanpa menulis apa pun: fitur ini bisa
dinyalakan setelah deploy tanpa mengubah kode. Idempotennya disimpan di tabel DO `room_result` dengan
kunci tick tempat laga berhenti, dan dunia dipulihkan bersama tick itu, jadi DO yang bangun ulang di
kamar yang sudah selesai tidak menulis laganya dua kali. Tulis yang gagal melepas marker supaya
transisi berikutnya bisa mencoba lagi; kegagalan itu dicatat ke log worker sebagai
`hasil laga tidak tertulis`.

## Deploy

Sudah dilakukan sebagai deploy uji, atas izin user, pada 19 Oktober:

```bash
cd cloudflare
npx wrangler secret put TICKET_SECRET   # sekali saja
npx wrangler deploy
```

Worker aktif di `https://ij-game-rooms.filemonivanjairus.workers.dev` dengan `TEST_MODE = "0"`.
Versi tayang sekarang `e5bfb33d-5c93-42e0-833f-295322b3f6b0` (tiket + tick 30 Hz + metrik + adapter
Slap Arena + adapter Bomberman + penulis hasil laga), di-deploy 22 Oktober dari `main` setelah PR #107.
`SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` belum dipasang di versi itu, jadi cabang penulis hasil
masih padam: kamar berjalan seperti biasa dan tidak ada permintaan keluar dari DO.

Bundlenya 110,69 KiB / gzip 30,84 KiB, startup 6 ms. Sebelum hasil laga ikut ter-bundle angkanya
96,86 KiB / gzip 26,86 KiB. Deploy memakai Worker yang sama dengan Slap Arena:

```bash
cd cloudflare
npx wrangler deploy
```

Frontend produksi memakai Worker karena workflow deploy menyuntikkan `VITE_TRANSPORT=cloudflare` dan
`VITE_CF_ROOMS_URL` ke build Vercel. Sejak PR #98, deploy gagal lebih dulu kalau chunk `transport-*.js`
tidak memuat switch `cloudflare` dan host Worker; guard-nya ada di `.github/workflows/deploy.yml`.

Terukur dari laptop ini ke edge Cloudflare selama deploy uji berturut-turut. Baris suite dan laju siaran
berasal dari deploy adapter; baris mint dan handshake dari deploy tiket:

| Yang diukur | Hasil |
| --- | --- |
| Suite 26 tes dijalankan terhadap URL tayang (`TEST_MODE=1` sementara) | 26 lulus dari 26, n = 1 rangkaian |
| Laju siaran saat klien diam total, lewat internet | 60 state dalam 3.003 ms = 20,0 per detik, 60 tick unik, 0 dobel; gap min 0,1 / median 49,7 / max 142,3 ms |
| Slap Arena nyata, 4 kursi x 30 detik, lewat internet | loop p50 49,3 / p90 69,6 / max 146,6 ms (n=2.336), 0 tick hilang, 0 stall, 20,3 state per detik per kursi, 30,4 kB per detik diterima per kursi |
| `POST /room/<kode>/ticket` | n = 8: min 28 ms, median 41 ms, max 546 ms |
| Handshake WebSocket dengan tiket sah | n = 5: min 59 ms, median 61 ms, max 70 ms |
| Bundle Worker | 47,25 KiB naik dari 17,37 KiB (gzip 13,45 KiB dari 5,38 KiB), startup 3 ms |
| Konfigurasi produksi setelah revert | `/health` 200, mint 200, `?probe=1` menolak 426, koneksi bertiket 101, dua kursi Slap Arena sampai fase `COUNTDOWN` |
| Bomberman produksi, 2 kursi, dua konteks Chrome (`ij-games.vercel.app`) | 10 lulus dari 10: lobby membuat room, mint 200, WebSocket ke Worker, fase `battle`, gerak terkonfirmasi, 123 frame / 30,3 per detik, 0 pageerror |
| Slap Arena produksi pada versi `e5bfb33d`, dua konteks Chrome (`www.ivanjairus.xyz`) | 11 lulus dari 11, n = 1: mint 200 di kedua tab, 122 dan 121 frame `state`, dua kursi di dunia, fase `BATTLE`, 0 pageerror |
| Kadensi siaran production saat laga berjalan, tab tamu | 455 frame / 15,0 s = 30,3 state per detik, 455 tick unik, gap median 33 / p90 36 / p99 40 / max 48 ms, 0 gap di atas 100 ms, 28,7 kB per detik turun (n = 1 rangkaian) |

Angka latensi ini satu sampel dari satu laptop, dan catatan `macos-environment` berlaku: jaringan
kantor tidak layak untuk mengukur latensi. `applied` dan `held` sudah terukur dari sisi klien, tapi
belum ada satu baris kode frontend yang membacanya, jadi pembanding arm Supabase dengan harness yang
sama masih belum ada.

Setelah deploy nyata, `ALLOWED_ORIGINS` harus memuat domain Vercel produksi, dan frontend perlu env
`VITE_TRANSPORT=cloudflare` plus URL Worker.

## Batas yang dijaga kode ini

- `MAX_PLAYERS = 6`, kursi ketujuh ditolak 409 saat mint, jadi sebelum ada socket yang dibuat.
  Bomberman memakai kapasitas papannya sendiri (2 atau 4) dari `room_config`, jadi tiket ketiga di
  papan dua sudah ditolak sebelum socket lahir.
- Handshake WebSocket butuh tiket HMAC-SHA256 yang ditandatangani Worker untuk kamar itu. Tanpa tiket,
  tiket palsu, tiket kamar lain, atau tiket kedaluwarsa: 401, tidak ada sesi yang diterima.
- Tiket default 1 jam (`TICKET_TTL_SECONDS = 3600`), dan `ttl` hanya bisa dikecilkan saat `TEST_MODE=1`.
- Pesan masuk maksimal 1024 karakter, payload di luar itu dibuang.
- Origin harus sama dengan host Worker atau ada di `ALLOWED_ORIGINS`.
- Nama dibersihkan dari `<`, `>`, `&` dan dipotong 12 karakter, dan hanya diterima lewat mint.
- Dunia dimajukan timer 33 ms (30 Hz) selama ada pemain, dan setiap tick menghasilkan tepat satu
  siaran, termasuk saat tidak ada satu pesan masuk pun. Timer mati saat kamar kosong atau laga
  selesai. Sisa waktu di bawah satu tick dibawa ke tick berikutnya, bukan dibuang: `setInterval`
  tidak pernah tepat 33 ms, dan membuang sisanya menjalankan dunia lebih lambat dari jam dinding.

## Yang belum benar, diketahui, dan jadi pekerjaan berikutnya

Satu temuan audit yang tersisa dari `netbench/audits/do-slap-arena-2026-10-19.md` sudah tertutup:
protokol sekarang membawa `applied` dan `held` (lihat bagian Mengukur di bawah). Yang masih terbuka:

1. Batas pesan masih menghitung karakter UTF-16 (`MAX_MESSAGE_CHARS`), bukan byte. PR #75 sudah
   membuktikan versi byte di sisi klien; sisi Worker belum.
2. Belum ada batas laju per koneksi, padahal mint adalah endpoint publik.
3. Hasil laga masih ditulis klien. Keputusan Anda: DO yang menulis lewat function saat `finished`.
   Yang belum Anda pilih: function itu dipanggil dengan anon key atau dengan `sb_secret_…` sebagai
   secret Worker.
4. Perbandingan Cloudflare versus Supabase Broadcast belum sah. Harness sudah bisa memuat Slap Arena
   asli (`--game slap-arena`), tapi sisi Supabase-nya belum: itu butuh jalur klien yang mengirim payload
   yang sama lewat Broadcast, dan belum ada satu baris pun kode frontend yang membaca `applied`/`held`.
5. Belum terukur: CPU per tick di runtime nyata (wrangler lokal tidak memakainya), dan `load()` dari
   snapshot belum pernah diuji lewat eviksi DO sungguhan.
6. Bomberman memprediksi satu langkah gerak lokal, tetapi tidak memprediksi bom, ledakan, atau
   kematian. Tick global 30 Hz, ukuran snapshot per papan, dan hasil browser dua tab ada di
   `docs/cloudflare-migration.md` bagian 14.
7. Tanpa Supabase, room Bomberman tetap bisa dibuat dan dimainkan; yang hilang hanya baris riwayat
   `matches` dan angka Hub. Hasil laga masih ditulis klien master lewat `finishOnlineMatch`.

## Mengukur

```bash
cd cloudflare
node tests/soak.mjs --base http://localhost:8790 --game slap-arena --seats 4 --seconds 30 --out /tmp/soak.csv
```

`--game selftest` membutuhkan `TEST_MODE=1`; `--game slap-arena` adalah game nyata dan tidak butuh flag itu. Definisinya sama dengan
netbench: loop latency dari satu jam (jam klien, `t0` saat aksi dengan `seq` dikirim, `t1` saat
`applied[seat] >= seq` terlihat), dan `held` adalah tahan di dalam pemegang sim yang memisahkan antrean
server dari perjalanan jaringan. CSV memakai bentuk `MetricRow` netbench (`seat,kind,t,v`).

Terukur pada 19 Oktober, 4 kursi x 30 detik (n = 2.316 loop lokal, n = 2.332 loop tayang):

| | Lokal | Tayang |
| --- | --- | --- |
| loop latency p50 / p90 / max | 52,7 / 53,4 / 57,0 ms | 50,1 / 73,5 / 298,9 ms |
| held p50 | 51,0 ms | 24,0 ms |
| stall di atas 200 ms | 0 | 12 dari 2.442 |
| state per detik per kursi | 19,6 | 20,4 |

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
