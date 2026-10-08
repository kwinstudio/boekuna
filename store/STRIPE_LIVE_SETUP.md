# Boekuna Stripe live setup

This repository contains the subscription code. Never commit Stripe secret keys.

## Web plans

- Gratis: €0/month, 10 smart document analyses/month.
- Boekuna: €9.95/month excl. VAT, 100 smart document analyses/month.
- Unlimited: €19.95/month excl. VAT, no monthly smart-document quota.

## No introductory First-100 offer

The previous First-100 / Early Access campaign is retired. Production must not allocate free paid-plan periods, Stripe trials, founder slots, or Early Access claims. New users remain on Gratis until they explicitly start a paid subscription.

## Required Supabase Edge Function secrets

Set securely in the Supabase project environment:

- STRIPE_SECRET_KEY — Stripe **live** secret key for production.
- APP_URL — optional; defaults to https://app.boekuna.nl

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

Activate/configure Stripe Customer Portal for the production account so customers can update billing/payment details and cancel subscriptions. The app creates authenticated portal sessions through the `billing-portal` Edge Function.

## Tax

Web prices are presented excluding VAT. Checkout uses `tax_behavior=exclusive`, tax ID collection and Stripe automatic tax. Before enabling live sales, verify the correct Stripe Tax registrations/settings for the legal seller.

## Release smoke test

Configuration-only checks may create a Checkout Session but must **not** complete a live payment automatically.

Before public launch, perform one controlled live paid lifecycle with an explicitly authorized real payment method:

1. Login with a dedicated QA account that is not an internal/demo grant.
2. Start Boekuna Checkout and confirm the hosted Checkout shows the expected plan and VAT behavior.
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
