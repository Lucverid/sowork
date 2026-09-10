# SoWork v1.5.2 — Opname, Sheet transfer, Telegram closing reminder

## Jadwal → spreadsheet pribadi
- `Copy ke Sheet` memakai Office-compatible HTML + tabel TSV fallback.
- Export utama tetap membawa merge asli pada header identitas.
- Tombol `Sheet-ready` menghasilkan XLSX satu-sheet khusus untuk **File → Import → Insert new sheet(s)** di Google Sheets. Ini adalah jalur yang paling stabil untuk mempertahankan merge karena clipboard antar aplikasi tidak selalu membawa metadata merge.

## Stock Opname
- UI dibuat lebih compact dan mobile-first.
- Import/Export dipindah ke menu `File`; tombol utama tinggal `+ Barang`.
- Filter cepat: Semua, Belum diisi, Selisih, Krusial.
- Status SO dibuat strip ringkas: Sesuai, Kurang, Lebih, Tersimpan.
- Setiap barang fokus pada dua lokasi + jumlah. Sistem, fisik, dan selisih terlihat dalam satu baris.
- Search/filter tidak me-render ulang page dan sticky save tetap tersedia.

## Telegram
- Reminder Daily Check yang belum selesai.
- Reminder closing untuk cek/input penggunaan Stock dan Waste.
- Jam reminder malam bisa dipilih 18:00 atau 20:00 WIB.
- Command Telegram baru: `/check`.
- Snapshot Cloudflare sekarang ikut membawa Jadwal, checklist template, completion, dan movement OUT untuk mendeteksi input harian.
- Cron Cloudflare ditambah untuk 18:00 dan 20:00 WIB.

## Data
Tidak ada migrasi schema wajib. Field setting baru memakai default aman bila dokumen Firestore lama belum memilikinya.
