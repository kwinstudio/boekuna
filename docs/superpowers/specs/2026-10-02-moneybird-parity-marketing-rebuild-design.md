# BOEKUNA — Moneybird-parity marketing rebuild design

Date: 2026-10-02  
Branch: `marketing/moneybird-parity-rebuild-20261002`  
Base: `713713fc195a08ef5b9fe4c5fdcf3364a67b0934`

## 1. Intent

Rebuild the public BOEKUNA marketing website so it uses the same class of information architecture, section rhythm, density, whitespace, product storytelling and interaction grammar as the current Moneybird public website, while remaining visibly and legally BOEKUNA.

Success means a visitor who knows Moneybird recognizes the same level of maturity and navigational clarity, without seeing copied Moneybird brand assets, copy, photography, source code or false BOEKUNA product claims.

This is marketing-only. The authenticated BOEKUNA app, billing, Stripe, Supabase, document processor and OCR stack are outside scope.

## 2. Reference observations

The live Moneybird homepage inspected on 2026-10-02 uses these recurring patterns:

- compact global navigation with large grouped menus;
- very large, direct hero statement with two primary actions;
- horizontal function/topic links immediately below the hero;
- a large trust/value section with strong statement, supporting principles and metrics;
- long alternating product story sections combining editorial copy with app or lifestyle media;
- entrepreneur/customer story sections used as social proof;
- dedicated product sections for invoices, bookkeeping/VAT, document analysis and bank-related workflows;
- a large support/ecosystem section;
- a development/changelog proof section;
- a large FAQ near the bottom;
- generous white space, large type and restrained motion rather than decorative animation.

Reference URLs:
- https://www.moneybird.nl/
- https://www.moneybird.nl/functies/
- https://www.moneybird.nl/functies/boekhouding/
- https://www.moneybird.nl/mobiel/

The reference is used only for structure and interaction grammar. Do not copy Moneybird text, photographs, screenshots, illustrations, icons, logo, CSS, source code or distinctive proprietary graphic compositions.

## 3. BOEKUNA truth constraints

The website may only present functionality BOEKUNA actually has or clearly mark future functionality as unavailable.

Current public truth to preserve:
- income and expenses;
- sales invoices and credit notes;
- relationships;
- document upload for supported PDFs/scans/photos;
- document recognition and user review;
- VAT overview;
- CSV bank import and matching;
- reports for revenue/cost/result/open items;
- four public packages: Gratis €0, Start €6,95, Boekuna €9,95, Unlimited €14,95;
- paid public packages remain announced/non-transactional until technical billing migration.

Must not imply as currently live:
- direct VAT filing to the Dutch Tax Authority;
- PSD2/live bank connection;
- BOEKUNA bank account or payment card;
- Peppol sending if not actually enabled;
- inventory;
- fabricated automation rates, customer counts, ratings, awards or testimonials.

When a Moneybird section depends on functionality BOEKUNA does not have, preserve the section role but map it to the closest truthful BOEKUNA capability.

## 4. Visual direction

The current 3D-heavy premium treatment from PR #130 is not the target. Most depth effects are removed.

The new direction is:
- white/off-white primary canvas;
- deep navy/near-black primary type;
- BOEKUNA turquoise as the main brand accent;
- amber only as a secondary attention color;
- broad, calm page sections with generous whitespace;
- large editorial headings;
- pill/rounded CTAs and restrained border radii;
- real product-like UI compositions built from BOEKUNA data shapes or approved screenshots when available;
- human photography slots only where BOEKUNA has original/licensed imagery; otherwise use clearly intentional BOEKUNA illustration/product compositions rather than fake stock photography;
- no gradients, no glassmorphism, no decorative 3D tilt, no magnetic buttons, no scroll hijacking.

Motion is limited to:
- menu open/close;
- subtle reveal/opacity/translate transitions;
- carousel or story navigation where content requires it;
- button hover/press;
- accordion expansion;
- optional product screenshot crossfade.

All motion must be non-essential and disabled or simplified under `prefers-reduced-motion: reduce`.

## 5. Global navigation

Desktop shell follows the same maturity level as the reference:
- BOEKUNA logo left;
- primary groups: Product, Voor wie, Prijzen, Ondersteuning;
- Product opens a large grouped dropdown/mega menu;
- Voor wie opens audience links;
- Prijzen is a direct link;
- Ondersteuning opens FAQ/support/security/contact;
- right side: Inloggen + Gratis starten.

Suggested Product groups:
- Dagelijks: Facturen, Documenten, Relaties;
- Inzicht: Btw & bank, Rapportages;
- Ontdekken: Functies, Hoe het werkt.

