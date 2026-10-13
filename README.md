# ij-games · Mini-Games & Arena Strategi

[![CI & Auto-Deploy to Vercel](https://github.com/IvanJairus/Games/actions/workflows/deploy.yml/badge.svg)](https://github.com/IvanJairus/Games/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Koleksi mini game taktis dan strategi web modern di portal `ivanjairus.xyz/games/` dan [ij-games.vercel.app](https://ij-games.vercel.app/games/).

---

## 🎮 Daftar Permainan

1. **WallGo: Race to the Golden Core**
   - Game strategi penempatan dinding taktis (2-6 pemain).
   - Validasi jalur anti-jebakan menggunakan pathfinder BFS murni.
   - Papan SVG interaktif dengan kontrol *touch-drag* (geser dinding) dan penempatan aman *two-step preview*.
   - Mode Hotseat Lokal dan Online Multiplayer (Supabase Realtime).

2. **Tic Tac Toe: No-Draw Edition**
   - Aturan anti-seri berbasis FIFO 3-bidak aktif per pemain.
   - Papan dinamis dengan indikator bidak tertua yang akan memudar.
   - Mode Hotseat Lokal dan Online Multiplayer.

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

# 5. Build produksi (output ke dist/games/)
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

## 📜 Lisensi & Atribusi (License & Acknowledgements)

Proyek ini dilisensikan di bawah **[MIT License](LICENSE)** © 2026 **Ivan Jairus**.

### Atribusi & Catatan Hak Cipta:
* **WallGo** adalah implementasi kode digital orisinal yang terinspirasi dari permainan papan strategi penempatan dinding klasik (*abstract strategy wall-placement board games*).
* **Tic Tac Toe No-Draw** merupakan variasi matematis orisinal berbasis aturan grid 3×3 klasik.
* Seluruh kode TypeScript, engine permainan, arsitektur multiplayer, dan aset SVG di repositori ini ditulis secara independen dan dilindungi oleh lisensi MIT.