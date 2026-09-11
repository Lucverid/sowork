# SoWork v1.6.3 — Verified Google Sheet iframe bridge

- Replaces JSONP/status polling with a hidden iframe + `window.postMessage()` bridge.
- Avoids Apps Script ContentService redirect/CORS/JSONP failures.
- Test Connection and Send Schedule now receive the real Apps Script result.
- Wrong secret, inaccessible spreadsheet, or write failure returns an error; success only appears after `ok:true`.
- Apps Script must be updated to this version and redeployed as a **New version** with Execute as **Me** and access **Anyone**.
