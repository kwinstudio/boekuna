# Boekuna — Store release checklist

## Already prepared in repository

- [x] Public privacy policy
- [x] Public support form
- [x] Public account-deletion request flow
- [x] In-app account deletion
- [x] Dutch App Store metadata draft
- [x] Dutch Google Play metadata draft
- [x] Privacy/Data Safety mapping
- [x] Review notes
- [x] No advertising/tracking claim in launch metadata
- [x] Store-ready web manifest / mobile-web metadata
- [x] Web subscription schema, quota logic and Stripe Checkout/Portal endpoints
- [x] Stripe live secret configured securely in Supabase Edge Function secrets — verified by live-mode hosted Checkout session creation on 2026-09-28
- [ ] Stripe production webhook registered and tested
- [ ] Stripe Customer Portal activated/configured
- [ ] Stripe Tax/VAT configuration verified for the legal seller

## Apple App Store — status as of 8 October 2026

- [x] Apple Developer Program membership previously reported active (6 October; confirm live in account).
- [x] App Store Connect app record previously created for `Boekuna` (confirm live in account).
- [x] Bundle ID previously registered: `nl.boekuna.app`; confirm the final binary uses it.
- [x] DSA trader verification previously reported completed (confirm live in account).
- [x] Dutch submission copy revised using the current `boekuna.nl` URLs.
- [ ] Confirm Apple legal-entity / Individual-account admissibility for bookkeeping handling sensitive financial data (guideline 5.1.1(ix)).
- [ ] Complete exact-build App Privacy questions and age-rating questionnaire in App Store Connect.
- [ ] Verify support, privacy and account-deletion flows end-to-end under the final production build.
- [ ] Verify copyright/legal seller name against the actual Apple developer identity.
- [ ] Merge iOS packaging PR #223 only after TR2 review, then generate signed iPhone binary.
- [ ] Validate physical iPhone camera, OCR upload, PDF share, auth, network recovery, and account deletion.
- [ ] Provide a synthetic demo administration and private reviewer credentials in App Store Connect.
- [ ] Remove/hide Stripe Checkout and external purchasing CTAs in the submitted app; re-test.
- [ ] Take true screenshots of the final iPhone build (required supported resolutions).
- [ ] Upload and accept TestFlight build; complete external or internal testing as appropriate.
- [ ] Final submit for Apple review only after all technical/legal/privacy gates pass.

## Google Play

- [ ] Play Console developer account verified
- [ ] Final package name created and matches the AAB
- [ ] Android App Bundle signed and uploaded
- [ ] targetSdkVersion / target API is 36 or higher for a new mobile app submitted after 31 Aug 2026
- [ ] 512x512 Play icon uploaded
- [ ] 1024x500 feature graphic uploaded
- [ ] At least two final phone screenshots uploaded
- [ ] Data Safety form completed
- [ ] Account deletion URL entered
- [ ] App access / review credentials entered
- [ ] Content rating questionnaire completed
- [ ] Target audience declared
- [ ] Ads declaration = No
- [ ] If digital subscriptions are sold inside the app, Google Play Billing/payment policy is satisfied

## Do not submit until

- final binaries are built and tested;
- reviewer credentials work;
- screenshots match the submitted version;
- every feature visible in the mobile build is functional;
- store privacy answers match the exact SDKs and network behavior of the final binary.
