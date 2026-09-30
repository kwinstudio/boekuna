# BOEKUNA Premium App Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce permanent UI copy and visual noise across BOEKUNA while preserving every functional, financial, document, auth, and tenant boundary and making the app feel calmer and more premium.

**Architecture:** Keep the current single-app rendering architecture and Calm Control token system. Simplification is implemented by changing existing render output and CSS composition, not by introducing a new framework or data layer. A dedicated browser regression pins critical copy removals, required financial caveats, responsive density, and action preservation.

**Tech Stack:** Existing HTML/JavaScript app in `kwinest/index.html`, CSS in `public/assets/brand-v2.css`, Node 22 + Playwright 1.56.1 tests.

**Spec:** `docs/superpowers/specs/2026-09-30-premium-app-simplification-design.md`

## Global Constraints

- Work from `main` SHA `6f8bef74a0fe8b9b93108e4e7fdb508520f3b3e3` on `feature/premium-app-simplification`.
- Do not merge Developer Mode PR #108 into this work.
- Preserve approved mobile bottom nav: Dashboard · Facturen · Scan · Bank · Meer.
- No financial calculation, VAT, invoice status, payment, credit, numbering, auth, tenant, storage, or document-state semantic changes.
- No database migration.
- No marketing-site redesign.
- Use existing Calm Control tokens; no new heavy frontend or animation dependency.
- Chromium + WebKit must both pass.
- No merge/release before independent QA PASS.

## Review Focus

1. **Critical caveat removal:** VAT/KOR/report disclaimers must retain their decision-relevant meaning after copy reduction.
2. **Action loss:** every removed explanation must leave its underlying action reachable and understandable.
3. **Very small mobile widths:** 320px screens must not overflow after denser headers/actions.
4. **Empty/loading/error states:** simplification must not collapse distinct attention/document states into ambiguous UI.
5. **Desktop regression:** mobile-focused density changes must not alter sidebar, table, modal, or pointer behavior at desktop widths.

---

### Task 1: Add simplification regression coverage

**Files:**
- Create: `tests/premium-app-simplification.test.mjs`
- Modify: `.github/workflows/boekuna-app.yml`

**Interfaces:**
- Consumes: existing app test-mode/bootstrap patterns from `tests/mobile-app-layout.test.mjs`.
- Produces: browser assertions used by every later task as the simplification release gate.

- [ ] **Step 1: Write failing browser assertions**

Test `premium app simplification` in Chromium and WebKit with assertions that:
- Dashboard does not contain `Jouw administratie`, `Werk op uitzonderingen, niet op alles`, or the 3 smart marketing cards.
- Facturen does not contain the header paragraph or permanent `Factuurcheck actief.` notice.
- Bank does not contain the permanent PSD2/open-banking paragraph.
- Documenten does not contain permanent OCR/technical explanation.
- VAT still contains concise `Indicatief` / not-submitted meaning.
- Controlecentrum exposes actionable exception rows without the explanatory smart-card copy.
- Primary actions remain present on Facturen, Kosten, Bank, Documenten.
- 320/390/430/820 widths have no global horizontal overflow.
- 1024/1280/1440 widths preserve desktop sidebar and main content.

- [ ] **Step 2: Run the new test and confirm expected failures**

Run:
`node tests/premium-app-simplification.test.mjs`

Expected: FAIL on current explanatory copy.

- [ ] **Step 3: Add Chromium and WebKit steps to app CI**

Add the test after mobile layout regressions and include any generated screenshots in `boekuna-app-visual`.

- [ ] **Step 4: Commit**

Commit message:
`test: add premium app simplification regression`

---

### Task 2: Simplify the dashboard hierarchy

**Files:**
- Modify: `kwinest/index.html` — `renderDashboard()`, `renderAttentionCenter()`
- Modify: `public/assets/brand-v2.css`
- Test: `tests/premium-app-simplification.test.mjs`
- Regression: `tests/mobile-app-layout.test.mjs`

**Interfaces:**
- Consumes: `dashboardGreeting()`, `dashboardAttentionItems()`, existing KPI calculations and chart data.
- Produces: greeting → attention → KPI → chart → recent invoices hierarchy with no marketing smart-card block.

- [ ] **Step 1: Extend the failing test**

Assert:
- greeting is present;
- generic eyebrow/status copy is absent;
- attention remains directly after greeting;
- all four KPI labels remain;
- chart and recent invoices remain;
- dashboard smart-grid marketing cards are absent.

- [ ] **Step 2: Run tests and confirm failure**

Run:
`node tests/premium-app-simplification.test.mjs`

- [ ] **Step 3: Implement minimal dashboard copy/surface reduction**

