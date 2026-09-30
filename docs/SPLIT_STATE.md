# BOEKUNA Split State

Last updated: 2026-09-30T02:25:00+02:00
Checkpoint: 1 — baseline characterized and verified
Branch: `refactor/split-web-app`
Base/main SHA: `ba0fd360dd200841714330d42421f6577beea88c`
Status: IN PROGRESS

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
- Current public marketing CTAs still target same-origin `/?login=1`.
- Current CI is one broad workflow `.github/workflows/boekuna-integrity.yml`, with app, backend, browser, financial, processor and marketing checks in the same job.

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

## Blockers
- No blocker to code/test work.
- Production DNS/domain cutover has not been attempted.
- Supabase dashboard auth redirect configuration has not yet been read/changed.
- Custom-domain ownership on Render has not yet been changed.

## Known risks
1. Auth callback/reset links currently assume the existing same-origin combined site.
2. Stripe checkout/portal return URLs currently use the existing `APP_URL` shape.
3. Supabase Edge Function CORS allowlists contain the old Render URL and `boekuna.nl`; `app.boekuna.nl` needs explicit verification/addition.
4. Public canonicals still reference the old Render host and need a controlled SEO cutover to `boekuna.nl`.
5. PWA start URL currently points to `/?login=1&app=1` and must become app-host aware.
6. Marketing and app tests are currently coupled into one workflow/job.
7. Existing open marketing PRs may overlap `public/**`.

## Rollback state
No production code/configuration has been changed. Rollback is currently: delete/abandon the split branch. Production remains at the recorded main SHA/deploys.

## Next exact action
Checkpoint 2: introduce explicit independent build outputs for marketing and product app without changing financial/backend behavior. First create build-boundary tests, then build scripts/outputs. Production Render services remain untouched.
