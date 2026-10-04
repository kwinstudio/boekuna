# OCR V4 user-supplied fixture coverage — 2026-10-04

## Privacy boundary

BOEKUNA does not commit raw customer invoices, receipts, photos, addresses, bank identifiers or OCR dumps to the public repository.

This audit records **anonymized pattern coverage** only. User-supplied files remain private inputs. Regression fixtures reproduce the accounting/layout pattern with fictive data.

## Batch coverage

### Real PDF patterns

The supplied PDF batch contained nine distinct document patterns. All nine are represented by deterministic regressions:

- simple Dutch 21% purchase invoice → `check-simple-21`;
- paid logistics confirmation → `dhl-paid-confirmation`;
- three self-billing/factoring invoice variants → `self-billing-payday-23003`, `self-billing-payday-26002`, `self-billing-payday-26009`;
- contractor/sales invoice with issue date and time rows → `finqle-style-sales-invoice`;
- two factoring/negative-line settlement variants → `reddende-engel-july`, `reddende-engel-august`;
- non-financial return/RMA document → dedicated RMA/return-order regression.

### Image/photo patterns

Ten supplied image examples were reviewed as patterns. Their relevant risks are covered by:

- clear standard invoice layouts → `invoice-photo-png`, `screenshot-png`, digital-PDF regressions;
- blur / low resolution / hard-to-read capture → `tank-blur-jpeg`, `receipt-low-resolution-jpeg`, quality-gate regressions;
- shadow / perspective / difficult capture → `receipt-shadow-jpeg`, `receipt-perspective-jpeg`, `receipt-dark-shadow-jpeg`;
- large monetary formatting and explicit totals → total-label and financial-block regressions;
- PO/order/invoice-number confusion → `invoice-number-context-pdf`;
- advance payment plus remaining balance → `test_advance_payment_preserves_invoice_total_and_open_status`;
- foreign explicit 20% VAT → `test_foreign_twenty_percent_vat_is_not_silently_rewritten_to_dutch_rate`.

The 20% VAT fixture intentionally does **not** convert 20% to 21%. Printed amounts remain available while the unsupported/foreign VAT structure stays untrusted for automatic Dutch VAT grouping.

### Generated invoice packs

The two supplied generated packs contain twenty layout/shape variants. They are covered at pattern level by the deterministic 21-case scan benchmark, including:

- image invoice;
- screenshot-style image;
- digital PDF;
- scanned PDF;
- multipage PDF;
- mixed 9%/21% VAT;
- month-name dates;
- invoice-number context;
- false mixed-VAT footer percentages;
- explicit end-total labels;
- low-resolution, dark, skewed, blurred, shadowed, perspective and long-receipt variants.

## Release invariant

A future OCR/document-parser change must keep:

- printed invoice totals authoritative over advance/outstanding balances;
- advance payments from implying fully paid status;
- unsupported/foreign VAT rates from being silently rewritten to a Dutch rate;
- cent-exact 9%/21% single- and mixed-VAT validation;
- raw customer documents out of the repository.
