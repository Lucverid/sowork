# AutoBudgetin v27.5.3 SAFE — rebuild dari base v27.4.0

Versi ini **bukan kelanjutan patch v27.5.1/v27.5.2 yang menumpuk di core**.
Ia dibangun ulang dari file shell **v27.4.0 Stability + Polish** yang terbukti bisa dipakai, lalu fitur v27.5 dimasukkan sebagai modul terpisah.

## Core yang dipertahankan 1:1 dari v27.4.0
- struktur `index.html`, navigasi bawah, Firebase/local snapshot, Planning feature switcher;
- `v24-5-automation.js` dan `v25-features.js` **tidak disentuh**;
- service worker memakai logika stabil v27.4.0, hanya nama cache dan cache-buster tracking yang diganti.

## Fitur baru yang tetap masuk
- profit aktual per hari;
- heatmap kalender penjualan;
- target adaptif;
- ringkasan 7 hari;
- faktor penjualan (promo/hujan/ramai/libur/stok terbatas/dll.);
- chart Pcs / Omzet / Profit;
- indikator keamanan cicilan;
- penjualan 0 pcs sebagai data valid;
- biaya restock ikut modal/BEP;
- CRUD restock + dukungan Telegram backend.

## Sengaja TIDAK dibawa dari patch yang bikin regresi
- perubahan pada `v24-5-automation.js`;
- perubahan pada `v25-features.js`;
- emergency mutation/recovery logic di core `index.html` v27.5.2.

Tujuannya: fitur v27.5 tetap ada, tetapi fondasi aplikasi tetap v27.4.0.

## File GitHub yang ditimpa
1. `index.html`
2. `service-worker.js`
3. `v27-tracking.js`
4. `v27-tracking.css`

`telegram-database-backend.gs` disertakan. Jika Apps Script kamu **sudah memakai backend v27.5.1**, tidak perlu deploy ulang karena logika backend di paket ini sama. Jika masih v27.5.0/v27.1, tempel file ini dan deploy New version.

## Setelah upload
Tutup semua tab AutoBudgetin, buka ulang URL GitHub Pages, lalu refresh sekali supaya cache `v27.5.3-safe-v274-base` aktif. Jangan upload `v24-5-automation.js` atau `v25-features.js` dari patch v27.5.1 lama.

## Safe bridge
`v27-safe-bridge.js` hanya melakukan dua hal terisolasi:
- mengembalikan fungsi Backup JSON schema v27 milik core v27.4 jika modul v25 lama menimpanya;
- memastikan Factory Reset ikut menghapus Decision Lab/Tracking v27.

Bridge ini **tidak** menyentuh saldo, transaksi, navigasi, Firestore listener, chart utama, atau kalkulasi dashboard.
