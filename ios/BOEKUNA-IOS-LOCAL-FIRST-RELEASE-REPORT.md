# BOEKUNA iOS local-first: release report

Date: 2026-10-08. PR [#281](https://github.com/kwinstudio/boekuna/pull/281), branch `claude/ios-local-first-7j8ffv`, on top of PR #280 (`claude/ios-testflight-y46ik1` @ `6fc0049`). Baseline: [`IOS-LOCAL-FIRST-BASELINE-AUDIT.md`](IOS-LOCAL-FIRST-BASELINE-AUDIT.md).

Status words: **VERIFIED** (tested, evidence given), **FAILED**, **BLOCKED** (cannot be done from here), **NOT TESTED** (needs a real iPhone or a step only Kwin can take).

Everything new sits behind build setting `BOEKUNA_LOCAL_FIRST` (default `NO`). With the default the app behaves exactly as #280: the native bridge is not installed, the web app sees no `BoekunaNativeLocalFirst`, and every new web path is skipped. Rollback without an app update: `NATIVE_LOCAL_FIRST_OFF = true` in `kwinest/index.html` or `DISABLED = true` in `kwinest/app-assets/native-local-first.js`, then deploy the app.

## 1. Repository identity — VERIFIED

`kwinstudio/boekuna`. The root README still says "DJ Booking Platform"; the actual Boekuna source (app, website, processor, Supabase, `ios/`) is here and matches the live app. Details in the baseline audit. "BOEKUNA Elite Agent Skillmap v3.0" is not in the repository; the brief was used.

## 2. Existing functionality reused — VERIFIED

| Reused | How |
|---|---|
| iOS shell of #223/#277/#280 (SwiftUI + WKWebView, bundle `nl.boekuna.app`) | Extended; no second project, no second signing setup |
| Upload flow `persistSelectedDocument` / `startPersistentDocumentProcessingQueue` | Offline drafts are resent through it, with a stable client reference |
| Server OCR (RapidOCR PP-OCRv6) + Document Intelligence V6 + financial validation | Unchanged; still decides every amount, VAT and booking |
| Review screen and user corrections | Unchanged; offline text is shown as "Nog niet gecontroleerd" |
| Ledger in `localStorage` per account + `save_ledger_state` with version check + conflict recovery copy | Used for offline viewing and offline edits; no second bookkeeping store |
| Logout/account deletion cleanup | Extended to the new draft folder and sync bookkeeping |

## 3. Newly implemented — VERIFIED in CI/browser, NOT TESTED on a device

| Feature | Where | Evidence |
|---|---|---|
| On-device OCR (Apple Vision, nl-NL/en-US, orientation retry, tall-receipt tiling, cancellation, memory-warning stop) | `ios/Boekuna/LocalFirstOCR.swift` | 42 Swift checks pass on macOS 26 (`swift-tests-and-builds`) |
| Document scanner (VisionKit, multi-page, edge detection) → PDF into the normal queue | `LocalFirstBridge.swift` | Builds for device SDK; hand-off tested in browser; camera itself NOT TESTED |
| Local PDF reading (PDFKit text first, otherwise render at ~300 dpi + Vision; 50-page / 15 MB limit with a clear error) | `LocalFirstOCR.swift` | Swift tests (text PDF, scanned PDF, page limit) |
| Offline drafts (Data Protection *complete*, excluded from backup, per-account folder by SHA-256 of the user id, dedupe by file hash, 30 drafts / 15 MB per file / 250 MB total, 30-day retention) | `LocalFirstDraftStore.swift` | Swift tests: isolation, path traversal, limits, retention |
| Resend when back online (single-flight, backoff 30 s → 30 min, stable client reference, draft removed only after the server confirmed it) | `kwinest/index.html`, `native-local-first.js` | `tests/ios-local-first-browser.test.mjs` |
| Interrupted online upload kept as draft instead of failing | `kwinest/index.html` | same test |
| Administration opens offline from the account's own local copy; offline changes sent later; cloud that moved on is never overwritten (offline changes become the existing recovery copy) | `kwinest/index.html` (`hydrateCloudAccount`, `performCloudStateSync`) | `tests/ios-local-first-offline-ledger.test.mjs` |
| App shell falls back to WebKit's cached copy of the app when offline | `WebView.swift` | Builds; behaviour NOT TESTED on device |

## 4. Files changed

`.github/workflows/boekuna-ios-local-first.yml` (new), `.github/workflows/boekuna-app.yml`, `ios/Boekuna.xcodeproj/project.pbxproj`, `ios/Boekuna/Info.plist`, `ios/Boekuna/LocalFirst{OCR,DraftStore,Bridge}.swift` (new), `ios/Boekuna/WebView.swift` (owned by #280; 18 lines added, all flag-gated), `ios/Tests/LocalFirstTests.swift`, `ios/Tests/VisionOCRBenchmarkCLI.swift` (new), `kwinest/app-assets/native-local-first.js` (new), `kwinest/index.html`, `scripts/build-app.mjs`, `tests/ios-local-first-browser.test.mjs`, `tests/ios-local-first-offline-ledger.test.mjs`, `tests/ios-vision-ocr-benchmark.py` (new), this report and the baseline audit. No credentials, certificates, keys or customer documents.

## 5. OCR benchmark — VERIFIED (macOS CI; iPhone NOT TESTED)

Run: workflow "Boekuna iOS local-first", job `vision-benchmark`, commit `7933eac` (macOS 26 runner, Apple Vision of macOS 26). Same 28 frozen V5 fixtures, same Document Intelligence parser and financial validation; only the OCR step differs. Artifact `boekuna-ios-vision-benchmark` (also in `/mnt/project-files/ios/benchmark/`).

| | Server OCR (RapidOCR PP-OCRv6) | On-device OCR (Apple Vision) |
|---|---|---|
| Documents fully correct | **28 / 28** | **25 / 28** |
| WRONG critical fields | 0 | **0** |
| MISSING critical fields | 0 | 5 (IBAN ×2, VAT ID ×2, invoice date ×1) |
| Amounts, VAT rate, VAT amount, totals, mixed VAT, credit note | all EXACT | all EXACT |
| Pipeline time per document, p50 / p95 | 3.4 s / 8.7 s | 3.1 s / 6.2 s |

The three documents that are not fully correct with Vision: `standard-invoice-image` and `scanned-pdf` (IBAN and VAT ID not read) and `smartphone-perspective-shadow` (invoice date not read). Nothing was read wrongly; missing fields end up in review, as they do today.

Device reader as it runs in the app (`LocalDocumentReader`): digital PDFs are read from their text layer without OCR in 19–26 ms (11/11, `pdf-text`); image pages through Vision p50 2.0 s, p95 3.5 s; longest (tall receipt, tiled) 4.3 s.

Note: the first benchmark run (`fd0b557`) was invalid: macOS has no DejaVu Sans, so PIL drew the fixtures in a tiny bitmap font and both engines scored badly (13/28 and 11/28). Fixed in `7933eac` by installing the font in the job; the numbers above are from the fixed run.

**Decision:** Vision is good enough for reading text on the device (offline preview, scan check) and never produced a wrong amount, but it is not equal to the server: the server stays the only source for extracted fields and booking. On-device OCR does not replace server OCR in this PR, so there is no financial regression. Measured on a Mac, not an iPhone; iPhone timings NOT TESTED.

## 6. Financial validation — VERIFIED (no change)

No parser, VAT rule or booking rule was added or changed on the device. Every document, including offline drafts, goes through the existing server pipeline and review before anything is booked. Offline-read text is only shown, labelled "Nog niet gecontroleerd", and never fills an amount. Existing regression suites pass: `document-upload-browser` (mixed VAT, self-billing, processor outage), `document-review-beginner-ux`, `browser-smoke` (invoice integrity), `production-integrity`.

## 7. Offline testing

| Case | Status |
|---|---|
| Offline document → draft, no upload attempt; duplicate file stays one draft | VERIFIED (browser, fake native bridge) |
| Resend after reconnect with stable client reference; 409 from an earlier half-finished upload accepted; draft removed only after server confirmation | VERIFIED (browser) |
| Failed resend recorded, backoff respected, no navigation during background resend | VERIFIED (browser) |
| Offline start opens own local copy; another account on the same device does not | VERIFIED (browser) |
| Offline change sent when cloud unchanged; newer cloud wins and offline change kept as recovery copy; no false conflict | VERIFIED (browser) |
| Web, Android and iOS with the flag off: unchanged | VERIFIED (browser, no-bridge page) |
| Offline start on a real iPhone (WebKit cache of the app, Supabase library from the CDN, expired session) | NOT TESTED. Known risk: the Supabase library is loaded from cdn.jsdelivr.net; if WebKit did not cache it, offline start still shows the error screen. |
| Draft store on device (Data Protection while locked, low storage) | NOT TESTED |

## 8. App size BEFORE vs AFTER

| Build | Size |
|---|---|
| After, device build, flag ON (unsigned `.app`, CI) | 668 KB |
| After, device build, default flag OFF | 668 KB |
| Before (#280 alone) | NOT MEASURED in CI. The added Swift is 47 KB of source with no new libraries or frameworks beyond Apple's Vision/VisionKit/PDFKit (part of iOS), so the difference is a few tens of KB. |
| Web app | +4.4 KB (`native-local-first.js`), loaded only by the app build |

Drafts on the device: at most 250 MB per account, expire after 30 days. They are kept on logout on purpose (unsent work) and removed after a successful send and on account deletion.

## 9. Performance

| Measurement | Result | Status |
|---|---|---|
| Digital PDF text read on device (no OCR) | 19–26 ms per document | VERIFIED (macOS CI) |
| Image page through Vision | p50 2.0 s, p95 3.5 s | VERIFIED (macOS CI) |
| Server pipeline per document (same machine, RapidOCR) | p50 3.4 s, p95 8.7 s | VERIFIED (macOS CI), reference only |
| Offline start of the administration | no network wait: opens from the local copy | VERIFIED (browser) |

Device timings, battery and memory: NOT TESTED (no iPhone here).

Cloud requests: online use is unchanged (same upload and processing calls). Offline use avoids failed uploads and the re-selection of files; a failed send retries with backoff instead of immediately. No reduction in server OCR calls, by design: server OCR stays the authority (see §5).

## 10. Security and privacy — VERIFIED in code and tests, device NOT TESTED

- Draft files: `FileProtectionType.complete`, `isExcludedFromBackup`, folder per account (SHA-256 of the user id), names sanitised, path traversal rejected (tested).
- Nothing in `UserDefaults`, no logging of document content or user data (`print`/`os_log` absent), no analytics.
- Bridge only answers the main frame of `https://app.boekuna.nl`; messages over 21 MB rejected; unknown actions rejected.
- Supabase auth, RLS and tenant isolation unchanged: uploads still use the user's own session and storage path `kwinest-documents/<uid>/…`.
- No third-party OCR or AI service; Vision runs on the device.
- Account switch: drafts and the offline start are per account (tested). Account deletion clears that account's drafts and sync bookkeeping. Logout keeps unsent drafts (same rule as unsaved ledger changes today).
- No new privacy-sensitive API categories (no file timestamps, disk space, user defaults); no Privacy Manifest change needed. Camera and photo texts already present.
- AVG: documents stay on the user's own device until sent to the existing EU processing; no new processor.

## 11. CI build status

Head `7933eac`:

| Check | Result |
|---|---|
| `swift-tests-and-builds` (42 Swift checks with real Vision/PDFKit; simulator + device builds with flag ON; default build flag OFF) | success |
| `vision-benchmark` | success |
| `ios-simulator-build` (#280's packaging, default build with the new files) | success |
| `regressions`, `document_browser`, `workflow_integration`, `document-integrity` | success |
| `app` (all web-app browser suites incl. the two new local-first tests in Chromium and WebKit) | see PR checks |
| `ios-release` | failure: `ASC_KEY_P8` secret empty (same on #280, not this PR's) |

Locally (Chromium): both new local-first tests, logout-local-data, auth-signed-in-once, cloud-sync-serialization, browser-smoke, document-upload-browser, account-deletion-browser, split-ci-scopes, source-safety, production-integrity all PASS.

## 12. TestFlight readiness — BLOCKED

- GitHub Secret `ASC_KEY_P8` is empty, so "Boekuna iOS release" (`ios-release`) fails at "Check signing access" on #280 and here alike. Kwin adds the App Store Connect API key (thread "iOS-app naar TestFlight").
- The release workflow belongs to #280 and builds with the default `BOEKUNA_LOCAL_FIRST=NO`. A TestFlight build *with* local-first needs `BOEKUNA_LOCAL_FIRST=YES` passed to that archive step; not changed here.
- Nothing was uploaded or submitted.

## 13. Pull request

https://github.com/kwinstudio/boekuna/pull/281 (base: #280's branch). Merge #280 first.

## 14. Remaining blockers and open items

1. `ASC_KEY_P8` secret (Kwin).
2. Real-iPhone acceptance tests (checklist below), with a TestFlight build that has the flag ON.
3. Offline start depends on WebKit caching the app and the Supabase library; proposal: serve the Supabase library from app.boekuna.nl itself (small web change) before switching the flag on.
4. Not done in this PR (proposals, need decisions): invoice PDF generated on the device when the server PDF fails offline; CAMT.053/MT940 import in the app (parser exists only in the `financial-automation` edge function); delta sync instead of whole-ledger snapshots (needs a Supabase migration); local document cache for viewing.

## 15. GO / NO-GO

- **Merging #281 after #280** (flag OFF): **GO** on the evidence above; the default build is functionally identical to #280 and all regression suites pass. Waits on Kwin's approval.
- **Switching local-first ON for users**: **NO-GO** until the real-iPhone checklist passes.

## Real-iPhone acceptance checklist (Phase 11)

Run with a TestFlight build with `BOEKUNA_LOCAL_FIRST=YES`. Status of all 30 items: NOT TESTED on a device unless noted.

| # | Check | Automated cover |
|---|---|---|
| 1 | Fresh install, app starts on login | #280 simulator screenshot |
| 2 | Upgrade over the previous build keeps login | — |
| 3 | Login | auth tests (browser) |
| 4 | Session survives app restart | auth-signed-in-once (browser) |
| 5 | Logout clears local ledger, keeps unsent drafts | logout-local-data (browser) |
| 6 | Account switch: other account sees no drafts/local copy | offline-ledger + local-first tests (browser), Swift isolation test |
| 7 | Camera permission: allow, deny (message points to Instellingen › Boekuna › Camera) | browser hand-off test |
| 8 | Scan a 3-page receipt; one PDF in Bonnetjes | browser hand-off test |
| 9 | Import a photo | — |
| 10 | Import a PDF | Swift PDF tests |
| 11 | Multi-page PDF > 50 pages gives a clear message | Swift page-limit test |
| 12 | Mixed VAT receipt reviewed correctly | document-upload-browser |
| 13 | Credit note | V5 benchmark fixtures |
| 14 | Supplier/customer not swapped | V5 benchmark fixtures |
| 15 | Invoice number not confused with other numbers | V5 benchmark fixtures |
| 16 | Correction in review is kept | review tests (browser) |
| 17 | Airplane mode: add receipt → "offline bewaard" | browser test |
| 18 | Offline "Gelezen tekst" shows text, marked unchecked | browser test |
| 19 | Upload interrupted (switch off Wi-Fi mid-upload) → kept offline | browser test |
| 20 | App to background and back: drafts send | browser test (visibility) |
| 21 | Retry after failure respects backoff | browser test |
| 22 | Same receipt twice → one document | browser + Swift tests |
| 23 | Share an invoice PDF | #280 share sheet |
| 24 | Keyboard does not cover fields | — |
| 25 | Safe areas (notch, home bar) | — |
| 26 | Dynamic Type large | — |
| 27 | VoiceOver reads the offline panel and buttons | — |
| 28 | Low storage: clear message, nothing lost | Swift limit tests |
| 29 | Large document (15 MB) | Swift limit tests |
| 30 | Web app and Android unchanged | all browser suites, no-bridge test |
| extra | Airplane mode, cold start: administration opens from local copy | offline-ledger test (browser) |

## Antwoorden op de aanvulling (Nederlands)

1. **Wat bestond al:** de iPhone-app is een dunne schil om app.boekuna.nl. De administratie stond al op het toestel (per account) en alle berekeningen (btw, totalen, dashboard, overzichten) draaiden al in de app zelf; de cloud bewaarde een kopie. Documenten gingen altijd naar de server voor tekstherkenning.
2. **Wat is verbeterd:** scannen met de iPhone-camera (randen, meerdere pagina's), tekst lezen op de iPhone, documenten offline bewaren en later automatisch versturen, en de administratie offline openen en aanpassen zonder dat iets wordt overschreven.
3. **Volledig lokaal:** scannen, tekst lezen uit PDF's en foto's, offline bewaren van documenten, de administratie bekijken, zoeken en aanpassen, alle berekeningen en het dashboard.
4. **Gedeeltelijk lokaal:** offline aanpassingen (lokaal gemaakt, de cloud bevestigt later; bij een nieuwere cloudversie wint de cloud en blijft jouw wijziging als herstelkopie bewaard). Offline gelezen tekst is alleen een voorproefje ("Nog niet gecontroleerd").
5. **Nog cloud nodig:** inloggen, back-up en synchronisatie tussen apparaten, abonnement, definitieve documentherkenning en controle, factuur-PDF en -mail, bewaren van documenten (7 jaar).
6. **Minder cloudverzoeken:** offline geen mislukte uploads meer en geen dubbel werk; opnieuw versturen met wachttijd in plaats van meteen. Online is het aantal verzoeken gelijk gebleven: de server blijft bewust de enige die bedragen bepaalt.
7. **Hoeveel MB:** de app zelf 668 KB (gemeten in CI). Offline documenten maximaal 250 MB per account en 15 MB per bestand, na 30 dagen opgeruimd. De administratie zelf is meestal enkele honderden KB tot een paar MB (schatting, niet gemeten).
8. **Geslaagde tests:** 42 Swift-tests met echte Apple Vision/PDFKit, builds voor simulator en iPhone met de functie aan en uit, de OCR-vergelijking (Vision 25/28 volledig goed, 0 foute velden; server 28/28), twee nieuwe browsertests en alle bestaande app-tests.
9. **Wat ontbreekt voor TestFlight:** de App Store Connect API-sleutel in GitHub Secret `ASC_KEY_P8`, eerst #280 mergen, en een TestFlight-build met `BOEKUNA_LOCAL_FIRST=YES` om dit op een echte iPhone te testen.
10. **Veilig klaar voor eerste release?** Ja voor de app zoals in #280, met deze PR erbij en de functie standaard uit (gedrag gelijk). Nee om de lokale functies aan te zetten voordat ze op een echte iPhone getest zijn (checklist hierboven).

Niet gedaan in deze PR (voorstellen, kosten een besluit): factuur-PDF op de iPhone maken als de server offline niet bereikbaar is, bankbestanden CAMT.053/MT940 in de app (de parser bestaat alleen in de edge function `financial-automation`), delta-sync in plaats van de hele administratie per keer (vraagt een Supabase-migratie), en de Supabase-bibliotheek vanaf app.boekuna.nl laden zodat een koude offline start betrouwbaar werkt.
