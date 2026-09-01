# SoWork v0.8 v0.5

Versi ini menambahkan Schedule Operations: CRUD langsung per sel, role kerja, lembur, history lembur, dan export Excel/Google Sheets-compatible.

## Workflow lokal
```powershell
npm.cmd install
npm.cmd run dev
```

Klik sel jadwal sebagai Admin untuk edit/hapus. Gunakan tombol **+ Tambah** untuk create assignment dan **Export Excel** untuk menghasilkan workbook berwarna.

> Catatan: v0.4 menambah dependency `xlsx-js-style`, jadi jalankan `npm.cmd install` setelah extract versi ini.

---

# SoWork v0.3

Fondasi awal aplikasi operasional kerja berbasis Firebase.


## Auto Scheduler v0.3
- Jadwal utama otomatis tanggal 1–25.
- Opsi transisi 26 bulan sebelumnya → 25 bulan target.
- Crew & gender editable dari halaman Jadwal.
- Rotasi libur editable + saran rotasi periode berikutnya.
- Rules Jumat, Middle, S2 pria, weekend 3 S2, dan Lembur manual.
- Preview + fairness score sebelum disimpan.

## Sudah tersedia
- Firebase Authentication Email/Password
- Register akun Viewer
- Role `admin` / `viewer`
- Viewer hanya dapat melihat Jadwal + Daily Checklist
- Admin dapat CRUD Jadwal + Daily Checklist
- Menu Admin untuk Stock, SO, Order, Waste, Kalkulator, Laporan, Settings sudah disiapkan
- Firestore persistence / offline cache
- Firestore Security Rules role-based
- Responsive desktop + mobile

## 1. Aktifkan Firebase Authentication
Firebase Console → Authentication → Sign-in method → Email/Password → Enable.

## 2. Buat Cloud Firestore
Firebase Console → Firestore Database → Create database.

Jangan biarkan production app memakai rules "allow read, write: if true".

## 3. Install dan jalankan
```bash
npm install
npm run dev
```

## 4. Buat akun Admin pertama
Karena registrasi client SELALU membuat role `viewer`, lakukan:

1. Buka app.
2. Daftar menggunakan email pribadi Anda.
3. Firebase Console → Firestore Database → collection `users`.
4. Buka document UID akun Anda.
5. Ubah field `role` dari:
   `viewer`
   menjadi:
   `admin`

Setelah refresh/login ulang, menu Admin akan terbuka.

Ini disengaja supaya user tidak bisa mendaftarkan dirinya sendiri sebagai admin.

## 5. Deploy Firestore Rules
Install Firebase CLI jika belum:
```bash
npm install -g firebase-tools
firebase login
firebase use sowork-ab04d
firebase deploy --only firestore:rules
```

Jika project belum di-add ke CLI:
```bash
firebase use --add
```
Pilih project `sowork-ab04d`.

## 6. Build
```bash
npm run build
```

## 7. Deploy Firebase Hosting
```bash
firebase deploy --only hosting
```

## Database awal
- `users`
- `schedules`
- `dailyChecklists`

Collection yang sudah diproteksi untuk modul berikutnya:
- `crew`
- `scheduleRules`
- `items`
- `stockMovements`
- `stockOpnames`
- `purchaseOrders`
- `waste`
- `personalReports`
- `auditLogs`
- `settings`

## Security
Firebase Web API Key bukan private secret. Yang tidak boleh dibagikan:
- Service Account JSON
- Private key
- password akun
- secret server-side


## v0.5
- Role Fairness Engine (Shift + Role + Total Score)
- Daily Checklist per shift/role dengan auto assignment dari jadwal
- Completion harian tersimpan di Firestore
- Admin CRUD, Viewer read-only

> Penting: publish ulang `firestore.rules` v0.5 karena ada collection baru `checklistCompletions`.

## v0.6 Stock Intelligence
Menu Stock, Stock Opname, dan Order Planner sekarang aktif. Jika master masih kosong, buka **Stock → Muat Referensi SO Agustus** untuk seed awal dari file referensi.

Alur yang disarankan:
1. Import referensi sekali.
2. Edit threshold/item krusial di Master Stock.
3. Set nomor WA melalui **Alert WA**.
4. Catat setiap kiriman melalui **+ Barang Masuk** beserta tanggal diterima.
5. Lakukan Stock Opname rutin agar prediksi pemakaian/order makin akurat.


## v0.7
Lihat `V07_CARTON_WHATSAPP.md` untuk konversi karton dan setup auto WhatsApp Cloud API.


## v0.8 Stock UX & Predictive Reorder
- Stock Opname diubah dari tabel lebar menjadi card responsif.
- Admin dapat tambah/edit/hapus/rename master barang langsung dari Stock maupun Stock Opname.
- Threshold Kritis dan Menipis dapat diatur per barang.
- Item krusial dapat ditandai per master barang.
- Prediksi mulai muncul setelah minimal 2 snapshot SO berbeda tanggal.
- 2 snapshot = estimasi awal; 3-4 = cukup; 5+ = baik.
- Menampilkan estimasi tanggal stok habis dan tanggal order paling lambat.
- Estimasi penggunaan menggunakan maksimal 3 interval SO terbaru, dengan bobot lebih besar ke interval terbaru.


## v0.9
- Waste bulanan + referensi Juli
- Laporan Pribadi
- Kalkulator Kerja
- Settings Admin

Setelah upgrade, publish `firestore.rules` terbaru agar collection `wasteItems` dan `wasteMonths` dapat dipakai Admin.


## v1.0 UI Polish
Visual refresh: sidebar navy, icon SVG, emerald/amber accents, refined cards/forms/tables/modals, and improved responsive mobile navigation. Tidak ada perubahan Firebase Rules.


## v1.0.2 Permission Reset
Firestore Admin permission sekarang berbasis UID langsung. Publish `firestore.rules` terbaru sebelum tes Waste/Stock/Settings.


## v1.2.1 Free Telegram
Telegram sekarang memakai Cloudflare Worker + D1 Free. Firebase Functions tidak dipakai lagi. Ikuti `TELEGRAM_SETUP.md`.
