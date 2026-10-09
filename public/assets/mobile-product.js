/* Mobile presentation only. Existing state, validators and actions remain authoritative. */
(function () {
  'use strict';
  var media = matchMedia('(max-width:820px)');
  var queued = false;
  var nextLabel = 0;
  var moved = [];
  var copiedText = [];

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, action, className) {
    var node = element('button', className || 'btn', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function disclosure(parent, nodes, title) {
    nodes = nodes.filter(Boolean);
    if (!nodes.length) return;
    var details = element('details', 'mobile-disclosure');
    var body = element('div', 'mobile-disclosure-body');
    details.append(element('summary', '', title), body);
    parent.insertBefore(details, nodes[0]);
    nodes.forEach(function (node) {
      var marker = document.createComment('mobile-original-position');
      node.before(marker);
      moved.push({node: node, marker: marker});
      body.append(node);
    });
    return details;
  }
  function metadata(node, text) {
    if (text) node.append(element('span', 'mobile-card-metadata', text));
  }
  function confirmUnlink(id) {
    modal('Transactie ontkoppelen?', '<p>De transactie en de bijbehorende factuur of kosten blijven bewaard.</p>',
      '<button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" type="button" id="mobileConfirmUnlink">Ontkoppelen</button>');
    document.getElementById('mobileConfirmUnlink').addEventListener('click',function(){closeModal();unmatchTransaction(id)});
  }
  function documentStatus(item) {
    var status=(item.verification && item.verification.status)||item.verificationStatus;
    var processing=String(item.processingState||'');
    if(/failed|error/.test(processing))return '<span class="badge bad">Mislukt</span>';
    if(['received','queued','processing','validating','uploading','pending'].includes(processing))return '<span class="badge info">Verwerken</span>';
    if(typeof documentReviewJob==='function'&&documentReviewJob(item))return '<span class="badge warn">Controle nodig</span>';
    if(status==='needs_review'||status==='technical_error'||['needs_review','review_required'].includes(processing))return '<span class="badge warn">Controle nodig</span>';
    if(status==='pending'||status==='running')return '<span class="badge info">Controle loopt</span>';
    if(status==='verified'||item.fileId)return '<span class="badge good">Klaar</span>';
    return '<span class="badge">Geen bestand</span>';
  }
  // A document that still needs a check opens that check; any other document opens the file.
  function documentOpenAction(item) {
    var job = typeof documentReviewJob === 'function' ? documentReviewJob(item) : null;
    if (job) return function () { openPersistentDocumentReview(job.id); };
    return item.fileId ? function () { openDocumentPreview(item.id); } : null;
  }
  function row(title, amount, detail, status, action, actionText, lead) {
    var wrapper = element('div', 'mobile-card-row');
    var main = action ? button('', action, 'mobile-card-main') : element('div', 'mobile-card-main');
    if (lead) {
      // Trusted avatar/icon markup from the app's own partyAvatarHtml/expenseCategoryIconHtml.
      var holder = document.createElement('span');
      holder.innerHTML = lead;
      if (holder.firstChild) { main.append(holder.firstChild); main.classList.add('has-lead'); }
    }
    main.append(element('strong', 'mobile-card-title', title));
    metadata(main, detail);
    var side = element('div', 'mobile-card-side');
    if (amount != null) side.append(element('strong', 'mobile-card-value', amount));
    if (status) {
      var badge = element('span');
      badge.innerHTML = status; // Only trusted existing statusBadge/documentVerificationBadge output.
      side.append(badge);
    }
    if (actionText && action) side.append(button(actionText, action, 'btn small'));
    wrapper.append(main, side);
    return wrapper;
  }
  function dayGroupLabel(day) {
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var d = new Date(day + 'T00:00:00'), diff = Math.round((today - d) / 864e5);
    if (diff <= 0) return 'Vandaag';
    if (diff === 1) return 'Gisteren';
    var weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    if (d >= weekStart) return 'Eerder deze week';
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) return 'Eerder deze maand';
    var month = new Intl.DateTimeFormat('nl-NL', {month: 'long'}).format(d);
    month = month.charAt(0).toUpperCase() + month.slice(1);
    return d.getFullYear() === today.getFullYear() ? month : month + ' ' + d.getFullYear();
  }
  function mobileLists(root) {
    var selector = {invoices:'.mobile-invoices',expenses:'.mobile-expenses',bank:'.mobile-bank',income:'.mobile-bank',outgoings:'.mobile-bank',documents:'.mobile-documents'}[page];
    if (!selector) return;
    var table = root.querySelector(selector);
    if (!table || table.dataset.mobileCards) return;
    var items = page === 'income' ? directionalBankRows('income') : page === 'outgoings' ? directionalBankRows('out') : getListRows(page);
    if (!items.length) return; // Keep existing authoritative empty state and CTA.
    var list = element('div', 'mobile-card-list');
    list.setAttribute('role', 'list');
    // Newest first: show calm day headers ("Vandaag", "Gisteren", ...) like a bank app.
    var dayOf = function (item) { return String((page === 'invoices' ? item.issueDate : item.date) || '').slice(0, 10); };
    var days = items.map(dayOf);
    var grouped = items.length > 1 && days.every(function (d, i) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && (i === 0 || d <= days[i - 1]); });
    var lastGroup = '';
    items.forEach(function (item) {
      var entry;
      if (grouped) {
        var label = dayGroupLabel(dayOf(item));
        if (label !== lastGroup) {
          var header = element('div', 'mobile-card-group', label);
          header.setAttribute('role', 'listitem');
          list.append(header);
          lastGroup = label;
        }
      }
      if (page === 'invoices') {
        entry = row(getContact(item.customerId).name || 'Klant', money(invoiceGross(item)),
          (item.number || 'Concept') + ' · ' + (invoiceEffectiveStatus(item)==='paid' ? ((typeof invoicePaymentSummary==='function' && invoicePaymentSummary(item)) || dateNL(item.issueDate)) : 'Vervalt ' + dateNL(item.dueDate)),
          statusBadge(invoiceEffectiveStatus(item)), function () { viewInvoice(item.id); }, null,
          typeof partyAvatarHtml === 'function' ? partyAvatarHtml(getContact(item.customerId).name, typeof partyLogoDomain === 'function' ? partyLogoDomain(getContact(item.customerId)) : '') : '');
        // 63. Money coming in: "+ € x" in green (credit notes stay as they are).
        if (item.kind !== 'credit' && invoiceGross(item) > 0) {
          var invoiceValue = entry.querySelector('.mobile-card-value');
          if (invoiceValue) { invoiceValue.textContent = '+ ' + invoiceValue.textContent; invoiceValue.classList.add('money-positive'); }
        }
        var actions = button('', function () { invoiceActions(item.id); }, 'icon-btn');
        actions.innerHTML = icon('i-more');
        actions.setAttribute('aria-label', 'Factuuracties voor ' + (item.number || 'concept'));
        entry.lastChild.append(actions);
        var paidPart = typeof invoicePaidAmount === 'function' ? invoicePaidAmount(item) : 0, gross = invoiceGross(item);
        if (paidPart > 0.02 && gross - paidPart > 0.02) {
          // Partly paid: "€ x van € y binnen" with a thin bar.
          metadata(entry.firstChild, money(paidPart) + ' van ' + money(gross) + ' binnen');
          var bar = element('span', 'mobile-paid-bar');
          bar.setAttribute('aria-hidden', 'true');
          var fill = element('i');
          fill.style.width = Math.min(100, Math.round(paidPart / gross * 100)) + '%';
          bar.append(fill);
          entry.firstChild.append(bar);
        }
      } else if (page === 'expenses') {
        entry = row(item.vendor || 'Leverancier', money(expenseGross(item)), dateNL(item.date) + ' · ' + (item.category || 'Categorie controleren'),
          '', function () { expenseActions(item.id); }, null,
          typeof expenseLeadHtml === 'function' ? expenseLeadHtml(item) : '');
        metadata(entry.firstChild, 'Btw ' + expenseVatRateLabel(item));
      } else if (page === 'documents') {
        var docLink = typeof listLinkedDocumentInfo === 'function' && item.linkedId ? listLinkedDocumentInfo(item) : null;
        entry = row(item.name || 'Document', null, [dateNL(item.date), typeof documentTypeLabel === 'function' ? documentTypeLabel(item.type) : (item.type || 'Document')].join(' · '), documentStatus(item),
          documentOpenAction(item));
        if (docLink) metadata(entry.firstChild, [docLink.party, docLink.number].filter(Boolean).join(' · '));
        var originalRow = Array.from(table.querySelectorAll('tbody tr')).find(function (_, index) { return items[index] === item; });
        var originalActions = originalRow && originalRow.lastElementChild;
        if (originalActions) {
          // Move the exact existing controls so menu closures and review/retry behavior survive.
          // "Controleren" is left out: tapping the card already opens the check.
          var controls = Array.from(originalActions.children).filter(function (node) { return node.tagName==='BUTTON' && !/openPersistentDocumentReview/.test(node.getAttribute('onclick')||''); });
          controls.forEach(function (node) {
            var marker=document.createComment('mobile-original-action');node.before(marker);moved.push({node:node,marker:marker});
            entry.lastChild.append(node);
          });
        }
      } else {
        var value = Number(item.amount || 0);
        var linked = listTransactionLinkText(item);
        entry = row(item.description || 'Banktransactie', (value >= 0 ? '+ ' : '− ') + money(Math.abs(value)), dateNL(item.date), statusBadge(item.status), null);
        entry.lastChild.firstChild.classList.add(value >= 0 ? 'money-positive' : 'money-negative');
        metadata(entry.firstChild, linked);
        if (item.status === 'unmatched' && typeof bankSuggestionText === 'function') metadata(entry.firstChild, bankSuggestionText(item));
        var bankActions = element('div', 'mobile-card-actions');
        if (item.status === 'unmatched') bankActions.append(button(item.matchSuggestion ? 'Controleren' : 'Koppelen', function () { matchTransaction(item.id); }, 'btn small'));
        else bankActions.append(button('Ontkoppelen', function () { confirmUnlink(item.id); }, 'btn small'));
        if (page === 'bank' && typeof requestTransactionDelete === 'function') {
          var remove = button('', function () { requestTransactionDelete(item.id); }, 'icon-btn bank-delete-action');
          remove.innerHTML = icon('i-trash');
          remove.setAttribute('aria-label', 'Transactie verwijderen: ' + (item.description || 'banktransactie'));
          bankActions.append(remove);
        }
        entry.lastChild.append(bankActions);
      }
      entry.setAttribute('role', 'listitem');
      list.append(entry);
    });
    table.dataset.mobileCards = '1';
    table.closest('.mobile-stack-wrap').before(list);
  }
  function dashboard(root) {
    if (page !== 'dashboard') return;
    var administration = root.querySelector('.dashboard-summary-card');
    if (administration && !administration.querySelector('.mobile-admin-progress')) {
      var text = administration.querySelector('.dashboard-summary-value').textContent;
      if (/%$/.test(text)) {
        var progress = element('div', 'progress mobile-admin-progress');
        progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Bankregels verwerkt');
        var percentage = Math.max(0,Math.min(100,parseInt(text,10)));
        progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-valuenow',String(percentage));
        var fill=element('span');fill.style.width=percentage+'%';progress.append(fill);administration.append(progress);
      }
    }
    var receiving = root.querySelector('.dashboard-summary-card:nth-child(2)');
    if (receiving && !receiving.dataset.mobileFilter) {
      receiving.dataset.mobileFilter='1';
      receiving.addEventListener('click',function(event){
        if(!media.matches)return;
        event.stopImmediatePropagation();navigateWithFilter('invoices','status','open');
      },true);
    }
  }
  function settings(root) {
    if (page !== 'settings') return;
    var section=root.querySelector('.settings-section');
    if (!section || section.dataset.mobileSettings) return;
    section.dataset.mobileSettings='index';
    var groups=Array.from(section.querySelectorAll(':scope>.settings-group'));
    var index=element('div','mobile-settings-index');
    var back=button('Terug naar Instellingen',function(){
      section.dataset.mobileSettings='index';
      groups.forEach(function(group){group.classList.remove('mobile-settings-active')});
      index.querySelector('button').focus();
    },'btn mobile-settings-back');
    var titles=['Bedrijfsgegevens','Factuurinstellingen','Boekhouding','Beveiliging en privacy','Data en export','Abonnement en account','Account verwijderen'];
    groups.forEach(function(group,i){
      var title=group.querySelector('h2');
      var name=titles[i] || (title?title.textContent:'Instellingen');
      var item=button('',function(){
        if(i===0){navigate('profile');return;}
        section.dataset.mobileSettings='detail';
        groups.forEach(function(other){other.classList.toggle('mobile-settings-active',other===group)});
        back.focus();
      },'settings-nav-item');
      var copy=element('span','settings-nav-copy');copy.append(element('strong','',name));
      var descriptions=['Naam, adres en betaalgegevens','Factuurlayout en e-mailbericht','Fiscale instellingen en reserves','Je account beschermen','Download of herstel je administratie','Je plan en account beheren','Acties met extra bevestiging'];
      copy.append(element('span','',descriptions[i] || 'Bekijk en wijzig je instellingen'));
      var chevron=element('span','settings-nav-chevron','›');chevron.setAttribute('aria-hidden','true');item.append(copy,chevron);index.append(item);
    });
    section.prepend(back,index);
  }
  function vat(root) {
    if (page !== 'vat') return;
    var kpis=root.querySelector('.product-kpis');
    if(!kpis||kpis.dataset.mobileVat)return;
    kpis.dataset.mobileVat='1';
    var total=root.querySelector('.summary-lines .total-line.grand');
    var label=root.querySelector('.product-kpis .product-kpi-label>span:last-child'),value=root.querySelector('.product-kpis .metric-value');
    if(total&&label&&value){
      [label,value].forEach(function(node){copiedText.push({node:node,text:node.textContent})});
      label.textContent=total.querySelector('span').textContent;value.textContent=total.querySelector('strong').textContent;
    }
    if(total){
      var details=element('details','mobile-disclosure mobile-vat-details');
      var body=element('div','mobile-disclosure-body');details.append(element('summary','','Btw per tarief'),body);
      // Same period and invoice selection as renderVat, so the split matches the total above.
      var range=typeof vatPeriodRange==="function"?vatPeriodRange():financialPeriodRange();
      var invoices=state.invoices.filter(function(invoice){return invoice.status!=='draft'&&invoiceEffectiveStatus(invoice)!=='cancelled'&&financialPeriodContains(invoice.issueDate,range)});
      [21,9,0].forEach(function(rate){
        var sum=invoices.reduce(function(amount,invoice){return roundMoney(amount+Number(invoiceVatBreakdown(invoice)[rate]||0))},0);
        if(rate===0&&sum===0)return;
        var line=element('div','total-line');line.append(element('span','','Btw op omzet '+rate+'%'),element('strong','',money(sum)));body.append(line);
      });
      total.closest('.card').append(details);
    }
    var review=dashboardAttentionItems().filter(function(item){return /document|bon/i.test(item.key+' '+item.title)});
    // Existing attention entries supply their own authorized destination/action.
    if(review.length){
      var action=button('Documenten controleren',function(){review[0].action()},'btn mobile-vat-attention');
      root.querySelector('.product-kpis')?.after(action);
    }
  }
  function forms(root) {
    root.querySelectorAll('.field').forEach(function(field){
      var input=field.querySelector('input,select,textarea'),label=field.querySelector('label');
      if(input&&label&&!label.htmlFor&&!label.contains(input)){
        if(!input.id)input.id='mobile-field-'+(++nextLabel);
        label.htmlFor=input.id;
        input.dataset.mobileLabel='1';label.dataset.mobileLabel='1';
      }
      if(input&&input.type==='number'&&!input.inputMode){input.inputMode=input.step&&input.step!=='1'?'decimal':'numeric';input.dataset.mobileInputMode='1'}
    });
    var invoice=root.querySelector('#invoiceForm');
    if(invoice&&!invoice.dataset.mobileForm){
      invoice.dataset.mobileForm='1';
      var sections=Array.from(invoice.querySelectorAll(':scope>.invoice-editor-section'));
      // Same fields and handlers, ordered as customer -> lines -> dates/options -> totals.
      if(sections[1]&&sections[2]){
        var marker=document.createComment('mobile-original-section');sections[2].before(marker);moved.push({node:sections[2],marker:marker});sections[1].before(sections[2]);
        disclosure(invoice,[sections[1]],'Datum en betaling');
      }
      var customer=invoice.querySelector('#newCustomerFields .form-grid');
      if(customer){
        var optional=['newCustomerContact','newCustomerPhone','newCustomerKvk','newCustomerVat'].map(function(name){return customer.querySelector('[name="'+name+'"]')?.closest('.field')});
        disclosure(customer,optional,'Meer klantgegevens');
      }
    }
    var expense=root.querySelector('#expenseForm');
    if(expense&&!expense.dataset.mobileForm){
      expense.dataset.mobileForm='1';
      disclosure(expense,['paymentMethod','notes'].map(function(name){return expense.querySelector('[name="'+name+'"]')?.closest('.field')}),'Meer gegevens');
    }
    root.querySelectorAll('.line-item>.icon-btn').forEach(function(control){
      if(!control.hasAttribute('aria-label')||control.getAttribute('aria-label')==='Acties'){
        control.dataset.mobileAria=control.getAttribute('aria-label')||'';control.setAttribute('aria-label','Factuurregel verwijderen');
      }
    });
    root.querySelectorAll('.field-error').forEach(function(input){var details=input.closest('details');if(details)details.open=true});
    // Invalid fields inside collapsed optional sections must remain reachable.
  }
  function enhance() {
    queued=false;
    if(!media.matches)return;
    var content=document.getElementById('content'),modal=document.getElementById('modalRoot');
    moved=moved.filter(function(item){return item.marker.isConnected&&item.node.isConnected});
    copiedText=copiedText.filter(function(item){return item.node.isConnected});
    if(content){mobileLists(content);dashboard(content);settings(content);vat(content);forms(content)}
    if(modal)forms(modal);
  }
  function schedule() {if(!queued){queued=true;queueMicrotask(enhance)}}
  function restoreDesktop() {
    moved.reverse().forEach(function(item){if(item.marker.isConnected){item.marker.replaceWith(item.node)}});moved=[];
    copiedText.forEach(function(item){if(item.node.isConnected)item.node.textContent=item.text});copiedText=[];
    document.querySelectorAll('.mobile-disclosure,.mobile-card-list,.mobile-settings-index,.mobile-settings-back,.mobile-admin-progress,.mobile-vat-attention').forEach(function(node){node.remove()});
    document.querySelectorAll('[data-mobile-vat]').forEach(function(node){delete node.dataset.mobileVat});
    document.querySelectorAll('[data-mobile-cards],[data-mobile-form],[data-mobile-settings]').forEach(function(node){delete node.dataset.mobileCards;delete node.dataset.mobileForm;delete node.dataset.mobileSettings});
    document.querySelectorAll('.mobile-settings-active').forEach(function(node){node.classList.remove('mobile-settings-active')});
    document.querySelectorAll('[data-mobile-label]').forEach(function(node){
      if(node.tagName==='LABEL')node.removeAttribute('for');else if(node.id.startsWith('mobile-field-'))node.removeAttribute('id');
      delete node.dataset.mobileLabel;
    });
    document.querySelectorAll('[data-mobile-input-mode]').forEach(function(node){node.removeAttribute('inputmode');delete node.dataset.mobileInputMode});
    document.querySelectorAll('[data-mobile-aria]').forEach(function(node){if(node.dataset.mobileAria)node.setAttribute('aria-label',node.dataset.mobileAria);else node.removeAttribute('aria-label');delete node.dataset.mobileAria});
    document.documentElement.style.removeProperty('--mobile-viewport-height');
  }
  function viewport() {
    if(media.matches&&window.visualViewport)document.documentElement.style.setProperty('--mobile-viewport-height',Math.round(visualViewport.height)+'px');
  }
  function install() {
    ['content','modalRoot'].forEach(function(id){var root=document.getElementById(id);if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true})});
    media.addEventListener('change',function(){if(media.matches){viewport();schedule()}else restoreDesktop()});
    window.visualViewport?.addEventListener('resize',viewport);
    document.addEventListener('focusin',function(event){
      if(!media.matches||!event.target.matches('input,select,textarea'))return;
      requestAnimationFrame(function(){event.target.scrollIntoView({block:'nearest',behavior:'auto'})});
    });
    document.addEventListener('invalid',function(event){if(media.matches){var details=event.target.closest('details');if(details)details.open=true}},true);
    viewport();schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
