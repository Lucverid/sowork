SoWork v1.7.0 — Stability & Stock Cleanup

Fokus update:
- Tambah "Hapus data tanggal" di Pemakaian Barang Harian.
- Menghapus marker kalender, jadi label "terisi" / "sudah dicek" benar-benar hilang.
- Menghapus seluruh DAILY_USAGE pada tanggal itu.
- Stok otomatis dikembalikan hanya jika transaksi tersebut sebelumnya memang mengurangi stok berjalan.
- Aman untuk tanggal yang sudah diubah semua menjadi 0: hanya marker yang dibersihkan.
- lastUsageDate dikoreksi ke histori penggunaan sebelumnya.

Upload/replace ke GitHub:
1. src/main.js
2. src/modules/stock/stock.js
3. package.json
4. package-lock.json
5. V170_STABILITY_STOCK_CLEANUP.md (opsional, dokumentasi)

Apps Script Google Sheet v1.6.8 TIDAK perlu diubah.
