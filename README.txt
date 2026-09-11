SoWork Apps Script v1.6.7 — Rekap Jadwal

Tambahan di Google Sheet:
- Total Kerja per crew (semua jadwal selain Libur)
- Total S1 per crew
- Total S2 per crew
- Total Middle per crew
- Total Libur per crew
- Total setiap role per crew (dinamis: Kasir, Bar, Kitchen, Kitchen - Bar, dan role lain jika ada)
- Baris TOTAL SEMUA CREW di bagian bawah
- Merge 2-row per crew tetap dipertahankan
- Fix callback Apps Script v1.6.5 tetap dipertahankan

Cara pasang:
1. Google Apps Script -> Code.gs -> Ctrl+A -> paste isi google-apps-script/Code.gs
2. Save
3. Deploy -> Manage deployments -> Edit -> New version -> Deploy
4. Execute as: Me, Who has access: Anyone
5. Kirim ulang jadwal dari SoWork. Tab yang sama akan dibersihkan dan dibuat ulang dengan rekap.

Opsional agar source repo sinkron:
replace google-apps-script/Code.gs di GitHub main dengan file ini. Frontend tidak perlu diubah.
