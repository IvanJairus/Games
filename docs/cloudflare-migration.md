# Migrasi lapisan realtime ke Cloudflare Workers + Durable Objects

Status dokumen: langkah 1 (inventaris dan rencana). Tidak ada kode yang diubah.

Baseline rollback: tag `baseline-pre-cloudflare` pada commit `4053857` (commit yang sama dengan
`v1.1.4`). Diverifikasi `gameplay:check` 124/124 dan `gameplay:online` 16/16 terhadap situs tayang.

## 1. Inventaris titik realtime hari ini

Semua game lewat satu modul, `src/games/common/multiplayer.ts`. Tidak ada game yang memanggil
API Realtime Supabase sendiri kecuali dua modul net engine.

| Game | Jalur data | Channel dan event | Laju kirim | Logika game berjalan di |
| --- | --- | --- | --- | --- |
| Bomberman | broadcast murni | `room:<kode>`, event `EV_INPUT`, `EV_WORLD`, `EV_CHAR` (`bomberman/engine/net.ts`) | `TICK_MS = 66`, 15,15 pesan/detik per pemegang sim (`net.ts:21,139`) | tab host (`BombermanMatch.tsx:313` cabang `isHostRef.current`) |
| Slap Arena | broadcast murni | `room:<kode>`, event `EV_INPUT`, `EV_SNAPSHOT`, `EV_FX` (`slap-arena/engine/net.ts:102-134`) | `TICK_MS = 50`, 20 pesan/detik (`net.ts:7,118`) | tab host |
| Tic Tac Toe | broadcast + `postgres_changes` | `room:<kode>` dengan `game_move` dan `player_left` (`multiplayer.ts:567-595`), plus roster `room:<kode>:roster` | per aksi pemain, bukan per tick | server Postgres lewat RPC, klien hanya mengirim langkah |
| WallGo | broadcast + `postgres_changes` | sama seperti Tic Tac Toe, `WallgameMatch.tsx:229,267` mengirim `game_move` | per aksi | klien otoritatif (lihat catatan bagian 6) |
| Battleship | `postgres_changes` + RPC | `subscribeToMatch`, hash komitmen | per aksi | Postgres |

Konfigurasi socket tunggal: `src/lib/supabase.ts:30` memasang `eventsPerSecond: 20`.

Tidak ada Edge Function yang dipakai jalur gameplay. Hasil grep `functions.invoke` di `src/games`
kosong; direktori `supabase/functions/` hanya berisi `_shared`.

## 2. Kenapa lag, dua hipotesis, dan mana yang diuji lebih dulu

### H1, plafon pesan Realtime terlampaui lalu diam-diam jatuh ke REST

Terbukti dari definisi resmi dan angka, bukan dugaan.

- Supabase menghitung fan-out: satu pesan yang didengar 4 klien dihitung 5 pesan.
- Dengan model itu, room Bomberman 4 kursi menghasilkan sekitar 242 pesan tertagih per detik, dan
  Slap Arena 4 kursi sekitar 320. Plafon free plan 100 pesan per detik. Angka ini sudah dihitung di
  proyek `netbench`, `docs/test-scenario.md` bagian 8.
- Kode kita sendiri sudah mendokumentasikan akibatnya: `bomberman/engine/net.ts` menulis bahwa
  supabase-js menjawab `timedOut`/`closed` alih-alih melempar, lalu diam-diam jatuh ke satu POST
  REST per pesan. Itulah mekanisme "lag" yang paling mungkin, dan ia muncul justru saat room ramai.

Konsekuensi penting: **pindah ke Cloudflare tidak otomatis menyembuhkan H1** kalau kita tetap
memancarkan state penuh ke semua klien dengan laju yang sama. Yang berubah adalah cara penagihan.

### H2, host adalah pemain

Sim Bomberman dan Slap Arena berjalan di tab salah satu pemain. Koneksi, tab background, atau device
sleep host menghentikan dunia untuk semua orang. Ini yang dihapus migrasi ini, dan tidak bisa
diperbaiki dengan tuning Supabase.

### Ukuran pembanding yang sudah ada, dan peringatan kerasnya

`netbench` (proyek benchmark yang sudah Anda bangun untuk soal yang sama) punya hasil yang wajib
dibaca sebelum menulis satu baris pun:

- Gerbang P1b sempat berstatus **blokir** karena `preflight.mjs` mengukur endpoint Worker median
  245-249 ms sementara Supabase 21-30 ms. Angka itu sudah ditarik. Penyebabnya dua: jaringan kantor
  menolak koneksi baru, dan probe WebSocket punya bug yang dikoreksi di netbench bagian 12.9. Hasil
  final justru berbalik mendukung Cloudflare: 53,4 ms versus 86,4 ms, CI90 27,5 sampai 41,4,
  n = 12 run berpasangan (`netbench/audits/do-slap-arena-2026-10-19.md`).
