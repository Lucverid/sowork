# SoWork v1.5.1 — Stock Flow & Schedule Copy Fix

- Export Jadwal sekarang memakai merge Excel asli untuk header No, Nama Crew, Gender, dan Periode (baris 1–2), sehingga struktur lebih konsisten saat dicopy-paste.
- Tombol Copy Jadwal ditambahkan; clipboard dikirim sebagai tabel HTML + TSV fallback supaya paste ke Excel/Sheets tidak berubah jadi satu baris.
- Halaman Stock punya akses cepat Penggunaan / Data Stock setelah Stock Alert.
- Kalender penggunaan dibuat lebih compact, terutama di HP.
- Aksi yang jarang dipakai (Alert Bot, Import, Export, tambah master) diringkas ke menu Lainnya.
- + Barang Masuk tetap menjadi aksi utama karena lebih sering dipakai.
- Bottom navigation mobile tetap 5 item dengan Menu di tengah, tetapi semua item sekarang sejajar dan ukurannya sama; tidak ada tombol Menu besar/terangkat.
- Menu memakai ikon grid dan bottom sheet yang lebih ringan.
- Tidak ada perubahan schema Firestore.
