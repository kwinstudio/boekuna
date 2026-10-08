"""Explainable, document-local intelligence. No network, global memory or AI."""
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


NET_TOTAL_LABELS=["totaal excl. btw","totaal exclusief btw","bedrag ex btw","bedrag excl. btw","bedrag exclusief btw","total excl. vat","tax exclusive","net amount","netto bedrag","subtotaal","subtotal"]
VAT_TOTAL_LABELS=["totaal btw","btw totaal","vat total","tax amount","btw-bedrag","btw bedrag"]


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


def explicit_summary_groups(lines,money_tokens):
    groups={}
    for line in lines:
        rm=re.match(r'^(?:btw|vat|tax|tva|mwst)\s*[-:]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%',line,re.I)
        if not rm:continue
        rate=decimal_number(rm.group(1))
        values=money_tokens(line[rm.end():])
        # Require a stated base or a complete base/tax/gross triplet.
        if len(values) not in {2,3} or len(values)==2 and not re.search(r'grondslag|taxable|tax base|base amount',line,re.I):continue
        base,tax=values[:2]
        if abs(cents(Decimal(str(base))*Decimal(str(rate))/100)-cents(tax))>1:continue
        if len(values)==3 and cents(base)+cents(tax)!=cents(values[2]):continue
        candidate={'rate':rate,'taxableAmount':base,'vatAmount':tax}
        if rate in groups and groups[rate]!=candidate:return []
        groups[rate]=candidate
    return list(groups.values())


