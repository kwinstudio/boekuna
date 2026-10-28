// Handige trucjes (handig.js/.css, Kwin 2026-10-28): the right keyboard per field, Enter goes to the next field, amounts
// read the way people type them, smart pre-fill, bigger tap areas, swipe and long press in phone lists, shortcuts on a
// computer, a form error takes you to the field. Plus, in the app itself: search forgives typos, removing a cost is undone
// with one tap, and a half-filled invoice survives closing the app.
// Like motion and press, handig.js is off for automated browsers; ?handig=1 turns it on here. Runs in Chromium and WebKit.
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
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'},{id:'c2',type:'customer',name:'Albert Voorbeeld',email:'av@example.test',address:'Laan 3',postal:'3011AC',city:'Delft'}];
const day=new Date().toISOString().slice(0,10),before=new Date(Date.now()-5*864e5).toISOString().slice(0,10);
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:before,dueDate:day,lines:[{desc:'Fictieve dienst',qty:12,unit:100,unitLabel:'uur',vat:21}],payments:[]},{id:'i2',number:'2026-0002',customerId:'c2',status:'sent',kind:'invoice',issueDate:day,dueDate:day,lines:[{desc:'Advies',qty:2,unit:90,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:day,vendor:'Fictieve Telecom',category:'Telefoon en internet',exVat:30,vatRate:9},{id:'e2',date:day,vendor:'Kantoorwinkel',category:'office',exVat:50,vatRate:21}];
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

async function openApp({phone=true,handig=true}={}){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},hasTouch:phone,isMobile:phone&&browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+(handig?'/?handig=1':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}
const touch=(page,sel,type,x,y)=>page.evaluate(([sel,type,x,y])=>document.querySelector(sel).dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:7,isPrimary:true,clientX:x,clientY:y})),[sel,type,x,y]);
const raw=(page,sel)=>page.evaluate(sel=>Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').get.call(document.querySelector(sel)),sel);

try{
  // Tests and screenshots see the plain app: no number fields turned into text.
  {
    const {context,page}=await openApp({handig:false});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-handig')),false,'Off for automated browsers');
    await page.evaluate(()=>newInvoice());
    assert.equal(await page.locator('#invoiceLines [data-k=unit]').getAttribute('type'),'number');
    await context.close();
  }

  // 1 + 3: amounts on an invoice line: "3 x 2" and "45,50" are read right, the app gets plain numbers, the field shows 45,50.
  {
    const {context,page}=await openApp();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-handig')),true);
    await page.evaluate(()=>newInvoice());
    const unit=page.locator('#invoiceLines [data-k=unit]'),qty=page.locator('#invoiceLines [data-k=qty]');
    assert.equal(await unit.getAttribute('type'),'text');
    assert.equal(await unit.getAttribute('inputmode'),'decimal');
    // 4: the customer you invoiced last is on top.
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#invoiceCustomer option')].slice(1,3).map(o=>o.value)),['c2','c1']);
    await page.selectOption('#invoiceCustomer','c1');
    await page.evaluate(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))};set('#invoiceLines [data-k=desc]','Fictief schilderwerk');set('#invoiceLines [data-k=qty]','3 x 2');set('#invoiceLines [data-k=unit]','45,50')});
    assert.deepEqual(await page.evaluate(()=>formLines().map(l=>[l.qty,l.unit])),[[6,45.5]],'The app reads plain numbers');
    assert.equal(await raw(page,'#invoiceLines [data-k=unit]'),'45,50','The field shows a Dutch amount');
    assert.equal(await raw(page,'#invoiceLines [data-k=qty]'),'6','A sum becomes its answer');
    assert.equal(await page.evaluate(()=>new FormData(document.getElementById('invoiceForm')).get('paymentDays')),'14','FormData gets plain numbers');
    assert.equal(await page.evaluate(()=>boekunaReadAmount('1.234,56')),1234.56);
    assert.equal(await page.evaluate(()=>boekunaReadAmount('€ 12,-')),12);
    assert.equal(await page.evaluate(()=>boekunaReadAmount('100 + 21%')),121);
    assert.equal(await page.evaluate(()=>boekunaReadAmount('12.50')),12.5);
    // A wrong amount gets a plain message instead of being read as 0.
    await page.evaluate(()=>{const el=document.querySelector('#invoiceLines [data-k=unit]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'abc');el.dispatchEvent(new Event('input',{bubbles:true}))});
    assert.match(await unit.evaluate(el=>el.validationMessage),/bedrag/);
    // 15: the half invoice is kept on this device and offered again after the app was closed.
    await page.waitForTimeout(900);
    assert.ok(await page.evaluate(()=>localStorage.getItem(unsavedInvoiceKey())),'Kept on the device while typing');
    await page.reload();await page.locator('#mainApp').waitFor();
    await page.evaluate(()=>newInvoice());
    await page.locator('#unsavedInvoiceOffer').waitFor();
    assert.match(await page.locator('#unsavedInvoiceOffer').innerText(),/Fictieve Schilders/);
    await page.locator('[data-unsaved="discard"]').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem(unsavedInvoiceKey())),null,'Weggooien removes it from the device');
    await context.close();
  }

  // 1 + 2: keyboards and the Enter key in a new relation.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>newContact());
    const kinds=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#modalRoot input')].map(e=>[e.name,[e.type,e.getAttribute('inputmode')||'',e.getAttribute('autocapitalize')||'']])));
    assert.deepEqual(kinds.phone.slice(0,1),['tel']);
    assert.equal(kinds.kvk[1],'numeric');
    assert.equal(kinds.postal[2],'characters');
    assert.equal(kinds.email[2],'off');
    await page.locator('#modalRoot input[name=name]').focus();
    assert.equal(await page.locator('#modalRoot input[name=name]').getAttribute('enterkeyhint'),'next');
    await page.keyboard.press('Enter');
    assert.notEqual(await page.evaluate(()=>document.activeElement.name),'name','Enter goes to the next field');
    assert.equal(await page.evaluate(()=>!!document.querySelector('#modalRoot [role=dialog]')),true,'Enter does not save half a relation');
    // 5: a tap just next to the small close button still closes.
    const b=await page.locator('#modalRoot .modal-close').boundingBox();
    await page.touchscreen.tap(b.x-8,b.y+b.height/2);
    await page.waitForFunction(()=>!document.querySelector('#modalRoot [role=dialog]'));
    await context.close();
  }

  // 4: costs remember the VAT of the supplier.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>newExpense());
    assert.equal(await page.locator('#expenseForm [name=vendor]').getAttribute('list'),'bkVendorList');
    await page.fill('#expenseForm [name=vendor]','Fictieve Telecom');
    await page.locator('#expenseForm [name=vendor]').dispatchEvent('change');
    assert.equal(await page.locator('#expenseForm input[name=vatRate][value="9"]').isChecked(),true);
    assert.match(await page.locator('.bk-hint').innerText(),/Zoals vorige keer: .*9% btw/);
    // A sum in the amount becomes its answer.
    await page.fill('#expenseForm [name=gross]','10 + 5,25');
    await page.locator('#expenseForm [name=gross]').dispatchEvent('focusout');
    assert.equal(await page.evaluate(()=>parseMoneyValue(document.querySelector('#expenseForm [name=gross]').value)),15.25);
    await context.close();
  }

  // 6, 7, 8: swipe and long press in phone lists; removing a cost is undone with one tap.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>navigate('invoices'));
    const row='#content .mobile-card-row[data-bk-invoice=i1] .mobile-card-main';
    await page.locator(row).waitFor();
    await touch(page,row,'pointerdown',100,560);
    for(let x=110;x<=230;x+=20)await touch(page,row,'pointermove',x,562);
    assert.equal(await page.locator('[data-bk-invoice=i1]').evaluate(e=>e.classList.contains('bk-swipe-armed')),true);
    await touch(page,row,'pointerup',230,562);
    await page.locator('#modalTitle').filter({hasText:'Betaald'}).waitFor();
    await page.evaluate(()=>closeModal());
    await touch(page,row,'pointerdown',100,560);await page.waitForTimeout(700);await touch(page,row,'pointerup',100,560);
    await page.locator('#modalTitle').filter({hasText:'2026-0001'}).waitFor();
    await page.evaluate(()=>closeModal());
    await page.evaluate(()=>navigate('expenses'));
    const er='#content .mobile-card-row[data-bk-expense=e2] .mobile-card-main';
    await page.locator(er).waitFor();
    const y=(await page.locator(er).boundingBox()).y+20;
    await touch(page,er,'pointerdown',300,y);
    for(let x=280;x>=150;x-=20)await touch(page,er,'pointermove',x,y);
    await touch(page,er,'pointerup',150,y);
    await page.locator('#toastRoot .toast-action').waitFor();
    assert.ok(await page.evaluate(()=>state.expenses.find(e=>e.id==='e2').correctedAt),'Swipe left takes the cost away');
    await page.locator('#toastRoot .toast-action').click();
    assert.equal(await page.evaluate(()=>state.expenses.length),2,'The correction is gone again');
    assert.equal(await page.evaluate(()=>state.expenses.find(e=>e.id==='e2').correctedAt),undefined);
    await context.close();
  }

  // 12, 13, 14 on a computer: shortcuts, typo search, a form error takes you to the field.
  {
    const {context,page}=await openApp({phone:false});
    await page.keyboard.press('?');
    assert.match(await page.locator('#modalRoot .bk-keys').innerText(),/Nieuwe factuur/);
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await page.locator('#modalTitle').filter({hasText:'Nieuwe factuur'}).waitFor();
    await page.locator('#modalRoot .modal-foot .btn.primary').last().click();
    await page.waitForFunction(()=>document.activeElement?.classList.contains('field-error'));
    await page.keyboard.press('Escape');
    const titles=q=>page.evaluate(q=>globalSearchResults(q).flatMap(g=>g[1].map(x=>x.title)),q);
    assert.ok((await titles('fictieve telekom')).includes('Fictieve Telecom'),'A typo still finds the supplier');
    assert.ok((await titles('albrt voorbeeld')).includes('Albert Voorbeeld'));
    assert.ok((await titles('fs')).includes('Fictieve Schilders'),'Initials find the customer');
    assert.equal((await titles('9999')).length,0,'Numbers still match exactly');
    await context.close();
  }
  // The typo search is in the app itself, also without handig.js.
  {
    const {context,page}=await openApp({handig:false});
    assert.equal(await page.evaluate(()=>searchTextHit('Fictieve Telecom','fictieve telekom')),true);
    assert.equal(await page.evaluate(()=>searchTextHit('Fictieve Telecom','bakker')),false);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Handige trucjes: OK ('+browserName+')');
}finally{
  await browser.close();server.close();
}
