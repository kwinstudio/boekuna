// Kwin 2026-10-17 (minder tekst, alleen telefoon): sentences that repeat what the screen already shows are gone
// on the phone, even with "Extra uitleg tonen" on. Money, law and safety lines stay. The computer keeps everything.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { buildApp, startAppServer } from './lib/app-fixture.mjs';

process.env.BOEKUNA_RELEASE_PROFILE='first-release';process.env.BOEKUNA_ASSISTANT_ENABLED='false';
buildApp();
const {server,url}=await startAppServer({extraBoot:'state.meta=state.meta||{};state.meta.extraHelpEnabled=true;'});
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
const text=async(page,where)=>{await page.evaluate(w=>{closeModal();navigate(w)},where);await page.waitForTimeout(150);return page.locator('#content').innerText()};
const gone=(body,list,label)=>{for(const t of list)assert.ok(!body.includes(t),label+' still shows: '+t)};
const kept=(body,list,label)=>{for(const t of list)assert.ok(body.includes(t),label+' lost: '+t)};

try{
  const phone=await open({width:390,height:844});
  const dash=await text(phone,'dashboard');
  gone(dash,['Omzet minus kosten','na btw en geschatte belasting','Excl. btw','tot nu:','Op basis van je huidige administratie'],'Overzicht');
  // Kwin 2026-10-22 ("rustiger" A): only the Winst block and four labelled amounts; no sub lines under them.
  gone(dash,['dit jaar, schatting','Aangifte vóór','Te laat'],'Overzicht');
  kept(dash,['Winst','Omzet','Kosten','Te ontvangen'],'Overzicht');

  gone(await text(phone,'invoices'),['Maak facturen en houd bij'],'Inkomsten');
  gone(await text(phone,'expenses'),['Bekijk en controleer je zakelijke kosten'],'Kosten');
  const docs=await text(phone,'documents');
  gone(docs,['Ondersteund:','· Upload','2026 ·'],'Bonnetjes');
  /* Kwin 2026-10-22: one block with the count, then calm rows without second lines. */gone(docs,['7 jaar lang'],'Bonnetjes');
  const bank=await text(phone,'bank');
  gone(bank,['Controleer bij- en afschrijvingen','1 betaling','Geen bon of kosten gevonden'],'Bank');
  // Rows show name, amount and a dot; what a payment belongs to shows when you tap it.
  gone(bank,['Geen bon gevonden','2026-0002 Studio Voorbeeld'],'Bank');
  const vat=await text(phone,'vat');
  gone(vat,['indicatie','Over €','Uit 2 bonnen'],'Btw');
  kept(vat,['Boekuna verstuurt deze aangifte niet'],'Btw');
  // The quarter is the period pill in the band (round 2, 2026-10-23); the title line carries nothing else.
  assert.equal((await phone.locator('#content .r1d-hero .r1d-pill-btn').first().innerText()).trim(),(await phone.locator('.vat-period-label').innerText()).trim(),'Btw band shows only the quarter as its period pill');
  assert.equal(await phone.locator('#content .r1d-title .page-status').count(),0,'Btw title line has no subtitle on the phone');
  const reports=await text(phone,'reports');
  gone(reports,['Inzicht in je omzet','Omzet · Kosten · Winst','beide jaren','Dit jaar · te betalen',"Hele euro",'Voor je eigen archief','Je rapport als document','klanten · excl. btw','je neemt de bedragen over'],'Rapportages');
  kept(reports,['Zelfstandigenaftrek alleen bij 1.225 uur of meer. Boekuna verstuurt deze aangifte niet.','Naar Data & export'],'Rapportages');
  gone(await text(phone,'trips'),['Nog geen ritten dit jaar'],'Ritten');
  assert.equal(await phone.locator('#content :is(.page-head,.r1d-title) .page-status').count(),0,'Ritten has no subtitle on the phone');

  // Nieuw (Kwin 2026-10-21, voorstel A): three tiles and plain rows, names only.
  await phone.evaluate(()=>{closeModal();navigate('dashboard');quickMenu()});
  const meer=await phone.locator('#modalRoot').innerText();
  gone(meer,['Boekuna herkent het soort','km automatisch','met je prijs'],'Nieuw');
  kept(meer,['Uploaden','Rit'],'Nieuw');

  // Kosten toevoegen
  await phone.evaluate(()=>{closeModal();newExpense()});
  await phone.locator('#expenseForm').waitFor();
  const form=await phone.locator('#modalRoot').innerText();
  gone(form,['Het totaal op de bon','Kijk op de bon bij'],'Kosten toevoegen');
  kept(form,['Met btw'],'Kosten toevoegen');

  // Factuur: step 1 without the eyebrow, invoice view shows only the customer.
  await phone.evaluate(()=>{closeModal();newInvoice()});
  await phone.locator('.mobile-invoice-step').first().waitFor();
  gone(await phone.locator('#modalRoot').innerText(),['Snelste optie'],'Factuur stap 1');
  await phone.evaluate(()=>{closeModal();viewInvoice('i0')});
  await phone.locator('.invoice-view-who').waitFor();
  assert.equal((await phone.locator('.invoice-view-who').innerText()).trim(),'Fictieve klant BV');

  // Instellingen
  for(const [section,list] of [['notifications',['Een klant heeft na de betaaltermijn']],['data',['Je ziet hem eerst','Hiermee kun je later','Je dagelijkse administratie']],['help',['Laat het ons weten','Welke gegevens Boekuna']],['invoices',['Geldt voor nieuwe facturen']]]){
    await phone.evaluate(()=>{closeModal();navigate('settings')});
    await phone.locator('[data-settings-open="'+section+'"]').first().click();
    await phone.waitForTimeout(150);
    gone(await phone.locator('#content').innerText(),list,'Instellingen '+section);
  }

  // Computer: unchanged.
  const desk=await open({width:1440,height:900});
  kept(await text(desk,'dashboard'),['Omzet minus kosten','na btw en geschatte belasting'],'Computer Overzicht');
  kept(await text(desk,'invoices'),['Maak facturen en houd bij'],'Computer Inkomsten');
  kept(await text(desk,'reports'),['Inzicht in je omzet'],'Computer Rapportages');
  await desk.evaluate(()=>{closeModal();newExpense()});
  kept(await desk.locator('#modalRoot').innerText(),['Het totaal op de bon, met btw.','Kijk op de bon bij'],'Computer Kosten toevoegen');
  await desk.evaluate(()=>{closeModal();navigate('settings')});
  await desk.locator('[data-settings-open="data"]').first().click();
  kept(await desk.locator('#content').innerText(),['Je ziet hem eerst'],'Computer Data & export');

  assert.deepEqual(pageErrors,[],'no page errors');
  console.log('less-text-phone-browser ok ('+browserName+')');
}finally{
  await browser.close();server.close();
}