def annotate_understanding(result,doc,company,money_tokens):
    a=result.amounts
    lines=[x.strip() for x in (doc.get('text') or '').splitlines() if x.strip()]
    conflicts=list(result.processing.get('metadataAnomalyCodes') or [])
    rates=set()
    for line in lines:
        if re.search(r'\b(?:btw|vat|tax|mwst|tva|iva)\b',line,re.I):
            tokens=re.findall(r'(?:btw|vat|tax|mwst|tva|iva)(?:\s*(?:tarief|rate))?\s*[-:(]?\s*(\d{1,2}(?:[.,]\d{1,3})?)\s*%',line,re.I)
            tokens+=re.findall(r'(?<![\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s*%\s*(?:btw|vat|tax|mwst|tva|iva)\b',line,re.I)
            if re.match(r'^(?:btw|vat|tax)\s*(?:tarieven|rates)\b',line,re.I):tokens+=re.findall(r'(?<![\d.,])(\d{1,2}(?:[.,]\d{1,3})?)\s*%',line)
            for token in tokens:
                rate=float(token.replace(',','.'))
                if 0<=rate<=100: rates.add(rate)
    groups=explicit_summary_groups(lines,money_tokens)
    if groups and a.total is not None and sum(cents(g['taxableAmount'])+cents(g['vatAmount']) for g in groups)==cents(a.total):
        # Explicit printed triplets plus the document gross anchor disambiguate
        # malformed reading-order totals; never use a remembered financial value.
        summary_net=sum(cents(g['taxableAmount']) for g in groups)
        summary_vat=sum(cents(g['vatAmount']) for g in groups)
        explicit={}
        for key,labels in {'subtotal':NET_TOTAL_LABELS,'vatTotal':VAT_TOTAL_LABELS}.items():
            pattern=r'^(?:'+ '|'.join(re.escape(label).replace(r'\.',r'\.?') for label in labels)+r')\b'
            candidates=[]
            for i,line in enumerate(lines):
                match=re.match(pattern,line,re.I)
                if not match:continue
                values=money_tokens(line[match.end():])
                if not values and i+1<len(lines):values=money_tokens(lines[i+1])
                if len(values)==1:candidates.append(cents(values[0]))
            if candidates:explicit[key]=sorted(set(candidates))
        for key,summary,code in [('subtotal',summary_net,'PRINTED_SUBTOTAL_CONFLICT'),('vatTotal',summary_vat,'PRINTED_VAT_TOTAL_CONFLICT')]:
            printed=explicit.get(key,[])
            if printed and printed!=[summary]:
                conflicts.append(code)
                # Keep explicit documentary evidence; never silently reconcile a
                # contradiction by selecting the mathematically nicer group.
                if len(printed)==1:setattr(a,key,printed[0]/100)
                result.confidence[key]=.35
            else:
                setattr(a,key,summary/100)
                result.confidence[key]=.95
        if conflicts:
            result.processing['financialCandidates']={'printedTotals':explicit,'vatSummaryTotals':{'subtotal':summary_net,'vatTotal':summary_vat},'unit':'cents'}
        vat_model=type(a).model_fields['vatLines'].annotation.__args__[0]
        a.vatLines=[vat_model(**g) for g in groups]
        result.confidence['vatLines']=.95
        result.processing['financialEvidenceSource']='explicit-vat-summary-and-gross'
    if len(rates)==1 and next(iter(rates)) not in {0,9,21} and a.subtotal is not None and a.vatTotal is not None:
        rate=next(iter(rates))
        if abs(cents(Decimal(str(a.subtotal))*Decimal(str(rate))/100)-cents(a.vatTotal))<=1:
            vat_model=type(a).model_fields['vatLines'].annotation.__args__[0]
            a.vatLines=[vat_model(rate=rate,taxableAmount=a.subtotal,vatAmount=a.vatTotal)]
    if len(rates)>1 and not any(re.match(r'^(?:btw totaal|totaal btw|vat total|total vat|tax amount)\b',line,re.I) for line in lines):
        taxes={}
        for line in lines:
            m=re.match(r'^(?:btw|vat|tax)\s*[-:]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%',line,re.I)
            if not m:continue
            values=money_tokens(line[m.end():])
            if len(values)==1:
                rate=decimal_number(m.group(1));taxes.setdefault(rate,set()).add(cents(values[0]))
        if set(taxes)==rates and all(len(values)==1 for values in taxes.values()):
            tax_sum=sum(next(iter(values)) for values in taxes.values())
            explicit_net=any(re.match(r'^(?:subtotaal|subtotal|net amount|bedrag ex|totaal ex)\b',line,re.I) for line in lines)
            reconciles=a.total is not None and (not explicit_net or a.subtotal is not None and cents(a.subtotal)+tax_sum==cents(a.total))
            if reconciles:
                a.vatTotal=tax_sum/100
                result.confidence['vatTotal']=.95
                if (a.subtotal is None or not explicit_net) and a.total is not None:
                    a.subtotal=(cents(a.total)-cents(a.vatTotal))/100
                    result.confidence['subtotal']=.75
                result.processing['financialEvidenceSource']='printed-vat-summary-sum'
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
    foreign_context=bool(re.search(r'\b(?:VAT\s*(?:number|id)|BTW[- ]?(?:nummer|id))\s*:?\s*(?!NL)([A-Z]{2})U?\d', '\n'.join(lines),re.I))
    a.accountingVatTreatment='review_required' if foreign_country or explicit_foreign_id or foreign_context or any(r not in {0,9,21} for r in rates) else 'standard'
    # An explicit reverse-charge statement on a zero/absent-VAT document must be
    # self-assessed; conditional boilerplate ("kan ... verlegd worden") is not evidence.
    reverse_charge=any(re.search(r'\b(?:btw|vat|omzetbelasting)\b[\s:.\-]*(?:0\s*%\s*)?(?:is\s+)?verlegd\b|\bverlegde\s+(?:btw|omzetbelasting)\b|\breverse[- ]charged?\b|\bautoliquidation\b|steuerschuldnerschaft',line,re.I)
                       and not re.search(r'\b(?:kan|kunnen|indien|wanneer|tenzij|if|may|where applicable|in case|unless)\b',line,re.I) for line in lines)
    # Own sales invoices keep their existing booking path (the app has a reverse-charge
    # sales treatment); only incoming documents need the self-assessment review.
    incoming=result.documentType!='sales_invoice' and not result.selfBilling
    if reverse_charge and incoming and not (a.vatTotal or 0):
        a.accountingVatTreatment='review_required'
        result.processing['reverseChargeCandidate']=True
    currencies=set(re.findall(r'\b(?:EUR|USD|GBP|CHF|CAD|AUD|JPY|SEK|NOK|DKK|PLN)\b','\n'.join(lines)))
    if len(currencies)==1: a.currency=next(iter(currencies))
    elif not currencies and '€' in '\n'.join(lines): currencies={'EUR'}
    if a.currency!='EUR': a.accountingVatTreatment='review_required'
    values={}
    labels={
        'advancePayment':r'^(?:voorschot|aanbetaling|deposit|advance(?: payment)?)\b',
        'alreadyPaid':r'^(?:reeds betaald|already paid|paid(?: amount)?|betaald)\b',
        'outstandingAmount':r'^(?:nog te betalen|openstaand(?: bedrag)?|restant|resterend(?: bedrag)?|remaining(?: balance)?|outstanding(?: amount)?|balance(?: due)?|saldo)\b',
        'amountDue':r'^(?:amount due|te betalen)\b',
    }
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


