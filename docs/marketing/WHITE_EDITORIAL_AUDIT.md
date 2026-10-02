# BOEKUNA — White Editorial audit

Content baseline main: `71da7f3a939cad6a4c208bf221a70b1a6c5604bf`.
Integrated main / app parity baseline: `5fc860e9a6964b63d579239be7bf54bad00805fc`.
Branch: `marketing/white-editorial-foodhallen-direction-20261002`.

## Public inventory and content contract

Each row was compared in the browser against immutable Git baseline HTML. Layout, order and wrapper classes are presentation; all accurate headings, sentences, prices, feature claims, CTA/button labels, destinations, forms, validation attributes, SEO metadata, images and dynamic states are preserved. Original inline form handlers and schema remain verbatim. No pricing or legal rewrite.

| Route | Content / CTA | SEO / canonical | Image-free | Shared white system |
| --- | --- | --- | --- | --- |
| `/` | Preserved¹ | Preserved | Yes | Yes |
| `/functies/` | Preserved¹ | Preserved | Yes | Yes |
| `/facturen/` | Preserved¹ | Preserved | Yes | Yes |
| `/scanner/` | Preserved¹ | Preserved | Yes | Yes |
| `/btw-bank/` | Preserved¹ | Preserved | Yes | Yes |
| `/rapportages/` | Preserved¹ | Preserved | Yes | Yes |
| `/hoe-het-werkt/` | Preserved¹ | Preserved | Yes | Yes |
| `/voor-ondernemers/` | Preserved¹ | Preserved | Yes | Yes |
| `/prijzen/` | Preserved¹ | Preserved | Yes | Yes |
| `/faq/` | Preserved¹ | Preserved | Yes | Yes |
| `/over/` | Preserved¹ | Preserved | Yes | Yes |
| `/veiligheid/` | Preserved¹ | Preserved | Yes | Yes |
| `/privacy/` | Preserved¹ | Preserved | Yes | Yes |
| `/voorwaarden/` | Preserved¹ | Preserved | Yes | Yes |
| `/support/` | Preserved¹ | Preserved | Yes | Yes |
| `/contact/` | Preserved¹ | Preserved | Yes | Yes |
| `/account-verwijderen/` | Preserved¹ | Preserved | Yes | Yes |
| `/404.html` | Preserved¹ | Preserved | Yes | Yes |

¹ Six obsolete captions described screenshots/demo images which had already been removed on main. They no longer accurately described the page. These are the only copy removals; all non-media product information is retained. The product-selector accessible name changes from “Bekijk echte Boekuna schermen” to “Bekijk Boekuna onderdelen” to describe its text-only state accurately. Its labels, four captions and destinations remain identical.

| Route | Removed obsolete caption |
| --- | --- |
| `/` | Echte Boekuna-interface |
| `/functies/` | Echte Boekuna-interface · Dashboard uit de vaste demo-administratie |
| `/facturen/` | Echte Boekuna-interface · veilige fictieve demo-administratie |
| `/btw-bank/` | Echte Boekuna-interface · indicatief btw-overzicht uit fictieve demo-data |
| `/rapportages/` | Echte Boekuna-interface · rapportage op basis van dezelfde fictieve demo-administratie |
| `/voor-ondernemers/` | Echte Boekuna-interface · dezelfde fictieve demo-administratie op desktop |

The now-empty home screenshot-proof section is removed with its obsolete caption. Other content and section anchors remain. The scanner’s explanatory reviewflow label and other accurate explanatory notes remain visible and are styled as text, never media placeholders. Existing fake-window wrapper classes become plain fact-sheet classes, with all their text retained. The existing illustrative €121/21% VAT explanation is presented as text rather than a fake product screen.

## Boundary and parallel work

