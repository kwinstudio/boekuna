# 03 — BOEKUNA Independent QA + Security

Implementation handoff; this document is not an independent QA approval. Do not merge or deploy from this implementation round. The PR description records the frozen exact HEAD and CI run links. Test that SHA; any subsequent source change invalidates its QA result.

## Source and scope

Repository: `kwinstudio/boekuna`.
Branch: `feature/app-polish-functional-fixes-20261002`.
Verified base/current main: `7134e3be64b084bef67373ac3bcac2d41364b2d5`.
App entry: `kwinest/index.html`; existing split builds and architecture retained. No marketing source, provider, billing implementation, OCR processor or framework change.

Implemented domains: dashboard floating tooltip and recent invoices; consistent mobile financial rows and fixed action anchors; document upload/count/icon controls; contextual attention resolution; report preview exit/focus controls; planned cash recurrence; invoice finalization/retry/native handoff; settings account group and typed destructive confirmation.

## Root causes and fixes

- Concurrent invoice finalization could create two IDs and reserve two numbers. An in-flight lock and persistent retry context now retain one ID, number and newly created customer. Numbered legacy drafts keep their number; only an unnumbered managed draft reserves a number. Existing-number uniqueness remains enforced.
- Save/conflict errors could be swallowed before delivery, stale editors could recreate missing invoices, and retry depended on a removed composer. Persistence and unchanged-snapshot gates now block delivery on offline, stale or failed synchronization. Retry survives PDF failure and removed editor UI. Booking-to-invoice conversion is idempotent.
- Email recovery lacked a coherent path. Missing email offers relation editing or PDF use. Native share/mailto and the existing user-controlled web compose remain; provider API sending remains disabled. A handoff alone does not mark sent: explicit user confirmation is required.
- Attention navigation lost source context. Stable source IDs now open the exact document review, bank suggestion, booking, contact or health issue. Document linkage requires an explicit existing source and rejects conflicting backlinks. Counts derive actual state after persistence/reload. Bank refusal does not pretend the unmatched transaction is resolved.
- Reports opened outside the app without a reliable return path. App-owned previews now expose Close/Back and print/save PDF, restore focus, handle browser Back and Escape inside/outside the iframe, and respect mobile safe areas.
- Settings reset had a single-click confirmation. Exact `WIS ADMINISTRATIE` now gates submission, prevents duplicate reset and restores state on synchronization failure. Company profile is retained. Account deletion retains password reauthentication/backend authorization and exact `VERWIJDER` confirmation. Logout is neutral.
- Mobile cells lacked shared anchors and currency sizing. Scoped financial row CSS preserves headers/relationships while stacking content, keeps amounts intact and labels ledger debit/credit. Chart tooltip is bounded to its card and responds to hover, focus, tap, outside interaction and Escape.

## Recurrence and migration

Migration: `supabase/migrations/20261001234000_planned_cash_recurrence.sql`.

Plans stay in the tenant's existing `ledger_state.state.plannedCash` JSON; persistence uses the existing versioned `save_ledger_state` RPC. No occurrences are stored, and no bank transaction, payment or journal entry is generated.

`repeating`: `oneoff`, `weekly`, `monthly`, `quarterly`, `yearly`. Missing/null historical values normalize to `oneoff`. Weekly steps use UTC days. Calendar periods remain anchored to the original day, clamping to the last day of a shorter month: Jan 31 → Feb 28/29 → Mar 31. Yearly Feb 29 recovers in a leap year. Recurring projections count occurrences from today through the inclusive forecast cutoff; past recurring occurrences are not replayed against today's cash balance. Historical oneoff cutoff behavior is preserved.

The trigger validates JSON shape, enums, real recurring dates, numeric positive amounts and in/out direction. It leaves financial fields, owner, version, RLS and entitlement/MFA policies intact. Replaying the migration is tested. Before production application, independent QA/release must inspect real legacy states and run the migration in a safe environment; implementation did not access authenticated production data.

## Verification and evidence

Baseline: 26 domain cases; eight relevant Chromium suites; five WebKit suites passed before implementation. Integrated domain run: 34 cases, zero failures/skips. Existing invoice delivery and production integrity include mixed VAT/credit parity, 11 tax cases, 333 cent allocations, payment history and corrections.

New regression suites:

