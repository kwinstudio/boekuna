# BOEKUNA iOS local-first: baseline audit

Date: 2026-10-08. Branch `claude/ios-local-first-7j8ffv`, built on PR #280 (`claude/ios-testflight-y46ik1`, commit `6fc0049`), which carries the iOS code of #223/#277 on top of `main` `b4af2de`.

## Repository identity

| Check | Result |
|---|---|
| Remote | `https://github.com/kwinstudio/boekuna` |
| Root `README.md` | Still says "DJ Booking Platform" (leftover from an older project). **Not** a sign of the wrong repo. |
| Actual BOEKUNA source | `kwinest/index.html` (app, built by `scripts/build-app.mjs`), `public/` (website), `kwinest/docprocessor/` (OCR + Document Intelligence, Python), `supabase/` (database, edge functions), `ios/` (on #280), `mobile/` (Android, on #279) |
| Verdict | **VERIFIED**: correct source of truth. Work continued. |

"BOEKUNA Elite Agent Skillmap v3.0" is not in the repository; the brief itself was used.

## Architecture as found

The iPhone app is **not** a native rewrite and not Capacitor: it is a small SwiftUI shell (`ios/Boekuna/`) with one `WKWebView` that opens `https://app.boekuna.nl/?login=1&app=1`. Everything the user sees (login, Bonnetjes, review screens, VAT) is the web app. Native code today: navigation policy (blocks Stripe/purchase pages), print bridge (`boekunaPrint`), download-to-share sheet, alerts. Android (#279) is a Capacitor shell around the same URL.

Document flow for a signed-in user (`startPersistentDocumentProcessingQueue` in `kwinest/index.html`):
1. File chosen through the system picker (`<input type=file>`; on iOS: camera, photo library or Files).
2. Uploaded to Supabase Storage `kwinest-documents/<user id>/<client_ref>-<name>` (RLS per user).
3. Row in `documents`, then edge function `document-processing` action `enqueue` (idempotent per document).
4. Render service `kwinest-docprocessor`: RapidOCR PP-OCRv6 (ONNX), PDF text, Document Intelligence V6, financial validation.
5. Result back via Realtime/poll; the user reviews (`openPersistentDocumentReview`) and saves.

Authoritative financial logic: server `kwinest/docprocessor/document_intelligence.py`, `financial_blocks.py`, `receipt_math.py`, plus the review/save rules in the web app. Browser OCR (Tesseract from a CDN) only exists in the test-mode/legacy fallback path.

## Classification

| Area | Status | Notes |
|---|---|---|
| Login, session (Supabase in WKWebView) | EXISTS AND WORKS | Web-based; persisted in the default WebKit data store. |
| Logout, account deletion | EXISTS AND WORKS | Web-based; local copy removed after a confirmed cloud save. |
| Camera / photo / file import | EXISTS AND WORKS | System file picker from `<input type=file>`; no document-scanner UI (no edge detection, no multi-page). |
| Document upload and server OCR | EXISTS AND WORKS | V6 live; V5 benchmark 28/28 documents fully correct with RapidOCR. |
| Review of uncertain fields | EXISTS AND WORKS | Existing review UI; user-confirmed values win. |
| PDF preview, download, share | EXISTS AND WORKS | Download becomes the iOS share sheet; print bridge for reports. |
| On-device OCR | MISSING | |
| Document scanner (VisionKit) | MISSING | |
| Local PDF text/scan detection | MISSING (native) | Only server-side and in the browser fallback. |
| Offline document capture | MISSING | Offline upload fails with a network error; nothing is kept. |
| Offline app start | MISSING | Without a connection the shell shows "Boekuna kan niet laden". |
| Background sync | MISSING | Server-side jobs resume on reconnect; the client keeps nothing to resend. |
| Signed TestFlight build | BLOCKED | #280 workflow ready; GitHub Secret `ASC_KEY_P8` is empty, so the release job fails at "Check signing access" (same on #280). |
| Real-device behaviour | NOT VERIFIED | No iPhone available to this session. |

## Decisions taken

- Improve the existing shell; no rewrite, no second OCR engine on the server, no second parser.
- Native features in Swift, exposed to the web app through a message bridge limited to the main frame of `https://app.boekuna.nl`.
- Everything behind build setting `BOEKUNA_LOCAL_FIRST` (default `NO`) plus a web kill switch.
- Online uploads keep using the server pipeline unchanged. On-device OCR is used for offline drafts and benchmarked against the server; it does not replace server OCR (see release report for why).
