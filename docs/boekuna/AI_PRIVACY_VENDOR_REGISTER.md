# Boekuna — AI processor & privacy vendor register

Last verified: 29 September 2026

This register records the external facts used for the Boekuna document-scanner privacy/release gate. It deliberately separates public provider terms from production-account settings that still require account-level evidence.

## OpenAI API

- Purpose in Boekuna: structured document interpretation and independent second verification after local/PDF text extraction and OCR.
- Data that can be sent: relevant extracted document text; for independent verification, the original uploaded PDF/image can also be sent when supported.
- Training: OpenAI states that API inputs/outputs are not used to train its models by default unless the customer explicitly opts in.
- Responses application state: Boekuna sends `store:false`.
- Standard abuse-monitoring retention: OpenAI documents up to 30 days by default, unless a qualifying organization/project has approved Modified Abuse Monitoring or Zero Data Retention controls.
- ZDR status for Boekuna production: **NOT VERIFIED**. Do not describe production as ZDR until account-level evidence exists.
- Data residency / regional processing for Boekuna production: **NOT VERIFIED**. The application defaults to `https://api.openai.com/v1/responses` and supports overriding `OPENAI_RESPONSES_URL`; do not describe this as EU-only without account/endpoint evidence.
- Contract / DPA: OpenAI's DPA effective 1 January 2026 covers Customer Data processed under the OpenAI Services Agreement and identifies OpenAI Ireland Ltd. for EEA/Swiss customers. Whether the actual Boekuna production organization/project is the intended contracted account still requires explicit owner-level confirmation.
- International transfers: OpenAI's current DPA states that EEA/Swiss transfers outside the EEA/Switzerland use SCCs or an EU adequacy decision.
- Subprocessors: use OpenAI's current published subprocessor list; it includes infrastructure providers and processing locations that can include locations outside the EEA.

### Provider references

- Data controls / retention: https://developers.openai.com/api/docs/guides/your-data
- Data Processing Addendum: https://openai.com/policies/data-processing-addendum/
- Services Agreement: https://openai.com/policies/services-agreement/
- Subprocessor list: https://openai.com/policies/sub-processor-list/
- Business data privacy: https://openai.com/business-data/

## Boekuna implementation controls

- Local OCR stays in the BOEKUNA document processor; OCR itself does not require an external commercial OCR provider.
- OpenAI requests use `store:false`.
- Full OCR text/document contents are not intended to be written to application logs.
- Provider errors are mapped to stable public error codes; raw provider/document content is not returned to end users.
- Private document storage remains in Supabase under authenticated user access/RLS controls.
- Human review remains part of the financial flow; AI/OCR is not the financial authority.

## Production evidence still required before closing P1 #53

1. Owner-level confirmation that the production OpenAI API organization/project is the intended business account covered by the applicable Services Agreement/DPA.
2. Screenshot/export or equivalent account evidence of the production project's actual retention control: standard abuse monitoring, Modified Abuse Monitoring, or ZDR.
3. Account/endpoint evidence for actual data residency/regional processing; if EU processing is enabled and required, verify the configured approved endpoint/project settings.
4. Confirm that organization/project API input/output sharing remains disabled unless explicitly intended.
5. Re-check the final production environment after deployment and retain evidence with the release record.

These are account/legal configuration checks, not assumptions that can be proven from repository source alone.
