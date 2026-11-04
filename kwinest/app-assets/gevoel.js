/* BOEKUNA gevoel — proven psychology that makes the app feel calmer and more rewarding (Kwin 2026-11-01, "psychologische
   trucjes" 1-3 and 6-11; 4, 5 and 12 live in the app itself). Each trick names its source:
   1  the scan shows what it does (labor illusion, Buell & Norton 2011)
   2  a progress bar that speeds up at the end, stripes running backwards (Harrison, Yeo & Hudson 2010)
   3  say how long it takes (Maister 1985: an unknown wait feels longer)
   6  "12 van 15 geregeld" bar for the quarter (goal gradient, Kivetz, Urminsky & Zheng 2006)
   7  you see at once what a bon or a trip is worth (immediate rewards, Woolley & Fishbach 2016)
   8  new month or quarter, clean slate (fresh start effect, Dai, Milkman & Riis 2014)
   9  pick a fixed moment for your bonnen (implementation intentions, Gollwitzer & Sheeran 2006)
   10 a calm end after sending an invoice (peak-end rule, Kahneman e.a. 1993)
   11 good news first on the overview (ostrich effect, Karlsson, Loewenstein & Seppi 2009)
   Never: streaks, fake urgency, surprise rewards. Styling lives in gevoel.css. */
