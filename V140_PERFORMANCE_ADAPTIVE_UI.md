# SoWork v1.4.0 — Performance + Adaptive UI

Fokus versi ini adalah memperbaiki rasa lambat, bug search/filter barang, dan tata letak agar lebih efisien di HP maupun desktop tanpa mengubah alur data utama SoWork.

## Perubahan utama

- Shell aplikasi tidak lagi dibangun ulang setiap snapshot realtime. Sidebar/topbar dipertahankan dan hanya halaman aktif yang dirender ulang bila datanya memang relevan.
- Snapshot Firestore yang datang berdekatan digabung ke satu frame render untuk mengurangi render berturut-turut.
- Draft form dan fokus input dipertahankan ketika update realtime masuk, sehingga input yang sedang diketik tidak mudah hilang/reset.
- Search Stock tidak lagi memanggil render ulang halaman pada setiap karakter. Filter dilakukan langsung pada row yang sudah ada di DOM.
- Search Stock Opname juga menggunakan filter langsung pada card, termasuk pencarian nama + kategori dan counter hasil.
- Stock Opname hanya menyimpan item yang sedang lolos filter ketika tombol Simpan ditekan, konsisten dengan perilaku filter sebelumnya.
- Normalisasi pencarian dibuat lebih toleran terhadap huruf besar/kecil, spasi ganda, dan karakter beraksen.
- Penggunaan stok harian membaca dokumen Firestore secara paralel per gelombang, menggantikan pola baca per barang secara berurutan.
- Listener Waste dipisahkan antara master item dan data harian dengan query `type`, sehingga masing-masing listener tidak perlu menerima seluruh collection Waste.
- Mobile navigation diringkas menjadi Home, Jadwal, Daily Check, Stock, dan Menu. Modul admin lain berada di bottom sheet Menu.
- Tabel Stock dan Order Planner berubah menjadi card list pada layar <= 860px agar tidak perlu horizontal scroll.
- Spacing, panel, metric card, action area, dan halaman Stock dibuat lebih padat/adaptif di desktop dan mobile.
- Long list tertentu menggunakan `content-visibility` bila browser mendukung agar rendering awal lebih ringan.

## Validasi yang dilakukan

- Seluruh file JavaScript di `src/` dan `cloudflare-worker/src/` lolos `node --check`.
- Build Vite penuh tidak dijalankan di environment revisi karena dependency npm tidak tersedia/selesai dipasang di container. Jalankan `npm install` lalu `npm run build` di environment lokal/deploy seperti biasa.

## Catatan kompatibilitas

Tidak ada perubahan schema Firestore pada versi ini. Struktur collection dan fitur Telegram/Cloudflare tetap dipertahankan.
