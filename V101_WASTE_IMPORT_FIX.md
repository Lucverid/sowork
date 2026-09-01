# SoWork v1.0.1 — Waste Import Fix

Fix:
- Import referensi Waste Juli tidak lagi menulis semua master item dalam satu Firestore batch besar.
- Import dibagi menjadi batch kecil lalu rekap bulanan disimpan terpisah.
- Menghindari Firestore Security Rules access-call limit yang dapat muncul sebagai `Missing or insufficient permissions`.

Tidak ada perubahan Firestore Rules yang diperlukan dari v1.0.
