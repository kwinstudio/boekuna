/* BOEKUNA vertrouwen — what customers of other bookkeeping apps complain about, done right (Kwin 2026-11-01,
   "slechte reviews concurrenten", picks 1-11). Read from the 1- and 2-star Trustpilot reviews of Moneybird,
   Rompslomp, Tellow, e-Boekhouden, SnelStart, Jortt and Informer.
   1  Abonnement says what you pay, when, and promises 60 days' notice before a price rise.
   2  Opzeggen in two taps: first take everything with you, then straight to the cancel step.
   3  No surprise limits: a calm heads-up at 80% of the monthly smart scans; uploading and typing never stop.
   5  Kosten: choose several and change the category or btw, or remove them, in one go.
   7  Btw: "Om na te kijken" before you file (double receipt, invoice without btw, btw not filled in).
   8  Overzicht: when the last bank file is three weeks old, a reminder to read in the new one.
   9  Overzicht: an invoice that was made but never sent to the customer.
   10 Overzicht: a failed subscription payment, without a fine; you keep working for 14 days.
   4 (a person answers) lives in feedback.js and 6 (why this category) in handig.js.
   This file only adds and presents; amounts and btw are changed with the app's own functions. */
(function(){
  'use strict';
  var DAY=86400000;
  // Only invoices made from this release on: older ones may have been sent outside Boekuna.
  var SINCE='2026-11-01';
  function g(name){try{switch(name){
    case 'state':return state;case 'page':return page;case 'billing':return billingSnapshot;
    case 'money':return money;case 'categories':return EXPENSE_CATEGORIES;case 'edge':return EDGE_BASE;
  }}catch(e){}return undefined}
  function fn(name){return typeof window[name]==='function'?window[name]:null}
  function call(name){var f=fn(name);return f?f.apply(null,[].slice.call(arguments,1)):undefined}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function eur(v){var m=g('money');return m?m(v):'€ '+Number(v||0).toFixed(2).replace('.',',')}
  function native(){return !!call('isNativeStoreShell')}
  function toast(msg){call('toast',msg)}
  function plural(n,one,many){return n+' '+(n===1?one:many)}
  function dayNL(iso){var d=new Date(String(iso||'')+'T12:00:00');return isNaN(d)?String(iso||''):d.toLocaleDateString('nl-NL',{day:'numeric',month:'long'})}

  /* ---------- 1, 2, 3. Abonnement: what you pay, the promise, cancelling ---------- */
  function billingFacts(){
    var b=g('billing');if(!b)return null;
    var d=b.details||{},plan=String(b.plan||'free'),status=String(b.status||'free');
    var paid=String(b.entitlement_status||'')==='paid'||(plan!=='free'&&status==='active');
    var source=String(b.access_source||'');
    var stripe=paid&&source!=='tester_code'&&source!=='trial'&&source!=='internal';
    var canManage=b.can_manage_subscription===true&&['trialing','active','past_due','unpaid','paused','incomplete'].indexOf(status)>=0&&!native();
    return {b:b,plan:plan,status:status,paid:paid,stripe:stripe,canManage:canManage,interval:String(d.billing_interval||''),amount:d.unit_amount_cents==null?null:Number(d.unit_amount_cents),end:b.current_period_end,cancelling:!!b.cancel_at_period_end};
  }
  function promiseHtml(f){
    var lines=[];
    if(f&&f.stripe&&f.amount!=null&&f.interval&&!f.cancelling){
      lines.push('<strong>Je betaalt '+esc(call('euroCents',f.amount)||'')+' per '+(f.interval==='year'?'jaar':'maand')+'.</strong>'+(f.end?' Je volgende betaling is op '+esc(call('billingDate',f.end)||'')+'.':''));
    }
    if(f&&f.stripe)lines.push('Gaat je prijs omhoog, dan hoor je dat minstens 60 dagen van tevoren. Je kunt dan kosteloos opzeggen.');
    lines.push('Geen limiet op facturen, geen extra kosten en geen boete als een betaling niet lukt.');
    return '<div class="vk-promise" data-vk="promise"><p class="vk-promise-title">Onze belofte</p><ul>'+lines.map(function(l){return '<li>'+l+'</li>'}).join('')+'</ul>'
      +(f&&f.canManage&&!f.cancelling?'<button type="button" class="link-btn vk-cancel-link" onclick="BoekunaVertrouwen.cancel()">Opzeggen</button>':'')+'</div>';
  }
  var renderBillingCard=fn('renderBillingCard');
  if(renderBillingCard){
    window.renderBillingCard=function(){
      var html=renderBillingCard.apply(this,arguments);
      if(native()||!g('billing')||typeof html!=='string'||html.indexOf('id="billingCard"')<0||html.indexOf('DEV MODE')>=0)return html;
      var at=html.lastIndexOf('</div>');
      return at<0?html:html.slice(0,at)+promiseHtml(billingFacts())+html.slice(at);
    };
  }
  function cancel(){
    var f=billingFacts();if(!f||!f.canManage){call('openBillingPortal');return}
    var name=call('billingPlanLabel',f.plan)||'je pakket',until=f.end?call('billingDate',f.end):'';
    var dl=function(label,action){return '<button type="button" class="btn vk-dl" onclick="'+action+'">'+esc(label)+'</button>'};
    call('modal','Opzeggen',
      '<div class="vk-cancel">'
      +'<p class="vk-cancel-step"><span>1</span> Neem eerst alles mee. Dit blijft van jou.</p>'
      +'<div class="vk-dl-grid">'+dl('Alles (back-up)','exportBackup()')+dl('Facturen · CSV','exportInvoicesCSV()')+dl('Kosten · CSV','exportExpensesCSV()')+(fn('exportAuditfileXAF')?dl('Auditfile','exportAuditfileXAF()'):'')+'</div>'
      +'<p class="vk-cancel-step"><span>2</span> Zeg op. Zo gaat het verder:</p>'
      +'<ul class="vk-cancel-facts"><li>Je houdt '+esc(name)+(until?' tot '+esc(until):' tot het einde van je betaalde periode')+'.</li><li>Daarna ga je naar het gratis Start. Factureren blijft gewoon werken.</li><li>Je gegevens blijven bewaard. Je kunt altijd inloggen en alles downloaden.</li><li>Er komen geen kosten meer bij.</li></ul>'
      +'</div>',
      '<button class="btn" onclick="closeModal()">Toch blijven</button><button class="btn danger vk-cancel-go" id="vkCancelGo" onclick="BoekunaVertrouwen.cancelGo()">Opzeggen</button>');
  }
  var cancelling=false;
  async function cancelGo(){
    if(cancelling)return;cancelling=true;
    var btn=document.getElementById('vkCancelGo');if(btn){btn.disabled=true;btn.textContent='Even geduld…'}
    try{
      var res=await window.fetchWithAuthRetry(g('edge')+'/billing-portal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({flow:'cancel'})});
      var body=await res.json().catch(function(){return {}});
      if(!res.ok||!body||!body.url)throw new Error(body&&body.error||'Opzeggen kon niet worden geopend.');
      location.href=body.url;
    }catch(err){
      toast(err&&err.message||'Opzeggen kon niet worden geopend.');
      if(btn&&btn.isConnected){btn.disabled=false;btn.textContent='Opzeggen'}
    }finally{cancelling=false}
  }

  /* ---------- 3, 8, 9, 10. Calm to-dos on the overview ---------- */
  function lastBankImport(st){
    var at=st.meta&&st.meta.lastBankImportAt||'';
    (st.audit||[]).some(function(a){if(a&&a.action==='Bankbestand geïmporteerd'){if(String(a.at||'')>at)at=String(a.at||'');return true}return false});
    return at;
  }
  function unsentInvoices(st){
    var now=Date.now();
    return (st.invoices||[]).filter(function(i){
      if(!i||i.status==='draft'||i.status==='cancelled'||i.lastSentAt||i.kind==='credit'||String(i.issueDate||'')<SINCE||(i.sendHistory&&i.sendHistory.length))return false;
      var made=Date.parse(i.issueDate||'');if(!isFinite(made))return false;
      var age=now-made;if(age<DAY||age>21*DAY)return false;
      var open=fn('invoiceOutstanding');return open?open(i)>0.004:true;
    });
  }
  function extraItems(){
    var st=g('state'),items=[];if(!st)return items;
    var f=billingFacts();
    // 10. A failed payment: no fine, no lock-out, one calm line.
    if(f&&(f.status==='past_due'||f.status==='unpaid')&&!native()){
      items.push({key:'payment-failed',priority:2,tone:'review',icon:'•',title:'Betaling van je abonnement is niet gelukt',detail:f.status==='past_due'?'Geen boete. Je kunt 14 dagen gewoon doorwerken.':'Geen boete. Je gegevens blijven bewaard.',cta:'Opnieuw proberen',action:function(){call('openBillingPortal')}});
    }
    // 3. Smart scans: a heads-up at 80%, never a block.
    if(f&&f.paid){
      var limit=f.b.monthly_limit==null?null:Number(f.b.monthly_limit),used=Number(f.b.used||0);
      if(limit&&used>=Math.ceil(limit*0.8)){
        var left=Math.max(0,limit-used);
        items.push({key:'scan-limit',priority:3,tone:'soon',icon:'•',title:left?'Nog '+plural(left,'slimme scan','slimme scans')+' deze maand':'Slimme scans zijn op voor deze maand',detail:'Bonnen uploaden en zelf invullen kan altijd',cta:'Bekijken',action:function(){if(fn('openSettingsSection'))window.openSettingsSection('billing');else call('navigate','settings')}});
      }
    }
    // 8. Bank file: a reminder when the last one is three weeks old (only for people who read in bank files).
    if((st.transactions||[]).length&&(!fn('planAllows')||window.planAllows(1))){
      var last=lastBankImport(st),days=last?Math.floor((Date.now()-Date.parse(last))/DAY):null;
      if(days!=null&&days>=21){
        items.push({key:'bank-import',priority:3,tone:'soon',icon:'↔',title:'Laatste bankimport: '+days+' dagen geleden',detail:'Lees je nieuwe afschrift in, dan klopt alles weer',cta:'Inlezen',action:function(){if(fn('quickImportBank'))window.quickImportBank();else call('navigate','bank')}});
      }
    }
    // 9. Made but never sent to the customer.
    var unsent=unsentInvoices(st);
    if(unsent.length){
      var first=unsent[0],contact=fn('getContact')?window.getContact(first.customerId):null;
      items.push({key:'invoice-unsent',priority:2,tone:'review',icon:'✉',title:unsent.length===1?'Factuur '+(first.number||'')+' is nog niet verstuurd':plural(unsent.length,'factuur','facturen')+' nog niet verstuurd',detail:(unsent.length===1&&contact&&contact.name?contact.name+' · ':'')+'nog niet via Boekuna gemaild of gedeeld',cta:'Versturen',action:function(){if(unsent.length===1&&fn('viewInvoice'))window.viewInvoice(first.id);else call('navigate','invoices')}});
    }
    return items;
  }
  var attentionNow=fn('dashboardAttentionItemsNow');
  if(attentionNow){
    window.dashboardAttentionItemsNow=function(){
      var items=attentionNow.apply(this,arguments);
      try{
        var hidden=(g('state')||{}).meta&&g('state').meta.attentionHidden||[];
        extraItems().forEach(function(it){if(hidden.indexOf(it.key)<0&&!items.some(function(x){return x.key===it.key}))items.push(it)});
        items.sort(function(a,b){return a.priority-b.priority});
      }catch(e){console.warn('vertrouwen',e)}
      return items;
    };
  }
  var confirmBankImport=fn('confirmBankImport');
  if(confirmBankImport){
    window.confirmBankImport=function(){
      var st=g('state');if(st){st.meta=st.meta||{};st.meta.lastBankImportAt=new Date().toISOString()}
      return confirmBankImport.apply(this,arguments);
    };
  }

  /* ---------- 7. Btw: om na te kijken before you file ---------- */
  function inPeriod(date,period){var f=fn('financialPeriodContains');return f?f(date,period):true}
  function vatChecks(){
    var st=g('state');if(!st||!fn('vatPeriodRange'))return [];
    var period=window.vatPeriodRange(),checks=[];
    var exps=(st.expenses||[]).filter(function(e){return !e.correctedAt&&!e.correctionFor&&inPeriod(e.date,period)});
    var gross=fn('expenseGross')||function(e){return Number(e.gross||0)};
    var seen={},doubles=[];
    exps.forEach(function(e){var k=String(e.vendor||'').trim().toLowerCase()+'|'+e.date+'|'+Math.round(gross(e)*100);if(!String(e.vendor||'').trim())return;if(seen[k]){if(doubles.indexOf(seen[k])<0)doubles.push(seen[k])}else seen[k]=e});
    doubles.forEach(function(e){checks.push({title:'Dubbele bon?',detail:esc(e.vendor)+' · '+eur(gross(e))+' staat 2 keer op '+esc(dayNL(e.date)),act:"navigate('expenses')"})});
    var unknown=exps.filter(function(e){return e.vatUnknown});
    if(unknown.length)checks.push({title:plural(unknown.length,'bon','bonnen')+' zonder btw-keuze',detail:'Vul in hoeveel btw erop staat, anders telt hij niet mee',act:"navigate('expenses')"});
    var company=st.company||{};
    if(!company.kor){
      var invs=(st.invoices||[]).filter(function(i){return fn('invoiceCounts')&&window.invoiceCounts(i)&&inPeriod(i.issueDate,period)});
      var zero=invs.filter(function(i){var t=String(i.taxTreatment||'standard');return t==='standard'&&fn('invoiceVat')&&fn('invoiceNet')&&Math.abs(window.invoiceVat(i))<0.005&&window.invoiceNet(i)>0});
      zero.forEach(function(i){checks.push({title:'Factuur '+esc(i.number||'')+' zonder btw',detail:'Is dat goed? Bij verlegd of buitenland kies je dat op de factuur',act:"viewInvoice('"+esc(i.id)+"')"})});
      var sales=invs.reduce(function(s,i){return s+(fn('invoiceNet')?window.invoiceNet(i):0)},0);
      if(sales<-0.004)checks.push({title:'Je omzet is negatief',detail:'Meer creditfacturen dan facturen in deze periode. Klopt dat?',act:"navigate('invoices')"});
    }
    return checks.slice(0,6);
  }
  function vatChecksHtml(){
    var checks=vatChecks();
    var head='<section class="card vk-vat-checks" data-vk="vat-checks"><div class="section-head"><h2>'+(checks.length?'Om na te kijken':'Alles ziet er goed uit')+'</h2>'+(checks.length?'<span class="badge neutral">'+checks.length+'</span>':'')+'</div>';
    var list=checks.length?'<div class="vk-check-list">'+checks.map(function(c){return '<button type="button" class="vk-check" onclick="'+c.act+'"><strong>'+c.title+'</strong><span>'+c.detail+'</span></button>'}).join('')+'</div>':'<p class="vk-ok">Geen dubbele bonnen, geen facturen zonder btw en alle btw is ingevuld.</p>';
    return head+list+'<p class="vk-vat-note">Boekuna verstuurt je aangifte niet zelf. Vul deze bedragen in bij Mijn Belastingdienst en zet daarna hieronder het vinkje bij "Aangifte gedaan", zodat je zeker weet dat het gebeurd is.</p></section>';
  }

  var returnCard=fn('renderVatReturnCard');
  if(returnCard){
    window.renderVatReturnCard=function(){
      var html=returnCard.apply(this,arguments);
      try{return vatChecksHtml()+html}catch(e){console.warn('vertrouwen',e);return html}
    };
  }

  /* ---------- 5. Kosten: several at once ---------- */
  var picked=[],selecting=false;
  function expenseIdOf(el){
    var row=el.closest&&el.closest('[data-bk-expense]');if(row)return row.getAttribute('data-bk-expense');
    var tr=el.closest&&el.closest('#content tr');if(!tr)return '';
    var b=tr.querySelector('[onclick^="expenseActions("]');var m=b&&/expenseActions\('([^']+)'\)/.exec(b.getAttribute('onclick')||'');return m?m[1]:'';
  }
  function rowsOf(id){return [].slice.call(document.querySelectorAll('#content [data-bk-expense="'+CSS.escape(id)+'"],#content tr')).filter(function(r){return r.matches('[data-bk-expense]')||expenseIdOf(r)===id})}
  function expense(id){var st=g('state');return st?(st.expenses||[]).filter(function(e){return e.id===id})[0]:null}
  function paintPicks(){
    document.querySelectorAll('#content .vk-picked').forEach(function(r){r.classList.remove('vk-picked');r.removeAttribute('aria-selected')});
    picked.forEach(function(id){rowsOf(id).forEach(function(r){if(r.matches('[data-bk-expense]')||r.tagName==='TR'){r.classList.add('vk-picked');r.setAttribute('aria-selected','true')}})});
    var bar=document.getElementById('vkBulkBar');
    if(bar){bar.querySelector('.vk-bulk-count').textContent=picked.length?plural(picked.length,'gekozen','gekozen'):'Tik de kosten aan';bar.querySelectorAll('[data-vk-need]').forEach(function(b){b.disabled=!picked.length})}
  }
  function startSelect(){
    selecting=true;picked=[];document.documentElement.classList.add('vk-selecting');
    var bar=document.getElementById('vkBulkBar');
    if(!bar){
      bar=document.createElement('div');bar.id='vkBulkBar';bar.className='vk-bulk-bar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Meerdere kosten');
      bar.innerHTML='<span class="vk-bulk-count" aria-live="polite"></span><div class="vk-bulk-actions"><button type="button" class="btn small" data-vk-need data-vk-act="category">Categorie</button><button type="button" class="btn small" data-vk-need data-vk-act="vat">Btw</button><button type="button" class="btn small" data-vk-need data-vk-act="remove">Weghalen</button><button type="button" class="btn small primary" data-vk-act="done">Klaar</button></div>';
      bar.addEventListener('click',function(e){var b=e.target.closest('[data-vk-act]');if(!b)return;var a=b.getAttribute('data-vk-act');if(a==='done')stopSelect();else if(a==='category')askCategory();else if(a==='vat')askVat();else if(a==='remove')removePicked()});
      document.body.appendChild(bar);
    }
    paintPicks();
  }
  function stopSelect(){
    selecting=false;picked=[];document.documentElement.classList.remove('vk-selecting');
    var bar=document.getElementById('vkBulkBar');if(bar)bar.remove();paintPicks();
  }
  document.addEventListener('click',function(e){
    var start=e.target.closest&&e.target.closest('[data-vk="bulk-start"] button');
    if(start){e.preventDefault();if(selecting)stopSelect();else startSelect();return}
    if(!selecting||g('page')!=='expenses'||!e.target.closest||e.target.closest('#vkBulkBar,#modalRoot'))return;
    var id=expenseIdOf(e.target);if(!id)return;
    e.preventDefault();e.stopPropagation();
    var x=expense(id);if(!x)return;
    if(x.correctedAt||x.correctionFor){toast('Deze kosten zijn al weggehaald of zijn een correctie.');return}
    var at=picked.indexOf(id);if(at<0)picked.push(id);else picked.splice(at,1);
    paintPicks();
  },true);
  function chosen(){return picked.map(expense).filter(function(e){return e&&!e.correctedAt&&!e.correctionFor})}
  function done(msg,undo){stopSelect();call('save');call('render');if(undo&&fn('undoableToast'))window.undoableToast(msg,undo,6000);else toast(msg)}
  function askCategory(){
    var cats=g('categories')||[];
    call('modal','Categorie voor '+plural(picked.length,'kosten','kosten'),
      '<div class="field"><label for="vkCategory">Waarvoor</label><select id="vkCategory">'+cats.map(function(c){return '<option value="'+esc(c[0])+'">'+esc(c[1])+'</option>'}).join('')+'</select></div>',
      '<button class="btn" onclick="closeModal()">Annuleren</button><button class="btn primary" onclick="BoekunaVertrouwen.applyCategory()">Opslaan</button>');
  }
  function applyCategory(){
    var sel=document.getElementById('vkCategory');if(!sel)return;
    var value=sel.value,label=sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text:value,undo=[];
    chosen().forEach(function(e){if(e.category===value)return;var before=structuredClone(e);undo.push([e.id,e.category]);e.category=value;e.updatedAt=new Date().toISOString();call('logEvent','Kosten aangepast',(e.vendor||'Kosten')+' · categorie '+label,'expense',e.id,before,structuredClone(e))});
    call('closeModal');
    done(plural(undo.length,'kosten','kosten')+' naar '+label,undo.length?function(){undo.forEach(function(u){var e=expense(u[0]);if(e){e.category=u[1];e.updatedAt=new Date().toISOString()}});call('logEvent','Categorie teruggezet',plural(undo.length,'kosten','kosten'),'expense','');call('save');call('render');toast('Teruggezet')}:null);
  }
  function vatBlocked(e){
    if(fn('closedVatQuarterLabel')&&window.closedVatQuarterLabel(e.date))return 'afgesloten btw-periode';
    if(fn('expenseAmountLocked')&&window.expenseAmountLocked(e))return 'bedrag ligt vast';
    if(fn('expenseHasMixedVat')&&window.expenseHasMixedVat(e))return 'meerdere tarieven';
    return '';
  }
  function askVat(){
    var st=g('state')||{};
    if(st.company&&st.company.kor){toast('KOR staat aan: je rekent geen btw.');return}
    var rates=[['21','21%'],['9','9%'],['0','Geen btw']];
    call('modal','Btw voor '+plural(picked.length,'kosten','kosten'),
      '<div class="vk-rates" role="radiogroup" aria-label="Btw">'+rates.map(function(r,i){return '<label class="choice-chip"><input type="radio" name="vkRate" value="'+r[0]+'"'+(i===0?' checked':'')+'> '+r[1]+'</label>'}).join('')+'</div><p class="help">Het bedrag met btw blijft gelijk. Kosten uit een afgesloten btw-periode of met een vast bedrag slaat Boekuna over.</p>',
      '<button class="btn" onclick="closeModal()">Annuleren</button><button class="btn primary" onclick="BoekunaVertrouwen.applyVat()">Opslaan</button>');
  }
  function applyVat(){
    var r=document.querySelector('input[name="vkRate"]:checked');if(!r)return;
    var rate=r.value,changed=0,skipped=0,gross=fn('expenseGross');
    chosen().forEach(function(e){
      if(vatBlocked(e)){skipped++;return}
      if(String(e.vatRate)===rate&&!e.vatUnknown)return;
      var fd=new FormData();fd.set('vatRate',rate);fd.set('gross',String(gross?gross(e):e.gross));
      var split=window.expenseVatFromForm(fd,false);if(!split||split.error){skipped++;return}
      var before=structuredClone(e);
      Object.assign(e,{exVat:split.exVat,vatAmount:split.vatAmount,gross:split.gross,vatRate:split.vatRate,mixedRates:false,updatedAt:new Date().toISOString()});
      if(Array.isArray(e.vatLines))e.vatLines=split.vatRate==null?[]:[{rate:split.vatRate,taxableAmount:split.exVat,vatAmount:split.vatAmount}];
      delete e.vatUnknown;
      call('logEvent','Kosten aangepast',(e.vendor||'Kosten')+' · btw '+rate+'%','expense',e.id,before,structuredClone(e));changed++;
    });
    call('closeModal');
    done(plural(changed,'kosten','kosten')+' aangepast'+(skipped?' · '+skipped+' overgeslagen':''));
  }
  function removePicked(){
    var list=chosen();if(!list.length)return;
    var st=g('state')||{};
    var risky=list.filter(function(e){return (fn('closedVatQuarterLabel')&&window.closedVatQuarterLabel(e.date))||(st.transactions||[]).some(function(t){return t.status==='matched'&&t.matchType==='expense'&&t.matchId===e.id})});
    if(risky.length&&!window.confirm(plural(list.length,'kosten','kosten')+' weghalen? Ze tellen dan niet meer mee. In je administratie blijft zichtbaar dat ze er waren.\n\n'+plural(risky.length,'ervan hoort','ervan horen')+' bij een afgesloten btw-periode of een bankbetaling. Een bankkoppeling wordt losgemaakt; heb je al aangifte gedaan, neem het verschil dan mee in je volgende aangifte.'))return;
    var corrections=list.map(function(e){return [e.id,window.reverseExpenseBooking(e).id]});
    done(plural(list.length,'kosten','kosten')+' weggehaald',risky.length?null:function(){
      corrections.forEach(function(c){var at=st.expenses.findIndex(function(x){return x.id===c[1]}),orig=expense(c[0]);if(at<0||!orig)return;st.expenses.splice(at,1);delete orig.correctedAt;delete orig.correctedBy});
      call('logEvent','Weghalen teruggedraaid',plural(corrections.length,'kosten','kosten'),'expense','');call('save');call('render');toast('Kosten teruggezet');
    });
  }

  /* ---------- After each render: the small extra blocks ---------- */
  function decorate(){
    var content=document.getElementById('content');if(!content)return;
    var pg=content.dataset.page||g('page');
    if(pg==='expenses'){
      var hasRows=content.querySelector('[data-bk-expense],[onclick^="expenseActions("]');
      if(hasRows&&!content.querySelector('[data-vk="bulk-start"]')){
        var target=content.querySelector('.workspace-table')||(content.querySelector('[data-bk-expense]')||{}).parentElement;
        if(target){
          var b=document.createElement('div');b.className='vk-bulk-start';b.setAttribute('data-vk','bulk-start');b.innerHTML='<button type="button" class="link-btn">Meerdere kiezen</button>';
          // Never a new direct child of #content: motion.js reads that as a fresh render and stops the page slide.
          if(target.parentElement===content)target.prepend(b);else target.before(b);
        }
      }
      if(selecting)paintPicks();
    }else if(selecting)stopSelect();
  }
  var queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;try{decorate()}catch(e){console.warn('vertrouwen',e)}})}
  function watch(){var c=document.getElementById('content');if(!c){setTimeout(watch,300);return}new MutationObserver(schedule).observe(c,{childList:true,subtree:true});schedule()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();

  window.BoekunaVertrouwen={cancel:cancel,cancelGo:cancelGo,applyCategory:applyCategory,applyVat:applyVat,startSelect:startSelect,stopSelect:stopSelect,vatChecks:vatChecks,extraItems:extraItems,picked:function(){return picked.slice()}};
})();
