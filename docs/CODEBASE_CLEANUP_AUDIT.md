# BOEKUNA cleanup audit — post-PR #111

Base main: `6dc5abd91acb432fbaa5767f68fb4bde1318739a`.
PR #111 was merged at `8b4c17859aff07bcce6fbc3f02117074571a1e5c`; this base also includes PRs #114 and #115.
Scope: remove demonstrably unreachable inline styles and unreferenced helper declarations. No redesign or behavior changes.

## Decisions before deletion

| Candidate | Type | Evidence unused / dependency | Risk | Decision |
|---|---|---|---|---|
| 26 `fh-*` classes | CSS | No complete class tokens or `fh-` factory prefix in HTML/JS outside style blocks; independent marketing stylesheet retained | LOW | SAFE_REMOVE |
| 45 `ns-*` classes | CSS | No complete class tokens or class-factory prefix outside styles; raw `ns-` hits are only `kz-solutions-*` and `sans-serif` | LOW | SAFE_REMOVE |
| `demo-pill`, `hero-strip`, `smart-grid`, `smart-card`, `score-ring`, `danger-left`, `good-left`, `brandmark`, `icon-wrap` | CSS | No runtime class tokens; negative assertions in premium tests retained; external shared CSS retained | LOW | SAFE_REMOVE |
| `connectMailbox` (base line 3491) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `disconnectMailbox` (base line 3492) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `saveInvoice` (base line 3624) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `brandingAccent` (base line 3635) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `buildInvoiceMailPayload` (base line 3642) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `handleReceiptPhoto` (base line 4291) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `valueNear` (base line 4621) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `shouldRunSecondInvoicePass` (base line 4739) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `uploadErrorCatalogHtml` (base line 4864) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `handleInvoicePdfFile` (base line 4879) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `downloadProfile` (base line 5262) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `checkIntegrations` (base line 5271) | function | Declaration is its only source token; zero tracked runtime/test/build references | LOW | SAFE_REMOVE |
| `randomSalt`, `lineVatAmount`, `shouldQueueDocumentVerification`, `showUploadError` | function | Referenced by auth/calculation/document/browser tests | HIGH | KEEP |
| Auth, entitlement, numbering, payment, delete-expense helpers | function | Protected subsystem; deleting singly occurring candidates needs independent security/financial review | HIGH | KEEP |
| Legacy marketing runtime, `kz-*`, `marketing-*` | runtime/CSS | Current embedded marketing references remain; rollback window not proven closed | HIGH | DEFER |
| Marketing slicing in `build-app.mjs` | build | Required while combined source remains; strict validation guards active | HIGH | REMOVE_AFTER_REFACTOR |
| `public/assets/brand-v2.css` | shared CSS | Brand tokens/app overrides plus marketing selectors and collision overrides; app allowlist dependency | MED | KEEP |
| All 14 app allowlisted assets | assets | Build, manifest and app dependencies; no asset is proven unused across both surfaces | MED | KEEP |
| Marketing/product screenshot/editorial assets | assets | Standalone marketing surface and proof tests use these assets; absence from app is not evidence of non-use | MED | KEEP |
| Split characterization | test | Legacy-source characterization still applies to retained combined rollback source | MED | KEEP |
| Split build/surfaces/origins/CI scopes | tests | Permanent surface/origin/coverage boundaries | HIGH | KEEP |
| Premium v1/v2 and mobile tests | tests | Distinct #111 document deletion, VAT/report, accessible table and logout assertions; no proven equivalence | HIGH | KEEP |
| Early Access/First 100 migrations and regressions | DB/tests | Historical state and prevention of retired billing model reactivation | HIGH | KEEP |
| Legacy origins/services, old branches/PRs | deployment/repository | Rollback retained; no retirement authorization or evidence | HIGH | DEFER |
| CI duplicate setups | CI | Separate surface jobs intentionally isolate dependencies; consolidation not justified in this cleanup | MED | DEFER |

## Reference analysis

Temporary analysis uses Acorn to locate complete function declaration ranges, and PostCSS plus a selector AST to inspect CSS. HTML, JS templates, generated inline event handlers, callback names, classList/querySelector references, and tracked `.html/.js/.mjs/.cjs/.ts/.css/.svg/.json/.yml/.yaml` files are searched. No computed `window[...]`, `globalThis[...]`, `eval`, or `new Function` dispatch exists in the source.