- Kesimpulan yang sudah ditulis di sana: arm DO memangkas loop latency 38 persen dan tidak terpengaruh
  host migration, tapi sebagian kemenangannya karena edge 41 ms lebih dekat, dan arm `C-r` hanya 9 persen.
- Catatan metode: jaringan kantor menunjukkan SYN retransmit, dan satu baris pengukuran TCP connect
  ke edge Supabase memberi min 8,6 ms / median 1.030 ms / max 5.020 ms dengan 3 timeout. Angka selebar
  itu bukan latensi, itu artefak jaringan.

Karena itu pertanyaan "apakah edge Cloudflare lebih jauh" sudah terjawab oleh data berpasangan: tidak,
arm DO justru lebih cepat. Yang tersisa dari H1 tetap berlaku: mengurangi laju dan ukuran pesan masih
perlu, karena migrasi ini tidak otomatis memperbaikinya.

## 3. Anggaran kuota Cloudflare free plan

Penagihan: 100.000 request/hari, dan 20 pesan WebSocket masuk dihitung sebagai 1 request.
Artinya plafon efektif sekitar 2.000.000 pesan masuk/hari.

Pesan **masuk** ke DO hanya dari klien (input), bukan dari siaran server:

| Game | Laju input per klien | 4 kursi | 6 kursi | jam pemakaian per hari |
| --- | --- | --- | --- | --- |
| Bomberman (kirim 1 pesan per tick, lihat `net.ts:9`) | 15,15/detik | 60,6/detik = 3,03 req/s | 90,9/detik = 4,55 req/s | 9,2 jam (4 kursi) |
| Slap Arena | 20/detik | 80/detik = 4,0 req/s | 120/detik = 6,0 req/s | 6,9 jam (4 kursi) |

Perhitungan di atas memakai asumsi terburuk "setiap klien mengirim setiap tick". Kalau klien hanya
mengirim saat ada perubahan input (dead reckoning di klien, kirim saat tekan dan lepas), angkanya
turun jauh. Itu keputusan desain di langkah 4, dan ini satu-satunya tuas yang membuat free plan aman
untuk pemakaian rutin.

Durasi CPU 13.000 GB-s/hari bukan ancaman pada workload ini. Yang perlu dijaga adalah `rows written`
100.000/hari: state game disimpan di memori objek, SQLite hanya ditulis saat laga selesai dan
sebagai snapshot berjeda (misal maksimal 1 tulis per 30 detik per room, atau `state_downsert()` hanya
saat fase berubah).

## 4. Rencana per game, urutan yang saya sarankan

1. **Tic Tac Toe sebagai kerangka.** Alasannya bukan karena ia paling lambat, tapi karena bentuknya
   persis sama dengan proyek acuan `game-rooms`: giliran, master, maksimal 6 kursi, satu aksi per
   langkah. Ia memaksa kita menyelesaikan join, klaim slot, aksi ilegal, room penuh, dan origin
   ditolak, tanpa tick loop. Risikonya paling kecil dan ia tidak menghapus jalur yang sedang dipakai
   orang.
