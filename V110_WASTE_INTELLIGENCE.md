# SoWork v1.1.0 — Waste Intelligence

- Waste kembali ke input harian.
- Total bulanan otomatis dari daily entries.
- Referensi Juli memuat histori tanggal 1–31 secara idempotent.
- Deteksi hari waste tinggi dengan normalized score per item (aman untuk campuran ML/Gram/PCS).
- Analisis pola weekday berulang.
- Warning harian per item (manual atau otomatis dari baseline histori).
- Target waste bulanan opsional per item.
- Biaya per unit opsional untuk estimasi rupiah waste.
- Trend 7 hari vs 7 hari sebelumnya.
- Saran controlled prep, split batch, dan stabilisasi pengeluaran.
- Alert Waste muncul di Home.
- Export Excel berisi Waste Harian + Ringkasan Bulan.

Tidak perlu Firestore Rules baru karena semua data tetap memakai collection `waste`.
