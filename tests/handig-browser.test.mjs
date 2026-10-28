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
  // 17: on a computer a date field takes "gisteren" or "3 okt"; the app still reads 2026-10-03.
  {
    const {context,page}=await openApp({phone:false});
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const y=new Date();y.setDate(y.getDate()-1);
    assert.equal(await page.evaluate(()=>boekunaReadDate('3 okt 2026')),'2026-10-03');
    assert.equal(await page.evaluate(()=>boekunaReadDate('12-10-2026')),'2026-10-12');
    assert.equal(await page.evaluate(()=>boekunaReadDate('31-02-2026')),null,'No made-up dates');
    assert.equal(await page.evaluate(()=>boekunaReadDate('gisteren')),iso(y));
    await page.evaluate(()=>newInvoice());
    const issue=page.locator('#invoiceForm [name=issueDate]');
    assert.equal(await issue.getAttribute('type'),'text');
    assert.match(await raw(page,'#invoiceForm [name=issueDate]'),/^\d{2}-\d{2}-\d{4}$/,'Shown the Dutch way');
    await issue.fill('gisteren');
    assert.equal(await issue.evaluate(el=>el.value),iso(y),'The app reads ISO');
    assert.match(await page.locator('.bk-date-read').textContent(),/\d{4}/,'You see which day it is');
    assert.equal(await page.evaluate(()=>new FormData(document.getElementById('invoiceForm')).get('issueDate')),iso(y));
    await issue.fill('morgenochtend');
    assert.match(await issue.evaluate(el=>el.validationMessage),/datum/);
    await issue.fill('3 okt 2026');await page.locator('#invoiceForm [name=dueDate]').focus();
    assert.equal(await raw(page,'#invoiceForm [name=issueDate]'),'03-10-2026','Tidied when you leave the field');
    assert.equal(await page.locator('#invoiceForm .bk-date-native').count()>0,true,'The calendar is one tap away');
    // 19: pasting a whole address block fills the other fields of a new customer.
    const found=await page.evaluate(()=>boekunaSplitContact('Fictieve Bakkerij\nDorpsstraat 12\n3011 AB Rotterdam\ninfo@bakkerij.test\nKVK 12345678\nNL123456789B01'));
    assert.deepEqual([found.name,found.address,found.postal,found.city,found.email,found.kvk,found.vat],['Fictieve Bakkerij','Dorpsstraat 12','3011 AB','Rotterdam','info@bakkerij.test','12345678','NL123456789B01']);
    if(browserName==='chromium'){
      await page.selectOption('#invoiceCustomer','__new__');
      await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','Fictieve Bakkerij\nDorpsstraat 12\n3011 AB Rotterdam\ninfo@bakkerij.test');document.querySelector('[name=newCustomerName]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))});
      assert.deepEqual(await page.evaluate(()=>['newCustomerAddress','newCustomerPostal','newCustomerCity','newCustomerEmail'].map(n=>document.querySelector('[name='+n+']').value)),['Dorpsstraat 12','3011 AB','Rotterdam','info@bakkerij.test']);
      assert.match(await page.locator('#toastRoot').textContent(),/velden ingevuld/);
    }
    await page.evaluate(()=>closeModal());
    // 20: an IBAN on screen is one tap to copy.
    await page.evaluate(()=>document.getElementById('content').insertAdjacentHTML('beforeend','<p id="bkCopyTest">Betaal naar NL91 ABNA 0417 1643 00 graag</p>'));
    await page.locator('#bkCopyTest .bk-copy').waitFor();
    assert.equal(await page.locator('#bkCopyTest .bk-copy').getAttribute('data-copy'),'NL91ABNA0417164300');
    assert.equal(await page.locator('#bkCopyTest').textContent(),'Betaal naar NL91 ABNA 0417 1643 00 graag','The text stays the same');
    // 22: the sound setting sits next to "Bedragen verbergen".
    await page.evaluate(()=>openSettingsSection('app'));
    await page.locator('#bkSoundToggle').waitFor({state:'attached'});
    await page.evaluate(()=>{const t=document.getElementById('bkSoundToggle');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}))});
    assert.equal(await page.evaluate(()=>localStorage.getItem('boekuna.sound')),'off');
    await context.close();
  }
  // Phones keep their own date wheel.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>newExpense());
    assert.equal(await page.locator('#expenseDate').getAttribute('type'),'date');
    await page.evaluate(()=>closeModal());
    // 18 + 29: the + menu puts what you use most first and has "Kost in één zin".
    await page.evaluate(()=>{localStorage.setItem('boekuna.quickUse',JSON.stringify({Kosten:6,Factuur:1}));quickMenu()});
    await page.locator('#modalRoot .bk-quick-cost-tile').waitFor();
    assert.equal(await page.locator('#modalRoot .quick-tiles .quick-tile').first().textContent(),'Kosten');
    await page.locator('#modalRoot .bk-quick-cost-tile').click();
    await page.locator('#bkQuickCostText').waitFor();
    await page.locator('#bkQuickCostText').fill('12,50 euro parkeren bij Q-Park gisteren');
    assert.match(await page.locator('#bkQuickCostRead').textContent(),/12,50.*Q-Park.*Reiskosten/);
    await page.locator('#bkQuickCostGo').click();
    await page.locator('#expenseForm').waitFor();
    await page.waitForFunction(()=>document.querySelector('#expenseForm [name=vendor]').value==='Q-Park');
    assert.deepEqual(await page.evaluate(()=>{const f=document.getElementById('expenseForm');return [f.elements.gross.value,f.elements.category.value,f.elements.date.value]}),['12.5','Reiskosten',(d=>{d.setDate(d.getDate()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})(new Date())]);
    assert.equal(await page.evaluate(()=>boekunaReadCostLine('vijf euro koffie bij De Hoek').amount),5);
    await page.evaluate(()=>closeModal());
    // 27: the same supplier again offers last time's amount in one tap.
    await page.evaluate(()=>newExpense());
    await page.locator('#expenseForm [name=vendor]').fill('Kantoorwinkel');
    await page.locator('#expenseForm [name=vendor]').dispatchEvent('change');
    await page.locator('#expenseForm .bk-again').click();
    assert.equal(await page.evaluate(()=>document.querySelector('#expenseForm [name=gross]').value),'60.5');
    await page.evaluate(()=>closeModal());
    // 23: tap an amount in a list to see it without btw.
    await page.evaluate(()=>navigate('invoices'));
    const value=page.locator('#content .mobile-card-row[data-bk-invoice="i1"] .mobile-card-value');
    await page.locator('#content .mobile-card-row[data-bk-invoice="i1"] .bk-vat-flip').waitFor();
    const gross=await value.textContent();
    await value.click();
    assert.match(await value.textContent(),/1\.200,00.*excl\./,'Shown without btw');
    await value.click();
    assert.equal(await value.textContent(),gross,'And back');
    // 21: the last "Versturen" of an invoice needs a short hold, a quick tap shows how.
    await page.evaluate(()=>newInvoice());
    const sendBtn=page.locator('#modalRoot .btn.primary',{hasText:/^Versturen$/});
    if(await sendBtn.count()){
      await page.evaluate(()=>{const b=[...document.querySelectorAll('#modalRoot .btn.primary')].find(x=>x.textContent.trim()==='Versturen');window.__sent=0;b.addEventListener('click',()=>window.__sent++);b.id='bkSendTest'});
      await touch(page,'#bkSendTest','pointerdown',10,10);await touch(page,'#bkSendTest','pointerup',10,10);
      await page.evaluate(()=>document.getElementById('bkSendTest').click());
      assert.equal(await page.evaluate(()=>window.__sent),0,'A quick tap does not send');
      assert.equal(await page.locator('#modalRoot .bk-hold-hint').count(),1);
      await touch(page,'#bkSendTest','pointerdown',10,10);
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(()=>window.__sent),1,'Holding sends');
    }else assert.fail('The phone invoice has a Versturen button');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Handige trucjes: OK ('+browserName+')');
}finally{
  await browser.close();server.close();
}
