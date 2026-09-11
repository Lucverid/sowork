# SoWork v1.6.1 — Direct Google Sheet Setup

Fitur **Kirim ke Google Sheet** tidak memakai clipboard. Merge dibuat langsung oleh Google Apps Script di spreadsheet tujuan.

## Setup sekali saja

1. Buka https://script.google.com dan buat **New project**.
2. Hapus isi `Code.gs`, lalu copy seluruh isi `google-apps-script/Code.gs` dari project SoWork.
3. Buka **Project Settings → Script Properties** dan tambahkan:
   - Property: `SOWORK_SECRET`
   - Value: buat token panjang, contoh `sowork-2026-ganti-dengan-token-acak`.
4. Klik **Deploy → New deployment → Web app**.
5. Pilih:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize Google Sheets saat diminta, lalu copy URL deployment yang berakhiran `/exec`.
7. Di SoWork buka **Jadwal → Kirim ke Google Sheet**.
8. Isi Web App URL, Secret Token yang sama, dan URL spreadsheet tujuan. Klik **Simpan koneksi** lalu **Kirim sekarang**.

## Hasil sync

SoWork membuat/menimpa tab yang dipilih dan menerapkan langsung:
- merge `A1:A2`, `B1:B2`, `C1:C2`, `D1:D2`;
- warna S1 / Middle / S2 / Libur / Lembur;
- warna gender;
- border, alignment, wrap text;
- ukuran kolom/baris;
- freeze 2 baris dan 4 kolom.

Jika nama tab sudah ada, isi tab itu akan diganti. Sheet lain tidak disentuh.

## Catatan keamanan

Secret disimpan di settings SoWork agar Admin tidak perlu mengetik ulang. Gunakan token yang berbeda dari password akun. Jika URL Apps Script pernah dibagikan ke pihak yang tidak dipercaya, ganti `SOWORK_SECRET` lalu update token di SoWork.
