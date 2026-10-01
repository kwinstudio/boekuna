# BOEKUNA Full E2E Synthetic Test Data

Run ID: QA-E2E-20261001  
Frozen source: 7132029b792c8942f18317637ff352461dfe08d5

All names and records below are synthetic. No real customer, supplier, mailbox, bank account or payment credential may be used.

## Idempotent identities

- Customer: QA-E2E-20261001-KLANT-ALPHA
- Customer long-name: QA-E2E-20261001-KLANT-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
- Supplier: QA-E2E-20261001-LEVERANCIER-BETA
- Service: QA-E2E-20261001-DIENST
- Booking: QA-E2E-20261001-BOOK-001
- Invoice reference: QA-E2E-20261001-INV-001
- Expense reference: QA-E2E-20261001-EXP-001
- Settlement reference: QA-E2E-20261001-SETTLE-001
- Bank references: QA-E2E-20261001-BANK-001 through BANK-010

## Financial truth set

| Fixture | Excl. | VAT | Incl. | Purpose |
|---|---:|---:|---:|---|
| SALE-21 | €100.00 | €21.00 | €121.00 | canonical 21% sales invoice |
| SALE-9 | €100.00 | €9.00 | €109.00 | canonical 9% sales invoice |
| EXP-21 | €50.00 | €10.50 | €60.50 | canonical 21% purchase |
| EXP-9 | €50.00 | €4.50 | €54.50 | canonical 9% purchase |
| MIXED-VAT | €200.00 | €30.00 | €230.00 | €100 @ 9% + €100 @ 21%; must stay split |
| CENT | €0.01 | source-rule result | source-rule result | rounding / minimum amount edge |
| LARGE | €100000.00 | €21000.00 | €121000.00 | large amount |
| MULTILINE | €300.00 | €39.00 | €339.00 | €100 @ 21% + €200 @ 9% |

When SALE-21, EXP-21 and MIXED-VAT are booked in one period, expected accounting truth for those records only is:
- revenue €100.00;
- costs €250.00;
- profit -€150.00;
- output VAT €21.00;
- input VAT €40.50;
- VAT position -€19.50 (refund/receivable direction; UI sign must follow BOEKUNA's existing accounting contract).

## Multi-period dates

- 2025-12-31 — previous year / year-boundary case.
- 2026-01-15 — Q1.
- 2026-03-31 — Q1 end.
- 2026-04-01 — Q2 start.
- 2026-06-30 — Q2 end.
- 2026-07-01 — Q3 start.
- 2026-09-30 — Q3 end.
- 2026-10-01 — Q4 start/current run date.

## Document fixtures

Use only repository-safe fixtures or generated synthetic documents. Existing repository fixture `tests/fixtures/02_gemengde_btw_9_en_21.pdf.b64` is eligible for mixed-VAT processor regression. Create generated digital PDF, scan-like PDF, multipage PDF, JPG and PNG only in QA/evidence space if runtime execution becomes available.

## Bank fixtures

CSV rows must contain only synthetic references above. Duplicate fixture repeats an identical normalized date/amount/description tuple. Malformed and empty fixtures contain no real bank data.

Source audit on the frozen SHA found no CAMT.053 or MT940 parser/reference in the app or repository. Those matrix scenarios are candidates for NOT_APPLICABLE at the bank checkpoint, not failures.

## External-service rules

- Stripe: test mode only; no real charge.
- KVK: sandbox/mock/test contract unless a production request is explicitly safe and isolated.
- Email: test recipient only; no real customer mail.
- Processor: synthetic document only.
- Supabase: QA account(s) only for destructive flows.
