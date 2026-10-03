# BOEKUNA scan intelligence + OCR hardening — implementation plan

Date: 2026-10-03
Base: f1c0a10df6e84da376e333e7ee00f178862bcfcb
Branch: feat/scan-intelligence-ocr-hardening-20261003

## Goal

Improve receipt/invoice recognition without external AI, prioritising financial correctness, mixed-VAT safety, field-level confidence and fewer manual corrections. Preserve the beginner post-scan review and all accounting/auth/billing boundaries.

## Release invariants

- RapidOCR 3.9.2 + PP-OCRv6-small + ONNX Runtime 1.30.0 remain the baseline.
- External AI remains disabled by default and is not enabled by this work.
- Digital PDF text stays first choice; OCR is conditional.
- net + VAT = gross remains cent-exact.
- No processor-side silent rewrite of recognized financial values.
- Mixed VAT keeps scalar vatRate null and requires reconciled VAT lines.
- No customer documents are committed; fixtures are synthetic/anonymised.
- No raw document text is added to ordinary logs/telemetry.

## File map

- `kwinest/docprocessor/app.py` — processor orchestration, OCR passes, extraction, validation, quality metadata.
- `kwinest/docprocessor/image_quality.py` — lightweight quality inspection, skew estimation/deskew helpers and safe preprocessing decisions.
- `tests/document-scan-intelligence-benchmark.test.py` — reproducible synthetic benchmark and field/corrections/performance report.
- `tests/ocr-production-hardening.test.py` — TDD coverage for quality, long receipts, multi-pass/tiling and safety.
- `tests/test_document_processor_regression.py` — financial extraction/no-silent-correction/mixed-VAT regressions.
- `kwinest/index.html` — minimal beginner-review integration for image-quality flags and processor proposals.
- `tests/document-review-beginner-ux.test.mjs` / `tests/document-upload-browser.test.mjs` — browser contract for focused review.
- `.github/workflows/boekuna-backend.yml` — benchmark/backend gate.
- `.github/workflows/boekuna-integrity.yml` — exact-head Chromium/WebKit/full-regression PR gate.
- `docs/document-scan-intelligence.md` — pipeline, benchmark, privacy, rollout and rollback.

## Task 1 — Establish benchmark before product changes

1. Add a deterministic synthetic fixture generator covering clear receipt, dark image, skew, blur, long receipt, digital PDF, scanned PDF, multipage PDF, mixed VAT, PNG/JPEG/HEIC where available.
2. Score supplier/date/invoice number/net/VAT/gross/VAT rate/mixed VAT using exact/normalized/missing/wrong/ambiguous states.
3. Report average corrections/document, documents without blocking review, P50/P95 and memory delta where measurable.
4. Add benchmark to backend CI; make full integrity workflow run on this PR scope.
5. Run CI on this benchmark-only head and record baseline output before processor implementation.

## Task 2 — Image quality + conditional preprocessing (TDD)

1. Add failing tests for low resolution, darkness, overexposure, blur, skew and long-receipt classification.
2. Implement dependency-light quality inspection using Pillow/NumPy only.
3. Add conservative deskew and contrast/sharpen variants only when quality evidence warrants them.
4. Keep original image as a candidate; never destructively replace it without a better OCR score.
5. Return privacy-safe `qualityFlags`, quality class and Dutch reshoot advice.

## Task 3 — Long receipt + conditional multi-pass OCR (TDD)

1. Add failing tests proving a tall receipt keeps bottom totals readable.
2. Add overlapping vertical tiling before RapidOCR downsizes a tall document.
3. Remap tile boxes into document coordinates and deduplicate overlap rows.
4. Add conditional header/financial focused passes for missing/uncertain critical fields.
5. Rank variants with OCR confidence + financial/label semantics; avoid a second pass on strong digital/clear inputs.

## Task 4 — Field extraction hardening (TDD)

1. Add context tests for invoice date vs due date, invoice number vs KVK/VAT/IBAN/order number, and real total vs subtotal/payment/discount.
2. Add layout/proximity-aware amount candidates where OCR/PDF layout is available.
3. Strengthen supplier candidate ranking from header/legal identifiers without unsafe cross-tenant/global learning.
4. Preserve leading zeroes in invoice numbers and Dutch/English labels.
5. Keep unknown fields null/review; no fabricated values.

## Task 5 — Financial validator safety (TDD)

1. Add regression: net=100, VAT=12, gross=121, rate=21 remains recognized as-is and is flagged inconsistent.
2. Compute a `financialProposal` for the review layer instead of mutating explicit values.
3. Keep two-of-three derivation only when a value is genuinely missing and the anchors are reliable.
4. Keep mixed VAT line/base/VAT/top-level reconciliation cent-exact.
5. Prevent false mixed VAT from informational percentages without amount/section evidence.

## Task 6 — Beginner review integration

1. Pass field confidence, quality flags/advice and financial proposal through the existing processor mapper.
2. Show simple Dutch photo guidance only when quality is genuinely weak.
3. Do not expose raw confidence percentages in the normal beginner flow.
4. Keep technical details collapsed and show only uncertain/blocking fields.
5. Preserve save/reload/reopen authority of user-confirmed values.

## Task 7 — Privacy, security, observability

1. Add privacy-safe logs: processor/model/version, duration, page/OCR-page counts, quality flag names, confidence class and extraction outcome.
2. Do not log raw OCR text, identifiers or full document content.
3. Re-run malformed/corrupt/oversized/fake-MIME/decompression/resource tests.
4. Verify external AI remains disabled by default.
5. Verify tenant isolation/app regressions.

## Task 8 — Exact-head release gate

1. Re-run the exact same benchmark and compare BEFORE/AFTER field accuracy, corrections/document, blocking-review rate, P50/P95 and memory.
2. Run backend + full integrity CI, including Chromium and WebKit document flows.
3. Review frozen head for fabricated fields, financial mutation, mixed VAT, privacy, latency/memory and beginner UX.
4. Create focused PR with benchmark evidence and exact head.
5. Merge only after green exact-head gates.
6. Sync exact merged processor source to `kwinest-hosting` if needed, then deploy `kwinest-docprocessor` manually (autoDeploy is off).
7. Deploy app only if `kwinest/index.html` changed, using existing app release path.
8. Production smoke with safe fixtures: digital PDF, photo receipt, scan PDF, mixed VAT, multipage, poor-quality image; verify save/reopen.
9. Keep prior Render deploy ID recorded for immediate rollback.

## Acceptance decision

PASS requires measurable improvement or equal accuracy with fewer corrections on the same benchmark, no financial-field regression, no silent financial correction, no mixed-VAT regression, green security/privacy/regressions, and successful production smoke. Otherwise report PARTIAL/FAIL and do not overclaim.
