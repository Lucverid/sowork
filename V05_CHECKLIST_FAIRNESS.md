# SoWork v0.5 — Role Fairness + Daily Checklist

## Role Fairness Engine
- Generator tetap menyeimbangkan S1 / Middle / S2.
- Role Kasir, Bar, Kitchen - Bar sekarang ikut dihitung.
- Mengurangi role yang sama berulang pada crew yang sama.
- Shift berisi 3 crew akan diusahakan punya Kasir + Bar + Kitchen-Bar.
- Middle tidak pernah Kasir.
- Dashboard fairness menampilkan Shift Score, Role Score, Total Score, dan tabel distribusi tiap crew.

## Daily Checklist
- Template checklist dibuat per shift: S1, Middle, S2, atau General.
- Tipe assignment: Role, Any, atau Specific Crew.
- App membaca jadwal di tanggal terpilih lalu menentukan penanggung jawab otomatis.
- Assignment `Any` dibagi berdasarkan jumlah task hari itu agar tidak menumpuk ke satu crew.
- Role assignment mengikuti role jadwal harian.
- Middle + Kasir ditolak.
- Admin bisa CRUD template dan checklist status selesai.
- Viewer hanya read-only.
- Progress harian tersimpan di collection `checklistCompletions`.
- Template lama OPENING/MIDDLE/CLOSING/GENERAL tetap dibaca dan dimigrasikan secara kompatibel di UI.

## Firestore
Rules v0.5 menambahkan akses read untuk Viewer pada `checklistCompletions`, write hanya Admin. `scheduleRules` juga bisa dibaca Viewer agar tampilan jadwal mengikuti crew/rules terbaru.
