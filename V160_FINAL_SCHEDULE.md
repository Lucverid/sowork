# SoWork v1.6.0 — Final Schedule

- Akar bug halaman Jadwal ditemukan: helper `ruleSummaryCards()` dan `renderPreviewMessage()` hilang pada rangkaian revisi v1.5.x sehingga renderer gagal sehingga Kontrol Jadwal tidak tampil. Kedua helper dipulihkan dari `sowork-main(3).zip`.
- Kontrol Jadwal klasik kembali tampil: bulan, periode transisi, Preview/Simpan Jadwal, Crew & Rotasi, matrix, fairness, history lembur.
- Fallback lama dihapus; halaman Jadwal sekarang memakai renderer klasik penuh.
- `Copy ke Sheet` aktif kembali memakai rich HTML table dengan `rowspan=2` untuk kolom No/Nama Crew/Gender/Periode.
- `Sheet-ready` tetap ada sebagai jalur XLSX dengan metadata merge yang pasti saat import.
- `Export lengkap` tetap ada.
- `.at(-1)` pada pemilihan periode terbaru diganti indexing biasa untuk kompatibilitas browser yang lebih luas.
- Fitur Stock Opname historis, Waste CRUD, Telegram dan fitur v1.5.x lain tetap dipertahankan.
