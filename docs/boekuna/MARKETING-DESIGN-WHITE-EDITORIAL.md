# BOEKUNA — White Editorial marketing system

Scope: public website only. Baseline main: `71da7f3a939cad6a4c208bf221a70b1a6c5604bf`.

## Intent

A white, calm, confident Dutch accounting website. Typography and horizontal composition carry the product story. Foodhallen.nl supplied a composition reference only; its layout, type, copy, icons, interactions and brand were not copied. BOEKUNA keeps its existing logo, Inter font and all accurate public content.

## Tokens

| Role | Value |
| --- | --- |
| Canvas / surfaces | #FFFFFF |
| Primary / headings / buttons | #123B3A |
| Dark ink | #102724 |
| Body | #344744 |
| Secondary labels | #6B7976 |
| Rules | #DCE4E1 |
| Occasional soft section | #EEF7F3 |
| Existing caution notices | #F6F1E8 |

Soft blue and accent blue are not required. Never introduce gradients, glass, glow, decorative photos, UI mockups or heavy shadows. The menu dropdown has a small functional elevation only. The closing CTA and footer use petrol with white text.

## Type and spacing

Use the existing locally hosted Inter variable font with swap. H1 desktop 64–96px; home mobile 42–56px. Long subpage headlines scale to 37px at 320px to keep complete Dutch words readable. H2 desktop 36–60px; mobile around 30–34px, with narrow-screen fitting tested in both engines. Body 17–19px and 1.7 line height. Labels 14px; dense footer links 15px. Do not use tiny legacy SaaS type.

Container: 1440px maximum. Gutters: 20px mobile, fluid up to 80px. Major sections: 56px mobile, 64–112px larger screens. Shared gap: 24–64px. Prose: up to 65–70ch. Heading weight 500, compact line height and modest negative tracking.

## Composition patterns

- White navigation, existing explanatory sentence below it; primary logo left, compact navigation and actions right. Preserve every route and navigation label.
- Home: two-line statement, supporting paragraph left and actions/process promise right. One column below 900px.
- Subpage: breadcrumb/label/title plus supporting prose/actions. Long copy may wrap naturally; never clip or split words arbitrarily.
- Process: large steps on horizontal ruled columns; vertical on mobile. Retain the current real workflow, including the five steps on the tour page.
- Features: numbered editorial rows, title/category on the left and explanation/link/disclosure on the right. Existing controls remain usable.
- Audiences/trust: text columns with top rules, stacked on mobile. No persona images or badge walls.
- Pricing: separated text columns; the recommended existing plan uses soft mint. Keep all plan names, exact prices, quotas, conditions and comparison table. The table has its own horizontal scroll area on narrow screens rather than overflowing the page.
- FAQ: native details/summary, thin separators, large targets, explicit expanded state.
- Legal: narrow readable column plus anchor navigation; no legal rewrite.
- Forms: visible labels, 48px inputs/actions, 17px input text, understated borders and visible focus. Existing validation and submission handlers stay verbatim.
- Former fake window wrappers are plain facts/definitions. The existing illustrative VAT arithmetic is preserved as textual explanation, never presented as product output.
- Footer: complete route groups and support/legal information, 44px link targets and readable white text.

## Controls and motion

Primary button: petrol/white. Secondary: white/petrol border. Text link: existing label, frequently with the existing arrow. Radius 4px for controls; no rounded content cards. Focus: 3px outline with 5px offset; white on petrol.

Keep existing product selector, comparison switch and solution disclosures. Mobile menu isolates background with inert, traps focus, restores focus and closes on Escape, navigation or desktop breakpoint. Desktop dropdowns use explicit state rather than hover-only activation. Native FAQ summaries expose expanded state. Comparison buttons expose pressed state.

No loading curtain, word-by-word entrance, parallax, continuous animation, scrolljacking or new motion dependency. Brief control feedback is sufficient. Reduced motion disables transitions and smooth scroll. All prose remains visible without JS.

## Maintenance boundaries

Author the shared presentation in `public/assets/marketing-editorial.css` and small accessibility enhancements in `public/assets/marketing-editorial.js`. Do not edit app code, financial logic, auth, billing, OCR, Supabase, migrations or app-shared branding assets for a marketing redesign.

Current build copies neither marketing styles nor marketing scripts into the app. Retain original marketing foundation and homepage assets until a separately authorized cleanup; this redesign does not turn into a dead-code cleanup. Use both build outputs and byte parity to prove isolation.

## Content contract

`tests/marketing-white-content.test.mjs` compares generated pages to the immutable current-main baseline, not a regenerated approval fixture. All sentences, headings, prices, links, button labels, fields, SEO, inline schema/handlers and interactive states must match. The only removed text is six obsolete screenshot captions naming absent demo images, recorded in WHITE_EDITORIAL_AUDIT.md. Historical v1/v2 fixtures remain untouched.
