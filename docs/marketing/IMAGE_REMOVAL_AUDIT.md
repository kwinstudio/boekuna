# BOEKUNA Marketing Image Removal Audit

## Scope

- Repository: `kwinstudio/boekuna`
- Base main: `7132029b792c8942f18317637ff352461dfe08d5`
- Branch: `marketing/remove-all-content-images-20261001`
- Marketing source: `public/**`
- Marketing output: `dist/marketing`
- App source/build are out of scope and must remain unchanged.

## Findings before removal

- Public runtime contained 18 product screenshot `<img>` elements across 8 routes, plus responsive `<source>` elements and 4 dynamic homepage screenshot sources.
- 12 unique product capture assets were referenced by the public runtime.
- The source capture library contains 35 WebP screenshots/crops (1730096 image bytes; 1736905 bytes including `capture-proof.json`).
- No CSS `background-image` content photography was found on current main.
- No non-product public photography library was found on current main.

## Decision

The product capture library is **not physically deleted from source**, because it remains useful as internal capture/provenance evidence and capture workflow input. Instead:

1. all public HTML and marketing JS runtime references are removed;
2. no replacement AI image, stock image, mockup or pseudo-screenshot is added;
3. `scripts/build-marketing.mjs` removes `dist/marketing/assets/product`;
4. generated marketing text files fail the build if a `/assets/product/` reference reappears;
5. brand/function assets remain allowlisted.

This avoids deleting a file that is still used by QA/evidence workflows while guaranteeing it cannot ship on `boekuna.nl`.

## Asset inventory

| Asset | Where used before | Scope | Decision | Reason |
|---|---|---|---|---|
| `public/assets/apple-touch-icon.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-1024.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-180.png` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-192.png` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-512.png` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-maskable-512.png` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-maskable.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon-v2.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-app-icon.svg` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-favicon.svg` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-logo-compact.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-logo-master-1024.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-logo-monochrome.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-logo-primary.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-logo-reversed.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-og-1200x630.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-og-template.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-pattern.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-social-avatar-1024.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-symbol-reversed.svg` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-symbol.svg` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/boekuna-wordmark.svg` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/favicon-16.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/favicon-32.png` | Brand, favicon, social metadata or technical icon use | shared with app build | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/favicon-48.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/favicon-64.png` | Brand, favicon, social metadata or technical icon use | marketing/brand | KEEP | Functional brand asset, explicitly allowed by the image-removal contract. |
| `public/assets/product/boekuna-company-settings-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-company-settings-group-crop.webp` | /hoe-het-werkt/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-contacts-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-contacts-list-crop.webp` | /functies/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-dashboard-action-center-crop.webp` | /, /rapportages/, /voor-ondernemers/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-dashboard-desktop-960.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-dashboard-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-dashboard-mobile.webp` | / | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-dashboard-overview-crop.webp` | /, /functies/, /voor-ondernemers/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-amounts-mobile.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-desktop-960.webp` | /scanner/, /hoe-het-werkt/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-mobile.webp` | /, /scanner/, /hoe-het-werkt/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-step-amounts-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-step-document-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-step-relation-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-document-review-step-save-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-documents-desktop-960.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-documents-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-documents-mobile.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-documents-upload-crop.webp` | / dynamic product tab + /functies/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-documents-workflow-crop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-invoices-desktop-960.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-invoices-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-invoices-list-crop.webp` | / + /facturen/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-invoices-mobile.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-reports-desktop-960.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-reports-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-reports-primary-crop.webp` | / dynamic product tab + /rapportages/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-services-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-services-list-crop.webp` | /functies/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-vat-desktop-960.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-vat-desktop.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-vat-mobile.webp` | Capture/QA library only; no public runtime reference found | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |
| `public/assets/product/boekuna-vat-summary-crop.webp` | / dynamic product tab + /btw-bank/ | marketing-only capture evidence | KEEP source / EXCLUDE dist | Product screenshot/crop. Retained only for internal capture provenance; removed from public HTML/JS and stripped from generated marketing artifact. |

## Build weight

- Marketing artifact before: 2694526 bytes
- Marketing artifact after planned build exclusion: 952591 bytes
- Reduction: 1741935 bytes (64.65%)
- Product capture directory in generated marketing build after: **absent**
- Public product screenshot references after: **0**

The byte comparison is based on Git tree blob sizes for the base public tree versus the current branch public tree, applying the marketing build rules (manifest excluded in both; product capture directory additionally excluded after this change).

## Boundary proof

`scripts/build-app.mjs` uses an explicit asset allowlist containing brand/app icons and app JS/CSS only. It does not include `public/assets/product/**`. The marketing build exclusion therefore does not remove any app build asset.

## Required release checks

- marketing build
- content/SEO freeze with media exception only
- no-content-image regression
- responsive matrix: 320, 360, 375, 390, 393, 430, 768, 1024, 1280, 1440, 1920
- Chromium + WebKit browser gate
- accessibility/keyboard/focus checks
- app build boundary/non-regression
- exact-head independent QA before merge
