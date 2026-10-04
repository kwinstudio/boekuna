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


if __name__=='__main__':
    for name,f in list(globals().items()):
        if name.startswith('test_'): f();print(name, 'PASS')
