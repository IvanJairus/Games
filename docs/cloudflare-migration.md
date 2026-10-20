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

## 8. Hasil langkah 2 urutan audit: tiket sebagai pintu masuk (19 Oktober)

Keputusan user yang dipakai: tiket bertanda tangan yang diverifikasi lokal di DO, tanpa panggilan keluar
saat connect. Konsekuensinya tidak ada tabel atau function baru di Supabase untuk langkah ini.

Bentuknya:

- `POST /room/<kode>/ticket?game=&name=&player=` mengalokasikan kursi di dalam DO dan mengembalikan
  tiket `v1:<KODE>:<id 32 heks>:<game>:<exp detik>.<hex hmac-sha256>`.
- Handshake `GET /room/<kode>/ws?ticket=` diverifikasi sebelum `acceptWebSocket`; gagal berarti 401
  tanpa sesi: `missing_ticket`, `malformed_ticket`, `bad_signature`, `wrong_room`, `expired`.
  Tanda tangan diperiksa lebih dulu daripada kode kamar dan jam, jadi penolakan tidak membocorkan bagian
  mana yang salah.
- Tiket kedaluwarsa di tengah sesi: DO mengirim `error` lalu menutup dengan 4001 pada pesan berikutnya.
- Kursi 0 = pembuat kamar = master, jadi master tidak lagi ditentukan oleh siapa yang duluan nyambung.
- Nama hanya diterima lewat mint; `?name=` di query koneksi tidak dibaca lagi.
- Game dikunci pada mint pertama (`game_conflict` 409). Ini sekaligus menutup temuan kecil
  "`gameCode` diambil dari query koneksi terakhir".

Bukti merah-lalu-hijau, n = 1 rangkaian per baris, semuanya pada `wrangler dev --local`:

| Tahap | Hasil |
| --- | --- |
| Suite 16 tes baru terhadap worker commit `0491d84` | 3 lulus, 13 gagal. Kalimat merahnya: `tiket palsu seharusnya ditolak, dapat: terbuka`; probe tangan terpisah mencetak `koneksi tanpa tiket DITERIMA, kursi langsung diberikan` dengan welcome berisi id 8 karakter dan UUID |
| Suite yang sama terhadap kode tiket | 16 lulus dari 16, `npx tsc --noEmit` exit 0, `guard:check` bersih |

Yang dengan sengaja TIDAK diklaim tertutup: produk ini tidak punya akun (`src/lib/supabase.ts` hanya
memakai anon key dan id pemain adalah string acak localStorage), jadi tiket tidak menahan orang yang
tahu kode kamar; dia tetap bisa mint kursinya sendiri. Yang ditutup: pemalsuan tiket, perebutan kursi
lewat token yang ditebak, replay tiket antar kamar, dan koneksi tanpa melewati mint. Rate limit per
koneksi dan batas byte pesan masih terbuka, dan tick tetap didorong pesan masuk (temuan 2 dan 3 audit).

## 9. Hasil langkah 3 urutan audit: tick berbasis timer (19 Oktober)

Temuan 2 dan 3 audit ditutup bersamaan. `GameRoom` sekarang memasang `setInterval` saat fase
`playing` dan mematikan timer itu ketika pemain terakhir keluar atau laga selesai. Alasannya
dipisah dari Alarm: granularity Alarm adalah detik, dan 20 Hz butuh 50 ms. Catatan `waitUntil()`
yang salah di komentar lama sudah dibetulkan; yang dilarang adalah menahan objek hidup, bukan
memakai timer selama WebSocket masih terbuka.

Perubahan bentuk: pesan masuk hanya memanggil `apply()` dan mengirim balasan error kalau perlu.
Yang menyiarkan dunia hanya timer, satu siaran per tick.

Bukti merah-lalu-hijau, n = 1 rangkaian per baris, `wrangler dev --local`:

| Tahap | Hasil |
| --- | --- |
| Dua tes baru terhadap kode tiket tanpa timer (`b0065b5`) | dua-duanya gagal: `selama diam harus ada siaran dari server, dapat 0` dan `siaran 30 untuk 30 input: siaran masih menempel ke pesan masuk` |
| Suite penuh setelah timer masuk | 18 lulus dari 18, `npx tsc --noEmit` exit 0, `guard:check` bersih |

Terukur pada versi lokal, satu jendela 3 detik dengan dua pemain dan nol byte dari klien:

| Yang diukur | Lokal (`wrangler dev`) | Tayang (`workers.dev`, dari laptop yang sama) |
| --- | --- | --- |
| state diterima | 57 di 3.000 ms = 19,0 per detik | 60 di 3.003 ms = 20,0 per detik |
| tick unik / tick dobel | 57 / 0 | 60 / 0 |
| gap antar siaran | min 50,6 / median 52,6 / max 54,0 ms | min 0,1 / median 49,7 / max 142,3 ms |
| suite penuh | 18 lulus dari 18 | 18 lulus dari 18 (n = 1 rangkaian) |

Yang masih belum terukur: konsumsi CPU per jam kamar, dan penyebab bentuk di kolom tayang. Di sana
gap terkecil 0,1 ms berpasangan dengan gap terbesar 142,3 ms dalam jendela yang sama, yang konsisten
dengan siaran yang tertahan lalu datang berdekatan, tapi itu baru pembacaan satu jendela dan belum
dibuktikan. Membedakan jitter jaringan dari keterlambatan aplikasi butuh `applied` dan `held` di
protokol, dan itu langkah berikutnya.

## 10. Hasil langkah 4 urutan audit: `applied`, `held`, dan harness soak (19 Oktober)

Bentuk pesannya diambil dari netbench (`netbench/src/shared/protocol.ts:54-71` dan
`netbench/src/client/metrics.ts:1-8`), bukan karangan sendiri: `applied[seat]` adalah seq terakhir yang
benar-benar dieksekusi pemegang sim, `held[seat]` adalah milidetik aksi itu tertahan di pemegang sim
sebelum ikut terbit, diukur dengan satu jam di dalam pemegang sim. Loop latency dihitung dari satu jam,
jam klien: t0 saat aksi dikirim, t1 saat `applied[seat] >= seq` terlihat. Tidak ada timestamp server yang
dipercaya dan tidak ada sinkronisasi clock antar mesin.

Di DO pencatatannya ada di lapisan transport, bukan di adapter game. Pesan masuk yang membawa `seq`
dicatat saat diterima, dan aksi yang ditolak (`apply()` membalas `ok: false`) tidak dicatat sama sekali.
`publishApplied()` dipanggil di dalam `broadcast()`, jadi `applied` dan `held` yang terbit selalu merujuk
aksi yang sama.

Bukti merah-lalu-hijau, n = 1 rangkaian per baris:

| Tahap | Hasil |
| --- | --- |
| Empat tes baru terhadap kode tick tanpa metrik (`95327d1`) | 4 gagal dari 4: dua assertion (`state harus punya peta applied`, `state harus punya applied`) dan dua timeout menunggu applied |
| Suite penuh setelah metrik masuk, lokal | 22 lulus dari 22, `npx tsc --noEmit` exit 0, `guard:check` bersih |
| Suite penuh terhadap URL tayang (`TEST_MODE=1` sementara, versi `18e08d7d`) | 22 lulus dari 22, n = 1 rangkaian |

Terukur dengan `tests/soak.mjs`: 4 kursi, 30 detik, satu aksi per kursi per 50 ms.

