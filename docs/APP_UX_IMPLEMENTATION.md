# App UX simplification — implementation and release evidence

Initial baseline: `7132029b792c8942f18317637ff352461dfe08d5`, after merged cleanup #116 (`aedb478db4cde4e58e6fa1e9c26867f611d2cc10`). Current main integrated: `664eddbaaffc14bcb969ec8e3c5ba0011e3a5ee1` (marketing-only PR #117; all 21 imported blobs match main exactly, no UX path overlap). Branch: `ux/app-simplification-plain-language-20261001`.

## Result

- Existing auth presentation remains; the explicit marketing exit is removed. Login, signup, password reset and hardened logout/history stay intact.
- Shared fields use a zero minimum width, consistent minimum height and associated labels. Reports custom dates fit at 320px. Financial tables use accessible stacked rows with preserved column headers; desktop tables fit their available card width. High amounts wrap without clipping or hiding values.
- Dashboard greeting, summary, cashflow link and recent invoices remain. Six chart buttons expose month/year, sales and costs on focus/hover/tap, with an explicit close button and Escape.
- Invoice list and detail expose secondary actions through Factuuracties. Existing edit/status/payment/PDF/reminder actions remain in that menu.
- Invoice, expense, journal, audit and backup exports, import and version recovery share Settings → Data & import/export; the duplicate Reports export card is removed. Existing export serializers remain unchanged.
- Documents has one Upload. Mobile Scan opens camera/library/file directly, using the existing inputs and queue. Desktop drop uses the same smart queue. The archive use case stores an existing document without processing and remains under the secondary menu; underlying storage and validation are retained.
- Failed persistent documents show retry subject to the existing attempt cap and a secondary menu with manual entry, replacement and deletion. Review remains prominent; all backend lifecycle and permission checks are retained.
- Dashboard and Actie nodig share the complete attention set. The worklist has category counts, search and 25-item pagination, retaining all 174 unmatched transactions in the regression fixture. Stale actions re-read current state.
- VAT adds a summary for all available years and a year drilldown, using existing VAT/rounding helpers. Existing year and quarter detail remains; the prominent copy button is removed while the function remains.
- Settings groups are Bedrijf, Facturen, Data & import/export, Beveiliging, Account and Geavanceerd. Destructive actions remain separated and keep their existing confirmations.
- Bottom navigation is Dashboard / Facturen / Scan / Bank / Actie nodig; the top-left drawer remains fully usable. Nieuw uses the same Scan picker.
- Independent QA found and reproduced a keyboard-inaccessible backup importer and focus loss during attention pagination. The importer now uses a real button wired to the same existing file input; category/pagination focus survives rerender, including disabled boundary buttons. A generated-artifact test first failed on all three keyboard scenarios, then passed after these fixes.
- Storage status is Opslaan… → Opgeslagen ✓ → hidden after three seconds. Failures remain Niet opgeslagen with retry. Conflict retry opens the existing version choice, avoiding forced overwrite.

## Scope and preservation

No framework, dependency, database migration, Edge Function, processor, financial engine, auth policy, Developer Mode guard, upload validation or marketing source change. Three additional `!important` declarations adapt the existing stacked-table system; no overflow-hiding rule was introduced. The exact comparison in `ux-evidence/protected-functions.json` checks 34 financial/auth/sync/document functions against base, including serialized save, logout and processing/retry/delete functions.

Copy inventory and decisions: `APP_COPY_AUDIT_BEFORE.{md,json}` and `APP_COPY_AUDIT_AFTER.{md,json}`. Technical/legal terms remain where precision is needed. Redundant menu descriptions are removed; warnings for deletion and recovery retain their meaning.

## Verification

The new generated-artifact test covers 16 primary routes × 10 widths in each browser, plus auth, invoice detail, source picker, chart keyboard/touch behavior, exports, VAT history and traversal/search of the complete 174-item list. Additional fixture data covers 75 invoices, draft/open/paid/partial status, long customer names and high amounts. Axe checks dashboard, control, VAT, settings, new contact and the source picker for WCAG A/AA issues. Storage status and conflict-safe retry have a separate production-function test.

Existing navigation tests now assert the requested fifth destination and direct picker while preserving drawer focus containment, focus return, Escape/backdrop, breakpoint cleanup and auth-history checks. The document regression asserts secondary actions in their new menu and the shorter received status. No tests were skipped or weakened to hide a failure.

Before screenshots: `ux-evidence/before-core-screens.zip`. Both workflows upload those plus generated after screenshots/layout JSON as `app-ux-evidence`. The large ledger exceeds WebKit's full-page screenshot height limit; viewport captures are used for that evidence, while overflow assertions still inspect the whole document.

Local source/math/auth/tenant/billing/export suites, both-browser mobile/premium/document upload, production and preview KVK, and six processor/OCR Python suites have been exercised. PowerShell recovery syntax is delegated to the mandatory full remote gate because pwsh is unavailable locally. The unchanged Chromium live legacy Render availability check returns ERR_EMPTY_RESPONSE locally; it remains enabled for CI and is not treated as PASS. Parallel production/preview KVK test builds share dist/app; local reruns were isolated. Exact-head app CI still exposed a WebKit duplicate-edit save timeout; the assertion remains intact with additional state/form diagnostics. This failure must be resolved before claiming app CI PASS.

After the execution environment reset, Chromium was restored and reran successfully. Local WebKit host-library downloads are blocked by the environment network allowlist; fresh remote WebKit evidence is required.

The incoming shared-surface artifact check previously asserted that an app UX PR must keep its app artifact unchanged. It now builds both surfaces and compares the opposite artifact: marketing remains byte-identical for app changes, and app remains byte-identical for marketing changes. Negative fixture runs prove that shared app-asset drift and combined public-marketing drift still fail. This changes only CI validation, with no public runtime/source change.

One app run timed out before browser execution because the runner took over nine minutes downloading host packages. A subsequent full-gate run needed over seventeen minutes for host packages and was cancelled at twenty minutes during WebKit UX checks. App and full-gate job budgets are now thirty minutes so this observed setup time and the complete suites can finish; tests and failure propagation remain mandatory.

The keyboard test initializes native file-picker interception before activation and cancels each empty selection before testing the next key; it retains Tab, Enter, Space and focus assertions.

The final scoped WebKit KVK test proved an existing-contact city was saved empty while the save itself succeeded. A deterministic regression then reproduced the dialog's deferred autofocus stealing an explicitly focused city input. Dialog autofocus now targets only its own still-connected dialog and preserves a field the user already focused. The generated keyboard regression checks entered Rotterdam text, normal initial focus and stale callbacks from replaced dialogs. The original KVK save/persistence assertion is retained; fresh exact-head WebKit CI must confirm the fix.

`SPLIT_FULL_GATE.md` requests the current complete integrity workflow. This document does not approve its own changes: exact PR HEAD still requires independent QA and remote app/full CI evidence.

## Release blockers

As checked on 2026-10-01, #51 (controlled live Stripe lifecycle) and #52 (Supabase leaked-password protection) remain open P1 release issues. This task authorizes no financial transaction and no auth-security rewrite. They cannot be bypassed. No merge or production deployment is permitted until all required gates pass and no P0/P1 remains unresolved.

Render service discovery currently returns “no workspace selected” and requires explicit user selection of the available workspace `tea-darrgogjo6nc7395aj60` before service configuration/current deploy/rollback can be verified. Historical service IDs are not accepted as current evidence. No deployment, processor deploy or database operation has been performed.

Recurring planned cashflow is deferred until the UX release is live and stable, then requires a separate technical assessment/PR.
