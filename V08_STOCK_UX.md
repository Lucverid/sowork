# SoWork v0.8 — Stock UX & Predictive Reorder

## Perubahan
- Stock Opname card-based dan responsif.
- Search barang pada SO.
- Edit Master Barang langsung dari halaman SO.
- Master Barang full CRUD termasuk nama, satuan, karton, lokasi, threshold, lead time, safety stock, dan item krusial.
- Prediksi tanggal habis.
- Prediksi tanggal order paling lambat.
- Confidence prediksi berdasarkan jumlah snapshot SO.
- Minimal 2 snapshot SO untuk estimasi awal.
- Data 3+ snapshot memberikan estimasi yang lebih stabil.

## Logika prediksi
Pemakaian harian dihitung dari selisih antar SO, ditambah barang masuk yang tercatat pada interval tersebut.
Interval terbaru diberi bobot lebih tinggi dan maksimum 3 interval terbaru dipakai agar perubahan laju konsumsi lebih cepat terbaca.

Tanggal order mempertimbangkan:
- rata-rata pemakaian harian
- lead time supplier
- safety stock
- current stock
