# BOEKUNA Qwen3-VL Local AI Second Check — benchmark decision

Date: 2026-10-06  
Scope: Document Intelligence semantic verifier only  
Production integration: **NO-GO**

## Executive decision

Qwen3-VL-2B-Instruct remains a technically and legally viable model family candidate for a future BOEKUNA local verifier, but the tested CPU-local route is not suitable for production use in the current BOEKUNA infrastructure.

No production inference, OCR, parser, financial logic, review routing, Supabase or Render configuration was changed.

### Gates

| Gate | Result | Evidence |
|---|---|---|
| Qwen license | GO | Official Qwen model is Apache-2.0 |
| Local/self-hosted runtime availability | GO | Official GGUF + llama.cpp multimodal route works in lab |
| HunyuanOCR legal use in EU | NO-GO | Official Tencent license excludes EU use |
| Existing BOEKUNA deterministic fallback | PASS | Unchanged; external AI remains opt-in/fail-closed |
| Current Render Free resource fit | NO-GO | 0.15 CPU / 512 MiB vs >3 GiB idle and ~9.7 GiB peak in diagnostic CPU run |
| CPU verifier latency | NO-GO | Successful calls 39–142 s; 13/22 calls hit 180 s timeout |
| Quality/hallucination gate | INCONCLUSIVE / NO-GO | Too many verifier execution timeouts; old diagnostic output cannot establish safe quality benefit |
| Production integration | **NO-GO** | Hard infra/performance gates fail |

## Discovery snapshot

Benchmark baseline main:

`d0023be360fcbf6f9b50f8e35b30a1aceda52a4e`

Production processor discovery:

- processor V4.3.0;
- RapidOCR 3.9.2;
- PP-OCRv6-small;
- ONNX Runtime 1.30.0;
- native PDF text path retained;
- deterministic BOEKUNA parser retained;
- financial validation retained;
- external AI is opt-in and disabled by default;
- manual review fallback remains available when AI is unavailable.

No active PR was found that independently builds the same local verifier layer.

Current production document processor resource class observed through Render:

- Free instance;
- 0.15 CPU;
- 512 MiB memory;
- one instance.

## Candidate

Primary model:

`Qwen/Qwen3-VL-2B-Instruct-GGUF`

Pinned benchmark route:

- Q4_K_M language model: 1,107,409,952 bytes;
- Q8_0 vision projector: 445,053,216 bytes;
- combined model/projector files: 1,552,463,168 bytes;
- pinned llama.cpp CPU runtime.

The model files alone exceed the current 512 MiB production memory limit before runtime, KV cache, image tensors, OCR/parser process memory and application overhead.

## Completed diagnostic A/B run

GitHub Actions run:

`37487864922`

Source SHA:

`1fe0dc7e00f35c6caba25a92b98dc5dafff3ae75`

This run predates the stricter safe-accept benchmark semantics and is used only for runtime/performance diagnostics, not as final quality evidence.

### Dataset

33 privacy-safe generated/regression documents.

Verifier routing:

- 22 local VLM calls;
- 11 documents skipped by selective verification.

Coverage included receipts/images and structured PDFs, including:

- clear receipt;
- dark/shadow/blur/perspective/rotated images;
- long/small-text receipts;
- digital PDF;
- scanned PDF;
- multipage;
- mixed VAT;
- 0% VAT;
- foreign VAT/currency;
- PO vs invoice number;
- credit note;
- self-billing;
- factoring;
- advance payment;
- already paid / amount due;
- identifiers;
- discount/negative line;
- missing fields.

### Deterministic A baseline

Overall A field accuracy in this synthetic/regression set:

`0.9895`

Observed baseline misses:

- supplier: 1 WRONG (perspective-stressed receipt);
- BIC: 1 MISSING;
- VAT ID: 1 MISSING.

The benchmark therefore contains at least some useful error opportunities, not only perfect documents.

### Runtime

