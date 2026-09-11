SoWork v1.6.5 — Apps Script Confirm + 2-Row Merge Fix

PERUBAHAN
1. Konfirmasi Apps Script
   - SoWork tidak lagi mentok "Mengirim..." setelah Sheet sebenarnya berhasil dibuat.
   - Frontend menerima balasan dari wrapper Google yang valid dengan verifikasi origin,
     requestId, dan callbackToken.

2. Merge 2 baris per crew
   - Setiap crew sekarang memakai 2 row dan seluruh sel crew digabung vertikal.
   - Crew pertama: A3:A4, B3:B4, C3:C4, D3:D4, E3:E4, F3:F4, dst.
   - Crew kedua: A5:A6, B5:B6, ... dst.
   - Jadi role per tanggal seperti E3:E4 benar-benar merged.
   - Warna S1/S2/Middle/Libur/Lembur tetap mengikuti merged cell.

CARA PASANG

A. GitHub
Replace file:
  src/modules/schedule/googleSheet.js
Lalu Commit Changes dan tunggu GitHub Actions selesai.

B. Google Apps Script
Paling aman:
1. Buka project Apps Script SoWork.
2. Buka Code.gs.
3. Ctrl+A lalu hapus semua.
4. Copy seluruh isi:
   google-apps-script/Code.gs
   dari paket ini ke Apps Script.
5. Save.
6. Deploy > Manage deployments > Edit (pensil)
   > Version: New version > Deploy.
7. Pastikan:
   Execute as: Me
   Who has access: Anyone
8. URL /exec tetap bisa dipakai jika edit deployment yang sama.

C. TEST
1. Refresh SoWork pakai Ctrl+F5.
2. Tes koneksi.
3. Kirim jadwal.
4. SoWork harus memberi konfirmasi sukses.
5. Google Sheet harus tampil 2 row per crew dengan merge vertikal.

CATATAN
Secret Token pernah terlihat di screenshot. Setelah semuanya berhasil,
ganti SOWORK_SECRET di Apps Script dan Secret Token di SoWork.
