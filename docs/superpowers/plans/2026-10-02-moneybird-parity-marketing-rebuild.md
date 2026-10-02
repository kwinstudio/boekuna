# BOEKUNA Moneybird-Parity Marketing Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every public BOEKUNA marketing route into one calm, mature, Moneybird-parity information architecture while keeping BOEKUNA branding, truthful product capabilities, accessibility, pricing safety and strict marketing-only deployment boundaries.

**Architecture:** Keep the existing static public-site architecture. `public/assets/marketing.js` remains the shared shell/runtime, `public/assets/marketing-editorial.css` becomes the unified visual system, route HTML files remain content owners, and `public/assets/homepage.js` is reduced to small homepage-only progressive enhancement. No framework migration and no app/billing/processor changes.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node build scripts, Playwright browser QA, Axe accessibility checks, GitHub Actions, Render marketing service.

**Spec:** `docs/superpowers/specs/2026-10-02-moneybird-parity-marketing-rebuild-design.md`

## Global Constraints

- Marketing-only. Do not modify `kwinest/**`, authenticated app behavior, billing/Stripe wiring, Supabase, OCR/document processor, migrations or database logic.
- Preserve public routes and canonical URLs.
- Preserve BOEKUNA product truth; do not imply direct VAT filing, live/PSD2 bank connection, a BOEKUNA bank account/card, Peppol sending unless actually enabled, inventory, fabricated automation rates, fabricated customer counts, fabricated ratings/awards or fabricated testimonials.
- Preserve public pricing exactly: Gratis €0, Start €6,95, Boekuna €9,95, Unlimited €14,95 per month; paid plans remain non-transactional and clearly “Binnenkort beschikbaar”.
- Keep free registration on `https://app.boekuna.nl/?register=1` and login on `https://app.boekuna.nl/?login=1`.
- Use only first-party BOEKUNA media/assets; never copy Moneybird text, photographs, screenshots, illustrations, icons, logo, CSS, source code or proprietary graphic compositions.
- No competitor name in production HTML/CSS/JS.
- No gradients, glassmorphism, decorative 3D tilt, magnetic buttons, WebGL or scroll hijacking.
- Motion must be non-essential and respect `prefers-reduced-motion: reduce`.
- Mobile controls must not depend on hover and must retain at least 44px touch targets.
- WCAG 2.1 A/AA, visible focus, keyboard-operable menus, one H1 per route and no horizontal overflow at 320–1920px.
- Do not add a new frontend framework or heavy animation dependency.

## Review Focus

1. **Desktop mega-menu keyboard edge cases:** Tab/Shift+Tab, Escape and click-outside must never strand focus or leave two menus open. Task 2 adds exact keyboard/menu-state browser tests.
2. **Small mobile widths with long Dutch labels:** 320px and 360px must not clip, overflow or create unreachable mobile-menu items. Task 2/6 add width-specific menu and page overflow checks.
3. **Truth drift on VAT/bank/product sections:** copy must not accidentally imply live bank connection or direct VAT filing. Task 3/5 add static truth assertions across homepage and product routes.
4. **Pricing CTA leakage:** future paid tiers must never receive a plan/checkout/Stripe URL during shared component refactors. Task 5/6 retain exact negative URL assertions.
5. **Reduced-motion regressions after removing 3D:** no stale depth runtime/CSS or hidden content may remain when reduced motion is enabled. Task 1/4/6 assert absence of depth/magnetic behavior and visibility parity.

---

### Task 1: Replace the old 3D identity contract with the new calm visual-system contract

**Files:**
- Modify: `tests/marketing-editorial-responsive.test.mjs`
- Modify: `tests/marketing-white-content.test.mjs`
- Modify: `public/assets/marketing-editorial.css`
- Modify: `scripts/build-marketing.mjs`

**Interfaces:**
- Consumes: current shared BOEKUNA palette, static marketing build and route list.
- Produces: one shared CSS contract with new cache key `20261002parity`, no 3D/magnetic/depth selectors, unchanged route/build boundaries.

