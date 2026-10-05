# Premium interactive marketing extension

## Scope and audit

Base: main b742d89, after the invoice/document review simplification. The existing
homepage already had working scanner, invoice, document, VAT, bank and chart
demos, shared pricing, FAQ, mobile navigation and legal routes. Its hero was
entirely product-heavy and the device section used an invented dashboard. This
extension keeps the existing static multipage architecture and working demos.
No product, processor, accounting, authentication or billing code changes.

The supplied brief approves the visual and content direction and requests
implementation, review, merge, deployment and production verification. Historical
content-freeze/brand-review handoffs describe earlier workstreams; this assignment
explicitly authorizes clearer homepage copy and new imagery.

## Brand decision record

Mode: extension. Audience: Dutch zzp'ers, freelancers and small service companies.
Promise: “Boekhouden zonder boekhoudtaal.” Personality: calm, clear, human,
accountable and confident. Existing Space Grotesk/Inter and live green tokens
remain authoritative. White dominates; a charcoal trust section provides rhythm.
No purple palette, borrowed Vrodex assets, fake testimonials or new features.
Vrodex informs human context, product layering and tactile interaction only.

## Page and CTA inventory

1. Stable headline, registration CTA and workflow anchor; photo + three real UI stories.
2. Profession rail, explicitly audience positioning rather than customer proof.
3. Native-scroll sticky three-step workflow; existing scanner demo in a disclosure.
4. Existing plain-language switch.
5. Six product modules and the retained hands-on invoice/document/VAT/bank/chart demos.
6. Current laptop/mobile product captures and existing audience selector.
7. Editorial photography + user control, then a dark four-point honesty section.
8. Pricing from the existing PLANS source, beginner FAQ, final CTA and retained footer.

Existing /#facturen, /#bonnen, /#btw, /#bank, /#rapportages and /#hoe retain
their destinations. Existing multipage and legal/support routes remain intact.
No Early Access count, time-saving claim or security certification is invented.

## Motion primitives

- Buttons 180ms; cards 200ms; product scenes 650ms; easing cubic-bezier(.22,1,.36,1).
- Hero stories change every six seconds, with a visible pause control and manual pills.
- Hover, focus, touch, manual selection, hidden tab and offscreen visibility pause rotation.
- Reduced motion stops autoplay and transforms, including changes to the preference.
- Swipe is optional; labelled buttons provide equivalent keyboard operation.
- IntersectionObserver changes the sticky product story on desktop only.
- Native browser scrolling remains in control; no framework or animation library added.

## Brand image brief and delivery manifest

Character: clear, quiet, approachable, contemporary. Audience: independent workers.
Temperature: neutral/warm daylight. Contrast: balanced. Realism: editorial lifestyle
plus exact real UI. Composition: offset subject with breathing room. Lighting: soft
window daylight. Palette: neutral workspace, restrained green UI. Materials: wood,
paper, matte devices. Forbidden: invented screens, brand logos, stock handshakes,
synthetic testimonial claims and decorative neon.

| Asset | Role | Crop / source | Loading |
| --- | --- | --- | --- |
| ondernemer-werkplek-640/1200.webp | Human context | Existing supplied generated image; subject at 66–72%; no customer claim | Hero eager/high, editorial lazy |
| bon-controleren.webp | Explain amount review | Exact current built app, crop of document-review-fields, fictive local data | First scene eager |
| facturen.webp | Show invoice list | Current built product; local fictive demo administration | Scene eager, bento lazy |
| overzicht.webp | Show clear totals | Current built product | Scene eager, other uses lazy |
| documenten.webp | Show upload/document workflow | Current built product | Lazy |
| btw.webp / bank.webp | Show actual functions | Current built product | Lazy |
| overzicht-mobiel.webp | Prove mobile experience | Separate 390px current app capture | Lazy |

The image with an Apple logo and generated fantasy English Boekuna dashboards
were rejected. Source photography is representational imagery, not a customer.
All rendered assets are first-party WebP with explicit intrinsic dimensions.
Capture source hashes and the local-only seed provenance are in
public/assets/stories/capture-proof.json. The reproducible capture script injects
demo data only into a temporary served copy and blocks all external requests.
Run after `node scripts/build-app.mjs`, with Playwright Chromium and Python Pillow
installed. It saves PNG capture masters and WebP exports at quality 90.

## Verification and rollback

Browser acceptance: Chromium/WebKit, 320/360/390/430/768/1024/1280/1440/1920.
Keyboard, carousel pause, reduced motion, loaded images, no overflow, Axe,
existing demos, mobile navigation, retained public/legal routes. The generated
app artifact must remain byte-identical to main. Evidence is emitted under
tests/artifacts/premium-marketing and multipage; CI uploads both.

Local result: both browser suites PASS; 18 premium viewport/engine combinations,
zero reported page errors, no horizontal overflow, zero Axe violations at 390px
and 1440px in both engines. All 25 app artifact files are byte-identical to main.
390px mobile laboratory profile: CPU 4x, 1.6Mbps download, 150ms latency; LCP
1,792ms, CLS 0.00115. These are local lab measurements, not field INP or a claim
about every device/network. Primary content and registration links also work
without JavaScript. Actual production verification follows deployment.

Rollback: revert the marketing PR and redeploy only the existing marketing
service. No data migration, product deploy or account-state change is involved.
