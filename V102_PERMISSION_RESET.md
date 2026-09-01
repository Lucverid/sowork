# SoWork v1.0.2 — Permission Reset

## Perubahan utama
Semua permission Admin sekarang menggunakan Firebase Auth UID langsung:

`uTBNtKIL3iTHx1JGg1AHwM5HLYi2`

Ini menggantikan pola lama yang mengecek Admin melalui:
`get(/users/{request.auth.uid})`

Tujuannya:
- menghilangkan permission chain yang menyebabkan `Missing or insufficient permissions`
- membuat akses Admin konsisten di semua modul
- tetap mempertahankan Viewer sebagai read-only untuk Jadwal dan Daily Checklist

## Viewer
Viewer tetap harus memiliki document:
`users/{uid}`

dengan:
- `role: "viewer"`
- `active: true`

Viewer hanya bisa READ:
- schedules
- scheduleRules
- dailyChecklists
- checklistCompletions

## Admin
UID Admin utama:
`uTBNtKIL3iTHx1JGg1AHwM5HLYi2`

Admin mendapat CRUD ke seluruh collection operasional.

## WA Alert
`stockAlertEvents` tetap read-only dari client.
Nanti Cloud Function / Admin SDK yang menulis event WhatsApp.

## WAJIB
Setelah membuka project v1.0.2:
1. Copy seluruh isi `firestore.rules`
2. Firebase Console → Firestore → Rules
3. Replace rules lama
4. Klik Publish
5. Logout SoWork
6. Login ulang
