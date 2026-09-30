# BOEKUNA Split State

Last updated: 2026-09-30T02:25:00+02:00
Checkpoint: 0 — inventory / isolation initialized
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
Fresh split-branch baseline execution is still pending. Current workflow definition and production deploy state are captured. Checkpoint 1 will add split characterization coverage and use PR CI for fresh execution evidence.

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
Checkpoint 1: add characterization tests for the current host/route/build coupling, open a draft PR, run fresh CI, record pass/fail evidence, then begin the minimal structural split.
