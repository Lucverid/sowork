# SoWork v0.7 — Carton Conversion + Automatic WhatsApp

## Konversi Karton
- Master barang menyimpan satuan dasar dan `cartonSize`.
- Stock ditampilkan sebagai karton + satuan lepas, sambil tetap menyimpan total dalam satuan dasar.
- Barang Masuk menerima input jumlah karton + jumlah lepas dan otomatis mengkonversi ke stok dasar.
- Order Planner menampilkan rekomendasi dalam karton + satuan lepas.
- SO tetap diinput dalam satuan dasar per lokasi, dan total menampilkan konversi karton secara live.

Contoh: 1 karton = 24 PCS, input 2 karton + 5 PCS → current stock bertambah 53 PCS.

## Auto WhatsApp
Folder `functions/` berisi Cloud Function `autoStockWhatsappAlert`.
Trigger berjalan ketika `items/{itemId}` berubah dan mengirim template WhatsApp ketika status menyeberang ke Kritis (atau Menipis jika diaktifkan).

Auto WhatsApp membutuhkan:
1. Firebase Blaze plan.
2. WhatsApp Business Platform Cloud API.
3. Meta Phone Number ID.
4. Meta Access Token disimpan sebagai Firebase Secret.
5. Approved WhatsApp message template.

### Template yang diharapkan
Nama default: `stock_alert_sowork`
Bahasa default: `id`
Body dengan 4 parameter:

`⚠️ Stok {{1}} masuk status {{2}}. Sisa: {{3}}. Saran order: {{4}}. Mohon cek SoWork.`

### Secrets
Dari root project:

```bash
firebase functions:secrets:set META_WA_TOKEN
firebase functions:secrets:set META_PHONE_NUMBER_ID
```

Lalu deploy:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

Saat deploy pertama, Firebase akan meminta `META_GRAPH_VERSION`. Isi versi Graph API yang tampil di panel Meta WhatsApp Getting Started.

> Jangan pernah taruh Meta access token di `src/`, browser, GitHub, atau screenshot publik.