(function(){
  'use strict';
  var root=document.documentElement;
  // Automated browsers (tests, screenshots) get the plain app like motion.js, press.js and handig.js; ?gevoel=1 turns it on.
  var forced=/[?&]gevoel=1\b/.test(location.search);
  var testRun=false;
  try{testRun=typeof TEST_MODE_NO_AUTH!=='undefined'&&TEST_MODE_NO_AUTH===true}catch(e){}
  if((navigator.webdriver||testRun)&&!forced)return;
  root.classList.add('boekuna-gevoel');

  // App helpers are global functions; state is a global let-binding and money a const, both read by name.
  function app(name){if(typeof window[name]==='function')return window[name];if(name==='money'){try{return typeof money==='function'?money:null}catch(e){return null}}return null}
  function appState(){try{return typeof state!=='undefined'?state:null}catch(e){return null}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function euro(n){var m=app('money');return m?m(n):'€ '+Number(n||0).toFixed(2).replace('.',',')}
  function wrap(name,make){var orig=window[name];if(typeof orig!=='function'||orig.__gevoel)return;var fn=make(orig);fn.__gevoel=true;window[name]=fn}
  function tick(){try{var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.boekunaHaptic;if(h){h.postMessage('tap');return}}catch(e){}try{if(navigator.vibrate)navigator.vibrate(10)}catch(e){}}
  var MONTHS=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  var DAYS=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  function plural(n,one,many){return n+' '+(n===1?one:many)}

  /* ---------- 3. How long does it take ---------- */
  // About half a minute to check a bon, a quarter of a minute to link a bank line. Rounded up, never "0 minuten".
  function minutesFor(docs,bank){var s=docs*30+bank*15;if(!s)return '';var m=Math.max(1,Math.ceil(s/60));return 'ongeveer '+(m===1?'1 minuut':m+' minuten')}
  function secondsText(busy){var s=Math.min(60,Math.max(5,Math.ceil(busy*4/5)*5));return s>=60?'ongeveer een minuut':'meestal binnen '+s+' seconden'}

  /* ---------- 1 + 2. The scan shows what it does, with a bar that speeds up at the end ---------- */
  var STEPS=['Foto ontvangen','Tekst lezen','Leverancier zoeken','Bedragen en btw narekenen'];
  var seen={};   // job id -> first time we saw it busy
  var TERMINAL={ready:1,review_required:1,failed:1,completed:1,cancelled:1};
  function jobStart(job){
    var id=String(job.id);if(seen[id])return seen[id];
    var created=Date.parse(job.created_at||'');
    seen[id]=isFinite(created)&&Date.now()-created<120000?created:Date.now();
    return seen[id];
  }
  // Step from the real phase where we have one, from the clock within a phase: never ahead of the processor.
  function activeStep(job,elapsed){
    var st=String(job.state||''),ph=String(job.phase||'');
    if(st==='validating'||ph==='validate')return 3;
    if(st==='processing'||ph==='read')return elapsed>1600?2:1;
    return 0;
  }
  // Fast at first, then slowly towards 92% while we wait; the last bit runs quickly once the scan is done.
  function barWidth(elapsed){return Math.round(92*(1-Math.exp(-elapsed/3500)))}
  function stepsHtml(active,allDone){
    return '<ol class="gv-steps" aria-hidden="true">'+STEPS.map(function(label,i){
      var cls=allDone||i<active?'is-done':i===active?'is-active':'';
      return '<li class="'+cls+'"><span class="gv-step-dot">'+(cls==='is-done'?'✓':'')+'</span>'+esc(label)+'</li>';
    }).join('')+'</ol>';
  }
  function resultLine(job){
    var a=job&&job.result&&job.result.analysis||{},bits=[];
    var name=a.supplier&&a.supplier.name,total=a.amounts&&a.amounts.total,date=a.invoice&&(a.invoice.date||a.invoice.issueDate);
    if(name)bits.push(esc(name)+' ✓');
    if(date)bits.push('Datum ✓');
    if(total!=null&&isFinite(Number(total)))bits.push(esc(euro(Number(total))));
    return bits.length?'<p class="gv-scan-result">'+bits.join(' · ')+'</p>':'';
  }
  wrap('persistentDocumentCardHtml',function(orig){return function(job){
    var html=orig.apply(this,arguments);if(!job||job.id==null)return html;
    var id=String(job.id),state=String(job.state||'');
    var block='';
    if(!TERMINAL[state]){
      var start=jobStart(job),elapsed=Date.now()-start;
      block='<div class="gv-scan" data-gv-job="'+esc(id)+'" data-gv-start="'+start+'">'+stepsHtml(activeStep(job,elapsed),false)+
        '<div class="gv-bar" role="progressbar" aria-label="Bon wordt gelezen" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+barWidth(elapsed)+'"><i style="width:'+barWidth(elapsed)+'%"></i></div></div>';
    }
    if(!block)return html;
    // The steps say what happens, so the status line only keeps its short label.
    if(!TERMINAL[state])html=html.replace(/<span><b>([^<]*)<\/b> · [^<]*<\/span>/,'<span><b>Bon wordt gelezen</b></span>');
    var at=html.lastIndexOf('</div><div class="document-processing-card-actions">');
    return at<0?html:html.slice(0,at)+block+html.slice(at);
  }});
  wrap('renderDocumentProcessingBoard',function(orig){return function(){
    var html=orig.apply(this,arguments);if(!html)return html;
    var jobs=(function(){try{return typeof documentProcessingJobs!=='undefined'?documentProcessingJobs:[]}catch(e){return[]}})();
    var busy=jobs.filter(function(j){return !TERMINAL[String(j.state||'')]}).length;
    if(busy&&html.indexOf('<p>Verwerken…</p>')>-1)html=html.replace('<p>Verwerken…</p>','<p>'+(busy===1?'Bezig met lezen, ':'Nog '+busy+' bonnen, ')+esc(secondsText(busy))+'.</p>');
    return html;
  }});
  // While a bar is on screen it moves every frame; the board itself re-renders when the processor reports.
  var rafOn=false;
  function animateBars(){
    var bars=document.querySelectorAll('.gv-scan:not(.is-done)[data-gv-start]');
    if(!bars.length){rafOn=false;return}
    rafOn=true;
    var now=Date.now();
    for(var i=0;i<bars.length;i++){
      var el=bars[i],elapsed=now-Number(el.dataset.gvStart),w=barWidth(elapsed),bar=el.querySelector('.gv-bar');
      if(bar){bar.firstChild.style.width=w+'%';bar.setAttribute('aria-valuenow',String(w))}
      // Within the read phase the step moves on by itself after a moment.
      var active=el.querySelector('.gv-steps .is-active');
      if(active&&active.nextElementSibling&&active.textContent.indexOf('Tekst lezen')>-1&&elapsed>1600){
        active.className='is-done';active.firstChild.textContent='✓';active.nextElementSibling.className='is-active';
      }
    }
    setTimeout(function(){requestAnimationFrame(animateBars)},120);
  }
  function kickBars(){if(!rafOn&&document.querySelector('.gv-scan:not(.is-done)[data-gv-start]'))requestAnimationFrame(animateBars)}
  // When a bon we watched being read is done, say so with what was found: the board itself folds the card away.
  var told={};
  function checkFinished(){
    var ids=Object.keys(seen).filter(function(id){return !told[id]});if(!ids.length)return;
    var jobs=(function(){try{return typeof documentProcessingJobs!=='undefined'?documentProcessingJobs:[]}catch(e){return[]}})();
    ids.forEach(function(id){
      var job=jobs.find(function(j){return String(j.id)===id});if(!job||!TERMINAL[String(job.state||'')])return;
      told[id]=true;if(job.state==='failed')return;
      var t=app('toast');if(!t)return;
      t(job.state==='review_required'?'Bon gelezen. Kijk even of het klopt.':'Bon gelezen');
      var root=document.getElementById('toastRoot'),el=root&&root.lastElementChild,line=resultLine(job);
      if(el&&line){var b=document.createElement('span');b.className='gv-reward gv-found';b.innerHTML=line.replace(/^<p class="gv-scan-result">|<\/p>$/g,'');el.appendChild(b);el.classList.add('has-reward')}
    });
  }
  setInterval(function(){if(Object.keys(seen).length)checkFinished()},1000);

  /* ---------- 6, 8, 9, 11 + 3. One calm line on the phone overview, good news first ---------- */
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function openWork(){
    var rows=app('attentionRows')?app('attentionRows')():[];
    var docs=rows.filter(function(r){return r.category==='documents'}).length;
    var st=appState()||{},bank=(st.transactions||[]).filter(function(t){return t.status==='unmatched'}).length;
    return {docs:docs,bank:bank,total:docs+bank};
  }
  function quarterInfo(now){
    var q=Math.floor(now.getMonth()/3),start=new Date(now.getFullYear(),q*3,1),end=new Date(now.getFullYear(),q*3+3,0);
    var st=appState()||{},a=iso(start),b=iso(end);
    var done=(st.expenses||[]).filter(function(e){var d=String(e.date||'');return d>=a&&d<=b}).length;
    return {q:q+1,done:done};
  }
  function moment(){var st=appState();var m=st&&st.meta&&st.meta.bonnenmoment;return m&&m.day!=null&&/^\d{2}:\d{2}$/.test(String(m.time||''))?m:null}
  function momentNow(now){
    var m=moment();if(!m||Number(m.day)!==now.getDay())return false;
    var hm=String(m.time).split(':');var from=new Date(now);from.setHours(Number(hm[0]),Number(hm[1]),0,0);
    return now>=from;
  }
  function freshStart(now){
    var d=now.getDate(),m=now.getMonth();
    if(m%3===0&&d<=7)return {kind:'kwartaal',prev:'Q'+(m===0?4:m/3)};
    if(d<=3)return {kind:'maand',prev:MONTHS[(m+11)%12]};
    return null;
  }
  function todoText(work){
    var bits=[];if(work.docs)bits.push(plural(work.docs,'bon','bonnen'));if(work.bank)bits.push(plural(work.bank,'bankregel','bankregels'));
    return 'Nog '+bits.join(' en ')+', '+minutesFor(work.docs,work.bank);
  }
  function calmLineHtml(){
    var st=appState();if(!st||!((st.expenses||[]).length||(st.invoices||[]).length))return '';
    var now=window.__gevoelNow?new Date(window.__gevoelNow):new Date(),work=openWork(),qi=quarterInfo(now),fresh=freshStart(now),title,detail='',cta='',action='gevoelOpenWork()',kind='';
    var total=qi.done+work.total,pct=total?Math.round(qi.done/total*100):100;
    // UI-trucs 1 (Kwin 2026-11-04): "helemaal bij" only when nothing at all needs you. With a late invoice or a btw deadline
    // in the alert right under this line, only the bonnen and bank lines are done.
    var urgent=0;try{urgent=(app('phoneUrgentItems')?app('phoneUrgentItems')():[]).length}catch(e){urgent=0}
    var bij=urgent?(work.total===0&&(st.transactions||[]).length?'Je bonnen en bank zijn bij':'Je bonnen zijn bij'):'Je bent helemaal bij';
    if(momentNow(now)){
      kind='moment';title='Het is je bonnenmoment';detail=work.total?todoText(work)+'.':(urgent?bij+'.':'Je bent al helemaal bij. Lekker.');cta=work.total?'Beginnen':'';
    }else if(fresh){
      kind='fresh';title=fresh.kind==='maand'?'Nieuwe maand, schone lei':'Nieuw kwartaal, schone lei';
      detail=work.total?(fresh.prev.charAt(0).toUpperCase()+fresh.prev.slice(1))+' even afronden? '+todoText(work)+'.':(urgent?bij+'.':fresh.kind==='maand'?'Je bent helemaal bij.':fresh.prev+' is helemaal bij.');
      cta=work.total?'Afronden':'';
    }else if(work.total){
      kind='progress';title='Q'+qi.q+' · '+qi.done+' van '+total+' geregeld';detail=todoText(work)+'.';cta='Verder';
    }else{
      kind='clear';title=bij;detail=qi.done?'Q'+qi.q+' · '+plural(qi.done,'bon','bonnen')+' geregeld':'';
    }
    // Implementation intention: when nothing needs you and no moment is set yet, offer one quietly.
    var plan=!moment()&&kind==='clear'?'<button type="button" class="gv-calm-plan" onclick="event.stopPropagation();gevoelPlanMoment()">Vast moment kiezen</button>':'';
    var meter=kind==='progress'||kind==='moment'&&work.total?'<span class="gv-calm-meter" aria-hidden="true"><i style="width:'+pct+'%"></i></span>':'';
    var clickable=!!cta;
    return '<div class="gv-calm is-'+kind+'"'+(clickable?' role="button" tabindex="0" onclick="'+action+'" onkeydown="if(event.key===\'Enter\')'+action+'"':'')+'>'+
      '<span class="gv-calm-icon" aria-hidden="true">'+(kind==='clear'?'✓':kind==='moment'?'◷':kind==='fresh'?'✦':'')+(kind==='progress'?'<b>'+pct+'%</b>':'')+'</span>'+
      '<span class="gv-calm-copy"><strong>'+esc(title)+'</strong>'+(detail?'<span>'+esc(detail)+'</span>':'')+meter+plan+'</span>'+
      (cta?'<span class="gv-calm-cta">'+esc(cta)+'</span>':'')+'</div>';
  }
  window.gevoelOpenWork=function(){
    var work=openWork(),go=app('openDashboardAttention');if(!go)return;
    go(work.docs?'documents':work.bank?'bank':'documents');
  };
  wrap('dashboardCalmPhoneHtml',function(orig){return function(){
    var html=orig.apply(this,arguments),line='';
    try{line=calmLineHtml()}catch(e){line=''}
    if(!line)return html;
    var hero=html.indexOf('<section class="r1d-hero">'),end=hero<0?-1:html.indexOf('</section>',hero);
    return end<0?html:html.slice(0,end+10)+line+html.slice(end+10);
  }});

  /* ---------- 9. A fixed moment for your bonnen ---------- */
  function nextOccurrence(day,time){
    var hm=time.split(':'),d=new Date();d.setHours(Number(hm[0]),Number(hm[1]),0,0);
    var add=(Number(day)-d.getDay()+7)%7;if(add===0&&d<new Date())add=7;d.setDate(d.getDate()+add);return d;
  }
  function icsText(m){
    var d=nextOccurrence(m.day,m.time),pad=function(n){return String(n).padStart(2,'0')};
    var stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
    var start=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00';
    var endD=new Date(d.getTime()+15*60000),end=endD.getFullYear()+pad(endD.getMonth()+1)+pad(endD.getDate())+'T'+pad(endD.getHours())+pad(endD.getMinutes())+'00';
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Boekuna//Bonnenmoment//NL','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:bonnenmoment-'+stamp+'@boekuna.nl','DTSTAMP:'+stamp,
      'DTSTART:'+start,'DTEND:'+end,'RRULE:FREQ=WEEKLY','SUMMARY:Bonnenmoment in Boekuna','DESCRIPTION:Even je bonnen bijwerken. Meestal een paar minuten.','URL:https://app.boekuna.nl/',
      'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Bonnenmoment','TRIGGER:PT0M','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  }
  window.gevoelAddToCalendar=function(){
    var m=moment();if(!m)return;
    var text=icsText(m),name='bonnenmoment.ics';
    try{
      var file=new File([text],name,{type:'text/calendar'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){navigator.share({files:[file],title:'Bonnenmoment'}).catch(function(){});return}
    }catch(e){}
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/calendar'}));a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);
  };
  function momentLabel(m){return m?DAYS[Number(m.day)]+' om '+m.time:'Nog niet gekozen'}
  function saveMoment(day,time){
    var st=appState();if(!st)return;st.meta=st.meta||{};
    if(day===''||day==null)delete st.meta.bonnenmoment;else st.meta.bonnenmoment={day:Number(day),time:time||'16:00'};
    var s=app('save');if(s)s();
  }
  window.gevoelPlanMoment=function(){
    var modal=app('modal');if(!modal)return;
    var m=moment()||{day:5,time:'16:00'};
    var dayOpts=[1,2,3,4,5,6,0].map(function(d){return '<button type="button" class="gv-day'+(Number(m.day)===d?' is-on':'')+'" data-day="'+d+'" aria-pressed="'+(Number(m.day)===d)+'">'+DAYS[d].slice(0,2)+'</button>'}).join('');
    modal('Vast bonnenmoment',
      '<form id="gvMomentForm" class="gv-moment" onsubmit="event.preventDefault();gevoelSaveMoment()"><p class="gv-moment-why">Wie van tevoren kiest wanneer, doet het veel vaker echt. Kies een moment dat al in je week zit.</p>'+
      '<div class="gv-days" role="group" aria-label="Dag">'+dayOpts+'</div>'+
      '<label class="field"><span>Hoe laat</span><input type="time" name="time" value="'+esc(m.time)+'" required></label>'+
      '<p class="help">Op dat moment staat het bovenaan je overzicht. Met "Zet in je agenda" krijg je ook een seintje op je telefoon.</p></form>',
      (moment()?'<button class="btn" type="button" onclick="gevoelSaveMoment(true)">Uitzetten</button>':'')+'<button class="btn primary" type="submit" form="gvMomentForm">Opslaan</button>');
    var form=document.getElementById('gvMomentForm');if(!form)return;
    form.querySelectorAll('.gv-day').forEach(function(b){b.addEventListener('click',function(){form.querySelectorAll('.gv-day').forEach(function(x){x.classList.toggle('is-on',x===b);x.setAttribute('aria-pressed',String(x===b))})})});
  };
  window.gevoelSaveMoment=function(off){
    var form=document.getElementById('gvMomentForm');
    if(off===true){saveMoment('');}else{
      var on=form&&form.querySelector('.gv-day.is-on'),time=form&&form.time.value;if(!on||!time)return;saveMoment(on.dataset.day,time);
    }
    var close=app('closeModal');if(close)close();
    var r=app('render');if(r)r();
    var m=moment(),t=app('toast');
    if(t)t(m?'Bonnenmoment: '+momentLabel(m)+'.':'Bonnenmoment uitgezet.');
    if(m)setTimeout(offerCalendar,60);
  };
  function offerCalendar(){
    var root=document.getElementById('toastRoot'),m=moment();if(!root||!m)return;
    var el=document.createElement('div');el.className='toast has-action gv-cal-toast';
    el.innerHTML='<span>Ook een seintje op je telefoon?</span><button type="button" class="toast-action" onclick="gevoelAddToCalendar();this.closest(\'.toast\').remove()">Zet in je agenda</button>';
    root.appendChild(el);setTimeout(function(){el.remove()},6000);
  }
  // Instellingen > App: one row under the sound switch.
  function addMomentSetting(node){
    var anchor=node.querySelector&&(node.querySelector('label[for="bkSoundToggle"]')||node.querySelector('label[for="hideAmountsToggle"]'));
    if(!anchor||document.getElementById('gvMomentRow'))return;
    var row=document.createElement('button');row.type='button';row.id='gvMomentRow';row.className='gv-setting-row';
    row.innerHTML='<span><strong>Vast bonnenmoment</strong><span class="help settings-hint">'+esc(momentLabel(moment()))+'</span></span><span class="gv-setting-go" aria-hidden="true">›</span>';
    row.addEventListener('click',function(){window.gevoelPlanMoment()});
    anchor.after(row);
  }

  /* ---------- 7. What a bon or a trip is worth, right away ---------- */
  var known={exp:null,trip:null,state:null};
  function snapshot(){var st=appState();if(!st)return;known.state=st;known.exp=new Set((st.expenses||[]).map(function(e){return e.id}));known.trip=new Set((st.mileage||[]).map(function(t){return t.id}))}
  function rewardFor(){
    var st=appState();if(!st)return '';
    if(st!==known.state||!known.exp){snapshot();return ''}
    var newExp=(st.expenses||[]).filter(function(e){return !known.exp.has(e.id)}),newTrips=(st.mileage||[]).filter(function(t){return !known.trip.has(t.id)});
    snapshot();
    var kor=!!(st.company&&st.company.kor);
    if(newExp.length===1){
      var e=newExp[0],vat=Number(e.vatAmount);
      if(!isFinite(vat))vat=Number(e.exVat||0)*Number(e.vatRate||0)/100;
      vat=Math.round(vat*100)/100;
      if(!kor&&e.taxTreatment!=='kor'&&!e.vatUnknown&&vat>0)return '+ '+euro(vat)+' btw terug';
      return '';
    }
    if(newTrips.length===1){
      var rate=0.23;try{if(typeof TRIP_KM_RATE==='number')rate=TRIP_KM_RATE}catch(x){}
      var worth=Math.round(Number(newTrips[0].km||0)*rate*100)/100;
      if(worth>0)return euro(worth)+' aftrekbaar';
    }
    return '';
  }
  wrap('toast',function(orig){return function(msg){
    var out=orig.apply(this,arguments),text=String(msg||''),reward='';
    if(/opgeslagen|geboekt|geregistreerd/i.test(text)&&!/niet\b/i.test(text))reward=rewardFor();else snapshot();
    if(reward){
      var root=document.getElementById('toastRoot'),el=root&&root.lastElementChild;
      if(el&&el.classList.contains('toast')){var b=document.createElement('span');b.className='gv-reward';b.textContent=reward;el.appendChild(b);el.classList.add('has-reward')}
    }
    return out;
  }});

  /* ---------- 10. A calm end after sending an invoice ---------- */
  function sentStamp(st){var m={};(st.invoices||[]).forEach(function(i){m[i.id]=i.lastSentAt||''});return m}
  function shortDate(iso){var d=new Date(String(iso||'')+'T12:00:00');return isFinite(d)?d.getDate()+' '+MONTHS[d.getMonth()].slice(0,3):''}
  function payLine(st,inv){
    // How this customer usually pays, from their own paid invoices; otherwise the due date.
    var days=(st.invoices||[]).filter(function(i){return i.customerId===inv.customerId&&i.id!==inv.id&&i.kind!=='credit'&&i.status==='paid'&&(i.payments||[]).length&&i.issueDate}).map(function(i){
      var last=i.payments.map(function(p){return String(p.date||'')}).sort().pop();return (Date.parse(last)-Date.parse(i.issueDate))/864e5;
    }).filter(function(n){return isFinite(n)&&n>=0&&n<366});
    var name=(app('getContact')?app('getContact')(inv.customerId).name:'')||'Je klant';
    if(days.length>=2){days.sort(function(a,b){return a-b});var med=Math.round(days[Math.floor(days.length/2)]);return name+' betaalt meestal binnen '+(med<=1?'een dag':med+' dagen')+'.'}
    return inv.dueDate?'Betaaltermijn tot '+shortDate(inv.dueDate)+'.':'';
  }
  function showEnd(inv){
    var st=appState();if(!st||!inv)return;
    var first=(st.invoices||[]).reduce(function(n,i){return n+(i.kind==='credit'?0:Math.max((i.sendHistory||[]).length,i.lastSentAt?1:0))},0)===1;
    var name=(app('getContact')?app('getContact')(inv.customerId).name:'')||'';
    var gross=app('invoiceGross')?app('invoiceGross')(inv):null;
    var old=document.getElementById('gvEnd');if(old)old.remove();
    var el=document.createElement('div');el.id='gvEnd';el.className='gv-end'+(first?' is-first':'');el.setAttribute('role','status');
    el.innerHTML='<span class="gv-end-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span class="gv-end-copy"><strong>'+
      esc(first?'Je eerste factuur is de deur uit':'Verstuurd'+(name?' naar '+name:''))+'</strong><span>'+esc((gross!=null?euro(gross)+' · ':'')+payLine(st,inv))+'</span></span>';
    el.addEventListener('click',function(){el.classList.add('is-leaving');setTimeout(function(){el.remove()},250)});
    document.body.appendChild(el);tick();
    setTimeout(function(){if(el.isConnected){el.classList.add('is-leaving');setTimeout(function(){el.remove()},250)}},first?6500:4500);
  }
  function sentWrap(orig){return function(){
    var st=appState(),before=st?sentStamp(st):{};
    var out=orig.apply(this,arguments);
    var after=appState();if(!after||after!==st)return out;
    var inv=(after.invoices||[]).find(function(i){return i.lastSentAt&&i.lastSentAt!==before[i.id]});
    if(inv)setTimeout(function(){showEnd(inv)},120);
    return out;
  }}
  wrap('markEmailHandoffSent',sentWrap);
  wrap('confirmInvoiceShareSent',sentWrap);

  /* ---------- Watch new screens ---------- */
  function onAdded(node){
    if(!node||node.nodeType!==1)return;
    addMomentSetting(node);
    if(node.querySelector&&node.querySelector('.gv-scan')||node.classList&&node.classList.contains('gv-scan'))kickBars();
  }
  new MutationObserver(function(list){
    for(var i=0;i<list.length;i++){var added=list[i].addedNodes;for(var j=0;j<added.length;j++)onAdded(added[j])}
  }).observe(document.body,{childList:true,subtree:true});
  snapshot();
  // The overview is drawn before this file loads: draw it once more so the calm line is there from the start.
  try{if(typeof page!=='undefined'&&page==='dashboard'&&app('render')&&appState()&&document.getElementById('content'))app('render')()}catch(e){}
})();