- cold start: 2.026 s;
- idle llama-server RSS: 3,122.27 MiB;
- peak llama-server RSS: 9,684.77 MiB;
- measured average CPU: ~1.989 cores;
- verifier warm P50: 180.071 s;
- verifier warm P95: 180.102 s;
- benchmark wall time: 3,237.34 s.

### Completion reliability

Of 22 verifier calls:

- 9 completed;
- 13 timed out at ~180 seconds.

Completed examples:

| Fixture | Verifier latency |
|---|---:|
| low-resolution receipt | 39.0 s |
| digital PDF | 142.2 s |
| scanned PDF | 88.2 s |
| mixed VAT PDF | 95.6 s |
| foreign VAT GBP | 95.5 s |
| credit note | 94.9 s |
| factoring | 95.4 s |
| identifiers | 100.1 s |
| missing-fields | 93.7 s |

Timeout examples included ordinary and difficult images such as clear receipt, dark receipt, skew, blur, long receipt, shadow, perspective, HEIC, PNG screenshot and 90-degree rotation.

This makes CPU-local verification unsuitable as an interactive second-check service for BOEKUNA in the tested environment.

## Quality interpretation

The first diagnostic run reported no AI-introduced financial errors, but that result is **not sufficient quality evidence** because:

1. 13/22 verifier calls timed out;
2. the first harness did not require a verifier result for each routed field;
3. early safe-accept semantics were less strict than the desired BOEKUNA precedence;
4. aggregate B stayed equal to A, so the run did not prove material verifier benefit.

The current benchmark harness has therefore been hardened so that:

- user-confirmed values are immutable;
- high-confidence parser values are not overwritten by AI disagreement;
- AI-only alternatives are review evidence only;
- no verifier value is automatically promoted without a matching BOEKUNA parser candidate;
- mixed VAT cannot be collapsed;
- deterministic financial validation remains after verification;
- provider failure leaves A unchanged;
- parser-error detection is measured independently from value mutation;
- execution errors fail the quality gate.

Until a hardened exact-head run completes on suitable hardware, model quality is **INCONCLUSIVE** rather than PASS.

## Selective verification conclusion

Selective verification remains the correct architecture if this experiment is revisited.

A VLM should be skipped when the deterministic pipeline has:

- high confidence on required fields;
- no conflicting candidates;
- financial invariants closed;
- no review-required anomaly;
- adequate image quality.

A VLM may be useful only for review-required documents where semantic ambiguity remains.

Even there, it should act as:

`agree | disagree | uncertain`

with short evidence, not as a financial source of truth.

## Required future architecture before reconsidering GO

Do not put Qwen inside the existing Render Free processor.

A future experiment would require a separate self-hosted verifier service with:

- enough RAM for model + mmproj + KV/image overhead;
- preferably GPU acceleration or demonstrably adequate CPU latency;
- singleton/lazy model lifecycle;
- bounded concurrency;
- strict timeout;
- no per-request model reload;
- private/internal service boundary;
- no document retention;
- sanitized logs;
- deterministic fallback to BOEKUNA parser/manual review;
- health/readiness separate from core OCR availability;
- explicit circuit breaker so verifier failure never blocks document processing.

## HunyuanOCR

HunyuanOCR remains:

`TECHNICALLY INTERESTING / LEGALLY NO-GO FOR BOEKUNA`

Do not integrate or benchmark it with BOEKUNA customer/product use while the official Tencent license excludes the European Union.

## Final F4 decision

**MODEL FAMILY:** MAYBE / future lab candidate  
**CURRENT RENDER FREE:** NO-GO  
**CPU-LOCAL PRODUCTION SECOND CHECK:** NO-GO  
**QUALITY BENEFIT:** INCONCLUSIVE  
**SAFE PRODUCTION INTEGRATION:** NO-GO  
**PRODUCTION CHANGES MADE:** NONE

PR #227 must remain benchmark-only/draft. It is not a production integration PR.