Selectors are removed only when a **required class outside conditional pseudo-classes** is unreachable. A selector inside `:not(...)` is never used as an unused anchor. Live branches of comma-separated selector lists are retained. Empty media wrappers are removed only after their last dead rule disappears. No live declarations are modified, and all remaining script blocks are reparsed.

Other-file matches for removed classes are independent stylesheets or assertions that obsolete UI must remain absent. `public/assets/homepage.css`, `public/assets/brand-v2.css`, and all tests are retained byte-for-byte. The combined rollback HTML has no references to the removed classes either.

### Exact CSS class inventory

`brandmark`, `danger-left`, `demo-pill`, `fh-cta`, `fh-cta-box`, `fh-dark`, `fh-heading`, `fh-hero`, `fh-hero-actions`, `fh-hero-lead`, `fh-inner`, `fh-kicker`, `fh-link`, `fh-links`, `fh-media`, `fh-number`, `fh-numbered`, `fh-section`, `fh-stat`, `fh-stats`, `fh-trust`, `fh-trust-card`, `fh-ui`, `fh-ui-banner`, `fh-ui-card`, `fh-ui-cards`, `fh-ui-main`, `fh-ui-main-head`, `fh-ui-nav`, `good-left`, `hero-strip`, `icon-wrap`, `ns-actions`, `ns-app-phone-wrap`, `ns-app-section`, `ns-attn`, `ns-attn-row`, `ns-audience`, `ns-audience-card`, `ns-banner`, `ns-big-price`, `ns-checks`, `ns-cta`, `ns-cta-box`, `ns-doc`, `ns-doc-line`, `ns-doc-summary`, `ns-feature`, `ns-feature-copy`, `ns-feature-visual`, `ns-head`, `ns-heading`, `ns-hero`, `ns-inner`, `ns-kpi`, `ns-kpis`, `ns-laptop`, `ns-laptop-main`, `ns-laptop-nav`, `ns-mini-phone`, `ns-mini-screen`, `ns-phone`, `ns-phone-card`, `ns-phone-list`, `ns-phone-screen`, `ns-phone-tabs`, `ns-phone-top`, `ns-pricing-teaser`, `ns-proof`, `ns-section`, `ns-shortcut`, `ns-shortcuts`, `ns-solution`, `ns-solutions`, `ns-trust`, `ns-trust-card`, `ns-visual`, `score-ring`, `smart-card`, `smart-grid`

## Baseline

| Metric | Before |
|---|---:|
| bytes | 743533 |
| chars | 742791 |
| lines | 6147 |
| css_bytes | 157254 |
| js_bytes | 576880 |
| css_unique_classes | 553 |
| parsed_named_function_declarations | 621 |
| important | 814 |

Generated app before: 701,753 bytes HTML; 14 allowlisted assets; 16 total files; 806,152 static bytes.

Untouched-main baseline: Chromium premium v2 passes. Premium v1 reports global overflow at 320px on Reports (`reportTo`: right edge 338px). Initial WebKit launch is blocked by missing host `libgles2`; repair the test environment and rerun both browsers before drawing product conclusions. Baseline failures must stay visible; do not weaken assertions or bundle a responsive redesign into cleanup.

Rollback decision: `docs/SPLIT_STATE.md` explicitly retains the legacy service/origins through stabilization. `docs/SPLIT_ROLLBACK.md` describes a combined-source fallback. No evidence proves the window closed, so embedded marketing and its build boundary remain deferred.

## Validation plan

After CSS removal: source/security/build/calculation tests, premium/mobile tests, and before/after computed-style and screenshot comparison.
After helper removal: full app/backend/marketing regressions, Chromium and WebKit, widths 320/360/375/390/393/430/768/820/1024/1280/1440; compare dashboard, invoices, expenses, documents, bank, VAT, reports, cashflow, ledger, contacts, services, settings, profile, control, bookings, hours, login and invoice/quick-action modals.

Keep production Developer Mode fail-closed guards, app asset allowlist, legal links, noindex, Supabase config, migration history, and financial/auth/billing/document/tenant logic unchanged. No merge or production deployment from this cleanup.
