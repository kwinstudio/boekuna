# V6 scenario matrix

Every row runs the EXISTING engine (`app.heuristic_extract` → `document_intelligence`) on synthetic text or images. No customer documents.
Columns: scenario → existing implementation → fixture/test → expected → actual on candidate → status.

Test files: **M** = `tests/document-v6-metadata.test.py` (107), **S** = `tests/document-v6-scenarios.test.py` (47), **B** = frozen OCR benchmark `tests/document-ocr-v5-benchmark.test.py` (28 rendered documents), **R** = `tests/test_document_processor_regression.py`, **P** = `tests/document-intelligence-phases.test.py`, **U** = `tests/document-scan-intelligence-unit.test.py`, **O** = `tests/document-ocr-v5-regressions.test.py`, **E** = `tests/document-error-contract.test.py`.

Status: **PASS** = exact expected value; **PASS (review)** = value withheld (null) and routed to review, never guessed; **PARTIAL** = safe (null, no wrong value) but not extracted; **OPEN** = not covered.

Score on the 47 S-fixtures: main `50fa6ae` 36/47, PR head `6d27ea9` 40/47, candidate 47/47. M-fixtures: main 40/107, `6d27ea9` 107/107, candidate 107/107.

## Identifiers

| Scenario | Existing implementation | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| KvK exactly 8 digits, spaces/dots | `contact_block` KvK regex | M `test_labeled_kvk_normalization_without_prefix_assumption` | `74542893` | `74542893` | PASS |
| KvK 9/12 digits not truncated | same | M `test_kvk_does_not_truncate_long_identifiers` | null | null | PASS |
| Vestigingsnummer next to KvK | same | S `test_id_kvk_vestigingsnummer_is_not_kvk` | KvK only | `74542893` | PASS |
| RSIN | same | S `test_id_rsin_is_not_kvk_or_vat` | not KvK; VAT kept | kvk null, VAT `NL854371234B01` | PASS |
| NL VAT ID separators | `contact_block` NL VAT | M `test_vat_id_normalization` | `NL123456789B01` | same | PASS |
| Foreign VAT ID (DE/BE/FR/AT) | `document_intelligence` foreign tax context | S `test_id_foreign_vat_id_is_review_evidence_not_supplier_identity` | not assigned; VAT treatment review | null + `review_required` (AT `ATU…` fixed in this round) | PASS (review) |
| Numeric, leading zero, year-sequence, alphanumeric, slash, hyphen, dot, hash, 8-digit | invoice-number candidates | M `test_invoice_shapes` (17) + `test_invoice_label_families` (19) | exact | exact | PASS |
| Number on next line | following-line extraction | S `test_id_invoice_number_on_next_line` | `INV-2026-0042` | same | PASS |
| Number in table header row | structured table lines | S `test_id_invoice_number_in_table_header_row` | `INV-2026-0042`, date `2026-10-07` | same | PASS |
| Number above its label | none | S `test_id_number_above_label_is_not_guessed_from_other_ids` | not guessed | null + `invoiceNumber` review | PARTIAL |
| Order/customer/payment/factoring/KvK/VAT not taken as invoice number | label fences | M `test_empty_invoice_label_does_not_borrow_other_identifiers` (8), S `test_id_invoice_number_not_confused_with_other_identifiers` (6) | null / correct | same | PASS |
| Repeated identical vs conflicting strong candidates | candidate set | M `test_repeated_invoice_number_is_not_conflict`, `test_conflicting_strong_labels_route_to_review`, `test_inline_invoice_number_conflict_is_reviewed` | value / null + `COMPETING_INVOICE_NUMBERS` | same | PASS |
| Credit note own number vs original reference | credit labels | M `test_credit_identity_is_separate_from_original_invoice` (3), `test_competing_credit_identity_still_requires_review` | own CN number | same | PASS |

## Dates

