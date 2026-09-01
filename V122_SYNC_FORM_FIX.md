# SoWork v1.2.2 — Telegram Save & Sync Fix

- Memperbaiki error `Cannot read properties of null (reading elements)` saat Simpan & Sync.
- Semua nilai form disnapshot sebelum operasi async/await.
- Tombol Simpan & Sync sekarang punya loading/disabled state.
- Error sync menampilkan kode/error sebenarnya jika Worker/authorization bermasalah.
- Tidak ada perubahan Firestore Rules atau Cloudflare Worker schema.
