# Document Intelligence V4.1–V4.3 Implementation Plan

> **For agentic workers:** Execute natively in this isolated checkout, task by task using red/green tests and the existing release gates.

**Goal:** Improve document understanding, financial safety, and tenant-local learning without external AI or changing the product design.

**Architecture:** Extend the deterministic Python parser using a focused document intelligence module. Preserve the existing wire contract with additive fields. Keep correction patterns and supplier profiles in the existing per-user ledger_state, protected by current auth.uid() RLS, optimistic versioning, account deletion, and read-only policy. Financial values are never learned replacements.

**Tech Stack:** FastAPI/Pydantic, PyMuPDF/pdfplumber, RapidOCR/PP-OCRv6/ONNX, vanilla JS, Supabase ledger JSON, Playwright/PGlite.

**Spec:** User attachment Geplakte tekst(20261004-091357).txt; main baseline 175b1072f91caecdf206de77f8c9b82492b3427e.

## Global Constraints
- No rewrite, external production AI, raw customer fixtures, cross-tenant learning, silent financial mutation, or automatic uncertain booking.
- Preserve PDF/image/multipage/mixed VAT/background processing/quota/error contracts and existing UX.
- V4.2 starts only after V4.1 tests pass; V4.3 starts only after V4.2 passes.
- Production promotion requires green regression, security, benchmark and review evidence.

## Review Focus
- A foreign supplier can use 21%: do not infer Dutch deductibility from rate alone.
- Deposit/payment labels conflict: preserve invoice total and require review.
- Same number from a different supplier/currency is not an exact duplicate.
- A learned pattern cannot override explicit current-document or user evidence.
- Credit sign, negative lines and incomplete tables must remain reviewable.

## Tasks
1. Audit current parser, review adapter, VAT reporting, ledger RLS, production release revision; run existing parser tests and image/PDF benchmark. Record unrelated baseline failures.
2. V4.1 tests in tests/document-intelligence-phases.test.py: foreign rates/treatment, advance/alreadyPaid/outstanding/amountDue, targeted confidence and contradictory balances. Extend Amounts and integrate annotate_understanding(result,doc,company) in kwinest/docprocessor/document_intelligence.py; keep legacy vatLines contract. Carry additive fields through processorAnalysisToCandidate and save/reopen. Use existing ledger storage for supplier correction memory.
3. V4.2 tests: safe classification, signed credit notes, explicit table headers and row arithmetic, financial anomaly codes, supplier/currency bound duplicates. Add annotate_safety and duplicate_candidates; replace legacy unsafe duplicate scoring. Run all baseline regressions before proceeding.
4. V4.3 tests in tests/document-intelligence-learning.test.mjs: distinct-document observations, minimum history, reversible/recent patterns, user evidence wins, calibrated routing, anonymized telemetry and tenant isolation. Create public/assets/document-intelligence.js; integrate accepted/corrected/rejected outcomes in review save and suggestions in candidate adaptation. Persist only hashes/patterns, bounded history and explainable provenance. Keep auto-accept a candidate, never auto-book.
5. Browser check review screens at desktop/mobile including foreign VAT, deposit, credit, duplicates and save/reopen. Check full app/document suites and PGlite two-user ledger isolation. Compare benchmark before/after and document coverage limits.
6. Commit coherent changes, open PR, check CI and review diff. Merge/deploy only with green gates; verify processor health/readiness/revision and authenticated anonymous fixtures when credentials exist. Record deploy IDs and rollback commit.
