SoWork v1.6.8 — Google Sheet Summary Below

Perbaikan utama:
- Rekap TIDAK lagi ditempel di kanan jadwal.
- Rekap dibuat sebagai tabel terpisah DI BAWAH jadwal, mulai kolom D.
- Kolom rekap:
  Nama
  Shift 1
  Shift 1+Lembur
  Shift 2
  Shift 2+Lembur
  Middle
  [semua role dinamis]
  Hari Kerja
  Hari Libur
- Ada baris TOTAL SEMUA CREW.
- Jadwal utama tetap 2-row merge per crew.
- Freeze 2 baris + 4 kolom tetap aktif.
- Fix error: "tidak dapat membekukan kolom yang berisi hanya sebagian dari sel gabungan".

Cara pasang:
1. Google Apps Script > Code.gs.
2. Ctrl+A, ganti seluruh isi dengan google-apps-script/Code.gs dari paket ini.
3. Save.
4. Deploy > Manage deployments > Edit (pensil) > New version > Deploy.
5. Execute as: Me
6. Who has access: Anyone
7. Di SoWork, kirim ulang jadwal ke tab yang sama.

Tidak perlu update frontend GitHub untuk revisi ini.