NON_FINANCIAL=[
    ('RMA',r'\b(?:rma|retour[- ]?order|retouraanvraag|return[- ]?order|return authorization)\b'),
    ('proforma',r'\bpro\s*forma\b'),('quote',r'\b(?:offerte|quotation|quote)\b'),
    ('order_confirmation',r'\b(?:orderbevestiging|order confirmation)\b'),
    ('payment_confirmation',r'\b(?:betaalbevestiging|payment confirmation)\b'),
    ('delivery_note',r'\b(?:pakbon|delivery note|leveringsbon)\b'),
    ('statement',r'\b(?:rekeningoverzicht|account statement|bank statement)\b'),
]


def classify(result,doc):
    # Titles carry meaning; legal footer references to quotes/RMA do not.
    header='\n'.join([l.strip() for l in (doc.get('text') or '').splitlines() if l.strip()][:8])
    invoice_title=bool(re.search(r'^\s*(?:factuur|invoice|creditnota|credit note|creditfactuur|credit invoice)(?:\s*\((?:betaalbevestiging|payment confirmation)\))?\s*$',header,re.I|re.M))
    for kind,pattern in NON_FINANCIAL:
        if re.search(pattern,header,re.I):
            if kind=='proforma' and not re.search(r'^\s*pro\s*forma\b',header,re.I|re.M):continue
            if invoice_title and kind!='proforma':continue
            return kind,False
    if re.search(r'\b(?:creditnota|credit note|creditfactuur|credit invoice|storno|correction invoice|cancellation invoice)\b',header,re.I): return 'credit_note',True
    if result.documentType=='other': return 'unknown',False
    if result.documentType=='bank_document': return 'statement',False
    if result.selfBilling: return 'self_billing_invoice',True
    return ('receipt' if result.documentType=='receipt' else 'invoice'),True


HEADER_PATTERNS={
    'description':r'^(?:omschrijving|beschrijving|description|product|artikel|dienst)',
    'quantity':r'^(?:aantal|quantity|qty|uren|hours)$',
    'unitPrice':r'^(?:prijs|tarief|unit price|stukprijs|price|rate)$',
    'unit':r'^(?:eenheid|unit)$',
    'discount':r'^(?:korting|discount)(?:\s*%)?$',
    'vatRate':r'^(?:btw|vat|tax)(?:\s*(?:%|rate|tarief))?$',
    'netAmount':r'^(?:netto|net(?: amount)?|excl(?:\.? btw)?|bedrag excl\.? btw|line net)$',
    'vatAmount':r'^(?:btw-bedrag|vat amount|tax amount)$',
    'grossAmount':r'^(?:incl\.? btw|gross(?: amount)?|line gross)$',
}


