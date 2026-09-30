# BOEKUNA Split State

Last updated: 2026-09-30T12:55:00+02:00
Checkpoint: 9 — split previews manually approved; provider-neutral entitlement migration and dual-origin Edge functions live
Branch: `refactor/split-web-app`
Base/main SHA: `ba0fd360dd200841714330d42421f6577beea88c`
Status: IN PROGRESS — production routing/DNS/Auth cutover not yet performed

## Completed work
- Loaded the BOEKUNA embedded split execution contract because the requested Superpowers skill bundle is not installed in this environment.
- Verified repository `kwinstudio/boekuna` and default branch `main`.
- Verified isolated branch name was free and created `refactor/split-web-app` from the current main SHA.
- Inspected current CI, public marketing pages, app source coupling, billing/auth URL coupling, Supabase Edge Function origins, open PRs and Render deployment topology.
- Verified current production Render static site `boekuna-boekhouding` is live from main SHA `ba0fd360dd200841714330d42421f6577beea88c`.
- Verified current processor `kwinest-docprocessor` is live from the same main SHA.

## Architecture evidence
- Product application source: `kwinest/index.html`.
- Public marketing/legal/support pages: `public/**`.
- Current production Render static-site build command: `mkdir -p public && cp kwinest/index.html public/index.html`.
- Consequence: production root is still the combined app/marketing document even though separate public marketing pages already exist.
- Shared backend remains Supabase Auth/Postgres/Storage/Edge Functions plus the Render document processor.
- Billing is server-side Stripe via Supabase Edge Functions; current return URLs use `APP_URL + "/?login=1..."`.
- Marketing source now targets `https://app.boekuna.nl` for product login/registration actions and `https://boekuna.nl` for public canonical/SEO URLs.
- Generated app artifact is auth/dashboard-only and no longer contains the legacy marketing runtime.
- CI is split into scoped pull-request workflows:
  - marketing: `.github/workflows/boekuna-marketing.yml`
  - app: `.github/workflows/boekuna-app.yml`
  - backend: `.github/workflows/boekuna-backend.yml`
- The broad `.github/workflows/boekuna-integrity.yml` remains the explicit cross-system/full release gate via `docs/SPLIT_FULL_GATE.md` or manual dispatch.

## Checkpoint 2 evidence
Implemented:
- standalone marketing source root at `public/index.html`;
- existing characterized homepage body/interactions extracted to `public/assets/homepage.css` and `public/assets/homepage.js` rather than redesigned;
- independent marketing build: `node scripts/build-marketing.mjs` → `dist/marketing`;
- independent product build: `node scripts/build-app.mjs` → `dist/app`;
- generated `dist/` ignored from Git;
- split build boundary contract added to CI.

TDD evidence:
- run #812 / `36651049200`: expected RED at `Split build boundaries` with `AssertionError: marketing must have an explicit independent build script`.
- implementation then added.
- run #816 / `36651165884`: full workflow conclusion `success`, including the split build boundary step.
- run #819 / `36651562928`: corrected behavior-preserving marketing extraction passed split characterization, split build boundaries, accounting, source safety, tenant isolation, Chromium, WebKit, PDF/document browser checks, auth and production calculation regressions at the time of this checkpoint update.

Review:
- no database/schema changes;
- no financial engine changes;
- no processor changes;
- marketing homepage was corrected from an initial simplified draft to a preservation extract after review identified avoidable behavior/content drift.
- remaining temporary coupling: app build currently copies shared `public/assets` wholesale and the legacy `kwinest/index.html` still contains the old marketing flow. This is intentional strangler state and is the next checkpoint target.

## Checkpoints 3–6 evidence
### App-only generated surface
- `scripts/build-app.mjs` strips the legacy marketing runtime from the deploy artifact using strict boundary markers.
- Logged-out product root renders authentication; logged-in flow still enters the existing dashboard/app.
- App legal/back links point to `https://boekuna.nl`.
- App artifact adds `noindex,nofollow`.
- `tests/split-surfaces-browser.test.mjs` browser-smokes generated `dist/marketing` and `dist/app`.
- Run #824 showed `Split generated surface browser smoke: success` before continuing through the legacy suite.

### Public host boundary
- Public canonicals, robots and sitemap are moved from the legacy Render host to `https://boekuna.nl`.
- Marketing login/plan CTAs are moved from same-origin `/?login=1...` to `https://app.boekuna.nl/?login=1...`.
- Expected TDD red: run #825 failed Marketing page QA on the old canonical expectation; implementation and characterization were then advanced.

### App origin / Edge Functions
Browser-facing functions now include `https://app.boekuna.nl` while retaining `https://boekuna-boekhouding.onrender.com` for rollback:
- billing-checkout
- billing-portal
- billing-sync
- email-connection
- send-invoice
- analyze-invoice
- document-processing
- financial-automation