Suggested Voor wie:
- ZZP & freelancers;
- Kleine bedrijven;
- Veel documenten.

Mobile uses an accessible accordion menu with the same information hierarchy. No desktop-only links may disappear from mobile.

## 6. Homepage architecture

### 6.1 Hero
Purpose: immediate product category + clear action.

Layout:
- wide centered hero;
- large single statement in BOEKUNA language;
- short supporting paragraph;
- two CTAs: Gratis starten / Bekijk hoe het werkt;
- product/lifestyle visual beneath or beside the copy depending on viewport;
- compact feature/topic rail immediately after hero.

No fake customer-count line.

### 6.2 Feature rail
Horizontal desktop rail and horizontally scrollable mobile rail.

Truthful topics:
- Facturen;
- Documenten;
- Relaties;
- Btw;
- Bankimport;
- Rapportages.

Each item links to an existing route/anchor.

### 6.3 Value / “grip” section
Large tinted surface matching the reference section role.

BOEKUNA message:
- less manual input;
- one shared administration;
- user remains in control.

Instead of fabricated numerical metrics, show three factual product principles:
- Upload → herkennen → controleren;
- Eén bron voor document + boeking;
- Duidelijk wat aandacht nodig heeft.

### 6.4 “Software that feels simple” product story
Large statement followed by alternating editorial product blocks.

Blocks:
1. Zelf je boekhouding doen — daily administration and reports;
2. Facturen — sales invoices, credit notes, PDF, payment status;
3. Documents — supported uploads, recognition, user control;
4. VAT & bank — VAT overview + CSV import/matching;
5. Reports — revenue, costs, result and open items.

Each block gets:
- small eyebrow;
- large heading;
- 1–2 short supporting paragraphs;
- 2 factual bullet benefits max;
- one contextual CTA;
- one large original BOEKUNA product visual.

Desktop alternates text/media left-right. Mobile stacks copy before media.

### 6.5 Entrepreneur section
Keep the social-proof role but do not invent testimonials.

Until verified BOEKUNA customer stories exist, use:
- audience stories without quotes;
- “Voor wie Boekuna is” cards;
- optional founder/product principle story.

The section must visually occupy the same role as a customer-story break, but may not fabricate names, portraits or quotes.

### 6.6 Mid-page CTA
Short, high-contrast CTA band:
- one BOEKUNA statement;
- Gratis starten;
- Bekijk prijzen.

### 6.7 VAT section
Maps Moneybird’s VAT section to current BOEKUNA truth:
- VAT overview;
- quarterly position;
- user control;
- explicit note that direct filing is not live.

### 6.8 Document analysis section
Large product section for:
- PDF/scan/photo;
- recognition;
- warnings/review;
- original evidence attached;
- upload → recognize → review → save flow.

This is the strongest product differentiator and may have the richest product visual.

### 6.9 Bank section
Maps the reference bank section to:
- CSV bank import;
- transaction matching;
- link transaction to document/booking;
- clear “live bank connection is not active yet” copy.

No bank-account/payment-card visual language that could imply BOEKUNA offers banking.

### 6.10 Demo / how-it-works section
Instead of copying a Moneybird video format, use an original BOEKUNA guided visual:
- 4 steps;
- optional autoplay-free interactive progression;
- clear link to `/hoe-het-werkt/`.

If no real demo video exists, do not fake a video player.

### 6.11 Support section
Three large cards:
- Support;
- FAQ / knowledge;
- Veiligheid & privacy.

Every card links to an existing BOEKUNA public route.

### 6.12 Product development proof
Use a truthful development section instead of a fabricated changelog count.

Options:
- “Boekuna wordt actief ontwikkeld”;
- link to a public product updates page only if one exists;
- otherwise explain active improvement areas without dated fake release entries.

### 6.13 Pricing preview
Compact four-plan summary preserving:
- Gratis €0;
- Start €6,95;
- Boekuna €9,95;
- Unlimited €14,95;
- “Binnenkort beschikbaar” for paid plans;
- no paid checkout URLs.

### 6.14 FAQ
Large FAQ section close to the footer with truthful questions on:
- automation/user control;
- documents;
- bank connection;
- VAT filing;
- pricing availability;
- privacy/account deletion.

### 6.15 Final CTA + footer
Simple final call to start free.
Footer mirrors the same information hierarchy as navigation and preserves legal/support links.

## 7. Subpages

All public routes must migrate to the same shared visual system, not remain on the old visual language.

