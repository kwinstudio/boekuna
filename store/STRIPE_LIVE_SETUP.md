# Boekuna Stripe live setup

This repository contains the subscription code. Never commit Stripe secret keys.

## Web plans

- Gratis: €0/month, 10 smart document analyses/month.
- Boekuna: €9.95/month excl. VAT, 100 analyses/month.
- Boekuna Pro: €20/month excl. VAT, 300 analyses/month.
- Founding 100: first 100 successful paid-plan activations get a 90-day free trial, once per Boekuna account.

## Required Supabase Edge Function secrets

Set securely in the Supabase project environment:

- STRIPE_SECRET_KEY — Stripe **live** secret key for production.
- APP_URL — optional; defaults to https://boekuna-boekhouding.onrender.com

Do not put either value in frontend code or Git.

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

The webhook retrieves each incoming event from Stripe by event ID using the account secret before processing it, and billing_events provides idempotency.

## Customer Portal

Activate/configure Stripe Customer Portal for the production account so customers can update billing/payment details and cancel subscriptions. The app creates authenticated portal sessions through the billing-portal Edge Function.

## Tax

Web prices are presented excluding VAT. Checkout uses tax_behavior=exclusive, tax ID collection and Stripe automatic tax. Before enabling live sales, configure the correct Stripe Tax registrations/settings for the legal seller.

## Production smoke test

Use Stripe test mode first:

1. Login with a dedicated Boekuna test account.
2. Start Boekuna checkout.
3. Confirm a Founding 100 reservation gets a 90-day trial.
4. Confirm checkout.session.completed creates/updates billing_accounts.
5. Confirm Settings shows plan, trial date, founder number and usage.
6. Process one document and verify monthly usage increases by exactly 1.
7. Reach/force the quota and verify HTTP 402 prevents both server processing and local scanner fallback.
8. Open Customer Portal and test cancellation.
9. Trigger invoice.payment_failed and confirm status is reflected.
10. Repeat with a non-founding account and confirm there is no trial.
11. Only after test mode passes, set the production live secret and production webhook.

## Native apps

The Stripe flow above is for the web product. Do not expose an external Stripe purchase CTA inside App Store / Google Play builds unless the applicable store rules permit it. Implement store-compliant native subscription purchasing/entitlement sync before native submission where required.
