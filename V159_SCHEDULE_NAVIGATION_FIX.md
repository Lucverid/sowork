# SoWork v1.5.9 — Schedule Navigation Reliability

- Mengembalikan navigasi shell ke mekanisme rebuild penuh seperti versi klasik yang stabil.
- Menghapus ketergantungan navigasi pada shell incremental/reuse saat pindah halaman.
- Menambahkan error boundary khusus Jadwal: bila renderer utama gagal, jadwal tetap dibuka dalam mode aman.
- UI/flow Jadwal klasik v1.3.x dipertahankan; Sheet-ready (Import) dan Export lengkap tetap tersedia.
- Fix Stock Opname historis, Waste CRUD, Telegram, dan fitur v1.5.x lain tetap dipertahankan.
- Cloudflare Worker tidak berubah.
