# SDD ledger — plan: docs/superpowers/plans/2026-10-02-moneybird-parity-marketing-rebuild.md

Ruling: connector-only execution uses the dedicated GitHub branch as the isolated workspace because this harness has no mounted repository checkout — all implementation stays off main; cost if wrong: workspace bookkeeping lives in this temporary branch file until it is deleted before merge.

## Pre-flight shared interfaces
| Tasks | Shared interface | Finding |
|---|---|---|
| 1 → 2 | marketing-editorial.css visual primitives | clean; Task 2 consumes Task 1 tokens/layout |
| 1 → 3 | parity cache key + shared CSS | clean |
| 2 → 3 | sharedHeader/sharedFooter | clean |
| 3 → 4 | homepage data hooks/demo stage | clean |
| 1–4 → 5 | shared shell + page primitives | clean |
| 1–5 → 6 | complete marketing artifact | clean |
| 6 → 7 | exact reviewed release head | clean |

Task 1: RED witnessed on CI run 37059209875 — Frozen content/SEO failed on old depth stylesheet cache contract.
Task 1: GREEN focused evidence on CI run 37059913439 — Frozen content and SEO parity PASS; Marketing page QA PASS; Image-free marketing responsive QA PASS; Split generated surface browser smoke PASS.
Task 1: complete (commits 25350d2..5f756f0, focused contract tests green).
