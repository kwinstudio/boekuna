# Boekuna 1.0 — Apple App Review notes (draft, 8 October 2026)

**Status:** internal draft for App Store Connect; no iOS build submitted or approved by this document.

## Reviewer instructions (English; copy to App Store Connect)

Boekuna is bookkeeping software for Dutch freelancers and small businesses. It helps users create sales invoices, upload invoices and receipts, review extracted document fields, and view bookkeeping and VAT summaries.

1. Launch Boekuna on an iPhone.
2. Sign in with the private App Review demo account entered in App Store Connect.
3. Open the dashboard to review the sample administration.
4. Create or inspect a sales invoice; share its PDF if the native share flow is enabled.
5. Upload a **synthetic** receipt or invoice using the camera/files flow.
6. Review the recognized supplier, date, amounts and VAT; correct values if needed; save.
7. Inspect the VAT/report screens.
8. Open Settings → Account verwijderen to view the in-app deletion path. The public alternative is https://boekuna.nl/account-verwijderen/.

The demo account must already contain safe, synthetic sample records; do not provide real customer administration. Please contact support@boekuna.nl if access fails.

## Feature limitations — don't claim unsupported capabilities

- OCR is assistive; results must be reviewed before booking.
- VAT reports are preparatory; Boekuna does not directly file tax returns.
- Do not claim live PSD2 bank connectivity, Peppol submission, or automated email delivery without separate production proof.
- File bank import is under active QA and must not be advertised as proven until accepted.
- The 1.0 App Store build is intended to be free to download without in-app payments, Stripe checkout screens, external upgrade links or purchase calls to action.
- Web subscription prices, early-access terms and test entitlements can change; do not paste outdated trial/price descriptions into Apple review notes.
- Do not claim native capability beyond what TR2 has verified on a physical iPhone.

## Private fields only in App Store Connect

- Reviewer account email/password: do **not** commit to GitHub.
- Any one-time passcode / 2FA test procedure: private reviewer instructions.
- Team ID, signing keys and App Store Connect API keys: do **not** commit to GitHub.

## Release gate

iOS PR #223 is a companion shell baseline, not approval. It requires independent TR2 review, successful signing and real iPhone/TestFlight acceptance. Confirm Apple account seller compliance with guideline 5.1.1(ix) before submission.
