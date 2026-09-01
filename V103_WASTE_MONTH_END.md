# SoWork v1.0.3 — Waste Month-End

Perubahan:
- Waste kembali memakai collection Firestore lama `waste`.
- Tidak lagi bergantung pada `wasteItems` / `wasteMonths`.
- Import referensi Juli membaca baris `Total` paling bawah sheet Data Waste.
- Tanggal 1–31 pada workbook dianggap data pembentuk total, bukan 31 form wajib.
- Waste baru diinput sekali per bulan.
- Master item tetap CRUD.
- Unit item dapat dipilih: ML, Gram, PCS, QTY.
- History disimpan per bulan.
- Export Excel menjadi rekap bulanan per item.
- Error Firestore sekarang menampilkan error code juga supaya diagnosis lebih jelas.
