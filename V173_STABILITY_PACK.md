# SoWork v1.7.3 — Stability Pack

Fokus versi ini bukan menambah modul operasional baru, tetapi membuat SoWork lebih mudah didiagnosis dan dipulihkan.

## System Health

Di Settings sekarang ada panel System Health yang mengecek:
- Firebase / Firestore dari server (bukan hanya cache browser)
- Cloudflare Telegram Worker
- Google Apps Script direct Sheet sync
- status online browser
- waktu respons tiap layanan
- last Cloudflare snapshot sync

Tombol **Test ulang semua** dapat dipakai kapan saja jika SoWork terasa lambat atau ada layanan yang tidak merespons.

## Backup & Recovery

Backup menyimpan snapshot konfigurasi kecil dan penting:
- Schedule Rules + crew
- Stock master
- Waste master
- identitas workspace dan setting umum yang aman
- setting alert Telegram non-sensitif

Yang TIDAK disalin ke backup:
- transaksi stock harian
- histori jadwal
- waste harian
- Apps Script secret
- Telegram Pair Code / Chat ID / Allowed User ID
- nomor WhatsApp

### Automatic backup
- Auto Backup aktif default
- Bulanan dibuat saat admin membuka SoWork di bulan baru
- Mingguan dibuat jika sudah >= 7 hari sejak snapshot mingguan/bulanan terakhir
- Retention default: 4 weekly + 3 monthly + 5 manual
- Cleanup snapshot lama otomatis

### Restore
Restore memakai **merge aman**:
- data dalam snapshot dipulihkan
- master baru yang dibuat setelah snapshot tidak dihapus
- credential sensitif saat ini tidak ditimpa

## Deployment
Frontend only.
Cloudflare Worker tidak berubah.
Google Apps Script tidak berubah.
Firestore Rules tidak perlu berubah karena snapshot disimpan di collection `settings` yang sudah Admin-only.
