# SoWork v0.3 — Auto Scheduler

## Fitur baru
- Generator jadwal otomatis berdasarkan Crew & Gender.
- Default crew:
  - Pria: Agis, Ruhimat, Tegar
  - Wanita: Nabila, Mirya, Cahya
- Formasi:
  - Senin: 2 S1 + 2 S2, tanpa Middle.
  - Selasa–Jumat: 2 S1 + 1 Middle + 2 S2.
  - Sabtu–Minggu: 2 S1 + 1 Middle + 3 S2.
- S2 minimal 1 pria setiap hari.
- Jumat: S1 hanya wanita, Middle wanita, pria yang masuk ditempatkan S2.
- Lembur tidak dibuat generator; hanya Manual Override.
- Jadwal utama per bulan selalu tanggal 1–25.
- Opsi periode transisi: 26 bulan sebelumnya sampai tanggal 25 bulan target.
- Preview sebelum write Firestore.
- Save otomatis mengganti data jadwal dalam rentang preview.
- Tampilan matrix dengan warna:
  - hijau S1
  - biru S2
  - orange Middle
  - merah Libur
  - kuning Lembur
- Fairness summary per crew.
- Rules crew/libur disimpan ke `scheduleRules/default`.
- Tombol saran rotasi libur periode berikutnya; Jumat tetap digilir di antara crew pria.

## Rules default periode awal
- Senin: Tegar + Nabila
- Selasa: Ruhimat
- Rabu: Mirya
- Kamis: Cahya
- Jumat: Agis

Rules ini dapat diedit Admin dari halaman Jadwal.
