// Kwin 2026-10-17 (wet van Hick, alleen telefoon): fewer options at once, the rest one tap further.
// Nieuw > Meer has one Uploaden and one Bank, the Inkomsten filters only ask what the page does not show,
// the btw choice for a cost shows 21%, 9%, Geen btw and Anders…, and the overview shows the three most urgent to-dos.
// The computer keeps everything as it was.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { buildApp, startAppServer } from './lib/app-fixture.mjs';

// The live profile (first-release, no assistant) is the one that shows "Nog te doen".
process.env.BOEKUNA_RELEASE_PROFILE='first-release';process.env.BOEKUNA_ASSISTANT_ENABLED='false';
buildApp();
const {server,url}=await startAppServer({});
const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
const pageErrors=[];
async function open(viewport){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.goto(url);
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.boot-intro'),null,{timeout:10000}).catch(()=>{});
  return page;
}
const labels=async(page,sel)=>(await page.locator(sel).allTextContents()).map(v=>v.trim());

try{
  const phone=await open({width:390,height:844});

  // Nog te doen sits behind one "N te doen" button (Kwin 2026-10-22); inside: three, most urgent first, then "Nog N bekijken" shows the rest.
  await phone.locator('#content .calm-todo summary').click();
  const items=phone.locator('#content .dashboard-attention-item');
  const total=await items.count();
  assert.ok(total>3,'fixture has more than three to-dos: '+total);
  assert.equal(await phone.locator('#content .dashboard-attention-item:visible').count(),3,'phone shows three to-dos');
  const tones=await phone.locator('#content .dashboard-attention-item:visible').evaluateAll(n=>n.map(el=>el.classList.contains('urgent')));
  assert.deepEqual(tones.slice(0,2),[true,true],'urgent to-dos come first');
  const more=phone.locator('#content .dashboard-attention-more');
  assert.equal((await more.innerText()).trim(),'Nog '+(total-3)+' bekijken');
  await more.click();
  assert.equal(await phone.locator('#content .dashboard-attention-item:visible').count(),total,'all to-dos after Nog bekijken');

  // Nieuw: one Uploaden, one Bank (which then offers bankbestand or losse betaling).
  // Kwin 2026-10-21 (voorstel A): no Meer fold; they are the first rows under the three tiles.
  await phone.locator('#quickNew').click();
  const meer=await labels(phone,'#modalRoot .quick-rows .quick-action strong');
  assert.deepEqual(meer.slice(0,2),['Uploaden','Bank'],'Rows start with Uploaden and Bank: '+meer.join(', '));
  for(const gone of ['Banktransactie','Bankbestand','Factuur uploaden','Document uploaden'])assert.ok(!meer.includes(gone),'merged: '+gone);
  assert.match(await phone.locator('#modalRoot .quick-action').filter({hasText:'Uploaden'}).getAttribute('onclick'),/openDocumentUpload\(\)/);
  await phone.locator('#modalRoot .quick-action').filter({hasText:'Bank'}).first().click();
  await phone.locator('#modalRoot .quick-bank-choice').waitFor();
  assert.deepEqual(await labels(phone,'#modalRoot .quick-bank-choice strong'),['Bankbestand','Losse betaling']);
  await phone.locator('#modalRoot .quick-action').filter({hasText:'Losse betaling'}).click();
  await phone.locator('#txForm').waitFor();
  await phone.evaluate(()=>closeModal());

  // Inkomsten filters: Klant and one Sorteren list; the quick filter on the page survives Toepassen.
  await phone.evaluate(()=>{navigate('invoices');listPageState('invoices').filters={...listPageState('invoices').filters,status:'overdue'};render()});
  await phone.locator('#content [data-list-open-filters]').click();
  await phone.locator('#listFilterForm').waitFor();
  assert.deepEqual(await phone.locator('#listFilterForm select').evaluateAll(n=>n.map(el=>el.name)),['customer','sort'],'only Klant and Sorteren');
  assert.equal(await phone.locator('#listFilterForm input[type=radio]').count(),0,'no stack of sort radio cards');
  await phone.locator('#listFilterSort').selectOption({index:1});
  await phone.locator('#modalRoot button[type=submit]').click();
  await phone.locator('#modalRoot .modal').waitFor({state:'detached'});
  assert.equal(await phone.evaluate(()=>listPageState('invoices').filters.status),'overdue','Te laat stays on');
  assert.notEqual(await phone.evaluate(()=>listPageState('invoices').sort),'','sort applied');

  // Btw for a cost: 21%, 9%, Geen btw, Anders…; Anders shows Meerdere tarieven and Weet ik niet.
  await phone.evaluate(()=>newExpense());
  await phone.locator('#modalRoot .choice-chips').first().waitFor();
  const vatChips=()=>phone.locator('#modalRoot fieldset.choice-group .choice-chip:visible');
  assert.deepEqual((await vatChips().allTextContents()).map(v=>v.trim()),['21%','9%','Geen btw','Anders…']);
  await phone.locator('#modalRoot .choice-chip-more').click();
  assert.deepEqual((await vatChips().allTextContents()).map(v=>v.trim()),['21%','9%','Geen btw','Meerdere tarieven','Weet ik niet']);
  await phone.locator('#modalRoot .choice-chip').filter({hasText:'Weet ik niet'}).click();
  assert.equal(await phone.locator('#modalRoot input[name=vatRate]:checked').inputValue(),'unknown');
  await phone.evaluate(()=>closeModal());
  await phone.screenshot({path:'tests/artifacts/fewer-choices-phone-'+browserName+'.png',fullPage:true}).catch(()=>{});

  // Computer: unchanged.
  const desk=await open({width:1440,height:900});
  assert.equal(await desk.locator('#content .dashboard-attention-more').count(),0,'computer shows every to-do');
  await desk.evaluate(()=>quickMenu());
  assert.ok((await labels(desk,'#modalRoot .quick-action strong')).includes('Banktransactie'),'computer Nieuw unchanged');
  await desk.evaluate(()=>{closeModal();newExpense()});
  await desk.locator('#modalRoot .choice-chips').first().waitFor();
  assert.equal(await desk.locator('#modalRoot fieldset.choice-group .choice-chip:visible').count(),5,'computer keeps all five btw choices');
  await desk.evaluate(()=>{closeModal();navigate('invoices')});
  await desk.locator('#content [data-list-open-filters]').click();
  assert.ok((await desk.locator('#listFilterForm select').evaluateAll(n=>n.map(el=>el.name))).includes('status'),'computer filters keep Status');

  assert.deepEqual(pageErrors,[],'no page errors');
  console.log('fewer-choices phone '+browserName+': ok');
}finally{
  await browser.close();server.close();
}
