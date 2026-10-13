# ij-games / WallGo

Koleksi mini game strategi di portal `ivanjairus.xyz/games/`, diawali dengan game utama **WallGo** (Wall Game).

## Fitur Utama

- **Aturan Terstandarisasi**: Dokumentasi resmi di [docs/wallgame-rules.md](file:///Users/70572/Documents/Games/Wall-Game/docs/wallgame-rules.md).
- **Core Engine Murni**: Logika TypeScript agnostik lingkungan di [engine.ts](file:///Users/70572/Documents/Games/Wall-Game/supabase/functions/_shared/wallgame/engine.ts) dengan cakupan uji unit > 90%.
- **Dukungan N-Player Dinamis**: Mendukung 2 hingga 6 pemain secara dinamis dengan ukuran grid adaptif ($7 \times 7$ s/d $15 \times 15$).
- **Papan Interaktif SVG**: Render responsif petak, dinding, token pemain, dan pewarnaan wilayah terisolasi.
- **Mode Hotseat Lokal**: Mainkan bergantian di satu perangkat via rute `/games/wallgame/local`.
- **Integrasi Gateway**: Base path `/games/` dengan output nested di `dist/games/`, siap diintegrasikan dengan `ij-gateway`.

## Menjalankan di Lokal

```bash
# Install dependensi
npm install

# Menjalankan dev server
npm run dev

# Menjalankan unit tests
npm run test

# Menjalankan test coverage
npm run test:coverage

# Build untuk produksi (output ke dist/games/)
npm run build
```

## Arsitektur Deployment (Vercel)

- **Framework**: Vite
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Base Path**: `/games/`
- **Deployment Protection (Vercel Authentication)**: Disabled (agar dapat di-rewrite oleh `ij-gateway`).