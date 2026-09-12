SoWork v1.7.3 — Stability Pack

FITUR BARU
1. System Health di Settings
   - Firebase / Firestore server check
   - Telegram Worker check
   - Google Apps Script check
   - Browser online/offline
   - Response time (ms)
   - Last Cloudflare snapshot sync

2. Backup & Recovery
   - Backup Rules Jadwal + crew
   - Stock master
   - Waste master
   - Workspace settings aman
   - Telegram alert settings non-sensitif
   - Auto weekly + monthly
   - Retention: 4 weekly + 3 monthly + 5 manual
   - Download JSON
   - Preview sebelum restore
   - Restore merge aman

TIDAK DIBACKUP
- transaksi stock harian
- histori jadwal
- waste harian
- Apps Script secret
- Telegram Pair Code / Chat ID / Allowed User ID
- nomor WhatsApp

DEPLOY
Patch frontend only. Replace:
- src/main.js
- src/style.css
- src/modules/system/stability.js (file baru)
- package.json
- package-lock.json

Lalu:
git add .
git commit -m "Update SoWork v1.7.3 Stability Pack"
git push origin main

Cloudflare Worker TIDAK perlu deploy ulang.
Google Apps Script TIDAK perlu diubah.
Firestore Rules TIDAK perlu diubah.

Catatan:
- Auto backup baru dijalankan setelah Rules, Stock Master, Waste Master,
  App Settings, dan Stock Settings selesai dimuat.
- Pada pemakaian pertama, snapshot bulanan bisa langsung dibuat otomatis
  karena belum ada histori backup sebelumnya.
