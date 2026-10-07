"""Synthetic scenario families; exercises the existing production parser."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.getenv('BOOKUNA_PROCESSOR_DIR', str(Path(__file__).resolve().parents[1] / 'kwinest/docprocessor')))
import app as p


def extract(metadata, company=None):
    text = ('FACTUUR\nLeverancier: Test Leverancier BV\n'
            + metadata + '\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    doc = dict(kind='pdf', pageCount=1, text=text, nativeText=text,
               tables=[], layout=[], ocrPages=[], warnings=[])
    return p.heuristic_extract(doc, 'synthetic.pdf', company or {})


@pytest.mark.parametrize('label', ['Factuurnummer', 'Factuurnr.', 'Fact. nr.', 'Factnr.',
    'Factuur #', 'Invoice number', 'Invoice No.', 'Inv. no.', 'Inv#', 'Invoice ID',
    'Rechnungsnummer', 'Rechnungs-Nr.', 'Re.-Nr.', 'Rg.-Nr.', 'Numéro de facture',
    'N° facture', 'Facture n°', 'Número de factura', 'Factura Nº'])
def test_invoice_label_families(label):
    assert extract(f'{label}: INV-2026-014').invoice.invoiceNumber == 'INV-2026-014'


@pytest.mark.parametrize('value', ['123', '000123', '12345678', '2026-001', '2026/001',
    '2026.001', '2026 001', 'INV2026001', 'Y41829625005', 'CHECK-F05BE34CF5',
    '5KMQH259-0001', 'NL644900', 'WP226-1030608', '9BF0758D-7568136', 'VRQBUI-00001', '20261007', '01012026'])
def test_invoice_shapes(value):
    assert extract(f'Factuurnummer: {value}').invoice.invoiceNumber == value


@pytest.mark.parametrize('other', ['Klantnummer: 44321', 'Debiteurnummer: 44321',
    'Payment reference: RF18539007547034', 'Factoring reference: FAC-999',
    'Order No: 983746', 'KvK: 74542893', 'VAT: NL123456789B01', 'Datum: 07-10-2026'])
def test_empty_invoice_label_does_not_borrow_other_identifiers(other):
    assert extract('Factuurnummer:\n' + other).invoice.invoiceNumber is None


def test_conflicting_strong_labels_route_to_review():
    r = extract('Factuurnummer: INV-001\nInvoice No: INV-002')
    assert r.invoice.invoiceNumber is None
    assert 'COMPETING_INVOICE_NUMBERS' in r.processing['anomalyCodes']
    assert r.processing['reviewRouting']['mode'] == 'FULL_REVIEW'
    assert len(r.processing['fieldCandidates']['invoiceNumber']) == 2


def test_repeated_invoice_number_is_not_conflict():
    r = extract('Factuurnummer: INV-001\nInvoice No: INV-001')
    assert r.invoice.invoiceNumber == 'INV-001'
    assert 'COMPETING_INVOICE_NUMBERS' not in r.processing['anomalyCodes']


@pytest.mark.parametrize('prefix',['Uw ', 'Factuurgegevens: '])
def test_invoice_labels_can_have_metadata_prefix(prefix):
    assert extract(prefix+'Factuurnummer: INV-2026-001').invoice.invoiceNumber=='INV-2026-001'


def test_inline_invoice_number_conflict_is_reviewed():
    r=extract('Factuurnummer: INV-001 | Invoice No: INV-002')
    assert r.invoice.invoiceNumber is None
    assert 'COMPETING_INVOICE_NUMBERS' in r.processing['anomalyCodes']


def test_inline_invoice_date_conflict_is_reviewed():
    r=extract('Factuurdatum: 07-10-2026 | Invoice date: 08-10-2026')
    assert r.invoice.invoiceDate is None
    assert 'COMPETING_INVOICE_DATES' in r.processing['anomalyCodes']


@pytest.mark.parametrize('value', ['07-10-2026', '7/10/2026', '2026-10-07',
    '07.10.2026', '7 okt. 2026', '7 October 2026', 'Oct 7, 2026', '07102026', '20261007'])
def test_invoice_date_formats(value):
    assert extract('Factuurdatum: ' + value).invoice.invoiceDate == '2026-10-07'


def test_date_roles_remain_distinct():
    r = extract('Order date: 01-10-2026\nInvoice date: 05-10-2026\nDue date: 19-10-2026')
    assert r.invoice.invoiceDate == '2026-10-05'
    assert r.invoice.dueDate == '2026-10-19'


def test_foreign_ambiguous_numeric_date_requires_review():
    r = extract('Supplier country: United States\nInvoice date: 03/04/2026')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_conflicting_invoice_dates_require_review():
    r = extract('Factuurdatum: 07-10-2026\nInvoice date: 08-10-2026')
    assert r.invoice.invoiceDate is None
    assert 'COMPETING_INVOICE_DATES' in r.processing['anomalyCodes']


@pytest.mark.parametrize('kvk', ['74542893', '74 542 893', '74.542.893', '12345678'])
def test_labeled_kvk_normalization_without_prefix_assumption(kvk):
    assert extract('KvK-nummer: ' + kvk).supplier.kvk == kvk.replace(' ', '').replace('.', '')


@pytest.mark.parametrize('value', ['123456789', '000042491371'])
def test_kvk_does_not_truncate_long_identifiers(value):
    assert extract('KvK: ' + value).supplier.kvk is None


@pytest.mark.parametrize('vat', ['NL123456789B01', 'NL 123456789 B01', 'NL123.456.789.B01'])
def test_vat_id_normalization(vat):
    assert extract('BTW-id: ' + vat).supplier.vatNumber == 'NL123456789B01'


def test_kvk_and_vat_can_share_one_legal_footer_line():
    r=extract('KvK: 74542893 | BTW-id: NL123456789B01')
    assert r.supplier.kvk=='74542893'
    assert r.supplier.vatNumber=='NL123456789B01'


def test_party_block_identifiers_do_not_leak_into_supplier():
    r = extract('KvK: 12345678\nFactuur aan: Test Klant BV\nKvK: 87654321\nBTW-id: NL987654321B01')
    assert r.supplier.kvk == '12345678'
    assert r.supplier.vatNumber is None
    assert r.customer.vatNumber == 'NL987654321B01'


def test_unpaid_text_does_not_set_paid():
    assert extract('Niet betaald\nFactuurnummer: INV-1').status != 'paid'


def test_payer_account_is_not_supplier_account():
    r = extract('Bedrag wordt geïncasseerd van NL91ABNA0417164300\nFactuurnummer: INV-1')
    assert r.supplier.iban is None


def test_two_digit_year_uses_explicit_full_date_context():
    r=extract('Factuurdatum: 07-10-26\nVervaldatum: 21-10-2026')
    assert r.invoice.invoiceDate=='2026-10-07'
    assert r.processing['fieldCandidates']['invoiceDate'][0]['sourceText']=='07-10-26'


def test_two_digit_year_without_context_stays_null_and_reviewed():
    r=extract('Factuurdatum: 07-10-26')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_two_digit_year_does_not_borrow_a_conflicting_century_or_year():
    r=extract('Factuurdatum: 07-10-26\nOrder date: 01-10-2025\nDue date: 21-10-2026')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_secondary_date_roles_and_service_period_are_separate():
    r=extract('Order date: 01-10-2026\nInvoice date: 05-10-2026\nDue date: 19-10-2026\n'
              'Service date: 02-10-2026\nDelivery date: 03-10-2026\nPayment date: 06-10-2026\n'
              'Periode:\n01-09-2026 t/m 30-09-2026')
    assert r.invoice.invoiceDate=='2026-10-05'
    assert r.invoice.orderDate=='2026-10-01'
    assert r.invoice.serviceDate=='2026-10-02'
    assert r.invoice.deliveryDate=='2026-10-03'
    assert r.invoice.paymentDate=='2026-10-06'
    assert r.invoice.servicePeriodFrom=='2026-09-01'
    assert r.invoice.servicePeriodTo=='2026-09-30'


def test_conflicting_secondary_dates_remain_null_with_evidence():
    r=extract('Invoice date: 05-10-2026\nOrder date: 01-10-2026\nOrder date: 02-10-2026')
    assert r.invoice.invoiceDate=='2026-10-05'
    assert r.invoice.orderDate is None
    assert len(r.processing['fieldCandidates']['orderDate'])==2
    assert 'COMPETING_ORDER_DATE' in r.processing['anomalyCodes']


def test_reversed_service_period_requires_review():
    r=extract('Factuurdatum: 03-10-2026\nService period: 30-09-2026 to 01-09-2026')
    assert r.invoice.servicePeriodFrom is None
    assert r.invoice.servicePeriodTo is None
    assert 'INVALID_SERVICE_PERIOD' in r.processing['anomalyCodes']


def test_foreign_short_year_does_not_resolve_day_month_ambiguity():
    r=extract('Supplier country: United States\nInvoice date: 03/04/26\nDue date: 07-10-2026')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_foreign_secondary_date_ambiguity_is_also_reviewed():
    r=extract('Supplier country: United States\nInvoice date: 07-10-2026\nOrder date: 03/04/2026')
    assert r.invoice.orderDate is None
    assert 'AMBIGUOUS_ORDER_DATE' in r.processing['anomalyCodes']


def test_short_year_cannot_use_an_invoice_identifier_as_century_evidence():
    r=extract('Factuurdatum: 07-10-26\nFactuurnummer: 20261007')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


@pytest.mark.parametrize('identifier',['Invoice number: 2026-10-07','Order number: ORD-07-10-2026'])
def test_short_year_cannot_borrow_inline_identifier_year(identifier):
    r=extract('Invoice date: 07-10-26 | '+identifier)
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


@pytest.mark.parametrize('identifier',['Invoice number: 2026-10-07','Order number: ORD-07-10-2026'])
def test_short_year_cannot_borrow_inline_identifier_without_separator(identifier):
    r=extract('Invoice date: 07-10-26 '+identifier)
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_foreign_ambiguous_date_with_suffix_is_not_guessed():
    r=extract('Supplier country: United States\nInvoice date: 03/04/2026 (issued electronically)')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


@pytest.mark.parametrize('label',['Invoice number','Invoice number #','Factuurnummer #','Order number'])
def test_date_span_stops_at_existing_identifier_labels_without_colon(label):
    r=extract('Invoice date: 07-10-26 '+label+' 2025-09-01')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_following_metadata_cannot_supply_date_or_year_context():
    r=extract('Invoice date: 07-10-26\nDue date:\nInvoice number # 2026-11-01')
    assert r.invoice.invoiceDate is None
    assert r.invoice.dueDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


def test_unparseable_explicit_date_does_not_borrow_a_following_other_date():
    r=extract('Invoice date: unreadable\nOrder date: 01-10-2026')
    assert r.invoice.invoiceDate is None
    assert 'AMBIGUOUS_INVOICE_DATE' in r.processing['anomalyCodes']


@pytest.mark.parametrize('prose',[' (issued electronically)','\nInvoices are issued electronically','\nIssued by: Test Supplier BV'])
def test_issued_prose_is_not_a_competing_invoice_date(prose):
    r=extract('Invoice date: 07-10-2026'+prose)
    assert r.invoice.invoiceDate=='2026-10-07'
    assert 'AMBIGUOUS_INVOICE_DATE' not in r.processing['anomalyCodes']


def test_explicit_issued_date_label_remains_supported():
    assert extract('Issued: 07-10-2026').invoice.invoiceDate=='2026-10-07'


def test_issued_by_identifier_cannot_supply_a_short_year_context():
    r=extract('Invoice date: 07-10-26\nIssued by: Supplier ID 2026-10-07')
    assert r.invoice.invoiceDate is None
