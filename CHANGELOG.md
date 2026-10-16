# Changelog

Catatan perubahan untuk [ivanjairus.xyz/games](https://www.ivanjairus.xyz/games/).
Entri disusun per tanggal, mengikuti gaya [Keep a Changelog](https://keepachangelog.com/id/1.1.0/)
untuk nama seksinya. Versi di `package.json` sengaja tidak ikut dinaikkan di sini; itu keputusan
terpisah saat kamu menerbitkan rilis.

Entri dimulai dari 14 Oktober 2026. Perubahan sebelum tanggal itu ada pada riwayat git dan daftar
pull request, karena tidak dicatat saat terjadi.

## 2026-10-16 - WallGo: kalibrasi anggaran test saya sendiri yang membuat main merah

Entri sebelumnya mengganti assertion jam dinding dengan rasio terhadap beban kalibrasi. Gagasnya benar,
ukurannya salah, dan sayalah yang memasangnya ke `main`.

### Diperbaiki

- Test anggaran giliran bot **timeout pada Vitest default 5000 ms** di runner, jadi `main` merah lagi
  dan `Deploy to Vercel` kembali ter-skip. Assertion rasionya tidak pernah dijalankan sampai selesai:
  log-nya `Error: Test timed out in 5000ms`. Test-nya sendiri butuh sekitar 4,6 detik di runner,
  karena kalibrasi tiga sampel yang saya pasang terlalu mahal untuk plafon default itu.
- Beban kalibrasi diturunkan dari 20000 menjadi 5000 kali `getShortestPath` (tetap tiga sampel,
  diambil yang tercepat). Satu sampel kini sekitar 105 ms di laptop, dan biaya per BFS terukur stabil
  20,3 sampai 21,1 mikrodetik pada semua ukuran yang saya coba, jadi penurunan ini tidak mengubah
  sifat pengukuran.
- Test itu sekarang membawa timeout sendiri, `{ timeout: 30000 }`, supaya marginnya tertulis di tempat
  dan tidak diwarisi dari default yang bisa berubah.

### Terukur

| Kondisi | Rasio | Hasil |
| --- | --- | --- |
| Kode sekarang, lima kali jalan | 10,60x sampai 14,14x | lulus (anggaran 22x) |
| Search dibuat 2x lebih mahal, tiga kali jalan | 27,89x, 28,66x, 29,89x | gagal pada assertion yang sama |
| Durasi test | 1,74 sampai 1,87 detik normal, 2,96 detik saat mesin terganggu | margin 10x terhadap timeout 30 detik |

Runner GitHub terukur sekitar 1,7x lebih lambat dari laptop pada kedua sisi rasio (search 2501 ms vs
1450 ms, kalibrasi 711 ms vs 420 ms pada 20000 iterasi), dan itu justru yang membuat rasio bertahan
saat mesinnya sibuk. Pada satu run lokal yang terganggu, kedua sisi naik bersama dan rasionya turun ke
10,60x.

## 2026-10-16 - WallGo: anggaran giliran bot diukur relatif, bukan jam dinding

### Diperbaiki

- **Test `keeps the wide-board search inside a usable turn time` tidak lagi bergantung pada
  kecepatan runner.** Assertion itu membandingkan durasi murni terhadap angka tetap 3000 ms, jadi
  ia mengukur mesin CI, bukan kode. Pada commit yang identik test ini tercatat 2333 ms, 2415 ms dan
  2451 ms (lulus) serta 3465 ms dan 4262 ms (gagal). Dua dari empat run `Security & Quality Audit`
  merah karenanya, dan satu deploy produksi ikut ter-skip karena job deploy bergantung pada audit itu.
- Sekarang test membandingkan biaya search terhadap **beban kalibrasi yang diukur di proses yang
  sama** (4000 kali `getShortestPath` pada papan 13x13). Yang diuji adalah rasio, jadi mesin lambat
  dan mesin cepat menilai kode yang sama dengan cara yang sama.

### Terukur

- Ambang lama 3000 ms tidak dinaikkan dan test tidak dihapus. Beban kalibrasinya 20000 kali
  `getShortestPath` pada papan 13x13, diambil waktu tercepat dari tiga sampel supaya jitter runner
  tidak ikut.
- Anggaran dipasang pada rasio 5,5x. Dasarnya pengukuran: kode sekarang menghasilkan 3,24x sampai
  4,07x dari lima kali jalan, jadi masih ada ruang sekitar 35 persen di atas maksimum terukur.
- Gigi test dibuktikan, bukan diasumsikan: pada kode sekarang 3,24x sampai 4,07x **lulus**; ketika
  search sengaja dibuat dua kali lebih mahal (chooser dipanggil dua kali per ply) hasilnya **6,90x**
  dan assertion yang sama **gagal** dengan `expected 6.90 to be less than 5.5`. File ukur gigi itu
  sementara dan tidak ikut ter-commit.

## 2026-10-16 - Tic Tac Toe online: jatah tahan yang tak terlihat habis

Dilaporkan dari room sungguhan (FULQAM, screenshot 16 Oktober 17.17). Pemain O menekan petak bidak
tertuanya, ditolak dengan strip merah "Petak itu sudah terisi...", dan pertanyaannya: apakah tahan itu
jadi tidak aktif kalau papan sudah berputar-putar?

Jawabannya tidak: jatah tahan 2 kali per kursi per ronde, tidak terkait jumlah lap. Yang benar adalah
dua-duanya sudah terpakai, dan itu tidak pernah diberitahukan kepadanya.

### Diperbaiki

- **Chip "Tahan N/2" kini terlihat sejak langkah pertama**, bukan hanya saat satu kursi sudah punya
  tiga bidak. Chip emas penuh saat tahan benar-benar tersedia buat saya, netral saat masih ada tapi
  bukan giliran saya, dan redup saat 0. Ini yang membuat jatah terasa sebagai sumber daya, bukan
  sebagai penolakan acak.
- **Menahan bidak sekarang diumumkan.** Tahan adalah satu-satunya langkah yang tidak mengubah papan:
  yang berpindah hanya giliran dan urutan antrean. Di mode lokal sudah ada notice, di online tidak ada
  apa pun, jadi menekan petak tertua terasa seperti aplikasi tidak merespons dan pemain menekan lagi.
  Pesannya dibedakan: "Anda menahan bidak di petak #N. Sisa tahan Anda 1/2." lawan "Lawan menahan
  bidaknya di petak #N. Sisa tahan mereka 1/2."
- **Kejadian tahan dibaca dari selisih dua snapshot**, bukan dari tombol. Room online mengirim state
  baru lewat realtime, jadi `holdEvent(before, after)` membandingkan `holdsLeft` dan mengambil petak
  dari bidak terbaru kursi itu. Refill `resetRound` adalah kenaikan angka sehingga tidak bisa salah
  baca jadi tahan.
- **Kalimat bidak lenyap pindah ke slot dengan tinggi tetap (44 px).** Sebelumnya ia duduk di dalam
  baris giliran, jadi barisnya tumbuh dan menyeret papan ke bawah begitu satu kursi punya tiga bidak,
  persis lompatan yang sudah dilarang di entri sebelumnya.
- Notice lokal dan online kini satu komponen, `src/games/common/NoticeToast.tsx`, supaya keduanya
  tidak melain gaya. `data-testid` dan `data-tone` yang lama tidak berubah.

### Terukur

- 6 tes baru di `tests/ui/tic-tac-toe-online.test.tsx` me-render halaman room sungguhan dengan data
  sync palsu: chip `Tahan 2/2` pada papan kosong, `Tahan 0/2` saat jatah habis, slot hint dengan
  `minHeight` 44 px, pesan untuk tahan lawan, pesan untuk tahan sendiri, dan tidak ada pesan untuk
  langkah biasa.
- 4 tes baru di `tests/unit/tic-tac-toe.test.ts` untuk `holdEvent`, termasuk state room lama yang
  belum punya kolom `holdsLeft`.
- Suite penuh di branch ini: 347 tes pada 28 file lolos, `tsc -b` bersih, build bersih, `guard:check`
  bersih.

### Batas

- Warna chip dan pembungkusan teksnya di HP belum dilihat di browser nyata: mesin ini tidak punya
  kredensial Supabase, jadi halaman room berhenti di layar memuat. Yang dibuktikan jsdom adalah
  struktur dan teks, bukan tata letak.
- Aturan dan angkanya tidak berubah: tetap 2 tahan per kursi per ronde, dan `santai` tetap tidak
  pernah menahan.

## 2026-10-16 - WallGo: satu klik memasang di desktop, dua tap tetap di HP

### Diubah

- **Aturan dua tap sekarang hanya berlaku untuk sentuh.** Mouse sudah punya pratinjau lewat ghost
  hover yang mengikuti kursor, jadi satu klik di celah langsung memasang. Layar sentuh dan pen tetap
  tap pertama pratinjau, tap kedua pasang, karena keduanya tidak punya hover.
- Alih fungsi kursor mouse tidak lagi men-staged pratinjau di tengah jalan; ghost hover yang
  berbicara. Ini membuat desktop dan online dengan mouse terasa seperti game papan biasa.
- Petunjuk di dock kini mengikuti alat yang dipakai: "Arahkan kursor ke celah untuk pratinjau, klik
  untuk pasang" untuk mouse, "Tap celah untuk pratinjau, tap lagi untuk pasang" untuk sentuh.
- Klik yang datang tanpa `pointerdown` sebelumnya, misalnya dari keyboard atau klik sintetis,
  dianggap sentuh (jalur dua langkah), bukan mouse.

### Diperbaiki saat penyusunan

Perubahan pertama saya membuat dua test viewport gagal, karena keduanya mengirim `click` tanpa
`pointerdown` dan mengharapkan pratinjau tertahan. Penyebabnya default penjaga input yang salah
sisi: nilai awal harus konservatif (butuh dua langkah), bukan longgar. Setelah itu seluruh suite
hijau.

### Terukur

- 3 test baru di `tests/ui/wall-game-board.test.tsx`: satu klik mouse memasang dan memanggil
  `onPlaceWall` satu kali, slot ilegal ditolak tanpa memanggilnya, dan teks petunjuk berganti setelah
  satu sentuhan.
- Suite penuh di worktree terpisah pada basis `288c74d`: 340 test lulus (27 file). `tsc -b` bersih dan
  `vite build` sukses.
- Test lama yang menjaga aturan sentuh (tap pertama hanya pratinjau, tap kedua pasang) tetap lulus,
  jadi perilaku HP yang baru diperbaiki tidak berubah.

## 2026-10-16 - Bomberman online: tamu bisa menaruh bom tapi tidak bisa jalan

Laporan pemain yang menjalankan room sungguhan: pembuat room bisa jalan dengan WASD, pemain
lainnya diam total walaupun tombolnya ditekan. Benar, dan ini bug yang tidak bisa dilihat
probe saya sendiri.

### Yang terjadi

`BombermanNet` menerima `localSeat` sebagai angka saat objeknya dibuat. Kanal realtime bisa
selesai bergabung sebelum baris kursi tamu kembali dari server, jadi nilai itu tertahan di -1
sepanjang pertandingan. Setiap tick tamu mengirim pesan input yang menyebut kursi -1, dan tuan
rumah menyimpannya tanpa efek: tidak ada pemain di kursi itu.

Yang membuat gejalanya terlihat aneh adalah perbedaan dua jalur input. Tekanan bom dikirim
dengan kursi yang dibaca saat itu juga (`sendPress(mySeatRef.current, ...)`), jadi bom tamu
sampai dan meledak. Arah yang ditahan naik di pesan tick yang memakai kursi yang dibaca saat
konstruksi. Jadi: bom jalan, jalan tidak. WASD tidak pernah jadi masalahnya; tombol panah juga
sama macetnya.

Perbaikannya membuat `localSeat` dibaca live, sama seperti `isHost`, `getInput`, dan
`getWorld` yang memang sudah getter. Sambil kursi belum diketahui, tamu tidak mengirim input
sama sekali, bukan mengirim nomor kursi yang tidak ada.

### Kenapa probe saya tidak menemukannya

Probe dua tab menguji "gerakan tuan rumah terlihat oleh tamu" dan "bom tamu terlihat oleh tuan
rumah". Keduanya jalur yang benar-benar bekerja, dan tidak ada satu pun yang menguji tamu yang
berjalan. Arah yang tidak diuji adalah arah yang salah, persis seperti soak bot semua-bot yang
membuat bunuh diri bot lolos minggu lalu.

Sekarang ada assertion-nya, dan ia tertangkap oleh build tayang sebelum perbaikan ini:

```
FAIL  a guest walking with the keyboard moves in the host world
      [seat 1: translate(760 520) -> translate(760 520)]
```

Setelah perbaikan, probe yang sama harus hijau 16/16, dan itu saya jalankan lagi ke build tayang
setelah merge.

### Terukur

338 tes hijau di 27 file, termasuk satu tes unit yang membangun ulang balapan waktunya: tamu
yang kursinya baru dikenal setelah empat tick harus tetap bisa menggeser kursinya di dunia tuan
rumah. `gameplay:online` bertambah satu assertion (15 jadi 16).

### Setelah tayang: urutan tes saya salah, dan ada satu penyebab lagi

Perbaikan ini saya kirim ke produksi, lalu probe-nya saya jalankan ulang. Check tamu-berjalan
masih merah, dan kali ini penyebabnya check-nya sendiri: saya menekan ArrowDown untuk kursi 1,
yang spawn di sudut kanan-bawah, jadi yang saya ukur adalah dinding. Setelah itu saya pindahkan
tesnya ke sebelum tes bom dan ke arah dalam (kiri), dan hasilnya di build tayang, tiga room
beruntun:

| room | kursi 1 sebelum -> sesudah | hasil |
|---|---|---|
| 1 | translate(760 520) -> translate(680 520) | PASS |
| 2 | translate(760 520) -> translate(600 520) | PASS |
| 3 | translate(760 520) -> translate(680 520) | PASS |

Jadi: tamu bisa jalan, dan check sekarang membandingkan kursi yang sama di dunia tuan rumah
sambil memastikan kursinya masih hidup. Tanpa penjaga "masih hidup" itu check ini bisa lulus
atau gagal karena alasan yang salah, persis seperti sebelumnya.

Satu temuan lain dari mengurutkan ulang: siapa pun yang masuk **setelah** tuan rumah menekan
Mulai tidak masuk arena sama sekali. Ia disambut "Room tidak bisa dilanjutkan: Permainan di
room ini sudah berlangsung". Itu perilaku yang sudah ada, bukan regresi, dan saya catat karena
ia menghasilkan keluhan yang terdengar sama dari luar ("temanku tidak bisa main") padahal
sebabnya beda.

Satu flake kosmetik tertangkap sekali dari tiga jalan: "the guest's character pick reached the
host world" merah di room kedua, dengan sisi tuan rumah sudah menampilkan karakter yang dipilih
sedangkan sisi tamu belum. Belum saya perbaiki dan belum saya klaim selesai.

## 2026-10-16 - Bomberman: empat panah, dan ukuran petak yang saya salah baca

Tiga permintaan dari pemain yang sama setelah rilis sebelumnya: kontrol diganti empat panah
saja, arena dibuat lebih lebar, dan dinding diacak posisinya. Yang kedua membuka bahwa angka
yang saya kirim kemarin salah baca, dan salahnya bukan salah hitung kecil.

### Koreksi: lebar kotak elemen bukan lebar gambar

Angka saya kemarin (58,8 px dan 30,8 px di ponsel landscape) berasal dari `rect.width / cols`.
SVG papan memakai `preserveAspectRatio="meet"`, jadi isinya diperkecil di dalam kotak itu.
Yang benar adalah skala meet, dan itu saya ukur ulang dengan membandingkan kotak elemen,
kotak gambar, dan `getBoundingClientRect()` node karakter.

| viewport | yang saya laporkan | yang sebenarnya tergambar |
|---|---|---|
| desktop 1280x800, papan 11x9 | 114,5 px | 72,4 px |
| landscape 667x375, papan 11x9 | 58,8 px | 27,9 px |
| landscape 667x375, papan 21x15 | 30,8 px | 16,7 px |
| portrait 375x667, papan 21x15 | 16,9 px | 16,9 px (ini memang benar) |

Penyebabnya nyata, bukan cuma rumus: `.bm-boardwrap` memakai `width: 100%` + `aspect-ratio`
+ `max-height: 100%`. Saat `max-height` menahan tinggi, lebar tidak ikut mengecil, jadi
kotaknya kehilangan rasio dan gambar duduk di tengahnya. Di landscape papan 11x9 menggambar
307 px di dalam kotak 647 px, dan karena tekstur lantai dipaint pada elemen, sisanya jadi
pasir kosong di kiri-kanan arena.

Perbaikannya membuat kotak papan benar-benar sebesar grid: lebarnya `min(100%, tinggi ×
rasio)` lewat container query unit, dengan `width: 100%` biasa sebagai fallback untuk browser
yang belum punya. Terukur pada 16 kombinasi viewport dan papan: kotak elemen sama dengan
kotak gambar di semuanya, dan `gameplay:check` sekarang punya assertion untuk itu, jadi
angka petak tidak bisa lagi berasal dari kotak yang salah.

Perbaikan ini menghilangkan pasir kosong dan membuat kontrol bisa duduk di sisi arena. Ia
TIDAK memperbesar petak: di landscape yang membatasi adalah tinggi, dan tinggi tetap sama.

### Empat panah menggantikan stik

Peta cuma punya empat arah, jadi menerjemahkan dorongan jempol ke salah satunya adalah
pertanyaan yang tidak perlu ada. `DirectionPad` sekarang memberi empat tombol 46 px
(44 px di layar pendek), dan `TouchPad` beserta `engine/padAxis.ts` saya hapus: aturan
kunci sumbu yang kemarin saya tulis tidak dipakai lagi, dan menyimpannya berarti punya kode
yang tidak dijalankan siapa pun.

Yang menggantikannya adalah tes yang lebih kuat dari tes sumbu kemarin, karena ia membaca
permainan, bukan widget: `gameplay:check` menekan dan menahan tiap panah lalu membaca
`facing` dari signature node pemain. Empat panah di lima viewport sentuh semuanya menghasilkan
arah yang benar, dan jalan diuji pada kanan-lalu-kiri dari sudut spawn, tempat cincin
clearance menjamin dua petak terbuka. Menekan panah ke arah dinding memang tidak membuat
siapa pun bergerak, jadi itu bukan tempat mencari bukti.

Tombolnya juga keluar dari `aria-hidden` yang dulu menutupi stik dekoratif: sekarang kontrol
ini punya nama untuk pembaca layar.

Terukur: `gameplay:check` 110/110 di tujuh viewport (dari 88, karena 22 assertion baru),
337 tes hijau di 27 file.

### Dinding keras diacak, dan kenapa tidak bisa sekadar digeser

Bata lunak sudah acak sejak awal. Yang tetap kisi adalah dinding keras. Begitu posisinya
diacak, aturan yang harus dijaga jadi jelas: dua tiang yang bersentuhan, termasuk diagonal,
bisa bergabung jadi pagar, dan pagar yang menyentuh tepi menutup kantong. Pemain di dalam
kantong itu tidak bisa keluar dan tidak bisa dibom, jadi rondenya dicuri oleh peta.

Ternyata tiang tidak bisa "digeser" satu per satu: kisi even/even sudah mengisi setiap petak
yang berjarak dua dari tiang lain, jadi tidak ada tempat mendarat. Yang jalan adalah memilih
satu sudut per blok 2x2 dalam urutan acak, dan mengulang seluruh penempatan beberapa kali
lalu mengambil yang terbaik.

Biayanya nyata dan saya ukur di 300 seed per papan (empat papan):

| papan | tiang kisi | tiang hasil sebar | off-kisi |
|---|---|---|---|
| 11x9 | 12 | 10 (83%) | 22,1% |
| 15x13 | 30 | 23 (77%) | 35,9% |
| 15x11 | 24 | 20 (83%) | 33,4% |
| 21x15 | 54 | 42 (78%) | 42,8% |

Lapangan jadi sedikit lebih terbuka. Itu harga dari "acak dan tetap bisa dimainkan": jumlah
tiang 100% hanya tercapai oleh kisi itu sendiri dan empat geserannya, yang berarti peta yang
sama setiap kali. Invariant-nya jadi tes: tidak ada dua tiang bersentuhan (0 dari 300 seed per
papan), tidak ada tiang menyentuh tepi (0), dan BFS dari satu spawn selalu menjangkau
seluruh petak terbuka (0 papan tersegel).

### Auto rotate tidak dikerjakan

Pemain bertanya apakah game browser bisa memaksa layar landscape. Menurut MDN,
`ScreenOrientation.lock()` bukan Baseline, biasanya hanya hidup di perangkat mobile dan
hanya saat dokumen sudah fullscreen, dan menolak dengan `SecurityError` di luar itu. Di
iPhone elemen tidak bisa masuk fullscreen, jadi lock tidak pernah bisa berhasil di sana.
Yang tersisa untuk diperbaiki bukan orientasi, tapi tinggi: HUD dan status memakan 124 px
yang di landscape adalah batasan sebenarnya. Itu keputusan terpisah, bukan sesuatu yang saya
kerjakan diam-diam.

### Angka gerbang

337 tes hijau di 27 file. `gameplay:check` 110/110 pada build produksi lokal.
`release:check` lima tahap. `tests/ui/battleship-finish.test.tsx` sekali gagal karena
timeout 5 detik saat seluruh suite jalan paralel (1238 ms kalau file itu dijalankan sendiri);
itu flake lama, bukan dari perubahan ini.

### Sisa

- Petak landscape masih 27,9 px untuk papan 11x9 dan 16,7 px untuk 21x15. Yang bisa
  menaikkan adalah papan berbentuk landscape atau HUD jadi overlay, dan keduanya belum
  dipilih.
- Probe dua tab di build tayang akan dijalankan setelah merge, seperti sebelumnya.

## 2026-10-16 - Bomberman: stik yang bimbang, papan yang hampir dua kali, dan karakter yang ternyata tidak dipakai

Empat permintaan dari pemain yang sama: arena diperbesar dua kali, pemilih karakter diberi
pratinjau, stik di ponsel tidak nyaman karena dorongan miring bikin karakter diam, dan mode
online perlu bot. Yang ketiga adalah bug, dan cara saya membuktikannya hampir menjebak saya.

### Stik: yang salah bukan "hanya empat arah", tapi sumbu yang berganti tiap getaran

Aturan sumbu dominan sudah ada sejak awal: dari dorongan (dx, dy) diambil sumbu dengan nilai
absolut lebih besar. Peta memang cuma punya empat arah, jadi aturan itu benar. Yang bikin
karakter terlihat bingung adalah daerah di sekitar 45 derajat: dx 20 / dy 17 memilih
horizontal, satu piksel getaran menjadi dx 17 / dy 20 memilih vertikal. Dalam satu tarikan
jari jawabannya berganti enam kali, dan yang terlihat di layar adalah satu langkah ke kanan,
satu langkah ke bawah, berulang.

Perbaikannya `resolvePadAxis` di `engine/padAxis.ts`: sumbu yang sudah dipilih bertahan
sampai sumbu lain menang dengan jarak 1,4 kali. Keputusannya fungsi murni, jadi bisa dites
tanpa browser sama sekali.

Terukur dengan `npm run gameplay:check` pada build produksi, lima lintasan sentuh, satu kali
jalan tiap lintasan:

| AXIS_LOCK | "a diagonal drag keeps one direction" |
|---|---|
| 1.0, perilaku lama | 5 FAIL, semuanya membaca `right, down` |
| 1.4 | 5 PASS, masing-masing satu arah |

Baris pertama yang penting. Tes yang sama pernah saya tulis dan ia lulus padahal
`AXIS_LOCK` masih 1.0, karena posisinya di akhir urutan: setelah empat detik bermain dan
sebuah resize, saat ronde sedang berganti dan `tryMove` mengembalikan lebih awal sebelum
menyentuh `facing`. Gerbang yang tidak mungkin gagal bukan bukti, jadi drag sekarang
dilakukan tepat setelah hitung mundur.

### Papan: "dua kali lipat" pada grid berarti jumlah petak, bukan panjang sisi

Menambah sisi dua kali melipat empatkan lapangan dan meninggalkan ponsel dengan petak yang
tidak terbaca. Yang dibuat sekarang sepasang papan per jumlah kursi:

| kursi | kecil | besar | petak |
|---|---|---|---|
| 2 | 11 x 9 | 15 x 13 | 99 jadi 195, 1,97 kali |
| 4 | 15 x 11 | 21 x 15 | 165 jadi 315, 1,91 kali |

Ukurannya ikut mengalir ke online lewat `RoomConfig`, dan klien membangun arena dari
geometri dunia yang diterima (`sizeForBoard`), bukan dari asumsi.

Terukur, lebar satu petak pada papan besar empat kursi, `gameplay:check`, n=1 tiap
viewport: desktop 1280x800 60 px, ponsel landscape 667x375 30,8 px, ponsel portrait 375x667
16,9 px. Frame rate 60 fps di ketujuhnya, termasuk tiga lintasan papan besar. Papan kecil
pembandingnya: 114,5 px, 58,8 px, 32,3 px.

Jadi jujur saja: papan besar di ponsel portrait itu 16,9 px per petak, dan karakternya cuma
sekitar 19 x 27 px. Ia jalan dan tidak patah, tapi itu pilihan untuk desktop dan landscape,
dan teks di layar pilihannya bilang begitu.

### Pratinjau karakter membuka bug yang lebih tua dari permintaannya

Pemilih karakter sekarang menggambar sprite aslinya lewat `spriteMarkup`, fungsi yang sama
dengan yang dipakai arena, jadi pratinjau tidak bisa berbeda dari karakter yang dimainkan.
Komponennya satu (`CharacterPicker`) dan dipakai lobi serta layar setup.

Menulis itu membuat pertanyaan berikutnya muncul sendiri: pilihan siapa yang dibaca saat
online? Jawabannya tidak ada. `buildRoster` memakai `pickChar(seat)` dan `charId` dari lobi
tidak pernah sampai ke tuan rumah, jadi seluruh pemilih karakter online hanya hiasan sejak
game ini dibuat. Yang sekarang terjadi: pilihan disimpan di perangkat
(`charPreference.ts`), tiap tab tahu kursi dan karakternya, tamu mengirim satu pesan
`bm_char` di kanal realtime yang sudah ada, dan tuan rumah yang punya simulasi mencatatnya
sebelum roster dibangun. Satu pesan per pertandingan, bukan per tick, jadi jatah 20 pesan
per detik tidak tersentuh.

### Online dengan bot

Sudah bisa sejak ronde ini lewat "Isi kursi kosong dengan bot", dan sekarang tertulis di
lobi: room 4 kursi dengan 2 manusia berjalan dengan 2 bot. HUD online juga menyebut jumlah
botnya supaya terbaca saat bermain.

### Angka tes

335 tes hijau di 27 file, `npm run release:check` lulus lima tahap, `gameplay:check` 88/88.

### Dibuktikan di build tayang

Setelah merge, `npm run gameplay:online https://www.ivanjairus.xyz/games` di dua tab nyata:
15/15, satu kali jalan. Yang tadi belum tercover sekarang terukur di produksi: room 4 kursi
dengan 2 manusia dan 2 bot, pilihan karakter tamu sampai ke dunia tuan rumah lewat klaim
`bm_char`, dan kedua tab memakai papan 21x15 yang sama (`viewBox 0 0 840 600`). Bom yang
ditanam tamu terlihat di tuan rumah, dihitung per pemilik.

Yang masih tersisa: angka 16,9 px di atas terukur di Chrome yang di-emulasi, bukan di
perangkat fisik, dan jalur klaim ini baru sekali jalan.

## 2026-10-16 - Bomberman: bot benar-benar bunuh diri, dan metrik saya yang salah

Laporan pemain: "bot sempurna selalu mati dalam bomnya sendiri, seperti tidak tahu area
yang harus dihindari". Laporanannya benar. Yang mengecewakan adalah alat ukur saya.

### Tes soak saya tidak bisa melihatnya

Soak yang saya tulis menjalankan pertandingan **semua bot**. Mode solo yang dimainkan
punya satu kursi manusia yang dikejar bot. Konfigurasi berbeda, dan tidak ada satu pun tes
yang menutup konfigurasi kedua.

Metrik pertama yang saya pakai untuk membela diri juga salah: "bot mati di petak tempat ia
terakhir menekan tombol". Itu bukan atribusi, itu tebakan. Yang benar adalah engine harus
tahu siapa pemilik tiap api, jadi `Flame` kini membawa `owner` dan event `ko` membawa
`by`. Setelah itu angkanya tidak bisa dibantah:

| konfigurasi | kematian bot | karena bom sendiri |
|---|---|---|
| semua bot, soak lama | 92 | tidak terukur |
| solo, sebelum perbaikan | 92 | 92 (100%) |
| solo, sesudah | 26 sampai 64 | 24 sampai 61 (89-95%) |

### Yang diperbaiki, dan apa yang sebenarnya terjadi

Jejak frame per frame menunjukkan penyebabnya bukan perencanaan rute, seperti dugaan saya
berturut-turut, melainkan hal yang lebih sederhana: **bot mulai berjalan lagi di detik bomnya
meledak, padahal apinya masih menyala 0,42 detik dan satu langkah butuh 0,15 detik.** Ia
membalik ke baranya sendiri. Sekarang bot menahan petak amannya sampai api miliknya padam.

Dua perbaikan lain menyusul dan keduanya nyata: rute kabur hanya boleh melewati zona bomnya
sendiri, bukan zona bom lain; dan api diperlakukan sebagai tembok, bukan sebagai biaya.

Tingkat bot akhirnya terpisah setelah itu: santai 64 kematian, sedang 35, sempurna 26, dan
kematian pemain naik dari 1 menjadi 6-7 per 10 pertandingan. Sebelumnya ketiganya identik
di 3,00 kematian per pertandingan, yang ternyata angka kosong: di ruangan 4 kursi memang
3 kursi harus mati tiap ronde, jadi metrik itu mengukur permainan yang bekerja, bukan bot
yang pintar.

### Cacat desain yang ketemu di tengah jalan: ronde bisa molor selamanya

Waktu bot berhenti bunuh diri, satu tes gagal dengan cara yang berharga: `phase` masih
`battle` setelah enam menit simulasi. Ronde hanya bisa selesai kalau ada yang mati, jadi
dua bot yang sama-sama hati-hati, atau dua pemain yang sama-sama bersembunyi, mengunci
pertandingan tanpa akhir.

Sekarang ada batas waktu ronde. Ronde yang habis waktunya dimenangkan oleh pihak yang lebih
banyak menanam bom pada ronde itu, jadi bersembunyi tidak lagi merupakan strategi yang
aman, dan seri kalau keduanya sama-sama diam.

### Sisa yang belum beres, dicatat bukan disembunyikan

Tingkat bunuh diri masih 89-95%. Yang sudah diperbaiki adalah jumlah kematiannya, bukan
sebab paling dalam. Untuk itu bot butuh peta keselamatan (time-to-safety vs sisa sumbu
untuk setiap petak), bukan aturan "cari satu petak aman lalu lari ke sana". Itu pekerjaan
berikutnya dan saya tidak menyebut bot ini pintar sekarang.

323 tes hijau di 27 file. `npm run release:check` lulus lima tahap.

## 2026-10-15 - Bomberman: game kelima, dan alat ukurnya

Bomberman masuk sebagai game kelima. Ia bukan cuma tambahan isi: ia memaksa satu celah
di repo ini kelihatan, dan celah itu sekarang punya alatnya sendiri.

### Yang dibuat

Arena grid real-time. Tanam bom, lengan api berbentuk salib, reaksi berantai, bata lunak,
empat powerup, enam karakter chibi kepala besar, tiga lantai yang diacak tiap pertandingan.
Dua ukuran papan (11x9 untuk dua kursi, 15x11 untuk empat) dan tiga mode: solo lawan bot
dengan tiga tingkat, online 2-4 pemain, dan online dengan kursi kosong diisi bot.

Seluruh sprite digambar sebagai SVG di kode, mengikuti konvensi repo. Hanya tekstur lantai
yang berupa gambar hasil generate.

### Tiga aturan yang mahal

Engine-nya lahir dari prototipe pratinjau gaya, dan tiga aturan di bawah ini dibayar dengan
demo yang rusak lebih dulu. Ketiganya sekarang dikunci tes:

1. **Bata lunak menyerap api.** Petaknya dihancurkan tapi tidak ikut terbakar. Versi awal
   membuat petaknya ikut menyala, akibatnya menananm bom selalu terlihat seperti bunuh diri
   dan bot tidak pernah menanam apa pun.
2. **Hitung lengan api harus murni.** Renderer dan bot memintanya tiap frame. Versi awal
   juga menghancurkan bata dan menyalakan bom lain di dalam fungsi yang sama, jadi papan
   rusak sendiri tanpa ada yang meledak.
3. **Selamat itu soal jarak, bukan selangkah.** Semua tetangga bom ikut terbakar, jadi
   "pindah ke tetangga yang kosong" tidak pernah ada. Yang menyelamatkan adalah keluar dari
   jangkauan sebelum sumbu habis, dan itu dihitung dengan BFS.

### Kenapa satu nyawa per pertandingan diubah jadi ronde

Diukur, bukan dirasakan. Dengan satu kematian langsung mengakhiri pertandingan, duel bot
selesai dalam hitungan detik dengan rata-rata 1,2 bom per kursi: arena belum sempat terbuka
kalau sudah berakhir. Setelah juara ditentukan dari 3 ronde, angka yang sama menjadi 3,2
sampai 5,8 bom per kursi dan rata-rata panjang pertandingan 27,8 sampai 30 detik dari batas
atas 30 detik.

Bot juga pernah mati karena bomnya sendiri di 10 dari 10 pertandingan. Penyebabnya bukan
keberanian, tapi geometri: target kaburnya satu petak spesifik, sementara satu keputusan
menahan arah sekitar 1,5 petak, jadi bot melewat petak aman itu dan bolak-balik di dalam
apinya sendiri. Sekarang ia berhenti begitu keluar dari zona api. Setelah itu 0 kematian
diri sendiri pada semua konfigurasi yang diukur.

### Celah yang ketemu: "viewport automation" tidak mengukur layout

README menyebut "Viewport UI Automation (Desktop 1024px & Mobile 375px)". Yang sebenarnya
berjalan adalah jsdom yang menulis `window.innerWidth`. jsdom tidak punya layout engine,
jadi tidak ada satu pun tes yang bisa membuktikan tidak ada scroll horizontal, atau tombol
benar-benar 44 px, atau frame rate bertahan saat papan penuh api.

Karena itu ada `scripts/gameplay-check.mjs`: Chromium asli, empat viewport, dan angka yang
dicetak. Empat hal yang ia tangkap dan screenshot-nya konfirmasi, yang semuanya lolos dari
jsdom:

1. CSS arena tidak pernah ikut termuat, jadi papan melebar ke seluruh layar.
2. Scrim hitung mundur menutupi seluruh stage, bukan papannya saja, sehingga lantai
   terlihat gelap padahal warna aslinya `rgb(143, 208, 143)`.
3. Tombol BOM jatuh ke kiri dan menutupi joystick, karena zona stick absolute sehingga
   anak in-flow yang tunggal mendarat di awal baris.
4. Ponsel landscape membuat satu sel cuma 24,5 px, di bawah ambang baca 32 px yang jadi
   kontrak karakter. Setelah papan dibatasi tinggi lewat `aspect-ratio`, sel landscape
   naik ke 58,8 px.

Angka terakhir untuk empat viewport (360, 375, 667 landscape, 1280): 42 dari 42 pemeriksaan lolos,
54-60 fps, lebar sel 30,9 sampai 114,5 px, tanpa overflow horizontal, dan papan tidak
bergeser satu piksel pun saat teks status berubah.

### Aset lantai

Tiga tekstur hasil generate tadinya 3,6 MB (822 KB, 1,41 MB, 1,27 MB) untuk repo yang
seluruh budget-nya 353 KB main chunk dan 581 KB arena lazy chunk. `scripts/build-floors.mjs`
mengecilkannya lewat canvas di browser yang sama menjadi WebP 256 px: 4,8 KB, 2,4 KB, dan
7,8 KB, total 15 KB. Natnya hilang karena dipola pada dua petak dalam user space, jadi
teksturnya rata dengan grid dan tidak memotong satu batu secara acak di tiap petak.

Di artefak build hanya dua file WebP yang muncul sebagai aset terpisah. Yang ketiga tidak
hilang: 2.476 byte berada di bawah `assetsInlineLimit` 4096 milik Vite, sehingga ikut
ter-inline ke dalam chunk sebagai data URI. `img-src 'self' data:` di CSP sudah
mengizinkannya, jadi tidak ada yang perlu diubah di `vercel.json`.

### Bagian atribusi README ikut diubah

README sebelumnya mengklaim "seluruh aset SVG di repositori ini ditulis secara independen".
Itu tidak lagi benar begitu tekstur lantai masuk, jadi kalimatnya sekarang memisahkan
sprite SVG yang ditulis tangan dari tiga lantai yang dibuat dengan image generation.
Slap Arena juga ternyata belum pernah masuk ke daftar permainan di README; ia ditambahkan.

### Angka tes

314 tes di 27 file hijau. Yang baru: 44 tes aturan engine, 16 tes soak bot, 9 tes transport
realtime, 10 tes UI lobi dan arena, 7 tes integrasi handshake host-klien. Transportnya
sengaja satu pesan per tick, bukan dua seperti Slap Arena, karena `eventsPerSecond` 20
dipakai bersama oleh semua yang dikirim satu klien.

### Batas yang diketahui, tidak disembunyikan

Host pertandingan online adalah tab browser salah satu pemain. Kalau tab itu di-minimize
atau HP dikunci, sim-nya berhenti dan room menunggu. Yang ditampilkan sekarang adalah
notice dan jalan kembali ke lobby; migrasi host dan server-authoritative sengaja tidak
dibuat, sama seperti Slap Arena.

`tests/integration/` dan `npm run db:verify` juga tetap tidak dijalankan CI, atas keputusan
tersurat. Artinya regresi pada aturan CAS atau trigger Postgres bisa lolos merge tanpa
tanda merah, dan itu berlaku untuk kelima game.

## 2026-10-15 - Tic Tac Toe: bidak tertua bisa ditahan

Menyusul entri di bawahnya. Laporanannya soal keadilan sudah dijawab di sana: aturannya tidak
asimetris. Yang masih mengganggu adalah zugzwang-nya, jadi aturan itu kini diubah atas permintaan
tersurat: **tap petak yang memegang bidak tertua Anda sendiri untuk menahannya**.

### Aturan baru

Bidak tertua bisa ditahan. Tap petaknya, bidaknya tetap berdiri dan menjadi bidak paling baru,
giliran berpindah, papan tidak berubah. Jatahnya 2 kali per ronde per kursi. Jatah habis, petaknya
kembali jadi petak terisi biasa.

Yang bisa diselamatkan adalah bidak yang menutup langkah lawan. Pada posisi rekaman 19.33, yang di
bawah ini disebut zugzwang, X dulu kalah di semua garis: sekarang X menahan petak #7 dan bot tidak
lagi punya kemenangan instan.

### Kenapa ada jatah

Versi pertama aturan ini tanpa batas, dan diukur langsung: bot sempurna vs bot sempurna naik dari
16 menjadi 88 langkah rata-rata dalam 400 game self-play, dengan 7,17 tahan per game, dan satu
run mentok di plafon 400 langkah. Tahan adalah oper yang tidak mengubah papan, jadi dua kursi yang
sama-sama bisa menahan bisa menunda kemenangan selamanya. Dengan jatah 2 per ronde, game yang sama
turun ke 26,3 langkah, lebih pendek dari sebelumnya, dan tidak ada yang menggantung.

### Terukur: self-play sebelum dan sesudah

n = 120 game per pasangan (80 untuk sempurna vs sempurna), seed tetap, angka pertama adalah kursi
yang disebut dulu. `tahan MATI` memaksa `holdsLeft` nol sehingga perilaku lama muncul lagi.

| Pasangan | tahan MATI | tahan HIDUP | Tahan per game |
| --- | --- | --- | --- |
| sempurna vs santai | 120 - 0, 5,7 langkah | 120 - 0, 8,7 langkah | 0,09 |
| sempurna vs sedang | 120 - 0, 11,1 langkah | 105 - 15, 23,3 langkah | 2,57 |
| sedang vs santai | 107 - 13, 7,8 langkah | 119 - 1, 8,6 langkah | 0,21 |
| sempurna vs sempurna | 38 - 42, 35,6 langkah | 42 - 38, 26,3 langkah | 2,64 |

Bacaan yang jujur: aturan ini menguntungkan kursi yang tahu kapan harus menahan. Tangga tingkat
tetap (sempurna 105-120 atas sedang, sedang 119 atas santai) tapi celah sempurna atas sedang menyempit
dari 120-0 menjadi 105-15, karena heuristik "tahan kalau semua langkah kalah" sudah cukup untuk
mengalahkan santai dan merepotkan sempurna. Waktu langkah bot terburuk yang terukur 64 ms, masih di
bawah jeda 1200 ms.

### Terlihat

- Petak yang bisa ditahan memakai border emas putus-putus seperti biasa, ditambah pil `TAHAN` 34x14
  px di kiri atas, `cursor: pointer`, dan `aria-disabled="false"`. `aria-label`-nya berbunyi "tap
  untuk menahannya agar tidak lenyap".
- Setelah menahan, tanda bidak di papan identik sebelum dan sesudah (dibandingkan lewat `aria-label`
  kesembilan petak di Chrome), hanya antreannya yang berpindah.
- Notice menahan berwarna emas dengan `data-tone="info"`, bukan merah penolakan. Bot yang menahan
  bidaknya ikut diumumkan, karena tanpa itu satu frame hilang tanpa penggantian bidak terlihat seperti
  aplikasi error.
- Banner, dialog Aturan, lobby, kartu registry, dan README menyebut jatah 2 kali per ronde.

### Papan tidak lagi naik turun

Permintaan susulan dari pemakaian di HP: posisi papan bergeser ke bawah lalu ke atas, bikin pusing.
Toast memang sudah `position: fixed`, tapi yang bergerak adalah kartu status: ia tumbuh dari 50 px
menjadi 97 px begitu satu kursi punya tiga bidak, dan itu mendorong papan dari `top` 285 px ke
332 px, lompatan 47 px. Baris "Bot sedang memikirkan langkah" menambah lompatan kedua setiap giliran.

Perhatian dan penanda giliran bot kini tinggal di slot sendiri dengan `minHeight` 78 px yang selalu
terpakai, dan kartu status hanya berisi satu baris. Terukur di Chrome pada viewport 598x742 dengan
isi terpanjang (peringatan tahan penuh plus baris berpikir): `slotHeight` 78 px, `scrollHeight`
78 px tidak meluap, dan `boardTop` 365 px sebelum, selama, dan sesudah langkah bot. Penjaga regresi
di `tests/ui/tic-tac-toe-play.test.tsx` menuntut `minHeight` itu tetap ada, karena jsdom tidak punya
layout engine jadi pergeserannya tidak bisa diuji di sana.

### Batas

- Jatah 2 belum diuji sebagai angka optimal; 1 dan 3 belum diukur. Yang diukur adalah nol lawan tak
  terbatas.
- Mode online ikut dapat aturan ini karena `game_state` adalah jsonb milik klien dan kolom baru
  melewati `{ ...state }` tanpa perubahan. Yang belum diuji adalah dua klien dengan versi berbeda di
  satu room: klien lama tidak bisa memulai tahan, dan belum dipastikan ia tetap konsisten setelah
  lawan menahan.
- Bot `santai` sengaja tidak pernah menahan, supaya tingkat paling rendah tetap kalah.

## 2026-10-15 - Tic Tac Toe: yang akan lenyap itu punya siapa, dan petaknya belum bebas

Berasal dari rekaman HP 15 Oktober 19.33 (1080x2316, 12,4 dtk, bot `sempurna`). Laporanannya: bidak
berlabel "AKAN LENYAP" tidak bisa di-replace dari sisi pemain, tetapi pada giliran bot hal yang sama
bisa langsung dilakukan sehingga pemain kalah.

### Hasil replay: aturannya tidak asimetris

Posisi di rekaman disusun ulang lewat engine asli (`tests/unit`, dijalankan lalu dihapus): papan
`.X./O.X/XOO`, giliran X, bidak tertua X di petak #7. Temuannya:

- Yang tidak bisa ditap adalah bidak **milik sendiri** yang akan lenyap, dan penolakan itu berlaku
  sama untuk kedua kursi. `applyMove` melempar `already occupied` untuk X maupun O.
- Ketiga langkah legal X pada posisi itu (petak 1, 3, 5) semuanya mengosongkan petak #7, dan bot
  sempurna selalu menutup dengan main ke petak #7. Jadi kekalahannya zugzwang, bukan langkah curang.
- Zugzwang model ini menimpa kedua kursi hampir seimbang: pada 400 game self-play acak terhitung
  77 posisi buntu untuk X dan 81 untuk O.

### Diperbaiki

- **Peringatan "akan lenyap" kini menyebut pemegang giliran.** Teks lama selalu berbunyi "akan lenyap
  saat **Anda** melangkah", padahal pada giliran bot yang lenyap adalah bidak bot. Di rekaman
  0:03 kalimat itu persis yang membuat bot terlihat boleh menimpa. Sekarang memakai nama kursi:
  "Bidak tertua Bot di petak #9 akan lenyap setelah Bot melangkah."
- **Satu kalimat tambahan soal petak yang ditinggalkan**, karena itu bagian yang tidak terlihat:
  petaknya baru bisa ditempati pada giliran berikutnya, dan lawan boleh langsung mengambilnya.
  Aturan dialog "Aturan" ikut meluruskan hal yang sama.
- **Tap pada petak terisi tidak lagi dibungkam.** Petak terisi memakai `disabled`, jadi klik tidak
  pernah sampai ke `handleCellClick` dan pemain hanya mendengar bunyi tolak tanpa sebab, atau diam
  sama sekali. Sekarang petak terisi memakai `aria-disabled` dan tetap mengirim klik, lalu muncul
  toast merah yang menyebut nomor petak dan alasannya; bidak tertua milik sendiri dapat penjelasan
  khusus. `aria-label` petak itu juga ikut menjelaskan.
- **Jeda bot dinaikkan dari 420 ms menjadi 1200 ms**, plus baris "Bot sedang memikirkan langkah..."
  selama jeda, supaya lenyapnya satu bidak dan munculnya bidak baru terbaca sebagai dua kejadian,
  bukan gambar yang berganti sekaligus. Bunyi langkah dipindah ke setelah bidaknya dipasang, karena
  pada jeda 1,2 detik bunyi yang lebih dulu terdengar mengumumkan langkah yang belum ada.

### Terukur, viewport 598x742 di Chrome

| Sebelum | Sesudah |
| --- | --- |
| "akan lenyap saat Anda melangkah" pada giliran bot | teks menyebut nama kursi yang bergerak |
| tap petak terisi: tidak ada peristiwa klik | toast 460x38 px, `role="status"`, 18 px dari bawah |
| papan bergeser 50 px saat pesan muncul | `boardShift` 0 px, toast `position: fixed` |
| jeda bot 420 ms | 1200 ms + penanda "sedang memikirkan" |

Penjaga regresi: `tests/ui/tic-tac-toe-play.test.tsx` menuntut isi toast dan teks per-kursi,
`tests/ui/tic-tac-toe-bot.test.tsx` menuntut jeda dan teks "Bidak tertua Bot di petak #9".

### Batas

- Tangkapan layar toast tidak diambil: permukaan browser internal sedang tidak terlihat saat itu,
  jadi bentuknya dibuktikan lewat `getBoundingClientRect` dan `getComputedStyle`, bukan lewat gambar.
- Aturan FIFO tidak diubah. Kalau yang diinginkan adalah boleh menimpa bidak sendiri yang akan
  lenyap, itu perubahan aturan dan perlu persetujuan terpisah.
- Mode online (`TicTacToeMatch`) memakai engine yang sama dan tidak punya banner ini, jadi tidak
  ikut berubah.

## 2026-10-15 - Slap Arena: teks terbang tertutup kanvas, dan HP dinilai dari lebar layar

Menyusul dua rekaman layar dari HP Android. Yang pertama (15.19, 608x1312, 27,5 dtk) melaporkan
tiga hal: teks terbang tidak terlihat, grafik terlihat berpasir, dan tidak ada suara. Yang kedua
(15.52, 480x1032, 12,5 dtk) mengonfirmasi dua di antaranya sudah beres dan menyisakan teks terbang.

### Diperbaiki

- **Mode auto tidak lagi menebak kemampuan perangkat dari lebar layar.** `levelAtMount`
  sebelumnya mengembalikan `low` untuk setiap viewport di bawah 720 px, jadi semua HP memulai di
  tier darurat sebelum satu frame pun diukur. Tier itu menutup `antialias`, menahan `pixelRatio`
  di 1, dan menghapus outline tinta. Di layar 2,75x hasilnya tepi bertangga di mana-mana dan
  karakter kehilangan garis artnya, persis keluhan "berpasir". Sekarang auto mulai dari `high`
  dan hanya turun kalau EWMA frame rate benar-benar jatuh di bawah 44 selama dua detik.
- **Jumlah teks terbang hidup di tier rendah dinaikkan dari 1 menjadi 4**, supaya teks milik
  pemain tidak terus tersingkir oleh teks bot di layar kecil.
- **`unlockAudio()` dipanggil pada sentuhan pertama di mana pun**, bukan hanya pada tombol
  kontrol. Bunyi hitung mundur dibangkitkan dari interval 100 ms, yaitu sebelum pemain menemukan
  tombol, sehingga konteks audio bisa tercipta di luar gesture.

### Koreksi atas klaim saya sendiri

Di tengah perbaikan ini saya sempat menulis bahwa teks terbang "bekerja dengan baik" karena node
`.sa-pop` ditemukan di 21 dari 60 sample pada build produksi. **Itu salah.** Node memang ada,
tetapi tidak pernah tergambar. Saya mengukur keberadaan, bukan hasil render. Penyebab sebenarnya:

- Kanvas renderer di-`appendChild` **setelah** `.sa-label-layer`, dan CSS membuat keduanya
  `position: absolute`. Dua elemen bersaudara yang sama-sama `z-index: auto` digambar menurut
  urutan DOM, jadi kanvas yang opaque menutupi seluruh layer. **Tag nama dan semua teks terbang
  tidak pernah terlihat sejak game ini dibuat**, bukan hanya sejak perubahan ini. Perbaikannya
  satu baris: `z-index: 1` pada `.sa-label-layer`.
- `MISS` sendiri punya dua cacat tambahan. Ukurannya `clamp(15px, ...)` menghasilkan kotak 23x16 px
  di layar 393 px, dan kurva animasinya memuncak pada satu keyframe lalu meluruh selama 0,6 detik,
  sehingga plateau yang benar-benar terbaca praktis nol. Sekarang 20-28 px dengan opacity penuh dari
  125 ms sampai 452 ms.
- Swing yang ditolak mesin (masih cooldown, masih stun) tetap mengumumkan event `slap` dengan
  `hitCount: 0`, yang akan mencetak `MISS` untuk pukulan yang tidak pernah terjadi. Sekarang
  `canSlap()` ditanyakan sebelum event dikirim, mengikuti pola `executeDash` yang sudah benar.

Sebagai gantinya, tampar yang meleset kini juga memunculkan semburan debu kecil searah ayunan, jadi
isyaratnya tidak bergantung pada sempat membaca teks.

### Audio, terkonfirmasi beres

Rekaman HP pertama: `mean_volume` = `max_volume` = -91 dB pada 2.637.824 sampel, yaitu kesunyian
digital murni. Rekaman HP kedua, setelah `unlockAudio()` dipanggil pada sentuhan pertama di mana
pun: **mean -29,8 dB, max -3,5 dB**. Jadi bunyinya sekarang keluar dan terukur ada isinya.

### Terukur, viewport 393x852 `devicePixelRatio` 2,75 di Chrome headless

| Sebelum | Sesudah |
| --- | --- |
| kanvas 393x852 (ratio 1) | kanvas 589x1278 (ratio 1,5) |
| `quality = low`, tanpa outline, tanpa bayangan | `quality = high`, outline dan bayangan aktif |
| teks `MISS` 23x16 px, opacity 1 tetapi tertutup kanvas | `MISS` 29x21 px, terlihat di screenshot |
| tag nama tidak pernah tergambar | tag nama tergambar |
| 60 fps | 60 fps |

Penjaga regresi ditambahkan di `tests/unit/slap-arena.test.ts`: blok `.sa-label-layer` harus
mencantumkan `z-index` bukan nol, karena kegagalan ini tidak terlihat oleh satu pun uji DOM.

### Batas

Angka 60 fps berasal dari Chrome headless di MacBook, bukan dari HP. Pill `AUTO` dan tepi tajam
sudah dikonfirmasi baik di HP lewat rekaman kedua.

## 2026-10-15 - Battleship: kurung kapal tidak lagi menutupi bar aksi

### Diperbaiki

- **Kurung anotasi kapal digambar di atas bar aksi yang sticky, jadi tombol "Arah", "Acak Ulang",
  "Undo", dan "Kunci Armada" tertutup saat papan digulung.** Penyebabnya lapisan tumpuk: kurung
  memakai `z-index: 2` dan tidak ada leluhur yang membuat konteks tumpuk, jadi ia mengalahkan bar
  sticky yang `z-index: auto`. `.bs-board` sekarang memasang `isolation: isolate`, sehingga
  `z-index` kurung hanya berlaku di dalam papannya sendiri.
- Diukur dua arah pada 1400px: di titik tumpang tindih dengan bar, elemen teratas kini `bs-btn`
  (sebelum perbaikan `bs-chart`), dan di tengah petak kedua kapal tegak elemen teratas tetap
  `bs-chart__code`, jadi kurung masih menutupi petak barisnya seperti yang diminta.
- Bug ini dibawa oleh PR #26 dan baru terlihat saat papan lebih tinggi daripada jendela. Test jsdom
  tidak menangkapnya karena tidak ada layout di sana; gerbang regresi untuk kasus ini adalah
  pengukuran di browser.

## 2026-10-15 - Battleship: armada ditandai sebagai anotasi peta

### Diubah

- **Kapal tidak lagi digambar sebagai blok slate.** Tiap kapal menjadi satu kurung anotasi ala peta
  laut: bingkai memanjang mengikuti rentang petaknya, kurung kecil di sisi luarnya, dan sandi jenis
  beserta panjangnya ("BS 4", "FR 3"). Enam puluh empat petak, atribut datanya, dan navigasi keyboard
  tidak berubah. Anotasi hanyalah lapisan di dalam petak pertama kapal, jadi papan susun, papan tempur,
  dan papan bukti otomatis ikut.
- **Kapal tenggelam memakai bingkai putus-putus kuningan tua dengan simbol bangkai**, menggantikan
  strip diagonal.
- **Palet papan dipindah ke "tinta di atas kertas".** `--water` jadi `#f3eee3`, `--miss` jadi
  `#8a8270`, dan garis petak dinaikkan ke alpha 0.22 supaya kisi tetap terbaca setelah blok gelap
  hilang. Rasio terukur pada bentuk final: isi terhadap air 1.71, sandi terhadap isi 5.70, garis
  terhadap air 9.76, titik meleset terhadap air 3.30.
- `--wall-placed` dan `--wall-placed-border` dihapus karena satu-satunya pemakainya adalah blok kapal
  yang diganti. `--wall-placed-shadow` tetap ada, masih dipakai papan WallGo.

### Ditambahkan

- Test UI mengunci bentuknya: satu kurung per kapal (bukan per petak), sandi dan sumbunya benar,
  dan kapal tenggelam menghasilkan simbol bangkai.

## 2026-10-16 - Battleship online: giliran komitmen ikut berpindah

### Diperbaiki

- **Kunci armada di room online tidak pernah tuntas untuk pemain kedua.** `applyCommitment` hanya
  menggeser `game_state.currentTurn` saat dua komitmen sudah masuk, sedangkan baris
  `matches.current_turn` langsung pindah ke kursi lain. Halaman membaca `game_state`, jadi kursi
  pertama tetap melihat "Saatnya mengunci armada Anda" setelah komitmennya tersimpan, dan kursi
  kedua tidak pernah diundang mengunci. Klik kedua dari kursi pertama menghasilkan
  `failure: 'turn'` dengan pesan "Langkah tidak diterima karena giliran sudah berpindah", padahal
  langkah pertamanya berhasil.
- Diukur pada tabel palsu: sesudah kursi 0 mengirim, `current_turn` baris 1 tetapi
  `game_state.currentTurn` 0, sehingga kursi 0 melihat giliran sendiri true dan kursi 1 false.
  Sesudah perbaikan keduanya berbalik, dan `COMMIT` kursi 1 membawa papan ke fase `BATTLE` dengan
  status room `playing`. Test regresi ada di `tests/integration/battleship-protocol.test.ts`.
- Cacat ini ada sejak commit pertama Battleship (`d7f1f10`), bukan bawaan perubahan pop-up hasil
  atau tanda armada.

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

## 2026-10-15 - Slap Arena: tampar lepas saat dilepas, dan teks MISS

Menyusul sesi playtest setelah PR #22 tayang. Dua hal yang dilaporkan: bagian slap masih kurang
umpan balik, dan tahan-tampar "melepas sendiri". Yang kedua benar dan memang kode:
auto-fire lama duduk tepat di `CHARGE_MAX_TIME` (0,7 dtk), yaitu saat meter baru **penuh**,
sehingga menahannya terasa direbut.

### Diubah

- **Tampar keluar saat tombol dilepas.** Auto-fire tidak lagi di 0,7 dtk tapi di 1,6 dtk
  (`CHARGE_HOLD_LIMIT`), murni sebagai pengaman kalau event lepas hilang (notifikasi, alih
  aplikasi, pointer yang tertelan sistem). Meter tetap penuh di 0,7 dtk dan menahan lebih lama
  tidak menambah gaya, jadi tidak ada insentif untuk menempel tombol.
- Event `slap` sekarang membawa `hitCount`, jadi sisi render tahu sebuah tampar mengenai tubuh
  atau tidak. Prediksi lokal sengaja tidak membawanya, karena di sisi klien hanya tuan rumah
  yang tahu hasilnya.

### Ditambahkan

- **Teks terbang `MISS`** abu-abu dan lebih kecil di posisi penampar saat tampar meleset. Sebelum
  ini, tampar yang meleset tidak memunculkan apa pun, sehingga "tidak terjadi apa-apa" dan
  "input saya dimakan" tidak bisa dibedakan.
- **Label `MAX`** saat tampar terisi penuh mendarat, berdampingan dengan kata komik seperti biasa.
- **Cincin pengisi di rumput** di bawah brawler yang sedang menahan, menutup ke dalam menuju
  posisi penuh. Ini umpan balik tahan-tampar pertama yang terlihat di desktop; cincin pada tombol
  sentuh sudah ada sebelumnya.
- Suara tampar tidak lagi dobel di klien: echo dari tuan rumah (`hitCount` terisi) tidak
  memainkan suara untuk aksi lokal yang sudah berbunyi lebih dulu.

### Terukur, di dev server dan Chrome headless

Tahan 1,0 dtk: `chargeT = 0,99` (lewat ambang penuh 0,7) dan **belum menembak**; setelah dilepas
baru cooldown terisi dan `MISS` muncul di DOM.

Tahan 0,88 dtk lalu lepas pada target di jarak 1,6 m: korban naik ke `y = 0,40` dan berpindah ke
`x = 5,3`, dengan `MAX` dan `TAMPAR!` muncul bersamaan.

Uji slap-arena: 59 unit (bertambah 2) dan 22 UI (bertambah 2), termasuk dua regresi baru yaitu
"menahan melewati meter penuh tidak menembak" dan "tahan 2,4 dtk menembak sendiri".

### Batas

Masih belum diuji: dua perangkat sungguhan, dan HP asli.

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

## 2026-10-15 - WallGo: tap di HP tidak lagi langsung memasang dinding

### Diperbaiki

- **Satu tap bisa memasang dinding tanpa sengaja di layar sentuh.** Satu tap mengirim
  `pointerdown` lalu `click`. `pointerdown` sudah men-staged pratinjau di slot itu, dan `click` pada
  slot dengan orientasi yang sama menganggapnya "tap kedua", jadi dinding langsung terpasang. Karena
  dinding tidak bisa dibatalkan, tap yang meleset sekali langsung mengubah papan.
- Yang terlihat di HP jadi konsisten: tap pertama selalu hanya pratinjau, tap kedua pada slot yang
  sama baru memasang. Tombol "Pasang Dinding" di dock tetap langsung memasang, dan tombol itu tidak
  lagi ikut terblokir oleh penjaga gesture.
- Tap tepat di tengah persimpangan celah tidak lagi memakai "orientasi terakhir yang diketahui".
  Sekarang arah ditentukan oleh sisi mana jari paling jauh dari pusat, jadi tidak ada lagi tap yang
  hasilnya bergantung pada urutan render DOM.

### Ditambahkan

- Area tap dinding diperbesar dari 22 px menjadi 44 px pada dimensi tipisnya, sesuai ambang
  minimum target sentuh. Sayap horizontal dan vertikal sekarang sama-sama mudah dijangkau di HP.

### Terukur

- 7 test baru di `tests/ui/wall-game-board.test.tsx` menjaga aturannya: tap pertama staged dan
  `onPlaceWall` tidak dipanggil, tap kedua memanggilnya satu kali, tombol dock memanggilnya, dan
  lebar area sentuh 44 px.
- Suite penuh 218 test lulus, `tsc -b` bersih, `vite build` sukses.
- Belum terverifikasi: sentuhan nyata di HP. Browser in-app di mesin ini viewport-nya 0x0 sehingga
  jalur pointer tidak bisa dipetakan, dan jsdom tidak punya layout (rect papan saya stub di test).
  Uji coba di perangkat Anda tetap yang paling menentukan.

## 2026-10-15 - WallGo: dinding ditandai dengan warna pemasangnya

### Diubah

- **Dinding yang sudah dipasang kini dicat dengan warna tema kursi yang memasangnya**, bukan lagi
  netral semua. Sebelumnya papan tidak bisa menjawab "siapa yang menutup jalan saya".
- Isi dinding memakai `theme.hex` pemiliknya. Garis tepinya bukan `theme.border` lagi, tapi satu
  kunci gelap netral (`--wall-keyline`), supaya tema yang warnanya dekat dengan emas inti tetap
  terbaca sebagai benda yang berbeda.
- Dinding tanpa pemilik (room lama) memakai token baru `--wall-unowned` (`#78716c`), bukan
  `--wall-placed`. Alasannya: `--wall-placed` (`#1e293b`) adalah warna border tema kursi 6, dan
  border `--wall-placed-border` (`#334155`) adalah warna isi tema kursi 6, jadi dinding kursi 6
  tidak akan bisa dibedakan dari dinding tanpa pemilik. `--wall-placed` tetap dipakai Battleship
  untuk sel kapal, jadi token itu tidak saya ubah.

### Ditambahkan

- Field `owner` pada tipe `Wall`, diisi otomatis oleh `applyWall` dari kursi yang sedang giliran.
  Tidak ada migrasi database: mode online mengirim `game_state` utuh, jadi field ini ikut mengalir
  ke perangkat lawan tanpa perubahan sisi server.

### Terukur

- Di browser nyata (dev server, meja 4 kursi, 3 bot tingkat Sedang, 33 putaran): 10 dinding
  terpasang, 10 di antaranya memakai warna tema, 0 yang masih netral.
- Engine test membuktikan `owner` terisi sesuai kursi yang bergerak, dan render test Board
  membuktikan pemetaan `owner` ke warna tema plus fallback netralnya.
- Test `tests/ui/wall-game-board.test.tsx` menjaga dua hal sekaligus: pemetaan `owner` ke warna tema,
  fallback netral untuk dinding tanpa `owner`, dan `#78716c` tidak boleh muncul di palet
  `PLAYER_GOLD_THEMES` (guard terhadap tabrakan warna yang baru saja diperbaiki).

### Ditemukan sambil lalu

- `supabase/functions/_shared/wallgame/engine.ts` adalah salinan engine yang tidak diimpor siapa pun
  (tidak ada file fungsi lain yang memanggilnya, dan SQL tidak memvalidasi penempatan dinding).
  Perubahan `owner` sengaja tidak dicopy ke sana supaya dua engine tidak berubah tanpa alasan; kalau
  nanti fungsi itu diaktifkan, pen-stamp-an `owner` harus ditambahkan di sana juga.

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