| | Lokal `wrangler dev` | Tayang `workers.dev` |
| --- | --- | --- |
| loop latency | n=2.316: p50 52,7 / p90 53,4 / max 57,0 ms | n=2.332: p50 50,1 / p90 73,5 / max 298,9 ms |
| interval state | n=2.357: p50 51,9 / max 55,9 ms | n=2.442: p50 49,8 / max 258,1 ms |
| held di server | n=2.361: p50 51,0 / max 53,0 ms | n=2.446: p50 24,0 / p90 44,0 / max 50,0 ms |
| stall di atas 200 ms | 0 | 12 dari 2.442 (0,49%), rata-rata 244,1 ms |
| tick hilang | 0 | 0 |
| aksi terbalas | 2.316 dari 2.316 | 2.332 dari 2.332 |
| state per detik per kursi | 19,6 | 20,4 |
| byte per detik per kursi | terima 12.408, kirim 585 | terima 12.867, kirim 589 |

Yang dibaca dari angka itu: laju server tahan di 20 Hz lewat internet, dan sebagian besar loop adalah
batas tick, bukan jaringan (`held` p50 24,0 ms dari total 50,1 ms di kolom tayang). Paralel dengan itu,
12 stall di kolom tayang adalah konfirmasi sebagian dari pembacaan di bagian 9 yang waktu itu saya tulis
sebagai "belum dibuktikan". Bentuk lokal juga jujur perlu dicatat: `held` p50 51,0 ms di lokal lebih
tinggi dari kolom tayang karena klien tes dan timer server sama-sama 50 ms dan berjalan sephase. Itu
artefak harness, bukan keunggulan jaringan.

Yang TIDAK boleh disimpulkan dari angka ini: bahwa Cloudflare lebih cepat dari Supabase untuk game ini.
Angka pembanding 86,4 ms di bagian 2 diukur netbench dengan dunia dan harness milik sendiri, sementara
kolom tayang di atas mengukur dunia `selftest` dengan harness baru. Perbandingan yang sah keluar setelah
langkah 5, saat Slap Arena asli bisa dijalankan di kedua pintu dengan `tests/soak.mjs` yang sama.

Cara menjalankan: `node tests/soak.mjs --base <url> --seats 4 --seconds 30 --out <csv>`. Perlu
`TEST_MODE=1` karena game `selftest` hanya terdaftar saat flag itu aktif. CSV-nya memakai bentuk
`MetricRow` netbench (`seat,kind,t,v` dengan kind `loop`, `interval`, `queue`, `stall`, `loss`, `bytes`)
supaya alat analisa netbench bisa dibaca ulang nanti.

## 11. Hasil langkah 5 urutan audit: Slap Arena berjalan di dalam DO (19 Oktober)

