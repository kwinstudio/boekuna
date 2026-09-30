# BOEKUNA explicit full regression gate

This file exists only to trigger the complete cross-system GitHub Actions release gate on pull requests.

Normal pull requests use scoped workflows:
- marketing: `.github/workflows/boekuna-marketing.yml`
- app: `.github/workflows/boekuna-app.yml`
- backend: `.github/workflows/boekuna-backend.yml`

Before production cutover or merge of a high-risk release, update the evidence line below in a dedicated commit. That PR change triggers `.github/workflows/boekuna-integrity.yml`.

Last requested full gate: 2026-09-30 — split architecture pre-cutover baseline.
