# BOEKUNA — White Editorial marketing system

Scope: public website only. The authenticated app, scanner/OCR, document processor, Supabase, auth, billing, financial logic and app-shared styling are outside this design contract.

## Intent

BOEKUNA uses a white-first editorial system: calm, premium, minimal and digital. The current White Editorial composition stays intact; this identity update changes color, typography direction, contrast, CTA treatment, section backgrounds and selected states without rewriting public content or product claims.

## Official marketing tokens

| Role | Token | Value |
| --- | --- | --- |
| Primary emphasis | `--boekuna-lime` | `#E7FE55` |
| Secondary support | `--boekuna-cyan` | `#BFE7EC` |
| Canvas / surfaces | `--boekuna-white` | `#FFFFFF` |
| Typography / strong surfaces | `--boekuna-black` | `#111111` |
| Quiet separator | `--boekuna-soft` | `#F6F6F3` |

Hierarchy:
- White is the dominant canvas (target roughly 70–80%).
- Near-black is the default typography, rule and footer color.
- Lime is reserved for primary CTA, focus and small high-attention markers.
- Cyan is secondary and used for quiet supporting bands or selected states.
- Do not use lime or cyan as normal body text.
- No gradients, glow, glassmorphism, decorative photos, screenshots, fake UI or device mockups.

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
- Primary CTA: lime background, near-black text/border; hover becomes near-black with white text.
- Secondary CTA: white/transparent, near-black border/text; hover may use soft cyan.
- Trust/stat support bands may use soft cyan.
- Workflow step numbers may use compact lime markers; do not fill whole cards lime.
- Recommended pricing treatment may use cyan; lime stays limited to CTA/small accents.
- Closing CTA and footer use near-black with white text; lime is a small emphasis only.
- Forms remain white with neutral borders; focus uses lime. Existing semantic success/error colors may remain for accessibility.

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
- lime never used as ordinary text on white.

## Maintenance boundaries

Author the shared presentation in `public/assets/marketing-editorial.css` and small accessibility enhancements in `public/assets/marketing-editorial.js`.

Do not edit app code, financial logic, authentication, billing, OCR, document processing, Supabase, migrations or app-shared branding styles for this marketing identity.

The marketing build must remain isolated from the app build. App artifact non-regression and split-boundary tests are release gates.

## Content contract

All existing public copy, headings, pricing, features, FAQ, routes, legal text, support/contact details, CTA destinations, signup/login links, SEO, canonicals, Open Graph, structured data, sitemap and robots remain frozen unless separately authorized.

The website remains image-free except for necessary brand/function assets such as logo, favicon and icons.
