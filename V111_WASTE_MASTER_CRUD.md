# SoWork v1.1.1 — Waste Master CRUD

- Master Waste sekarang punya area management sendiri.
- Create: tambah item baru.
- Read: lihat semua item aktif dan arsip.
- Update: rename, ubah satuan, warning, target bulanan, biaya/unit, kategori.
- Delete:
  - Jika belum pernah punya histori: bisa Hapus Permanen.
  - Jika sudah punya histori: otomatis menjadi Arsipkan.
- Restore: item arsip bisa diaktifkan kembali.
- Item arsip tidak muncul pada form input Waste baru.
- Histori bulan lama tetap mempertahankan item arsip dalam analytics.
- Waste harian baru menyimpan snapshot nama/satuan item sebagai proteksi tambahan.