`cloudflare/src/games/slapArena.ts` adalah adapter tipis di atas `gameApi.ts` (PR #75). Tidak ada aturan
game yang ditulis ulang di sisi Worker: `join`, `start`, `nextRound`, `input`, dan `tick` semuanya
diteruskan ke `applyAction`, dan penolakannya (`unknown_player`, `wrong_phase`, `bad_payload`,
`duplicate_seq`, `room_full`, `not_your_turn`, `name_rejected`) adalah alasan yang sudah dipakai di
sisi klien.

Dua hal yang saya cek dulu sebelum menulis apa pun, karena keduanya membatalkan desain kalau salah:

1. `SlapSim` bersih dari API browser. `sim.ts` hanya mengimpor `./types`, `./physics`, `./botAi`, dan
   `grep window|document|performance|localStorage|Audio|navigator` di keempatnya nol hasil. Buktinya
   ikut kuat karena `cloudflare/tsconfig.json` memakai `lib: ["ES2022"]` tanpa DOM dan `tsc --noEmit`
   lolos dengan engine di dalam graf impor.
2. Dunia bisa dimuat ulang: `sim.ts:295` punya `applySnapshot(snap)`, jadi `load()` DO bukan angan-angan.

Cara DO dan pintu bekerja sama:

- Game dibuat begitu nama kamar terkunci (`ensureGame()`), bukan saat master menekan start, supaya
  pemain bisa duduk di lorong. `join()` DO panggil saat koneksi diterima, dan saat DO bangun dari
  pembekuan semua kursi hidup didudukkan ulang dalam urutan kursi.
- Untuk game berpintu, DO tidak lagi menilai fase, jumlah pemain minimum, atau siapa master. Fase DO
  dipetakan dari fase dunia (`WAITING` ke `lobby`, `COUNTDOWN`/`BATTLE`/`ROUND_OVER` ke `playing`,
  `MATCH_OVER` ke `finished`), dan master diambil dari urutan duduk, aturan yang sama dipakai
  `gameApi.ts`. Itu bukan dua aturan: hanya ada satu pintu, DO tinggal membaca hasilnya.
- `msg.t === 'next'` dari protokol transport dipetakan ke `{ t: 'nextRound' }`.

Bukti merah-lalu-hijau, n = 1 rangkaian per baris:

| Tahap | Hasil |
| --- | --- |
| Empat tes Slap Arena terhadap kode tanpa adapter | 4 gagal dari 4: `world harus berisi pemain, dapat null` (73 ms), `bukan master tidak boleh mulai` (30 ms, DO menjawab `not_master` karena belum ada pintu), dan dua timeout menunggu fase yang tidak pernah ada |
| Suite penuh setelah adapter masuk, lokal | 26 lulus dari 26, `npx tsc --noEmit` exit 0 |
| Suite penuh terhadap URL tayang | 26 lulus dari 26, n = 1 rangkaian |

Satu perbaikan harness saya tulis jujur karena merah yang pertama bukan merah yang benar: `recvState`
awalnya hanya melihat pesan yang datang setelah ia dipasang, padahal state pertama biasanya sudah tiba
bersama welcome, jadi tiga tes gagal karena timeout, bukan karena assertion. Setelah helper itu membaca
seluruh log, merah yang tersisa adalah assertion yang sebenarnya.

Terukur dengan `tests/soak.mjs --game slap-arena`, 4 kursi x 30 detik, satu aksi per kursi per 50 ms:

| | Lokal | Tayang |
| --- | --- | --- |
| loop latency | n=2.320: p50 52,6 / p90 53,6 / max 81,3 ms | n=2.336: p50 49,3 / p90 69,6 / max 146,6 ms |
| interval state | p50 51,9 / max 81,4 ms | p50 49,9 / max 122,3 ms |
| held di server | p50 50,0 / max 69,0 ms | p50 24,0 / p90 43,0 / max 50,0 ms |
| stall di atas 200 ms | 0 | 0 |
| tick hilang | 0 | 0 |
| aksi terbalas | 2.320 dari 2.320 | 2.336 dari 2.336 |
| state per detik per kursi | 19,6 | 20,3 |
| byte per detik per kursi | terima 29.331, kirim 1.379 | terima 30.404, kirim 1.388 |

Payload dunianya sendiri: snapshot `slap-arena` dengan dua kursi saat `COUNTDOWN` adalah 580 byte
(diukur `JSON.stringify(world).length` pada satu sampel tayang). Bundle Worker naik dari 17,37 KiB
(5,38 KiB gzip) menjadi 47,25 KiB (13,45 KiB gzip) karena engine ikut ter-bundle; startup time 3 ms.

Deploy yang dipakai: `f3a55552-4b28-4418-a603-2ba67f5aa3d4` dengan `TEST_MODE=1` sementara untuk suite
dan soak live, lalu `487b2c27-976a-43e2-8e98-66ca57ae9ccd` dengan `TEST_MODE=0` yang aktif sekarang.
Pada versi produksi itu Slap Arena tetap berjalan (`game=slap-arena` tidak memerlukan flag uji): dua
kursi duduk, master mengirim start, fase DO `playing`, fase dunia `COUNTDOWN`, snapshot 580 byte, dan
`?probe=1` tetap menolak 426.

Yang belum terukur dan belum dibuat: `applied`/`held` sudah ada tapi belum dibaca satu baris kode
frontend pun; belum ada koneksi ke Supabase untuk arm pembanding dengan harness yang sama; CPU per
tick belum diukur (wrangler lokal tidak memakinya); dan `load()` baru teruji lewat tes unit `gameApi`,
belum lewat eviksi DO sungguhan.
