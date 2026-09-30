# BOEKUNA Split Plan

Base SHA: `ba0fd360dd200841714330d42421f6577beea88c`
Branch: `refactor/split-web-app`
Execution model: incremental / strangler; no rewrite; no destructive database migration.

## Task 1 — Characterize the current coupled baseline
Goal: capture current host, route, auth, billing, CI and critical accounting behavior before refactoring.

Existing files:
- `kwinest/index.html`
- `public/**`
- `.github/workflows/boekuna-integrity.yml`
- `supabase/functions/billing-*.ts`
- `supabase/functions/send-invoice/index.ts`
- `supabase/functions/analyze-invoice/index.ts`
- existing `tests/**`

New files:
- `tests/split-characterization.test.mjs`

Tests before change:
- current public route set exists;
- current marketing CTAs use same-origin auth entry;
- current app source contains both marketing and authenticated app shells;
- billing return URLs are derived from APP_URL;
- current CI is broad/coupled.

Implementation:
1. Add read-only characterization assertions.
2. Open draft PR so PR CI runs.
3. Record exact workflow result in SPLIT_STATE.

Verification:
- `node tests/split-characterization.test.mjs`
- full GitHub Actions workflow on draft PR.

Expected result:
- characterization test passes against current baseline;
- existing regression suite remains green.

Commit boundary:
- `test(split): characterize current coupled web and app baseline`

Rollback:
- revert the test-only commit.

## Task 2 — Establish deployable source boundaries without changing business logic
Goal: make marketing and app have explicit source roots while preserving current code behavior.

Existing files:
- `public/**`
- `kwinest/index.html`

New/changed files:
- likely `apps/marketing/**` and `apps/app/**`, or a smaller equivalent after local verification;
- shared static assets only when genuinely shared;
- build helper scripts if required.

Files moved:
- Prefer copy-first/strangler rather than destructive move.
- Do not delete legacy sources until both new targets are verified.

Interfaces/contracts:
- same Supabase project;
- same auth users;
- same storage;
- same financial engine;
- same entitlement RPC/contracts.

Tests before change:
- split characterization + all existing app/financial/browser tests.

Implementation:
1. Create explicit marketing publish root from existing `public/**`.
2. Create explicit app publish root from `kwinest/index.html` plus required app assets.
3. Do not alter invoice/VAT/OCR/bank/account semantics.
4. Add target tests that ensure marketing no longer depends on app HTML and app build no longer requires marketing HTML.

Verification:
- marketing-only static build;
- app-only static build;
- existing app regression suite.

Expected result:
- both outputs can be generated independently.

Commit boundary:
- `refactor(split): isolate marketing and application source roots`

Rollback:
- retain legacy source and switch deploy commands back.

## Task 3 — Remove marketing shell from product-app runtime
Goal: `app.boekuna.nl` opens to auth/dashboard only.

Existing files:
- product app entry HTML/JS.

Tests before change:
- auth rendering;
- onboarding;
- browser smoke;
- direct logged-out entry;
- logged-in app entry.

Implementation:
1. Preserve existing auth and app UI.
2. Remove public marketing-home rendering from the app entry.
3. Keep support/privacy links to public marketing host.
4. Preserve query/deep-link compatibility during transition where practical.

Verification:
- logged out → login/register;
- logged in → dashboard;
- no marketing hero/navigation in product app.

Commit boundary:
- `refactor(split): make product host app-only`

Rollback:
- revert app-shell commit; legacy production remains untouched until cutover.

## Task 4 — Make marketing CTAs cross-origin app links
Goal: all product-use CTAs on marketing point to `https://app.boekuna.nl`.

Existing files:
- `public/assets/marketing.js`
- public feature/pricing pages.

Tests before change:
- marketing-pages regression;
- broken-link checks.

Implementation:
- replace same-origin `/?login=1` product links with app-host links;
- preserve plan query parameters;
- do not change legal/support routes.

Verification:
- marketing QA + direct URL inspection.

Commit boundary:
- `refactor(split): route marketing product actions to app host`

