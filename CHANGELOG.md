# Changelog

Catatan perubahan untuk [ivanjairus.xyz/games](https://www.ivanjairus.xyz/games/).
Entri disusun per tanggal, mengikuti gaya [Keep a Changelog](https://keepachangelog.com/id/1.1.0/)
untuk nama seksinya. Versi di `package.json` sengaja tidak ikut dinaikkan di sini; itu keputusan
terpisah saat kamu menerbitkan rilis.

Entri dimulai dari 14 Oktober 2026. Perubahan sebelum tanggal itu ada pada riwayat git dan daftar
pull request, karena tidak dicatat saat terjadi.

## 2026-10-15 - Battleship: pop-up hasil dan rematch satu room

### Ditambahkan

- **Pop-up singkat saat pertandingan selesai**, di mode solo, hotseat, dan online: siapa yang menang,
  alasan berakhir, jumlah tembakan kedua pihak, lalu tiga jalan keluar (Main lagi atau Rematch, Lobi
  Battleship, Halaman utama). Ada tautan "Lihat bukti armada" untuk menutup pop-up dan membaca detail
  commit-reveal di bawah papan, jadi pop-up tidak menyembunyikan bukti.
- **Rematch di room online.** Satu langkah `REMATCH` mengembalikan baris room ke fase `PLACEMENT`
  dengan pemenang kosong, jadi kedua pemain memakai kode room yang sama tanpa membuat room baru.
  Perangkat yang menerima perubahan itu menghapus armada lama dari penyimpanan lokal dan memasang
  kembali penjaga reveal, sehingga pertandingan kedua tetap terbuktikan.
- `src/games/common/ResultDialog.tsx`: dialog hasil bersama berbasis native `<dialog>` (Escape, fokus
  awal di aksi pertama, klik backdrop) dengan kelas `.ij-dialog` di `src/index.css`.

### Diubah

- Modal kemenangan WallGo dan dialog kemenangan Tic Tac Toe memakai `ResultDialog`. Teks, lambang, dan
  `data-testid` lamanya tetap sama, jadi test yang sudah ada tidak berubah. Tombol primary pop-up kini
  hitam tinta mengikuti Battleship, bukan kuningan.
- Slap Arena sengaja tidak ikut dipindahkan. Kartu `sa-` punya arah seni sendiri (Fredoka, kartu
  permen) dan hanya bentuk aksinya yang disamakan.
- Room yang lawannya sudah keluar tidak menawarkan rematch. Tombolnya berubah menjadi "Keluar dari
  room", karena restart hanya akan menghasilkan papan yang tidak bisa dimainkan.

## 2026-10-15 - Slap Arena: gerakan lancar, tampar terisi, dan tombol efek

### Diperbaiki

- **World tidak lagi dibekukan 70 ms setiap hit mendarat.** Pembekuan itu (`HIT_STOP_MS`) adalah
  sumber utama "patah-patah" pada rekaman layar 15 Oktober: ia menghentikan simulasi sementara
  kamera tetap meluncur, dan pada mode online mendorong posisi klien melewati ambang
  `reconcile` 1,1 m sehingga pemain ter-lempar balik ke posisi tuan rumah tiap kali dipukul.
  Penggantinya adalah tahan-pose per brawler (`Arena3DHandle.freeze`): lengan dan badan tertahan
  beberapa frame, posisi gambar tidak pernah ditahan, jadi tidak ada lompatan.
- **Semua timer animasi kini memakai `dt` asli.** `poseFor` sebelumnya maju `1/60` per frame,
  sehingga di layar 45 fps animasi memukul berputar pada 0,75x kecepatan dan tidak sinkron dengan
  fisika yang berjalan di 120 Hz.
- **Tampar dari klien sering tidak sampai ke tuan rumah.** Sim dan pengirim jaringan berbagi satu
  objek input, dan sim menghapus flag `slap` di tempat pada frame berikutnya, sebelum tick 50 ms
  sempat membacanya. Sekarang halaman mengirim salinan ke sim dan membawa nomor urut aksi (`seq`)
  di `sa_in`; tuan rumah berekasi saat nomornya berubah. Klien lama tanpa `seq` tetap diterima.
- **Brawler yang KO di sisi klien mengambang di laut.** `fallY` tidak ikut snapshot, jadi sekarang
  klien menghitung penurunannya sendiri.
- **`bump` tidak pernah meluruh untuk brawler remote**, membuat lawan terkunci dalam pose penyok
  sampai ronde berikutnya.

### Diubah

- **Tahan Spasi atau tahan tombol TAMPAR untuk menampar terisi.** Tap biasa berubah menjadi
  tampar terisi penuh: gaya 20 menjadi 44 (`SLAP_FORCE * (1 + 1,2 * charge)`), stun 0,26 dtk
  menjadi 0,40 dtk, cooldown 0,55 dtk menjadi 0,85 dtk, dan korban terangkat ke sumbu Y dengan
  puncak lintasan sekitar 0,44 m. Jangkauan dan kerucut pukulan sengaja tidak disentuh, jadi
  tidak ada pemain yang tiba-tiba terkena pukulan yang sebelumnya meleset.
- Auto quality sekarang bisa naik lagi dengan hysteresis EWMA, bukan turun permanen setelah satu
  jendela buruk. Garis trip lamanya (`fps < 45`) ternyata duduk tepat di angka rekaman pengguna.
- `antialias`, batas `pixelRatio` (2 menjadi 1,5 pada mode tinggi), bayangan, dan cangkang outline
  kini dikendalikan satu tabel gerbang (`engine/fxMode.ts`) alih-alih tersebar.
- Remote brawler digambar sedikit di sepanjang vektor kecepatannya (maksimum 0,6 m) supaya
  tubuh yang terlempar terbaca sebagai lintasan, bukan 20 lompatan diskrit per detik.
- `popText` tidak lagi memanggil `getBoundingClientRect()` di dalam frame yang baru saja menulis
  transform semua label, dan jumlah node `.sa-pop` dibatasi lewat pool.

### Ditambahkan

- Tombol `FX AUTO / TINGGI / RENDAH` di HUD, tersimpan di `localStorage` kunci `ij_slap_fx`,
  mengikuti pola preferensi suara yang sudah ada. Mode `HEMAT` tampil saat auto menurunkan
  kualitas sendiri.
- Pose wind-up di rig: sarung tangan ditarik ke belakang, badan memutar melawan, kaki berhenti
  melangkah, dan gemetar pada 20 persen terakhir tahan.
- Cincin pengisi daya di tombol TAMPAR sentuh, karena melepas di *release* berarti pemain perlu
  bukti visual bahwa menahan itu sedang melakukan sesuatu.
- `tahan Spasi = lempar jauh` pada legenda keyboard, dan `Burst.angle` agar serpihan debu
  mengarah searah knockback.

### Terukur

Rekaman pengguna (`Screen Recording 2026-10-15 at 10.50.09.mov`, 1019 frame, mode solo, Opera):
rata-rata **45,1 fps**, dengan jeda 66-88 ms yang berulang tepat saat hit mendarat.

Sesudah, diukur lewat `requestAnimationFrame` delta di Chrome headless (new), kanvas 1920x1200,
`devicePixelRatio` 2, mode `high`, 15 detik melawan bot: **60,1 fps**, p50/p95/max =
16,7 / 16,7 / 16,8 ms, **0 frame di atas 60 ms dari 902 frame dengan 14 hit mendarat**.

Dua angka itu bukan apples to apples: browser dan alat rekamnya berbeda, dan sebagian 45 fps
bisa jadi berasal dari screen recorder macOS itu sendiri. Yang bisa dipertahankan adalah hilangnya
jeda 70 ms per hit, yang penyebabnya kode dan memang terukur ada di rekaman.

Tampar, dibaca dari event `hit` di dunia berjalan (bukan dari kode): tap `force 11` (grace 0,55
aktif), tahan 0,61 dtk `force 39,11` dengan korban di `y = 0,31` dan berpindah 3,46 m dalam 150 ms.

Uji slap-arena bertambah 19 kasus (42 menjadi 57 unit, 16 menjadi 20 UI). `npm run release:check`
lulus 5 tahap.

### Batas yang belum terbukti

Mode dua pemain sungguhan di dua perangkat belum dicoba; jalur protokolnya yang teruji lewat
harness relay. Dan tombol efek baru diverifikasi di Chrome, bukan di browser kelas bawah.

## 2026-10-15 - WallGo: tiga tingkat bot dan entrance "Lawan Bot"

### Diubah

- **Bot WallGo sekarang punya tiga tingkat: Santai, Sedang, Sempurna.** Dua gaya lama (`jalan` dan
  `agresif`) dihapus. `sedang` mewarisi persis perilaku `agresif`, jadi tidak ada kemampuan yang
  hilang dari permainan yang sudah ada.
- `sempurna` mencari dinding di seluruh papan, bukan hanya radius dua di sekitar pemimpin, menilai
  balasan terbaik rival sebelum memilih langkah, dan hanya memasang dinding kalau setiap rival
  tertahan lebih lama daripada dirinya sendiri.
- `WallgameLocal` membaca `?bot=<tingkat>&bots=<jumlah>&seats=<jumlah>`, jadi meja bot bisa
  dibagikan sebagai tautan dan layar konfigurasi tetap bisa mengubah sisanya.

### Ditambahkan

- Kartu "Lawan Bot" selebar papan di lobby WallGo, satu tautan per tingkat, diletakkan di atas
  kartu Hotseat Lokal dan Multiplayer Online.
- Kursi bot di layar konfigurasi menampilkan nama aslinya ("Bot 2") sebelum permainan dimulai,
  bukan lagi "Pemain 2".

### Terukur, harness seeded di `tests/unit/wall-game-ai.test.ts`

n = 100 game per pasangan, dua kursi, kursi pembuka bergantian tiap game.

| Pasangan | Menang |
| --- | --- |
| Santai vs Sedang | 0 - 100 |
| Santai vs Sempurna | 0 - 100 |
| Sedang vs Sempurna | 48 - 52 |

48-52 tidak bisa dibedakan dari 50-50 pada n=100 (simpangan bakunya sekitar 5 game), jadi klaim
"Sempurna lebih kuat dari Sedang" **tidak terbukti di meja dua kursi**, dan test hanya menuntut
"tidak lebih lemah". Yang benar-benar menentukan kemenangan di game ini adalah kebiasaan memasang
dinding: bot terbaik dalam melangkah tapi tanpa dinding kalah 0-60 dari semua bot berdinding
(ablation 60 game per pasangan).

Di meja lebar, satu pengukuran terpisah dengan policy yang sama (30 game, tiga policy duduk di
satu meja, rotasi kursi tiap game): Sempurna 16 menang, Sedang 10, dan varian yang hanya menimbang
dua rival terdekat 4. Untuk enam kursi: 13, 11, dan 6. Biaya pikir Sempurna terukur 1,8 detik untuk
60 ply di meja 6 kursi 13x13; jeda pacing 520 ms per giliran bot tetap yang paling terasa pemain.

## 2026-10-14 - Perbaikan regresi: rematch dan riwayat terpisah (PR #19)

### Diperbaiki

- **Regresi yang saya buat sendiri di PR #17.** Larangan UPDATE pada baris `matches` yang sudah
  `completed` membuat "Ronde Berikutnya" mati diam-diam di semua game online, karena rematch
  menulis `completed -> playing` pada baris yang sama. Terukur sebagai role `anon`: finish
  mendarat, rematch mengembalikan nol baris.
- Slap Arena tidak pernah mencatat pertandingan selesai. `MATCH_OVER` hanya menggerakkan UI,
  sehingga angka hub untuk game itu akan selalu 0.

### Ditambahkan

- Tabel `match_results`: satu baris per finish, hanya ditulis trigger `SECURITY DEFINER` saat
  status berpindah ke `completed`. Anon punya SELECT dan tidak ada policy lain, jadi riwayat
  tidak bisa digembungkan atau dihapus dari klien.
- `finishOnlineMatch({ matchId, winnerIndex })` dengan penjaga `.eq('status','playing')`,
  dipanggil host saat MATCH_OVER. "Main lagi" membuka kembali barisnya.
- Backfill pertandingan yang selesai sebelum tabel itu ada, supaya angka hub tidak turun
  saat deploy.

### Terukur, di DB produksi sebagai role `anon`

| Uji | Sebelum 005 | Sesudah 005 |
| --- | --- | --- |
| Rematch `completed` -> `playing` | 0 baris (rusak) | 1 baris |
| Finish kedua pada room yang sama | tidak tercatat | 2 baris riwayat |
| INSERT langsung ke `match_results` | tabel belum ada | ditolak `42501` |
| UPDATE / DELETE `match_results` | tabel belum ada | 0 baris |
| RPC sebagai anon | 1 (wall-game) | 1 (wall-game), tidak turun |

177 tes lulus, termasuk satu tes baru untuk `finishOnlineMatch`.

## 2026-10-14 - Susulan: tulis yang tak terpakai ditutup, hitungan jadi satu panggilan (PR #18)

### Keamanan

- Policy `UPDATE` pada `match_players` dihapus. Tidak ada satu pun jalur kode yang
  memperbarui baris pemain: gabung itu INSERT, keluar itu DELETE dengan
  `match_id + session_id`, dan reconnect menemukan baris lama.
- Policy `INSERT` pada `match_players` tidak lagi `with check (true)`. Kursi baru harus
  menempel pada pertandingan yang belum `completed`. Status `playing` dan `abandoned`
  sengaja tetap boleh, karena tamu yang menulis kursinya tepat saat host memulai
  pertandingan adalah ras nyata.
- Dua-duanya diuji sebagai role `anon` di DB produksi: INSERT ke room `waiting` 1 baris,
  INSERT ke room `completed` ditolak `42501`, UPDATE 0 baris.

### Diubah

- `match_completion_counts()` menggantikan empat request HEAD per game dengan satu RPC.
  Fungsinya berjalan sebagai pemanggil, jadi RLS tetap yang menentukan baris mana yang
  ikut dihitung.
- Permintaan ke `/rest/v1` saat halaman hub dibuka: 8 HEAD + 8 OPTIONS menjadi 2 POST +
  2 OPTIONS di dev (StrictMode menggandakan efek). Tanpa StrictMode: 8 menjadi 2.

## 2026-10-14 - Lapisan suara hub, angka riwayat, dan RLS (PR #13 sampai #17)

Tiga dari empat game bisu, satu dialog sistem masih tersisa, dan tabel pertandingan
ditulis tapi tidak pernah dilihat siapa pun.

### Ditambahkan

- `src/games/common/audio.ts`: engine Slap Arena yang ternyata sudah generik (context dibuat
  malas, tiap cue di-throttle, tanpa aset), dipindah apa adanya lalu ditambah cue untuk game
  berbasis giliran: `playSelect`, `playPlace`, `playBlocked`, `playHit`, `playMiss`,
  `playVictory`, `playDefeat`.
- `src/games/common/haptics.ts` (`buzz`, `buzzTap`, `buzzThud`, `buzzReject`) dan
  `src/games/common/SoundToggle.tsx` (`useMuted` + tombol ikon). Dipasang di wall-game,
  tic-tac-toe, dan battleship; Slap Arena tetap memakai tombol bertema sendiri di HUD.
- `src/games/common/matchStats.ts`: jumlah pertandingan `completed` per game, ditampilkan di
  kartu hub sebagai "N pertandingan online selesai".
- `supabase/migrations/003_protect_finished_matches.sql`.
- `window.__slapDiag` pada mode DEV: `quality`, `shadows`, `pixelRatio`.
- 11 tes bersih: 5 audio bersama dengan `FakeAudioContext`, 3 jumlah pertandingan, 4
  play-through Tic Tac Toe lewat UI asli, dikurangi 1 tes audio lama yang pindah tempat.

### Diubah

- Preferensi bisu jadi satu kunci untuk seluruh hub: `slap_muted` menjadi `ij_games_muted`.
- Cue game board dibangkitkan dari state yang tersinkron, bukan dari handler klik, supaya
  langkah lawan di room online juga terdengar.

### Diperbaiki

- `alert()` di Tic Tac Toe, satu-satunya dialog sistem di repo ini, diganti notice di dalam
  dialog kemenangan. Banner error halaman tidak terlihat saat modal terbuka.

### Keamanan

- `matches`: `UPDATE` kini mensyaratkan barisnya belum `completed`, dan `INSERT` mensyaratkan
  `status = 'waiting'`. Menyelesaikan pertandingan tetap bisa; membalik catatan yang sudah
  selesai atau menyisipkan kemenangan karangan sendiri tidak.
- Yang berubah: keluar dari room setelah pertandingan selesai tidak lagi menulis ulang barisnya
  jadi `abandoned`. Klien tidak memeriksa hasil update itu, jadi alurnya tetap jalan.
- `SELECT` dan `match_players` tidak diubah. Anon key memang publik, dan membaca adalah
  fitur halaman ini.

### Terukur

| Metrik | Sebelum | Sesudah |
| --- | --- | --- |
| Game yang bersuara | 1 dari 4 | 4 dari 4 |
| `AudioContext` per sesi main | 1 | 1 |
| Kunci preferensi bisu | per game | satu untuk hub |
| Node audio dibuat satu langkah Tic Tac Toe | 0 | 1 oscillator + 1 buffer |
| Total tes | 165 | 176 |
| Adaptive quality terlihat bekerja | belum pernah | `high` ke `low` dalam 3,0 s (CPU 20x) |
| `pixelRatio` saat turun | tidak terukur | 2 ke 1,35, bayangan mati |
| FPS desktop / mobile setelah modul audio pindah | 60 / 60 | 60 / 60 |
| Query `matches` yang menampilkan sesuatu | 0 | 1 per game, HEAD, body 0 byte |
| Baris `completed` yang bisa diubah anon | semua | nol |

Diverifikasi di `www.ivanjairus.xyz` dengan dua konteks browser terisolasi: room dibuat,
digabung, kedua sisi sampai `BATTLE`, satu ronde tuntas, 0 error halaman. Uji RLS dijalankan
sebagai role `anon` di dalam transaksi yang di-rollback, dan room uji sudah dihapus.

## 2026-10-14 - Slap Arena: polish karakter (PR #12)

Karakter prosedural dari PR #8 masih jauh dari arah "bulat cebol" yang dipilih lewat pratinjau.
Enam cacat geometri dan pencahayaan menumpuk menjadi satu wajah yang jelek.

### Diperbaiki

- Mata terkubur di bawah kupluk. Garis bibir topi duduk di y=1,439 sementara mata di y=1,62,
  dihitung dari geometri yang sama. Kepala dinaikkan (`HEAD_Y` 1,56 menjadi 1,68) dan dome topi
  dipendekkan.
- Rambut membungkus 209 derajat sehingga menutupi separuh wajah. Sekarang pita 120 derajat di
  tengkuk saja; wajah tetap kulit dan punggung tidak lagi menjadi gumpalan polos.
- Sarung tinju merah tidak terlihat di atas kostum merah. `gloveColor()` menukar warnanya ke krem
  saat hue kostum bertabrakan.
- Kulit pemain berwarna zaitun. Pantulan tanah `HemisphereLight` memakai warna rumput `#6fcf7c`;
  diganti abu netral `#cfd6dd`.
- Mulut membentuk huruf J, bukan senyum. Busur torus diputar `PI*1.4` menjadi `PI*1.1`.
- Jamur tumbuh di dalam ring spawn, terlihat sebagai artefak render di bawah kaki pemain.
  digeser ke 0,62-0,96 radius pulau.
- Pohon menutupi karakter saat berkelahi karena berdiri di radius 0,80, persis di area pertarungan.
  Sekarang empat pohon di 0,955 (bibir pulau) dengan tajuk dikecilkan dari 0,95 menjadi 0,78.

### Diubah

- Kamera portrait tidak lagi memaksa seluruh piringan muat secara horizontal. Bibir piringan boleh
  ter-crop dan kamera mengikuti pemain. Terukur pada layar 390x844: jarak kamera 50,0 menjadi
  38,8 unit dan ukuran karakter di layar 29,4 menjadi 38,3 px, yaitu 30% lebih besar.
- `window.__slapCamHold` (mode DEV saja) menahan kamera di satu titik, satu-satunya cara memotret
  brawler dari dekat untuk tinjauan visual.

### Terukur

| Metrik | Sebelum | Sesudah |
| --- | --- | --- |
| Ukuran karakter di layar 390x844 | 29,4 px | 38,3 px |
| Jarak kamera portrait | 50,0 unit | 38,8 unit |
| FPS desktop / mobile | 60 / 60 | 60 / 60 (n=121 frame) |
| Error halaman | 0 | 0 |

Diverifikasi dengan `tsc -b` bersih, 139 tes lulus, dan `npm run release:check` 5/5.

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
- PR #12 `fix(slap-arena): make the brawler readable instead of ugly` (entri polish karakter di atas)
- PR #13 `fix(tic-tac-toe): report an abandoned room inside the dialog`
- PR #14 `feat(games): share one sound and haptics layer across the hub`
- PR #15 `feat(hub): show how many online matches each game has finished`
- PR #16 `test(slap-arena): prove adaptive quality fires, play tic-tac-toe in the UI`
- PR #17 `chore(supabase): stop anon writes from rewriting finished matches`
- PR #18 `chore(supabase): close unused writes and count finished matches in one call`
- PR #19 `fix(supabase): let a rematch reopen a room, keep history in its own table`
- Baseline jumlah tes diukur pada `0ac7f76` (main sebelum PR #5) memakai worktree terpisah.
