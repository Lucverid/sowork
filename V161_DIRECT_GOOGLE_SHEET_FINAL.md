# SoWork v1.6.1 — Direct Google Sheet Final

## Perubahan utama
- `Copy ke Sheet` berbasis clipboard dihapus dari toolbar Jadwal.
- Tombol baru **Kirim ke Google Sheet** menulis jadwal langsung lewat Google Apps Script.
- Merge A1:A2, B1:B2, C1:C2, D1:D2 dibuat oleh Google Sheets sendiri, sehingga tidak hilang seperti saat Ctrl+V.
- Warna shift, gender, border, ukuran kolom/baris, wrap text, serta freeze pane ikut dibuat.
- Koneksi Apps Script + secret + spreadsheet default dapat disimpan oleh Admin.
- `Sheet-ready` dan `Export lengkap` tetap tersedia sebagai jalur backup/offline.
- Kontrol Jadwal v1.6.0 tetap dipertahankan.
- Tidak ada teks/fallback “mode aman”.

## Setup
Lihat `GOOGLE_SHEETS_DIRECT_SETUP.md` dan `google-apps-script/Code.gs`.
