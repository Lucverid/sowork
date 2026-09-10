# SoWork v1.5.4 — Historical Reconciliation + Sheet Export

- Stock Opname historis kini menghitung ulang status **Sesuai / Selisih Kurang / Selisih Lebih** dari angka fisik vs sistem, termasuk data lama yang belum menyimpan field rekonsiliasi.
- Kalender Stock Opname memakai hasil rekonsiliasi yang sama, sehingga badge/titik selisih konsisten dengan tanggal yang dipilih.
- Hitungan snapshot kalender dinormalisasi per tanggal + item agar tidak menampilkan rasio aneh akibat histori lama/duplikat.
- Tombol **Copy ke Sheet** dihapus dari halaman Jadwal.
- **Sheet-ready** dan **Export lengkap** tetap tersedia. Merge XLSX dipertahankan di file; untuk mempertahankan merge saat dipindahkan ke spreadsheet pribadi, import/copy worksheet, bukan copy-paste range antar workbook/app.