def coordinate_tables(doc):
    """Conservative word-row/column grouping; only explicit recognizable headers."""
    tables=[]
    for page in (doc.get('layout') or [])[:50]:
        words=[w for w in page.get('words',[]) if all(k in w for k in ['x0','x1','y0','y1','text'])]
        rows=[]
        for w in sorted(words,key=lambda w:(w['y0'],w['x0'])):
            center=(w['y0']+w['y1'])/2
            row=next((r for r in reversed(rows[-3:]) if abs(r['y']-center)<=max(3,(w['y1']-w['y0'])*.4)),None)
            if row is None: row={'y':center,'words':[]};rows.append(row)
            row['words'].append(w)
        anchors=None;out=[]
        for row in rows:
            ordered=sorted(row['words'],key=lambda w:w['x0'])
            headers=[(w['x0'],w['text']) for w in ordered if any(re.search(p,str(w['text']).lower()) for p in HEADER_PATTERNS.values())]
            if len(headers)>=3 and any(re.search(HEADER_PATTERNS['description'],h[1],re.I) for h in headers):
                anchors=headers;out=[[h[1] for h in anchors]];continue
            if not anchors: continue
            if re.search(r'^(?:subtotaal|subtotal|totaal|total|btw|vat)\b',ordered[0]['text'],re.I): break
            cells=['']*len(anchors)
            for w in ordered:
                index=min(range(len(anchors)),key=lambda i:abs(w['x0']-anchors[i][0]))
                cells[index]=(cells[index]+' '+w['text']).strip()
            out.append(cells)
        if len(out)>1:tables.append({'page':page.get('page'),'rows':out,'source':'coordinates'})
    return tables


def decimal_number(value):
    """Counts/percentages use decimal notation, not money's two-cent convention."""
    raw=re.sub(r'^(?:EUR|USD|GBP|CHF|€)\s*','',str(value).strip(),flags=re.I).replace('%','').replace(' ','')
    if ',' in raw and '.' in raw:
        raw=raw.replace('.','').replace(',','.') if raw.rfind(',')>raw.rfind('.') else raw.replace(',','')
    else:raw=raw.replace(',','.')
    try:
        number=Decimal(raw)
        return float(number) if number.is_finite() else None
    except (InvalidOperation,ValueError):return None


def extract_line_items(doc,norm_money):
    items=[];coverage=True
    tables=doc.get('tables') or coordinate_tables(doc)
    for table in tables[:30]:
        mapping=None
        for row in (table.get('rows') or table.get('table') or [])[:500]:
            clean=[str(x or '').strip() for x in row]
            found={key:i for i,cell in enumerate(clean) for key,pattern in HEADER_PATTERNS.items() if re.search(pattern,cell,re.I)}
            if 'discount' in found and '%' in clean[found['discount']]:found['discountPercent']=found.pop('discount')
            if 'description' in found and ('netAmount' in found or ('quantity' in found and 'unitPrice' in found)):
                mapping=found;continue
            if not mapping:continue
            desc=clean[mapping['description']] if mapping['description']<len(clean) else ''
            if not desc:continue
            if re.search(r'^(?:subtotaal|subtotal|totaal|total|btw|vat|netto|bedrag excl)',desc,re.I):break
            item={'description':desc[:500],'source':'explicit-table'}
            for key,index in mapping.items():
                if key=='description':continue
                cell=clean[index] if index<len(clean) else ''
                if key=='unit':item[key]=cell[:30];continue
                # A merged VAT cell such as "9% 75,00" holds the rate and the line amount; read only the rate.
                rate=re.search(r'(-?\d+(?:[.,]\d+)?)\s*%',cell) if key in {'vatRate','discountPercent'} else None
                item[key]=(decimal_number(rate.group(1)) if rate else decimal_number(cell) if key in {'quantity','unitPrice','vatRate','discountPercent'} or '%' in cell else norm_money(cell)) if cell else None
                if key=='discount' and '%' in cell:item['discountPercent']=item.pop('discount')
            if item.get('netAmount') is None:
                # Row arithmetic is only a candidate with declared quantity/price.
                if item.get('quantity') is None or item.get('unitPrice') is None:coverage=False;continue
                net=Decimal(str(item['quantity']))*Decimal(str(item['unitPrice']))
                if item.get('discountPercent') is not None:net*=1-Decimal(str(item['discountPercent']))/100
                if item.get('discount') is not None:net-=Decimal(str(item['discount']))
                item['netAmount']=float(net.quantize(Decimal('.01'),rounding=ROUND_HALF_UP));item['source']='table-calculated'
            item['lineTotal']=item.get('grossAmount') if item.get('grossAmount') is not None else item['netAmount']
            items.append(item)
    return items,coverage


