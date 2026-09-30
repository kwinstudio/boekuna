# BOEKUNA App-wide Premium Simplification v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Follow TDD and verification-before-completion.

**Goal:** Finish the app-wide simplification started in PR #109 by reducing remaining cognitive and visual load in editors, details, settings, forms, tables and secondary flows while preserving financial, auth, tenant, billing and document semantics.

**Architecture:** Keep the existing single-file product app (`kwinest/index.html`) and Calm Control layer (`public/assets/brand-v2.css`). No framework migration, database migration or financial/backend semantic change. Add one focused Playwright regression that pins the remaining simplification behaviors and responsive constraints, then implement in bounded batches.

**Tech Stack:** HTML/JavaScript, CSS, Node 22, Playwright.

**Source of truth:** `main` @ `87b90d7b5013c9fc4befa3b84eb92903f3a2d148` (PR #109 already merged).

**Branch:** `feature/app-wide-premium-simplification-20260930`

## Global constraints

- Preserve PR #106 mobile navigation: Dashboard · Facturen · Scan · Bank · Meer.
- Treat PR #109 as the baseline; do not redo already-simplified screens.
- Do not merge or copy Developer Mode PR #108.
- No changes to VAT/totals/rounding/credit/outstanding/payment/journal/numbering semantics.
- No changes to Auth, RLS, tenant isolation, Stripe/billing semantics or document processing state semantics.
- No new heavy frontend dependency.
- Keep required financial/legal/security caveats, but move secondary technical explanation behind disclosure when possible.
- Chromium and WebKit must pass before QA handoff.
- No production release in this branch.

## Audit matrix

| Screen/flow | Current residual problem | Impact | Decision |
|---|---|---:|---|
| Dashboard | PR #109 already simplified; preserve | P3 | regression only |
| Facturen list | already compact | P3 | preserve |
| Factuureditor | dense initial form, permanent control notice, advanced fields visible immediately | P1 | progressive disclosure; task-first grouping |
| Factuur review/detail/actions | repeated explanations and action rows with long helper copy | P1 | compact summary + concise actions |
| Inkoop & kosten | list compact; manual entry acceptable | P2 | form consistency + mobile polish |
| Documenten/Scan | primary flow simplified by #109 | P2 | state/readability regression only |
| Bank | daily list simplified by #109 | P2 | table/mobile action polish |
| Btw | accurate but detail-heavy | P2 | keep caveats; compact secondary detail |
| Rapportages | already reduced; many cards remain structurally | P2 | flatten passive groupings where safe |
| Controlecentrum | already worklist-first | P2 | preserve and regression |
| Grootboek | advanced and card-heavy | P2 | visually demote; no semantic changes |
| Cashflow | already reduced; preserve uncertainty copy | P2 | minor polish only |
| Boekingen/Uren | secondary modules still compete visually | P2 | quieter navigation/presentation |
| Relaties/Diensten | tables good; mobile priority columns weak | P1 | responsive list treatment |
| Bedrijfsgegevens | five permanent cards for one form | P1 | sectioned form with fewer card surfaces |
| Instellingen | mixed concerns and verbose embedded billing/branding | P1 | human grouping + disclosures |
| Billing | duplicated explanation and 3 competing actions | P1 | concise status + one primary/one secondary action |
| Branding | two large always-open configuration forms | P1 | collapsed disclosures |
| Account/MFA | verbose modal; security action understandable but dense | P2 | concise account/security presentation |
| Quick menu | 10 actions compete equally | P1 | grouped actions; concise labels |
| Empty/error/loading | mixed wording/patterns | P2 | normalize concise task-first states |
| Mobile tables/forms/modals | desktop table behavior still dominates some secondary lists | P1 | priority-column/mobile row rules; no global overflow |

## Review focus

1. Advanced invoice fields must remain reachable and preserve exact saved values.
2. Required VAT/legal caveats must remain visible at the decision point.
3. Mobile 320–430 px must not hide row actions, modal footers or bottom navigation.
4. Settings disclosures must not make security, billing, backup or account deletion undiscoverable.
5. Desktop tables and keyboard workflows must remain efficient.

---

### Task 1 — Add v2 simplification regression
- Create `tests/app-wide-premium-simplification-v2.test.mjs`.
- Add Chromium + WebKit CI steps.
- RED assertions: invoice editor no permanent factuurcheck prose; advanced invoice fields collapsed by default but reachable; quick menu grouped; branding settings collapsed; account/security actions reachable; mobile table priority behavior; no overflow target matrix.
- Run and observe expected failures before implementation.
- Commit: `test: cover app-wide premium simplification v2`.

### Task 2 — Simplify invoice create/edit/review/action flows
- Modify invoice editor markup only; keep collection/validation/calculation helpers unchanged.
- Default visible: customer, lines/services, dates/payment term, total/check/save.
- Move concept-id/status, tax treatment, supply date, PO/reference/payment reference, discount/notes into clearly labeled secondary details unless context requires them.
- Remove permanent `Factuurcontrole actief` paragraph; validation/review remains authoritative.
- Shorten invoice action helper copy and review confirmation.
- Test invoice edit/delivery/PDF parity.
- Commit: `feat: simplify invoice workspace`.

### Task 3 — Simplify settings/account/billing/branding
- Group settings into Company, Factures, Subscription, Account & security, Data.
- Convert large email-template/invoice-layout forms into accessible disclosures.
- Billing: concise plan/usage/status; one primary upgrade/manage action; pricing secondary.
- Account modal: concise identity + MFA state + action; retain logout.
- Preserve backup/import/delete and legal/security access.
- Commit: `feat: simplify settings and account surfaces`.

### Task 4 — Simplify quick actions and secondary modules
- Group quick actions into daily bookkeeping vs secondary creation.
- Demote Bookings/Hours/Services/Grootboek in visual/navigation hierarchy without removing routes.
- Reduce helper copy in secondary dialogs.
- Commit: `feat: simplify supporting workflows`.

### Task 5 — Responsive tables/forms/modals and global consistency
- Add reusable mobile priority-column classes/behavior to lists that remain tabular.
- Keep local horizontal scroll where necessary; no global horizontal overflow.
- Normalize page-head/action/empty/error/loading/modal/footer spacing.
- Preserve bottom nav, drawer, safe-area and reduced motion.
- Commit: `style: unify premium app interaction patterns`.

### Task 6 — Full regression + visual/browser QA
- Run app CI-equivalent suites, Chromium + WebKit.
- Capture before/after-relevant screenshots for dashboard, invoices/editor, costs, documents, bank, VAT, reports, control, contacts, settings at mobile and desktop.
- Check console/page errors.
- Review diff for forbidden semantic changes.
- Fix only regressions found; TDD for fixes.

### Task 7 — PR + independent QA handoff
- Create PR to main with exact BASE/HEAD and test evidence.
- Do not merge.
- Return status `READY FOR QA` plus handoff for 03 Independent QA + Security.
