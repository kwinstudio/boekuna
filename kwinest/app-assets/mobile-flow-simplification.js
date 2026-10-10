/* BOEKUNA mobile flow simplification — presentation/sequencing only. Existing state, validators and persistence stay authoritative. */
(function(){
  'use strict';
  var media=matchMedia('(max-width:820px)');
  var queued=false;
  var moves=[];
  var textChanges=[];
  var invoiceResume=null;
  var nextInvoiceStep=null;
  var mobileIssueReviewRequested=false;
  var DIRECT_FIELDS=['reviewAmount','net','vatAmount','gross','vatRate','vatLines','currency','exchangeRateToEur','vatTreatmentChoice'];

  function node(tag,className,text){
    var el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=text;
    return el;
  }
  function button(text,fn,className){
    var el=node('button',className||'btn',text);
    el.type='button';
    el.addEventListener('click',fn);
    return el;
  }
  function rememberText(el,text){
    if(!el||el.dataset.mobileFlowTextSaved)return;
    el.dataset.mobileFlowTextSaved='1';
    textChanges.push({el:el,text:el.textContent});
    el.textContent=text;
  }
  function move(parent,el,before){
    if(!parent||!el||el.dataset.mobileFlowMoved)return;
    var marker=document.createComment('mobile-flow-original');
    el.before(marker);
    el.dataset.mobileFlowMoved='1';
    moves.push({el:el,marker:marker});
    parent.insertBefore(el,before||null);
  }
  function moneyText(value){
    try{return typeof money==='function'?money(Number(value||0)):'€ '+Number(value||0).toFixed(2).replace('.',',')}
    catch(_){return '€ '+Number(value||0).toFixed(2).replace('.',',')}
  }
  function dateText(value){
    try{return typeof dateNL==='function'?dateNL(value):String(value||'')}
    catch(_){return String(value||'')}
  }
  function reviewQuestion(field){
    var map={
      gross:'Klopt het totaal?',net:'Klopt het bedrag excl. btw?',vatAmount:'Klopt de btw?',vatRate:'Klopt de btw?',
      vatLines:'Klopt deze btw-verdeling?',vatTreatmentChoice:'Klopt de btw?',confirmDuplicate:'Deze bon heb je al',
      confirmAnomaly:'Controleer het origineel',currency:'Controleer de valuta',exchangeRateToEur:'Controleer de valuta',
      issueDate:'Klopt de datum?',party:'Klopt de leverancier?',invoiceNumber:'Klopt het factuurnummer?',category:'Klopt de categorie?',
      document:'Klopt dit document?'
    };
    return map[field]||'Klopt dit gegeven?';
  }
  function emptyQuestion(field){
    var map={party:'Wie is de leverancier?',issueDate:'Wat is de datum?',invoiceNumber:'Wat is het factuurnummer?',category:'Welke categorie past?'};
    return map[field]||'Vul dit gegeven in';
  }
  function contactField(form,name){return form.elements.namedItem(name)?.closest('.field')||null}
  function updateContactCompanyCard(form,card){
    if(!form||!card)return;
    var selected=String(form.dataset.kvkSelectedNumber||'');
    var get=function(name){return String(form.elements.namedItem(name)?.value||'').trim()};
    var signature=JSON.stringify([selected,get('name'),get('address'),get('postal'),get('city')]);
    if(card.dataset.signature===signature)return;
    card.dataset.signature=signature;
    card.hidden=!selected;
    if(!selected){card.replaceChildren();return}
    card.replaceChildren();
    card.append(node('strong','',get('name')||'Bedrijf'));
    var address=[get('address'),[get('postal'),get('city')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if(address)card.append(node('span','',address));
    card.append(node('span','',selected?'KVK '+selected:''));
    card.append(node('small','','Ingevuld via KVK'));
    form.dataset.mobileKvkSelected='1';
  }
  function contactFlow(root){
    var form=root?.querySelector('#contactForm');
    if(!form||form.dataset.mobileCustomerFlow||!media.matches)return;
    var title=root.querySelector('#modalTitle')||root.querySelector('.modal-head h3');
    var editing=/bewerken/i.test(String(title?.textContent||''));
    if(editing)return;
    form.dataset.mobileCustomerFlow='1';
    if(title)rememberText(title,'Nieuwe klant');
    var lookup=root.querySelector('#kvkLookup');
    // Without KVK search the customer is filled in by hand straight away.
    if(!lookup)form.dataset.mobileManual='1';
    var card=node('section','mobile-customer-company-card');card.hidden=true;
    if(lookup){
    lookup.classList.add('mobile-kvk-first');
    var heading=lookup.querySelector('#kvkHeading');if(heading)rememberText(heading,'Nieuwe klant');
    var manualExisting=lookup.querySelector('.kvk-manual');if(manualExisting)manualExisting.classList.add('mobile-existing-kvk-manual');
    lookup.after(card);
    var manual=button('Particulier of buitenland? Zelf invullen',function(){
      form.dataset.mobileManual='1';
      if(manualExisting&&!lookup.querySelector('.kvk-search-controls')?.hidden)manualExisting.click();
      var more=form.querySelector('.mobile-contact-more');if(more)more.open=true;
      contactField(form,'name')?.querySelector('input')?.focus?.();
      schedule();
    },'btn link-btn mobile-contact-manual mobile-flow-action');
    lookup.after(manual);
    }
    var more=node('details','mobile-contact-more');
    var moreBody=node('div','mobile-contact-more-body');
    more.append(node('summary','','Meer gegevens'),moreBody);
    ['contactPerson','phone','kvk','vat','peppolId','country'].forEach(function(name){var field=contactField(form,name);if(field)move(moreBody,field)});
    more.addEventListener('toggle',function(){form.dataset.mobileMore=String(more.open)});
    form.append(more);
    var save=root.querySelector('.modal-foot .btn.primary');
    if(save)rememberText(save,'Klant opslaan');
    var cancel=root.querySelector('.modal-foot .btn:not(.primary)');
    if(cancel&&invoiceResume){
      rememberText(cancel,'Terug naar factuur');
      cancel.onclick=function(){
        var resume=invoiceResume;invoiceResume=null;closeModal();
        if(!resume)return;
        nextInvoiceStep=1;
        setTimeout(function(){newInvoice(true);setTimeout(function(){fillInvoiceFormFromData(resume.draft);schedule()},0)},0);
      };
    }
    updateContactCompanyCard(form,card);
    form.querySelectorAll('input,select,textarea').forEach(function(input){
      input.addEventListener('input',function(){if(form.dataset.mobileKvkSelected||form.dataset.kvkSelectedNumber)updateContactCompanyCard(form,card)});
    });
  }

  function invoiceSectionFor(form,selector){return form.querySelector(selector)?.closest('.invoice-editor-section')||null}
  function recentCustomers(){
    var ids=[];
    (state.invoices||[]).slice().sort(function(a,b){return String(b.issueDate||'').localeCompare(String(a.issueDate||''))}).forEach(function(i){if(i.customerId&&!ids.includes(i.customerId))ids.push(i.customerId)});
    (state.contacts||[]).filter(function(c){return c.type==='customer'}).forEach(function(c){if(!ids.includes(c.id))ids.push(c.id)});
    return ids.map(function(id){return getContact(id)}).filter(function(c){return c&&c.id}).slice(0,3);
  }
  function latestReusableInvoice(){
    return (state.invoices||[]).filter(function(i){return i.status!=='draft'&&i.kind!=='credit'}).slice().sort(function(a,b){return String(b.issueDate||'').localeCompare(String(a.issueDate||''))})[0]||null;
  }
  function invoiceProgress(){
    var progress=node('div','mobile-invoice-progress');
    [1,2,3].forEach(function(n){var s=node('span','',n+' van 3');s.dataset.step=String(n);progress.append(s)});
    return progress;
  }
  function setInvoiceStep(form,step){
    step=Math.max(1,Math.min(3,Number(step)||1));
    form.dataset.mobileInvoiceStep=String(step);
    form.querySelectorAll('.mobile-invoice-progress span').forEach(function(s){s.classList.toggle('active',Number(s.dataset.step)===step)});
    if(step===3)renderInvoiceSummary(form);
    rootScrollTop(form);
  }
  function rootScrollTop(form){
    form.closest('.modal')?.querySelector('.modal-body')?.scrollTo?.({top:0,behavior:'auto'});
  }
  function selectInvoiceCustomer(form,id){
    var select=form.elements.namedItem('customerId');if(!select)return;
    select.value=String(id||'');select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function startMobileCustomerFromInvoice(form){
    var draft=collectInvoiceDraft();
    invoiceResume={draft:structuredClone(draft),before:new Set((state.contacts||[]).map(function(c){return c.id}))};
    newContact();
  }
  // Style C (screen 6): the customer's avatar (or own-site logo) in front of each choice.
  function withAvatar(target,contact){
    if(typeof partyAvatarHtml!=='function'||!contact)return;
    var holder=document.createElement('span');
    holder.innerHTML=partyAvatarHtml(contact.name,typeof partyLogoDomain==='function'?partyLogoDomain(contact):'');
    var text=node('span','mobile-invoice-choice-text');
    while(target.firstChild)text.append(target.firstChild);
    target.append(holder.firstChild,text);target.classList.add('has-avatar');
  }
  function customerChoice(form,c){
    // Kwin 2026-10-10: tapping a customer is the choice, so the invoice goes straight on to step 2.
    var choice=button(c.name,function(){selectInvoiceCustomer(form,c.id);setInvoiceStep(form,2)},'mobile-invoice-choice mobile-flow-action');
    choice.dataset.customerId=String(c.id);withAvatar(choice,c);return choice;
  }
  // The chosen customer is marked in the list, and the address preview shows once a customer is picked.
  function syncCustomerChoice(form){
    var id=String(form.elements.namedItem('customerId')?.value||'');
    if(id&&id!=='__new__')form.dataset.customerPicked='1';else delete form.dataset.customerPicked;
    form.querySelectorAll('.mobile-invoice-choice[data-customer-id]').forEach(function(b){var on=b.dataset.customerId===id;b.classList.toggle('is-selected',on);b.setAttribute('aria-pressed',String(on))});
  }
  function invoiceStepOne(form){
    var section=invoiceSectionFor(form,'#invoiceCustomer');if(!section)return null;
    var step=node('section','mobile-invoice-step');step.dataset.step='1';
    step.append(node('h2','','Voor wie is de factuur?'));
    var last=latestReusableInvoice();
    if(last){
      var quick=node('div','mobile-invoice-quick');
      quick.append(node('span','mobile-flow-eyebrow','Snelste optie'));
      var customer=getContact(last.customerId);
      var quickButton=button('',function(){
        var draft=collectInvoiceDraft();
        draft.customerId=last.customerId;draft.customer=getContact(last.customerId);draft.lines=structuredClone(last.lines||[]);
        fillInvoiceFormFromData(draft);enhanceInvoiceRows(form);setInvoiceStep(form,2);
      },'mobile-invoice-choice mobile-flow-action');
      quickButton.append(node('strong','','Zelfde als vorige factuur'));
      quickButton.append(node('span','',[customer?.name||'Klant',(last.lines||[])[0]?.desc||'',moneyText(typeof invoiceGross==='function'?invoiceGross(last):0)].filter(Boolean).join(' · ')));
      if(customer)withAvatar(quickButton,customer);
      quick.append(quickButton);step.append(quick);
    }
    var recent=recentCustomers();
    if(recent.length){
      var block=node('div','mobile-invoice-recent');block.append(node('span','mobile-flow-eyebrow','Recente klanten'));
      recent.forEach(function(c){block.append(customerChoice(form,c))});
      step.append(block);
    }
    // Search every customer (Kwin's pick, 2026-10-09); matches show as the same choice buttons.
    var customers=(state.contacts||[]).filter(function(c){return c&&c.id&&c.type==='customer'});
    if(customers.length){
      var search=node('label','invoice-customer-search');
      search.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
      var query=node('input');query.type='search';query.placeholder='Zoek een klant';query.autocomplete='off';query.setAttribute('aria-label','Zoek een klant');
      search.append(query);
      var results=node('div','invoice-customer-results');results.setAttribute('aria-live','polite');
      query.addEventListener('input',function(){
        var q=query.value.trim().toLowerCase();results.textContent='';
        if(!q)return;
        var found=customers.filter(function(c){return [c.name,c.email,c.city].filter(Boolean).join(' ').toLowerCase().indexOf(q)>=0}).slice(0,6);
        found.forEach(function(c){results.append(customerChoice(form,c))});
        if(!found.length)results.append(node('p','mobile-flow-hint','Geen klant gevonden. Maak hieronder een nieuwe klant.'));
        syncCustomerChoice(form);
      });
      step.append(search,results);
    }
    var newCustomer=button('Nieuwe klant',function(){startMobileCustomerFromInvoice(form)},'btn mobile-new-customer mobile-flow-action');
    step.append(newCustomer);
    // The dropdown stays for screen readers and keyboards; on screen the choices above do the work.
    section.classList.add('invoice-customer-section');
    var select=form.elements.namedItem('customerId');
    if(select){
      select.classList.add('invoice-customer-select-sr');select.closest('.field')?.querySelector('label')?.classList.add('invoice-customer-select-sr');
      if(!select.dataset.mobileChoiceSync){select.dataset.mobileChoiceSync='1';select.addEventListener('change',function(){syncCustomerChoice(form)})}
    }
    move(step,section);
    syncCustomerChoice(form);
    var nav=node('div','mobile-invoice-nav');
    nav.append(button('Volgende',function(){
      var value=form.elements.namedItem('customerId')?.value;
      if(!value){form.elements.namedItem('customerId')?.reportValidity?.();return}
      if(value==='__new__'){startMobileCustomerFromInvoice(form);return}
      setInvoiceStep(form,2);
    },'btn primary mobile-flow-action'));
    step.append(nav);return step;
  }
  function addVatChoices(row){
    var select=row.querySelector('[data-k="vat"]');if(!select||row.querySelector('.mobile-vat-choice'))return;
    var wrap=node('div','mobile-vat-choice');wrap.setAttribute('role','group');wrap.setAttribute('aria-label','Btw-percentage');
    [['21','21%'],['9','9%'],['0','Geen']].forEach(function(pair){
      var b=button(pair[1],function(){
        if(select.disabled)return;
        select.value=pair[0];select.dispatchEvent(new Event('change',{bubbles:true}));syncVatChoices(row);
      },'btn mobile-flow-action');b.dataset.value=pair[0];wrap.append(b);
    });
    select.after(wrap);select.classList.add('mobile-vat-native-select');syncVatChoices(row);
  }
  function syncVatChoices(row){
    var select=row.querySelector('[data-k="vat"]'),value=String(select?.value??'');
    row.querySelectorAll('.mobile-vat-choice button').forEach(function(b){
      var on=b.dataset.value===value;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.disabled=!!select?.disabled;
    });
  }
  function enhanceInvoiceRows(form){
    form.querySelectorAll('#invoiceLines .line-item').forEach(function(row){
      addVatChoices(row);
      var unitLabel=row.querySelector('[data-k="unitLabel"]')?.closest('.field');if(unitLabel)unitLabel.classList.add('mobile-invoice-unit-label');
      var price=row.querySelector('[data-k="unit"]')?.closest('.field')?.querySelector('label');if(price)rememberText(price,'Prijs excl. btw');
      // A new, empty line starts without a price (not 0), so typing the price needs no clearing first.
      var unit=row.querySelector('[data-k="unit"]'),desc=row.querySelector('[data-k="desc"]');
      if(unit&&!row.dataset.mobilePriceReady){
        row.dataset.mobilePriceReady='1';unit.placeholder='0,00';unit.inputMode='decimal';
        if(unit.value==='0'&&!String(desc?.value||'').trim())unit.value='';
      }
    });
    var add=form.querySelector('.invoice-editor-section:has(#invoiceLines) .section-head .btn');if(add)rememberText(add,'+ Nog een regel');
  }
  function invoiceStepTwo(form){
    var lines=invoiceSectionFor(form,'#invoiceLines');if(!lines)return null;
    enhanceInvoiceRows(form);
    var step=node('section','mobile-invoice-step');step.dataset.step='2';
    step.append(node('h2','','Wat heb je gedaan?'));
    move(step,lines);
    // "+ Nog een regel" sits under the last line, where you look when one line is done.
    var add=lines.querySelector('.section-head .btn'),list=lines.querySelector('#invoiceLines');
    if(add&&list){move(list.parentElement,add,list.nextSibling);add.classList.add('mobile-invoice-add-line')}
    var total=form.querySelector('.invoice-editor-summary');if(total)move(step,total);
    var nav=node('div','mobile-invoice-nav');
    nav.append(button('Vorige',function(){setInvoiceStep(form,1)},'btn mobile-flow-action'));
    nav.append(button('Volgende',function(){
      var draft=collectInvoiceDraft(),checks=invoiceDraftChecks(draft,editingInvoiceId||'');
      var lineError=checks.errors.find(function(x){return /^Regel|Factuurregels/.test(x.label)});
      if(lineError){updateInvoiceCheck();toast(lineError.msg||'Controleer de factuurregel.');return}
      var emptyPrice=Array.from(form.querySelectorAll('#invoiceLines [data-k="unit"]')).find(function(input){return input.value===''});
      if(emptyPrice){emptyPrice.focus();toast('Vul de prijs in (0 mag ook).');return}
      setInvoiceStep(form,3);
    },'btn primary mobile-flow-action'));
    step.append(nav);return step;
  }
  function renderInvoiceSummary(form){
    var box=form.querySelector('.mobile-invoice-summary');if(!box)return;
    var draft=collectInvoiceDraft(),customer=draft.customer||getContact(draft.customerId)||{};
    var total=form.querySelector('#formTotals .grand strong')?.textContent||'—';
    var first=(draft.lines||[])[0]?.desc||'Factuur';
    var number=String(draft.number||'Concept'),numberNote='';
    // A concept gets its real number when it is sent; show that number instead of CONCEPT-….
    if(typeof isManagedDraftNumber==='function'&&isManagedDraftNumber(number)&&typeof nextInvoiceNumber==='function'){number=nextInvoiceNumber();numberNote='krijgt dit nummer bij versturen'}
    var date=draft.issueDate===today()?'Vandaag':dateText(draft.issueDate);
    box.replaceChildren();
    var top=node('div','mobile-invoice-summary-top');top.append(node('strong','',customer.name||'Klant'),node('strong','',total));box.append(top);
    box.append(node('p','',first));
    [['Factuurnummer',number,numberNote],['Datum',date],['Betalen binnen',Number(draft.paymentDays||0)+' dagen']].forEach(function(pair){
      var row=node('div','mobile-invoice-summary-row'),value=node('strong','',pair[1]);
      if(pair[2]){value=node('span','mobile-invoice-summary-value');value.append(node('strong','',pair[1]),node('small','',pair[2]))}
      row.append(node('span','',pair[0]),value);box.append(row);
    });
  }
  async function saveMobileInvoiceConcept(form,openPreview,quiet){
    var draft=collectInvoiceDraft();draft.status='draft';
    var checks=invoiceDraftChecks(draft,editingInvoiceId||'');
    if(checks.errors.length){updateInvoiceCheck();toast('Nog '+checks.errors.length+' punt(en) controleren');setInvoiceStep(form,checks.errors.some(function(x){return x.label==='Klant'||x.label==='Klantnaam'})?1:2);return null}
    pendingInvoiceDraft=draft;
    var saved=await finalSaveInvoice({throwOnError:true,quiet:!!quiet});
    if(saved&&openPreview)printInvoice(saved.id);
    return saved;
  }
  async function sendMobileInvoice(form){
    // Sending saves a concept first; only the e-mail step should give feedback.
    var saved=await saveMobileInvoiceConcept(form,false,true);
    if(saved)await finalizeDraftAndSend(saved.id);
  }
  function invoiceStepThree(form){
    var step=node('section','mobile-invoice-step');step.dataset.step='3';
    step.append(node('h2','','Klaar om te versturen'));
    var summary=node('div','mobile-invoice-summary');step.append(summary);
    var advanced=form.querySelector('details.invoice-advanced-options'),dateSection=invoiceSectionFor(form,'[name="issueDate"]');
    if(advanced){
      var disclosure=advanced.querySelector('.disclosure-body')||advanced;
      if(dateSection)move(disclosure,dateSection,disclosure.firstChild);
      var advancedLabel=advanced.querySelector('summary');if(advancedLabel)rememberText(advancedLabel,'Korting, referentie of notitie');
      move(step,advanced);
    }else if(dateSection)move(step,dateSection);
    step.append(button('Bekijk PDF',function(){saveMobileInvoiceConcept(form,true)},'btn mobile-invoice-pdf mobile-flow-action'));
    var nav=node('div','mobile-invoice-nav mobile-invoice-final-actions');
    nav.append(button('Vorige',function(){setInvoiceStep(form,2)},'btn mobile-flow-action'));
    nav.append(button('Bewaar als concept',function(){saveMobileInvoiceConcept(form,false)},'btn mobile-flow-action'));
    nav.append(button('Versturen',function(){sendMobileInvoice(form)},'btn primary mobile-flow-action'));
    step.append(nav);return step;
  }
  function invoiceFlow(root){
    var form=root?.querySelector('#invoiceForm');
    if(!form||form.dataset.mobileInvoiceFlow||!media.matches)return;
    form.dataset.mobileInvoiceFlow='1';
    form.prepend(invoiceProgress());
    var step1=invoiceStepOne(form),step2=invoiceStepTwo(form),step3=invoiceStepThree(form);
    if(!step1||!step2||!step3)return;
    var progress=form.querySelector('.mobile-invoice-progress');
    progress.after(step1,step2,step3);
    var originalFoot=root.querySelector('.modal-foot');if(originalFoot)originalFoot.classList.add('mobile-invoice-original-foot');
    var initial=nextInvoiceStep||1;nextInvoiceStep=null;setInvoiceStep(form,initial);
  }

  function activeReviewTarget(flow,field){
    if(field==='vatLines')return flow.querySelector('.mixed-vat-summary');
    if(field==='currency'||field==='exchangeRateToEur')return flow.querySelector('[data-review-issue="currency"]')||flow.querySelector('[data-review-field="currency"]');
    return flow.querySelector('[data-review-issue="'+field+'"]')||flow.querySelector('[data-review-field="'+field+'"]');
  }
  function restoreReviewPages(flow){
    flow?.querySelectorAll('[data-review-page][data-mobile-was-hidden]').forEach(function(page){
      page.hidden=page.dataset.mobileWasHidden==='1';delete page.dataset.mobileWasHidden;
    });
    setShellFoot(flow,false);
    flow?.querySelectorAll('.mobile-flow-hidden,.mobile-active-issue').forEach(function(el){el.classList.remove('mobile-flow-hidden','mobile-active-issue')});
  }
  function setShellFoot(flow,on){flow?.closest('.modal')?.classList.toggle('mobile-single-issue-active',!!on)}
  function showFullReview(flow,issue){
    restoreReviewPages(flow);flow.dataset.mobileSimpleReview='full';delete flow.dataset.mobileHoldField;setShellFoot(flow,false);
    flow.querySelector('.mobile-single-issue-review')?.setAttribute('hidden','');
    flow.querySelectorAll('.mobile-single-issue-actions').forEach(function(el){el.remove()});
    var field=String(issue?.field||'');
    var amountFields=['reviewAmount','net','vatAmount','gross','vatRate','vatLines','currency','exchangeRateToEur','vatTreatmentChoice'];
    var step=amountFields.includes(field)?2:1;
    if(typeof setDocumentReviewStep==='function'){
      setDocumentReviewStep(step);
      // The review opens on step 1 one frame later; land on the step with the question after that.
      requestAnimationFrame(function(){requestAnimationFrame(function(){if(flow.isConnected&&step===2&&flow.dataset.reviewWizardStep!=='2')setDocumentReviewStep(2)})});
    }
    if(typeof updateBeginnerReviewState==='function')updateBeginnerReviewState();
    requestAnimationFrame(function(){if(field&&typeof focusDocumentReviewIssue==='function')focusDocumentReviewIssue(field)});
  }
  function confirmReviewIssue(flow,issue){
    var field=String(issue?.field||'');
    if(field==='confirmDuplicate')confirmDuplicateOverride();
    else if(field==='confirmAnomaly')confirmDocumentAnomaly();
    else if(field==='currency'||field==='exchangeRateToEur')confirmExchangeRate();
    else if(field==='vatLines'){
      if(typeof useMixedVatTotals==='function')useMixedVatTotals();else updateBeginnerReviewState();
    }else if(field==='vatTreatmentChoice'){
      updateBeginnerReviewState();
    }else if(typeof confirmDocumentReviewField==='function')confirmDocumentReviewField(field);
    else updateBeginnerReviewState();
    requestAnimationFrame(schedule);
  }
  function duplicateDisplayData(parsed){
    var candidate=parsed?.duplicateCandidate||{};
    var existing=(state.documents||[]).find(function(d){return String(d.id||'')===String(candidate.id||candidate.document_ref||'')})||null;
    var snap=existing?.reviewSnapshot||{};
    return {
      current:{party:String(parsed?.party||'Nieuwe bon'),date:String(parsed?.issueDate||''),gross:parsed?.gross},
      existing:{party:String(snap.party||existing?.name||'Bestaand document'),date:String(snap.issueDate||existing?.date||''),gross:snap.gross,label:String(candidate.label||'')},
      source:existing
    };
  }
  function duplicateComparison(parsed){
    var data=duplicateDisplayData(parsed),wrap=node('section','mobile-duplicate-comparison');
    wrap.append(node('h5','','Deze bon heb je al'));
    var intro=String(parsed?.duplicateCandidate?.label||'Zelfde gegevens als een document dat al in BOEKUNA staat.');
    wrap.append(node('p','',intro));
    var cards=node('div','mobile-duplicate-cards');
    function card(kicker,data){
      var el=node('article','mobile-duplicate-card');
      el.append(node('span','mobile-duplicate-kicker',kicker));
      el.append(node('strong','',data.party||'Document'));
      var meta=[data.date?dateText(data.date):'',data.gross!=null&&Number.isFinite(Number(data.gross))?moneyText(Number(data.gross)):''].filter(Boolean).join(' · ');
      if(meta)el.append(node('span','',meta));
      if(!meta&&data.label)el.append(node('span','',data.label));
      return el;
    }
    cards.append(card('NIEUW',data.current),card('AL IN BOEKUNA',data.existing));
    wrap.append(cards);
    return wrap;
  }
  function simpleReview(root){
    var flow=root?.querySelector('.document-review-flow.two-step-review');
    if(!flow||!media.matches||flow.dataset.mobileSimpleReview==='full')return;
    var parsed=pendingPdfImport?.parsed;if(!parsed)return;
    var requested=mobileIssueReviewRequested||!!pendingPdfImport?.processingJobId;
    if(flow.dataset.mobileSimpleReview!=='active'&&!requested)return;
    // Questions about the basis (supplier, date, number) come first: amounts are answered on the amounts step,
    // and jumping there first would hide a basis question while Save stays off.
    var issues=(window.BookunaDocumentReviewV2?.financialBlockingIssues?.(parsed)||[]).slice().sort(function(a,b){
      return Number(DIRECT_FIELDS.includes(String(a?.field||'')))-Number(DIRECT_FIELDS.includes(String(b?.field||'')));
    });
    if(!issues.length&&flow.dataset.mobileSimpleReview!=='active'){mobileIssueReviewRequested=false;return}
    // Amounts and VAT choices are answered in the amounts step itself; a "Ja, klopt" there would only repeat the
    // same question, so those go straight to the step with the field.
    var first=String(issues[0]?.field||'');
    if(issues.length&&DIRECT_FIELDS.includes(first)&&flow.dataset.mobileSimpleReview!=='active'){showFullReview(flow,issues[0]);mobileIssueReviewRequested=false;return}
    var issueSignature=JSON.stringify(issues.map(function(issue){return [issue?.field,issue?.message,issue?.code]}));
    var shell=flow.querySelector('.mobile-single-issue-review');
    // While the user fills an empty field, the question stays put until they tap "Volgende". Moving on at the
    // first change hid the field mid-entry: the iPhone date picker reports a date as soon as it opens and closed.
    if(shell&&flow.dataset.mobileSimpleReview==='active'&&flow.dataset.mobileHoldField)return;
    if(shell&&flow.dataset.mobileSimpleReview==='active'&&flow.dataset.mobileIssueSignature===issueSignature)return;
    flow.dataset.mobileIssueSignature=issueSignature;
    restoreReviewPages(flow);
    flow.querySelectorAll('.mobile-single-issue-actions').forEach(function(el){el.remove()});
    if(!shell){shell=node('section','mobile-single-issue-review');flow.querySelector('.document-review-fields')?.prepend(shell)}
    shell.hidden=false;flow.dataset.mobileSimpleReview='active';mobileIssueReviewRequested=false;setShellFoot(flow,true);
    shell.replaceChildren();
    if(!issues.length){
      shell.append(node('span','mobile-flow-eyebrow','Controle afgerond'));
      shell.append(node('h4','mobile-single-issue-question','Alles klopt'));
      shell.append(node('p','','Je kunt deze bon nu veilig opslaan.'));
      shell.append(button('Opslaan',function(){savePdfInvoiceImport()},'btn primary mobile-flow-action'));
      shell.append(button('Alle gegevens bekijken',function(){showFullReview(flow,issue)},'btn link-btn mobile-flow-action'));
      return;
    }
    var issue=issues[0],target=activeReviewTarget(flow,String(issue.field||''));
    if(DIRECT_FIELDS.includes(String(issue.field||''))){showFullReview(flow,issue);return}
    var field=String(issue.field||''),input=target?.querySelector('input,select,textarea');
    // Only a plain field can be empty; question cards (duplicate, anomaly, currency) keep their own wording.
    var plain=!!target?.matches?.('[data-review-field]')&&!['confirmDuplicate','confirmAnomaly','currency','exchangeRateToEur','vatLines','vatTreatmentChoice'].includes(field);
    var empty=plain&&!!input&&!String(input.value||'').trim();
    shell.append(node('span','mobile-flow-eyebrow',issues.length>1?'Vraag 1 van '+issues.length:'Nog 1 vraag'));
    shell.append(node('h4','mobile-single-issue-question',empty?emptyQuestion(field):reviewQuestion(field)));
    // An empty field says "… ontbreekt" in the message; the question already asks for it, so it is not repeated.
    if(issue.message&&!empty)shell.append(node('p','',String(issue.message)));
    else if(empty)shell.append(node('p','','Neem het over zoals het op het document staat.'));
    if(field==='confirmDuplicate')shell.append(duplicateComparison(parsed));
    var page=target?.closest('[data-review-page]');
    if(page){
      if(!page.dataset.mobileWasHidden)page.dataset.mobileWasHidden=page.hidden?'1':'0';
      page.hidden=false;
    }
    var candidates=flow.querySelectorAll('[data-review-field],[data-review-issue],.mixed-vat-summary,.review-context-card,#financialCorrectionPanel,#reviewBasisState,#reviewBlockingState');
    candidates.forEach(function(el){if(el!==target&&!el.contains(target))el.classList.add('mobile-flow-hidden')});
    target?.classList.add('mobile-active-issue');
    // The answers sit right under the field they are about, not above it.
    var actions=node('div','mobile-single-issue-actions'),more=node('div','mobile-single-issue-more');
    if(field==='confirmDuplicate'){
      actions.append(button('Weggooien, is dubbel',function(){window.discardDuplicateReview?.()},'btn primary mobile-flow-action'));
      actions.append(button('Nee, dit is een andere bon',function(){confirmDuplicateOverride();requestAnimationFrame(schedule)},'btn mobile-flow-action'));
    }else if(field==='confirmAnomaly'){
      actions.append(button('Ik heb het origineel gecontroleerd',function(){confirmDocumentAnomaly();requestAnimationFrame(schedule)},'btn primary mobile-flow-action'));
    }else if(['currency','exchangeRateToEur','vatLines','vatTreatmentChoice'].includes(field)){
      actions.append(button('Aanpassen',function(){showFullReview(flow,issue)},'btn primary mobile-flow-action'));
    }else if(!empty){
      actions.append(button('Ja, klopt',function(){confirmReviewIssue(flow,issue)},'btn primary mobile-flow-action'));
    }else{
      // An empty field has nothing to confirm: the user fills it and then goes on.
      flow.dataset.mobileHoldField=field;
      actions.append(button('Volgende',function(){
        if(!String(input?.value||'').trim()){input?.focus();return}
        delete flow.dataset.mobileHoldField;flow.dataset.mobileIssueSignature='';schedule();
      },'btn primary mobile-flow-action'));
    }
    if(field!=='confirmDuplicate')more.append(button('Bekijk document',function(){toggleDocumentOriginal(true)},'btn mobile-flow-action'));
    if(field!=='confirmDuplicate')more.append(button('Alle gegevens',function(){showFullReview(flow,issue)},'btn mobile-flow-action'));
    if(more.childElementCount)actions.append(more);
    var form=flow.querySelector('#pdfImportForm');
    if(form)form.after(actions);else shell.append(actions);
  }

  function enhance(){
    queued=false;if(!media.matches)return;
    var modalRoot=document.getElementById('modalRoot');
    if(modalRoot){contactFlow(modalRoot);invoiceFlow(modalRoot);simpleReview(modalRoot)}
    document.querySelectorAll('#invoiceForm[data-mobile-invoice-flow]').forEach(enhanceInvoiceRows);
    document.querySelectorAll('#contactForm[data-mobile-customer-flow]').forEach(function(form){
      var card=form.closest('.modal')?.querySelector('.mobile-customer-company-card');if(card)updateContactCompanyCard(form,card);
    });
  }
  function schedule(){if(!queued){queued=true;queueMicrotask(enhance)}}

  var originalSaveContact=window.saveContact;
  if(typeof originalSaveContact==='function'){
    window.saveContact=function(id){
      var resume=invoiceResume&&media.matches&&!id?invoiceResume:null;
      var beforeCount=(state.contacts||[]).length;
      var result=originalSaveContact.apply(this,arguments);
      if(resume){
        var stillOpen=document.getElementById('contactForm');
        if(!stillOpen&&(state.contacts||[]).length>beforeCount){
          var created=(state.contacts||[]).find(function(c){return !resume.before.has(c.id)&&c.type==='customer'});
          invoiceResume=null;
          if(created){
            var draft=resume.draft;draft.customerId=created.id;draft.customer=created;
            nextInvoiceStep=2;
            setTimeout(function(){newInvoice(true);setTimeout(function(){fillInvoiceFormFromData(draft);schedule()},0)},0);
          }
        }
      }
      return result;
    };
  }

  function restoreDesktop(){
    mobileIssueReviewRequested=false;
    restoreReviewPages(document.querySelector('.document-review-flow.two-step-review'));
    moves.reverse().forEach(function(item){if(item.marker.isConnected&&item.el){delete item.el.dataset.mobileFlowMoved;item.marker.replaceWith(item.el)}});moves=[];
    textChanges.forEach(function(item){if(item.el?.isConnected){item.el.textContent=item.text;delete item.el.dataset.mobileFlowTextSaved}});textChanges=[];
    document.querySelectorAll('.mobile-document-groups,.mobile-customer-company-card,.mobile-contact-manual,.mobile-contact-more,.mobile-invoice-progress,.mobile-invoice-step,.mobile-single-issue-review,.mobile-single-issue-actions,.mobile-vat-choice').forEach(function(el){el.remove()});
    document.querySelectorAll('[data-mobile-customer-flow]').forEach(function(form){delete form.dataset.mobileCustomerFlow;delete form.dataset.mobileManual;delete form.dataset.mobileMore;delete form.dataset.mobileKvkSelected});
    document.querySelectorAll('[data-mobile-invoice-flow]').forEach(function(form){delete form.dataset.mobileInvoiceFlow;delete form.dataset.mobileInvoiceStep});
    document.querySelectorAll('.mobile-invoice-original-foot').forEach(function(el){el.classList.remove('mobile-invoice-original-foot')});
    document.querySelectorAll('.mobile-vat-native-select,.mobile-invoice-unit-label').forEach(function(el){el.classList.remove('mobile-vat-native-select','mobile-invoice-unit-label')});
    document.querySelectorAll('[data-mobile-simple-review]').forEach(function(flow){delete flow.dataset.mobileSimpleReview;delete flow.dataset.mobileIssueSignature;delete flow.dataset.mobileHoldField});
  }
  function install(){
    ['content','modalRoot'].forEach(function(id){var root=document.getElementById(id);if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true})});
    media.addEventListener('change',function(){if(media.matches)schedule();else restoreDesktop()});
    document.addEventListener('change',function(event){
      if(!media.matches)return;
      if(event.target.matches('#invoiceLines [data-k="vat"]'))syncVatChoices(event.target.closest('.line-item'));
      if(event.target.matches('#pdfImportForm input,#pdfImportForm select'))requestAnimationFrame(schedule);
    },true);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();