# SoWork v1.3.0 — Daily Stock Ledger & Reconciliation

- Penggunaan barang diinput per tanggal dan langsung mengurangi stok sistem.
- Satu record penggunaan per tanggal + item; edit ulang hanya menerapkan selisih, tidak dobel mengurangi stok.
- Nilai 0 tetap disimpan supaya hari tanpa penggunaan tetap tercatat.
- Prediksi order memprioritaskan data penggunaan harian nyata setelah minimal 3 hari input.
- Stock Opname membandingkan Stok Sistem vs Stok Fisik.
- Formula: SO sebelumnya + Barang Masuk - Penggunaan Harian = Stok Sistem sebelum SO.
- SO menyimpan Selisih, Selisih %, Akurasi %, status rekonsiliasi, inbound dan usage sejak SO sebelumnya.
- Setelah SO disimpan, current stock dikoreksi ke stok fisik.
- Export Stock menambah sheet Penggunaan Stok.
- Export Stock Opname menambah sheet Rekonsiliasi SO.
- Import Excel mendukung Penggunaan Stok.
- Tidak memerlukan perubahan Firestore Rules karena tetap memakai stockMovements dan stockOpnames.

- Transaksi historis pada/ sebelum SO terakhir tetap masuk histori dan rekonsiliasi, tetapi tidak mengubah current stock yang sudah dikoreksi oleh SO.
