# SoWork v1.2.1 — Telegram GRATIS via Cloudflare

Versi ini TIDAK memakai Firebase Cloud Functions dan TIDAK membutuhkan Firebase Blaze.
Firebase tetap Spark/free untuk Auth + Firestore. Bot, D1 mirror, webhook, dan cron berjalan di Cloudflare Workers Free.

## Arsitektur

SoWork (browser Admin) → Firebase Firestore (data utama)
                     ↘ Cloudflare Worker → D1 snapshot → Telegram
                                          ↘ Cron 06:30 / 08:00 WIB

Worker menerima sync hanya dari akun Firebase Admin. Firebase ID Token diverifikasi dengan public key Google dan UID Admin SoWork.
Bot Token tidak pernah disimpan di frontend/Firestore.

## 0. WAJIB: revoke token yang pernah dikirim ke chat

Kalau Bot Token pernah dikirim ke chat/screenshot, buka @BotFather → bot → API Token → Revoke current token → buat token baru.
Jangan kirim token baru ke chat.

## 1. Install

Di terminal VS Code folder SoWork:

```powershell
npm.cmd install
```

## 2. Login Cloudflare

```powershell
npm.cmd run cf:login
```

Browser akan terbuka. Login / buat akun Cloudflare gratis dan authorize Wrangler.

## 3. Buat D1 gratis

```powershell
npm.cmd run cf:create-db
```

Perintah ini memakai `--update-config`, jadi binding DB + database_id otomatis ditulis ke `cloudflare-worker/wrangler.jsonc`.

Lalu buat tabel:

```powershell
npm.cmd run cf:init-db
```

## 4. Deploy Worker

```powershell
npm.cmd run cf:deploy
```

Catat URL `workers.dev`, contoh:
`https://sowork-telegram-free.<subdomain>.workers.dev`

## 5. Simpan Bot Token sebagai Cloudflare Secret

```powershell
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN --config cloudflare-worker/wrangler.jsonc
```

Saat diminta value, paste token BARU dari BotFather.

Buat secret kedua:

```powershell
npx.cmd wrangler secret put TELEGRAM_WEBHOOK_SECRET --config cloudflare-worker/wrangler.jsonc
```

Isi string acak panjang (32+ karakter). Ini bukan Bot Token.

Deploy lagi supaya pasti memakai versi terbaru:

```powershell
npm.cmd run cf:deploy
```

## 6. Hubungkan SoWork

SoWork → Settings → Atur Telegram & Alert:

1. Isi `Cloudflare Worker URL` dari langkah deploy.
2. Generate Kode Pairing.
3. Centang Aktifkan alert Telegram.
4. Isi nomor WA relay bila perlu.
5. Klik `Simpan & Sync`.
6. Klik `Pasang Webhook`.
7. Buka bot Telegram lalu kirim `/start KODE`.
8. Balik ke Settings dan klik `Cek Worker`.
9. Jika terhubung, klik `Kirim Test`.

## 7. Command bot

- `/stock` — stok kritis/menipis + saran beli
- `/order` — prediksi order + jumlah beli
- `/waste` — high waste terbaru
- `/help` — bantuan

## Alert otomatis

### Stock
Setiap perubahan Stock/SO yang dilakukan Admin disinkron ke Worker. Jika item masuk Menipis/Kritis, Worker dapat langsung kirim alert.
Cron 08:00 WIB mengirim reminder item yang perlu order berdasarkan histori SO + incoming + lead time + safety stock + target coverage.

### Waste
Setiap input Waste harian disinkron ke Worker. Jika suatu bahan melewati Warning Harian atau sekitar 1.5× baseline histori, Telegram mengirim High Waste warning.
Cron 06:30 WIB mengecek pola weekday. Jika hari tersebut historisnya rawan waste, Admin diingatkan untuk menghitung ulang prep dan mulai sekitar 85–90% batch normal lalu refill bertahap.

## WhatsApp relay

Telegram menampilkan tombol `Teruskan ke WhatsApp` jika nomor WA relay diisi. Tombol membuka WhatsApp dengan teks alert sudah terisi.
Auto-send 100% tanpa klik tetap membutuhkan API WhatsApp resmi.

## Batas Free yang relevan

Cloudflare Workers Free memiliki request harian yang jauh di atas kebutuhan SoWork kecil, dan akun Free mendukung Cron Trigger. D1 Free cukup untuk snapshot operasional ringan. Cek dokumentasi Cloudflare jika limit berubah.
