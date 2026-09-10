# GitHub Auto Deploy

SoWork v1.5.0 menyertakan `.github/workflows/deploy.yml`.

Setelah file workflow ini ada di branch `main`, setiap push/upload perubahan ke `main` akan:
1. menjalankan `npm ci`,
2. menjalankan `npm run build`,
3. mengirim isi `dist` ke branch `gh-pages`.

GitHub Pages tetap memakai branch `gh-pages`. Tidak perlu menjalankan VS Code/PowerShell untuk deploy berikutnya.

Jika workflow tidak berjalan, buka tab **Actions** di repo dan pastikan GitHub Actions diizinkan untuk repository tersebut.
