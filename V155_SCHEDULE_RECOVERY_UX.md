# SoWork v1.5.5 — Schedule Recovery & UX Polish

- Halaman Jadwal tidak lagi blank tanpa konteks saat periode terpilih tidak punya data.
- Bulan default dapat mengikuti data jadwal terbaru.
- Navigasi periode tersedia untuk Admin dan Viewer: sebelumnya, berikutnya, picker bulan, dan periode sekarang.
- Periode operasional 26 bulan sebelumnya → 25 bulan target menjadi default agar jadwal transisi tetap terlihat.
- Filter periode memakai key tanggal string untuk menghindari masalah timezone.
- Jika periode kosong tetapi ada histori, tombol “Buka jadwal terakhir” muncul otomatis.
- Ada loading state dan error state untuk listener jadwal Firestore.
- Aturan crew dipindah ke disclosure agar halaman Jadwal fokus ke data yang paling sering dilihat.
- Toolbar dan layout Jadwal dirapikan untuk HP, tablet, dan desktop.
