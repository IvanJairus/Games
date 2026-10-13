# Spesifikasi Aturan Resmi: WallGo — Race to the Golden Core

Dokumen ini mendefinisikan aturan resmi untuk **WallGo: Race to the Golden Core**, sebuah adaptasi strategi berbasis giliran (*turn-based tactical board game*) terinspirasi dari mekanika **Walls.gg / Quoridor** yang dirancang secara simetris untuk **2 hingga 6 pemain**.

---

## 1. Ikhtisar & Tujuan Permainan

Permainan berlangsung di atas grid berukuran ganjil ($G \times G$). Di titik pusat papan $(\lfloor G/2 \rfloor, \lfloor G/2 \rfloor)$ terdapat zona target yang disebut **The Golden Core**.

**Tujuan**: Menjadi pemain pertama yang berhasil menggerakkan bidaknya menginjak **The Golden Core**.

---

## 2. Papan & Penskalaan Jumlah Pemain (2 s/d 6 Pemain)

Grid selalu berdimensi ganjil agar memiliki 1 petak pusat tunggal yang tepat:
- **2–3 Pemain**: Grid $9 \times 9$ (81 petak, 8×8 titik dinding).
- **4–5 Pemain**: Grid $11 \times 11$ (121 petak, 10×10 titik dinding).
- **6 Pemain**: Grid $13 \times 13$ (169 petak, 12×12 titik dinding).

### Posisi Awal Simetris (*Spawn Points*)
Seluruh pemain ditempatkan di perimeter tepi terluar papan sedemikian rupa sehingga **jarak tempuh langkah awal (shortest path distance) ke The Golden Core adalah PERSIS SAMA** untuk setiap pemain.
- Jarak awal di grid $9 \times 9$: tepat 4 langkah lurus dari tepi ke pusat.
- Jarak awal di grid $11 \times 11$: tepat 5 langkah lurus.
- Jarak awal di grid $13 \times 13$: tepat 6 langkah lurus.

### Kuota Dinding Awal (*Wall Quota*)
Total dinding yang beredar di papan dibatasi agar papan tidak terlalu penuh:
- **2 Pemain**: 10 dinding per pemain (Total 20)
- **3 Pemain**: 7 dinding per pemain (Total 21)
- **4 Pemain**: 5 dinding per pemain (Total 20)
- **5 Pemain**: 4 dinding per pemain (Total 20)
- **6 Pemain**: 3 dinding per pemain (Total 18)

---

## 3. Ekonomi Giliran (*Turn Choice: EITHER / OR*)

Pada setiap giliran, seorang pemain aktif **HANYA MEMILIH SALAH SATU** dari dua tindakan berikut:

### Opsi A: Melangkah 1 Petak (*Step / Jump*)
1. **Langkah Standar**: Melangkah 1 petak secara ortogonal (Atas, Bawah, Kiri, atau Kanan).
   - Tidak boleh menembus dinding atau keluar dari batas papan.
   - Tidak boleh melangkah ke petak yang sedang ditempati pemain lain jika ada jalan biasa.
2. **Mekanik Melompat Lawan (*Pawn Jumping*)**:
   - Jika berhadapan langsung (*face-to-face*) dengan bidak lawan tanpa dinding pemisah:
     - **Lompat Lurus**: Bidak dapat melompati lawan lurus ke depan (maju 2 petak langsung).
     - **Lompat Diagonal**: Jika petak di belakang lawan terhalang oleh dinding atau tepi papan, bidak dapat melompat serong ke petak kiri atau kanan lawan.

### Opsi B: Memasang 1 Dinding (*Place a Wall*)
1. Pemain dapat memasang 1 dinding selama masih memiliki kuota dinding tersisa.
2. **Dimensi Dinding**: Setiap dinding membentang sepanjang **2 petak penuh** (*two-segment barrier*), baik secara Horizontal maupun Vertikal di alur celah antar-petak.
3. **Larangan Penempatan**:
   - Tidak boleh menimpa (*overlap*) dinding yang sudah ada.
   - Tidak boleh memotong bersilangan (*cross*) dinding lain pada titik persimpangan yang sama.
   - Tidak boleh melebihi batas terluar papan.
4. **Aturan Keadilan (Fair Rule / BFS Anti-Trap)**:
   - Dinding **TIDAK BOLEH** memutus total akses pemain mana pun menuju The Golden Core.
   - Engine mengevaluasi *Breadth-First Search (BFS)* secara real-time. Jika sebuah penempatan dinding menyebabkan satu pemain kehilangan seluruh akses jalan ke pusat, dinding tersebut **ilegal** dan ditolak.

---

## 4. Penentuan Kemenangan (*Victory Condition*)

1. Pemain pertama yang bidaknya mendarat di petak **The Golden Core** langsung dinyatakan sebagai **Pemenang Tunggal**.
2. Jika seorang pemain kehabisan kuota dinding, pemain tersebut hanya dapat memilih Opsi A (Melangkah) pada sisa gilirannya.

---

## 5. Sistem Desain Visual & Estetika

Menyelaraskan tema arsitektural dari `gateway-B2.html` dan `ivanjairus.xyz`:
- **Kanvas**: Dark Espresso (`#12100e`) dengan grid kertas arsitektur halus (`.paper`).
- **Aksen Utama**: Coklat tua, perunggu, dan emas (*Gold / Brass / Amber*).
- **The Golden Core**: Petak tengah berlapis aksen emas murni berukir lambang inti dengan pendaran cahaya lembut.
- **Dinding**: Bilah kuningan / kayu jati bersepuh emas (*polished golden brass*).
- **Tipografi**: Monospaced editorial (*tabular numbers*) untuk telemetri langkah, sisa dinding, dan jarak BFS ke inti.
