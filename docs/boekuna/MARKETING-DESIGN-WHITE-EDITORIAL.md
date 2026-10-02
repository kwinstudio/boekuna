# BOEKUNA — White Editorial marketing system

Scope: public website only. The authenticated app, scanner/OCR, document processor, Supabase, auth, billing, financial logic and app-shared styling are outside this design contract.

## Intent

BOEKUNA uses a white-first editorial system: calm, premium, minimal and digital. The current White Editorial composition stays intact; this identity update changes color, typography direction, contrast, CTA treatment, section backgrounds and selected states without rewriting public content or product claims.

## Official marketing tokens

| Role | Token | Value |
| --- | --- | --- |
| Primary conversion accent | `--boekuna-amber` | `#FF9F1C` |
| Warm support / hover | `--boekuna-honey` | `#FFBF69` |
| Main secondary surface | `--boekuna-frozen` | `#CBF3F0` |
| Strong secondary accent | `--boekuna-sea` | `#2EC4B6` |
| Canvas / surfaces | `--boekuna-white` | `#FFFFFF` |
| Typography / strong surfaces | `--boekuna-black` | `#111111` |
| Quiet separator | `--boekuna-soft` | `#F6F6F3` |

## 60 / 30 / 10 color contract

The ratio is a visual hierarchy rather than a mathematical pixel quota.

- **60%+ dominant:** White `#FFFFFF` for the hero, navigation, content canvas, forms, FAQ, legal and most reading surfaces.
- **~30% secondary family:** Frozen Water `#CBF3F0` is the main supporting surface; Light Sea Green `#2EC4B6` is a smaller selected-state/rule accent.
- **~10% accent family:** Amber Glow `#FF9F1C` is the primary CTA/high-attention color; Honey Bronze `#FFBF69` is a softer warm hover/support accent.
- Near-black `#111111` is a functional neutral for headings, body copy, borders, footer and accessibility. It does not count as a competing brand accent.
- Keep each viewport visually limited to roughly 2–3 dominant colors at once.
- Do not use Amber, Honey, Frozen Water or Sea Green as ordinary body text on white.
- No gradients, glow, glassmorphism, decorative photos, screenshots, fake UI or device mockups.

Contrast guidance with near-black text:
- Amber Glow / `#111111`: about 9.2:1.
- Honey Bronze / `#111111`: about 11.6:1.
- Frozen Water / `#111111`: about 15.8:1.
- Light Sea Green / `#111111`: about 8.7:1.
- Do not use white body text on these brand colors; their contrast against white is insufficient for normal text.

## Typography

Target marketing family: Urbanist.

Required weights:
- 400 Regular
- 500 Medium
- 600 Semi-Bold

License/source review: the official Urbanist project publishes the family under SIL Open Font License 1.1 and provides a variable weight axis.

Current repository status: `URBANIST_ASSET_PENDING`.

Until the licensed Urbanist binary is vendored locally in this repository, the existing local Inter variable font remains the temporary fallback. Do not add a runtime Google Fonts call or another external tracking dependency.

Scale:
- Hero desktop: `clamp(56px, 7vw, 96px)`
- Hero mobile: `clamp(42px, 11vw, 56px)`
- Section H2: `clamp(34px, 4vw, 56px)`
- H3: 26–34px
- Body: 16–19px
- Labels: 13–14px
- Hero weight: 600
- H2/H3: 500–600
- Body: 400
- Buttons/navigation: 500–600

Use compact but readable line-height and moderate negative tracking. Avoid 800/900-weight SaaS styling.

## Composition and color rules

- Header and mobile menu remain white with near-black text.
- Primary CTA: Amber Glow background with near-black text/border; hover may use Honey Bronze while retaining near-black text.
- Secondary CTA: white/transparent with near-black border/text; hover may use Frozen Water.
- Trust/stat support bands use Frozen Water as the main secondary surface.
- Light Sea Green is reserved for smaller selected states, rules and compact accents, not long-form text.
- Workflow step numbers may use compact Amber markers; do not fill whole cards Amber.
- Recommended pricing treatment may use Frozen Water with a Sea Green rule/accent.
- Closing CTA and footer use near-black with white text; Amber is a small emphasis only.
- Forms remain white with neutral borders. Keyboard focus stays near-black on light surfaces and white on dark surfaces; brand color alone must never be the focus indicator.
- Existing semantic success/error colors may remain when required for meaning and accessibility.

## Responsive and accessibility contract

Mobile-first. Validate at 320, 360, 375, 390, 393, 430, 620, 768, 1024, 1280, 1440 and 1920.

Required:
- no horizontal overflow;
- no clipped content;
- readable Dutch word wrapping;
- mobile menu intact;
- visible keyboard focus;
- reduced motion respected;
- no blocking Axe violations;
- normal text contrast of at least 4.5:1;
- UI/focus contrast of at least 3:1 against the adjacent surface;
- color is never the only status/validation indicator;
- Amber, Honey, Frozen Water and Sea Green are never used as ordinary body text on white.

## Maintenance boundaries

Author the shared presentation in `public/assets/marketing-editorial.css` and small accessibility enhancements in `public/assets/marketing-editorial.js`.

Do not edit app code, financial logic, authentication, billing, OCR, document processing, Supabase, migrations or app-shared branding styles for this marketing identity.

The marketing build must remain isolated from the app build. App artifact non-regression and split-boundary tests are release gates.

## Content contract

All existing public copy, headings, pricing, features, FAQ, routes, legal text, support/contact details, CTA destinations, signup/login links, SEO, canonicals, Open Graph, structured data, sitemap and robots remain frozen unless separately authorized.

The website remains image-free except for necessary brand/function assets such as logo, favicon and icons.
