SoWork v1.7.2 — Crew Delete

Yang baru:
- Setiap crew di Rules Jadwal sekarang punya tombol Hapus.
- Hapus hanya mengeluarkan crew dari rules/generator.
- Histori jadwal lama crew tersebut TIDAK dihapus.
- Nama crew otomatis dibersihkan dari Crew Libur Senin–Minggu.
- Minimal satu baris crew tetap harus ada.
- Setelah menghapus, tekan Simpan Rules agar perubahan permanen.

Cara update:
1. Replace file berikut di project SoWork:
   - src/main.js
   - src/style.css
   - package.json
   - package-lock.json
2. Commit + push ke main.
3. GitHub Pages akan auto-deploy.
4. Cloudflare Worker dan Apps Script tidak perlu deploy ulang untuk patch ini.