def annotate_safety(result,doc,norm_money):
    a=result.amounts;anomalies=list(result.processing.get('anomalyCodes') or [])
    kind,bookable=classify(result,doc)
    if not bookable:result.documentType='other';anomalies.append('NON_BOOKABLE_DOCUMENT')
    if kind=='credit_note':
        result.documentType='credit_invoice';result.status='credit'
        # Preserve printed sign separately when a positive-valued credit needs an
        # explicit accounting reversal. Already negative values stay negative.
        result.processing['creditPrintedAmounts']={k:getattr(a,k) for k in ['subtotal','vatTotal','total']}
        negative_printed=any(re.search(r'^(?:subtotaal|subtotal|netto|totaal|total|btw|vat)\b',line.strip(),re.I) and re.search(r'(?:EUR|€)?\s*-\s*(?:EUR|€)?\s*\d+[.,]\d{2}',line,re.I) for line in (doc.get('text') or '').splitlines())
        result.processing['creditAccountingAmounts']={k:-abs(getattr(a,k)) if getattr(a,k) is not None else None for k in ['subtotal','vatTotal','total']}
        for field in ['subtotal','vatTotal','total']:
            value=getattr(a,field)
            if value is not None and negative_printed:setattr(a,field,-abs(value))
        a.invoiceTotal=a.total
        for line in a.vatLines:
            if line.taxableAmount is not None and negative_printed:line.taxableAmount=-abs(line.taxableAmount)
            if line.vatAmount is not None and negative_printed:line.vatAmount=-abs(line.vatAmount)
        result.processing['creditSignSource']='document-title'
    items,complete=extract_line_items(doc,norm_money)
    for item in items:
        q=item.get('quantity');price=item.get('unitPrice');net=item.get('netAmount')
        if q is not None and price is not None and net is not None:
            expected=Decimal(str(q))*Decimal(str(price))
            if item.get('discountPercent') is not None:expected*=1-Decimal(str(item['discountPercent']))/100
            if item.get('discount') is not None:expected-=Decimal(str(item['discount']))
            if abs(cents(expected)-cents(net))>1:anomalies.append('LINE_ARITHMETIC_MISMATCH')
        if net is not None and item.get('vatAmount') is not None and item.get('vatRate') is not None and abs(cents(Decimal(str(net))*Decimal(str(item['vatRate']))/100)-cents(item['vatAmount']))>1:anomalies.append('LINE_VAT_MISMATCH')
        if net is not None and item.get('vatAmount') is not None and item.get('grossAmount') is not None and cents(net)+cents(item['vatAmount'])!=cents(item['grossAmount']):anomalies.append('LINE_GROSS_MISMATCH')
    if items:result.lineItems=[type(result).model_fields['lineItems'].annotation.__args__[0](**item) for item in items]
    if items and complete:
        net_sum=sum(cents(i.get('netAmount')) or 0 for i in items)
        if a.subtotal is not None and net_sum!=cents(a.subtotal):anomalies.append('LINE_NET_MISMATCH')
        if all(i.get('grossAmount') is not None for i in items) and a.total is not None and sum(cents(i['grossAmount']) for i in items)!=cents(a.total):anomalies.append('LINE_TOTAL_MISMATCH')
    if all(v is not None for v in [a.subtotal,a.vatTotal,a.total]) and cents(a.subtotal)+cents(a.vatTotal)!=cents(a.total):anomalies.append('TOTAL_ARITHMETIC_MISMATCH')
    if len(a.detectedVatRates)>1 and set(v.rate for v in a.vatLines)!=set(a.detectedVatRates):
        anomalies.append('INCOMPLETE_VAT_GROUPS');result.confidence['vatLines']=min(result.confidence.get('vatLines',.2),.35)
    if a.vatLines and a.vatTotal is not None and sum(cents(v.vatAmount) or 0 for v in a.vatLines)!=cents(a.vatTotal):anomalies.append('VAT_GROUP_MISMATCH')
    for v in a.vatLines:
        if v.taxableAmount is not None and v.vatAmount is not None and abs(cents(Decimal(str(v.taxableAmount))*Decimal(str(v.rate))/100)-cents(v.vatAmount))>1:anomalies.append('VAT_MATH_MISMATCH')
    if result.invoice.dueDate and result.invoice.invoiceDate and result.invoice.dueDate<result.invoice.invoiceDate:anomalies.append('DUE_DATE_BEFORE_INVOICE')
    if result.invoice.invoiceNumber and re.fullmatch(r'20\d{2}',result.invoice.invoiceNumber):anomalies.append('INVOICE_NUMBER_YEAR_ONLY')
    if kind!='credit_note' and any(v is not None and v<0 for v in [a.subtotal,a.vatTotal,a.total]):anomalies.append('UNEXPECTED_NEGATIVE_AMOUNT')
    reference=re.search(r'(?:oorspronkelijke factuur|original invoice|reference invoice|referenced invoice|factuurreferentie)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{1,50})',doc.get('text') or '',re.I)
    if reference:result.invoice.referencedInvoiceNumber=reference.group(1)
    result.processing={**result.processing,'intelligenceVersion':'4.2','documentClassification':kind,'bookingAllowed':bookable,'anomalyCodes':sorted(set(anomalies)),'lineItemsComplete':bool(items and complete)}
    result.processing['reviewRouting']=review_route(result)
    return result


