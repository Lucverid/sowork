# SoWork v1.5.0 — Minimal Easy UI

## Fokus revisi
- Waste harian memakai kalender bulanan langsung, konsisten dengan penggunaan Stock.
- Tap tanggal untuk input/edit; indikator jumlah item + status watch/high terlihat di kalender.
- Master Waste dipindah ke panel collapsible supaya alur harian fokus pada input.
- Tombol edit master di setiap kartu Waste dihapus untuk mengurangi visual noise dan salah klik.
- Feedback simpan Waste kini langsung berubah menjadi `Menyimpan...` lalu `Tersimpan ✓`.
- Global UI dipadatkan: sidebar, topbar, panel, KPI, form, tombol, dan spacing lebih efisien.
- Mobile action rail, 2-column KPI, bottom navigation lebih modern, dan tombol Menu tengah dibuat lebih menonjol.
- Layout form Waste adaptif 4 kolom desktop → 2 kolom tablet → 1 baris ringkas per item di HP.
- Long list memakai content-visibility saat didukung browser untuk mengurangi pekerjaan layout.

## Data
Tidak ada perubahan schema Firestore. Data Stock, Waste, Jadwal, Telegram, dan histori tetap memakai struktur sebelumnya.
