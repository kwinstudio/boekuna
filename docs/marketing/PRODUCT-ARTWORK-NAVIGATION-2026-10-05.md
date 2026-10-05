# Product artwork and usable destinations

User feedback supersedes the previous photo-led direction: no portraits,
screenshots presented as marketing material, correct mobile image proportions,
and discovery CTAs leading to actual next pages.

The two portrait assets were removed. The three homepage stories now combine
an imagegen-edited, text-free sage/white staging asset with the original app
captures in browser frames. Generated imagery never supplies app fields, text,
amounts or controls. Those pixels remain the authentic captured product with
explicitly labelled example data. The editorial block uses an actual phone
capture rather than a portrait. Image fitting uses contain and intrinsic ratios;
mobile visitors start with the phone example and can still choose laptop.

| Discovery topic | Real destination |
| --- | --- |
| Facturen | /facturen/ |
| Bonnen en kosten | /bonnen/ |
| Btw | /btw/ |
| Bank | /bank/ |
| Rapportages | /rapportages/ |
| Mobiel | /mobiel/ |
| Bekijk hoe het werkt | /hoe-het-werkt/ |

These pages explain existing functionality and use actual captures, registration,
pricing and related-function links. Existing pricing, support, legal and account
destinations stay available. Prior homepage anchors remain supported for old
external links; new discovery links use pages. Native demo controls, carousel
selection, screen toggles, filters and form navigation remain meaningful in-place
controls. New routes are included in the sitemap and browser/accessibility QA.
The old /btw-bank/ route redirects to /btw/ rather than back to the homepage.

App, accounting, OCR, billing and authentication code stay untouched. Public
support/404 link repairs happen in the marketing build so shared app artifacts
remain identical. Validation includes both engines, all previous premium widths,
new route/CTA checks at 320/390/768/1440, Axe, performance and app byte comparison.
Rollback: revert this PR and redeploy the marketing static service only.