| Scenario | Existing implementation | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| DD-MM-YYYY, D/M/YYYY, YYYY-MM-DD, dotted, compact | `norm_date`, `date_field_candidates` | M `test_invoice_date_formats` (9) | `2026-10-07` | same | PASS |
| Textual NL/EN (`7 oktober 2026`, `07 okt 2026`, `October 7, 2026`) | `norm_date` | S `test_date_textual_nl_en` (3), U `test_dutch_month_abbreviation_is_parsed` | `2026-10-07` | same | PASS |
| English ordinal (`7th October 2026`) | — | S `test_date_ordinal_english_is_not_guessed` | not guessed | null + `AMBIGUOUS_INVOICE_DATE` | PASS (review) |
| Short years with/without full-date evidence | short-year context | M `test_two_digit_year_*`, `test_short_year_*` (8) | value only with one consistent year | same | PASS |
| Ambiguous foreign (US/CA/AU) slash dates | foreign date context | M `test_foreign_*` (4) | null + review | same | PASS |
| Invoice/due/order/service/delivery/payment roles | role labels | M `test_date_roles_remain_distinct`, `test_secondary_date_roles_and_service_period_are_separate` | separate | same | PASS |
| Due date only is not the invoice date | native-text `datum` fallback (fixed in this round) | S `test_date_due_not_taken_as_invoice_date` | invoiceDate ≠ due | invoiceDate null, due `2026-10-21` | PASS |
| Numeric service period, reversed period | period labels | M `test_secondary_date_roles_and_service_period_are_separate`, `test_reversed_service_period_requires_review` | from/to; reversed → null + `INVALID_SERVICE_PERIOD` | same | PASS |
| Textual service period (`september 2026`) | — | S `test_date_textual_service_period` | not invented | null (optional field) | PARTIAL |
| Missing / conflicting dates | candidates | S `test_date_missing_stays_null`, M `test_conflicting_invoice_dates_require_review` | null / null + review | same | PASS |

## Parties

| Scenario | Existing implementation | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| Supplier top-left before addressee | `contact_block` | S `test_party_supplier_top_left_before_addressee` | supplier + own KvK; customer KvK separate | same | PASS |
| Supplier labelled top-right (`Van:`) | `contact_block` | S `test_party_supplier_top_right_labelled` | correct split | same | PASS |
| Supplier only in footer | `contact_block` (fixed in this round: addressee excluded, legal-footer name) | S `test_party_supplier_only_in_footer` | supplier from footer, customer without supplier KvK/VAT, supplier review | same | PASS |
| Customer prominent above supplier | `contact_block` | S `test_party_customer_prominent_above_supplier` | supplier = labelled `Van:` | same | PASS |
| Own company context | `own_matches`, `layout_own_party_name` | S `test_party_company_context_identifies_own_company` | own company is customer | same | PASS |
| Self-billing | `self_billing` | R `test_sales_direction_does_not_imply_self_billing`, `test_reconcile_preserves_only_explicit_self_billing`, B `self-billing` | only explicit | same | PASS |
| Multiple party blocks | party label boundary | M `test_party_block_identifiers_do_not_leak_into_supplier` | no leakage | same | PASS |
| Multiple IBANs / payer account | IBAN filter | S `test_party_multiple_ibans_do_not_pick_payer_account`, M `test_payer_account_is_not_supplier_account` | supplier IBAN only | same | PASS |
| Foreign supplier with NL VAT ID | NL VAT + treatment | S `test_party_foreign_supplier_with_nl_vat_id` | NL VAT kept | `NL823456789B01` | PASS |

## Financial semantics

