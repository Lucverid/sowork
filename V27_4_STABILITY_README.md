# AutoBudgetin v27.4.0 — Stability + Polish (2-file patch)

Base: v27.3.1 (which already contains the v27.2/v27.1 tracking stack).

Upload/replace only:
1. `index.html`
2. `service-worker.js`

## What changed
- Feature switcher no longer auto-scrolls on every DOM update (less jitter).
- Switching features now triggers a safe responsive resize so hidden charts/cards redraw correctly when shown.
- Keyboard navigation added for feature tabs (Left/Right/Home/End).
- “Semua fitur” sheet restores focus when closed.
- PWA cache install is resilient: one optional missing asset no longer cancels the entire offline service worker.
- Core app shell is still mandatory and fetched fresh on install.
- Old AutoBudgetin caches are cleaned without touching unrelated cache names.
- Navigation falls back to offline shell faster on poor/offline connections.

## Not changed
No calculation logic, Decision Lab data, v27 tracking data, CRUD, backup schema, Firebase collections, or Telegram backend logic was changed.
No Apps Script redeploy is required if v27.1 Telegram backend is already deployed.
