# BOEKUNA — Bold Editorial marketing redesign

The user requested a simpler, typography-led black-and-white website based on a supplied editorial studio brief. This change is confined to the public marketing build. The accounting app, OCR, authentication and billing are unchanged.

## Content decisions

Homepage: one large core promise, authentic product-image marquee, one introductory statement, four product links, three workflow steps, one final registration CTA, and the legal/support footer. Repeated demo tabs, audience segmentation, jargon switch, plan comparison and FAQ accordion are removed from the homepage. Their useful information remains on the existing function, scanner, pricing and help pages. No invented social profiles, testimonials or studio project claims are added.

## Visual system

Inter (self-hosted, existing SIL Open Font License), white background, black text, #525252 secondary text and 10% black borders. A #0a0a0a footer closes the page. Display headings: 700 weight, -0.05em tracking, 0.9 line-height for the hero. Body: 400, -0.02em, 1.5. Metadata: monospace uppercase, 14px, 0.1em.

Images are genuine existing app screenshots with example data. Grayscale presentation transitions to original color on hover/focus over 700ms, without rebuilding or cropping the interface. The original mobile screenshot retains its 390 × 936 ratio. No portraits are used.

Native scrolling is retained. Text lines reveal over 1s with cubic-bezier(.16,1,.3,1). A 30s linear marquee has a visible pause control, pauses on hover/focus, and stops with reduced motion. The decorative duplicate is inert and hidden from accessibility APIs. With JavaScript disabled, images/content stay visible and the marquee does not move.

The 32px difference cursor interpolates with requestAnimationFrame and expands on interactive elements. Default cursor hiding only activates after a mouse movement on a fine hover pointer. Touch, reduced motion, keyboard input, blur and leaving the document restore the standard cursor. No scroll-jacking or external dependencies.

The plus menu is available at all widths. Opening makes page content inert and moves focus into navigation. Focus cycles through menu/trigger; Escape closes and returns focus. Header text uses difference blending. Footer legal and verified business details remain intact.

## Isolation

New CSS/JS and favicon belong to the marketing artifact. `build-marketing.mjs` attaches them to marketing pages, including copies of shared legal/support pages. Shared `site.css`, `site.js`, legal source pages and app assets are not changed. This preserves the generated app artifact. Existing page behavior and product limitations are retained.

## QA

Updated acceptance checks reflect the new approved content structure instead of testing removed homepage demos. Checks include both Chromium/WebKit, 18 homepage viewport combinations, 14 existing marketing routes, 7 feature pages at four widths, Axe, image decoding, links, menu focus/Escape, marquee pause, custom cursor, reduced motion and no-JavaScript content. Lab performance and app artifact comparison remain required.

Rollback: revert this marketing-only commit and deploy the marketing service. Do not deploy or roll back the product app or document processor as part of this change.
