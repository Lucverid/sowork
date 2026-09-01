# SoWork v1.2.0 — Data Hub + Telegram Alerts

## Spreadsheet
- Export Excel di Dashboard, Jadwal, Checklist, Stock, Stock Opname, Order Planner, Waste, Kalkulator, dan Laporan.
- Data Hub untuk Export Semua Data.
- Template import: `public/templates/SoWork-Import-Template.xlsx`.
- Import: Jadwal, Checklist Template, Stock Master, Stock Masuk, Stock Opname, Waste Master/Harian, Laporan.
- Order Planner tetap derived/read-only untuk import agar prediksi selalu dihitung dari data sumber.

## Telegram
- Firebase Functions mengirim alert Stock dan Waste ke Telegram.
- Prediksi jumlah order memakai histori SO + Barang Masuk.
- Reminder order dan hari rawan waste berjalan setiap pagi.
- Bot command `/stock`, `/order`, `/waste`, `/help`.
- Pairing code untuk mengikat chat Telegram dengan SoWork.
- Bot Token disimpan sebagai Firebase Secret, bukan di frontend.

## WhatsApp relay
- Alert Telegram punya tombol 1-tap `Teruskan ke WhatsApp`.
- WhatsApp terbuka dengan pesan sudah terisi; Admin tetap menekan Send.
- Auto relay tanpa interaksi tetap memerlukan WhatsApp Business Cloud API/provider resmi.
