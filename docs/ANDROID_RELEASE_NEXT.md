# BOEKUNA Android Release — Next Phase

Status: blocked until the web split is stable in production.

## Release principle
The Android/Google Play release is a follow-on phase. Do not create a separate backend, account system or financial data model.

Android must use the same:
- Supabase Auth users;
- administration / ledger data;
- document storage;
- financial truth;
- entitlement authority;
- backend Edge Functions;
- document processor.

## Web prerequisites before Android work starts
All of the following must be true:
1. `https://boekuna.nl` serves public marketing/legal/support only.
2. `https://app.boekuna.nl` serves auth + product app only.
3. Signup, login, logout, email confirmation and password reset work on the app host.
4. Existing administrations survive the web cutover unchanged.
5. Stripe subscriptions continue to grant provider-neutral entitlement.
6. Privacy, support and account deletion URLs are publicly reachable.
7. Production smoke and rollback verification are complete.
8. No open P0/P1 release blocker remains.

## Suggested Android architecture
Start with the smallest shell that preserves the existing web product:
- Android app shell / Trusted Web Activity or equivalent thin native container for `https://app.boekuna.nl`.
- Browser-auth compatible Supabase session flow.
- External public/legal URLs open to `https://boekuna.nl`.
- No embedded service-role secrets or backend credentials.
- No duplicated local financial engine as source of truth.

A deeper native rewrite should be considered only after the web split is stable and Android usage proves a need.

## Required public Google Play URLs
Use the public host:
- Privacy: `https://boekuna.nl/privacy/`
- Support: `https://boekuna.nl/support/`
- Account deletion: `https://boekuna.nl/account-verwijderen/`
- Terms: `https://boekuna.nl/voorwaarden/`

## Authentication
Android must authenticate against the existing Supabase project.

Required tests:
- fresh registration;
- email verification;
- existing-user login;
- logout;
- password reset;
- expired verification/reset link;
- MFA when enabled;
- session restore after app restart;
- account deletion flow.

Do not copy sessions manually between hosts/apps.

## Billing / Google Play
Stripe remains the web purchase provider.

For Android paid digital access:
- Google Play Billing becomes an additional purchase provider;
- Play purchase/webhook verification must write into the same provider-neutral entitlement authority;
- the app must read entitlement, not infer access from `provider === "stripe"` or `provider === "google_play"`;
- no duplicate administration should be created when the same user signs in on web and Android.

Provider-neutral target:
`user/account -> entitlement -> plan/access state -> provider-specific evidence`

## Google Play billing implementation later
Expected server-side flow:
1. user purchases a Play subscription;
2. Android sends purchase token + product id to backend;
3. backend verifies with Google Play Developer API;
4. backend maps product to BOEKUNA plan;
5. backend writes/updates `billing_entitlements` with provider `google_play`;
6. renewals/cancellations/refunds are reconciled server-side;
7. client refreshes effective entitlement through the existing backend authority.

Do not trust a client-only purchase flag.

## Android-specific QA
Minimum:
- supported Android versions/device classes;
- portrait layouts at common widths;
- soft keyboard/form behavior;
- file picker and camera/photo upload;
- PDF/image document upload;
- network interruption / resume;
- background/foreground session behavior;
- invoice PDF download/share;
- external mail/share handoff;
- deep links to auth callbacks;
- accessibility;
- account deletion;
- billing restore;
- subscription upgrade/downgrade/cancel;
- entitlement sync across Android and web.

## Store metadata
Before submission:
- app name: Boekuna;
- category: Finance / Business as appropriate;
- privacy policy URL from public host;
- support URL from public host;
- account deletion URL from public host;
- data-safety declaration must reflect actual production data flows;
- screenshots must show current production app UI;
- no claim of automated tax filing if the product does not provide it.

## Release gate
Android is not ready for Play submission until:
- the split web production release has passed stabilization;
- Google Play purchase verification is implemented server-side;
- provider-neutral entitlement integration is tested;
- store data-safety/privacy disclosures match actual production behavior;
- production rollback/recovery plan exists.

## Rollback
Android rollback must never delete or rewrite shared web financial data.
If a mobile release is faulty:
- halt/pause the store rollout;
- keep web access operational;
- disable the affected mobile integration path server-side if needed;
- preserve entitlement history and customer administration;
- ship a corrected Android build.
