# SoWork v1.7.0 — Stability & Stock Cleanup

## Penggunaan Stok Harian
- Tambah tombol **Hapus data tanggal** jika tanggal sudah pernah disimpan.
- Menghapus marker `DAILY_USAGE_DAY` agar tanda `terisi` / `sudah dicek` benar-benar hilang dari kalender.
- Menghapus movement `DAILY_USAGE` pada tanggal tersebut.
- Jika movement sebelumnya mengurangi stok berjalan, stok otomatis dikembalikan.
- Metadata `lastUsageDate` dikoreksi ke tanggal penggunaan sebelumnya.
- Aman untuk kasus tanggal yang sudah diubah semua menjadi 0: marker tetap bisa dihapus tanpa mengubah stok lagi.

## UX
- Teks editor menjelaskan bahwa salah tanggal dapat dihapus, bukan dipaksa diisi 0.
- Tombol hapus hanya muncul pada tanggal yang memang sudah tercatat.
- Konfirmasi menjelaskan apakah stok akan dikembalikan.

Apps Script Google Sheet v1.6.8 tidak perlu diubah untuk update frontend ini.
