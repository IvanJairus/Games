# Changelog

Catatan perubahan untuk [ivanjairus.xyz/games](https://www.ivanjairus.xyz/games/).
Entri disusun per tanggal, mengikuti gaya [Keep a Changelog](https://keepachangelog.com/id/1.1.0/)
untuk nama seksinya. Versi di `package.json` sengaja tidak ikut dinaikkan di sini; itu keputusan
terpisah saat kamu menerbitkan rilis.

Entri dimulai dari 14 Oktober 2026. Perubahan sebelum tanggal itu ada pada riwayat git dan daftar
pull request, karena tidak dicatat saat terjadi.

## 2026-10-14 - Slap Arena (PR #5 sampai #8)

Rombak besar Slap Arena. Game ini sebelumnya tayang dalam keadaan multiplayer tidak bisa start
dan layar menjadi kosong setiap kali pemain jatuh.

### Ditambahkan

- `SlapSim` (`src/games/slap-arena/engine/sim.ts`): dunia game keluar dari React state, dengan
  fixed timestep 120 Hz, mesin fase `WAITING -> COUNTDOWN -> BATTLE -> ROUND_OVER -> MATCH_OVER`,
  dan event bus internal untuk efek suara dan visual.
- Protokol multiplayer host-authoritative di atas Supabase Realtime broadcast
  (`sa_in`, `sa_snap`, `sa_fx`, `engine/net.ts`). Klien mengirim niat, host mengirim dunia.
  Klien memprediksi brawler-nya sendiri lalu direkonsiliasi terhadap host.
- Karakter prosedural (`components/three/brawler.ts`): kepala 52% tinggi badan, kaki pendek,
  sarung tinju besar, topi beruang pom, dan garis tinta lewat inverted hull tanpa shader.
- Toon shading tiga tingkat, langit bergradasi, pulau dengan batu tepi, pohon, jamur, dan cincin
  bahaya berdenyut saat pemain berdiri di bibir jurang.
- Cincin tim berwarna di bawah tiap brawler supaya empat karakter serupa tetap terbedakan.
- Partikel dampak, teks komik (PAF!, SUIT!, BUK!), screen shake, hit-stop, dan confetti saat menang.
- Kontrol sentuh: floating joystick yang muncul di bawah jempol, `env(safe-area-inset-*)`,
  tata letak landscape tersendiri, dan getar haptik.
- Tombol bisu dengan preferensi tersimpan, dukungan `prefers-reduced-motion`, focus trap dan
  Escape pada modal.
- Adaptive quality: pixel ratio dan bayangan turun otomatis saat FPS di bawah 45.
- `window.__slapSim` dan `window.__slapNet` pada mode DEV sebagai hook diagnostik.
- 128 tes baru: 29 unit engine, 8 netcode lewat relay palsu, 15 UI pada viewport 1280px dan 375px,
  2 tes pagari CSP, plus tes yang mengunci bahwa bot benar-benar menampar.

### Diubah

- Nama event broadcast memakai satu sumber konstanta. Sebelumnya pengirim memakai `player_move`
  sementara penerima menunggu `game_move`, jadi tidak ada pesan yang pernah sampai.
- Pemain yang gabung kini terdaftar lewat `joinOnlineRoom()` sebelum berlangganan room.
- Snapshot multiplayer membawa `isFalling`, `eliminated`, `score`, dan `phase`.
- `game_type` memakai nilai `'slap-arena'`; kolomnya `text` tanpa CHECK constraint sehingga tidak
  perlu migrasi.
- `eventsPerSecond` realtime 10 menjadi 20, mengikuti laju snapshot host.
- `SLAP_FORCE` 14 menjadi 20, `SLAP_CONE` 100 derajat menjadi 78, dan cooldown tampar 0,48 menjadi
  0,55 detik. Nilai 20 adalah terkecil yang membuat ronde benar-benar tuntas: KO pertama 13 detik,
  ronde selesai 16 detik, dari sebelumnya 0 ronde tuntas dalam 120 detik.
- Bot punya kepribadian stabil berdasarkan id: yang berani memburu pemain, yang hati-hati mengadu
  dengan bot lain, dan seluruhnya menahan diri pada 6 detik pertama.
- Grace 2,5 detik di awal ronde dengan knockback 0,55x, supaya pemain yang masih membaca kontrol
  tidak langsung tercebur.
- Rute arena dimuat malas (`React.lazy`), memisahkan three.js dari bundel hub.
- Font display Fredoka di-self-host (29,7 KiB) karena CSP situs `default-src 'self'`.
- `scripts/release-audit.mjs` menjalankan seluruh folder `tests/ui`, bukan dua file yang disebut
  namanya. Gerbang lama melewatkan suite UI baru sama sekali.
- `subscribeToMatch()` menerima parameter opsional untuk event broadcast, presence, dan status
  koneksi. Pemanggil lama (wall-game, tic-tac-toe, battleship) tidak berubah.

### Diperbaiki

- Multiplayer tidak pernah bisa mulai: fase `BATTLE` hanya bisa dicapai dari modal `ROUND_OVER`
  yang sendiri membutuhkan `BATTLE`. Lingkarar tertutup.
- Layar menjadi biru kosong setiap kali pemain jatuh. Lerp kamera fallback salah rumus sehingga
  konvergen ke y=240 dan `FogExp2` menelan seluruh scene.
- HUD cooldown tidak pernah berubah karena loop memutasi state tanpa memicu render.
- Karakter miring permanen setelah ronde pertama; rotasi saat jatuh tidak pernah direset.
- Bot tidak pernah menampar: `fixedStep` hanya mengeksekusi aksi untuk pemain manusia, jadi
  keputusan bot dihitung lalu dibuang.
- Patah-patah di desktop: hit-stop melewati `sim.step` sehingga frame berikutnya menelan seluruh
  durasi beku sekaligus. Sekarang dibekukan dengan `dt` nol.
- Karakter melaju sendiri di ronde berikutnya: lapisan kontrol sentuh di-unmount tanpa melepas
  vektor joystick. Terukur drift 7,0 unit tanpa sentuhan, yaitu langsung keluar pulau.
- Countdown duduk di pojok kiri bawah pada layar HP, sekarang di tengah.
- `catch {}` kosong dan `if (!supabase) return` yang membuat kegagalan berjalan senyap; sekarang
  ada pesan.
- Handler `webglcontextlost` dan fallback untuk perangkat tanpa WebGL.
- Nama pemain terpotong di tengah kata ("Brawler Bo"), sekarang dengan elipsis.
- Warna kostum pemain tidak pernah terkirim ke lawan.

### Dihapus

- `VirtualJoystick.tsx`, digantikan `TouchControls.tsx`.
- Pipeline aset GLB: `public/models/`, `scripts/build-slap-assets.mjs`, loader karakter, dan
  devDependency `@gltf-transform/*`.

### Keamanan

- Pengecualian CSP yang sempat ditambahkan untuk decoder WebAssembly dan blob URL ditarik kembali
  setelah jalur model dihapus. `vercel.json` produksi kini kembali `script-src 'self'` tanpa
  `wasm-unsafe-eval`, dan tanpa `blob:` pada `connect-src` maupun `img-src`.
- Tes pagari menuntut kebijakan tetap ketat, sehingga memasukkan lagi pipeline GLB harus melebarkan
  CSP secara sadar.
- Data uji Slap Arena di Supabase dibersihkan: 14 baris `matches` dan 25 baris `match_players`
  milik sesi verifikasi tanggal 14 Oktober.

### Terukur

| Metrik | Sebelum | Sesudah |
| --- | --- | --- |
| Chunk JS utama | 1401 KiB (380 gzip) | 353 KiB (111 gzip) |
| Chunk arena | di dalam utama | 581 KiB (151 gzip), dimuat malas |
| Unduhan model 3D | 0 (prosedural) | 0 |
| Pengecualian CSP | 0 | 0 |
| FPS desktop / mobile 375px | tidak diukur | 60 / 60 |
| Frame di atas 50 ms saat pertarungan | tidak diukur | 0 dari 361 frame |
| Error konsol dan failed request | tidak diukur | 0 |
| Total tes | 82 | 139 |

Diverifikasi pada 14 Oktober 2026 di `https://www.ivanjairus.xyz/games/slap-arena` setelah deploy
produksi sukses, dengan dua sesi browser terisolasi untuk jalur multiplayer.

## Rujukan

- PR #5 `fix(slap-arena): rebuild sim, netcode and presentation`
- PR #6 `fix(slap-arena): let the site CSP load the GLB pipeline` (pengecualiannya dicabut di PR #8)
- PR #7 `fix(slap-arena): bots can slap, hit-stop stops stuttering, stick releases between rounds`
- PR #8 `feat(slap-arena): procedural chunky brawler, strict CSP restored`
- Baseline jumlah tes diukur pada `0ac7f76` (main sebelum PR #5) memakai worktree terpisah.
