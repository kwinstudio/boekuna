# BOEKUNA — White Editorial independent review handoff

Repository: kwinstudio/boekuna.
Branch: marketing/white-editorial-foodhallen-direction-20261002.
Content baseline: `71da7f3a939cad6a4c208bf221a70b1a6c5604bf`.
Integrated main / app parity baseline: `5fc860e9a6964b63d579239be7bf54bad00805fc`.

The PR body records its exact HEAD. Read the current PR HEAD before any review and compare it to that frozen SHA. On divergence: `HEAD_MISMATCH`; no reuse of earlier approval. The head is deliberately stored in PR metadata rather than this self-referential committed document.

## 05 — Brand + Marketing

Review only; do not edit, merge or deploy.

Read `docs/boekuna/MARKETING-DESIGN-WHITE-EDITORIAL.md` and `docs/marketing/WHITE_EDITORIAL_AUDIT.md`. Inspect the committed viewport captures and complete before/after CI screenshot artifact at the frozen HEAD.

Check:

- BOEKUNA identity, white/petrol hierarchy, large readable Dutch typography;
- Foodhallen-inspired composition without copied design or content;
- every public page is part of the same visual family;
- no photography, screenshots, fake dashboards/devices, orphan media captions or empty media columns;
- meaningful content, prices, plans, claims, FAQ, legal and support preserved;
- the six caption removals are justified as obsolete descriptions of absent screenshots;
- editorial rows, horizontal workflow, quiet pricing, trust, footer and mobile hierarchy;
- no dead space, misleading UI illustrations, clipping or strange word breaks.

Return PASS or findings, each tied to exact HEAD, route, width and screenshot.

## 03 — Independent QA + Security

Review only; do not edit, merge or deploy.

Read the audit, generated artifacts, CI checks and complete browser report. Independently run content parity, split build/non-regression and browser/accessibility gates at that same frozen HEAD.

Check:

- all 18 user-facing routes and 20 generated HTML files; all internal links and anchors;
- metadata/canonical/robots/sitemap/schema integrity;
- app-origin CTA destinations;
- real keyboard dropdown/menu focus wrapping, Escape and restoration;
- product selector, solution disclosures, comparison pressed states and native FAQ;
- form required fields, validation, honeypot, success/error and original request contract using local interception;
- Chromium and WebKit at 320/360/375/390/393/430/640/768/820/1024/1280/1440/1920;
- Axe WCAG A/AA on every route at 390 and 1440, plus open navigation;
- headings, visible focus, touch targets, reduced motion and no-JS readable content;
- no marketing runtime in the app; 16 generated app files byte-identical to base;
- no overlap with active app/scan PRs; refresh current file lists/main before concluding.

Return PASS or findings with severity, reproduction, exact HEAD and generated artifact evidence.

## 04 — DevOps + Release, only after required PASS

No merge or deploy is performed by this implementation. After 05 and 03 approve the same exact HEAD, verify HEAD again, merge through the normal release flow, verify new main and deploy only the marketing service. Rerun byte parity against the current app baseline if an intervening app PR has merged.

After marketing deployment, verify boekuna.nl home/navigation/all major public pages/forms/legal/footer/canonical and app.boekuna.nl login/signup destinations. Report the actual deployed commit. Never claim the redesign is live from a PR or local build alone.
