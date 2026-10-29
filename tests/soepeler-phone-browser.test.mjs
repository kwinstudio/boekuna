// Soepeler (Kwin 2026-10-29: "alles moet een beetje soepel zijn"): a tab opens fast and in the right place, and what moves is cheap.
// - A new tab opens at its top, and a tab you come back to at the place you left it, already in the first painted frame.
// - The tab bar only eases colours (no letter weight), there is no grey tap flash, long phone lists skip rows below the screen.
// - A total counting up changes only its text, not its elements, so the page is not restyled on every frame.
// - The faster helpers give the same answers: dates, the to-do list on Overzicht, amounts that shrink to fit.
// motion.js and handig.js are off for automated browsers; ?motion=1&handig=1 turns them on here. Runs in Chromium and WebKit.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=Array.from({length:6},(_,i)=>({id:'c'+i,type:'customer',name:'Fictieve Klant '+i,email:'k'+i+'@example.test',address:'Klantstraat '+i,postal:'3011AB',city:'Rotterdam'}));
const ago=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10)};
state.invoices=Array.from({length:40},(_,i)=>({id:'i'+i,number:'2026-'+String(i+1).padStart(4,'0'),customerId:'c'+(i%6),status:i%3?'sent':'paid',kind:'invoice',issueDate:ago(i),dueDate:ago(i-14),lines:[{desc:'Fictieve dienst',qty:2,unit:100+i,unitLabel:'uur',vat:21}],payments:i%3?[]:[{date:ago(i),amount:(200+2*i)*1.21}]}));
state.expenses=Array.from({length:30},(_,i)=>({id:'e'+i,date:ago(i),vendor:'Fictieve Winkel '+i,category:'Telefoon en internet',exVat:30+i,vatRate:21}));
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+'/?motion=1&handig=1',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  await page.waitForTimeout(600);

  // 1. Scroll position is right in the first frame: a new tab at its top, a tab you come back to where you left it.
  const scroll=await page.evaluate(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
    const tap=t=>document.querySelector('#mobileBottomNav [data-mobile-page="'+t+'"]').click();
    tap('invoices');await wait(400);
    window.scrollTo({top:700,behavior:'instant'});await wait(80);
    const left=window.scrollY;
    tap('expenses');await frame();const newTab=window.scrollY;
    await wait(400);window.scrollTo({top:250,behavior:'instant'});await wait(80);
    tap('invoices');await frame();const back=window.scrollY;
    return {left,newTab,back};
  });
  assert.ok(scroll.left>600,'the Inkomsten list must be long enough to scroll: '+JSON.stringify(scroll));
  assert.equal(scroll.newTab,0,'a new tab opens at its top, not at the old scroll height');
  assert.ok(Math.abs(scroll.back-scroll.left)<=1,'coming back by tab restores the place you left, before the first paint: '+JSON.stringify(scroll));

  // 2. Cheap motion only: the tab bar eases no letter weight, no tap flash, long lists skip rows below the screen.
  const look=await page.evaluate(()=>{
    const nav=getComputedStyle(document.querySelector('#mobileBottomNav .mobile-bottom-nav-item'));
    const row=document.querySelector('#content .mobile-card-list>.mobile-card-row');
    return {props:nav.transitionProperty,tap:getComputedStyle(document.body).webkitTapHighlightColor,cv:row?getComputedStyle(row).contentVisibility:'(no row)'};
  });
  assert.ok(!/all|font-weight/.test(look.props),'tab bar transitions: '+look.props);
  assert.match(look.tap,/rgba\(0, 0, 0, 0\)|transparent/,'no grey tap flash');
  if(browserName==='chromium')assert.equal(look.cv,'auto','rows below the screen are skipped until you scroll to them');

  // 3. A total counting up keeps its elements; only the text changes.
  const counting=await page.evaluate(async()=>{
    // A new invoice this month moves the totals, so they count from the old value to the new one.
    navigate('invoices');
    const day=new Date().toISOString().slice(0,10);
    state.invoices.push({id:'inew',number:'2026-0999',customerId:'c1',status:'sent',kind:'invoice',issueDate:day,dueDate:day,lines:[{desc:'Fictieve dienst',qty:10,unit:150,unitLabel:'uur',vat:21}],payments:[]});
    navigate('dashboard');
    await new Promise(r=>requestAnimationFrame(()=>r()));
    const values=[...document.querySelectorAll('#content .metric-value,#content .dashboard-summary-value')];
    const el=values.find(v=>v.dataset.counting);if(!el)return {skipped:true,count:values.length};
    let swaps=0;const mo=new MutationObserver(rs=>rs.forEach(r=>{if(r.type==='childList'&&r.target===el)swaps++}));
    mo.observe(el,{childList:true});
    await new Promise(r=>setTimeout(r,250));const mid=el.dataset.counting;mo.disconnect();
    await new Promise(r=>setTimeout(r,400));
    return {swaps,mid,done:!el.dataset.counting,text:el.textContent};
  });
  assert.ok(!counting.skipped,'a total should count up on Overzicht: '+JSON.stringify(counting));
  assert.equal(counting.mid,'1','still counting halfway');
  assert.equal(counting.swaps,0,'counting must not add or remove elements on every frame');
  assert.ok(counting.done&&/€/.test(counting.text),'the count ends on the real amount');

  // 4. The faster helpers give the same answers.
  const same=await page.evaluate(()=>{
    const year=new Date().getFullYear(),other=year-1;
    const memoOutside=attentionRows().length;
    state.contacts.push({id:'cx',type:'customer',name:'Fictieve Halve Klant'});
    const afterChange=attentionRows().length;state.contacts.pop();
    navigate('dashboard');
    return {
      full:dateNL(year+'-03-07'),short:dateShortNL(year+'-03-07'),shortOther:dateShortNL(other+'-03-07'),shortWith:dateShortNL(year+'-03-07',true),
      memoOutside,afterChange,
      fitted:[...document.querySelectorAll('#content .metric .metric-value,#content .dashboard-summary-value')].every(v=>!v.clientWidth||v.dataset.fitFontSize)
    };
  });
  assert.equal(same.full,'7 mrt '+new Date().getFullYear());
  assert.equal(same.short,'7 mrt');
  assert.equal(same.shortOther,'7 mrt '+(new Date().getFullYear()-1));
  assert.equal(same.shortWith,'7 mrt '+new Date().getFullYear());
  assert.ok(same.afterChange>same.memoOutside,'outside a render the to-do list always follows the latest data');
  assert.ok(same.fitted,'every visible total still gets its fitted size');

  await context.close();
  assert.deepEqual(errors,[]);
  console.log('Soepeler: OK ('+browserName+')');
}finally{
  await browser.close();server.close();
}
