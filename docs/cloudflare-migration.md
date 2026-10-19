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

- Gerbang P1b berstatus **blokir**: `preflight.mjs` mengukur endpoint Worker median 245-249 ms
  (anycast ke HKG/CDG/NRT) sementara Supabase 21-30 ms dari mesin yang sama.
- Kesimpulan yang sudah ditulis di sana: arm DO memangkas loop latency 38 persen dan tidak terpengaruh
  host migration, tapi sebagian kemenangannya karena edge 41 ms lebih dekat, dan arm `C-r` hanya 9 persen.
- Catatan metode: jaringan kantor menunjukkan SYN retransmit, dan satu baris pengukuran TCP connect
  ke edge Supabase memberi min 8,6 ms / median 1.030 ms / max 5.020 ms dengan 3 timeout. Angka selebar
  itu bukan latensi, itu artefak jaringan.

Jadi sebelum menyetujui langkah 3, satu hal perlu diulang di jaringan lain (hotspot HP): `preflight`
kedua endpoint. Kalau Worker tetap 240 ms dan Supabase 25 ms di jaringan bersih, migrasi ini akan
**memperburuk** lag yang ingin dihilangkan, dan keputusan yang benar adalah memperbaiki H1 lebih dulu
(kurangi laju dan ukuran pesan), bukan ganti transport.

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
2. Gerbang latensi netbench (Worker 245-249 ms versus Supabase 21-30 ms dari mesin ini) **ditunda**:
   dikerjakan dulu, diukur nanti. Karena itu langkah 3 wajib menyisakan saklar `TRANSPORT` dan jalur
   Broadcast lama tetap hidup, supaya kalau angka nyata menunjukkan Cloudflare lebih jauh, kita bisa
   kembali tanpa membongkar apa pun.

## 7. Yang akan dihasilkan langkah 2

Untuk game pertama: modul murni dengan `createGame(players)`, `applyAction(state, playerId, action)`,
`removePlayer(state, playerId)`, tanpa jaringan, DOM, atau Supabase, plus unit test aturan main.
Gerbang berhenti: test aturan harus terlihat merah sebelum hijau, dan `guard:check` tetap lolos
(aturan kemurnian engine dijaga mesin sejak PR #50).
