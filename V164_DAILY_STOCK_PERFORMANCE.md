# SoWork v1.6.4 — Daily Stock Performance Fix

Fokus versi ini hanya mempercepat **Pemakaian Stok Harian** tanpa mengubah modul Jadwal, Google Sheet, Waste, Telegram, Stock Opname, atau autentikasi.

## Perubahan utama
- Save tidak lagi melakukan `getDoc()` untuk movement + item pada setiap barang.
- Pembanding qty lama, stok saat ini, dan tanggal SO diambil dari state realtime yang sudah ada di client.
- Hanya barang yang berubah yang ditulis ke Firestore.
- Nilai `0` tidak lagi membuat dokumen movement baru.
- Jika qty lama diubah menjadi `0`, movement lama dihapus dan stok dikembalikan sesuai selisih.
- Satu marker `DAILY_USAGE_DAY` per tanggal menjaga kalender tetap tahu bahwa tanggal sudah dicek, termasuk hari dengan semua qty 0.
- Catatan umum disimpan pada marker tanggal dan tetap tampil saat tanggal lama dibuka.
- Tombol save menampilkan jumlah perubahan yang benar-benar diproses.

## Dampak performa
Contoh 50 master barang dan hanya Black Tea berubah 5 → 6:
- Lama: sekitar 100 reads + puluhan writes.
- v1.6.4: 0 individual reads saat submit, 1 movement write + 1 item update + 1 marker write.

Data movement lama tetap kompatibel. Saat tanggal lama disimpan ulang, dokumen qty 0 legacy dibersihkan bertahap hanya untuk item yang disentuh oleh proses save.
