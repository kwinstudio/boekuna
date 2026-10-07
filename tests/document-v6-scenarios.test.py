"""V6 scenario matrix gaps: synthetic fixtures through the EXISTING production parser.

Each test id is referenced from docs/engineering/document-v6-evidence/scenario-matrix.md.
Expectations are either the exact value or null plus review; never a guess.
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.getenv('BOOKUNA_PROCESSOR_DIR', str(Path(__file__).resolve().parents[1] / 'kwinest/docprocessor')))
import app as p


def run(text, company=None):
    doc = dict(kind='pdf', pageCount=1, text=text, nativeText=text,
               tables=[], layout=[], ocrPages=[], warnings=[])
    return p.heuristic_extract(doc, 'synthetic.pdf', company or {})


def invoice(metadata, totals='Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00', head='FACTUUR\nLeverancier: Test Leverancier BV'):
    return run(head + '\n' + metadata + '\n' + totals)


def reviewed(r, field=None):
    routing = r.processing.get('reviewRouting') or {}
    return bool(r.processing.get('anomalyCodes')) or routing.get('mode') == 'FULL_REVIEW' or (field in (routing.get('fields') or []))


# ---------- identifiers ----------

def test_id_kvk_vestigingsnummer_is_not_kvk():
    r = invoice('KvK: 74542893\nVestigingsnummer: 000042491371')
    assert r.supplier.kvk == '74542893'


def test_id_rsin_is_not_kvk_or_vat():
    r = invoice('RSIN: 854371234\nBTW-id: NL854371234B01')
    assert r.supplier.kvk is None
    assert r.supplier.vatNumber == 'NL854371234B01'


@pytest.mark.parametrize('vat', ['DE123456789', 'BE0123456789', 'FR12345678901', 'ATU12345678'])
def test_id_foreign_vat_id_is_review_evidence_not_supplier_identity(vat):
    # Existing design (document_intelligence): a lone foreign tax ID may be the
    # customer's, so it routes VAT treatment to review instead of being assigned.
    r = invoice('VAT ID: ' + vat)
    assert r.supplier.vatNumber is None
    assert r.amounts.accountingVatTreatment == 'review_required'


def test_id_invoice_number_on_next_line():
    assert invoice('Factuurnummer:\nINV-2026-0042').invoice.invoiceNumber == 'INV-2026-0042'


def test_id_invoice_number_in_table_header_row():
    r = invoice('Factuurnummer | Factuurdatum | Klantnummer\nINV-2026-0042 | 07-10-2026 | 44321')
    assert r.invoice.invoiceNumber == 'INV-2026-0042'
    assert r.invoice.invoiceDate == '2026-10-07'


def test_id_number_above_label_is_not_guessed_from_other_ids():
    # Value above its label is not resolved; it is never borrowed from another identifier.
    r = invoice('Klantnummer: 44321\nINV-2026-0042\nFactuurnummer')
    assert r.invoice.invoiceNumber is None
    assert 'invoiceNumber' in r.processing['reviewRouting']['fields']


@pytest.mark.parametrize('other', ['Ordernummer: ORD-77', 'Klantnummer: K-77', 'Betalingskenmerk: 1234 5678 9012 3456',
                                   'Factoringnummer: F-77', 'KvK: 74542893', 'BTW-id: NL123456789B01'])
def test_id_invoice_number_not_confused_with_other_identifiers(other):
    r = invoice(other + '\nFactuurnummer: INV-9')
    assert r.invoice.invoiceNumber == 'INV-9'


# ---------- dates ----------

@pytest.mark.parametrize('value', ['7 oktober 2026', '07 okt 2026', 'October 7, 2026'])
def test_date_textual_nl_en(value):
    assert invoice('Factuurdatum: ' + value).invoice.invoiceDate == '2026-10-07'


def test_date_ordinal_english_is_not_guessed():
    r = invoice('Factuurdatum: 7th October 2026')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_date_missing_stays_null():
    r = invoice('Factuurnummer: INV-1')
    assert r.invoice.invoiceDate is None


def test_date_textual_service_period():
    r = invoice('Factuurdatum: 03-10-2026\nPeriode: september 2026')
    assert r.invoice.invoiceDate == '2026-10-03'
    # Month-name periods are not expanded (optional metadata stays null).
    assert r.invoice.servicePeriodFrom is None and r.invoice.servicePeriodTo is None


def test_date_due_not_taken_as_invoice_date():
    r = invoice('Vervaldatum: 21-10-2026')
    assert r.invoice.invoiceDate != '2026-10-21'
    assert r.invoice.dueDate == '2026-10-21'


# ---------- parties ----------

def test_party_supplier_only_in_footer():
    r = run('FACTUUR\nFactuur aan: Acme Afnemer BV\nFactuurnummer: INV-1\nFactuurdatum: 07-10-2026\n'
            'Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00\n'
            'Noordzee Levering BV | KvK 74542893 | BTW NL123456789B01 | IBAN NL91ABNA0417164300')
    assert r.customer.name == 'Acme Afnemer BV'
    assert r.supplier.name == 'Noordzee Levering BV'
    assert r.supplier.kvk == '74542893'
    assert r.customer.kvk is None and r.customer.vatNumber is None
    assert 'supplierName' in r.processing['reviewRouting']['fields']


def test_party_supplier_top_left_before_addressee():
    r = run('Noordzee Levering BV\nKvK: 74542893\nFACTUUR\nFactuur aan: Acme Afnemer BV\nKvK: 87654321\n'
            'Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    assert r.supplier.name == 'Noordzee Levering BV'
    assert r.supplier.kvk == '74542893'
    assert r.customer.kvk == '87654321'


def test_party_supplier_top_right_labelled():
    r = run('FACTUUR\nFactuur aan: Acme Afnemer BV\nVan: Noordzee Levering BV\nKvK: 74542893\n'
            'Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    assert r.supplier.name == 'Noordzee Levering BV'
    assert r.customer.name == 'Acme Afnemer BV'


def test_party_customer_prominent_above_supplier():
    r = run('Acme Afnemer BV\nFactuur aan\n\nFACTUUR\nVan: Noordzee Levering BV\nKvK: 74542893\n'
            'Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    assert r.supplier.name == 'Noordzee Levering BV'
    assert r.supplier.kvk == '74542893'


def test_party_company_context_identifies_own_company():
    company = {'name': 'Mijn Bedrijf BV', 'kvk': '11223344', 'vat': 'NL112233445B01'}
    r = run('Mijn Bedrijf BV\nKvK 11223344\nFACTUUR\nLeverancier: Externe Leverancier BV\nKvK: 74542893\n'
            'Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00',
            company)
    assert r.supplier.kvk != '11223344'


def test_party_multiple_ibans_do_not_pick_payer_account():
    r = invoice('IBAN leverancier: NL91ABNA0417164300\nUw rekening (incasso): NL20INGB0001234567')
    assert r.supplier.iban == 'NL91ABNA0417164300'


def test_party_foreign_supplier_with_nl_vat_id():
    r = invoice('Supplier country: Germany\nUSt-IdNr.: DE123456789\nBTW-id: NL823456789B01',
                head='INVOICE\nSupplier: Beispiel GmbH')
    assert r.supplier.vatNumber == 'NL823456789B01'


# ---------- financial semantics ----------

@pytest.mark.parametrize('rate,vat,total', [(21, '21,00', '121,00'), (9, '9,00', '109,00'), (0, '0,00', '100,00')])
def test_fin_single_rates(rate, vat, total):
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026',
                totals=f'Subtotaal EUR 100,00\nBTW {rate}% EUR {vat}\nTotaal EUR {total}')
    assert r.amounts.total == float(total.replace(',', '.'))
    assert r.amounts.vatTotal == float(vat.replace(',', '.'))


def test_fin_missing_vat_stays_null_or_review():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026', totals='Totaal EUR 121,00')
    assert r.amounts.total == 121.0
    assert r.amounts.vatTotal is None or reviewed(r)


@pytest.mark.parametrize('totals,expected', [
    ('Subtotal EUR 1,234.56\nVAT 21% EUR 259.26\nTotal EUR 1,493.82', 1493.82),
    ('Subtotaal EUR 1.234,56\nBTW 21% EUR 259,26\nTotaal EUR 1.493,82', 1493.82),
])
def test_fin_us_eu_number_notation(totals, expected):
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026', totals=totals)
    assert r.amounts.total == expected


def test_fin_amount_due_differs_from_invoice_total():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026',
                totals='Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00\nReeds betaald EUR 50,00\nTe betalen EUR 71,00')
    assert r.amounts.total == 121.0
    assert r.amounts.amountDue == 71.0
    assert r.amounts.alreadyPaid == 50.0
    assert r.status == 'open'


def test_fin_paid_status():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nBetaald op 07-10-2026 via iDEAL')
    assert r.amounts.total == 121.0
    assert r.status == 'paid'
    assert r.invoice.paymentDate == '2026-10-07'


def test_fin_shipping_and_discount_reconcile():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026',
                totals='Producten EUR 100,00\nKorting EUR -10,00\nVerzendkosten EUR 10,00\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    assert r.amounts.total == 121.0
    assert r.amounts.vatTotal == 21.0
    assert r.amounts.discount == 10.0 and r.amounts.shipping == 10.0


def test_fin_negative_credit_note_amounts():
    r = run('CREDITNOTA\nLeverancier: Test Leverancier BV\nCreditnota nummer: CN-1\nDatum: 07-10-2026\n'
            'Subtotaal EUR -100,00\nBTW 21% EUR -21,00\nTotaal EUR -121,00')
    assert r.amounts.total == -121.0


def test_fin_reverse_charge_candidate_requires_treatment_review():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nBTW verlegd\nBTW-id afnemer: NL123456789B01',
                totals='Subtotaal EUR 100,00\nBTW 0% EUR 0,00\nTotaal EUR 100,00')
    assert r.amounts.total == 100.0
    assert r.amounts.vatTotal == 0.0
    assert r.amounts.accountingVatTreatment == 'review_required'
    assert r.processing.get('reverseChargeCandidate') is True


@pytest.mark.parametrize('statement', ['VAT reverse charged', 'Reverse charge: article 196 VAT Directive', 'Verlegde btw'])
def test_fin_reverse_charge_statement_variants(statement):
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\n' + statement,
                totals='Subtotaal EUR 100,00\nTotaal EUR 100,00')
    assert r.amounts.accountingVatTreatment == 'review_required'


def test_fin_reverse_charge_boilerplate_does_not_change_standard_vat():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\n'
                'Bij intracommunautaire leveringen kan de btw verlegd worden.')
    assert r.amounts.total == 121.0
    assert r.amounts.vatTotal == 21.0
    assert r.amounts.accountingVatTreatment == 'standard'
    assert not r.processing.get('reverseChargeCandidate')


def test_fin_reverse_charge_text_with_charged_vat_is_not_reverse_charge():
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\nBTW verlegd')
    assert r.amounts.vatTotal == 21.0
    assert not r.processing.get('reverseChargeCandidate')


def test_fin_multipage_repeated_header_footer_totals_once():
    page = 'Test Leverancier BV | KvK 74542893\nFactuurnummer: INV-1\n'
    r = run('FACTUUR\nLeverancier: Test Leverancier BV\n' + page + 'Factuurdatum: 07-10-2026\nRegel A EUR 50,00\n'
            'Pagina 1 van 2\n' + page + 'Regel B EUR 50,00\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00\nPagina 2 van 2')
    assert r.invoice.invoiceNumber == 'INV-1'
    assert r.amounts.total == 121.0


# ---------- OCR ----------

def test_ocr_o_zero_in_invoice_number_is_not_rewritten():
    assert invoice('Factuurnummer: INV-2O26-OO1').invoice.invoiceNumber == 'INV-2O26-OO1'


@pytest.mark.parametrize('statement', ['BTW: verlegd', 'BTW-verlegd', 'BTW 0% verlegd', 'Omzetbelasting verlegd'])
def test_fin_reverse_charge_dutch_spellings(statement):
    r = invoice('Factuurnummer: INV-1\nFactuurdatum: 07-10-2026\n' + statement,
                totals='Subtotaal EUR 100,00\nTotaal EUR 100,00')
    assert r.amounts.accountingVatTreatment == 'review_required'


def test_fin_own_reverse_charge_sales_invoice_keeps_booking_path():
    company = {'name': 'Jansen Bouw ZZP', 'kvk': '11223344', 'vat': 'NL112233445B01'}
    r = run('FACTUUR\nVan: Jansen Bouw ZZP\nKvK: 11223344\nBTW-id: NL112233445B01\nFactuur aan: Aannemer Groot BV\n'
            'Factuurnummer: 2026-014\nFactuurdatum: 07-10-2026\nSubtotaal EUR 1.000,00\nBTW verlegd\nTotaal EUR 1.000,00', company)
    assert r.documentType == 'sales_invoice'
    assert r.amounts.accountingVatTreatment == 'standard'
    assert not r.processing.get('reverseChargeCandidate')


def test_party_name_starting_with_total_word_is_not_a_totals_boundary():
    r = run('FACTUUR\nLeverancier:\nTotaal Techniek B.V.\nKvK: 74542893\nFactuurnummer: INV-1\nFactuurdatum: 07-10-2026\n'
            'Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    assert r.supplier.kvk == '74542893'
