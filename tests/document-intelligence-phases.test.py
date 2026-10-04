"""Synthetic V4.1–V4.3 acceptance cases; no customer content."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'kwinest/docprocessor'))
import app as p


def document(tail, title='FACTUUR'):
    return dict(kind='pdf',pageCount=1,text=f'''{title}
Leverancier: Test Services BV
Aan: Eigen Studio
Factuurnummer: TEST-2026-42
Factuurdatum: 01-10-2026
Vervaldatum: 31-10-2026
{tail}''',tables=[],layout=[],ocrPages=[],warnings=[])


def extract(tail, title='FACTUUR'):
    return p.heuristic_extract(document(tail,title),'synthetic.pdf',{'name':'Eigen Studio','country':'NL'})


def test_foreign_rate_and_treatment_are_separate():
    r=extract('Subtotaal EUR 1350,00\nBTW 20% EUR 270,00\nTotaal EUR 1620,00')
    assert r.amounts.detectedVatRates == [20]
    assert r.amounts.accountingVatTreatment == 'review_required'
    assert p.money_cents(r.amounts.total)==162000
    assert r.processing['reviewRouting']['mode']=='FULL_REVIEW'


def test_deposit_and_balance_are_separate_values():
    r=extract('Subtotaal EUR 454,00\nBTW 21% EUR 95,34\nTotaal factuur EUR 549,34\nVoorschot EUR 300,00\nNog te betalen EUR 249,34')
    assert p.money_cents(r.amounts.advancePayment)==30000
    assert p.money_cents(r.amounts.outstandingAmount)==24934
    assert p.money_cents(r.amounts.invoiceTotal)==54934
    assert r.status!='paid'
    assert r.confidence['advancePayment']>=.7


def test_conflicting_balance_requires_review_without_changing_total():
    r=extract('Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00\nReeds betaald EUR 100,00\nRestant EUR 50,00')
    assert p.money_cents(r.amounts.total)==12100
    assert 'PAYMENT_BALANCE_MISMATCH' in r.processing['anomalyCodes']
    assert r.processing['reviewRouting']['mode']=='FULL_REVIEW'


def test_foreign_country_even_with_dutch_rate_requires_treatment_review():
    r=extract('VAT number: BE0123456789\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    assert r.amounts.accountingVatTreatment=='review_required'


def test_all_requested_confidence_fields_exist():
    r=extract('Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    fields=['documentType','supplierName','supplierVatNumber','supplierIban','invoiceNumber','invoiceDate','dueDate','currency','subtotal','vatTotal','total','vatRates','vatLines','advancePayment','outstandingAmount','paymentReference']
    assert all(k in r.confidence for k in fields)
    assert all(0<=r.confidence[k]<=1 for k in fields)

def test_credit_note_keeps_signed_amounts():
    r=extract('Subtotaal EUR -100,00\nBTW 21% EUR -21,00\nTotaal EUR -121,00','CREDITNOTA')
    assert r.documentType=='credit_invoice'
    assert p.money_cents(r.amounts.total)==-12100
    assert p.money_cents(r.amounts.vatTotal)==-2100


def test_quote_is_classified_and_not_bookable():
    r=extract('Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00','OFFERTE')
    assert r.documentType=='other'
    assert r.processing['documentClassification']=='quote'
    assert r.processing['bookingAllowed'] is False


def test_header_table_rows_are_extracted_and_checked():
    doc=document('Subtotaal EUR 190,00\nBTW 21% EUR 39,90\nTotaal EUR 229,90')
    doc['tables']=[{'page':1,'rows':[['Omschrijving','Aantal','Prijs','BTW %','Netto','Btw-bedrag','Incl. btw'],['Consulting','2','100,00','21%','200,00','42,00','242,00'],['Korting','1','-10,00','21%','-10,00','-2,10','-12,10']]}]
    r=p.heuristic_extract(doc,'table.pdf',{})
    assert len(r.lineItems)==2
    assert p.money_cents(r.lineItems[1].netAmount)==-1000
    assert 'LINE_NET_MISMATCH' not in r.processing['anomalyCodes']


def test_line_arithmetic_mismatch_is_anomaly():
    doc=document('Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    doc['tables']=[{'page':1,'rows':[['Omschrijving','Aantal','Prijs','Netto'],['Service','2','60,00','100,00']]}]
    r=p.heuristic_extract(doc,'table.pdf',{})
    assert 'LINE_ARITHMETIC_MISMATCH' in r.processing['anomalyCodes']


def test_duplicate_requires_same_supplier_and_currency():
    from document_intelligence import duplicate_candidates
    r=extract('Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    row={'id':'a','supplier':'Other Supplier','invoiceNumber':r.invoice.invoiceNumber,'invoiceDate':r.invoice.invoiceDate,'total':121,'currency':'EUR'}
    assert duplicate_candidates(r,[row],'hash')==[]
    row['supplier']=r.supplier.name
    assert duplicate_candidates(r,[row],'hash')[0]['status']=='PROBABLE'
    row['currency']='USD'
    assert duplicate_candidates(r,[row],'hash')==[]


def test_invoice_title_outweighs_supplier_quote_word():
    doc=document('Order confirmation: ORD-42\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    doc['text']=doc['text'].replace('Test Services BV','Quote Studio')
    r=p.heuristic_extract(doc,'invoice.pdf',{})
    assert r.processing['bookingAllowed'] is True
    assert r.processing['documentClassification']=='invoice'


def test_decimal_quantities_and_rates_are_not_money_tokens():
    from document_intelligence import extract_line_items
    doc={'tables':[{'rows':[['Omschrijving','Aantal','Prijs','BTW %','Netto'],['Consulting','1,5','100,00','5,5%','150,00']]}]}
    items,_=extract_line_items(doc,p.norm_money)
    assert items[0]['quantity']==1.5
    assert items[0]['vatRate']==5.5


def test_discount_percent_header_controls_arithmetic():
    from document_intelligence import extract_line_items
    items,_=extract_line_items({'tables':[{'rows':[['Omschrijving','Aantal','Prijs','Korting %'],['Service','1','200,00','10']]}]},p.norm_money)
    assert items[0]['discountPercent']==10
    assert items[0]['netAmount']==180


def test_nonfinancial_heading_is_not_overridden_by_invoice_reference():
    for title,reference in [('OFFERTE','Invoice number: Q-1'),('ORDER CONFIRMATION','Invoice reference: INV-42'),('PAKBON','Factuur: INV-42')]:
        r=extract(reference+'\nSubtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00',title)
        assert r.documentType=='other'
        assert r.processing['bookingAllowed'] is False


def test_line_vat_mismatch_requires_full_review():
    doc=document('Subtotaal EUR 100,00\nBTW 21% EUR 21,00\nTotaal EUR 121,00')
    doc['tables']=[{'rows':[['Omschrijving','Aantal','Prijs','BTW %','Netto','Btw-bedrag','Incl. btw'],['Service','1','100,00','9%','100,00','21,00','121,00']]}]
    r=p.heuristic_extract(doc,'table.pdf',{})
    assert 'LINE_VAT_MISMATCH' in r.processing['anomalyCodes']
    assert r.processing['reviewRouting']['mode']=='FULL_REVIEW'


def test_unit_price_preserves_subcent_precision():
    from document_intelligence import extract_line_items
    items,_=extract_line_items({'tables':[{'rows':[['Omschrijving','Aantal','Prijs','Netto'],['Energy','1000','0,125','125,00']]}]},p.norm_money)
    assert items[0]['unitPrice']==.125
    assert items[0]['netAmount']==125


def test_ex_btw_labels_and_us_currency_grouping_are_preserved():
    r=extract('Bedrag ex btw EUR 123,40\nBTW 21% EUR 25,91\nFactuurbedrag EUR 149,31')
    assert p.money_cents(r.amounts.subtotal)==12340
    assert p.money_cents(r.amounts.vatTotal)==2591
    assert p.money_tokens('USD 2,750.00')==[2750]
    assert p.money_tokens('EUR 2.750,00')==[2750]


def test_explicit_printed_vat_triplet_disambiguates_totals():
    r=extract('Totalen EUR 149,31\nBTW - 21% EUR 123,40 EUR 25,91 EUR 149,31\nTotaal te betalen EUR 149,31')
    assert p.money_cents(r.amounts.subtotal)==12340
    assert p.money_cents(r.amounts.vatTotal)==2591
    assert r.processing['financialEvidenceSource']=='explicit-vat-summary-and-gross'


def test_generic_foreign_vat_groups_remain_documentary():
    r=extract('BTW 5% taxable EUR 100,00 EUR 5,00\nBTW 20% taxable EUR 100,00 EUR 20,00\nTotaal EUR 225,00')
    assert r.amounts.detectedVatRates==[5,20]
    assert [v.rate for v in r.amounts.vatLines]==[5,20]
    assert r.amounts.accountingVatTreatment=='review_required'
    assert p.money_cents(r.amounts.vatTotal)==2500


def test_native_onnx_telemetry_is_disabled_before_import():
    import os
    source=(Path(__file__).resolve().parents[1]/'kwinest/docprocessor/app.py').read_text()
    assert os.environ.get('ORT_DISABLE_TELEMETRY')=='1'
    assert source.index('os.environ["ORT_DISABLE_TELEMETRY"] = "1"')<source.index('import fitz')
    assert source.index('ort.disable_telemetry_events()')<source.index('from rapidocr import')


def test_mixed_vat_summary_sum_is_a_candidate_not_a_fabricated_breakdown():
    r=extract('BTW 9% EUR 9,00\nBTW 21% EUR 21,00\nTotaal EUR 230,00')
    assert p.money_cents(r.amounts.vatTotal)==3000
    assert p.money_cents(r.amounts.subtotal)==20000
    assert len(r.amounts.vatLines)==0
    assert r.processing['reviewRouting']['mode']=='FULL_REVIEW'


def test_discount_percentage_is_not_a_foreign_vat_rate():
    r=extract('Subtotaal EUR 100,00\nBTW 21% EUR 21,00 (korting 5%)\nTotaal EUR 121,00')
    assert r.amounts.detectedVatRates==[21]
    assert r.amounts.accountingVatTreatment=='standard'


def test_factoring_fee_percentage_does_not_change_vat_treatment():
    r=extract('Bedrag ex btw EUR 100,00\nBTW 21% EUR 21,00\nFactuurbedrag EUR 121,00\nFactoring 4.8% EUR 121,00 Bedrag ex btw EUR -4,80\nBTW 21% EUR -1,01\nFactuurbedrag EUR -5,81\nEindbedrag EUR 115,19')
    assert r.amounts.detectedVatRates==[21]
    assert r.amounts.accountingVatTreatment=='standard'
    assert r.confidence['vatLines']>=.95


def test_explicit_contradictory_subtotal_is_preserved():
    r=extract('Subtotaal EUR 300,00\nBTW 21% grondslag EUR 100,00 BTW EUR 21,00 totaal EUR 121,00\nTotaal EUR 121,00')
    assert p.money_cents(r.amounts.subtotal)==30000
    assert 'PRINTED_SUBTOTAL_CONFLICT' in r.processing['anomalyCodes']
    assert r.processing['reviewRouting']['mode']=='FULL_REVIEW'


def test_explicit_contradictory_vat_total_is_preserved():
    r=extract('BTW totaal EUR 30,00\nBTW 21% grondslag EUR 100,00 BTW EUR 21,00 totaal EUR 121,00\nTotaal EUR 121,00')
    assert p.money_cents(r.amounts.vatTotal)==3000
    assert 'PRINTED_VAT_TOTAL_CONFLICT' in r.processing['anomalyCodes']
    assert r.processing['reviewRouting']['mode']=='FULL_REVIEW'


def test_all_parser_total_labels_preserve_printed_conflicts():
    for label in p.NET_TOTAL_LABELS+p.VAT_TOTAL_LABELS:
        net=label in p.NET_TOTAL_LABELS
        r=extract(f'{label} EUR {"300,00" if net else "30,00"}\nBTW 21% grondslag EUR 100,00 BTW EUR 21,00 totaal EUR 121,00\nTotaal EUR 121,00')
        assert p.money_cents(r.amounts.subtotal if net else r.amounts.vatTotal)==(30000 if net else 3000),label
        assert r.processing['reviewRouting']['mode']=='FULL_REVIEW',label


if __name__=='__main__':
    for name,f in list(globals().items()):
        if name.startswith('test_'): f();print(name, 'PASS')