In `renderDashboard()`:
- remove `Jouw administratie` eyebrow;
- remove generic `Je administratie is bijna klaar.` when there is no concrete action;
- keep onboarding only for an actually empty account;
- keep incomplete profile as an actionable attention/profile condition, not duplicate prose;
- remove dashboard smart-grid cards for Controlecentrum/Cashflow/Booking;
- remove redundant KPI subtitles/badges where the label/number is sufficient;
- shorten attention detail strings without changing attention sources;
- retain chart and recent invoices.

In CSS:
- make KPI cards quieter/flatter;
- use fewer decorative borders/shadows;
- preserve 2×2 mobile KPI and 1-column 320 fallback.

- [ ] **Step 4: Run focused tests**

Run:
- `node tests/premium-app-simplification.test.mjs`
- `node tests/mobile-app-layout.test.mjs`
- `BOOKUNA_BROWSER=webkit node tests/mobile-app-layout.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message:
`feat: simplify premium dashboard hierarchy`

---

### Task 3: Simplify Facturen, Inkoop & kosten, Bank, and Documenten

**Files:**
- Modify: `kwinest/index.html` — `renderInvoices()`, `renderExpenses()`, `renderBank()`, `renderDocuments()`, relevant empty/dropzone copy
- Modify: `public/assets/brand-v2.css`
- Test: `tests/premium-app-simplification.test.mjs`
- Regression: document and list suites

**Interfaces:**
- Consumes: all existing action handlers and list/filter helpers unchanged.
- Produces: compact page heads with one primary CTA and secondary actions.

- [ ] **Step 1: Add screen-specific assertions**

Assert:
- Facturen keeps `Nieuwe factuur`, Upload, KPI row, table.
- Kosten keeps upload/photo/camera and `Kosten boeken`.
- Bank keeps import/add, unmatched count, transaction table.
- Documenten keeps upload/photo/camera, processing board, file list.
- removed instructional paragraphs do not render.

- [ ] **Step 2: Run test and confirm failure**

Run:
`node tests/premium-app-simplification.test.mjs`

- [ ] **Step 3: Implement copy reduction**

- Remove explanatory header paragraphs.
- Remove Facturen permanent factuur-check notice; validation messages remain at validation time.
- Remove Bank permanent PSD2/open-banking notice from daily work area.
- Shorten metric subtitles to only decision-relevant qualifiers.
- Reduce Documenten header/dropzone text to action + concise state; retain processing error/retry/status.
- Do not change handlers, filters, upload processing, or data semantics.

- [ ] **Step 4: Run focused regression**

Run:
- `node tests/premium-app-simplification.test.mjs`
- `node tests/list-controls.test.mjs`
- `node tests/document-upload-browser.test.mjs`
- `node tests/document-background-processing.test.mjs`
- `BOOKUNA_BROWSER=webkit node tests/document-upload-browser.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message:
`feat: simplify core accounting workspaces`

---

### Task 4: Simplify financial and workflow secondary screens

**Files:**
- Modify: `kwinest/index.html` — `renderVat()`, `renderControl()`, `renderCashflow()`, `renderBookings()`, `renderReports()`, `renderLedger()`
- Modify: `public/assets/brand-v2.css`
- Test: `tests/premium-app-simplification.test.mjs`
- Regression: `tests/production-integrity.test.mjs`, `tests/invoice-delivery.test.mjs`

**Interfaces:**
- Consumes: existing calculations and source-of-truth helpers unchanged.
- Produces: task-first financial screens with preserved caveats.

- [ ] **Step 1: Add financial-caveat assertions**

Assert:
- VAT still communicates indicative/not-submitted state.
- KOR warning remains when active.
- Reports retains the formal-year-statements limitation.
- Cashflow retains personal-buffer/not-tax-calculation meaning.
- Control center retains actionable exception categories.

- [ ] **Step 2: Run test and confirm expected copy-density failures**

Run:
`node tests/premium-app-simplification.test.mjs`

- [ ] **Step 3: Implement secondary-screen simplification**

- VAT: shorten header/caveat, compact checklist, no semantic removal.
- Controlecentrum: prioritize one exception worklist; remove explanatory smart-card prose; move audit/e-invoice readiness lower/secondary.
- Cashflow: remove generic marketing sentence and repetitive metric subtitles; keep “not live bank” and tax-buffer limitation in compact form.
- Boekingen: remove rationale paragraph/block; keep booking state/action workflow.
- Reports: reduce duplicate subtitles while keeping period controls, key values, exports, formal limitation.
- Grootboek: shorten explanatory copy; preserve balance/control information.

- [ ] **Step 4: Run financial regressions**

Run:
- `node tests/premium-app-simplification.test.mjs`
- `node tests/production-integrity.test.mjs`
- `node tests/invoice-delivery.test.mjs`
- `node tests/smart-financial-correction.test.mjs`

Expected: PASS with unchanged amounts/status semantics.

- [ ] **Step 5: Commit**

Commit message:
`feat: simplify financial control screens`

---

### Task 5: Simplify remaining workspaces, settings, and quick actions

