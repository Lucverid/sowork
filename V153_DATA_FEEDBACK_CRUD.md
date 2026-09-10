# SoWork v1.5.3 — Data Feedback + CRUD Consistency

## Fokus revisi
- Waste harian sekarang punya status jelas: Belum disimpan / Ada perubahan / Menyimpan / Tersimpan / Gagal.
- Setelah save/gagal, SoWork menampilkan toast non-blocking yang jelas di HP dan desktop.
- Data Waste per tanggal bisa dihapus tanpa menghapus master item.
- Master Waste sekarang tampil sebagai panel CRUD yang jelas, bukan tersembunyi di collapsible: tambah, lihat, edit, arsipkan, aktifkan kembali, dan hapus permanen untuk item tanpa histori.
- Feedback save/error diseragamkan untuk Jadwal, Daily Checklist, Stock, Barang Masuk, Penggunaan Stock, Stock Opname, Waste, Laporan, Settings, Import, dan Telegram.
- Stock Opname juga punya indikator perubahan belum disimpan dan waktu save terakhir.


- Stock Opname sekarang calendar-first: satu bulan terlihat langsung, tanggal tersimpan punya badge jumlah item, dan tanggal dengan selisih diberi indikator.
- Stock Opname per tanggal mendukung edit/save ulang dan delete aman. Jika snapshot terakhir dihapus, stok aktif dipulihkan dari stok sistem sebelum SO + pergerakan setelah tanggal tersebut.
- Tanggal SO tetap punya date-picker fallback untuk aksesibilitas, tetapi kalender menjadi alur utama di HP dan desktop.

## Catatan data
- Menghapus data Waste tanggal tertentu hanya menghapus dokumen harian tanggal itu. Master Waste tetap aman.
- Item Waste yang punya histori tetap memakai mekanisme arsip, bukan delete paksa.
- Tidak ada migrasi Firestore wajib.
