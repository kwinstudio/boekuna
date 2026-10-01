# BOEKUNA public marketing v2

Scope: the public website only. The authenticated app, shared assets, financial engine, authentication, billing, OCR and infrastructure are outside this design contract.

## Authoritative sources

- Implementation branch starts at current main `7096fa914d511beaa726214639be01888ed4107b`.
- Original visual brand source: `8b4c17859aff07bcce6fbc3f02117074571a1e5c`.
- User-provided Baseline Tennis Club & Academy specification supplies composition and motion mechanics. It supplies no copy, palette, font, statistics, testimonials, icons or assets.
- Content contract: `MARKETING-CONTENT-INVENTORY-V2.md` and `tests/fixtures/marketing-content-freeze-v2.json`. The older v1 content gate remains active as well.

Priority: content freeze → existing functionality → original BOEKUNA brand → accessibility/responsive/SEO → reference composition and motion.

## Tokens and type

All authoritative tokens are declared together in `public/assets/marketing-editorial.css`. Inter is locally hosted at `/assets/marketing-editorial/InterVariable.woff2`, with the full original system fallback stack. No external font or new runtime library is added.

| Role | Value |
|---|---|
| Primary / hover / active | `#123B3A` / `#0C302F` / `#082725` |
| Secondary | `#2B736C` |
| Primary / secondary soft | `#E7F0EE` / `#E9F3F0` |
| Canvas / surface / secondary surface | `#F8F7F3` / `#FFFFFF` / `#F3F0E8` |
| Primary / secondary / muted text | `#16201F` / `#4B5B57` / `#65736F` |
| Inverse text | `#FFFFFF` |
| Border / strong border / divider | `#DDE5E1` / `#B9C9C3` / `#E7ECE9` |
| Small / medium / large / section radius | `8px` / `12px` / `16px` / `24px` |

The original semantic success, warning, error and informational tokens are also retained. The informational blue is a status token, never the marketing identity.

The document root stays at the user's normal font size. `rem` and `clamp()` provide scale. The reference's viewport-only root scaling is deliberately not copied: it would shrink ordinary text and introduce discontinuities around breakpoints. Ordinary body copy remains 16–18px at the normal browser font setting; inputs remain at least 16px. Large display headings use compact leading and controlled tracking; legal body content uses a comfortable reading measure and 1.75 line height.

## Composition

- A narrow off-white frame surrounds the large rounded sections: 12px desktop, 8px mobile.
- The official white-treated logo and complete existing navigation sit visually inside each dark page hero. Their DOM remains outside main so a modal menu can isolate the page safely.
- Homepage: oversized authored hero lines → bottom copy/CTA cluster and angled genuine dashboard capture → large product-proof heading and four typographic product controls → offset document workflow → six numbered solution rows → large editorial benefit statement → dark real-product story → complete comparison → product principles → dark mobile story → audience rows → full pricing introduction → verified product facts → safety/support rows → final CTA and complete footer.
- Every original section, heading, paragraph, label, CTA destination and dynamic state survives. Section order and wrapper/layout markup change; content does not.
- All 17 supporting public routes share the header, hero, typography, inset and footer. Product tour rows, pricing comparisons, FAQ, forms and legal reading layouts retain their purpose instead of repeating the same card grid.
- The existing window-shaped informational blocks are presented as typographic information, not fabricated software UI.
- Existing genuine captures retain their source files, alt text and intrinsic dimensions. Crop, angle and visual size vary. The homepage dashboard crops on desktop to keep the first composition near a viewport; it shows the complete original image on mobile.

## Motion and navigation

- Clip-mask reveal: original text-node spacing preserved, descender padding `.14em`, translation `115%`, 140ms word stagger, 1100ms `cubic-bezier(.16,1,.3,1)` reveal. Long headings cap their stagger delay at 1120ms.
- In-view reveal: IntersectionObserver, once per element, 32px rise, 900ms spring-like easing, selected figures/headings/rows with 90ms stagger.
- Image parallax: at most 20px, physical spring tension 200 and friction 26, only on fine pointers above 768px. Animation frames run only while settling; measurements happen in one phase after input.
- Native scrolling and native history/anchor behavior are preserved. Lenis is deliberately omitted because the existing static multipage architecture does not need another network/runtime dependency.
- First-session homepage intro: official logo on the primary background; 250ms lead plus a 500ms upward curtain; removed by 780ms. Keyboard or pointer input dismisses it immediately. Storage failure, reduced motion and subsequent navigation skip it. It does not wait for asset loading or hide content from search engines.
- Fullscreen mobile menu: original links and disclosure groups, focus trap, Escape, background inert, scroll lock, focus restore, and close on transition to desktop.
- Hover only on fine-pointer devices above 768px; small button/arrow motion. No decorative autoplay carousel is introduced. Existing product controls remain explicit and keyboard operable.
- Reduced motion stops word animations, in-view movement, component/pseudo-element transitions and every parallax plate, including live preference changes. Its scoped declarations take priority over component specificity. Static content remains readable without JavaScript.

## Build and review

No framework, bundler or single-page migration. This replaces the v1 marketing editorial stylesheet and script. The original shared marketing/homepage/brand files remain byte-identical.

```sh
node scripts/build-marketing.mjs
node tests/marketing-content-freeze.test.mjs
node tests/marketing-content-freeze-v2.test.mjs
node tests/marketing-v2-browser.test.mjs
BOEKUNA_MARKETING_PREVIEW=1 node scripts/serve-marketing-preview.mjs
```

The generated marketing artifact alone is served by the local review server. The server has no production mutation or app runtime. The PR is handed to 05 Brand + Marketing, then 03 Independent QA + Security on the same exact approved HEAD, then 04 Release. The implementation chat neither merges nor deploys.
