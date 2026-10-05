(function(){
'use strict';
var $=function(s,c){return (c||document).querySelector(s)}, $$=function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s))};
var motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
var reduce=motionQuery.matches;
motionQuery.addEventListener('change',function(e){reduce=e.matches});
var eur=new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'});
var eur0=new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0});
var CHECK='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
var WARN='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--warn)"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>';
function parseNum(v){v=String(v).replace(/[€\s]/g,'').replace(/\./g,'').replace(',','.');var n=parseFloat(v);return isNaN(n)?0:n}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

/* theme */
var themeBtn=$('#themeBtn');
function getTheme(){try{return localStorage.getItem('bk-theme')}catch(e){return null}}
function applyTheme(t){if(t){document.documentElement.setAttribute('data-theme',t)}else{document.documentElement.removeAttribute('data-theme')}
  var dark=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;themeBtn.textContent=dark?'Lichte modus':'Donkere modus'}
applyTheme(getTheme());
themeBtn.addEventListener('click',function(){var dark=themeBtn.textContent==='Donkere modus';var t=dark?'dark':'light';try{localStorage.setItem('bk-theme',t)}catch(e){}applyTheme(t)});

/* toast */
var toastT;function toast(msg){var t=$('#toast');t.innerHTML=CHECK+'<span>'+esc(msg)+'</span>';t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show')},2800)}

/* header */
var hdr=$('#hdr');window.addEventListener('scroll',function(){hdr.classList.toggle('scrolled',window.scrollY>8)},{passive:true});
var ddBtn=$('#ddBtn'),ddPanel=$('#ddPanel');
function setDD(o){ddBtn.setAttribute('aria-expanded',o);ddPanel.classList.toggle('open',o)}
ddBtn.addEventListener('click',function(e){e.stopPropagation();setDD(ddBtn.getAttribute('aria-expanded')!=='true')});
document.addEventListener('click',function(e){if(!ddPanel.contains(e.target))setDD(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(ddPanel.classList.contains('open')){setDD(false);ddBtn.focus()}if(mnav.classList.contains('open'))setMenu(false)}});
var burger=$('#burger'),mnav=$('#mnav');
function setMenu(o){burger.setAttribute('aria-expanded',o);burger.setAttribute('aria-label',o?'Menu sluiten':'Menu openen');mnav.classList.toggle('open',o);document.body.style.overflow=o?'hidden':''}
burger.addEventListener('click',function(){setMenu(burger.getAttribute('aria-expanded')!=='true')});

/* reveal */
var io='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.15}):null;
function observeReveal(){$$('.page.active .reveal:not(.in)').forEach(function(el){if(io&&!reduce)io.observe(el);else el.classList.add('in')})}


$$('.reveal').forEach(function(el){if(io&&!reduce)io.observe(el);else el.classList.add('in')});
/* ================= SCAN DEMO ================= */
var RECEIPTS={
  office:{shop:'PAPIERHUIS',addr:'Oudestraat 12',lines:[['Printpapier A4 5x',28.00,21],['Inktcartridge zwart',25.00,21]],date:'12-04-2026',inv:'B-20418',cat:'Kantoorkosten',flag:null},
  mixed:{shop:'GROOTHANDEL ZUID',addr:'Industrieweg 4',lines:[['Koffiebonen 4 kg',40.00,9],['Schoonmaakmiddelen',25.00,21]],date:'03-04-2026',inv:'G-77102',cat:'Kantoorbenodigdheden',flag:'date'}
};
var cur='office',state='idle',kpi=1284.50,timers=[];
function totals(r){var base={},by={},net=0,vat=0;r.lines.forEach(function(l){net+=l[1];base[l[2]]=(base[l[2]]||0)+l[1]});Object.keys(base).forEach(function(k){by[k]=Math.round(base[k]*k)/100;vat+=by[k]});return {net:net,vat:vat,tot:net+vat,by:by}}
function renderReceipt(el,r,opts){opts=opts||{};var t=totals(r);var h='<h4>'+r.shop+'</h4><div class="c">'+r.addr+'</div><hr>';
  h+='<div class="r'+(opts.blurDate?'':'')+'"><span>Datum</span><span class="'+(r.flag==='date'?'blur':'')+'">'+r.date+'</span></div><div class="r"><span>Bon</span><span>'+r.inv+'</span></div><hr>';
  r.lines.forEach(function(l,i){var inc=l[1]*(1+l[2]/100);h+='<div class="r" data-rate="'+l[2]+'" data-i="'+i+'"><span>'+l[0]+'</span><span>'+inc.toFixed(2).replace('.',',')+'</span></div>'});
  h+='<hr>';Object.keys(t.by).forEach(function(k){h+='<div class="r" data-rate="'+k+'"><span>BTW '+k+'%</span><span>'+t.by[k].toFixed(2).replace('.',',')+'</span></div>'});
  h+='<div class="r" style="font-weight:700;margin-top:4px"><span>TOTAAL</span><span>'+t.tot.toFixed(2).replace('.',',')+'</span></div><hr><div class="c">PIN BETALING</div>';
  el.innerHTML=(opts.keepScan?'<div class="scanline"></div>':'')+h}
function fieldDefs(r){var t=totals(r);var f=[['Leverancier',r.shop.charAt(0)+r.shop.slice(1).toLowerCase()],['Datum',r.date],['Totaal',eur.format(t.tot)]];
  var rates=Object.keys(t.by);if(rates.length>1){f.push(['Btw',rates.map(function(k){return k+'%: '+eur.format(t.by[k])}).join(' · ')])}else{f.push(['Btw '+rates[0]+'%',eur.format(t.vat)])}
  f.push(['Categorie',r.cat]);return f}
/* number animation */
function animateNum(el,from,to,dur,cents){if(reduce||dur===0){el.textContent=(cents?eur:eur0).format(to);return}var s=null;function step(ts){if(!s)s=ts;var p=Math.min(1,(ts-s)/dur),e=1-Math.pow(1-p,3);el.textContent=(cents?eur:eur0).format(from+(to-from)*e);if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)}

/* ================= SCROLL PROGRESS ================= */
var prog=$('#progress');function updProg(){var h=document.documentElement.scrollHeight-innerHeight;prog.style.transform='scaleX('+(h>0?Math.min(1,scrollY/h):0)+')'}
window.addEventListener('scroll',updProg,{passive:true});window.addEventListener('resize',updProg);

/* ================= DEVICE ================= */
$$('[data-dev]').forEach(function(b){b.addEventListener('click',function(){$('#device').dataset.mode=b.dataset.dev;$$('[data-dev]').forEach(function(x){x.setAttribute('aria-pressed',x===b)})})});

if($('#scanDemo')){
function clearTimers(){timers.forEach(clearTimeout);timers=[]}
function resetDemo(){clearTimers();state='idle';var r=RECEIPTS[cur];var rc=$('#receipt');rc.classList.remove('scanning','scanned');renderReceipt($('#receiptBody'),r);
  $('#fields').innerHTML=fieldDefs(r).map(function(f){return '<div class="f"><dt>'+f[0]+'</dt><dd><span class="skel" style="width:'+(40+Math.random()*40)+'%"></span></dd></div>'}).join('');
  $('#checkMsg').hidden=true;$('#moreData').hidden=true;$('#moreData').open=false;
  var b=$('#scanBadge');b.className='badge';b.textContent='Klaar om te scannen';
  var sb=$('#scanBtn');sb.textContent='Scan deze bon';sb.disabled=false;$('#resetBtn').hidden=true;rc.classList.add('can-drag')}
function runScan(){if(state!=='idle')return;var r=RECEIPTS[cur],t=totals(r);state='scanning';var rc=$('#receipt');rc.classList.remove('can-drag');rc.classList.remove('scanning');void rc.offsetWidth;rc.classList.add('scanning');
  var b=$('#scanBadge');b.className='badge busy';b.textContent='Herkennen…';$('#scanBtn').disabled=true;
  var defs=fieldDefs(r),rows=$$('#fields .f'),d=reduce?0:1300;
  defs.forEach(function(f,i){timers.push(setTimeout(function(){var row=rows[i];
    if(r.flag==='date'&&f[0]==='Datum'){row.classList.add('flag');row.innerHTML='<dt>Datum?</dt><dd><label class="sr" for="dateFix">Controleer de datum</label><input id="dateFix" value="0?-04-2026" inputmode="numeric" aria-describedby="checkMsg"></dd>'}
    else{row.innerHTML='<dt>'+f[0]+'</dt><dd title="'+esc(f[1])+'">'+esc(f[1])+'</dd>';row.classList.add('filled')}
  },d+i*(reduce?0:260)))});
  timers.push(setTimeout(function(){rc.classList.add('scanned');rc.classList.remove('scanning');
    var c=$('#checkMsg');c.hidden=false;
    var math=eur.format(t.net)+' + '+eur.format(t.vat)+' btw = '+eur.format(t.tot);
    $('#moreFields').innerHTML='<div class="f"><dt>Excl. btw</dt><dd class="num">'+eur.format(t.net)+'</dd></div><div class="f"><dt>Bonnummer</dt><dd>'+r.inv+'</dd></div><div class="f"><dt>Betaalwijze</dt><dd>Pin</dd></div>';$('#moreData').hidden=false;
    var sb=$('#scanBtn');sb.textContent='Goedkeuren';$('#resetBtn').hidden=false;
    if(r.flag){c.className='check warn';c.innerHTML=WARN+'<span><b>Controleer 1 ding.</b> De datum is slecht leesbaar. De bedragen kloppen: '+math+'.</span>';b.className='badge warn';b.textContent='1 ding controleren';sb.disabled=true;state='flag';
      var inp=$('#dateFix');inp.addEventListener('input',function(){var ok=/^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-20\d\d$/.test(inp.value.trim());inp.classList.toggle('valid',ok);sb.disabled=!ok;if(ok){b.className='badge ok';b.textContent='Klaar om op te slaan';c.className='check ok';c.innerHTML=CHECK+'<span>Top. Alles klopt: '+math+'.</span>'}});
      if(!reduce)setTimeout(function(){inp.focus();inp.select()},50)}
    else{c.className='check ok';c.innerHTML=CHECK+'<span>Rekensom klopt: '+math+'.</span>';b.className='badge ok';b.textContent='Herkend';sb.disabled=false;state='review'}
  },d+defs.length*(reduce?0:260)+(reduce?0:200)))}
function approve(){var t=totals(RECEIPTS[cur]);var from=kpi;kpi+=t.tot;animateNum($('#miniKpiVal'),from,kpi,700,true);var m=$('#miniKpi');m.classList.remove('bump');void m.offsetWidth;m.classList.add('bump');
  var b=$('#scanBadge');b.className='badge ok';b.textContent='Opgeslagen';var sb=$('#scanBtn');sb.disabled=true;sb.textContent='Opgeslagen';state='done';toast('Opgeslagen. Je overzicht is bijgewerkt.')}
$('#scanBtn').addEventListener('click',function(){if(state==='idle')runScan();else if(state==='review'||state==='flag')approve()});
$('#resetBtn').addEventListener('click',resetDemo);
$$('[data-rc]').forEach(function(btn){btn.addEventListener('click',function(){cur=btn.dataset.rc;$$('[data-rc]').forEach(function(x){x.setAttribute('aria-pressed',x===btn)});resetDemo()})});

/* ================= DRAG RECEIPT ================= */
(function(){var rc=$('#receipt'),panel=$('#scanDemo .panel'),d=null;
  function over(){var a=rc.getBoundingClientRect(),b=panel.getBoundingClientRect(),cx=a.left+a.width/2,cy=a.top+a.height/2;return cx>b.left&&cx<b.right&&cy>b.top&&cy<b.bottom}
  rc.addEventListener('pointerdown',function(e){if(state!=='idle'||e.pointerType!=='mouse')return;e.preventDefault();d={x:e.clientX,y:e.clientY};rc.setPointerCapture(e.pointerId);rc.classList.add('dragging')});
  rc.addEventListener('pointermove',function(e){if(!d)return;rc.style.transform='translate('+(e.clientX-d.x)+'px,'+(e.clientY-d.y)+'px) rotate(3deg)';panel.classList.toggle('drop-ok',over())});
  function end(){if(!d)return;var hit=over();d=null;rc.classList.remove('dragging');panel.classList.remove('drop-ok');rc.style.transition='transform .35s cubic-bezier(.3,1.3,.5,1)';rc.style.transform='';setTimeout(function(){rc.style.transition=''},360);if(hit)runScan()}
  rc.addEventListener('pointerup',end);rc.addEventListener('pointercancel',end)})();

resetDemo();
}
if($('#jargonSwitch')){
/* ================= JARGON ================= */
var TERMS=[['Debiteurenbeheer','Klanten'],['Crediteuren','Leveranciers'],['Openstaande posten','Nog te ontvangen'],['Voorbelasting','Btw op je kosten'],['Boekstuk','Document'],['Mutatie verwerken','Transactie verwerken']];
$('#terms').innerHTML=TERMS.map(function(t,i){return '<li class="term" style="transition-delay:'+(i*60)+'ms"><div class="term-in" style="transition-delay:'+(i*60)+'ms"><span class="face front">'+t[0]+'</span><span class="face back">'+t[1]+'</span></div></li>'}).join('');
var js=$('#jargonSwitch');js.addEventListener('click',function(){var on=js.getAttribute('aria-checked')!=='true';js.setAttribute('aria-checked',on);$('#jargonLabel').textContent=on?'Boekuna-taal':'Boekhoudtaal';$$('#terms .term').forEach(function(t){t.classList.toggle('flip',on)})});
if(io&&!reduce){var jio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){setTimeout(function(){if(js.getAttribute('aria-checked')==='false')js.click()},700);jio.disconnect()}})},{threshold:.6});jio.observe($('#terms'))}

}
if($('#functies')){
/* ================= TABS ================= */
var tabs=$$('.tab');
function selectTab(name,focus){tabs.forEach(function(t){var on=t.id==='t-'+name;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;$('#'+t.getAttribute('aria-controls')).hidden=!on;if(on&&focus)t.focus()});if(name==='rapportages')drawChart()}
tabs.forEach(function(t,i){t.addEventListener('click',function(){selectTab(t.id.slice(2))});
  t.addEventListener('keydown',function(e){var k=e.key,n=null;if(k==='ArrowRight')n=(i+1)%tabs.length;if(k==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;if(k==='Home')n=0;if(k==='End')n=tabs.length-1;if(n!==null){e.preventDefault();selectTab(tabs[n].id.slice(2),true)}})});

/* invoice */
var lines=[{d:'Logo-ontwerp',q:1,p:650,r:21},{d:'Revisieronde',q:2,p:85,r:21}];
var invLines=$('#invLines');
function drawLines(){$$('.inv-line:not(.head)',invLines).forEach(function(n){n.remove()});
  lines.forEach(function(l,i){var row=document.createElement('div');row.className='inv-line';
    row.innerHTML='<input class="in" aria-label="Omschrijving regel '+(i+1)+'" value="'+esc(l.d)+'" data-k="d">'+
    '<input class="in num" aria-label="Aantal" inputmode="numeric" value="'+l.q+'" data-k="q">'+
    '<input class="in num" aria-label="Prijs per stuk" inputmode="decimal" value="'+String(l.p.toFixed(2)).replace('.',',')+'" data-k="p">'+
    '<select class="sel rate" aria-label="Btw-tarief" data-k="r"><option value="21"'+(l.r===21?' selected':'')+'>21%</option><option value="9"'+(l.r===9?' selected':'')+'>9%</option><option value="0"'+(l.r===0?' selected':'')+'>0%</option></select>'+
    '<button class="icon-btn" type="button" aria-label="Regel verwijderen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    $$('[data-k]',row).forEach(function(inp){inp.addEventListener('input',function(){var k=inp.dataset.k;l[k]=k==='d'?inp.value:k==='r'?+inp.value:parseNum(inp.value);calcInv()})});
    $('.icon-btn',row).addEventListener('click',function(){lines.splice(i,1);drawLines()});
    invLines.appendChild(row)});calcInv()}
function calcInv(){var sub=0,by={};lines.forEach(function(l){var n=l.q*l.p;sub+=n;by[l.r]=(by[l.r]||0)+n*l.r/100});
  $('#tSub').textContent=eur.format(sub);var vt=0;$('#tVat').innerHTML=Object.keys(by).sort(function(a,b){return b-a}).map(function(k){vt+=by[k];return '<div class="r"><span class="p-muted">Btw '+k+'%</span><span class="num">'+eur.format(by[k])+'</span></div>'}).join('');
  $('#tTot').textContent=eur.format(sub+vt);invTotal=Math.round((sub+vt)*100)/100;if(invState)invRender()}
$('#addLine').addEventListener('click',function(){lines.push({d:'',q:1,p:0,r:21});drawLines();var ins=$$('.inv-line:last-child input',invLines);if(ins[0])ins[0].focus()});
drawLines();
var invTotal,invState={s:'concept',paid:0};
function invRender(){var st=$('#invStatus'),rest=Math.max(0,Math.round((invTotal-invState.paid)*100)/100),late=$('#invDue').value==='past';
  if(invState.s==='open'&&rest<=0)invState.s='paid';
  if(invState.s==='concept'){st.textContent='Concept';st.className='badge'}
  else if(invState.s==='paid'){st.textContent='Betaald';st.className='badge ok'}
  else if(late){st.textContent='Te laat';st.className='badge late'}
  else{st.textContent='Openstaand';st.className='badge open'}
  $('#invPay').hidden=invState.s==='concept';$('#invSent').hidden=invState.s!=='concept';
  $('#payInfo').textContent=invState.s==='paid'?'Volledig betaald. Nog te ontvangen is bijgewerkt.':invState.paid>0?'Al betaald: '+eur.format(invState.paid)+'. Nog te ontvangen: '+eur.format(rest)+'.':'Nog te ontvangen: '+eur.format(rest)+'.';
  $('#payBtn').disabled=invState.s==='paid';$('#payAmt').disabled=invState.s==='paid'}
$('#invPdf').addEventListener('click',function(){toast('PDF klaar. Deel hem via je mailapp.')});
$('#invSent').addEventListener('click',function(){invState.s='open';invRender();toast('Gemarkeerd als verzonden naar '+$('#invClient').value+'.');$('#payAmt').focus()});
$('#invDue').addEventListener('change',invRender);
$('#payBtn').addEventListener('click',function(){var a=parseNum($('#payAmt').value);if(a<=0){$('#payAmt').focus();return}invState.paid=Math.round((invState.paid+a)*100)/100;$('#payAmt').value='';invRender();toast(invState.s==='paid'?'Betaald. Factuur is afgerond.':'Gedeeltelijke betaling verwerkt.')});
calcInv();


/* docs */
var DOCS=[{n:'Adobe Creative Cloud',d:'02-04-2026',a:72.59,c:'Software',s:'ok',x:[['Excl. btw','€ 59,99'],['Btw 21%','€ 12,60'],['Factuurnummer','IEN2026-0417'],['Betaalwijze','Creditcard']]},
  {n:'NS Zakelijk',d:'05-04-2026',a:23.40,c:'Reiskosten',s:'ok',x:[['Excl. btw','€ 21,47'],['Btw 9%','€ 1,93'],['Traject','Kampen – Zwolle v.v.'],['Betaalwijze','Pin']]},
  {n:'Coolblue',d:'08-04-2026',a:149.00,c:'Apparatuur',s:'warn',x:[['Let op','Categorie onzeker: kantoor of apparatuur?'],['Excl. btw','€ 123,14'],['Btw 21%','€ 25,86'],['Factuurnummer','CB-55821']]},
  {n:'Papierhuis',d:'12-04-2026',a:64.13,c:'Kantoorkosten',s:'ok',x:[['Excl. btw','€ 53,00'],['Btw 21%','€ 11,13'],['Bonnummer','B-20418'],['Betaalwijze','Pin']]}];
function drawDocs(){var host=$('#doclist');host.innerHTML='';var warn=0;
  DOCS.forEach(function(d,i){if(d.s==='warn')warn++;var b=document.createElement('button');b.type='button';b.className='docrow';b.setAttribute('aria-expanded','false');
    b.innerHTML='<span class="ico">'+(d.s==='warn'?WARN:CHECK)+'</span><span class="grow"><strong>'+d.n+'</strong><small>'+d.d+' · '+d.c+'</small></span><span class="num" style="font-weight:700">'+eur.format(d.a)+'</span>';
    var det=document.createElement('div');det.className='docdetail';det.hidden=true;det.innerHTML=d.x.map(function(x){return '<span>'+x[0]+'</span><b>'+x[1]+'</b>'}).join('')+(d.s==='warn'?'<div style="grid-column:1/-1;display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" type="button" data-c="Kantoorkosten">Kantoorkosten</button><button class="btn btn-ghost btn-sm" type="button" data-c="Apparatuur">Apparatuur</button></div>':'');
    b.addEventListener('click',function(){var o=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',o);det.hidden=!o});
    $$('[data-c]',det).forEach(function(cb){cb.addEventListener('click',function(){d.c=cb.dataset.c;d.s='ok';d.x.shift();drawDocs();toast('Gecontroleerd en opgeslagen.')})});
    host.appendChild(b);host.appendChild(det)});
  var dc=$('#docCount');dc.className='badge '+(warn?'warn':'ok');dc.textContent=warn?warn+' heeft aandacht nodig':'Alles gecontroleerd'}
drawDocs();

/* btw calc */
var rate=21;
function calcVat(){var o=+$('#omzet').value,k=+$('#kosten').value;var vin=o*rate/100,vout=k*21/121,res=Math.max(0,vin-vout);
  $('#omzetOut').textContent=eur0.format(o);$('#kostenOut').textContent=eur0.format(k);$('#vatIn').textContent=eur.format(vin);$('#vatOut').textContent='− '+eur.format(vout);$('#vatRes').textContent=eur.format(res)}
$('#omzet').addEventListener('input',calcVat);$('#kosten').addEventListener('input',calcVat);
$$('[data-rate]').forEach(function(b){if(b.tagName!=='BUTTON')return;b.addEventListener('click',function(){rate=+b.dataset.rate;$$('button[data-rate]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});calcVat()})});
calcVat();

/* bank */
var TX=[{d:'03-04',w:'Studio Noord',a:820.00,s:'Factuur 2026-013',m:false},{d:'05-04',w:'NS Reizigers',a:-23.40,s:'Bon NS Zakelijk',m:false},{d:'08-04',w:'Coolblue BV',a:-149.00,s:'Bon Coolblue',m:false},{d:'10-04',w:'Albert Heijn 1234',a:-18.65,s:null,m:false}];
function drawTx(){var h='',open=0;TX.forEach(function(t,i){if(!t.m&&t.s)open++;
  h+='<div class="tx'+(t.m?' matched':'')+'"><div><strong>'+t.w+'</strong><div class="p-muted" style="font-size:13px">'+t.d+'-2026</div></div><span class="amt num" style="color:'+(t.a>0?'var(--green-ink)':'var(--ink)')+'">'+(t.a>0?'+ ':'− ')+eur.format(Math.abs(t.a))+'</span>'+
  '<div class="sug">'+(t.m?'<span>'+CHECK+' Gekoppeld aan '+t.s+'</span><button class="btn btn-ghost btn-sm" data-u="'+i+'" type="button">Ontkoppelen</button>':t.s?'<span>Voorstel: '+t.s+'</span><button class="btn btn-primary btn-sm" data-m="'+i+'" type="button">Koppelen</button>':'<span>Geen voorstel. Privé of zakelijk?</span><span style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-p="'+i+'" type="button">Privé</button></span>')+'</div></div>'});
  $('#txlist').innerHTML=h;$('#bankBadge').textContent=open?open+' voorstellen':'Alles gekoppeld';$('#bankBadge').className='badge'+(open?'':' ok');
  $$('[data-m]').forEach(function(b){b.addEventListener('click',function(){TX[+b.dataset.m].m=true;drawTx();toast('Transactie gekoppeld.')})});
  $$('[data-u]').forEach(function(b){b.addEventListener('click',function(){TX[+b.dataset.u].m=false;drawTx()})});
  $$('[data-p]').forEach(function(b){b.addEventListener('click',function(){TX[+b.dataset.p].s='Privé';TX[+b.dataset.p].m=true;drawTx();toast('Gemarkeerd als privé.')})})}
drawTx();

/* chart */
var MONTHS=['mei','jun','jul','aug','sep','okt','nov','dec','jan','feb','mrt','apr'];
var OMZ=[3900,4200,2800,3100,4600,5200,4800,3600,4100,4400,4900,5300],KOS=[900,1100,700,800,1300,1000,1200,1500,800,950,1100,1050],per=6;
function drawChart(){var host=$('#chart');var n=per,m=MONTHS.slice(12-n),o=OMZ.slice(12-n),k=KOS.slice(12-n);var W=560,H=240,pad=34,max=6000,gw=(W-pad)/n,bw=Math.min(22,gw/3.2);
  var s='<svg viewBox="0 0 '+W+' '+(H+28)+'" role="img" aria-label="Staafdiagram omzet en kosten per maand">';
  [0,2000,4000,6000].forEach(function(v){var y=H-v/max*H;s+='<line x1="'+pad+'" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/><text x="0" y="'+(y+4)+'" font-size="11" fill="var(--muted)">'+(v/1000)+'k</text>'});
  m.forEach(function(mm,i){var x=pad+gw*i+gw/2,ho=o[i]/max*H,hk=k[i]/max*H;
    s+='<g class="bar" tabindex="0" data-i="'+i+'" aria-label="'+mm+': omzet '+eur0.format(o[i])+', kosten '+eur0.format(k[i])+', winst '+eur0.format(o[i]-k[i])+'">'+
    '<rect x="'+(x-gw/2+2)+'" y="0" width="'+(gw-4)+'" height="'+H+'" fill="transparent"/>'+
    '<rect x="'+(x-bw-2)+'" y="'+(H-ho)+'" width="'+bw+'" height="'+ho+'" rx="4" fill="var(--green)"><animate attributeName="height" from="0" to="'+ho+'" dur="'+(reduce?'0.01':'.6')+'s" fill="freeze"/><animate attributeName="y" from="'+H+'" to="'+(H-ho)+'" dur="'+(reduce?'0.01':'.6')+'s" fill="freeze"/></rect>'+
    '<rect x="'+(x+2)+'" y="'+(H-hk)+'" width="'+bw+'" height="'+hk+'" rx="4" fill="var(--line)"/>'+
    '<text x="'+x+'" y="'+(H+20)+'" font-size="12" text-anchor="middle" fill="var(--muted)">'+mm+'</text></g>'});
  s+='</svg>';host.innerHTML='<div class="tip" id="tip"></div>'+s;var tip=$('#tip',host);
  $$('.bar',host).forEach(function(g){function on(){var i=+g.dataset.i;var r=g.getBoundingClientRect(),hr=host.getBoundingClientRect();tip.innerHTML='<b>'+m[i]+'</b><br>Omzet '+eur0.format(o[i])+'<br>Kosten '+eur0.format(k[i])+'<br>Winst '+eur0.format(o[i]-k[i]);tip.style.left=(r.left-hr.left+r.width/2)+'px';tip.style.top=(r.top-hr.top+20)+'px';tip.classList.add('show')}
    g.addEventListener('mouseenter',on);g.addEventListener('focus',on);g.addEventListener('click',on);g.addEventListener('mouseleave',function(){tip.classList.remove('show')});g.addEventListener('blur',function(){tip.classList.remove('show')})})}
$$('[data-per]').forEach(function(b){b.addEventListener('click',function(){per=+b.dataset.per;$$('[data-per]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});drawChart()})});

/* ================= UPLOAD SIM ================= */
var upT=[];
$('#upBtn').addEventListener('click',function(){upT.forEach(clearTimeout);upT=[];var host=$('#uplist');
  var U=[{n:'factuur_hosting_okt.pdf',m:'PDF · 2 pagina\'s',r:'ok'},{n:'IMG_4821.HEIC',m:'Foto · lange kassabon',r:'check'},{n:'scan_wazig.jpg',m:'JPEG · donkere foto',r:'fail'},{n:'papierhuis_bon.jpg',m:'JPEG',r:'dup'}];
  host.innerHTML=U.map(function(u,i){return '<div class="uprow" id="up'+i+'"><span class="grow"><strong>'+u.n+'</strong><small>'+u.m+'</small></span><span class="badge busy">Verwerken</span></div>'}).join('');
  $('#upBtn').disabled=true;
  function set(i,html){var r=$('#up'+i);r.innerHTML=r.querySelector('.grow').outerHTML+html}
  function fin(i){var u=U[i];
    if(u.r==='ok')set(i,'<span class="badge ok">Klaar</span>');
    if(u.r==='check')set(i,'<span class="badge warn">Controle nodig</span><button class="btn btn-ghost btn-sm" type="button" data-ok="'+i+'">Totaal klopt</button>');
    if(u.r==='fail')set(i,'<span class="badge err">Mislukt</span><button class="btn btn-ghost btn-sm" type="button" data-retry="'+i+'">Opnieuw proberen</button>');
    if(u.r==='dup')set(i,'<span class="badge info">Lijkt dubbel</span><small style="flex-basis:100%;color:var(--muted)">Zelfde leverancier, datum en bedrag als Papierhuis, 12-04-2026, € 64,13.</small><button class="btn btn-ghost btn-sm" type="button" data-del="'+i+'">Niet toevoegen</button><button class="btn btn-ghost btn-sm" type="button" data-keep="'+i+'">Toch toevoegen</button>');
    if(i===U.length-1)$('#upBtn').disabled=false}
  U.forEach(function(u,i){upT.push(setTimeout(function(){fin(i)},reduce?0:800+i*550))});
  host.onclick=function(e){var b=e.target.closest('button');if(!b)return;
    if(b.dataset.ok){set(+b.dataset.ok,'<span class="badge ok">Klaar</span>');toast('Gecontroleerd en opgeslagen.')}
    if(b.dataset.retry){var i=+b.dataset.retry;set(i,'<span class="badge busy">Verwerken</span>');setTimeout(function(){set(i,'<span class="badge ok">Klaar</span>')},reduce?0:1100)}
    if(b.dataset.del){var r=$('#up'+b.dataset.del);r.remove();toast('Dubbel document niet toegevoegd.')}
    if(b.dataset.keep){set(+b.dataset.keep,'<span class="badge ok">Klaar</span>')}}});


function tabFromHash(){var h=location.hash.slice(1);if(['facturen','bonnen','btw','bank','rapportages'].indexOf(h)>-1){selectTab(h);var f=$('#functies');if(f)setTimeout(function(){f.scrollIntoView({behavior:reduce?'auto':'smooth'})},30)}}
window.addEventListener('hashchange',tabFromHash);tabFromHash();
}
if($('#seglist')){
/* segments */
var SEGS=[{t:'Creatieve freelancers',tags:['Fotografen','Designers','Videomakers','Marketeers'],p:'Veel kleine uitgaven, softwareabonnementen, apparatuur en facturen per project. Boekuna houdt het bij terwijl jij maakt.',l:['Abonnementen zoals Adobe of Figma snel verwerkt','Apparatuur en projectkosten overzichtelijk','Projectfacturen in een paar minuten']},
  {t:'Coaches en consultants',tags:['Coaches','Trainers','Adviseurs','Developers'],p:'Weinig transacties, vooral diensten. Je wilt snel factureren en weten wat er nog binnen moet komen.',l:['Facturen per sessie of traject','Reiskosten en software bij elkaar','Altijd zicht op wat nog te ontvangen is']},
  {t:'Startende zzp\'ers',tags:['Net begonnen','Eerste klanten','Bijverdienste'],p:'Net begonnen? Je hoeft niet eerst boekhouden te leren. Boekuna legt uit wat omzet, kosten, winst en btw betekenen, op het moment dat je het nodig hebt.',l:['Uitleg in gewone taal','Begin gratis, zonder creditcard','Je groeit mee zonder over te stappen']}];
var segi=0;function drawSeg(){$('#seglist').innerHTML=SEGS.map(function(s,i){return '<button class="segbtn" role="tab" type="button" aria-selected="'+(i===segi)+'" data-seg="'+i+'">'+s.t+'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>'}).join('');
  var s=SEGS[segi];$('#segcard').innerHTML='<h3 class="h3" style="font-size:26px;font-family:var(--display)">'+s.t+'</h3><p style="color:var(--ink-2);margin:12px 0 0">'+s.p+'</p><ul>'+s.l.map(function(x){return '<li>'+x+'</li>'}).join('')+'</ul><div class="tags">'+s.tags.map(function(x){return '<span>'+x+'</span>'}).join('')+'</div>';
  $$('[data-seg]').forEach(function(b){b.addEventListener('click',function(){segi=+b.dataset.seg;drawSeg();$('[data-seg="'+segi+'"]').focus()})})}
drawSeg();

}
/* pricing */
var PLANS=[{n:'Gratis',p:'€0',s:'',d:'Om rustig te beginnen.',f:['Basisadministratie','10 slimme documentchecks per maand'],u:'https://app.boekuna.nl/?register=1',c:'Gratis beginnen',lim:10},
  {n:'Boekuna',p:'€9,95',s:' p/m excl. btw',d:'Voor de meeste zzp\'ers.',f:['Alles uit Gratis','100 slimme documentchecks per maand'],u:'https://app.boekuna.nl/?register=1&plan=boekuna',c:'Kies Boekuna',lim:100},
  {n:'Unlimited',p:'€19,95',s:' p/m excl. btw',d:'Veel bonnen, geen limiet.',f:['Alles uit Boekuna','Geen maandlimiet op documentchecks'],u:'https://app.boekuna.nl/?register=1&plan=pro',c:'Kies Unlimited',lim:Infinity}];
$$('[data-pricing]').forEach(function(host,hi){var id='docs'+hi,full=host.dataset.pricing==='full';
  host.innerHTML=(full?'<div class="plan-finder"><div><label class="lb" for="'+id+'" style="font-size:15px;color:var(--ink)">Hoeveel bonnen en inkoopfacturen heb je per maand?</label><p class="p-muted" style="margin:4px 0 0;font-size:14px">Eén documentcheck is één document dat Boekuna voor je uitleest.</p></div>'+
  '<div><div style="display:flex;justify-content:space-between;align-items:baseline"><output class="num" id="'+id+'o" style="font-family:var(--display);font-weight:700;font-size:28px"></output><span class="p-muted" style="font-size:14px" id="'+id+'r"></span></div><input class="range" type="range" id="'+id+'" min="0" max="200" step="1" value="25"></div></div>':'')+
  '<div class="plans">'+PLANS.map(function(p){return '<div class="plan"><span class="tag">Past bij jou</span><div><h3 class="h3">'+p.n+'</h3><p class="p-muted" style="margin:4px 0 0;font-size:15px">'+p.d+'</p></div><div class="price">'+p.p+'<small>'+p.s+'</small></div><ul>'+p.f.map(function(f){return '<li>'+CHECK+f+'</li>'}).join('')+'</ul><a class="btn '+(p.n==='Gratis'?'btn-ghost':'btn-primary')+'" href="'+p.u+'">'+p.c+'</a></div>'}).join('')+'</div>';
  if(!full)return;var r=$('#'+id),out=$('#'+id+'o'),rec=$('#'+id+'r'),cards=$$('.plan',host);
  function upd(){var v=+r.value;out.textContent=(v>=200?'200+':v)+' per maand';var i=v<=10?0:v<=100?1:2;cards.forEach(function(c,j){c.classList.toggle('rec',j===i)});rec.textContent='Advies: '+PLANS[i].n}
  r.addEventListener('input',upd);upd()});
var CMP=[['Facturen en creditnota\'s',1,1,1],['Kosten en bonnen bijhouden',1,1,1],['Documenten uploaden',1,1,1],['Slimme documentchecks per maand','10','100','Onbeperkt'],['Btw-overzicht per periode',1,1,1],['Bankbestanden importeren en koppelen',1,1,1],['Rapportages',1,1,1],['Export van je administratie',1,1,1],['Maandelijks opzegbaar','–',1,1]];
if($('#cmpBody'))$('#cmpBody').innerHTML=CMP.map(function(r){return '<tr><th scope="row" style="font-weight:500">'+r[0]+'</th>'+r.slice(1).map(function(c){return '<td>'+(c===1?CHECK+'<span class="sr">Inbegrepen</span>':'<span class="num" style="font-weight:600">'+c+'</span>')+'</td>'}).join('')+'</tr>'}).join('');

if($('#flowline')){
/* scanner page */
var FLOW=[['Upload','Foto, PDF of scan.','Sleep een bestand in Boekuna of maak een foto met je telefoon. Ondersteund: PDF, JPEG, PNG en HEIC-foto’s van je telefoon, ook documenten met meerdere pagina’s. Scheve, donkere of lange bonnen worden waar mogelijk eerst verbeterd.'],
  ['Herkennen','Boekuna zoekt de gegevens.','Leverancier, datum, factuurnummer, totaal, bedrag excl. btw, btw en btw-tarief worden waar mogelijk automatisch opgehaald.'],
  ['Narekenen','Kloppen de cijfers?','Boekuna controleert of excl. btw plus btw gelijk is aan het totaal, ook bij meerdere tarieven op één bon.'],
  ['Twijfel','Alleen wat nodig is.','Is iets onzeker, dan vraagt Boekuna je alleen dat ene onderdeel te bekijken. Niet een heel formulier.'],
  ['Opslaan','Na jouw akkoord.','Pas als jij goedkeurt, wordt het document verwerkt en je overzicht bijgewerkt. Lijkt het document al eerder toegevoegd, dan zie je dat eerst.']];
var fi=0;function drawFlow(){$('#flowline').innerHTML=FLOW.map(function(f,i){return '<button class="flowstep'+(i===fi?' on':'')+'" type="button" data-f="'+i+'" aria-pressed="'+(i===fi)+'"><h3>'+f[0]+'</h3><p>'+f[1]+'</p></button>'}).join('');
  $('#flowDetail').innerHTML='<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;justify-content:space-between"><div style="max-width:60ch"><strong style="font-family:var(--display);font-size:20px">'+(fi+1)+'. '+FLOW[fi][0]+'</strong><p style="margin:8px 0 0;color:var(--ink-2)">'+FLOW[fi][2]+'</p></div><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" type="button" id="fPrev"'+(fi===0?' disabled':'')+'>Vorige</button><button class="btn btn-primary btn-sm" type="button" id="fNext"'+(fi===FLOW.length-1?' disabled':'')+'>Volgende stap</button></div></div>';
  $$('[data-f]').forEach(function(b){b.addEventListener('click',function(){fi=+b.dataset.f;drawFlow()})});
  $('#fPrev').addEventListener('click',function(){fi--;drawFlow()});$('#fNext').addEventListener('click',function(){fi++;drawFlow()})}
drawFlow();
var mr=RECEIPTS.mixed;renderReceipt($('#mixedReceipt'),{shop:mr.shop,addr:mr.addr,lines:mr.lines,date:mr.date,inv:mr.inv,flag:null});
var mt=totals(mr);
$('#vatSplit').innerHTML=Object.keys(mt.by).sort().map(function(k){var base=mr.lines.filter(function(l){return l[2]==k}).reduce(function(a,l){return a+l[1]},0);return '<div class="vat-row" data-vr="'+k+'"><div><strong>Btw '+k+'%</strong><div class="p-muted" style="font-size:13.5px">over '+eur.format(base)+'</div></div><b class="num" style="font-family:var(--display);font-size:22px">'+eur.format(mt.by[k])+'</b></div>'}).join('')+
  '<div class="vat-row" style="background:var(--dark);color:var(--on-dark);border-color:transparent"><strong>Totaal btw</strong><b class="num" style="font-family:var(--display);font-size:22px">'+eur.format(mt.vat)+'</b></div>';
function hl(rate,on){$$('#mixedReceipt [data-rate="'+rate+'"]').forEach(function(r){r.classList.toggle('hl',on)});var v=$('[data-vr="'+rate+'"]');if(v)v.classList.toggle('on',on)}
$$('#mixedReceipt [data-rate], #vatSplit [data-vr]').forEach(function(el){var k=el.dataset.rate||el.dataset.vr;el.addEventListener('mouseenter',function(){hl(k,true)});el.addEventListener('mouseleave',function(){hl(k,false)});el.addEventListener('click',function(){$$('.hl,.vat-row.on').forEach(function(x){x.classList.remove('hl','on')});hl(k,true)})});
if(window.matchMedia('(max-width:560px)').matches){$('#mixedUi').style.gridTemplateColumns='1fr'}

/* ================= NUMBER GAME ================= */
var NUMS=[['81234567','KVK-nummer',0],['NL859123456B01','Btw-id',0],['NL91 ABNA 0417 1643 00','IBAN',0],['ORD-55821','Ordernummer',0],['2026-0417','Factuurnummer',1],['8261 AB','Postcode',0]];
$('#numdoc').innerHTML=NUMS.map(function(n,i){return '<button class="numbtn" type="button" data-n="'+i+'">'+n[0]+'<small></small></button>'}).join('');
$$('[data-n]').forEach(function(b){b.addEventListener('click',function(){var n=NUMS[+b.dataset.n],v=$('#numVerdict');
  $$('[data-n]').forEach(function(x){var m=NUMS[+x.dataset.n];x.querySelector('small').textContent=m[1];x.classList.toggle('right',m[2]===1)});
  if(n[2]){b.classList.add('right');v.className='verdict ok';v.innerHTML=CHECK+'<span>Goed! Boekuna kiest ook 2026-0417 en negeert de andere nummers.</span>'}
  else{b.classList.add('wrong');v.className='verdict warn';v.innerHTML=WARN+'<span>Dat is het '+n[1]+'. Boekuna herkent dit verschil en kiest 2026-0417.</span>'}})});

/* ================= TWO OF THREE ================= */
function verdict(){var f=['#mcNet','#mcVat','#mcTot'].map(function(s){return $(s).value.trim()}),empty=f.filter(function(x){return x===''}).length,el=$('#verdict');
  var n=parseNum(f[0]),v=parseNum(f[1]),t=parseNum(f[2]);
  if(empty===1){var calc,lab;if(!f[0]){calc=t-v;lab='Excl. btw'}else if(!f[1]){calc=t-n;lab='Btw'}else{calc=n+v;lab='Totaal'}
    el.className='verdict info';el.innerHTML=CHECK+'<span>Twee van de drie bekend. Boekuna rekent uit: '+lab+' = '+eur.format(calc)+'.</span>';return}
  if(empty>1){el.className='verdict info';el.innerHTML='<span>Vul minstens twee bedragen in.</span>';return}
  var d=Math.round((n+v-t)*100)/100;
  if(Math.abs(d)<0.02){el.className='verdict ok';el.innerHTML=CHECK+'<span>Klopt: '+eur.format(n)+' + '+eur.format(v)+' = '+eur.format(t)+'</span>'}
  else{el.className='verdict warn';el.innerHTML=WARN+'<span>Controleer dit even: '+eur.format(n)+' + '+eur.format(v)+' = '+eur.format(n+v)+', maar op de bon staat '+eur.format(t)+'. Boekuna past dit niet stilletjes aan.</span>'}}
['#mcNet','#mcVat','#mcTot'].forEach(function(s){$(s).addEventListener('input',verdict)});verdict();

}
if($('#secGrid')){
/* security */
var SEC=[['Beveiligde verbinding','Alles tussen jou en Boekuna gaat via een versleutelde verbinding (HTTPS).'],['Gescheiden administraties','De gegevens van verschillende klanten zijn van elkaar gescheiden. Je hebt alleen toegang tot je eigen administratie.'],['Toegangscontrole in de database','Beveiliging op databaseniveau bepaalt per account welke gegevens gelezen of gewijzigd mogen worden.'],['Accountbeveiliging','Inloggen met e-mail en wachtwoord, met bevestiging van je e-mailadres.'],['Privacygericht scannen','De standaard documentherkenning werkt zonder externe generatieve AI. Je documenten gaan niet onnodig naar andere diensten.'],['Geen verkoop van data','We verkopen je administratieve gegevens niet en gebruiken ze niet voor advertenties.'],['Exporteren en verwijderen','Je kunt je gegevens exporteren en je account zelf verwijderen, ook als je niet meer kunt inloggen.']];
$('#secGrid').innerHTML=SEC.map(function(s){return '<div class="trust-item"><span class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg></span><h3>'+s[0]+'</h3><p>'+s[1]+'</p></div>'}).join('');

}
/* FAQ data */
var FAQ=[
 {c:'Beginnen',q:'Wat is Boekuna?',a:'Boekhoudsoftware voor zzp\'ers, freelancers en kleine ondernemers. Je maakt facturen, houdt kosten en bonnen bij en ziet je btw en resultaat, zonder boekhoudtaal.',h:1},
 {c:'Beginnen',q:'Heb ik boekhoudkennis nodig?',a:'Nee. Boekuna gebruikt gewone woorden en legt uit wat iets betekent als je het tegenkomt.',h:1},
 {c:'Beginnen',q:'Voor wie is Boekuna?',a:'Voor zelfstandigen met een relatief eenvoudige administratie, zonder voorraad.'},
 {c:'Scanner',q:'Kan Boekuna bonnetjes scannen?',a:'Ja. Upload een foto, scan of PDF. Boekuna leest de belangrijkste gegevens uit en jij controleert ze voordat ze worden opgeslagen.',h:1},
 {c:'Scanner',q:'Wat gebeurt er als Boekuna iets niet zeker weet?',a:'Boekuna herkent zoveel mogelijk automatisch, maar elke bon is anders. Twijfelt Boekuna, dan zie je precies welk onderdeel je moet controleren.',h:1},
 {c:'Scanner',q:'Kan Boekuna meerdere btw-tarieven herkennen?',a:'Ja. Staan er 9% en 21% op één bon, dan splitst Boekuna de btw per tarief.'},
 {c:'Facturen',q:'Kan ik facturen maken?',a:'Ja. Je maakt facturen en creditnota\'s als PDF en ziet welke betaald zijn en welke nog openstaan.',h:1},
 {c:'Btw',q:'Kan ik mijn btw-aangifte direct indienen?',a:'Nog niet rechtstreeks vanuit Boekuna. Je ziet wel per periode precies hoeveel btw je hebt ontvangen en betaald.'},
 {c:'Bank',q:'Is er een automatische bankkoppeling?',a:'Nog niet. Je importeert nu je bankbestand en koppelt transacties aan facturen en kosten. Een automatische koppeling staat op de planning.'},
 {c:'Account',q:'Kan ik mijn gegevens exporteren?',a:'Ja. Via de exportfuncties gebruik of bewaar je je administratieve gegevens buiten Boekuna.',h:1},{c:'Beginnen',q:'Werkt Boekuna op mijn telefoon?',a:'Ja. Er is een aparte mobiele versie met de belangrijkste acties onder handbereik, en je kunt Boekuna als app op je beginscherm zetten.',h:1},{c:'Scanner',q:'Welke bestanden kan ik uploaden?',a:'PDF, JPEG, PNG en HEIC-foto\'s, ook documenten met meerdere pagina\'s.'},{c:'Scanner',q:'Wat als ik een bon twee keer upload?',a:'Boekuna kijkt naar meer dan de bestandsnaam, zoals leverancier, datum, bedrag en de inhoud van het document, en waarschuwt als het lijkt op een eerder document.'},{c:'Bank',q:'Welke bankbestanden kan ik importeren?',a:'CAMT.053, MT940 en CSV. De meeste Nederlandse banken bieden een van deze formaten aan.'},{c:'Assistent',q:'Wat gaat de persoonlijke assistent doen?',a:'De persoonlijke assistent is in ontwikkeling. Straks kijkt hij naar je eigen administratie en zet hij bovenaan wat aandacht nodig heeft en wat opvalt.',h:1},{c:'Assistent',q:'Hoe gaan meldingen werken?',a:'De persoonlijke assistent is nog in ontwikkeling. Het ontwerp is dat tips weg kunnen, terwijl belangrijke administratieve waarschuwingen zichtbaar blijven tot ze zijn opgelost.'},
 {c:'Account',q:'Is mijn administratie veilig?',a:'Je gegevens gaan via een versleutelde verbinding en zijn gescheiden van die van andere gebruikers. Meer op de pagina Veiligheid.',h:1},
 {c:'Account',q:'Kan ik mijn account verwijderen?',a:'Ja, vanuit de app. Kun je niet meer inloggen, dan gebruik je de openbare verwijderingspagina.'},
 {c:'Prijzen',q:'Kan ik opzeggen?',a:'Ja, betaalde abonnementen zijn maandelijks opzegbaar.',p:1},
 {c:'Prijzen',q:'Is btw inbegrepen in de prijs?',a:'Nee, de prijzen zijn exclusief btw. De btw wordt berekend bij het afrekenen.',p:1},
 {c:'Prijzen',q:'Heb ik een creditcard nodig?',a:'Niet om gratis te beginnen. Je betaalt pas als je zelf een betaald abonnement kiest.',p:1}];
var DOCFAQ=[{q:'Waarvoor worden mijn documenten gebruikt?',a:'Alleen om de gegevens voor jouw administratie te herkennen en te bewaren.'},{q:'Wordt er externe AI gebruikt?',a:'De standaard documentherkenning werkt zonder externe generatieve AI. Je documenten worden niet onnodig naar externe AI-diensten gestuurd.'},{q:'Leert Boekuna van mijn leveranciers?',a:'Ja, binnen je eigen account. Bevestigde leveranciers en categorieën helpen bij volgende documenten. Gegevens van verschillende klanten worden niet door elkaar gebruikt.'},{q:'Wat als de herkenning een fout maakt?',a:'Herkende gegevens zijn altijd een voorstel. Jij controleert en past aan voordat iets definitief wordt opgeslagen.'}];
var PLUS='<span class="pl" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>';
function faqHTML(list){return list.map(function(f){return '<details data-c="'+(f.c||'')+'"><summary>'+esc(f.q)+PLUS+'</summary><div class="ans"><p>'+esc(f.a)+'</p></div></details>'}).join('')}
if($('[data-faq="home"]'))$('[data-faq="home"]').innerHTML=faqHTML(FAQ.filter(function(f){return f.h && f.c!=='Assistent'}));
if($('[data-faq="pricing"]'))$('[data-faq="pricing"]').innerHTML=faqHTML(FAQ.filter(function(f){return f.p}));
if($('[data-faq="docs"]'))$('[data-faq="docs"]').innerHTML=faqHTML(DOCFAQ);
if($('#faqAll')){$('#faqAll').innerHTML=faqHTML(FAQ);
var cats=['Alles'].concat(FAQ.map(function(f){return f.c}).filter(function(c,i,a){return a.indexOf(c)===i}));var cat='Alles';
$('#faqChips').innerHTML=cats.map(function(c){return '<button class="chip" type="button" aria-pressed="'+(c==='Alles')+'" data-cat="'+c+'">'+c+'</button>'}).join('');
function filterFaq(){var q=$('#faqSearch').value.trim().toLowerCase(),n=0;$$('#faqAll details').forEach(function(d){var ok=(cat==='Alles'||d.dataset.c===cat)&&(!q||d.textContent.toLowerCase().indexOf(q)>-1);d.hidden=!ok;if(ok)n++;if(q&&ok)d.open=true});$('#faqEmpty').hidden=n>0}
$('#faqSearch').addEventListener('input',filterFaq);
$$('[data-cat]').forEach(function(b){b.addEventListener('click',function(){cat=b.dataset.cat;$$('[data-cat]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});filterFaq()})});}
/* smooth accordion */
$$('.faq details').forEach(function(d){var s=$('summary',d),a=$('.ans',d);s.addEventListener('click',function(e){if(reduce)return;e.preventDefault();
  if(d.open){var h=a.scrollHeight;a.style.height=h+'px';requestAnimationFrame(function(){a.style.transition='height .25s ease';a.style.height='0px'});setTimeout(function(){d.open=false;a.style.height='';a.style.transition=''},250)}
  else{d.open=true;var h2=a.scrollHeight;a.style.height='0px';requestAnimationFrame(function(){a.style.transition='height .28s ease';a.style.height=h2+'px'});setTimeout(function(){a.style.height='';a.style.transition=''},290)}})});


/* ================= ASSISTANT ================= */
var PRI=[['Nu oplossen','var(--red)'],['Aandacht nodig','var(--warn)'],['Opvallend','var(--blue)'],['Tip','var(--green-ink)']];
var PREFS=[['facturen','Facturen betaald krijgen'],['btw','Btw overzichtelijk houden'],['bonnen','Bonnetjes bijhouden'],['kosten','Kosten begrijpen'],['winst','Winst volgen']];
function asData(){return {pref:null,vat:840,items:[
  {id:'late',p:0,crit:1,topics:['facturen'],a:'Bekijk facturen',sub:[{n:'Studio Noord · 2026-011',v:820},{n:'Bakkerij Van Dam · 2026-009',v:420}]},
  {id:'docs',p:1,topics:['bonnen','btw'],a:'Controleer documenten',sub:[{n:'Coolblue · € 149,00 · categorie?'},{n:'Shell · € 68,20 · datum?'},{n:'Bol · € 34,99 · btw-tarief?'}]},
  {id:'bank',p:1,topics:['facturen'],t:'4 transacties wachten op koppeling',d:'Voor 3 daarvan heeft Boekuna een waarschijnlijk voorstel.',a:'Koppel voorstellen'},
  {id:'cost',p:2,topics:['kosten','winst'],t:'Je kosten zijn € 760 hoger dan je eigen gemiddelde',d:'Vergeleken met jouw afgelopen 6 maanden.',a:'Bekijk waarom',why:[['Apparatuur','+ € 540'],['Software','+ € 220']]},
  {id:'rev',p:2,topics:['winst'],t:'Je omzet ligt hoger dan de afgelopen maanden',d:'€ 5.300 deze maand. Je eigen gemiddelde is € 4.480.'},
  {id:'sub',p:2,topics:['kosten'],t:'Je betaalt elke maand voor 5 abonnementen',d:'Samen € 186 per maand aan software, hosting en telefoon.',a:'Bekijk abonnementen',why:[['Adobe','€ 72,59'],['Hosting','€ 24,20'],['Telefoon','€ 45,00'],['Figma','€ 18,15'],['Google Workspace','€ 26,06']]},
  {id:'adobe',p:3,topics:['bonnen'],t:'Je gebruikt Adobe meestal als Software',d:'Zal Boekuna dat voortaan zo voorstellen?',a:'Ja, voortaan zo'}]}}
function makeAssistant(host,key){var S=asData(),open={},fb={};
  function title(it){if(it.id==='late'){var n=it.sub.length,sum=it.sub.reduce(function(a,x){return a+x.v},0);return [n+(n===1?' factuur is':' facturen zijn')+' te laat','Samen '+eur0.format(sum)+' nog te ontvangen.']}
    if(it.id==='docs'){var m=it.sub.length;return [m+(m===1?' document moet':' documenten moeten')+' nog gecontroleerd worden','Dit kan je btw-overzicht nog veranderen.']}return [it.t,it.d]}
  function status(){var nu=S.items.some(function(i){return i.p===0}),at=S.items.some(function(i){return i.p===1});return nu?[0,'Aandacht nodig']:at?[1,'Bijna bijgewerkt']:[2,'Helemaal bijgewerkt']}
  function render(){var st=status(),docs=S.items.filter(function(i){return i.id==='docs'})[0];
    var h='<div class="as"><div class="as-main"><div class="as-head"><strong>Voor jou</strong><span class="status-pill s'+st[0]+'">'+st[1]+'</span></div>';
    h+='<div class="as-prefs"><span class="lb">Waar moet Boekuna je vooral mee helpen?</span><div class="chips">'+PREFS.map(function(p){return '<button class="chip" type="button" data-pref="'+p[0]+'" aria-pressed="'+(S.pref===p[0])+'">'+p[1]+'</button>'}).join('')+'</div></div>';
    PRI.forEach(function(g,gi){var list=S.items.filter(function(i){return i.p===gi});if(!list.length)return;
      list.sort(function(a,b){var ma=S.pref&&a.topics.indexOf(S.pref)>-1?0:1,mb=S.pref&&b.topics.indexOf(S.pref)>-1?0:1;return ma-mb});
      h+='<div class="as-group"><h4><i style="background:'+g[1]+'"></i>'+g[0]+'</h4>';
      list.forEach(function(it){var tt=title(it),match=S.pref&&it.topics.indexOf(S.pref)>-1;
        h+='<div class="ins'+(it.crit?' crit':'')+'" data-id="'+it.id+'"><h5>'+tt[0]+(match?'<span class="pref-tag">Past bij je voorkeur</span>':'')+'</h5><p>'+tt[1]+'</p><div class="ins-actions">';
        if(it.a)h+='<button class="btn btn-'+(gi<2?'primary':'ghost')+' btn-sm" type="button" data-act="'+it.id+'"'+((it.sub||it.why)?' aria-expanded="'+!!open[it.id]+'"':'')+'>'+it.a+'</button>';
        h+='<span class="fb">'+(it.crit?'<span class="lock">Blijft staan tot het is opgelost</span>':'<button type="button" data-fb="use" data-for="'+it.id+'" aria-pressed="'+(fb[it.id]==='use')+'">Nuttig</button><button type="button" data-fb="hide" data-for="'+it.id+'">Niet relevant</button><button type="button" data-fb="never" data-for="'+it.id+'">Niet meer tonen</button>')+'</span></div>';
        if(open[it.id]&&it.sub){h+='<div class="ins-sub">'+it.sub.map(function(x,xi){return '<div class="row"><span>'+x.n+(x.v?' · '+eur.format(x.v):'')+'</span><button class="btn btn-ghost btn-sm" type="button" data-sub="'+it.id+'" data-i="'+xi+'">'+(it.id==='late'?'Markeer als betaald':'Klopt')+'</button></div>'}).join('')+'</div>'}
        if(open[it.id]&&it.why){h+='<div class="ins-sub">'+it.why.map(function(x){return '<div class="row"><span>'+x[0]+'</span><b class="num">'+x[1]+'</b></div>'}).join('')+'</div>'}
        h+='</div>'});h+='</div>'});
    if(!S.items.length)h+='<div class="as-empty"><b>Alles bijgewerkt.</b><span class="p-muted">Niets meer te doen vandaag. Lekker ondernemen.</span></div>';
    h+='</div><div class="as-side"><div class="as-card as-vat"><span>Zet ongeveer apart voor btw</span><b class="num">'+eur0.format(S.vat)+'</b><small>'+(docs?'Dit bedrag kan nog veranderen omdat '+docs.sub.length+(docs.sub.length===1?' document':' documenten')+' niet gecontroleerd '+(docs.sub.length===1?'is':'zijn')+'.':'Alle documenten zijn gecontroleerd.')+'</small></div>';
    h+='<div class="as-card"><span class="lb">Administratie deze maand</span><div style="height:10px;border-radius:999px;background:var(--bg-2);overflow:hidden;margin:10px 0 8px"><div style="height:100%;width:'+(100-S.items.filter(function(i){return i.p<2}).length*12)+'%;background:var(--green);transition:width .5s"></div></div><small class="p-muted">'+(100-S.items.filter(function(i){return i.p<2}).length*12)+'% verwerkt</small></div>';
    h+='<button class="btn btn-ghost btn-sm" type="button" data-reset="1">Demo opnieuw</button></div></div>';
    host.innerHTML=h}
  function resolve(id,msg){var el=host.querySelector('[data-id="'+id+'"]');if(el)el.classList.add('out');setTimeout(function(){S.items=S.items.filter(function(i){return i.id!==id});render();if(msg)toast(msg)},reduce?0:300)}
  host.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
    if(b.dataset.reset){S=asData();open={};fb={};render();return}
    if(b.dataset.pref){S.pref=S.pref===b.dataset.pref?null:b.dataset.pref;render();var c=host.querySelector('[data-pref="'+b.dataset.pref+'"]');if(c)c.focus();return}
    if(b.dataset.act){var it=S.items.filter(function(i){return i.id===b.dataset.act})[0];
      if(it.sub||it.why){open[it.id]=!open[it.id];render();var nb=host.querySelector('[data-act="'+it.id+'"]');if(nb)nb.focus();return}
      if(it.id==='bank')return resolve('bank','4 transacties gekoppeld.');
      if(it.id==='adobe')return resolve('adobe','Onthouden: Adobe wordt voortaan Software.');}
    if(b.dataset.sub){var it2=S.items.filter(function(i){return i.id===b.dataset.sub})[0];it2.sub.splice(+b.dataset.i,1);
      if(it2.id==='docs'){S.vat+=11}
      if(!it2.sub.length){return resolve(it2.id,it2.id==='late'?'Opgelost: alle facturen betaald.':'Alle documenten gecontroleerd. Je btw is bijgewerkt.')}
      render();return}
    if(b.dataset.fb){var id=b.dataset.for;if(b.dataset.fb==='use'){fb[id]='use';render();toast('Bedankt. Hier krijg je er meer van.');return}
      resolve(id,b.dataset.fb==='never'?'Dit soort inzicht tonen we niet meer.':'Verborgen.')}});
  render()}
$$('[data-assistant]').forEach(function(h){makeAssistant(h,h.dataset.assistant)});

if($('#asFeat')){
/* assistant feature grid */
var ASF=[['Persoonlijke aandachtspunten','Te late facturen, documenten om te controleren, ongekoppelde transacties en btw-punten.'],['Slimme prioriteit','Nu oplossen, aandacht nodig, opvallend of tip. Het belangrijkste staat bovenaan.'],['Vergelijkt met jouw normaal','Je eigen gemiddelde omzet, kosten, betaaltermijn en vaste uitgaven.'],['Factuurinzichten','Hoeveel er te laat is, wat nog binnenkomt en welke klant langzamer betaalt dan normaal.'],['Kosteninzichten','Zie waarom je kosten hoger zijn, per categorie.'],['Terugkerende kosten','Abonnementen, hosting en telefoon in één oogopslag.'],['Direct naar de oplossing','Elk inzicht heeft een knop naar de plek waar je het oplost.'],['Lost zichzelf op','Factuur betaald? Dan verdwijnt de melding vanzelf.'],['Gegroepeerd, niet tien keer','Tien documenten worden één melding.'],['Jouw voorkeuren','Kies waar Boekuna je vooral mee helpt. Die inzichten komen eerder.'],['Feedback','Nuttig, niet relevant of niet meer tonen. Belangrijke waarschuwingen blijven.'],['Btw in gewone taal','"Zet ongeveer € 840 apart", en waarom dat nog kan veranderen.'],['Weekoverzicht<span class="soon">Binnenkort</span>','Elke week je omzet, kosten, winst, btw en wat nog openstaat.'],['Maand afronden<span class="soon">Binnenkort</span>','Een checklist om te zien of je maand compleet is.'],['Vooruitblik<span class="soon">Binnenkort</span>','Een voorzichtige verwachting van omzet en kosten, als bandbreedte.']];
$('#asFeat').innerHTML=ASF.map(function(f){return '<div class="fcard"><h3>'+f[0]+'</h3><p>'+f[1]+'</p></div>'}).join('');

}
if($('#catList')){
/* ================= CATALOG ================= */
var CAT=[
['Overzicht','Dashboard','Omzet, kosten, resultaat, btw om apart te zetten, openstaande facturen en wat aandacht nodig heeft.'],
['Overzicht','Omzetoverzicht','Omzet per maand of periode, en hoe die verandert.'],
['Overzicht','Kostenoverzicht','Al je zakelijke kosten met leverancier, datum, bedrag, btw, categorie en document.'],
['Overzicht','Winst en resultaat','Omzet min kosten, zonder zelf te rekenen.'],
['Overzicht','Aandacht nodig','Alles wat nog actie vraagt op één plek.'],
['Overzicht','Administratiestatus','Hoeveel al verwerkt is en waar nog werk zit.'],
['Facturen','Verkoopfacturen maken','Klant, datums, regels, aantallen, prijzen en btw.'],
['Facturen','Automatisch rekenen','Subtotaal, btw en totaal worden voor je uitgerekend.'],
['Facturen','Automatische factuurnummering','Elk factuurnummer uniek en op volgorde.'],
['Facturen','Factuurstatus','Concept, openstaand, betaald of te laat.'],
['Facturen','Openstaande facturen','Wie nog moet betalen en hoeveel.'],
['Facturen','Te late facturen','Ziet vanzelf wanneer de vervaldatum voorbij is.'],
['Facturen','Betalingen bij facturen','Ook gedeeltelijke betalingen, zodat het restbedrag klopt.'],
['Facturen','Factuur-PDF','Een nette PDF om op te slaan of te delen.'],
['Facturen','Delen via e-mail','Via je mailapp op mobiel of desktop. Jij verstuurt zelf.'],
['Facturen','Markeren als verzonden','Pas als jij bevestigt dat de factuur echt weg is.'],
['Klanten','Klanten beheren','Bedrijfsnaam, contact- en adresgegevens, klaar voor je volgende factuur.'],
['Klanten','Bedrijfsgegevens zoeken','Vind bedrijfsinformatie, zodat je minder hoeft te typen.'],
['Documenten','Bonnen uploaden','Kies een bestand of maak direct een foto.'],
['Documenten','Inkoopfacturen uploaden','Ontvangen facturen als document in je administratie.'],
['Documenten','PDF\'s verwerken','Digitale tekst in PDF\'s wordt direct gebruikt.'],
['Documenten','Foto\'s verwerken','JPEG, PNG en HEIC van je telefoon.'],
['Documenten','Meerdere pagina\'s','Informatie van alle pagina\'s hoort bij hetzelfde document.'],
['Documenten','Documentstatus','Verwerken, controle nodig, klaar of mislukt.'],
['Documenten','Verwerken op de achtergrond','Je hoeft niet op één scherm te wachten.'],
['Documenten','Meerdere documenten tegelijk','Elke upload houdt zijn eigen status.'],
['Documenten','Opnieuw proberen','Mislukt? Start de verwerking opnieuw.'],
['Documenten','Dubbele documenten herkennen','Waarschuwt als een document al eerder is toegevoegd, op basis van inhoud, leverancier, datum en bedrag.'],
['Documenten','Document opnieuw openen','Bekijk verwerkte documenten later terug, met hun controle.'],
['Slim scannen','Automatische herkenning','Leverancier, datum, factuurnummer, bedragen, btw, tarief en valuta.'],
['Slim scannen','Juiste datum','Onderscheidt factuurdatum van vervaldatum, leverdatum of orderdatum.'],
['Slim scannen','Juist factuurnummer','Niet per ongeluk het KVK-nummer, btw-id, IBAN of ordernummer.'],
['Slim scannen','Juist totaalbedrag','Niet het subtotaal, voorschot of de korting.'],
['Slim scannen','Btw herkennen','Btw-bedrag, tarief en grondslag.'],
['Slim scannen','Meerdere btw-tarieven','9% en 21% op één bon blijven apart.'],
['Slim scannen','Buitenlandse tarieven','20% blijft 20%, en wordt niet stil 21%.'],
['Slim scannen','Financiële controle','Excl. btw plus btw moet het totaal zijn.'],
['Slim scannen','Twee van drie','Met twee van de drie bedragen berekent of controleert Boekuna het derde.'],
['Slim scannen','Geen stille correcties','Klopt iets niet, dan zie je dat. Boekuna past niets ongemerkt aan.'],
['Slim scannen','Alleen twijfel controleren','Je ziet alleen wat aandacht nodig heeft, niet twintig velden.'],
['Slim scannen','Extra gegevens apart','IBAN, KVK, btw-id en ordernummer staan onder Meer gegevens.'],
['Slim scannen','Lange kassabonnen','Kleine tekst op lange bonnen blijft leesbaar.'],
['Slim scannen','Beeld verbeteren','Scheve, donkere of verkeerd gedraaide foto\'s worden waar mogelijk voorbereid.'],
['Slim scannen','Documenttype herkennen','Kassabon, inkoopfactuur, creditnota of geen financieel document.'],
['Slim scannen','Voorschotten en restbedrag','Een voorschot betekent niet dat de hele factuur betaald is.'],
['Slim scannen','Leveranciers onthouden','Terugkerende leveranciers worden beter herkend, alleen binnen je eigen account.'],
['Slim scannen','IBAN-controle','Controleert of een IBAN klopt en herstelt typische scanfouten zoals O en 0.'],
['Kosten','Kosten registreren','Zakelijke uitgaven, gekoppeld aan het document.'],
['Kosten','Categorieën','Deel je kosten in voor een bruikbaar overzicht.'],
['Kosten','Categorievoorstellen','Bij bekende leveranciers stelt Boekuna je vorige keuze voor.'],
['Kosten','Btw op kosten','Wordt meegenomen in je btw-overzicht.'],
['Bank','Bankbestanden importeren','CAMT.053, MT940 en CSV.'],
['Bank','Transacties bekijken','Datum, tegenpartij, bedrag, in of uit, en of hij gekoppeld is.'],
['Bank','Transacties koppelen','Aan een factuur of kostenpost.'],
['Bank','Koppelvoorstellen','Op basis van bedrag, factuurnummer, kenmerk, IBAN, naam en datum.'],
['Bank','Ontkoppelen','Een koppeling ongedaan maken kan altijd.'],
['Bank','Dubbele import voorkomen','Dezelfde transactie komt er niet twee keer in.'],
['Btw','Btw-overzicht','Alle btw uit je administratie bij elkaar.'],
['Btw','Btw op omzet en kosten','Wat je ontvangt en wat je betaalt, apart.'],
['Btw','Btw per tarief','21%, 9% en andere tarieven apart.'],
['Btw','Btw apartzetten','Hoeveel je nu moet reserveren.'],
['Btw','Btw-controle','Laat zien als ongecontroleerde documenten je btw nog kunnen veranderen.'],
['Rapportages','Omzet, kosten en resultaat','Hoe je bedrijf zich ontwikkelt.'],
['Rapportages','Grafieken','Tik op een periode voor de exacte bedragen.'],
['Rapportages','Periodefilters','Per maand, kwartaal of jaar.'],
['Assistent','Persoonlijke assistent','Kijkt naar jouw administratie en zet bovenaan wat ertoe doet.'],
['Assistent','Slimme prioriteit','Nu oplossen, aandacht nodig, opvallend en tips.'],
['Assistent','Persoonlijke inzichten','Afwijkingen ten opzichte van je eigen gemiddelde.'],
['Assistent','Directe acties','Van inzicht naar oplossing in één klik.'],
['Assistent','Voorkeuren en feedback','Bepaal waar Boekuna je vooral mee helpt.'],
['Account en data','Gewone taal','Nog te ontvangen in plaats van debiteuren.'],
['Account en data','Centnauwkeurig rekenen','Geen afrondingsfouten in je bedragen.'],
['Account en data','Account en inloggen','E-mail en wachtwoord, met e-mailverificatie.'],
['Account en data','Bedrijfs- en factuurinstellingen','Je eigen gegevens voor je administratie en facturen.'],
['Account en data','Exporteren','Gebruik of bewaar je gegevens buiten Boekuna.'],
['Account en data','Account verwijderen','Verwijder je account en gegevens zelf.'],
['Account en data','Abonnementen','Gratis, Boekuna of Unlimited, met eigen documentlimieten.'],
['App','Desktop','Volledige omgeving voor uitgebreid werken.'],
['App','Mobiel','Een eigen mobiele ervaring, geen verkleinde desktop.'],
['App','Op je beginscherm','Installeer Boekuna als webapp.'],
['Beveiliging','Gescheiden administraties','Je hebt alleen toegang tot je eigen gegevens.'],
['Beveiliging','Toegangscontrole','Beveiliging op databaseniveau per account.'],
['Beveiliging','Privacygericht scannen','Zonder externe generatieve AI in de standaard verwerking.']];
var catCats=['Alles'].concat(CAT.map(function(c){return c[0]}).filter(function(c,i,a){return a.indexOf(c)===i})),catSel='Alles';
$('#catChips').innerHTML=catCats.map(function(c){return '<button class="chip" type="button" data-cc="'+c+'" aria-pressed="'+(c==='Alles')+'">'+c+'</button>'}).join('');
function hiTxt(t,q){t=esc(t);if(!q)return t;var i=t.toLowerCase().indexOf(q);return i<0?t:t.slice(0,i)+'<mark>'+t.slice(i,i+q.length)+'</mark>'+t.slice(i+q.length)}
function drawCat(){var q=$('#catSearch').value.trim().toLowerCase(),h='',n=0;
  catCats.slice(1).forEach(function(c){if(catSel!=='Alles'&&catSel!==c)return;var it=CAT.filter(function(x){return x[0]===c&&(!q||(x[1]+' '+x[2]).toLowerCase().indexOf(q)>-1)});if(!it.length)return;n+=it.length;
    h+='<h2 class="cat-h">'+c+'</h2><div class="cat-grid">'+it.map(function(x){return '<div class="fcard"><h3>'+hiTxt(x[1],q)+'</h3><p>'+hiTxt(x[2],q)+'</p></div>'}).join('')+'</div>'});
  $('#catList').innerHTML=h;$('#catCount').textContent=n+(n===1?' functie':' functies');$('#catEmpty').hidden=n>0}
$('#catSearch').addEventListener('input',drawCat);
$$('[data-cc]').forEach(function(b){b.addEventListener('click',function(){catSel=b.dataset.cc;$$('[data-cc]').forEach(function(x){x.setAttribute('aria-pressed',x===b)});drawCat()})});
drawCat();
$('#roadmap').innerHTML=[['Automatische bankkoppeling','Transacties automatisch binnen via je bank.'],['Btw-aangifte indienen','Rechtstreeks naar de Belastingdienst.'],['Peppol-facturen versturen','E-facturen via het Peppol-netwerk.'],['Vraag het Boekuna','Stel vragen over je eigen administratie.']].map(function(r){return '<div><strong>'+r[0]+'</strong><p class="p-muted" style="margin:4px 0 0;font-size:14px">'+r[1]+'</p></div>'}).join('');

}
})();