- [ ] **Step 1: Write failing identity tests**

Update the CSS/build assertions so they require:
- `/assets/marketing-editorial.css?v=20261002parity`;
- no `data-depth-root`, `hero-depth-`, `story-depth-`, `kz-magnetic` or perspective/rotateX/rotateY interaction contract;
- no decorative gradients;
- palette remains BOEKUNA-owned;
- build output preserves the parity cache key.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:
`node tests/marketing-white-content.test.mjs && node tests/marketing-editorial-responsive.test.mjs`

Expected: FAIL on the old `20261002depth` key and old depth-contract assertions.

- [ ] **Step 3: Implement the shared visual-system reset**

In `marketing-editorial.css`:
- keep BOEKUNA tokens and Inter;
- establish the calm white/off-white canvas, dark type, turquoise primary accent and amber secondary accent;
- normalize container widths, section spacing, type scale, buttons, cards, media frames, split sections, feature rails, CTA bands, FAQ and footer;
- remove old 3D/perspective/magnetic CSS;
- preserve focus contrast and reduced-motion overrides.

In `build-marketing.mjs`, normalize the new cache key to `20261002parity`.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

Same command.

Expected: PASS for static identity/build contract; responsive content tests may still fail only where later tasks intentionally have not migrated markup yet.

- [ ] **Step 5: Commit**

`git add public/assets/marketing-editorial.css scripts/build-marketing.mjs tests/marketing-editorial-responsive.test.mjs tests/marketing-white-content.test.mjs && git commit -m "test: define calm BOEKUNA marketing parity system"`

---

### Task 2: Rebuild shared desktop/mobile navigation and footer hierarchy

**Files:**
- Modify: `public/assets/marketing.js`
- Modify: `public/assets/marketing-editorial.css`
- Modify: `tests/marketing-v2-browser.test.mjs`
- Modify: `tests/marketing-editorial-responsive.test.mjs`

**Interfaces:**
- Consumes: Task 1 shared CSS primitives/cache contract.
- Produces: `sharedHeader()`, `sharedFooter()`, one active desktop menu at a time, accessible mobile accordion, stable login/register links.

- [ ] **Step 1: Write failing shared-shell tests**

Require desktop groups:
- Product;
- Voor wie;
- Prijzen;
- Ondersteuning;
- Inloggen;
- Gratis starten.

Require Product children:
- Facturen, Documenten, Relaties, Btw & bank, Rapportages, Functies, Hoe het werkt.

Require mobile groups to expose the same destinations.

Browser assertions:
- click opens a menu and sets `aria-expanded=true`;
- opening another closes the previous one;
- Escape closes and restores focus;
- outside click closes;
- mobile menu exposes all desktop destinations;
- 320/360/390/430 have no menu overflow.

- [ ] **Step 2: Run tests and verify RED**

Run:
`node tests/marketing-v2-browser.test.mjs && node tests/marketing-editorial-responsive.test.mjs`

Expected: FAIL because current desktop nav is simple direct links without grouped menus.

- [ ] **Step 3: Implement the shared navigation**

Refactor `sharedHeader()` into:
- logo;
- explicit button-driven Product, Voor wie and Ondersteuning menu controls;
- direct Prijzen link;
- right-side Inloggen + Gratis starten;
- accessible menu panels;
- mobile accordion with same IA.

Add runtime helpers inside `initSharedInteractions()` for:
- one-open-menu state;
- Escape;
- click-outside;
- focus restoration;
- mobile close on navigation.

Do not introduce hover-only state or a dependency.

- [ ] **Step 4: Implement footer parity**

Update `sharedFooter()` to mirror Product / Voor wie / Ondersteuning / Vertrouwen groupings while preserving support/legal/account deletion links.

- [ ] **Step 5: Run tests and verify GREEN**

Same focused commands.

Expected: PASS shared navigation/menu/footer behavior.

- [ ] **Step 6: Commit**

`git add public/assets/marketing.js public/assets/marketing-editorial.css tests/marketing-v2-browser.test.mjs tests/marketing-editorial-responsive.test.mjs && git commit -m "feat: rebuild BOEKUNA public navigation hierarchy"`

