// Offertes (Kwin 2026-10-22, concurrenten n1). A quote is not an invoice: it lives in state.quotes, never
// counts in omzet, btw or the invoice number series. It reuses the invoice form and PDF layout, and one tap
// turns an accepted quote into a normal invoice concept.
(function(){
  'use strict';
  if(typeof releaseFeatureEnabled==='function'&&!releaseFeatureEnabled('quotes'))return;

  var VALID_DAYS=30;
  function quotes(){return Array.isArray(state.quotes)?state.quotes:[]}
  function quoteList(){if(!Array.isArray(state.quotes))state.quotes=[];return state.quotes}
  function find(id){return quotes().find(function(q){return q.id===id})}
  function nextNumber(){
    var prefix='OFF-'+new Date().getFullYear()+'-',max=0;
    quotes().forEach(function(q){var n=String(q.number||'');if(n.indexOf(prefix)===0){var v=Number(n.slice(prefix.length));if(v>max)max=v}});
    return prefix+String(max+1).padStart(3,'0');
  }
  function asInvoice(q){return Object.assign({},q,{kind:'invoice',status:'draft',payments:[],paymentReference:q.number})}
  function total(q){return invoiceGross(asInvoice(q))}
  function expired(q){return q.status==='open'&&q.validUntil&&q.validUntil<today()}
  function statusLabel(q){return q.status==='accepted'?'Akkoord':q.status==='declined'?'Afgewezen':expired(q)?'Verlopen':'Open'}
  function statusClass(q){return q.status==='accepted'?'paid':q.status==='declined'?'cancelled':expired(q)?'overdue':'sent'}

  // The invoice form, dressed as a quote: other title, "Geldig tot" instead of the due date, one save button.
  function dressForm(){
    var form=document.getElementById('invoiceForm');if(!form)return;
    form.dataset.quote='1';
    var title=document.getElementById('modalTitle');if(title)title.textContent=editingQuote?'Offerte bewerken':'Nieuwe offerte';
    var status=form.elements.status;if(status){var f=status.closest('.field');if(f)f.hidden=true}
    var days=form.elements.paymentDays;if(days){var p=days.closest('.field');if(p)p.hidden=true}
    var due=form.elements.dueDate;if(due){var lab=due.closest('.field')&&due.closest('.field').querySelector('label');if(lab)lab.textContent='Geldig tot *';if(!editingQuote)due.value=addDateOnlyDays(today(),VALID_DAYS)}
    var issue=form.elements.issueDate;if(issue){var il=issue.closest('.field')&&issue.closest('.field').querySelector('label');if(il)il.textContent='Offertedatum *'}
    var head=form.querySelector('.mobile-invoice-step[data-step="3"] h2');if(head)head.textContent='Offerte klaar';
    var who=form.querySelector('.mobile-invoice-step[data-step="1"] h2');if(who)who.textContent='Voor wie is de offerte?';
    form.querySelectorAll('.mobile-invoice-step[data-step="1"] button').forEach(function(b){if(/Zelfde als vorige factuur/.test(b.textContent))b.hidden=true});
    var save='<button type="button" class="btn primary mobile-flow-action" onclick="saveQuote()">Offerte opslaan</button>';
    var phoneNav=form.querySelector('.mobile-invoice-final-actions');
    if(phoneNav){phoneNav.querySelectorAll('button').forEach(function(b,i){if(i>0)b.remove()});phoneNav.insertAdjacentHTML('beforeend',save)}
    var pdf=form.querySelector('.mobile-invoice-pdf');if(pdf)pdf.remove();
    var foot=document.querySelector('#modalRoot .modal-foot:not(.mobile-invoice-original-foot)');
    if(foot)foot.innerHTML='<button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" type="button" onclick="saveQuote()">Offerte opslaan</button>';
  }
  var editingQuote=null;
  window.quoteNumberPreview=function(){return editingQuote?editingQuote.number:nextNumber()};
  window.newQuote=function(id){
    editingQuote=id?find(id)||null:null;
    closeModal();newInvoice();
    if(editingQuote)fillInvoiceFormFromData(Object.assign({},editingQuote,{number:null,status:null}));
    // The phone wizard is built right after the modal opens; dress it once it is there.
    setTimeout(dressForm,0);setTimeout(dressForm,120);
  };
  window.saveQuote=function(){
    var form=document.getElementById('invoiceForm');if(!form)return;
    var d=collectInvoiceDraft(),lines=(d.lines||[]).filter(function(l){return String(l.desc||'').trim()||Number(l.unit||0)>0});
    var customerId=d.customerId;
    if(customerId==='__new__'){if(!d.customer||!String(d.customer.name||'').trim())return toast('Vul de naam van de klant in.');customerId=findOrCreateContact('customer',{party:d.customer.name,email:d.customer.email||'',phone:d.customer.phone||'',address:d.customer.address||'',postal:d.customer.postal||'',city:d.customer.city||'',vatId:d.customer.vat||'',kvk:d.customer.kvk||''}).id}
    if(!customerId)return toast('Kies eerst een klant.');
    if(!lines.length)return toast('Zet er minstens één regel op.');
    var q=editingQuote&&find(editingQuote.id),now=new Date().toISOString();
    var data={customerId:customerId,issueDate:d.issueDate||today(),supplyDate:d.supplyDate||d.issueDate||today(),validUntil:d.dueDate||addDateOnlyDays(today(),VALID_DAYS),dueDate:d.dueDate||'',taxTreatment:d.taxTreatment||'standard',reference:d.reference||'',discountType:d.discountType||'none',discountValue:Number(d.discountValue||0),notes:d.notes||'',lines:lines,updatedAt:now};
    if(q)Object.assign(q,data);
    else{q=Object.assign({id:uid('q'),number:nextNumber(),status:'open',createdAt:now},data);quoteList().unshift(q)}
    logEvent(editingQuote?'Offerte aangepast':'Offerte gemaakt',q.number+' · '+money(total(q)),'quote',q.id);
    editingQuote=null;
    var form2=document.getElementById('invoiceForm');if(form2)form2.remove(); // nothing left to stash as an invoice concept
    save();closeModal();render();toast('Offerte '+q.number+' opgeslagen');
    quoteActions(q.id);
  };

  function documentHtml(q,autoPrint){
    var cfg=Object.assign({},DEFAULT_INVOICE_DESIGN,state.company.invoiceDesign||{},{showPaymentBlock:false});
    return invoiceDocumentHtml(asInvoice(q),getContact(q.customerId),cfg,{autoPrint:!!autoPrint})
      .replace(/>FACTUUR</g,'>OFFERTE<').replace(/>Factuurnummer</g,'>Offertenummer<').replace(/>Factuurdatum</g,'>Offertedatum<')
      .replace(/>Vervaldatum</g,'>Geldig tot<').replace(/Betaal uiterlijk /g,'Geldig tot ').replace(/>Factuur aan</g,'>Offerte voor<');
  }
  window.printQuote=function(id){
    var q=find(id);if(!q)return;
    var w=window.open('','_blank');if(!w)return toast('Pop-up geblokkeerd; sta pop-ups toe voor PDF');
    w.document.write(documentHtml(q,true));w.document.close();
  };
  window.mailQuote=function(id){
    var q=find(id);if(!q)return;var c=getContact(q.customerId);
    if(!validEmail(c.email))return toast('Vul eerst een e-mailadres in bij '+(c.name||'de klant')+'.');
    var company=state.company.tradeName||state.company.name||'';
    var subject='Offerte '+q.number+(company?' van '+company:'');
    var body=['Beste '+(c.contactPerson||c.name||'klant')+',','Hierbij stuur ik je de offerte '+q.number+' voor '+money(total(q))+'. De offerte is geldig tot '+dateNL(q.validUntil)+'.','Laat gerust weten of je akkoord gaat, dan maak ik de factuur.','Met vriendelijke groet,\n'+(state.company.contactName||company)].join('\n\n');
    printQuote(id);
    window.location.href=buildInvoiceMailto(c.email,subject,body);
    q.sentAt=new Date().toISOString();save();
    toast('Je mail-app opent. Bewaar de PDF en voeg hem toe.');
  };
  window.setQuoteStatus=function(id,status){var q=find(id);if(!q)return;q.status=status;q.updatedAt=new Date().toISOString();logEvent('Offerte '+statusLabel(q).toLowerCase(),q.number,'quote',q.id);save();render();quoteActions(id)};
  window.deleteQuote=function(id){var q=find(id);if(!q)return;if(!confirm('Offerte '+q.number+' verwijderen?'))return;state.quotes=quotes().filter(function(x){return x.id!==id});logEvent('Offerte verwijderd',q.number,'quote',id);save();closeModal();render();toast('Offerte verwijderd')};
  window.quoteToInvoice=function(id){
    var q=find(id);if(!q)return;
    q.status='accepted';q.invoicedAt=new Date().toISOString();save();
    var c=getContact(q.customerId),days=Number(c.paymentDays||state.company.paymentDays||14);
    pendingInvoiceDraft={customerId:q.customerId,issueDate:today(),supplyDate:today(),dueDate:addDateOnlyDays(today(),days),paymentDays:days,status:'draft',taxTreatment:q.taxTreatment,reference:q.number,discountType:q.discountType,discountValue:q.discountValue,notes:q.notes,lines:q.lines};
    closeModal();if(typeof window.setNextInvoiceStep==='function')window.setNextInvoiceStep(2);newInvoiceFromPending();toast('Factuur klaargezet vanuit '+q.number);
  };
  window.quoteActions=function(id){
    var q=find(id);if(!q)return;var c=getContact(q.customerId),open=q.status==='open';
    modal('Offerte '+esc(q.number),
      '<div class="quote-detail"><div class="quote-detail-amount">'+money(total(q))+'</div><p class="quote-detail-sub">'+esc(c.name||'Klant')+' · '+statusBadge(statusClass(q)).replace(/>[^<]*</,'>'+esc(statusLabel(q))+'<')+'</p>'
        +'<dl class="expense-detail-list"><div><dt>Datum</dt><dd>'+dateNL(q.issueDate)+'</dd></div><div><dt>Geldig tot</dt><dd>'+dateNL(q.validUntil)+'</dd></div>'+(q.invoicedAt?'<div><dt>Factuur</dt><dd>Gemaakt op '+dateNL(String(q.invoicedAt).slice(0,10))+'</dd></div>':'')+'</dl>'
        +'<div class="quote-detail-actions"><button class="btn" type="button" onclick="printQuote(\''+esc(q.id)+'\')">PDF bekijken</button><button class="btn" type="button" onclick="mailQuote(\''+esc(q.id)+'\')">Mailen</button>'
        +(open?'<button class="btn" type="button" onclick="newQuote(\''+esc(q.id)+'\')">Bewerken</button><button class="btn" type="button" onclick="setQuoteStatus(\''+esc(q.id)+'\',\'declined\')">Afgewezen</button>':'<button class="btn" type="button" onclick="setQuoteStatus(\''+esc(q.id)+'\',\'open\')">Weer open</button>')
        +'<button class="link-btn quote-delete" type="button" onclick="deleteQuote(\''+esc(q.id)+'\')">Verwijderen</button></div></div>',
      '<button class="btn" onclick="closeModal()">Sluiten</button>'+(q.status!=='declined'&&!q.invoicedAt?'<button class="btn primary" onclick="quoteToInvoice(\''+esc(q.id)+'\')">Akkoord, maak factuur</button>':''));
  };
  window.openQuotes=function(){
    var rows=quotes().slice().sort(function(a,b){return String(b.issueDate||'').localeCompare(String(a.issueDate||''))});
    modal('Offertes',(rows.length?'<div class="quote-list">'+rows.map(function(q){var c=getContact(q.customerId);return '<button type="button" class="quote-row" onclick="quoteActions(\''+esc(q.id)+'\')"><span><strong>'+esc(c.name||'Klant')+'</strong><span>'+esc(q.number)+' · '+esc(statusLabel(q))+'</span></span><strong>'+money(total(q))+'</strong></button>'}).join('')+'</div>':'<p class="help">Nog geen offertes.</p>'),
      '<button class="btn" onclick="closeModal()">Sluiten</button><button class="btn primary" onclick="newQuote()">Nieuwe offerte</button>');
  };

  // Inkomsten: one quiet row under the page head while there are open quotes.
  function stripHtml(){
    var open=quotes().filter(function(q){return q.status==='open'&&!expired(q)});
    if(!quotes().length)return '';
    var sum=open.reduce(function(s,q){return roundMoney(s+total(q))},0);
    return '<button type="button" class="calm-row quote-strip" onclick="openQuotes()"><span class="calm-label">Offertes'+(open.length?' · '+open.length+' open':'')+'</span><strong class="calm-value">'+(open.length?money(sum):'')+'</strong>'+icon('i-chevron')+'</button>';
  }
  var baseRender=window.render;
  window.render=function(){
    var out=baseRender.apply(this,arguments);
    try{
      if(page==='invoices'){
        var content=document.getElementById('content'),head=content&&content.querySelector('.page-head');
        if(head&&!content.querySelector('.quote-strip')){var html=stripHtml();if(html)head.insertAdjacentHTML('afterend','<div class="calm-list quote-strip-wrap">'+html+'</div>')}
      }
    }catch(_err){}
    return out;
  };
})();
