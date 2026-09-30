# BOEKUNA Split Rollback

Status: safe pre-cutover procedure. Production has not been changed by the split branch.

## Pre-cutover state
Repository main SHA:
`ba0fd360dd200841714330d42421f6577beea88c`

Production static site:
- Render service: `boekuna-boekhouding`
- ID: `srv-das3q0d9fdbs73bo0t80`
- branch: `main`
- build: `mkdir -p public && cp kwinest/index.html public/index.html`
- publish: `public`
- known-good deploy: `dep-dau544hsrm7s73aqvdg0`
- known-good source SHA: `ba0fd360dd200841714330d42421f6577beea88c`

Production document processor:
- Render service: `kwinest-docprocessor`
- ID: `srv-dartf4m0tbcc73d00krg`
- known-good deploy: `dep-dau545id0e5s73e9o1eg`
- known-good source SHA: `ba0fd360dd200841714330d42421f6577beea88c`

## Before production cutover
Record:
- exact marketing service/deploy ID;
- exact app service/deploy ID;
- current DNS records/TTL;
- current Render custom-domain attachments;
- current Supabase Site URL + redirect URLs;
- current Edge Function origin config/deployed versions;
- current Stripe/APP_URL configuration;
- current processor URL/environment.

Do not continue if this evidence is missing.

## Code rollback
If a merged split commit causes regression before DNS cutover:
1. redeploy the known-good main SHA on the existing production static site;
2. do not alter database data;
3. leave the processor on the last known-good deploy unless processor code is the fault;
4. verify root, login, dashboard, invoice, document upload and billing summary.

## Marketing DNS rollback
If `boekuna.nl` cutover fails:
1. restore the pre-cutover DNS/custom-domain target exactly;
2. keep old Render production service active;
3. verify TLS and root/public legal URLs;
4. do not change app/auth settings simultaneously while diagnosing.

## App DNS rollback
If `app.boekuna.nl` fails:
1. detach/restore the app subdomain target to the last known-good target or remove the new record;
2. return marketing CTA links to the last known-good combined URL if necessary;
3. restore Supabase redirect allowlist only if the added origin itself caused failure;
4. verify old `/?login=1` login remains functional.

## Auth configuration rollback
If login/reset/callback breaks:
1. restore the exact pre-cutover Supabase Site URL/redirect list;
2. keep both old and new safe redirect URLs during transition when possible;
3. redeploy prior Edge Function origin configuration if changed;
4. verify login, logout, password reset, email verification and session refresh.

## Billing rollback
If Stripe checkout/portal returns to the wrong host:
1. restore previous `APP_URL`/billing return configuration;
2. do not modify subscription rows manually;
3. verify checkout session ownership, webhook processing and entitlement state;
4. never delete billing events/subscriptions as a rollback shortcut.

## Database rollback
Default: no database migration is required for the host split.
If an additive entitlement-provider migration becomes necessary:
- prefer forward-fix;
- do not drop existing columns/tables during cutover;
- do not rewrite historical billing or financial rows;
- restore application compatibility before considering schema removal.

## Verification after rollback
Minimum smoke:
- public root returns 200;
- privacy/support/account-deletion pages return 200;
- login renders;
- existing user can enter dashboard;
- existing administration is visible;
- invoice create/open path works;
- document upload/review path works;
- billing summary is unchanged;
- processor health is normal;
- no new server errors.

## Recovery objective
The legacy combined Render static site stays available until the split has passed production verification. That makes rollback a routing/deployment reversal rather than a data migration recovery.
