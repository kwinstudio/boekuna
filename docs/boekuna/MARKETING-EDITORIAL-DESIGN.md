# BOEKUNA marketing — editorial composition

Content baseline: main `aa7ae7819f893ecad429bd51a8ba5e00b7a4cedb` (1 October 2026).
Engineering base: main `8b4c17859aff07bcce6fbc3f02117074571a1e5c` after PR #111;
the marketing tree is unchanged between these commits.
Branch: `design/baseline-inspired-marketing-redesign`.
Authority: the user's BOEKUNA CONTENT FREEZE overrides all copy-reduction,
section-removal, and production-promotion instructions in the reference prompt.

## Thesis

The same calm, accountable Dutch software, presented as an editorial publication:
a confident petrol poster, real product proof, large numbered rows, deliberate
white space, and a clear light/dark rhythm. Baseline supplies composition and
motion principles; BOEKUNA's approved Calm Control identity supplies the brand.

## Content contract

All 17 existing marketing pages and the 404 retain their content, links, headings,
CTA labels, existing sections, real product images, forms, pricing, FAQ, legal
disclosures and SEO metadata. No rewording or pricing decision belongs here.
The complete machine-readable inventory is
`tests/fixtures/marketing-content-freeze.json`; the base commit remains the source
of the original HTML and scripts. Interactive home states are also frozen.

## Visual system

- Brand: #123B3A primary; #2B736C secondary; #F8F7F3 canvas; #F3F0E8 limestone;
  #16201F ink; white for text on petrol. Official logos remain intact.
- Type: Inter, then the existing system stack. Display scales from 46 px on small
  mobile to 132 px on desktop; longer page titles use a smaller adaptive scale.
  Body copy is 16–19 px; regularly used labels are at least 14 px.
- Grid: 12-column spirit, 1440 px canvas, 1280 px content; controlled outer
  margins of 8–24 px, internal mobile gutters of 18–24 px. One column on mobile.
- Sections: framed hero, image plate, typographic feature rows, broad proof band,
  alternating quiet content, dark final invitation and a generous footer.
- Containers: large framing surfaces can have 24 px radii. Feature information
  uses hairline dividers and explicit hierarchy instead of repeated SaaS cards.
- Existing screenshots retain every pixel, their actual dimensions and alt
  text. Mobile review captures are never used as a fabricated phone mockup.
- Forms/legal: legible paragraphs, clear labels, original validation and original
  handlers; a reading column and useful anchored navigation.

## Motion

One restrained easing curve, short UI feedback, 650 ms word-mask hero entrance,
small section entrances and a maximum 18 px image parallax on fine pointers.
No loader, smooth-scroll dependency, scroll interception or decorative animation
loop. Content is visible without JavaScript. Reduced motion disables entrances,
parallax and smooth scrolling, including when the preference changes live.

## Isolation and review

New CSS/JS are marketing-specific and loaded only by public HTML. Shared assets,
`kwinest/**`, app build, processor, database, auth, RLS and billing are unchanged.
Public pages use their native Calm Control tokens in `marketing.css` and the new
scoped presentation, instead of loading app-oriented `brand-v2.css` overrides.
The original shared file and every app reference to it remain unchanged.
Test the actual `dist/marketing` artifact in Chromium and WebKit across
320 / 360 / 390 / 430 / 768 / 1024 / 1280 / 1440 px. Before/after images use
390 × 844 and 1440 × 960 with reduced motion for repeatable comparison.

Maximum status: READY FOR BRAND REVIEW. First 05 reviews brand, visual direction,
content parity and conversion; only after approval may 04 validate the exact HEAD,
merge, deploy and perform live smoke. This branch does not promote production.
