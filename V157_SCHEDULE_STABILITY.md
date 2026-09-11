# SoWork v1.5.7 — Schedule Stability

- Jadwal renderer dibuat defensif dan tidak lagi membuat page blank saat satu record lama rusak.
- Record jadwal dinormalisasi sebelum dipakai. Record tanpa tanggal YYYY-MM-DD atau nama crew dilewati dengan warning.
- Periode Jadwal tetap 26 → 25 dan dapat dinavigasi Admin/Viewer.
- Jadwal terbaru dipakai sebagai fallback jika bulan belum dipilih.
- Array `.at()` dihilangkan untuk kompatibilitas WebView/Chrome yang lebih luas.
- Fairness dan overtime history tidak boleh menjatuhkan seluruh halaman.
- Ada Schedule Recovery Safe Mode jika renderer utama tetap melempar error.
- Fix Stock Opname historis dan Sheet-ready v1.5.6 tetap dipertahankan.
