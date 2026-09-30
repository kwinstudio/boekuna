# BOEKUNA Developer Mode

Temporary QA-only development convenience. It does **not** replace production Auth, RLS, tenant isolation or Stripe.

## How it works

- Production source/build default is OFF.
- An app preview must be built with `BOEKUNA_DEV_MODE=true`, `BOEKUNA_DEPLOYMENT_ENV=development|preview|staging`, an explicit non-production origin allowlist, and the intended Supabase public URL/key.
- The server-side `dev-session` Edge Function must independently be configured with `BOEKUNA_DEV_MODE`, `BOEKUNA_DEV_ALLOWED_ORIGINS`, `BOEKUNA_DEV_USER_ID`, `BOEKUNA_DEV_USER_EMAIL`, `BOEKUNA_DEV_USER_PASSWORD`, and `BOEKUNA_DEV_ACCESS_KEY`.
- The first preview entry uses the temporary access key to sign in the configured **real Supabase QA user** server-side. The browser never receives the QA password.
- Supabase keeps the real Auth session. Refresh/reopen in the same authenticated browser can renew the temporary developer ticket without repeating the QA password.
- The ticket is bound to QA user + allowed preview origin + non-production environment and expires after at most 12 hours.
- RLS continues to run under the QA user's UUID.
- Developer billing RPCs report the existing `pro` product shape only while a valid developer ticket is present. They do not write `billing_accounts`, `billing_entitlements`, Stripe state or monthly billing usage.
- Stripe Checkout/Portal are blocked in the preview UI while Developer Mode is active.

## Production safeguards

Hard-denied origins include `app.boekuna.nl`, `boekuna.nl`, `www.boekuna.nl` and retained production Render hosts. Missing, invalid or ambiguous configuration fails closed. A production build with the dev flag set is refused by `scripts/build-app.mjs`.

Do not put QA password or preview access key in the repository, browser bundle, `NEXT_PUBLIC_*`, screenshots or logs.

## Enable

1. Create/use a dedicated Supabase QA user containing only test data.
2. Add the server-side Edge Function secrets listed above only in the approved development/preview environment.
3. Apply `supabase/dev-only/migrations/20260930144500_temporary_developer_mode.sql` only to that development/preview database. It is intentionally outside the normal production migration path.
4. Deploy `supabase/dev-only/functions/dev-session/index.ts` there as the `dev-session` function with its custom authentication body enabled.
5. Build the product app with the explicit non-production build variables.
6. Open the protected preview and enter the preview access key once.

If a public preview cannot be access-protected, do not enable Developer Mode on it.

## Disable / remove

- Set/remove `BOEKUNA_DEV_MODE` so the server returns disabled.
- Build without `BOEKUNA_DEV_MODE=true`; the client ships OFF.
- Delete/revoke QA credentials and expire/delete rows in `developer_mode_sessions`.
- Later remove `public/assets/developer-mode.js`, `supabase/dev-only/functions/dev-session`, `supabase/dev-only/migrations/20260930144500_temporary_developer_mode.sql`, the temporary database objects/RPCs and the small app integration points.

Production Auth and Stripe require no rollback because they are never replaced by this mode.
