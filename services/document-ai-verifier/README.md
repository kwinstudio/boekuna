# BOEKUNA Document AI Verifier

This service is an isolated semantic second-check for BOEKUNA documents.

It is not a general AI service and it is not a financial source of truth.

## Allowed job

Input:
- normalized document image;
- bounded OCR text;
- current BOEKUNA parser value/confidence;
- BOEKUNA parser candidates.

Output:
- agree;
- disagree;
- uncertain;
- verifier confidence;
- short visible-document evidence;
- whether the verifier value matches an existing BOEKUNA parser candidate.

The service never returns an accepted booking value.

## Explicitly out of scope

No database connection, Supabase client, Stripe/billing, bank data, general chat,
bookkeeping writes, user/account identifiers, document storage, model training,
or OCR replacement.

## Runtime boundary

The API wrapper talks only to an OpenAI-compatible local multimodal inference endpoint:

LOCAL_VLM_URL

For a same-host deployment this can be a local llama.cpp server.

Required environment:
- BOOKUNA_DOCUMENT_AI_TOKEN

Optional:
- LOCAL_VLM_MODEL
- VERIFIER_TIMEOUT_SECONDS
- VERIFIER_CONCURRENCY
- VERIFIER_CIRCUIT_FAILURE_THRESHOLD
- VERIFIER_CIRCUIT_OPEN_SECONDS

## Failure behavior

If the model is unavailable, times out, returns invalid JSON, or opens the circuit
breaker, the verifier fails closed. BOEKUNA must continue with:

OCR -> deterministic parser -> financial validation -> human review

The verifier must never become required for a document to be processed.

## Deployment note

The current Render Free document processor must not host Qwen in-process.
A production GPU target requires a separate benchmark and independent TR3 review.