Routes in current CI:
- `/`
- `/account-verwijderen/`
- `/btw-bank/`
- `/contact/`
- `/facturen/`
- `/faq/`
- `/functies/`
- `/hoe-het-werkt/`
- `/over/`
- `/prijzen/`
- `/privacy/`
- `/rapportages/`
- `/scanner/`
- `/support/`
- `/veiligheid/`
- `/voor-ondernemers/`
- `/voorwaarden/`

Subpages use shared templates:
- product page;
- audience page;
- information/support page;
- pricing page.

Legal pages retain readable document-first layouts rather than decorative marketing blocks.

## 8. Component system

Create or normalize reusable marketing primitives:
- site header / mega menu;
- mobile nav;
- hero;
- feature rail;
- section intro;
- split product story;
- product media frame;
- trust/principle strip;
- audience/story card;
- CTA band;
- support card;
- pricing preview;
- FAQ;
- footer.

Avoid page-specific one-off CSS when a shared primitive can express the pattern.

## 9. Interaction rules

Desktop:
- dropdown/mega-menu opens by button, not hover-only;
- Escape closes;
- focus remains visible;
- menu supports keyboard navigation;
- product story controls are optional enhancements, never required for content access.

Mobile:
- no hover-dependent behavior;
- menu accordion has 44px+ touch targets;
- horizontal rails scroll naturally;
- no transform effects that move hit targets;
- no full-screen scroll locking except while navigation is open.

Reduced motion:
- all reveal transitions become static;
- content order and meaning remain identical.

## 10. Accessibility

Required:
- semantic landmarks;
- one H1 per page;
- heading hierarchy;
- accessible menu buttons with `aria-expanded`;
- visible focus with >=3:1 contrast;
- keyboard access to all controls;
- no text embedded only in images;
- meaningful image alt text;
- decorative visuals `aria-hidden`;
- WCAG 2.1 A/AA Axe gate;
- no horizontal overflow at tested widths.

## 11. Performance

No new heavy animation or WebGL library.
No dependency on external Moneybird assets.
Prefer first-party, compressed assets.
Preserve intrinsic dimensions for images.
Only hero media may be eager/high-priority.
Below-fold media is lazy loaded where appropriate.
Avoid excessive `will-change`.

## 12. SEO and content integrity

Preserve:
- existing canonical URLs;
- existing route structure;
- unique H1 per route;
- Dutch-first copy;
- truthful product availability;
- sitemap/robots behavior;
- public pricing truth.

No competitor name appears in production HTML/CSS/JS. “Moneybird” may appear only in internal design/spec documentation and tests if needed for internal reference naming; preferably tests use neutral “reference-parity” terminology.

## 13. Files expected to change

Likely:
- `public/index.html`
- public route HTML files listed above
- `public/assets/marketing.js`
- `public/assets/marketing-editorial.css`
- `public/assets/homepage.js` or replacement marketing interaction file
- first-party BOEKUNA marketing assets
- `scripts/build-marketing.mjs`
- marketing QA tests
- workflow only if new marketing-specific gates are required

Must not change:
- `kwinest/**`
- authenticated app behavior
- billing/Stripe wiring
- Supabase
- processor/OCR
- migrations/database logic

## 14. Testing and release gate

TDD applies.

Before implementation, tests must define:
- new homepage section order/roles;
- shared nav hierarchy;
- no competitor brand/assets in production;
- no fabricated metrics/testimonials;
- pricing safety;
- no paid checkout URLs;
- mobile menu parity;
- responsive no-overflow matrix;
- reduced-motion behavior;
- keyboard/focus;
- Axe A/AA;
- Chromium + WebKit;
- marketing-only scope;
- app artifact non-regression.

Responsive widths:
320, 360, 375, 390, 393, 430, 620, 768, 1024, 1280, 1440, 1920.

Release path:
1. tests red;
2. implementation;
3. full marketing build;
4. responsive browser QA;
5. Chromium + WebKit;
6. Axe;
7. visual screenshot review;
8. PR;
9. final self-review or independent reviewer if available;
10. exact HEAD lock;
11. merge;
12. marketing-only Render deploy;
13. production smoke;
14. confirm app and processor deploy revisions unchanged.

## 15. Acceptance criteria

The rebuild is accepted when:
- the public site has the same level of section rhythm, navigation maturity and long-form product storytelling as the current Moneybird reference;
- BOEKUNA retains its own logo, palette, typography treatment, media, copy and product truth;
- the old 3D-heavy interaction layer is removed from the public experience;
- no false product capability or social proof is introduced;
- all public routes visually belong to one system;
- all existing safety, pricing, SEO, accessibility and app-boundary gates pass;
- only the marketing service is deployed.
