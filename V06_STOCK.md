# SoWork v0.6 — Stock Intelligence

## Referensi awal
Data master dan histori awal dapat di-seed dari `Laporan SO Agustus.xlsx` yang diberikan user.
- 61 nama barang teridentifikasi.
- 233 snapshot item dari sheet 09/08, 18/08, 25/08, dan 31/08/2026.
- Tanggal snapshot mengikuti nama sheet. Sheet `31082026` masih memiliki nilai tanggal 25/08 di kolom Tanggal, sehingga nama sheet dipakai sebagai tanggal snapshot referensi.
- Beberapa cell sumber terlihat inkonsisten; seed dipakai sebagai baseline referensi dan semua data tetap dapat diperbaiki lewat CRUD/SO baru.

## Fitur
- Master Barang CRUD: nama, kategori, satuan, isi karton, lokasi, current stock, threshold, lead time, target coverage, safety stock, item krusial.
- Barang Masuk: tanggal diterima, qty, lokasi tujuan, supplier, catatan; otomatis menambah current stock.
- Stock Opname rinci: lokasi 1 + qty, lokasi 2 + qty, total otomatis; menyimpan snapshot per tanggal.
- Stock intelligence:
  - Kritis / Menipis / Aman
  - Fast / Medium / Slow moving
  - rata-rata pemakaian per hari
  - estimasi days of cover
  - reorder point dan recommended order
  - pembulatan rekomendasi ke isi karton bila ada.
- Home Dashboard menampilkan Stock Alert.
- WhatsApp 1-click alert dengan pesan otomatis terisi.
- Order Planner berdasarkan histori SO + barang masuk yang dicatat.

## WhatsApp
Versi v0.6 menggunakan link `wa.me` sehingga user tetap menekan tombol kirim di WhatsApp.
Auto-send tanpa interaksi membutuhkan WhatsApp Business Cloud API dan backend/Cloud Function agar access token tidak terekspos di frontend.

## Firestore
Collection yang digunakan sudah tercakup oleh `firestore.rules` v0.5:
- `items`
- `stockMovements`
- `stockOpnames`
- `settings`

Semua tetap Admin-only.
