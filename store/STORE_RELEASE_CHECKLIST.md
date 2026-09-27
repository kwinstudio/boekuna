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
- [ ] Stripe live secret configured securely in Supabase Edge Function secrets
- [ ] Stripe production webhook registered and tested
- [ ] Stripe Customer Portal activated/configured
- [ ] Stripe Tax/VAT configuration verified for the legal seller

## Apple App Store

- [ ] Apple Developer Program membership active
- [ ] Final Bundle ID created and matches the binary
- [ ] Version/build numbers set
- [ ] Build produced with Xcode 26 or later and an accepted iOS SDK
- [ ] Final iPhone screenshots captured from the submitted build
- [ ] 1024x1024 app icon included in the asset catalog
- [ ] App Privacy questionnaire completed from privacy-data-safety.md
- [ ] Current age-rating questionnaire completed
- [ ] Support and privacy URLs entered
- [ ] Working reviewer account entered in App Review Information
- [ ] App tested on a physical iPhone
- [ ] No broken/inactive features shown to reviewers
- [ ] If digital subscriptions are sold inside the app, StoreKit/IAP policy is satisfied

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