def duplicate_candidates(result,existing,sha256):
    def norm(v):return re.sub(r'[^\w]','',str(v or '').lower())
    party=result.customer.name if result.documentType=='sales_invoice' else result.supplier.name
    candidates=[]
    for row in existing if isinstance(existing,list) else []:
        if not isinstance(row,dict):continue
        if sha256 and row.get('sha256')==sha256:
            candidates.append({'id':row.get('id'),'status':'EXACT','score':1.,'reasons':['bestandshash']});continue
        if not party or norm(party)!=norm(row.get('supplier') or row.get('party')):continue
        currency=row.get('currency')
        if currency and str(currency).upper()!=result.amounts.currency:continue
        number=norm(result.invoice.invoiceNumber)
        if not number or number!=norm(row.get('invoiceNumber') or row.get('number')):continue
        amount=cents(row.get('total'));total=cents(result.amounts.total)
        same_amount=amount is not None and total is not None and amount==total
        same_date=bool(result.invoice.invoiceDate and result.invoice.invoiceDate==row.get('invoiceDate'))
        if not same_amount and not same_date:continue
        probable=same_amount and same_date and bool(currency)
        candidates.append({'id':row.get('id'),'status':'PROBABLE' if probable else 'POSSIBLE','score':.95 if probable else .7,'reasons':['leverancier','factuurnummer']+(['totaal'] if same_amount else [])+(['datum'] if same_date else [])})
    return candidates
