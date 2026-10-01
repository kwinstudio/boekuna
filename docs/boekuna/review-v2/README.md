# BOEKUNA V2 — review evidence

Implementation status: **READY FOR BRAND REVIEW**. This is implementation evidence; 05 Brand and 03 Independent QA have not yet approved it. The PR body identifies the exact final HEAD. The frozen before state is main `7096fa914d511beaa726214639be01888ed4107b`.

Original brand source: `8b4c17859aff07bcce6fbc3f02117074571a1e5c`. Font: Inter. Primary: `#123B3A`. Secondary: `#2B736C`.

## Before / after

Each paired image has current-main before on the left and V2 after on the right. These are screenshots of the actual generated public site. The hero boards crop the first viewport; complete homepage boards preserve the full page. Desktop boards are scaled uniformly for review. No content, UI or product image is fabricated.

| Route | 390 × 844 | 1440 × 960 |
|---|---|---|
| Home | [Compare](home-390-hero.webp) | [Compare](home-1440-hero.webp) |
| Features | [Compare](functies-390-hero.webp) | [Compare](functies-1440-hero.webp) |
| Scanner | [Compare](scanner-390-hero.webp) | [Compare](scanner-1440-hero.webp) |
| Product tour | [Compare](hoe-het-werkt-390-hero.webp) | [Compare](hoe-het-werkt-1440-hero.webp) |
| Pricing | [Compare](prijzen-390-hero.webp) | [Compare](prijzen-1440-hero.webp) |
| FAQ | [Compare](faq-390-hero.webp) | [Compare](faq-1440-hero.webp) |
| Privacy | [Compare](privacy-390-hero.webp) | [Compare](privacy-1440-hero.webp) |
| Support | [Compare](support-390-hero.webp) | [Compare](support-1440-hero.webp) |

Full homepage: [desktop](home-1440-complete.webp); mobile document offsets [0–4400](home-390-complete-1.webp), [4400–8800](home-390-complete-2.webp), [8800–13200](home-390-complete-3.webp), [13200–end](home-390-complete-4.webp). Supporting interaction views: [fullscreen menu](mobile-menu-390.png), [support form](support-form-390.png).

The marketing CI workflow uploads `boekuna-marketing-editorial-v2`, containing 84 original full-page PNGs and `qa.json`: 8 routes before/after at 390 and 1440, plus homepage at 320, 430, 768, 1024 and 1920, in both Chromium and WebKit. Its run on the exact PR HEAD is the reproducible full-resolution evidence. Images use reduced motion for a stable static comparison; the browser gate separately exercises ordinary motion, session intro and live preference changes.

## Implementation verification

- [Browser results](local-browser-qa.json): Chromium 141.0.7390.37 and WebKit 26.0; 18 routes; 13 widths; normal and reduced motion; 952 overflow/text-bound checks; 74 WCAG A/AA axe audits; zero reported violations.
- All requested widths: 320, 360, 375, 390, 393, 430, 640, 768, 820, 1024, 1280, 1440 and 1920.
- [Focused motion verification](motion-qa.json): natural intro removal below 1400ms, actual word/in-view animation, spring parallax bounded to 20px, live reduced-motion change and instantaneous close-icon state under reduced motion, in both engines.
- Both immutable content gates pass: headings, paragraphs/labels, links, controls, images, forms/field constraints, inline handlers, metadata, schema and section anchors. Six product/comparison states match the freeze.
- Before/after counts: 18/18 routes, 241/241 headings, 1113/1113 links, 18/18 FAQ entries and 3/3 forms. Missing content: 0. The 72 disclosure summaries also include 54 shared navigation groups.
- Form tests intercept every support/deletion request locally. Required validation and honeypot blocking, plus success/error feedback, pass for all 3 forms in both engines (12 response outcomes). No live support or deletion request is sent.
- Menu checks include fullscreen layout, all disclosure links, close icon, forward/backward Tab wrapping, Escape, focus return, background inert and scroll lock. Product tabs, solution disclosures, desktop dropdowns and every FAQ answer are keyboard tested.
- Internal destinations and same-page anchors resolve, genuine images decode, and no page/console error or unexpected failed network request is observed.
- [App SHA-256 manifest](app-byte-parity.json): all 14 generated app files are byte-identical to the pre-redesign main build. Split build boundaries, CI scopes and generated-surface browser smoke pass. Original shared marketing/homepage/brand assets, robots and sitemap remain unchanged.
- Marketing page/native-regression checks and the 23 verified genuine product-capture checks pass.

The implementation review inspected hierarchy, section rhythm, image crop/angle, mobile stacking, pricing, legal reading, FAQ, forms and complete footer. The 320px WebKit heading regression was corrected with bounded word masks, grid shrinkability and responsive title sizing, while keeping the original wording. These observations do not replace the independent Brand review.

## Design decisions and limits

The design contract is [../DESIGN.md](../DESIGN.md). The existing editorial stylesheet/script are replaced, with no framework migration or extra runtime dependency. Native scrolling retains anchors/history. Root font size respects the user's normal browser setting. Motion uses short transforms/opacity and bounded spring parallax; no permanent animation loop or asset-waiting loader is added. Existing real images/fonts are reused. The two changed design assets add about 3.2KB combined compressed; no performance claim is based on a fabricated Lighthouse score.

No known implementation failure remains in the completed gates. This is local/CI implementation QA, not a production smoke or a test on physical iOS hardware. Visual acceptance and an independent accessibility/security assessment remain with 05 and 03. No merge, production deploy, DNS, Render production, Supabase or app change is part of this PR.

## Handoff

05 — BOEKUNA Brand + Marketing reviews the exact final HEAD recorded in the PR: original palette/Inter/logo, strength of Baseline composition, homepage/subpage hierarchy, light/dark rhythm, real imagery, mobile composition and conversion UX. Return PASS or FAIL with concrete findings.

After 05 PASS, 03 — BOEKUNA Independent QA + Security verifies that same exact HEAD. Only after both approvals does 04 — BOEKUNA DevOps + Release own merge and the normal marketing release. Any code change invalidates earlier HEAD-specific approval and requires the relevant checks/reviews again.
