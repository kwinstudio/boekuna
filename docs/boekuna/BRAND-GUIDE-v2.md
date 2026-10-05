# BOEKUNA Brand Guide v2 — Calm Control

> **SUPERSEDED FOR PUBLIC BRAND / MARKETING.** The canonical BOEKUNA identity is now `docs/boekuna/BRAND-IDENTITY-CANONICAL.md` (approved 5 October 2026): `#1B1F23`, `#63D471`, `#F6F7F8`, `#8A949C`, `#FFFFFF`; Space Grotesk + Inter. This file remains for historical/product-layer context and must not be used as the marketing brand source of truth.

Status: approved final identity · production asset set  
Approved: 29 September 2026  
Source branch: `brand/final-boekuna-logo`  
Implementation PR: `#96`  
Product capture refresh: `#97`  
Capture proof: refreshed final-logo product assets retain previously verified processor-backed review evidence when no dedicated capture account is available.

## Brand idea
BOEKUNA is the calm control layer between everyday business input and reliable financial administration.

**Descriptor:** Boekhouden. Gewoon helder.  
**Principles:** Helder · Zeker · Kalm · Direct · Eigen

Complexity is handled behind the scenes. The user sees what matters, what is certain, and what still needs attention.

## Logo system
The final symbol is the approved stylised **B** mark supplied on 29 September 2026. The production vector is traced from that approved artwork and preserves its silhouette. Default mark colour: `#1C6461`. The diagonal negative space is part of the mark and must remain open.

Production assets:
- `boekuna-logo-primary.svg`
- `boekuna-logo-compact.svg`
- `boekuna-wordmark.svg`
- `boekuna-symbol.svg`
- `boekuna-logo-monochrome.svg`
- `boekuna-logo-reversed.svg`
- `boekuna-app-icon.svg`
- `boekuna-app-icon-maskable.svg`
- `boekuna-favicon.svg`
- generated PNG app icons: 180 / 192 / 512 / 1024
- generated favicon PNGs: 16 / 32 / 48 / 64
- generated social assets: `boekuna-og-1200x630.png` and `boekuna-social-avatar-1024.png`

### Clear space
Keep at least the width of the central negative control zone around the complete logo. Do not allow copy, borders or UI chrome inside this area.

### Minimum size
- Symbol: 16 px digital minimum.
- Primary horizontal logo: 120 px recommended minimum; do not use below 96 px.
- Below 96 px, use compact lockup or symbol.

### Logo don'ts
Do not stretch, rotate, outline, add shadows, recolour arbitrarily, put the mark on low-contrast imagery, recreate the wordmark with a random font, or add gradients/effects.

## Colour system

| Token | HEX | Role |
|---|---|---|
| Brand Primary | `#123B3A` | Core brand / dark navigation / primary actions |
| Brand Primary Hover | `#0C302F` | Hover |
| Brand Primary Active | `#082725` | Pressed |
| Brand Primary Soft | `#E7F0EE` | Quiet brand surface |
| Brand Secondary | `#2B736C` | Supporting brand accent |
| Canvas | `#F8F7F3` | App canvas |
| Surface | `#FFFFFF` | Cards and forms |
| Surface Secondary | `#F3F0E8` | Warm limestone |
| Text Primary | `#16201F` | Main text |
| Text Secondary | `#4B5B57` | Secondary text |
| Text Muted | `#65736F` | Muted text |
| Border Default | `#DDE5E1` | Borders |
| Border Strong | `#B9C9C3` | Strong borders |
| Success | `#0F7B57` | Paid / complete |
| Warning | `#A86600` | Review / caution |
| Error | `#C23B3B` | Error / destructive |
| Info | `#2E5FB8` | Neutral information |

Brand teal is not used as a substitute for financial success. Semantic states always keep labels/icons in addition to colour.

## Typography
UI family: Inter with system fallbacks. The production wordmark uses outlined vector letterforms and has no runtime font dependency.

| Role | Size / line height | Weight |
|---|---|---|
| Display | 56 / 60 | 700 |
| H1 | 48 / 56 | 700 |
| H2 | 36 / 44 | 650–700 |
| H3 | 28 / 36 | 650 |
| H4 | 20 / 28 | 650 |
| Body Large | 18 / 28 | 400 |
| Body | 16 / 24 | 400 |
| Body Small | 14 / 20 | 400 |
| Label | 13 / 18 | 600 |
| Caption | 12 / 16 | 400–600 |
| Button | 14 / 20 | 650 |
| Numeric/Data | context | 600–750 + tabular numerals |

Financial examples must remain immediately scannable: `€ 1.234,56`, `€ 0,00`, `9%`, `21%`, `2026-0041`, `NL91 ABNA 0417 1643 00`.

## Spacing
4 px base with a practical working scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.

Typical use:
- micro: 4–8
- control gaps: 8–12
- card padding: 16–24
- form section: 24–32
- page/section: 48–96
- mobile gutter: 16
- desktop content gutter: 24–32

## Grid
Marketing: max width around 1200 px, editorial split layouts, strong whitespace.  
Product: stable sidebar + content column, data-first cards and tables.  
Forms: one or two columns only when fields remain easy to scan.  
Mobile: one primary column; horizontal overflow only for true data tables.

## Radius
- Small: 8
- Medium: 12
- Large: 16
- XL: 24
- Pill: only for tags/badges/segmented controls where the shape has a function.

## Shadows
Prefer borders and surface contrast. Use:
- Small: `0 1px 2px rgba(18,59,58,.05)`
- Medium: `0 12px 32px rgba(18,59,58,.08)`
- Overlay: `0 28px 80px rgba(9,31,30,.18)`

## Iconography
Use one outlined icon family. Target 1.75–2 px stroke at 24 px with rounded joins/caps. Standard sizes: 16, 20, 24. Filled states only for selected/critical states.

## Photography
Real Dutch/European small-business environments: horeca, salon, construction, local retail, creative work and independent professionals. Documentary/editorial, natural light, real work, restrained grading. Avoid handshakes, fake meetings, pointing at charts and staged corporate smiles.

## Visual signature
Use the offset rounded control frames as a quiet crop, framing device or pattern. Never repeat the logo as wallpaper behind important financial information.

## UI behaviour
Marketing may use warmer limestone surfaces and larger photography. Product UI stays quieter and more neutral.

Primary actions use Brand Primary. Destructive actions always use Error. Success, warnings, review-required, OCR confidence and calculated/read-only states remain semantically distinct.

## Motion
150–250 ms for normal UI transitions. Prefer opacity and small transforms. No bounce. Honour `prefers-reduced-motion`.

## Voice
Clear, short, calm, human and knowledgeable. Explain what happened and what the user can do next.

Good: “Dit document kon niet worden verwerkt. Probeer het opnieuw of voeg de gegevens handmatig toe.”  
Avoid: hype, AI language, bookkeeping jargon when normal Dutch works, and alarmist errors.

## Invoices
The entrepreneur's own company brand remains primary on customer invoices. BOEKUNA branding must never visually take over the user's invoice.

## Accessibility
Normal body text and controls must meet WCAG AA contrast. Colour is never the only carrier of state. Keyboard focus remains visible. Dark mode uses its own canvas/surface/text tokens rather than inversion.
