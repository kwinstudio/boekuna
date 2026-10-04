# BOEKUNA UX simplification — issue & copy inventory

Date: 2026-10-04  
Base: `fed42a9441ae180f58db94582dd9a07d7b451ab3`  
Branch: `ux/plain-language-mobile-compact-20261004`

## Guardrails

- App-first. Do not intentionally change the public marketing website.
- Keep invoice routes/state/contracts (`invoices`, invoice IDs, financial helpers) intact.
- Keep OCR/document intelligence and financial calculations intact.
- Preserve the temporary production assistant-off gate introduced by PR #174.
- No database migration.
- No global scroll lock.
- Mobile-first; desktop remains stable.

## Issue inventory

| Priority | Screen/component | Current | Target | Technical location | Risk / test |
| --- | --- | --- | --- | --- | --- |
| P1 | Sidebar + mobile bottom nav + page title | Facturen | Inkomsten | `kwinest/index.html` nav + `PAGE_TITLES` | Preserve `invoices` route and deep links; browser route assertion |
| P1 | Invoices page heading | Facturen / verkoopfacturen | Inkomsten, with facturen as the task inside the page | `renderInvoices()` | Do not rename invoice state/helpers; browser heading + create invoice flow |
| P1 | Mobile KPI cards | Decorative KPI icons consume space | KPI icons hidden only below mobile breakpoint | shared dashboard/product KPI selectors | Functional icons remain; desktop icons remain visible |
| P1 | Dashboard KPI helpers | Selected period repeated in KPI helper | Period only in filter; helpers retain meaning, e.g. Excl. btw | `renderDashboard()` | Financial context must remain; exact helper assertions |
| P1 | Native date fields | Native date rendering can differ from adjacent inputs | Same 44px control box, padding, radius, focus and baseline contract | shared app form/date CSS | Chromium + WebKit compare date vs number/select |
| P1 | Mobile first viewport | High page headers + KPI cards delay main task | Reduce redundant status text, gaps and KPI height without shrinking touch targets | `mobile-product.css` | 320–430 no overflow; primary content remains reachable |
| P2 | Costs VAT copy | “Voorbelasting deze maand” | “Btw die je kunt terugvragen” / “Deze maand” | `renderExpenses()` | Preserve deductible VAT calculation |
| P2 | VAT page jargon | “Voorbelasting”, “Btw op verkoopfacturen”, period repeated in KPI | “Btw die je kunt terugvragen”, “Btw op je facturen”, no duplicate selected period | `renderVat()` | VAT numbers unchanged; browser copy assertions |
| P2 | VAT control list | “Verkoopfacturen” | “Facturen” | `renderVat()` | Copy only |
| P2 | Reports KPI | Omzet repeats visible custom date range | Omzet helper says “Excl. btw” | `renderReports()` | Range logic unchanged |
| P2 | Secondary bank income view | Invoice-based “Inkomsten deze maand” can read like received cash | Explicit “Omzet deze maand”; received cash remains separate KPI | `renderIncome()` | Protect omzet ≠ bank receipt semantics |
| P2 | Dashboard create-invoice summary | “Nieuwe verkoopfactuur aanmaken” | “Nieuwe factuur maken” | `renderDashboard()` | Copy only |

## Copy inventory

- Navigation: **Facturen → Inkomsten**
- Invoices page: **Facturen → Inkomsten**
- Invoices page description: **Beheer en volg je verkoopfacturen. → Maak facturen en houd bij wat nog binnenkomt.**
- Costs VAT helper: **Voorbelasting deze maand → Deze maand**, under **Btw die je kunt terugvragen**
- VAT KPI/summary: **Voorbelasting → Btw die je kunt terugvragen**
- VAT helper: **Btw op verkoopfacturen → Btw op je facturen**
- VAT checklist: **Verkoopfacturen → Facturen**
- Dashboard KPI helpers: period prefix removed; **omzet minus kosten / excl. btw** retained
- Reports omzet helper: visible date range removed; **Excl. btw** retained
- Secondary bank-income KPI: **Inkomsten deze maand → Omzet deze maand**
- Dashboard summary: **Nieuwe verkoopfactuur aanmaken → Nieuwe factuur maken**

Expert-detail exception: official/general-ledger account names such as Debiteuren and Crediteuren remain unchanged where they are account labels in the Grootboek. They are not promoted into the beginner-first primary flow.

## Acceptance

1. `invoices` remains the internal route and existing deep links still navigate.
2. Mobile bottom nav has exactly five entries and shows Inkomsten.
3. Mobile dashboard and shared product KPIs show no KPI decoration icons; desktop still does.
4. Period filter is not repeated in dashboard KPI subtext.
5. Date inputs align with adjacent inputs in Chromium and WebKit.
6. No global horizontal overflow at 320, 375, 390 and 430 px.
7. No global scroll disabling; long lists remain scrollable.
8. Existing document-review, assistant-disabled build, financial and production integrity suites stay green.
