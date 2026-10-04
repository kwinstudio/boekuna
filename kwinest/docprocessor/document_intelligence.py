"""Explainable, document-local intelligence. No network, global memory or AI."""
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def cents(value):
    try:
        n=Decimal(str(value))
        return int((n*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP)) if n.is_finite() else None
    except (InvalidOperation,ValueError,TypeError): return None


def review_route(result):
    party='customerName' if result.documentType=='sales_invoice' else 'supplierName'
    critical=['documentType',party,'invoiceDate','subtotal','vatTotal','total','vatRates']
    if result.documentType!='receipt': critical.append('invoiceNumber')
    uncertain=[k for k in critical if result.confidence.get(k,0)<.9]
    blocked=bool(result.processing.get('anomalyCodes') or result.amounts.accountingVatTreatment=='review_required' or result.documentType in {'other','bank_document'})
    # Supplier history is required before any auto-accept candidacy.
    mode='FULL_REVIEW' if blocked or len(uncertain)>3 else 'QUICK_REVIEW'
    return {'mode':mode,'fields':uncertain,'count':len(uncertain),'autoBook':False}


def annotate_understanding(result,doc,company,money_tokens):
    a=result.amounts
    lines=[x.strip() for x in (doc.get('text') or '').splitlines() if x.strip()]
    rates=set()
    for line in lines:
        if re.search(r'\b(?:btw|vat|tax|mwst|tva|iva)\b',line,re.I):
            for token in re.findall(r'(?<![\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s*%',line):
                rate=float(token.replace(',','.'))
                if 0<=rate<=100: rates.add(rate)
    rates.update(v.rate for v in a.vatLines)
    a.detectedVatRates=sorted(rates)
    # Preserve the printed VAT rate independently from accounting treatment.
    country=result.supplier.country or ''
    own_countries={'NL','NEDERLAND','NETHERLANDS','THE NETHERLANDS'}
    foreign_country=bool(country and country.upper() not in own_countries)
    vat=result.supplier.vatNumber or ''
    explicit_foreign_id=bool(vat and not vat.upper().startswith('NL'))
    # A lone labelled tax ID outside party blocks remains review evidence, not a
    # supplier identity assignment (it can be the customer's ID).
    foreign_context=bool(re.search(r'\b(?:VAT\s*(?:number|id)|BTW[- ]?(?:nummer|id))\s*:?\s*(?!NL)([A-Z]{2})\d', '\n'.join(lines),re.I))
    a.accountingVatTreatment='review_required' if foreign_country or explicit_foreign_id or foreign_context or any(r not in {0,9,21} for r in rates) else 'standard'
    currencies=set(re.findall(r'\b(?:EUR|USD|GBP|CHF|CAD|AUD|JPY|SEK|NOK|DKK|PLN)\b','\n'.join(lines)))
    if len(currencies)==1: a.currency=next(iter(currencies))
    elif not currencies and '€' in '\n'.join(lines): currencies={'EUR'}
    if a.currency!='EUR': a.accountingVatTreatment='review_required'
    values={}
    labels={
        'advancePayment':r'^(?:voorschot|aanbetaling|deposit|advance(?: payment)?)\b',
        'alreadyPaid':r'^(?:reeds betaald|already paid|paid(?: amount)?|betaald)\b',
        'outstandingAmount':r'^(?:nog te betalen|restant|resterend(?: bedrag)?|remaining(?: balance)?|outstanding(?: amount)?|balance(?: due)?|saldo)\b',
        'amountDue':r'^(?:amount due|te betalen)\b',
    }
    conflicts=[]
    for key,pattern in labels.items():
        candidates=[]
        for i,line in enumerate(lines):
            if re.search(pattern,line,re.I):
                amounts=money_tokens(line)
                if not amounts and i+1<len(lines): amounts=money_tokens(lines[i+1])
                if amounts: candidates.append(amounts[-1])
        distinct={cents(v) for v in candidates}
        if len(distinct)==1:
            values[key]=candidates[0];setattr(a,key,candidates[0]);result.confidence[key]=.95 if not doc.get('ocrPages') else .80
        elif distinct:
            conflicts.append('COMPETING_PAYMENT_AMOUNTS');result.confidence[key]=.35
    a.invoiceTotal=a.total
    total=cents(a.total)
    advance=cents(a.advancePayment);paid=cents(a.alreadyPaid)
    outstanding=cents(a.outstandingAmount if a.outstandingAmount is not None else a.amountDue)
    # Advance and alreadyPaid can describe the SAME payment; never sum both.
    if advance is not None and paid is not None and advance!=paid: conflicts.append('AMBIGUOUS_PAYMENT_COMPONENTS')
    component=paid if paid is not None else advance
    if total is not None and outstanding is not None:
        if outstanding>total or outstanding<0: conflicts.append('IMPOSSIBLE_OUTSTANDING')
        if component is not None and abs(component+outstanding-total)>1: conflicts.append('PAYMENT_BALANCE_MISMATCH')
        if outstanding>0 and result.status=='paid': result.status='open';result.confidence['paymentStatus']=.5
    if total is not None and component is not None and (component<0 or component>total): conflicts.append('IMPOSSIBLE_PAYMENT')
    if len(currencies)>1: conflicts.append('CURRENCY_CONFLICT')
    for key in ['supplierVatNumber','supplierIban','currency','vatRates','advancePayment','outstandingAmount','paymentReference','alreadyPaid','amountDue']:
        if key not in result.confidence:
            value={'supplierVatNumber':result.supplier.vatNumber,'supplierIban':result.supplier.iban,'currency':bool(currencies),'vatRates':bool(rates),'paymentReference':result.invoice.paymentReference}.get(key)
            result.confidence[key]=.9 if value else .1
    result.processing={**result.processing,'intelligenceVersion':'4.1','anomalyCodes':sorted(set(conflicts))}
    result.processing['reviewRouting']=review_route(result)
    return result
