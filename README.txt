SoWork v1.6.6 — Auth Recovery

Base: source yang sedang dideploy (v1.6.4 + Apps Script/merge fix v1.6.5).

Perubahan:
- Firebase login memakai browserLocalPersistence secara eksplisit.
- auth/network-request-failed otomatis dicoba ulang maksimal 3 kali.
- Tombol login dikunci selama proses agar tidak mengirim request ganda.
- Status retry tampil di halaman login.
- Error network dibuat lebih jelas.
- Apps Script v1.6.5 dan merge 2-row tidak diubah.

Upload ke GitHub sesuai path:
1. src/auth/auth.js
2. src/main.js
3. package.json
4. package-lock.json

Setelah commit, tunggu GitHub Actions selesai lalu Ctrl+F5.

Catatan:
Jika jaringan/DNS/VPN/ISP benar-benar memblokir endpoint Firebase Auth,
retry dari aplikasi tidak bisa menembus blokir eksternal. Patch ini fokus pada
transient network failure dan persistence browser.