| Scenario | Existing implementation | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| 21 / 9 / 0 % | `financial_blocks`, labelled amounts | S `test_fin_single_rates` (3), R `test_explicit_zero_percent_vat_is_not_confused_with_missing_vat`, B `restaurant-9`, `tankstation-21`, `zero-vat` | exact | exact | PASS |
| Mixed 9/21 | VAT groups | R `test_original_mixed_vat_9_and_21_fixture_is_cent_exact`, `test_mixed_vat_without_explicit_groups_requires_review`, B `mixed-vat` | exact or review | same | PASS |
| Missing VAT | — | S `test_fin_missing_vat_stays_null_or_review` | vat null + review | null, `vatTotal` review | PASS (review) |
| VAT-inclusive line items, line arithmetic | line items | P `test_header_table_rows_are_extracted_and_checked`, `test_line_vat_mismatch_requires_full_review`, R `test_line_rounded_vat_may_differ_one_cent_from_printed_aggregate` | checked | same | PASS |
| US / EU number notation | money parser | S `test_fin_us_eu_number_notation` (2), P `test_ex_btw_labels_and_us_currency_grouping_are_preserved` | `1493.82` | same | PASS |
| Negative amounts / credit note | signed amounts | S `test_fin_negative_credit_note_amounts`, P `test_credit_note_keeps_signed_amounts`, R `test_negative_currency_sign_before_euro_is_preserved`, B `credit-note` | negative | same | PASS |
| Factoring | adjustments | P `test_factoring_fee_percentage_does_not_change_vat_treatment`, O `test_factoring_primary_totals_are_not_replaced_by_fee_percentage`, B `factoring` | totals kept | same | PASS |
| Paid / unpaid / partial paid | status + balances | S `test_fin_paid_status`, `test_fin_amount_due_differs_from_invoice_total`, M `test_unpaid_text_does_not_set_paid`, B `amount-paid-due`, `advance-due` | paid / open with due 71 | same | PASS |
| amountDue vs invoiceTotal | balances | S `test_fin_amount_due_differs_from_invoice_total`, P `test_deposit_and_balance_are_separate_values`, `test_conflicting_balance_requires_review_without_changing_total` | total 121, due 71 | same | PASS |
| Fees, shipping, discount | adjustments | S `test_fin_shipping_and_discount_reconcile`, P `test_discount_percent_header_controls_arithmetic` | discount 10, shipping 10, total 121 | same | PASS |
| Multipage totals, repeated headers/footers | dedupe | S `test_fin_multipage_repeated_header_footer_totals_once`, B `multipage-pdf` | one number, one total | same | PASS |
| Reverse-charge statement on zero/absent VAT | `document_intelligence` treatment (added in this round) | S `test_fin_reverse_charge_candidate_requires_treatment_review`, `test_fin_reverse_charge_statement_variants` (3) | treatment review | `review_required`, `reverseChargeCandidate` | PASS (review) |
| Reverse-charge boilerplate only / with charged VAT | same | S `test_fin_reverse_charge_boilerplate_does_not_change_standard_vat`, `test_fin_reverse_charge_text_with_charged_vat_is_not_reverse_charge` | standard | standard | PASS |
| Printed conflicts preserved, missing stays null | existing validators | P `test_explicit_contradictory_*`, `test_all_parser_total_labels_preserve_printed_conflicts`, B `missing-fields` | preserved / null | same | PASS |

## OCR and document types

| Scenario | Existing implementation | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| O/0 in identifiers | no rewrite | S `test_ocr_o_zero_in_invoice_number_is_not_rewritten`, B `number-disambiguation` | printed value | same | PASS |
| Native-text vs image-only PDF | `nativePdfNoOcr`, OCR fallback | B `digital-pdf`, `image-only-pdf`, `scanned-pdf` | fully correct | 28/28 | PASS |
| HEIC / photo | HEIC decode, error contract | E HEIC cases, B `standard-invoice-image`, `smartphone-perspective-shadow` | decoded / clear error | same | PASS (automated only) |
| Skew, rotation, low contrast, dark, blur, low resolution | quality gate + OCR passes | B `receipt-skew`, `receipt-rotate-*`, `receipt-low-contrast`, `receipt-dark`, `receipt-blur`, `receipt-low-resolution`, U quality tests | fully correct | 28/28 | PASS |
| Long receipts | overlapping tiles | B `receipt-long`, `receipt-very-long-small`, U `test_long_receipt_uses_overlapping_tiles_and_preserves_bottom_coordinates` | fully correct | same | PASS |

Physical iPhone camera/HEIC capture is not covered by any automated row.
