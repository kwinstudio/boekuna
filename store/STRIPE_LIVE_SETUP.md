# Boekuna Stripe live setup

This repository contains the subscription code. Never commit Stripe secret keys.

## Web plans (Pricing V2, see docs/billing/pricing-v2.md)

All prices incl. 21% VAT (since 2026-10-08). Yearly is paid up front for 12 months and costs exactly 10x the monthly price.

- Start: €0, no Stripe subscription.
- ZZP: €9.95/month or €99.50/year. Sellable.
- Pro: €19.95/month or €199.50/year. Modelled, not sellable yet (feature flag `BILLING_SELLABLE_PLANS`).
- Business: €34.95/month or €349.50/year. Modelled, not sellable yet.

Paid plans have no monthly smart-document quota. Start keeps 10 per month.
Pre-V2 subscriptions ("Boekuna" €9.95 and "Unlimited" €19.95 per month) are read as ZZP and Pro; they are never re-priced automatically.

Stripe prices: one Product per paid plan with a monthly and a yearly recurring price, found by lookup key `boekuna_<plan>_<month|year>_v2`. Create them with `scripts/stripe-pricing-v2-setup.mjs` (test mode first). Checkout refuses a price whose amount, currency, interval or tax behaviour differs from the server config.

## No introductory First-100 offer

The previous First-100 / Early Access campaign is retired. Production must not allocate free paid-plan periods, Stripe trials, founder slots, or Early Access claims. New users remain on Gratis until they explicitly start a paid subscription.

## Required Supabase Edge Function secrets

Set securely in the Supabase project environment:

- STRIPE_SECRET_KEY — Stripe **live** secret key for production.
- APP_URL — optional; defaults to https://app.boekuna.nl
- BILLING_SELLABLE_PLANS — optional; defaults to `zzp`. Comma list of plans Checkout may sell.
- STRIPE_PORTAL_CONFIGURATION_ID — optional `bpc_...` from the setup script; enables Pricing V2 plan/interval switching in the Customer Portal.

Do not put either value in frontend code or Git.

Production evidence on 2026-09-28 confirmed that `billing-checkout` can create a hosted Stripe Checkout session in **live** mode. That proves the live secret is configured; it does not by itself prove the full paid lifecycle.

## Stripe webhook

Production endpoint:

https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/billing-webhook

Subscribe at minimum to:

- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed

The webhook retrieves each incoming event from Stripe by event ID using the account secret before processing it, rejects test/live environment mismatches, and uses `billing_events` for idempotent processing.

## Customer Portal

Activate/configure Stripe Customer Portal for the production account so customers can update billing/payment details, switch plan or billing period and cancel subscriptions. The app creates authenticated portal sessions through the `billing-portal` Edge Function. Upgrades apply at once with proration; downgrades and year-to-month apply at the end of the paid period; cancellation is at period end without refund of the running period.

## Tax

Web prices are presented including VAT. Prices and Checkout use `tax_behavior=inclusive`, tax ID collection and Stripe automatic tax, so Stripe splits the VAT out of the price on the invoice. Stripe Tax must have the Netherlands registration for the legal seller; without it Stripe charges no VAT at all.

Switching existing excl. VAT v2 prices: run `scripts/stripe-pricing-v2-setup.mjs --apply` (plus `--live` for live) with `STRIPE_PORTAL_CONFIGURATION_ID` set. It creates incl. VAT prices that take over the lookup keys, archives the old prices and updates that portal configuration in place.

## Release smoke test

Configuration-only checks may create a Checkout Session but must **not** complete a live payment automatically.

Before public launch, perform one controlled live paid lifecycle with an explicitly authorized real payment method:

1. Login with a dedicated QA account that is not an internal/demo grant.
2. Start ZZP Checkout (monthly and yearly) and confirm the hosted Checkout shows the expected plan, amount, interval, renewal text and VAT behavior.
3. Complete the live payment only with explicit human authorization.
4. Confirm `checkout.session.completed` and subscription events are processed.
5. Confirm `billing_accounts` contains the Stripe customer/subscription, correct plan, active status and period end.
6. Confirm Boekuna shows `paid` entitlement.
7. Open Customer Portal and verify subscription management.
8. Cancel at period end and verify the webhook/sync state returns to Boekuna.
9. Test payment-failure handling in a safe Stripe test environment or another controlled procedure; do not create unnecessary live debt.
10. Clean up the QA subscription and retain release evidence.

For repeatable automated billing tests, use a separate Stripe **test-mode** environment. Never mix test-mode Stripe events with production live billing state.

## Native apps

The Stripe flow above is for the web product. Do not expose an external Stripe purchase CTA inside App Store / Google Play builds unless the applicable store rules permit it. Implement store-compliant native subscription purchasing/entitlement sync before native submission where required.
