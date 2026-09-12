SoWork v1.7.1 — Deploy
======================

Frontend GitHub Pages
1. Upload/replace source ke branch main.
2. File frontend yang berubah:
   - package.json
   - package-lock.json
   - src/main.js
   - src/style.css
   - src/modules/schedule/generator.js
   - src/modules/schedule/schedule.js
   - src/modules/stock/stock.js
   - src/modules/telegram/cloudflare.js
3. GitHub Actions akan build + deploy otomatis.

Cloudflare Worker — WAJIB DEPLOY ULANG
Karena ada endpoint baru /api/stock-receipt-batch:
  npm.cmd install
  npm.cmd run cf:deploy

Tidak perlu menjalankan cf:create-db atau cf:init-db karena schema D1 tidak berubah.

Google Apps Script
Tidak berubah. Tetap gunakan Apps Script v1.6.8 yang sudah berjalan.

Fitur penting
- Barang Masuk sekarang batch/cart; satu batch bisa banyak item.
- Setelah batch tersimpan, Telegram hanya mengirim SATU ringkasan seluruh item.
- Retry notification memakai batchId supaya tidak double send.
- Toggle Telegram: Notif ringkasan Barang Masuk.
- Crew schedule bisa Aktif/Nonaktif tanpa menghapus histori.
- Formasi S1/Middle/S2, minimum pria S2, gender S1/Middle, libur, dan role dapat diatur per Admin.
- Preset rules + preview validation.
