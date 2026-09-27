# Boekuna 1.0 — Review notes (NL/EN ready)

## Reviewer path

1. Open Boekuna.
2. Sign in with the App Review / Play review test account supplied in the store console.
3. Dashboard shows the bookkeeping overview.
4. Open **Facturen** to inspect/create a sales invoice.
5. Open **Inkoop & kosten** or use **Boeking toevoegen** to import an invoice/receipt.
6. The document scanner extracts data and always presents a **Document controleren** flow before save.
7. Open **Btw** and **Rapportages** to see calculated administrative summaries.
8. Account deletion is available in account/settings. A public deletion-request page is also available.

## Important functional notes

- OCR/document extraction is assistive. It does not silently post recognized financial data.
- VAT totals are checked arithmetically where possible.
- A VAT overview is preparatory; Boekuna does not claim to file directly with the Dutch tax authority.
- External PSD2/Peppol capabilities must not be described as active unless the production integration is actually enabled.
- If transactional email is not production-configured at submission time, do not expose a broken send action in the submitted mobile build.

## Monetization

The web version of Boekuna now has three entitlement levels:

- Gratis — 10 smart document analyses/month.
- Boekuna — €9.95/month excl. VAT, 100 analyses/month.
- Boekuna Pro — €20/month excl. VAT, 300 analyses/month.
- The first 100 successful paid-plan activations can receive a 90-day Stripe trial before monthly renewal.

**Native store warning:** web Stripe Checkout must not simply be exposed as an external purchase flow inside the submitted iOS/Android app unless the applicable store rules explicitly allow it. Before native submission, choose the compliant native purchase/entitlement route (for example StoreKit / Google Play Billing where required), hide non-compliant external purchase CTAs from that build, and re-test entitlement sync.

## Reviewer credentials

Add the final test credentials in App Store Connect / Play Console, not in this repository.