---

### Task 3: Rebuild homepage information architecture and truthful product storytelling

**Files:**
- Modify: `public/index.html`
- Modify: `public/assets/homepage.js`
- Modify: `public/assets/marketing-editorial.css`
- Modify: `tests/marketing-white-content.test.mjs`
- Modify: `tests/marketing-editorial-responsive.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–2 shared shell/primitives.
- Produces: homepage section order and semantic hooks: `data-home-section` values `hero`, `feature-rail`, `value`, `product-stories`, `audience`, `mid-cta`, `vat`, `documents`, `bank`, `demo`, `support`, `development`, `pricing`, `faq`, `final-cta`.

- [ ] **Step 1: Write failing homepage structure/truth tests**

Require exact section ordering through `data-home-section`.

Require:
- one H1;
- two hero CTAs;
- feature rail links for Facturen, Documenten, Relaties, Btw, Bankimport, Rapportages;
- product story blocks for bookkeeping, invoices, documents, VAT/bank and reports;
- explicit “geen live bankkoppeling” meaning in bank copy;
- explicit “direct btw indienen is nog niet live” meaning in VAT copy;
- no testimonial names/quotes/customer-count metrics;
- no old `data-depth-root`/3D classes;
- no fake video player;
- pricing summary with all four values and non-transactional paid messaging.

- [ ] **Step 2: Run tests and verify RED**

Run:
`node tests/marketing-white-content.test.mjs && node tests/marketing-editorial-responsive.test.mjs`

Expected: FAIL on section structure and removal of old depth markup.

- [ ] **Step 3: Replace homepage markup**

Rebuild `public/index.html` using the approved 15-section architecture:
- hero;
- feature rail;
- value/grip surface;
- alternating product stories;
- audience break;
- mid CTA;
- VAT;
- documents;
- bank;
- guided 4-step demo;
- support;
- development proof;
- pricing preview;
- FAQ;
- final CTA.

Use only BOEKUNA copy and truthful capabilities.

- [ ] **Step 4: Simplify homepage runtime**

In `homepage.js`:
- delete all pointer-depth and magnetic code;
- keep only progressive enhancement needed for guided 4-step demo or small content controls;
- update state synchronously for accessibility;
- make reduced-motion state static.

- [ ] **Step 5: Add responsive homepage styles**

Implement split-story alternation desktop and copy-before-media mobile. Feature rail becomes native horizontal scroll on small screens. Ensure all product visuals are first-party CSS/HTML compositions or approved local BOEKUNA assets.

- [ ] **Step 6: Run focused tests and verify GREEN**

Same focused commands.

Expected: PASS homepage order, truth, responsiveness and reduced-motion contracts.

- [ ] **Step 7: Commit**

`git add public/index.html public/assets/homepage.js public/assets/marketing-editorial.css tests/marketing-white-content.test.mjs tests/marketing-editorial-responsive.test.mjs && git commit -m "feat: rebuild BOEKUNA homepage product story"`

---

### Task 4: Add calm product-media and demo interaction behavior

**Files:**
- Modify: `public/assets/homepage.js`
- Modify: `public/assets/marketing-editorial.css`
- Modify: `tests/marketing-v2-browser.test.mjs`
- Modify: `tests/marketing-editorial-responsive.test.mjs`

**Interfaces:**
- Consumes: Task 3 homepage semantic hooks.
- Produces: keyboard/tap accessible guided demo with `[data-demo-step]`, `#boekunaDemoStage`, and static reduced-motion fallback.

- [ ] **Step 1: Write failing interaction tests**

Require:
- four `[data-demo-step]` controls;
- Enter/Space activation updates `aria-pressed` and stage content atomically;
- no pointer-move style variables;
- no magnetic class;
- reduced-motion page exposes identical text/content;
- controls remain usable on 390px.

- [ ] **Step 2: Run browser tests and verify RED**

Run:
`node tests/marketing-v2-browser.test.mjs`

