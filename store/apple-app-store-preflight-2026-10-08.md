# BOEKUNA — Apple App Store preparation handoff (8 October 2026)

## Scope and source of truth
Docs-only preparation, no app/backend/marketing mutations, no iOS signing, no Apple account form submissions. Existing app, production backend and marketing are authoritative.

## Prior progress to VERIFY directly in Apple (not re-register)
- Apple Developer membership: previously reported active as Individual for Dutch sole proprietor.
- App ID: nl.boekuna.app.
- App Store Connect record: Boekuna, nl-NL, SKU boekuna-ios-001, Prepare for Submission.
- Free Apps Agreement and DSA trader status: previously reported active/completed.
- Neither this document nor a prior assistant statement proves the current live status.

## Public URLs checked 8 October 2026
- https://boekuna.nl/ (public site available)
- https://boekuna.nl/privacy/ (public privacy page available)
- https://boekuna.nl/support/ (public support page available)
- https://boekuna.nl/account-verwijderen/ (public deletion instructions/request page available)
HTTP-readable pages do NOT prove that support and deletion form submissions or authenticated in-app deletion have passed end-to-end checks.

## Canonical metadata
- Name: Boekuna
- Subtitle: Boekhouden zonder gedoe
- Language: Dutch (nl-NL)
- Category: Finance; Secondary: Business
- Version: 1.0.0
- Bundle ID: nl.boekuna.app
- SKU: boekuna-ios-001
- Distribution: Netherlands first
- App download: free; no in-app purchase or outside-purchase CTA in v1
- Privacy: https://boekuna.nl/privacy/
- Support: https://boekuna.nl/support/
- Marketing: https://boekuna.nl/
- Account deletion: https://boekuna.nl/account-verwijderen/
- Brand canonical: #1B1F23, #63D471, #F6F7F8, #FFFFFF. Do not design a new logo. Production icon changed 8 October to a white receipt on BOEKUNA green; confirm the same exact asset in iOS target.

## Legal risk — do not bypass
Apple guideline 5.1.1(ix) requires submission by a legal entity, not an individual developer, for apps providing highly regulated financial services or requiring sensitive user information. BOEKUNA is bookkeeping, not a bank; classification is not confirmed. Given financial documents and sensitive data, raise this with Apple before submission. Individual enrollment may need conversion/new eligible entity if Apple says so. Do not claim it already complies.

Suggested Apple Developer Support question:
'We are developing Boekuna, a Dutch small-business bookkeeping app (invoice/receipt uploads, OCR review and VAT summaries, no bank custody, lending or investment services). The publisher is a Dutch sole proprietor enrolled in the Apple Developer Program as an Individual. Given guideline 5.1.1(ix) for financial services/sensitive user information, is submission from this Individual account acceptable for this specific bookkeeping companion app, or is enrollment as an organization required? What documentation would Apple expect?'

## Technical blocker / ownership
PR #223 contains SwiftUI + WKWebView iPhone baseline for nl.boekuna.app; it is not present under ios/ on current main at this check. TR2 independent review and exact-head CI required before merge. Signed archive, Team ID, TestFlight deployment and real-device acceptance not confirmed.

## Apple privacy mapping — DO NOT blindly select
- Likely: Contact Info (email, user/business contacts), Financial Info (invoices/transactions), User Content (uploaded files), Identifiers (account ID), diagnostics if collected.
- These are typically linked to the user and used for app functionality/account management.
- Tracking and advertising are described as absent, but verify actual SDKs and data practices.
- Consider third-party providers (Supabase, Render, Stripe for web entitlements, email provider) using Apple's current definitions.
- Confirm what the mobile version actually collects and which user data may be sent outside the app before publishing labels.

## Required screenshots
Use real, approved screenshots from the final binary (not website mockups or hand-drawn UI), minimum 1 screenshot on required iPhone size. Preferred marketing set of five: dashboard, create invoice, upload receipt, review values, VAT overview. Remove personal data and use a synthetic demo account. 
Use accepted resolutions shown at https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications; e.g. 1179×2556 or 1206×2622 for medium Dynamic Island, or accepted large Dynamic Island sizes.
Do not upload before screenshot/user interface matches the final build.

## Final handoff list
1. Apple Developer Account Holder: verify membership, app record, DSA and seller status; ask Apple about guideline 5.1.1(ix).
2. Product/TR2: sign and distribute iOS build, validate native camera, PDF share, auth, error recovery, full account deletion flow.
3. Product owner: provide review-safe synthetic demo data; keep login credentials OUT of GitHub and public ZIP.
4. Store owner: fill privacy survey, age rating and metadata after validating final binary; upload final screenshots.
5. Review submission: request only after all gates pass.

## References
- Apple review: https://developer.apple.com/app-store/review/
- Apple guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Apple screenshots: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- iOS packaging baseline: https://github.com/kwinstudio/boekuna/pull/223
