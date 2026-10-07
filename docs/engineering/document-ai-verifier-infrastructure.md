# BOEKUNA Document AI Verifier — infrastructure boundary

Date: 2026-10-06

## Decision

BOEKUNA may add dedicated AI infrastructure only for document semantic verification.
The new infrastructure must not become a shared application backend.

## Target architecture

document upload
→ existing BOEKUNA document processor
→ native PDF text / RapidOCR + PP-OCRv6
→ deterministic parser
→ candidates + confidence
→ financial validation
→ only review-required/ambiguous documents
→ document AI verifier
→ agree / disagree / uncertain
→ BOEKUNA deterministic acceptance rules
→ financial validation again
→ human if needed

## Trust boundary

The verifier has no database, Supabase, Stripe, bank or bookkeeping credentials.
It does not require customer or account identifiers and has no storage bucket access.
It receives a single verification payload and returns semantic evidence only.

## Precedence

user-confirmed
> validated source/document value
> matching BOEKUNA parser candidate + verifier agreement
> high-confidence deterministic parser
> AI-only suggestion (review evidence only)
> uncertain OCR

An AI-only value is never automatically accepted.

## Privacy

Do not log document images, OCR bodies, invoice numbers, supplier names, IBAN/VAT IDs,
or model prompts/responses containing document content.

Operational logs may contain only request timing/status, model/backend health and
circuit-breaker state. No document retention.

## Resource model

The current Render Free processor remains unchanged. Dedicated verifier compute should
be burst-oriented because BOEKUNA calls it only for uncertain documents. A 24 GB VRAM
inference class is the preferred next benchmark target for Qwen3-VL-2B. Provider
selection remains separate from this code PR.

## Release gates

1. Service contract PASS.
2. GPU benchmark on privacy-safe fixtures.
3. Accepted P50/P95 and cold start.
4. AI WRONG INTRODUCED financial = 0.
5. Mixed VAT protection PASS.
6. Verifier outage fallback PASS.
7. Privacy/security review PASS.
8. Integration on a separate PR.
9. Independent TR3 financial/document review.
