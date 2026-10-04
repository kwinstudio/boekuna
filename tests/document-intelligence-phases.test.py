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

if __name__=='__main__':
    for name,f in list(globals().items()):
        if name.startswith('test_'): f();print(name, 'PASS')
