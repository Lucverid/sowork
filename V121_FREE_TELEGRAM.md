# SoWork v1.2.1 — Free Telegram Edition

- Firebase Cloud Functions dihapus dari project.
- Tidak perlu Blaze / billing Firebase.
- Telegram backend dipindah ke Cloudflare Workers Free.
- D1 menyimpan mirror ringkas data Stock/Waste untuk cron saat browser tutup.
- `/api/sync` dilindungi Firebase ID Token + UID Admin.
- Worker memverifikasi signature JWT Firebase memakai public JWK Google.
- Telegram Bot Token + webhook secret disimpan via Cloudflare Secrets.
- Pairing `/start KODE` tetap tersedia.
- Command `/stock`, `/order`, `/waste`, `/help`.
- Immediate alert saat sync mendeteksi Stock masuk Menipis/Kritis atau Waste terbaru high.
- Cron 06:30 WIB: reminder hari rawan waste.
- Cron 08:00 WIB: reminder order + jumlah beli.
- Tombol Telegram → WhatsApp relay tetap 1-tap.
