# Security Policy

## Supported Versions

Kami secara aktif memelihara dan memperbarui keamanan untuk versi produksi yang berjalan di branch `main`.

| Version / Branch | Supported          |
| ---------------- | ------------------ |
| `main` (Live)    | :white_check_mark: |
| Older Releases   | :x:                |

Live Game Portal: [https://ij-games.vercel.app/games/](https://ij-games.vercel.app/games/)

---

## Reporting a Vulnerability

Kami sangat mengapresiasi upaya komunitas pengembang dan peneliti keamanan dalam membantu menjaga keamanan platform **Ivan Jairus Games**.

Jika Anda menemukan potensi celah keamanan (*security vulnerability*):

### 1. Metode Pelaporan (Privat)
Mohon **JANGAN** membuat laporan melalui Public Issue di GitHub Issues untuk mencegah potensi eksploitasi oleh pihak yang tidak bertanggung jawab sebelum perbaikan dirilis.

Gunakan salah satu jalur privat berikut:
- **GitHub Private Vulnerability Advisory**: Buka tab [Security > Report a vulnerability](https://github.com/IvanJairus/Games/security/advisories/new) di repositori ini.
- **Email Langsung**: Hubungi maintainer via email ke `ivan.jairus@bni.co.id` dengan subjek `[SECURITY] Vulnerability Report - IJ Games`.

### 2. Informasi yang Diperlukan dalam Laporan
Agar kami dapat mereproduksi dan memitigasi masalah dengan cepat, mohon sertakan:
- Deskripsi jenis kerentanan (misal: CSP bypass, session spoofing, logic flaw, data exposure).
- Langkah-langkah reproduksi (Proof of Concept / PoC) yang jelas dan aman.
- Perkiraan dampak keamanan terhadap pemain atau infrastruktur.
- Saran mitigasi atau patch (jika ada).

### 3. Komitmen Tanggapan
- **Konfirmasi Penerimaan**: Kami berkomitmen untuk merespons dan mengakui laporan Anda dalam waktu maksimal **48 jam**.
- **Investigasi & Validasi**: Tim akan memverifikasi kerentanan dan menentukan tingkat keparahan (*severity score*).
- **Rilis Perbaikan & Pengakuan**: Patch akan di-deploy ke production melalui pipeline CI/CD otomatis. Kami akan memberikan pengakuan kredit kepada pelapor yang mematuhi prinsip *Responsible Disclosure*.

---

## Security Architecture & Best Practices

Repositori ini menerapkan standar keamanan terintegrasi:
- **Automated Secret Scanning**: Menggunakan [Gitleaks](https://github.com/gitleaks/gitleaks) di pipeline CI/CD untuk mencegah kebocoran credentials atau API keys ke repositori.
- **Browser Protection**: Content-Security-Policy (CSP) ketat, Permissions-Policy, dan header anti-clickjacking (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`) pada Vercel edge.
- **Database & State Isolation**: Row Level Security (RLS) di Supabase yang mengisolasi match state multiplayer dan memvalidasi akses anon client berdasarkan session UUID & room code.
- **Automated Release Readiness**: Audit otomatis pra-rilis mencakup TypeScript typechecking, domain isolation guard, dan game engine unit testing.