Expected: FAIL until the new demo hooks/runtime exist.

- [ ] **Step 3: Implement minimal guided demo runtime**

Create one data map and `setDemoStep(key)` in `homepage.js`. It updates active state, labels and stage copy. Visual transition is opacity/translate only and non-essential.

- [ ] **Step 4: Add restrained CSS transitions**

Use short opacity/translate transitions under normal motion and static output under reduced motion. No transform moves a clickable hit target.

- [ ] **Step 5: Run browser tests and verify GREEN**

Same command.

- [ ] **Step 6: Commit**

`git add public/assets/homepage.js public/assets/marketing-editorial.css tests/marketing-v2-browser.test.mjs tests/marketing-editorial-responsive.test.mjs && git commit -m "feat: add accessible BOEKUNA guided product demo"`

---

### Task 5: Migrate all public subpages into the shared parity system

**Files:**
- Modify:
  - `public/account-verwijderen/index.html`
  - `public/btw-bank/index.html`
  - `public/contact/index.html`
  - `public/facturen/index.html`
  - `public/faq/index.html`
  - `public/functies/index.html`
  - `public/hoe-het-werkt/index.html`
  - `public/over/index.html`
  - `public/prijzen/index.html`
  - `public/privacy/index.html`
  - `public/rapportages/index.html`
  - `public/scanner/index.html`
  - `public/support/index.html`
  - `public/veiligheid/index.html`
  - `public/voor-ondernemers/index.html`
  - `public/voorwaarden/index.html`
- Modify: `public/assets/marketing-editorial.css`
- Modify: `tests/marketing-white-content.test.mjs`

**Interfaces:**
- Consumes: shared shell and visual primitives from Tasks 1–4.
- Produces: four reusable page families expressed by shared classes: product, audience, support/info, legal/pricing.

- [ ] **Step 1: Write failing route-family tests**

For all 16 subpages require:
- parity cache key;
- one H1;
- shared header/footer mounts;
- canonical retained;
- no competitor name/external content image;
- no depth/magnetic classes.

Product routes additionally require:
- semantic hero;
- feature/value block;
- contextual CTA.

Pricing route requires:
- four plans;
- exact prices;
- Boekuna “Meest gekozen”;
- at least three “Binnenkort beschikbaar” states;
- zero `plan=`, Stripe or paid checkout links.

VAT/bank route requires explicit future-state wording for live connection/direct filing.

Legal routes require document-first layout and no marketing carousel/interactive demo.

- [ ] **Step 2: Run route truth tests and verify RED**

Run:
`node tests/marketing-white-content.test.mjs`

Expected: FAIL on old visual contracts/page families.

- [ ] **Step 3: Migrate product pages**

Refactor:
- `facturen`;
- `scanner`;
- `btw-bank`;
- `rapportages`;
- `functies`;
- `hoe-het-werkt`.

Use the shared hero/split/CTA primitives and preserve truthful copy.

- [ ] **Step 4: Migrate audience/support/info pages**

Refactor:
- `voor-ondernemers`;
- `support`;
- `faq`;
- `contact`;
- `over`;
- `veiligheid`.

- [ ] **Step 5: Migrate pricing and legal pages**

Refactor:
- `prijzen`;
- `privacy`;
- `voorwaarden`;
- `account-verwijderen`.

Keep legal pages restrained and text-first.

- [ ] **Step 6: Run truth tests and verify GREEN**

Same command.

- [ ] **Step 7: Commit**

`git add public tests/marketing-white-content.test.mjs && git commit -m "feat: unify BOEKUNA public routes in parity system"`

---

### Task 6: Full responsive, accessibility, browser and artifact non-regression gate

**Files:**
- Modify: `tests/marketing-editorial-responsive.test.mjs`
- Modify: `tests/marketing-v2-browser.test.mjs`
- Modify: marketing CI workflow only if current commands do not already execute the updated gates.

**Interfaces:**
- Consumes: complete marketing artifact from Tasks 1–5.
- Produces: release evidence at 320, 360, 375, 390, 393, 430, 620, 768, 1024, 1280, 1440, 1920 and Chromium/WebKit/Axe coverage.

