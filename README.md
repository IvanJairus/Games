# ij-games · Mini-Games & Arena Strategi

[![CI & Auto-Deploy to Vercel](https://github.com/IvanJairus/Games/actions/workflows/deploy.yml/badge.svg)](https://github.com/IvanJairus/Games/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Koleksi mini game taktis dan strategi web modern di portal `ivanjairus.xyz/games/` dan [ij-games.vercel.app](https://ij-games.vercel.app/games/).

---

## 🎮 Daftar Permainan

1. **WallGo: Race to the Golden Core**
   - Game strategi penempatan dinding taktis (2-6 pemain).
   - Validasi jalur anti-jebakan menggunakan pathfinder BFS murni.
   - Papan SVG interaktif dengan kontrol *touch-drag* (geser pratinjau dinding), area sentuh 44 px, dan penempatan aman *two-step preview* (tap pertama pratinjau, tap kedua pasang).
   - Mode Hotseat Lokal, Solo lawan bot (3 tingkat: Santai, Sedang, Sempurna), dan Online Multiplayer (Supabase Realtime).

2. **Tic Tac Toe: No-Draw Edition**
   - Aturan anti-seri berbasis FIFO 3-bidak aktif per pemain, plus 2 kali tahan bidak tertua per ronde.
   - Papan dinamis dengan indikator bidak tertua yang akan memudar.
   - Mode Hotseat Lokal dan Online Multiplayer.

3. **Slap Arena: Pulau Tampol**
   - Brawler fisika 3D di satu pulau melayang, dirender dengan three.js dari primitif tanpa aset eksternal.
   - Mode Solo melawan tiga bot berkarakter, dan Online sampai empat brawler dengan host-authoritative snapshot lewat Supabase Realtime.
   - Kualitas efek diturunkan otomatis dari frame rate terukur, bukan dari lebar layar.

4. **Bomberman: Arena Bata Lunak**
   - Arena grid real-time: tanam bom, ledakan berbentuk salib, reaksi berantai, dan bata lunak yang menyerap api sehingga petaknya sendiri tidak ikut terbakar.
   - Enam karakter chibi kepala besar dengan pratinjau sprite di pemilihnya (pilih manual atau acak) dan tiga lantai yang diacak tiap pertandingan; seluruh sprite digambar sebagai SVG di kode, hanya tekstur lantai yang berupa gambar.
   - Empat papan: 11x9 atau 15x13 untuk dua kursi, 15x11 atau 21x15 untuk empat kursi. Papan besar hampir dua kali jumlah petaknya.
   - Mode Solo lawan bot (3 tingkat), Online 2-4 pemain, dan kursi kosong yang diisi bot, jadi room 4 kursi bisa jalan dengan 2 manusia.
   - Stik layar mengunci satu sumbu sampai sumbu lain jelas lebih jauh, sehingga dorongan miring tetap berjalan lurus di peta yang cuma punya empat arah.
   - Satu nyawa per ronde, bukan per pertandingan: juara ditentukan lebih dulu dari 3 ronde, supaya arena sempat terbuka.

5. **Battleship: Kapal Tersembunyi**
   - Papan 8x8, lima kapal (Battleship 4, Cruiser 3, Frigate 3, Submarine 2, Patrol 2).
   - Armada ditandai anotasi peta laut (kurung rentang petak dan sandi jenis seperti "BS 4"), bukan blok warna.
   - Mode Solo lawan AI, Hotseat dua pemain, dan Online 2 perangkat.
   - Pop-up hasil di akhir pertandingan: pemenang, jumlah tembakan, lalu Main lagi atau Rematch satu room, Lobi, atau Halaman utama.
   - Susunan kapal tidak pernah dikirim ke server. Yang dikirim hanya hash SHA-256 atas seed dan susunan, lalu dibuktikan ulang setelah pertandingan selesai.

---

## 🚀 Menjalankan di Lokal

```bash
# 1. Install dependensi
npm install

# 2. Menjalankan development server
npm run dev

# 3. Menjalankan unit & UI automated test suite
npm run test

# 4. Menjalankan release readiness audit (Desktop & Mobile)
npm run release:check

# 5. Verifikasi aturan protokol room di Postgres nyata (butuh Docker)
npm run db:verify

# 6. Build produksi (output ke dist/games/)
npm run build
```

---

## 🛡️ Arsitektur CI/CD & Keamanan (Vercel)

- **Otomasi**: GitHub Actions (`deploy.yml`) menguji *TypeScript*, *Game Engines*, dan *Viewport UI Automation* (Desktop 1024px & Mobile 375px) sebelum auto-deploy ke Vercel pada branch `main`.
- **Keamanan Web Game**:
  - *Content-Security-Policy (CSP)* ketat dengan izin terkunci hanya ke Supabase.
  - *X-Frame-Options: DENY* (Anti-Clickjacking).
  - *X-Content-Type-Options: nosniff*.
  - *Permissions-Policy* menonaktifkan kamera, mikrofon, dan sensor perangkat yang tidak digunakan.

---

## 🔒 Protokol Room Multiplayer

Kunci anonim Supabase ikut terbawa di bundle publik, jadi setiap klien pada dasarnya tidak dipercaya. Lapisan yang menahan pemain curang:

1. **Compare-and-swap atas versi baris.** Setiap langkah ditulis dengan filter `current_turn` dan token `updated_at` dari baris yang baru dibaca. Dua langkah yang tiba bersamaan: hanya satu yang memenuhi filter, sisanya ditolak dan papan disinkronkan ulang.
2. **Pemicu di Postgres** (`supabase/migrations/002_match_protocol.sql`) memvalidasi status, rentetan giliran, `winner_index`, identitas room, dan ukuran `game_state` di sisi server, lalu selalu memajukan `updated_at` sehingga token tidak bisa dipalsukan klien.
3. **Commit-reveal untuk Battleship.** Koordinat kapal disimpan di perangkat pemiliknya. Yang lewat jaringan hanya hash komitmen, hasil tembakan, dan pengungkapan di akhir. Klaim tembakan yang tidak cocok dengan armada yang diungkap ditandai di layar.
4. **Log langkah diringkas.** `match_moves.payload` berisi ringkasan langkah, bukan salinan penuh state permainan.

Aturan di atas diuji sebagai asserti SQL terhadap Postgres 16 melalui `npm run db:verify`, dan sebagai test integrasi protocol di `tests/integration/`.

---

## 📜 Lisensi & Atribusi (License & Acknowledgements)

Proyek ini dilisensikan di bawah **[MIT License](LICENSE)** © 2026 **Ivan Jairus**.

### Atribusi & Catatan Hak Cipta:
* **WallGo** adalah implementasi kode digital orisinal yang terinspirasi dari permainan papan strategi penempatan dinding klasik (*abstract strategy wall-placement board games*).
* **Tic Tac Toe No-Draw** merupakan variasi matematis orisinal berbasis aturan grid 3×3 klasik.
* **Bomberman** memakai mekanik bom berantai grid yang umum pada genre ini; seluruh aturan, engine, sprite karakter, dan efeknya ditulis ulang dari nol untuk repo ini dan tidak memakai aset atau kode dari game Bomberman mana pun.
* **Aset karakter, papan, dan efek seluruh game di repositori ini digambar sebagai SVG di kode dan ditulis secara independen.** Pengecualian: tiga tekstur lantai Bomberman di `src/games/bomberman/assets/` dibuat dengan image generation, lalu dikecilkan ke WebP. Klaim ini terpisah dari kode, yang dilindungi lisensi MIT.
* **Font Fredoka** (`src/fonts/`) dipakai di bawah SIL Open Font License; teks lisensinya disertakan di `src/fonts/OFL-Fredoka.txt`.