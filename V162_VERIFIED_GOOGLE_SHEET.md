# SoWork v1.6.2 — Verified Google Sheet Bridge

- Menghapus false-positive sukses dari fallback browser.
- `Tes koneksi` memverifikasi Secret Token dan akses Spreadsheet.
- POST Apps Script menyimpan hasil per `requestId`; browser membaca hasil lewat JSONP status endpoint sehingga tetap bisa diverifikasi lintas origin.
- `Kirim sekarang` hanya sukses jika Apps Script mengembalikan status `ok:true`.
- Secret salah, spreadsheet tidak bisa dibuka, deployment salah, atau write gagal sekarang tampil sebagai error merah + toast error.
- Merge asli Google Sheets A1:A2 sampai D1:D2 tetap dibuat server-side oleh Apps Script.

Setelah mengganti Code.gs, buat deployment version baru di Apps Script.
