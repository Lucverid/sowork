# SoWork v1.2.4 — Responsive Layout Fix

Perbaikan:
- Sidebar desktop tidak lagi bocor keluar viewport saat tinggi layar pendek.
- Area menu sidebar memiliki scroll sendiri; account card tetap di bawah.
- Tablet <= 860px memakai mobile shell/bottom navigation.
- Grid metric menjadi 2 kolom pada tablet dan 1 kolom pada HP kecil.
- Page intro, panel header, action row, tabel, Stock, Waste, Reports, dan Data Hub lebih aman terhadap overflow.
- Breakpoint mempertimbangkan lebar DAN tinggi layar.
- Script `npm.cmd run deploy` sudah membawa remote GitHub Pages `Lucverid/sowork`, jadi fresh ZIP tidak perlu `.git` untuk deploy branch gh-pages.