**Files:**
- Modify: `kwinest/index.html` — Contacts, Services, Hours, Profile, Settings, `quickMenu()`
- Modify: `public/assets/brand-v2.css`
- Test: `tests/premium-app-simplification.test.mjs`

**Interfaces:**
- Consumes: existing forms/actions/navigation.
- Produces: compact headers/forms/settings sections and faster quick-action picker.

- [ ] **Step 1: Add action-preservation assertions**

Assert:
- add/edit/save/delete actions still exist;
- profile required fields remain;
- settings backup/delete/support actions remain;
- quick menu contains all existing action types.

- [ ] **Step 2: Run test and confirm copy-density failures**

- [ ] **Step 3: Implement simplification**

- Remove generic one-line page explanations on Relaties/Diensten/Uren.
- Reduce repetitive Profile section descriptions; keep ambiguous/financial field help.
- Remove generic Settings header copy and compress section prose.
- Move/visually demote technical Productiestatus details rather than making them primary.
- Reduce Quick Menu to action labels plus help only for genuinely ambiguous actions.

- [ ] **Step 4: Run focused tests**

Run:
- `node tests/premium-app-simplification.test.mjs`
- `node tests/auth-progressive-onboarding.test.mjs`
- `node tests/browser-smoke.test.mjs`

- [ ] **Step 5: Commit**

Commit message:
`feat: simplify settings and supporting workspaces`

---

### Task 6: Premium visual polish and card reduction

**Files:**
- Modify: `public/assets/brand-v2.css`
- Modify only if needed: `kwinest/index.html` for semantic wrapper classes
- Test: `tests/premium-app-simplification.test.mjs`

**Interfaces:**
- Consumes: simplified HTML from Tasks 2–5.
- Produces: consistent quiet-premium density across mobile/desktop.

- [ ] **Step 1: Add visual-layout assertions**

Assert:
- one primary page action has primary styling;
- major passive sections do not add nested interactive card chrome;
- mobile content clears bottom nav;
- modals/drawer remain above fixed nav;
- no horizontal overflow at target widths.

- [ ] **Step 2: Apply premium restraint**

- unify page-head spacing;
- reduce unnecessary card shadows/borders;
- strengthen metric-value hierarchy;
- simplify section dividers;
- make secondary copy quieter;
- keep semantic warning/success/error colors;
- keep touch targets ≥44px;
- preserve reduced-motion behavior.

- [ ] **Step 3: Run Chromium + WebKit visual regression**

Run:
- `node tests/premium-app-simplification.test.mjs`
- `BOOKUNA_BROWSER=webkit node tests/premium-app-simplification.test.mjs`
- `node tests/browser-smoke.test.mjs`
- `BOOKUNA_BROWSER=webkit node tests/browser-smoke.test.mjs`

Capture screenshots at 390, 430, 1280 for Dashboard, Facturen, Documenten, Bank, Controlecentrum.

- [ ] **Step 4: Commit**

Commit message:
`style: polish premium app density and hierarchy`

---

### Task 7: Full regression, review, PR, and independent QA handoff

**Files:**
- Modify if needed: `.github/workflows/boekuna-app.yml`
- No product changes unless a failing test identifies a root cause.

**Interfaces:**
- Consumes: complete branch.
- Produces: mergeable PR with evidence, but no release before independent QA.

- [ ] **Step 1: Run the complete app suite**

Run the same commands/gates as `.github/workflows/boekuna-app.yml`, including:
- CI scope/build boundaries
- browser smoke Chromium/WebKit
- premium simplification Chromium/WebKit
- mobile layout Chromium/WebKit
- document browser/background/WebKit
- auth/progressive onboarding
- list controls
- invoice edit
- document verification
- cloud serialization
- tenant isolation
- production integrity
- invoice delivery

Expected: all PASS.

- [ ] **Step 2: Review diff for forbidden semantic changes**

Confirm no changes to:
- financial formulas/status helpers;
- auth/session;
- tenant/RLS;
- document state machine;
- invoice numbering;
- marketing pages.

- [ ] **Step 3: Create PR from `feature/premium-app-simplification` to `main`**

PR body must include:
- content audit summary;
- before/after simplification;
- changed files;
- exact HEAD;
- CI runs;
- screenshots/artifacts;
- known residual risks.

- [ ] **Step 4: Independent QA gate**

03 QA must explicitly retest:
- Chromium + WebKit;
- 320–820 mobile widths and 1024/1280/1440 desktop;
- financial caveats;
- all primary actions;
- auth/tenant/document/financial regressions;
- desktop/sidebar/modal behavior.

Expected terminal result before release: `QA RESULT: PASS`.

- [ ] **Step 5: Release only after QA PASS**

Hand exact QA-approved HEAD to 04 DevOps + Release for merge, deployment, production smoke, and rollback readiness.
