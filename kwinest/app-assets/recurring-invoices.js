// Terugkerende facturen (Kwin 2026-10-28, gebruikerssimulatie). A schedule never sends anything by itself:
// on the planned day Boekuna puts a copy of the invoice ready as a concept, and the user checks and sends it.
// The copy follows the same rules as "Kopie maken" (no payments, no send history, a concept number), so a
// schedule never touches omzet, btw or the invoice number series until the user makes the concept final.
// Schedules live in state.recurringInvoices; part of ZZP, like the rest of the invoice flow beyond the basics.
(function(){
  'use strict';

  var EVERY={month:{months:1,label:'Elke maand',short:'maandelijks'},quarter:{months:3,label:'Elk kwartaal',short:'per kwartaal'},year:{months:12,label:'Elk jaar',short:'jaarlijks'}};
  var MAX_PER_RUN=6; // app not opened for a long time: catch up, but never flood the list

  function list(){if(!Array.isArray(state.recurringInvoices))state.recurringInvoices=[];return state.recurringInvoices}
  function active(){return list().filter(function(r){return r&&!r.stoppedAt})}
  function forInvoice(id){
    return active().find(function(r){return r.sourceId===id||(Array.isArray(r.invoiceIds)&&r.invoiceIds.indexOf(id)>=0)});
  }
  function findInvoice(id){return (state.invoices||[]).find(function(i){return i.id===id})}

  // Month arithmetic from a fixed start, so 31 jan -> 28 feb -> 31 mrt instead of drifting to the 28th.
  function occurrence(start,every,n){
    var d=parseDateOnly(start);if(!d)return '';
    var day=d.getDate(),step=(EVERY[every]||EVERY.month).months*n;
    var t=new Date(d.getFullYear(),d.getMonth()+step,1);
    var last=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();
    t.setDate(Math.min(day,last));
    return localDateOnly(t);
  }
  function nextDate(r){return occurrence(r.start,r.every,Number(r.made||0))}
  function usable(inv){return !!inv&&inv.kind!=='credit'&&inv.status!=='cancelled'}

  // The newest invoice in the chain is the template, so a price you changed last month carries on.
  function template(r){
    var ids=Array.isArray(r.invoiceIds)?r.invoiceIds:[];
    for(var k=ids.length-1;k>=0;k--){var inv=findInvoice(ids[k]);if(usable(inv))return inv}
    var src=findInvoice(r.sourceId);return usable(src)?src:null;
  }

  function makeConcept(r,date){
    var src=template(r);if(!src)return null;
    var copy=structuredClone(src);
    for(var k of INVOICE_COPY_DROP_FIELDS)delete copy[k];
    delete copy.paymentReference;delete copy.cancelledAt;delete copy.cancelReason;
    var days=Number(src.paymentDays!=null?src.paymentDays:(state.company&&state.company.paymentDays!=null?state.company.paymentDays:14));
    Object.assign(copy,{id:uid('i'),number:conceptNumber('invoice'),numberManaged:true,numberFinalized:false,status:'draft',payments:[],issueDate:date,supplyDate:date,dueDate:addDateOnlyDays(date,Number.isFinite(days)?days:14),recurringId:r.id,createdAt:new Date().toISOString()});
    state.invoices.unshift(copy);
    if(!Array.isArray(r.invoiceIds))r.invoiceIds=[];
    r.invoiceIds.push(copy.id);
    return copy;
  }

  // Put every concept that is due ready. Runs after load and on each render; does nothing most of the time.
  var running=false;
  function run(){
    if(running||!state||!Array.isArray(state.invoices)||!Array.isArray(state.recurringInvoices))return 0;
    // Only once the plan is known: a Start account that left ZZP gets no new concepts.
    if(typeof currentPlanRank==='function'&&currentPlanRank()===null)return 0;
    if(typeof planAllows==='function'&&!planAllows(1))return 0;
    running=true;
    var made=[],now=today();
    try{
      active().forEach(function(r){
        var guard=0;
        while(guard<MAX_PER_RUN){
          var date=nextDate(r);if(!date||date>now)break;
          if(!template(r)){r.stoppedAt=new Date().toISOString();r.stopReason='source';break}
          var copy=makeConcept(r,date);if(!copy)break;
          r.made=Number(r.made||0)+1;r.lastRunAt=new Date().toISOString();
          made.push(copy);guard++;
        }
      });
      if(made.length){
        made.forEach(function(c){logEvent('Terugkerende factuur klaargezet als concept',(getContact(c.customerId).name||'Klant')+' · '+dateNL(c.issueDate),'invoice',c.id)});
        save();
        toast(made.length===1?'Terugkerende factuur voor '+(getContact(made[0].customerId).name||'je klant')+' staat klaar als concept':made.length+' terugkerende facturen staan klaar als concept');
      }
    }finally{running=false}
    return made.length;
  }

  function firstDefault(inv){
    var base=inv&&inv.issueDate||today(),n=1,d;
    do{d=occurrence(base,'month',n);n++}while(d&&d<=today()&&n<240);
    return d||addDateOnlyDays(today(),1);
  }

  window.openRecurringInvoice=async function(id){
    var inv=findInvoice(id);if(!usable(inv))return toast('Van deze factuur maak je geen terugkerende factuur.');
    if(typeof requirePlanAccess==='function'&&!(await requirePlanAccess(1,'Terugkerende facturen')))return;
    var r=forInvoice(id),every=r?r.every:'month',start=r?nextDate(r):firstDefault(inv),c=getContact(inv.customerId);
    var choice=Object.keys(EVERY).map(function(k){
      return '<label class="recurring-choice"><input type="radio" name="every" value="'+k+'"'+(k===every?' checked':'')+'><span>'+EVERY[k].label+'</span></label>';
    }).join('');
    modal('Terugkerende factuur',
      '<form id="recurringForm" class="recurring-form" onsubmit="event.preventDefault();saveRecurringInvoice(\''+esc(id)+'\')">'
      +'<p class="recurring-intro">Voor <strong>'+esc(c.name||'je klant')+'</strong> · '+money(invoiceGross(inv))+'</p>'
      +'<fieldset class="recurring-choices"><legend>Hoe vaak?</legend>'+choice+'</fieldset>'
      +'<div class="field"><label for="recurringStart">Volgende factuur op</label><input id="recurringStart" name="start" type="date" value="'+esc(start)+'" min="'+esc(today())+'" required></div>'
      +'<p class="help">Op die dag zet Boekuna een kopie klaar als concept. Jij kijkt hem na en verstuurt hem. Er gaat niets vanzelf naar je klant.</p>'
      +'</form>',
      (r?'<button class="btn" type="button" onclick="stopRecurringInvoice(\''+esc(r.id)+'\')">Stoppen</button>':'<button class="btn" type="button" onclick="closeModal()">Annuleren</button>')
      +'<button class="btn primary" type="button" onclick="saveRecurringInvoice(\''+esc(id)+'\')">Opslaan</button>');
  };

  window.saveRecurringInvoice=function(id){
    var form=document.getElementById('recurringForm');if(!form)return;
    var inv=findInvoice(id);if(!usable(inv))return;
    var every=(form.querySelector('input[name="every"]:checked')||{}).value||'month';if(!EVERY[every])every='month';
    var start=String(form.elements.start.value||'');
    if(!parseDateOnly(start))return toast('Kies een datum voor de volgende factuur.');
    if(start<today())return toast('Kies vandaag of een dag in de toekomst.');
    var r=forInvoice(id),now=new Date().toISOString();
    if(r){r.every=every;r.start=start;r.made=0;r.updatedAt=now}
    else{r={id:uid('r'),sourceId:id,every:every,start:start,made:0,invoiceIds:[],createdAt:now};list().push(r)}
    logEvent('Terugkerende factuur ingesteld',EVERY[every].short+' vanaf '+dateNL(start),'invoice',id);
    save();closeModal();run();render();
    toast('Herhaalt '+EVERY[every].short+'. Volgende op '+dateNL(start));
  };

  window.stopRecurringInvoice=function(rid){
    var r=list().find(function(x){return x.id===rid});if(!r)return;
    r.stoppedAt=new Date().toISOString();r.stopReason='user';
    logEvent('Terugkerende factuur gestopt',EVERY[r.every]?EVERY[r.every].short:'','invoice',r.sourceId);
    save();closeModal();render();toast('Gestopt. Bestaande facturen blijven staan.');
  };

  window.openRecurringList=function(){
    var rows=active().map(function(r){
      var t=template(r),c=t?getContact(t.customerId):{};
      return '<button type="button" class="quote-row" onclick="openRecurringInvoice(\''+esc(t?t.id:r.sourceId)+'\')"><span><strong>'+esc(c.name||'Klant')+'</strong><span>'+esc((EVERY[r.every]||EVERY.month).label)+' · volgende '+esc(dateNL(nextDate(r)))+'</span></span><strong>'+(t?money(invoiceGross(t)):'')+'</strong></button>';
    });
    modal('Terugkerende facturen',rows.length?'<div class="quote-list">'+rows.join('')+'</div>':'<p class="help">Nog geen terugkerende facturen. Open een factuur en kies Herhalen.</p>','<button class="btn" onclick="closeModal()">Sluiten</button>');
  };
  window.runRecurringInvoices=run;
  window.recurringInvoiceOccurrence=occurrence;

  // One row in the invoice sheet.
  var baseActions=window.invoiceActions;
  if(typeof baseActions==='function'){
    window.invoiceActions=function(id){
      var out=baseActions.apply(this,arguments);
      try{
        var inv=findInvoice(id);
        if(usable(inv)){
          // Not set yet: under Meer, next to Kopie maken (fewer choices up front). Running: in the main list.
          var r=forInvoice(id),listEl=(!r&&document.querySelector('#modalRoot .invoice-action-more .action-list'))||document.querySelector('#modalRoot .action-list');
          if(listEl&&!document.querySelector('#modalRoot .recurring-action')){
            var title=r?(EVERY[r.every]||EVERY.month).label+' herhalen':'Herhalen',detail=r?'Volgende '+dateNL(nextDate(r))+' · aanpassen of stoppen':'Elke maand, kwartaal of jaar als concept klaar';
            listEl.insertAdjacentHTML('beforeend','<button class="action-row recurring-action" type="button" onclick="closeModal();openRecurringInvoice(\''+esc(id)+'\')"><div class="action-text"><strong>'+esc(title)+'</strong><span>'+esc(detail)+'</span></div></button>');
          }
        }
      }catch(_err){}
      return out;
    };
  }

  // Inkomsten: one quiet row under the page head while schedules run, next to the Offertes row.
  var baseRender=window.render;
  window.render=function(){
    try{run()}catch(_err){}
    var out=baseRender.apply(this,arguments);
    try{
      if(page==='invoices'&&active().length){
        var content=document.getElementById('content'),head=content&&content.querySelector('.page-head');
        if(head&&!content.querySelector('.recurring-strip')){
          var n=active().length;
          var html='<button type="button" class="calm-row recurring-strip" onclick="openRecurringList()"><span class="calm-label">Terugkerend · '+n+' '+(n===1?'factuur':'facturen')+'</span><strong class="calm-value"></strong>'+icon('i-chevron')+'</button>';
          var quoteWrap=content.querySelector('.quote-strip-wrap');
          if(quoteWrap)quoteWrap.insertAdjacentHTML('beforeend',html);
          else head.insertAdjacentHTML('afterend','<div class="calm-list quote-strip-wrap">'+html+'</div>');
        }
      }
      // Phone: the page head sits in the coloured band and the filters lie over anything right under it,
      // so the Offertes/Terugkerend rows go under the invoice list instead.
      if(page==='invoices'&&typeof phoneLayout==='function'&&phoneLayout()){
        var c=document.getElementById('content'),wrap=c&&c.querySelector('.quote-strip-wrap'),card=c&&c.querySelector('.card.table-card');
        if(wrap&&card&&card.nextElementSibling!==wrap){card.insertAdjacentElement('afterend',wrap);wrap.classList.add('is-under-list')}
      }
    }catch(_err){}
    return out;
  };
})();