Rollback:
- revert CTA commit.

## Task 5 — Auth/network origin support
Goal: one Supabase account works on the app host without cross-origin hacks.

Existing files/config:
- app auth bootstrap;
- Supabase project auth redirect settings;
- Edge Function CORS/origin sets.

Tests before change:
- auth progressive onboarding;
- login/logout/reset/callback characterization.

Implementation:
1. Add `https://app.boekuna.nl` to required server-side origin allowlists.
2. Configure Supabase Site/redirect URLs only after preview host is verified.
3. Preserve existing production origin during transition.
4. No localStorage session copying between origins.

Verification:
- registration;
- login/logout;
- reset;
- callback;
- expired/invalid links;
- direct app URL.

Commit boundary:
- `fix(auth): support isolated app origin and callbacks`

Rollback:
- restore previous allowlists/redirect configuration.

## Task 6 — Provider-agnostic entitlement boundary
Goal: Stripe remains a purchase provider; product access is based on backend entitlement.

Existing files:
- billing checkout/portal/webhook/sync Edge Functions;
- billing migrations/RPCs;
- client billing summary usage.

Tests before change:
- `tests/billing-source.test.mjs`;
- tenant isolation;
- quota tests.

Implementation:
1. Identify any client/provider coupling.
2. Preserve existing Stripe rows and lifecycle.
3. Introduce only minimal provider/source abstraction if current schema/API requires it.
4. No destructive migration; additive-first only.
5. Keep Android/Google Play as future provider, not implemented purchase flow in this split.

Verification:
- Free stays Free;
- paid Stripe account remains paid;
- checkout/webhook/sync/portal work;
- access checks use backend entitlement.

Commit boundary:
- `refactor(billing): decouple entitlement from purchase provider`

Rollback:
- forward-fix/additive migration; no dropping billing data.

## Task 7 — CI/build isolation
Goal: marketing-only and app-only changes do not execute the entire unrelated surface unnecessarily.

Existing file:
- `.github/workflows/boekuna-integrity.yml`

Implementation:
- split or matrix CI into marketing, app, backend/financial scopes;
- add path filters;
- keep cross-system/full regression gate for release branches or relevant shared changes.

Verification:
- marketing-only diff skips app-heavy work where safe;
- app-only diff skips marketing-only work;
- backend/shared diff runs required cross-system regressions.

Commit boundary:
- `ci(split): scope marketing app and backend verification`

Rollback:
- restore current single workflow.

## Task 8 — Preview deployments
Goal: separate Render preview targets for marketing and app.

Implementation:
- create isolated preview static sites from split branch;
- marketing publish root != app publish root;
- keep production untouched.

Verification:
- real preview URLs return 200;
- browser console/network smoke;
- app auth works against preview allowlist where configured;
- marketing legal/support pages work.

Commit boundary:
- code/config commit if Blueprint used; otherwise record Render service IDs in ledger.

Rollback:
- delete/disable preview services only.

## Task 9 — Full regression and production-readiness gate
Run:
- financial;
- VAT/mixed VAT;
- invoice;
- documents/OCR;
- bank;
- auth;
- billing;
- tenant isolation;
- account reset/deletion;
- marketing;
- app/browser;
- cross-system.

Gate:
- no P0/P1;
- no data-loss risk;
- rollback ready;
- previews verified.

## Task 10 — Production cutover
Only after gate:
1. create/verify marketing production target;
2. create/verify app production target;
3. update DNS/custom domains one at a time;
4. update auth redirects/CORS as needed;
5. update Stripe APP_URL/return behavior to app host;
6. verify every step;
7. preserve old Render URL as rollback path during stabilization.

No irreversible production change without required approval.

## Task 11 — Final documentation
Update:
- `docs/SPLIT_STATE.md`
- `docs/SPLIT_ROUTE_MAP.md`
- `docs/SPLIT_ROLLBACK.md`
- `docs/ANDROID_RELEASE_NEXT.md`

Then perform whole-branch review and final verification.