Billing/document APP_URL defaults now target `https://app.boekuna.nl`.
Expected TDD red: run #842 failed because checkout did not yet allow the isolated app origin.

### Provider-neutral entitlement boundary
Branch migration:
- `supabase/migrations/20260930093553_provider_agnostic_billing_entitlements.sql`

Design:
- additive `public.billing_entitlements` table;
- provider-neutral `provider`, `provider_status`, `access_state`, `valid_until` and external refs;
- service-only generic writer `public.apply_subscription_entitlement(...)`;
- existing Stripe `billing_accounts` is preserved;
- existing `public.apply_stripe_subscription_state(...)` remains the Stripe integration boundary and synchronizes generic entitlement state;
- current Stripe rows are backfilled as provider `stripe`;
- `private.entitlement_state_for_user` and `public.billing_effective_plan` read provider-neutral entitlement first with legacy Stripe fallback;
- no destructive drop table/column operation.

Validation:
- full migration executed against the real production schema inside `BEGIN; ... ROLLBACK;` successfully;
- no persistent production database change was made.
- Expected TDD red: run #850 failed because the migration did not exist yet; SQL and billing regression coverage were then added.


## Checkpoint 8 manual preview approval
User manually verified both real Render split previews as good:
- marketing: `https://boekuna-split-marketing-preview.onrender.com`
- app: `https://boekuna-split-app-preview.onrender.com`

This closes the real-surface preview gate. Production DNS/custom domains remain unchanged.

## Checkpoint 9 production pre-cutover changes
Provider-neutral entitlement migration was applied successfully to production Supabase project `vuwfyhtejsxhdfyvkkeq`:
- production migration history now contains `provider_agnostic_billing_entitlements`;
- `public.billing_entitlements` exists;
- backfill parity at verification: 1 qualifying Stripe source row -> 1 Stripe entitlement row;
- `anon` and `authenticated` have no direct SELECT privilege;
- `service_role` retains service access.

Browser-facing Edge Functions were deployed from `refactor/split-web-app` while retaining the legacy Render origin for rollback:
- billing-checkout v15
- billing-portal v6
- billing-sync v7
- email-connection v5
- send-invoice v14
- analyze-invoice v17
- document-processing v3
- financial-automation v3

Supabase live source verification confirms each of these functions contains both `https://app.boekuna.nl` and `https://boekuna-boekhouding.onrender.com` where applicable. External curl smoke could not run because the execution container could not resolve Supabase DNS; this was not treated as a pass.

## Deployment evidence
Production static site:
- service: `boekuna-boekhouding`
- service id: `srv-das3q0d9fdbs73bo0t80`
- branch: `main`
- auto-deploy: off
- publish path: `public`
- live deploy: `dep-dau544hsrm7s73aqvdg0`
- live commit: `ba0fd360dd200841714330d42421f6577beea88c`

Production processor:
- service: `kwinest-docprocessor`
- service id: `srv-dartf4m0tbcc73d00krg`
- branch: `kwinest-hosting`
- auto-deploy: off
- live deploy: `dep-dau545id0e5s73e9o1eg`
- live commit: `ba0fd360dd200841714330d42421f6577beea88c`

QA staging:
- service: `boekuna-qa-staging`
- service id: `srv-dass93gjo6nc73d6oo2g`
- branch: `main`
- build command currently has the same `kwinest/index.html -> public/index.html` coupling.

## Open PR collision risk
Open marketing-related PRs exist, including #69, #55, #18 and #15. Do not overwrite their work; the split branch must rebase/reconcile before any marketing merge.

## Tests / baseline
Checkpoint 1 baseline is verified with fresh GitHub Actions evidence.

Run #808 — workflow `Boekuna integrity tests`
- run id: `36650689401`
- head SHA: `1608cb80f65c82c41a1580d2914753f06e661062`
- conclusion: `success`
- completed steps: 44
- failures: 0
- skipped: 0
- includes accounting integrity, source safety, tenant isolation, Chromium/WebKit smoke, PDF/document regressions, auth, financial calculations, OCR/processor, marketing and billing regressions.

Run #809 — workflow `Boekuna integrity tests`
- run id: `36650818963`
- head SHA: `5dc560c06d806f30697c3d2bb42a364abec3f00a`
- split architecture characterization: `success`
- accounting integrity: `success`
- source safety: `success`
- tenant isolation: `success`
- Chromium smoke: `success`
- WebKit smoke: `success`
- remaining full-suite steps were still running when this ledger checkpoint was written.

Characterization command now enforced by CI:
- `node tests/split-characterization.test.mjs`
- observed result: success in run #809.