- `kwinest/index.html`, documentprocessor, Supabase, migrations, auth, billing, financial logic, app navigation, KVK and scanflow are untouched.
- `scripts/build-app.mjs` and `scripts/build-marketing.mjs` are unchanged.
- Neither marketing-editorial CSS nor JS is referenced by app source or copied by the app build.
- Existing shared assets, manifest and underlying marketing/homepage CSS/JS remain byte-identical to baseline.
- App non-regression compares every generated filename and SHA-256 digest: 16 files must remain byte-identical to base. Both builds run successfully.
- Open parallel PR #120 (`45173a1d0b4cac15bd6c9e44462dadeae176b9ea`) changes app source, mobile assets, split build scripts and app tests. This PR does not edit any of those files.
- Scan/processor PR #121 merged into main during handoff. Main `5fc860e9a6964b63d579239be7bf54bad00805fc` is integrated into this branch without conflicts; all scanner changes are preserved. Relative to this current main, this PR does not edit app/processor source, app/backend workflows or app/scan tests.
- No file intersection with #120 or the merged #121 change set. Older marketing drafts #69/#55/#18/#15 are not a baseline and are not merged or overwritten.
- Before review/release, refresh main and file lists. If newer main changes either artifact, rerun the corresponding comparison and freeze a new exact HEAD before approving.

## Verified results

- Marketing and app builds: PASS.
- Content/SEO/CTA/form-handler parity: PASS, 18 routes and every original interactive state.
- No content images: PASS, 20 generated HTML files; product capture directory absent from marketing output.
- Chromium 141.0.7390.37 + WebKit 26.0: PASS, 952 layout checks, all 13 widths, default and reduced motion.
- Axe WCAG A/AA: PASS, zero violations in 74 page/menu audits.
- Forms: PASS, validation, honeypot and success/error contract for all three forms in both engines, 12 intercepted submissions.
- Navigation, focus trap/restoration, dropdowns, selector, comparison, solution disclosures, FAQ, routes and no-JS content: PASS.
- Split boundaries/origins/CI scopes and generated surface browser smoke: PASS.
- App artifact: 16 files byte-identical to integrated main `5fc860e9a6964b63d579239be7bf54bad00805fc`; marketing-only and deliberate app/shared drift rejection tests PASS.
- Screenshots: 164 complete before/after captures across both engines, every public route at 390/1440, additional home widths.
- Whitespace/diff check: PASS.

Local WebKit used the standard Playwright 1.56.1 browser with its missing shared libraries extracted in scratch and made available to its launcher. Only the environment dependency preflight was skipped after a successful actual WebKit launch; the complete page, layout, Axe, form and interaction suite ran without skips. CI installs the normal browser dependencies and does not set that flag.

## QA evidence

Content parity and browser results are saved by scoped CI under `boekuna-marketing-white-editorial`. Reports: `content.json` and `qa.json`; full-page screenshots: `after-<route>-390-<engine>.png` and `after-<route>-1440-<engine>.png`, plus home at 320/430/768/1024/1920. Both engines also capture the immutable before state.

Representative committed viewport captures (full-page coverage is in CI):

- [Homepage · 1440](evidence/white-editorial/home-1440.png)
- [Homepage · 390](evidence/white-editorial/home-390.png)
- [Prijzen · 1440](evidence/white-editorial/prijzen-1440.png)
- [Hoe het werkt · 390](evidence/white-editorial/hoe-het-werkt-390.png)

Required checks:

```sh
node scripts/build-marketing.mjs
node scripts/build-app.mjs
node tests/marketing-white-content.test.mjs
node tests/marketing-pages.test.mjs
node tests/marketing-product-proof.test.mjs
node tests/marketing-editorial-responsive.test.mjs
node tests/marketing-v2-browser.test.mjs
node tests/split-build-boundaries.test.mjs
node tests/marketing-app-non-regression.test.mjs
node tests/split-surface-non-regression.test.mjs
node tests/split-origin-boundaries.test.mjs
node tests/split-ci-scopes.test.mjs
node tests/split-surfaces-browser.test.mjs
```

The new parity gate intentionally uses the current immutable main SHA. Historic v1/v2 fixtures remain unchanged; their checks assumed the old dark hero and screenshot-derived layout and are not the authority for the new visual spec. Responsive assertions now verify a white/petrol hero. The browser gate retains original contracts for menu, product selector, disclosures, comparison, FAQ, routes, forms and accessibility; only removed motion expectations and evidence coverage change.

## Limitations and release state

Form success/error/validation/honeypot checks intercept requests locally. No real support or deletion cases are created. Existing backend behavior is unchanged; this is not a live delivery test. Automated Axe covers WCAG A/AA on every route at 390 and 1440, plus the open menu; it does not replace independent manual assistive-technology review.

Production has not been merged or deployed by this work. Independent Brand + Marketing (05) and QA + Security (03) reviews must inspect the same exact PR HEAD. Only after required PASS does 04 release the marketing service. No app deployment is authorized by this PR.