- [ ] **Step 1: Finalize failing end-to-end assertions before fixes**

Ensure the full suite tests:
- no horizontal overflow on every route/required width;
- desktop/mobile menu parity;
- keyboard focus and Escape;
- reduced motion;
- internal links 200;
- all images load;
- one H1/canonical;
- exact pricing safety;
- no competitor/depth/gradient contracts;
- product truth;
- no app artifact drift;
- no console/page/network errors;
- Axe WCAG A/AA.

- [ ] **Step 2: Run the full existing marketing QA command set**

Run the repository’s marketing CI commands exactly as defined by the current workflow/build scripts. At minimum execute:
- `node scripts/build-marketing.mjs`
- `node tests/marketing-white-content.test.mjs`
- `node tests/marketing-editorial-responsive.test.mjs`
- `node tests/marketing-v2-browser.test.mjs`

Expected: any remaining defect must fail before being fixed.

- [ ] **Step 3: Fix only defects exposed by the release gate**

Use systematic debugging and add/retain the reproducing assertion before each fix.

- [ ] **Step 4: Capture visual evidence**

Generate full-page screenshots for:
- homepage 390 / 1440 / 1920;
- open mobile menu 390 / 430;
- pricing 390 / 768 / 1440;
- FAQ 390 / 1440;
- voor-ondernemers 390 / 1440;
- at least scanner and btw-bank at 390 / 1440.

- [ ] **Step 5: Run full suite to GREEN**

Expected:
- Chromium PASS;
- WebKit PASS where current browser gate covers it;
- Axe WCAG A/AA PASS;
- responsive PASS;
- marketing build PASS;
- app/non-marketing artifact non-regression PASS.

- [ ] **Step 6: Commit**

`git add tests .github scripts public && git commit -m "test: lock BOEKUNA parity rebuild release gates"`

---

### Task 7: PR review, merge, marketing-only deploy and production smoke

**Files:**
- No product files unless a release-gate defect requires a TDD fix.
- PR metadata/comments and deployment state are operational outputs.

**Interfaces:**
- Consumes: green branch from Task 6.
- Produces: merged exact HEAD, marketing-only production deploy, smoke evidence, unchanged app and processor revisions.

- [ ] **Step 1: Verify branch scope and exact head**

Confirm changed files are limited to marketing public assets/routes/tests/docs/build/workflow scope. Confirm merge-base is the intended production main base plus subsequent approved branch commits.

- [ ] **Step 2: Run verification-before-completion**

Run the final whole-branch QA suite again and record exact outputs/head SHA.

- [ ] **Step 3: Create/update PR**

PR body must include:
- scope;
- reference-parity intent without claiming a literal copy;
- exact HEAD;
- truth constraints;
- test matrix;
- visual evidence;
- explicit app/billing/processor non-change statement.

- [ ] **Step 4: Whole-branch code review**

Use superpowers:requesting-code-review. If no subagent tool exists, perform the required separate self-review and disclose that it is weaker than independent review. Critical/Important findings require one TDD fix pass and full-suite rerun.

- [ ] **Step 5: Merge exact reviewed HEAD**

Only after all required checks are green. Use expected HEAD locking; do not merge a different revision.

- [ ] **Step 6: Deploy marketing service only**

Trigger Render marketing service from the exact merge commit. Do not deploy the app or processor.

- [ ] **Step 7: Production smoke**

Verify on `https://boekuna.nl`:
- homepage loads;
- new shared nav/menu;
- pricing values and “Binnenkort beschikbaar” safety;
- scanner, btw-bank, FAQ and voor-ondernemers routes;
- parity CSS/JS cache keys;
- no obvious console/content errors when browser verification is available.

Confirm:
- marketing deploy = exact merge commit;
- app revision unchanged from pre-release;
- processor revision unchanged from pre-release.

- [ ] **Step 8: Post release evidence**

Add PR/release comment with merge SHA, deploy ID, smoke results, test results and unchanged app/processor revisions.