| Suite | Coverage |
| --- | --- |
| `invoice-persistence.test.mjs` | Ten production-code identity, number, double-click, stale conflict and retry cases |
| `invoice-native-retry.test.mjs` | Actual generated app/PDF, native/mailto handoff, missing email, explicit sent/reload, PDF retry |
| `cashflow-recurrence.test.mjs` | Month/leap/quarter/year boundaries, legacy defaults, deterministic projection |
| `cashflow-recurrence-browser.test.mjs` | Production build create/edit/delete/reload and versioned client cloud fixture; unchanged financial metrics |
| `planned-cash-sql-isolation.test.mjs` | Real local PostgreSQL/PGlite, production RLS and latest save RPC, two-account CRUD/owner transfer rejection, stale versions, malformed data, rollback, entitlement rejection |
| `contextual-resolution-browser.test.mjs` | Exact source actions, persisted counts/reload/rollback; preview close/Back/Escape/focus; typed reset/delete |
| `financial-presentation.test.mjs` | 132 route/width combinations per engine; currency clipping/overflow, anchors, table semantics, touch tooltip, safe document actions |

Financial presentation runs compare exact-base app calculations with the changed app using the same representative dataset, then compare again after navigation/rendering. Revenue, costs, profit, VAT, paid/open/partial states, cash, oneoff forecasts, journal and ledger are equal. Recurrence tests separately prove only the expected forecast changes. Raw state remains byte equivalent for presentation-only actions.

Widths: 320, 360, 375, 390, 393, 430, 768, 1024, 1280, 1440, 1920. Screenshot routes: dashboard, invoices, expenses, bank, documents, control, VAT, reports, cashflow, ledger, hours/mileage and settings at 320/390/1440 in both engines. Report preview screenshots separately cover 320/390/1440.

CI uploads `app-polish-evidence`, `app-ux-evidence` and `boekuna-app-visual`. Financial before/after JSON and layout results are under `tests/artifacts/financial-presentation/`; report evidence is under `tests/artifacts/contextual-resolution/`. CI checks are recorded on the exact PR HEAD; do not substitute a previous run.

Existing regression coverage also includes auth/onboarding, tenant isolation, cloud serialization, document upload/background/verification, accounting automation/permissions, source safety, KVK, billing/entitlements, Developer Mode, keyboard, premium/mobile layouts and split build boundaries. Relevant seven Python document/OCR suites passed, including real OCR, digital/scanned/multipage/corrupt PDFs and mixed financial blocks. Marketing output hashes are compared against the pre-change build.

## Security and limits to inspect independently

- Local SQL tests execute production policies/RPC and the new migration in real PostgreSQL. Auth identity and entitlement session inputs are fixtures. This is not a live hosted Supabase/Auth test. The browser's two-account mock is explicitly only a client contract test.
- Production builds are used with deterministic auth/data/network fixtures; no credentials or service-role secret was added. Native OS mail sending and actual printer/save-PDF dialogs cannot be validated by headless tests. Generated invoice PDF bytes are validated with pdf-lib.
- Report iframe uses `allow-same-origin allow-modals allow-scripts` so parent-installed keyboard handlers work in WebKit. A report-only CSP blocks script execution, networking, forms and base URLs; report fields are escaped. Review this boundary and hostile report content independently.
- Actual legacy IndexedDB File linkage is exercised in Chromium. Linux WebKit covers missing-file rejection and existing linkage; its unsupported legacy test-only File storage branch is cancelled. Live authenticated Supabase upload/linkage remains an independent QA task.
- Local browser smoke cannot reach the legacy Render site in this managed network; its local app flow passes, and CI retains the complete live smoke without skips. No production deployment/smoke approval is claimed.
- Main's previously disclosed P1 auth/payment gates (#51/#52) remain outside this targeted app round. Do not interpret these changes as closing them.

## Independent acceptance / release

Reproduce every invoice invariant; attempt stale/repeated writes and tenant-owner transfer. Verify recurrence dates and forecast-only behavior after hosted reload. Inspect all screenshot groups, keyboard order/contrast/touch targets/table semantics, report iframe security and exits, real document linkage, destructive cancel/error/paste flows. Review migration against representative existing tenant states.

Return an independent PASS/FAIL for the frozen SHA with P0/P1/P2 findings. Only after independent PASS hand the same SHA to **04 — BOEKUNA DevOps + Release**. Release checks the approved SHA, merge/new main, applies the controlled migration, builds/deploys only affected app services, runs the user-specified production smoke and preserves a rollback path. No marketing deployment is required.
