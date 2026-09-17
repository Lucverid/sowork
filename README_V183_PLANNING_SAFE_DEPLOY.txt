SoWork v1.8.3 — Planning Safe Deploy

Perubahan utama:
- Planning Order tetap memakai baseline v1.8.2 yang sudah merge fitur stable v1.7.38.
- Firestore Rules menyertakan collection /planning/{docId} untuk Admin.
- Error permission Planning sekarang tampil jelas di halaman Order Planner.
- Qty / batch dan Qty / pcs memakai input + unit dalam satu kotak agar sejajar dan responsive.
- Script deploy:rules dan deploy:all ditambahkan supaya Rules tidak terlupa.

DEPLOY YANG DISARANKAN
1. Pastikan folder ini adalah clone repo Lucverid/sowork (ada folder .git).
2. npm.cmd install
3. npm.cmd run build
4. npm.cmd run deploy:rules
5. npm.cmd run deploy

Atau setelah dependency terpasang (disarankan):
  npm.cmd run deploy:all

Urutan deploy:all sengaja Rules dulu baru GitHub Pages. Kalau deploy Rules gagal, versi web baru tidak ikut dipublish sehingga tidak terjadi mismatch lagi.

PENTING:
- npm run deploy hanya mengirim dist ke branch gh-pages. Itu TIDAK mengubah Firestore Rules.
- Setelah deploy rules, refresh SoWork lalu buka Order Planner. Warning permission harus hilang dan Recipe bisa disimpan.
- Commit/push source v1.8.3 ke branch main juga, supaya main dan gh-pages tidak berbeda baseline.