## Preview deployment — checkpoint 8
Marketing preview:
- service: `boekuna-split-marketing-preview`
- service id: `srv-dauebi3ncjis73faapg0`
- URL: `https://boekuna-split-marketing-preview.onrender.com`
- branch: `refactor/split-web-app`
- build: `node scripts/build-marketing.mjs`
- publish: `dist/marketing`
- auto-deploy: off
- deploy: `dep-dauebibncjis73faaqk0`
- commit: `ee3b8c4525af731cbace56ce76ae5c9cb7912175`
- Render status: `live`

App preview:
- service: `boekuna-split-app-preview`
- service id: `srv-dauebj1srm7s73bubcog`
- URL: `https://boekuna-split-app-preview.onrender.com`
- branch: `refactor/split-web-app`
- build: `node scripts/build-app.mjs`
- publish: `dist/app`
- auto-deploy: off
- deploy: `dep-dauebj9srm7s73bubejg`
- commit: `ee3b8c4525af731cbace56ce76ae5c9cb7912175`
- Render status: `live`

Render capacity was freed by deleting the two closed/unmerged PR #70 preview services as explicitly approved by the user. No production service was touched.

## Blockers
- No blocker to repository code/test work or split preview deployment.
- Automated external page fetch from this execution environment cannot resolve/access the Render preview domains, so the final real-browser/manual surface smoke still needs completion before production cutover.
- Production DNS/domain cutover has not been attempted.
- Supabase production project is confirmed as `vuwfyhtejsxhdfyvkkeq` (`kwinest`), ACTIVE_HEALTHY.
- Supabase dashboard Site URL / Redirect URLs still require explicit production configuration for `https://app.boekuna.nl`; the currently available Supabase connector does not expose that Auth URL configuration mutation.
- Custom-domain ownership on Render has not yet been changed.

## Known risks
1. Supabase Auth Site URL / exact production redirect allowlist has not yet been changed in the dashboard; signup/reset code already uses `AUTH_REDIRECT_URL`.
2. Production Edge Functions still run their previously deployed versions until an explicit deployment gate; branch code is not live.
3. Production Stripe/Edge `APP_URL` secret/config must be verified/set to `https://app.boekuna.nl` at cutover.
4. PWA manifest is still shared in source and currently uses relative `/?login=1&app=1`; app-host deployment makes it same-origin, but marketing build should eventually stop publishing app-only PWA metadata.
5. Scoped CI is implemented and green; the broad integrity workflow is retained only as the explicit full release gate.
6. Existing open marketing PRs overlap `public/**`; rebase/reconciliation is required before merge.
7. Split previews are now live on Render with auto-deploy disabled. Production remains untouched. Final real-browser/manual preview smoke is still required before any DNS/Auth/Edge cutover.

## Rollback state
No production code/configuration has been changed. Rollback is currently: delete/abandon the split branch. Production remains at the recorded main SHA/deploys.

## Current CI evidence
Current branch HEAD `ee3b8c4525af731cbace56ce76ae5c9cb7912175` has all four verification workflows green:
- `Boekuna integrity tests` run `36701142325` / #869: success, 50/50 steps
- `Boekuna marketing tests` run `36701142193`: success
- `Boekuna app tests` run `36701142190`: success, 26/26 steps
- `Boekuna backend tests` run `36701142341`: success

Scoped-CI contract:
- marketing-only changes avoid OCR/billing backend suites;
- app-only changes avoid marketing visual and OCR backend suites;
- backend changes avoid marketing/app browser-only suites;
- explicit full gate still exercises cross-system regression.

PWA/source isolation:
- marketing build removes the app-only `manifest.webmanifest`;
- app build carries the PWA manifest;
- app build copies a narrowed asset allowlist rather than all public marketing assets.

Android follow-on documentation:
- `docs/ANDROID_RELEASE_NEXT.md` added.
- Android remains blocked until the web split is production-stable.

## Supabase Auth redirect preparation
- User confirmed the manual Supabase Auth URL Configuration step is complete.
- `https://app.boekuna.nl/` has been added to Redirect URLs.
- Existing redirect URLs were intentionally retained.
- Site URL has intentionally not yet been changed.

## Next exact action
Before custom-domain/DNS cutover, add `https://app.boekuna.nl/` to Supabase Auth Redirect URLs while leaving the current Site URL unchanged. This is additive and does not redirect existing production users yet.

Then attach the two Render split services to `boekuna.nl` and `app.boekuna.nl`, update DNS using Render's exact records, and wait for both domains/SSL to be healthy. Only after the app domain is live: switch Supabase Auth Site URL and Edge `APP_URL` to `https://app.boekuna.nl`, then execute full production smoke and retain the legacy Render URL during stabilization.
