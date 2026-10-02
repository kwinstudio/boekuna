function initBoekunaMarketingInteractions(){
 const productData={
  facturen:{caption:'Facturen · echte lijst, filters en statussen',href:'/facturen/',link:'Bekijk Facturen →'},
  documenten:{caption:'Documenten · upload, lijst en echte controlestatussen',href:'/scanner/',link:'Bekijk documentverwerking →'},
  btw:{caption:'Btw · kwartaalpositie en controle-informatie',href:'/btw-bank/',link:'Bekijk Btw & bank →'},
  rapportages:{caption:'Rapportages · primair inzicht uit dezelfde administratie',href:'/rapportages/',link:'Bekijk Rapportages →'}
 };
 const q=id=>document.getElementById(id);
 const shell=q('kzProductShell');
 const tabs=[...document.querySelectorAll('[data-kz-tab]')];
 const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const setText=(id,value)=>{const el=q(id);if(el)el.textContent=value};
 function setProduct(key){
  const d=productData[key];if(!d)return;
  if(shell)shell.classList.add('is-changing');
  tabs.forEach(t=>{const on=t.dataset.kzTab===key;t.classList.toggle('active',on);t.setAttribute('aria-pressed',String(on))});
  const apply=()=>{
   setText('kzProductCaption',d.caption);
   const link=q('kzPreviewLink');if(link){link.href=d.href;link.textContent=d.link}
   if(shell){shell.dataset.story=key;shell.classList.remove('is-changing');}
  };
  if(reduced)apply();else setTimeout(apply,100);
 }
 tabs.forEach(t=>t.addEventListener('click',()=>setProduct(t.dataset.kzTab)));
 setProduct('facturen');

 const nav=document.querySelector('.marketing-nav');
 const top=q('kzBackTop');
 const onScroll=()=>{
  if(nav)nav.classList.toggle('scrolled',window.scrollY>12);
  if(top)top.classList.toggle('show',window.scrollY>650);
 };
 window.addEventListener('scroll',onScroll,{passive:true});onScroll();
 if(top)top.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduced?'auto':'smooth'}));
 const flowData={
  upload:{k:'Stap 1 · Aanleveren',t:'Begin met het document dat je al hebt.',p:'Sleep een PDF in Boekuna of maak op mobiel een foto van je bon. Het originele document blijft gekoppeld aan de administratie.',boxes:[['Bron','PDF of foto'],['Status','Klaar voor analyse'],['Controle','Nog niet geboekt']]},
  recognize:{k:'Stap 2 · Herkennen',t:'Boekuna zet de belangrijkste gegevens voor je klaar.',p:'De scanner probeert onder meer leverancier, datum, bedragen en btw te herkennen. Bij scans en foto’s kan OCR worden gebruikt.',boxes:[['Leverancier','Herkend'],['BTW','Geanalyseerd'],['Bedrag','Voorstel klaar']]},
  check:{k:'Stap 3 · Controleren',t:'Jij beslist of de gegevens kloppen.',p:'Controleer de herkende velden, pas waar nodig iets aan en bekijk waarschuwingen voordat je verdergaat.',boxes:[['Velden','Controleerbaar'],['Waarschuwing','Zichtbaar'],['Boeking','Nog concept']]},
  save:{k:'Stap 4 · Verwerken',t:'Pas na jouw akkoord komt het in de administratie.',p:'Na bevestiging blijft de boeking verbonden met het originele document en kan de informatie terugkomen in btw, kosten en rapportages.',boxes:[['Document','Gekoppeld'],['Boeking','Opgeslagen'],['Overzicht','Bijgewerkt']]}
 };
 const flowTabs=[...document.querySelectorAll('[data-flow]')];
 function setFlow(key){
  const d=flowData[key];if(!d)return;
  flowTabs.forEach(b=>{const on=b.dataset.flow===key;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
  setText('flowKicker',d.k);setText('flowTitle',d.t);setText('flowText',d.p);
  d.boxes.forEach((box,i)=>{setText('flowBox'+(i+1)+'Label',box[0]);setText('flowBox'+(i+1)+'Value',box[1])});
 }
 flowTabs.forEach(b=>b.addEventListener('click',()=>setFlow(b.dataset.flow)));

 const workflowDepthData={
  document:{kicker:'Stap 01',state:'Ontvangen',label:'Document',title:'Origineel bewijsstuk blijft gekoppeld.',text:'Boekuna begint bij je bronbestand en bouwt de controle daar omheen.'},
  bedragen:{kicker:'Stap 02',state:'Herkend',label:'Bedragen',title:'Belangrijke bedragen staan klaar voor controle.',text:'Financiële velden worden voorbereid zodat jij gericht kunt controleren in plaats van alles opnieuw over te typen.'},
  controle:{kicker:'Stap 03',state:'Controle',label:'Controle',title:'Jij bevestigt relatie en inhoud.',text:'Onzekere gegevens blijven zichtbaar. Je controleert leverancier, bedragen en context voordat er iets definitief wordt.'},
  opslaan:{kicker:'Stap 04',state:'Klaar',label:'Opslaan',title:'Na jouw akkoord wordt de administratie bijgewerkt.',text:'De boeking blijft verbonden met het document en kan daarna terugkomen in je btw- en rapportageoverzicht.'}
 };
 const workflowDepthButtons=[...document.querySelectorAll('[data-workflow-step]')];
 const workflowStage=q('kzWorkflowStage');
 function setWorkflowDepth(key){
  const d=workflowDepthData[key];if(!d||!workflowStage)return;
  workflowDepthButtons.forEach(button=>{
   const on=button.dataset.workflowStep===key;
   button.classList.toggle('active',on);
   button.setAttribute('aria-pressed',String(on));
  });
  workflowStage.dataset.step=key;
  workflowStage.classList.add('is-changing');
  setText('workflowStageKicker',d.kicker);
  setText('workflowStageState',d.state);
  setText('workflowStageLabel',d.label);
  setText('workflowStageTitle',d.title);
  setText('workflowStageText',d.text);
  if(reduced)workflowStage.classList.remove('is-changing');
  else requestAnimationFrame(()=>workflowStage.classList.remove('is-changing'));
 }
 workflowDepthButtons.forEach(button=>button.addEventListener('click',()=>setWorkflowDepth(button.dataset.workflowStep)));
 setWorkflowDepth('document');

 const compareData={
  without:{title:'Informatie staat verspreid.',text:'Bonnen, facturen, bankregels en btw-informatie zitten vaak op verschillende plekken. Daardoor ontstaat extra zoek- en controlewerk.',items:['Bonnetjes terugzoeken','Bedragen opnieuw invoeren','Openstaande acties zelf onthouden'],flow:[['Mailbox','Factuur binnengekomen','Zoeken'],['Bonfoto','Los op telefoon','Bewaren'],['Spreadsheet','Handmatig overzicht','Bijwerken']]},
  with:{title:'Eén administratie met duidelijke aandachtspunten.',text:'Documenten, facturen, bankregels en rapportages gebruiken dezelfde administratie. Daardoor hoef je minder terug te zoeken en zie je eerder wat nog moet gebeuren.',items:['Documenten aan boekingen gekoppeld','Gegevens voorbereid voor controle','Openstaande acties in beeld'],flow:[['Document','Gegevens voorbereid','Controleren'],['Boeking','Document gekoppeld','Opslaan'],['Overzicht','Administratie bijgewerkt','Bekijken']]}
 };
 const compareBtns=[...document.querySelectorAll('[data-compare]')];
 function setCompare(key){
  const d=compareData[key];if(!d)return;
  compareBtns.forEach(b=>b.classList.toggle('active',b.dataset.compare===key));
  setText('compareTitle',d.title);setText('compareText',d.text);
  const list=q('compareList');if(list)list.innerHTML=d.items.map(x=>'<div class="kz-compare-item">'+x+'</div>').join('');
  const flow=q('compareFlow');if(flow)flow.innerHTML=d.flow.map(x=>'<div class="kz-compare-flow-row"><i></i><div><strong>'+x[0]+'</strong><small>'+x[1]+'</small></div><em>'+x[2]+'</em></div>').join('');
 }
 compareBtns.forEach(b=>b.addEventListener('click',()=>setCompare(b.dataset.compare)));

 document.querySelectorAll('.kz-solution-more').forEach(btn=>{
  btn.addEventListener('click',()=>{
   const card=btn.closest('.kz-solution');if(!card)return;
   const open=card.classList.toggle('expanded');
   btn.setAttribute('aria-expanded',String(open));
   btn.textContent=open?'Minder tonen −':'Wat lost dit op? +';
  });
 });

 const reveals=[...document.querySelectorAll('.kz-reveal')];
 if(reduced||!('IntersectionObserver' in window)){reveals.forEach(el=>el.classList.add('in-view'))}
 else{
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');observer.unobserve(e.target)}}),{threshold:.12});
  reveals.forEach(el=>observer.observe(el));
 }

 /* Boekuna universal interactions v3 */
 const hoverCards=[...document.querySelectorAll('.feature-card,.price-card,.deep-panel,.trust-card,.audience-card,.value-card,.promo-card,.kz-solution,.kz-reason,.kz-audience-card,.kz-support-card,.kz-workflow-stage,.kz-compare-copy,.kz-compare-visual')];
 hoverCards.forEach(card=>card.classList.add('bookuna-hover-card'));

 const faqItems=[...document.querySelectorAll('.faq-item')];
 faqItems.forEach((item,index)=>{
   item.setAttribute('role','button');
   item.setAttribute('tabindex','0');
   item.setAttribute('aria-expanded','false');
   const toggle=()=>{
     const willOpen=!item.classList.contains('open');
     faqItems.forEach(other=>{other.classList.remove('open');other.setAttribute('aria-expanded','false')});
     if(willOpen){item.classList.add('open');item.setAttribute('aria-expanded','true')}
   };
   item.addEventListener('click',toggle);
   item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
   if(index===0){item.classList.add('open');item.setAttribute('aria-expanded','true')}
 });

 const universalReveal=[...document.querySelectorAll('.marketing section,.marketing .marketing-cta-box')];
 universalReveal.forEach(el=>el.classList.add('bookuna-reveal'));
 if(reduced||!('IntersectionObserver' in window)){
   universalReveal.forEach(el=>el.classList.add('bookuna-in'));
 }else{
   const universalObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
     if(entry.isIntersecting){entry.target.classList.add('bookuna-in');universalObserver.unobserve(entry.target)}
   }),{threshold:.08,rootMargin:'0px 0px -30px 0px'});
   universalReveal.forEach(el=>universalObserver.observe(el));
 }

 const depthRoots=[...document.querySelectorAll('[data-depth-root]')];
 const resetDepth=root=>{
  root.style.setProperty('--depth-rx','0deg');
  root.style.setProperty('--depth-ry','0deg');
  root.style.setProperty('--depth-x','0px');
  root.style.setProperty('--depth-y','0px');
 };
 const depthInteractive=()=>!reduced&&window.innerWidth>=900;
 depthRoots.forEach(root=>{
  resetDepth(root);
  root.dataset.depthMode=depthInteractive()?'interactive':'static';
  let raf=0;
  root.addEventListener('pointermove',event=>{
   if(root.dataset.depthMode!=='interactive')return;
   const rect=root.getBoundingClientRect();
   if(!rect.width||!rect.height)return;
   const nx=Math.max(-1,Math.min(1,((event.clientX-rect.left)/rect.width-.5)*2));
   const ny=Math.max(-1,Math.min(1,((event.clientY-rect.top)/rect.height-.5)*2));
   cancelAnimationFrame(raf);
   raf=requestAnimationFrame(()=>{
    root.style.setProperty('--depth-rx',(-ny*3.8).toFixed(2)+'deg');
    root.style.setProperty('--depth-ry',(nx*4.8).toFixed(2)+'deg');
    root.style.setProperty('--depth-x',(nx*2.2).toFixed(2)+'px');
    root.style.setProperty('--depth-y',(ny*1.8).toFixed(2)+'px');
   });
  },{passive:true});
  root.addEventListener('pointerleave',()=>{cancelAnimationFrame(raf);resetDepth(root)},{passive:true});
 });
 const syncDepthMode=()=>depthRoots.forEach(root=>{
  root.dataset.depthMode=depthInteractive()?'interactive':'static';
  if(root.dataset.depthMode==='static')resetDepth(root);
 });
 window.addEventListener('resize',syncDepthMode,{passive:true});

 if(!reduced){
  document.querySelectorAll('.kz-hero-actions .mk-btn,.kz-final-box .mk-btn,.kz-preview-link').forEach(target=>{
   target.classList.add('kz-magnetic');
   let raf=0;
   target.addEventListener('pointermove',event=>{
    if(window.innerWidth<900)return;
    const rect=target.getBoundingClientRect();
    const x=((event.clientX-rect.left)/rect.width-.5)*5;
    const y=((event.clientY-rect.top)/rect.height-.5)*4;
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
     target.style.setProperty('--micro-x',x.toFixed(2)+'px');
     target.style.setProperty('--micro-y',y.toFixed(2)+'px');
    });
   },{passive:true});
   target.addEventListener('pointerleave',()=>{
    cancelAnimationFrame(raf);
    target.style.setProperty('--micro-x','0px');
    target.style.setProperty('--micro-y','0px');
   },{passive:true});
  });
 }

 const progress=q('kzProgress');
 const updateProgress=()=>{
  if(!progress)return;
  const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
  progress.style.width=Math.min(100,Math.max(0,(window.scrollY/max)*100))+'%';
 };
 window.addEventListener('scroll',updateProgress,{passive:true});updateProgress();

}

document.addEventListener('DOMContentLoaded',()=>initBoekunaMarketingInteractions());
