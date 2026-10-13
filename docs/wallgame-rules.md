# Spesifikasi Aturan Main: WallGo (Wall Game)

Dokumen ini mendefinisikan aturan permainan resmi untuk **WallGo**, game strategi berbasis giliran (*turn-based*) di mana pemain bergerak dan membangun dinding pembatas untuk mengklaim wilayah teritorial.

---

## 1. Ikhtisar & Tujuan Permainan

WallGo dimainkan di atas grid kotak berukuran $N \times N$ oleh **2 hingga 6 pemain**. 

Tujuan setiap pemain adalah **mengisolasi bidaknya ke dalam wilayah (*territory*) tertutup terbesar** sambil membatasi ruang gerak lawan. Permainan selesai ketika semua pemain telah terpisah ke dalam wilayah tertutup masing-masing (tidak ada dua pemain yang dapat saling menjangkau), dan pemenang ditentukan oleh **luas wilayah (jumlah petak) terbanyak**.

---

## 2. Penskalaan Grid & Jumlah Pemain Dinamis

Ukuran grid dapat ditentukan otomatis berdasarkan jumlah pemain atau disesuaikan oleh pembuat room:

| Jumlah Pemain | Rekomendasi Grid | Minimum Grid | Maksimum Grid |
|---|---|---|---|
| **2 Pemain** | $7 \times 7$ / $9 \times 9$ | $7 \times 7$ | $15 \times 15$ |
| **3 Pemain** | $9 \times 9$ | $9 \times 9$ | $15 \times 15$ |
| **4 Pemain** | $11 \times 11$ | $9 \times 9$ | $15 \times 15$ |
| **5 Pemain** | $11 \times 11$ / $13 \times 13$ | $11 \times 11$ | $15 \times 15$ |
| **6 Pemain** | $13 \times 13$ | $11 \times 11$ | $15 \times 15$ |

*Catatan: Dimensi grid selalu ganjil ($G \times G$) agar memiliki titik tengah simetris.*

### Posisi Awal Bidak (*Spawn Points*)
Pemain ditempatkan secara simetris di sekitar tepi luar grid untuk menjamin keadilan:
- **2 Pemain**: Sisi Utara tengah $( \lfloor G/2 \rfloor, 0 )$ dan Sisi Selatan tengah $( \lfloor G/2 \rfloor, G-1 )$.
- **3 Pemain**: Posisi segitiga simetris (Utara tengah, Barat Daya, Tenggara).
- **4 Pemain**: 4 titik mata angin (Utara, Timur, Selatan, Barat).
- **5 & 6 Pemain**: Distribusi sudut dan sisi simetris teratur di perimeter grid.

Setiap pemain memiliki identitas visual:
1. Player 1: Merah (`#EF4444`)
2. Player 2: Biru (`#3B82F6`)
3. Player 3: Hijau (`#10B981`)
4. Player 4: Kuning/Emas (`#F59E0B`)
5. Player 5: Ungu (`#8B5CF6`)
6. Player 6: Cyan (`#06B6D4`)

---

## 3. Alur Giliran (*Turn Cycle*)

Giliran berjalan melingkar:
$$\text{Player 1} \to \text{Player 2} \to \dots \to \text{Player } K \to \text{Player 1}$$

Pada setiap giliran, seorang pemain aktif wajib melakukan **2 fase tindakan**:

### Fase 1: Pergerakan Bidak (*Move Pawn*)
1. Pemain menggerakkan bidak 1 langkah secara ortogonal (Atas, Bawah, Kiri, atau Kanan).
2. **Batasan**:
   - Tidak boleh menembus dinding yang telah terpasang.
   - Tidak boleh keluar dari batas grid permainan.
   - Tidak boleh menempati petak yang sedang ditempati oleh bidak pemain lain.
   - Jika pemain terjebak (*no legal move*), fase gerak dilewati (*pass move*) dan pemain langsung melanjutkan ke Fase 2.

### Fase 2: Pemasangan Dinding (*Place Wall*)
1. Setelah menggerakkan bidak, pemain wajib memasang **1 segmen dinding** pada salah satu garis batas (*edge*) di antara dua petak yang berdekatan.
2. Dinding dapat berorientasi:
   - **Horizontal**: Memisahkan petak $(x, y)$ dan $(x, y+1)$.
   - **Vertical**: Memisahkan petak $(x, y)$ dan $(x+1, y)$.
3. **Batasan Pemasangan Dinding**:
   - Dinding tidak boleh menimpa dinding yang sudah ada sebelumnya.
   - Dinding tidak boleh dipasang di tepi luar grid (karena tepi luar sudah otomatis menjadi batas permanen).
   - **Aturan Ruang Hidup**: Pemasangan dinding tidak boleh langsung membuat petak bidak aktif terisolasi dengan ukuran 0 petak.

---

## 4. Deteksi Akhir Permainan (*End Game Condition*)

Permainan dievaluasi pada setiap akhir giliran menggunakan algoritma pencarian graf (*Breadth-First Search / Flood Fill*):

1. **Komponen Terhubung (*Connected Components / Territory*)**:
   - Seluruh petak dianalisis untuk mengelompokkan sel-sel yang saling terhubung tanpa terhalang dinding.
2. **Kondisi Selesai**:
   - Permainan **SELESAI SEGERA** jika:
     a. **Semua pemain telah terisolasi**: Setiap bidak pemain berada di dalam wilayah terpisah masing-masing (tidak ada 2 bidak yang berbagi satu wilayah terhubung).
     b. **Atau tidak ada langkah/dinding valid lagi** yang dapat dipasang.

---

## 5. Sistem Penilaian & Pemenang (*Scoring*)

Ketika permainan selesai:
1. **Skor Wilayah**:
   - Jika suatu wilayah hanya berisi tepat 1 bidak pemain, pemain tersebut memperoleh **1 poin per petak** di dalam wilayah tersebut.
2. **Wilayah Netral (*Neutral Enclosures*)**:
   - Petak-petak yang tertutup dinding tanpa ada bidak di dalamnya dianggap sebagai wilayah netral (0 poin untuk semua orang).
3. **Pemenang**:
   - Pemain dengan total skor (wilayah terluas) dinyatakan sebagai **Juara**.
   - Jika ada skor yang sama (*tie*), peringkat ditentukan bersama atau status seri.

---

## 6. Mode Permainan yang Didukung

- **Hotseat Lokal** (`/games/wallgame/local`):
  - 2 hingga 6 pemain bergantian bermain pada satu perangkat / layar yang sama.
  - Konfigurasi ukuran grid ($7 \times 7$ s/d $15 \times 15$) dan kustomisasi nama pemain.
- **Online Multiplayer** (`/games/wallgame/m/:code`):
  - Sinkronisasi realtime melalui Supabase Realtime & validasi langkah server-authoritative di Edge Function.
