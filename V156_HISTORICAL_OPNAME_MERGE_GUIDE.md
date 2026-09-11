# SoWork v1.5.6 — Historical Opname + Merge-safe Schedule Export

- Summary Stock Opname `Sesuai / Kurang / Lebih` tidak lagi hanya bergantung pada master item aktif. Snapshot histori pada tanggal terpilih tetap dihitung walaupun item sudah diarsipkan, ID berubah, atau format snapshot berasal dari versi lama.
- Matching snapshot memakai Item ID dengan fallback nama barang untuk kompatibilitas data lama.
- Rekonsiliasi histori memprioritaskan `systemQtyBeforeOpname`, lalu `varianceQty`, lalu ledger dari SO sebelumnya + movement. Status lama juga dinormalisasi bila baseline angka belum tersedia.
- Kalender Stock Opname memakai rekonsiliasi yang sama dengan status strip sehingga indikator histori konsisten.
- Tombol `Copy ke Sheet` tetap dihapus.
- `Sheet-ready (Import)` dan `Export lengkap` menyimpan metadata merge XLSX asli. Clipboard copy/paste antar workbook/aplikasi memang tidak menjamin merge ikut terbawa.
- Jalur merge-safe untuk Google Sheets: `File → Import → Upload → Insert new sheet(s)`. Untuk memindahkan lagi, copy seluruh tab/sheet, bukan range cell.
- Fix Jadwal v1.5.5 tetap dipertahankan.
