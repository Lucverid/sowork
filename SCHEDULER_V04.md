# SoWork v0.4 — Schedule Operations

## Revisi Jadwal
- Admin dapat Create, Read, Update, Delete setiap assignment jadwal.
- Klik sel jadwal untuk membuka editor.
- Status shift ditampilkan sebagai indikator warna; role tetap berupa teks.
- Auto scheduler sekarang ikut menghasilkan role:
  - S1/S2: Kasir, Bar, Kitchen - Bar
  - Middle: hanya Bar atau Kitchen - Bar (tidak boleh Kasir)
- Manual Override panel v0.3 dihapus. CRUD dilakukan langsung dari Monthly View.

## Lembur
- Lembur adalah flag tambahan di assignment jadwal, bukan shift yang dibuat generator.
- Jenis: Buka, Start 11–Tutup, Lainnya.
- Catatan lembur wajib diisi.
- Assignment lembur diberi indikator kuning dan warning pada periode terkait.
- Admin memiliki History Lembur yang bisa dibuka kembali untuk diedit.

## Export
- Export `.xlsx` kompatibel Excel / Google Sheets.
- Sheet Jadwal menggunakan warna shift yang mirip format operasional lama.
- Sheet History Lembur disertakan.
- Sheet Rules disertakan.
