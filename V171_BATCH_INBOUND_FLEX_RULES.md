# SoWork v1.7.1 — Batch Inbound + Flexible Schedule Rules

## Barang Masuk Batch
- Modal Barang Masuk sekarang mendukung banyak item dalam satu kiriman.
- Satu batch mempunyai tanggal, tujuan gudang, supplier, catatan, dan banyak baris barang.
- Firestore menyimpan setiap movement dengan `batchId` yang sama.
- Setelah semua item sukses tersimpan, SoWork mengirim satu ringkasan Telegram untuk seluruh batch.
- Notifikasi Telegram memakai endpoint Worker `/api/stock-receipt-batch` dan idempotency `batchId`, sehingga retry tidak menggandakan pesan.
- Jika Telegram gagal/offline, stok tetap tersimpan dan Admin mendapat warning lokal.
- Settings Telegram punya toggle `Notif ringkasan Barang Masuk`.

## Schedule Rules Fully Admin-Controlled
- Crew tidak lagi dipatok 6 orang.
- Master crew punya Nama, Gender, dan status Aktif/Nonaktif.
- Crew nonaktif tidak ikut generate, histori jadwal lama tetap ada.
- Formasi S1 / Middle / S2 dapat diatur per hari Senin–Minggu.
- Minimum pria S2 dapat diatur per hari.
- Gender S1 dan Middle dapat diatur: Bebas / Pria saja / Wanita saja.
- Crew libur dapat diatur per hari.
- Role S1 / Middle / S2 dapat diatur Admin lewat daftar koma.
- Preset tersedia: Normal 6 Crew, 5 Crew, Minimal 4 Crew, Ramai Weekend.
- Preview melakukan validasi kebutuhan crew, libur, gender, dan formasi sebelum generator berjalan.
- Generator menggunakan backtracking ringan agar constraint gender tidak mudah buntu.
- Fairness role sekarang dinamis mengikuti daftar role Admin.

## Deploy
Frontend:
- Push source v1.7.1 ke `main`, GitHub Actions akan build/deploy otomatis.

Cloudflare Worker:
- WAJIB deploy ulang karena ada endpoint Telegram baru:
  `npm.cmd run cf:deploy`

Google Apps Script:
- Tidak berubah. Tetap gunakan Apps Script v1.6.8 yang sudah berjalan.
