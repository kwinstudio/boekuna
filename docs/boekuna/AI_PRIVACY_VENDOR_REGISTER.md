# Boekuna — external AI privacy/vendor register

Last verified: 29 September 2026

## Production status

**External AI is disabled in production and is not an active Boekuna production processor.**

The standard document flow uses local/PDF text extraction, OCR, deterministic financial checks and human review in the Boekuna document processor. The client keeps external AI review disabled, and both the Render processor and Supabase AI-review path require the explicit opt-in feature flag `BOOKUNA_ENABLE_EXTERNAL_AI` before provider code can run.

Current production policy: document text, uploaded PDFs/images and scan results are **not sent to OpenAI or another external AI provider**.

The repository still contains dormant opt-in integration code so the feature can be reconsidered later. Dormant code is not authorization to enable it.

## Historical provider record: OpenAI API

OpenAI was previously evaluated as an optional fallback/independent verification provider. The production release no longer depends on that integration.

Current official references retained for any future review:

- Data controls / retention: https://developers.openai.com/api/docs/guides/your-data
- Data Processing Addendum: https://openai.com/policies/data-processing-addendum/
- Terms/policies index: https://openai.com/policies/

OpenAI's current API data-control documentation states that API data is not used for training by default unless the customer opts in, and documents endpoint-specific retention controls. Those provider terms are **not a current Boekuna launch dependency while the integration remains disabled**.

## Boekuna implementation controls

- External AI is opt-in only through `BOOKUNA_ENABLE_EXTERNAL_AI`; the default is disabled.
- The browser has external AI review disabled by default.
- The local-first `/analyze` path remains usable when external AI is unavailable or disabled.
- Uncertain documents fall back to manual review rather than being falsely marked independently verified.
- Provider errors are mapped to stable public errors and raw provider/document content is not returned to end users.
- Private document storage remains in Supabase behind authenticated ownership/RLS controls.
- Human review remains part of the financial flow; OCR/automation is not the financial authority.

## Evidence supporting closure of P1 #53

- Production Render document processor was promoted to the current `main` source after the local-first canary.
- External AI is disabled by default in the processor source.
- Supabase `analyze-invoice` fails closed before provider calls unless the explicit external-AI feature flag is enabled.
- The client does not queue the external AI review path while disabled.
- Public privacy and store disclosures now state that external AI is not used in the current production document flow.
- A real production document canary showed that base `/analyze` processing completed successfully even while the former external AI provider was unavailable.

## Mandatory reactivation gate

Before any future production reactivation of external AI, all of the following must be completed again:

1. Owner-level confirmation of the intended provider account and applicable contract/DPA.
2. Verification of actual retention/data-control configuration for the production project.
3. Verification of regional/data-residency configuration if any regional claim is intended.
4. Subprocessor/international-transfer review as applicable.
5. Public privacy/store disclosures updated **before** activation.
6. Security/QA retest proving the exact data sent, logging behavior, error handling and manual-review fallback.
7. Explicit production change enabling the feature flag and required credentials.

Until that gate is completed, external AI must remain disabled.