2. **Bomberman sebagai game real-time pertama.** Di sini DO jadi pemegang sim, `applyAction` dipanggil
   server, dan klien pindah ke model "kirim input saja". Ini juga tempat client-side prediction dan
   interpolasi diuji, dan tempat `smoothing` yang sudah ada di `bomberman/engine/smooth.ts` (dipindah
   di PR #63) tetap terpakai.
3. **Slap Arena menyusul setelah Bomberman stabil,** karena fisika 3D-nya punya kebutuhan payload
   terbesar dan sudah punya `remoteMotion.ts` sebagai pola dead reckoning.
4. **WallGo dan Battleship paling akhir.** Battleship tidak butuh DO sama sekali (permainan giliran
   dengan komitmen hash, latensi tidak relevan) dan sebaiknya tetap di Postgres. WallGo perlu
   keputusan terpisah, lihat bagian 6.

## 5. Saklar transport

`TRANSPORT=cloudflare|supabase` dibaca dari env build (`import.meta.env.VITE_TRANSPORT`), dengan
default `supabase` sampai migrasi terbukti. Konsekuensi yang harus diterima sejak awal: ini env
build-time, bukan runtime, jadirollback berarti menyetel ulang env di Vercel dan menunggu build
baru, bukan membalik flag di produksi. Alternatifnya adalah flag runtime yang diambil dari
konfigurasi room, lebih mahal tapi bisa dimatikan tanpa deploy.

Kode Broadcast lama tidak dihapus sampai dua game real-time melewati soak.

## 6. Hal yang belum saya putuskan dan butuh keputusan Anda

1. **Ulangi preflight di jaringan bersih** (butir 2). Ini gerbang sebelum langkah 3, bukan formalitas.
2. **WallGo otoritatif di siapa.** Catatan proyek menyebut `game_state` klien yang otoritatif dan
   salinan engine di `supabase/functions/_shared` tidak diimpor siapa pun. Kalau WallGo ikut ke DO,
   itu sekaligus memindahkan otoritasnya, dan itu perubahan yang lebih besar dari sekadar transport.
3. **Hasil laga tetap ke Postgres?** Saya sarankan ya: `match_results` dan angka Hub yang sekarang
   dibaca 5 laga selesai tidak boleh pindah. DO menulis hasil lewat satu panggilan RPC saat fase
   `finished`.
4. **Game mana yang benar-benar pertama.** Placeholder di brief Anda belum terisi. Saya mengusulkan
   Tic Tac Toe untuk kerangka, Bomberman sebagai ujian sesungguhnya. Kalau Anda ingin langsung
   Bomberman, bilang, karena itu mengubah urutan tes.

## 6b. Keputusan user (18 Oktober 2026)

1. Game pertama yang dimigrasikan: **Slap Arena**, bukan Tic Tac Toe. Konsekuensinya kerangka
   transport dan aturan validasi selesai di game real-time, jadi setiap temuan di langkah 2 harus
   ditulis dengan nama aksi dan kode alasannya supaya bisa dipakai ulang oleh Bomberman tanpa
   diubah bentuk.
2. Soal latensi: angka 245-249 ms yang saya kutip di sini berasal dari preflight jaringan kantor dan
   sudah ditarik netbench. Hasil finalnya mendukung Cloudflare (53,4 ms versus 86,4 ms, n = 12 run
   berpasangan). Saklar `TRANSPORT` dan jalur Broadcast lama tetap dipertahankan, tapi sebagai alat
   uji A/B, bukan sebagai pagar kepanikan.

## 6c. Audit worker dan empat temuan yang masih terbuka (19 Oktober)

Audit `netbench/audits/do-slap-arena-2026-10-19.md` membaca `cloudflare/src/room.ts` pada snapshot
md5 `06454c005bd4bf81fbf9b3496215943c`. Coordinator memverifikasi keempat temuan ke kode dan
menyimpulkan semuanya benar. Temuan 2 adalah kesalahan faktual coordinator: komentar di `room.ts`
memakai larangan `waitUntil()` sebagai alasan tidak memasang timer, padahal yang dilarang adalah
menahan objek hidup dengan `waitUntil`, bukan memakai timer selama WebSocket masih terbuka.

Urutan perbaikan yang disepakati: (1) commit worker dan PR draft, (2) token sebagai admission control
dengan tes yang gagal lebih dulu, (3) tick berbasis alarm atau timer plus satu siaran per tick,
(4) `applied` dan `held` di protokol lalu porting soak harness, (5) adapter Slap Arena memakai
`gameApi.ts`. Berhenti di akhir setiap langkah.

Bukti runtime worker pada commit ini: `wrangler dev --local` port 8790, `node --test` 8 lulus dari 8,
termasuk `tick` naik 0 ke 5 ke 10 dan klaim ulang token. Belum terukur: latensi nyata lewat internet,
karena worker belum di-deploy.

## 7. Hasil langkah 2 (API aturan murni, PR #75)

Yang jadi: `src/games/slap-arena/engine/gameApi.ts` 148 baris dengan `createGame()` tanpa argumen,
`applyAction(state, playerId, action)`, `removePlayer(state, playerId)`, `MAX_PLAYERS` 6,
`MAX_MESSAGE_BYTES` 512, tujuh `RejectReason`. Rencananya dulu menulis `createGame(players)` dan
`name_rejected` sebagai alasan untuk nama kosong; implementasi PR #75 yang dipakai dan dokumen ini
disamakan ke sana. Nama kosong setelah sanitasi kembali ke `Pemain`, `name_rejected` hanya untuk `name`
yang bukan string.

Verifikasi coordinator di worktree bersih dari `ab62fcd`: `npx vitest run tests/unit/slap-arena-api.test.ts`
19 lulus dari 19 (dua rangkaian terpisah), `npx tsc -b` exit 0, `guard:check` bersih, diff hanya tiga file.
Belum teruji: `removePlayer` pemain terakhir saat `BATTLE` (yang teruji fase `WAITING`), dan lompatan `seq`
maju yang besar diterima tanpa assertion. Bukti lengkap di komentar PR #75.

Satu koreksi yang dibawa PR #75 ke worker: batas pesan harus dihitung dalam byte UTF-8, bukan jumlah
karakter. `cloudflare/src/types.ts` masih memakai `MAX_MESSAGE_CHARS`; itu masuk langkah berikutnya.
