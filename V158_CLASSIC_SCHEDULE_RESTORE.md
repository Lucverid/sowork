# SoWork v1.5.8 — Classic Schedule Restore

## Fokus revisi
- Halaman Jadwal dikembalikan ke flow sederhana/stabil dari basis `sowork-main(2).zip` (v1.3.4).
- Tidak memakai schedule recovery browser, auto-jump, atau safe-mode UI dari v1.5.5–v1.5.7.
- Pilih bulan + toggle periode transisi tetap menjadi kontrol utama.
- Tabel jadwal, edit per sel, Generate Jadwal, Crew & Rotasi, fairness, dan history lembur dipertahankan.
- Fitur baru lain tetap memakai basis v1.5.6: Stock Opname historis, Waste CRUD, Telegram, calendar-first, toast, dll.
- `Copy ke Sheet` tetap dihapus.
- `Sheet-ready (Import)` dan `Export lengkap` tetap tersedia dengan merge XLSX asli.

## Catatan merge
Copy-paste cell antar Excel/Google Sheets tidak menjamin metadata merge ikut. Untuk hasil yang konsisten, import file Sheet-ready melalui Google Sheets → File → Import → Upload → Insert new sheet(s), atau pindahkan seluruh worksheet/tab.

## Cloudflare
Tidak ada perubahan Worker dari v1.5.6. Tidak perlu deploy ulang Cloudflare Worker.
