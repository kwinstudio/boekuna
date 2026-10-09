// Release audit: a new entrepreneur (user A), an experienced one (user B) and someone who makes
// mistakes (user C) use the real production build (first-release profile) through the UI.
// Every expected amount is computed independently in whole cents, never with the app's own helpers.
// Only login is replaced; all requests outside the local server are blocked and recorded.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium,webkit,firefox} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engineName=process.env.BOOKUNA_BROWSER||'chromium';
const engine={chromium,webkit,firefox}[engineName]||chromium;
const evidence=process.env.RELEASE_AUDIT_SHOTS||'';
if(evidence)fs.mkdirSync(evidence,{recursive:true});
let dist=process.env.RELEASE_AUDIT_DIST||'';
if(!dist){
  const run=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,BOEKUNA_RELEASE_PROFILE:'first-release'}});
  if(run.status!==0)throw new Error('Production build failed:\n'+run.stdout+run.stderr);
  dist=path.join(root,'dist','app');
}
const sourceHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
if(!sourceHtml.includes('"name":"first-release"'))throw new Error('Audit must run on the first-release (production) profile');

// ---------- independent money math (integer cents, half up) ----------
const cents=v=>{const [i,f='']=String(v).split('.');return Number(i)*100+Number((f+'00').slice(0,2))};
const lineCents=(qty,unit)=>{const q=Math.round(qty*100),u=cents(unit);return Math.floor((q*u+50)/100)};
const vatCents=(netCents,rate)=>{const x=netCents*rate;return Math.sign(x)*Math.floor((Math.abs(x)+50)/100)};
const eur=c=>'€ '+(c<0?'-':'')+Math.floor(Math.abs(c)/100).toLocaleString('nl-NL')+','+String(Math.abs(c)%100).padStart(2,'0');
const plain=s=>String(s).replace(/[  ]/g,' ').replace(/\s+/g,' ');

// ---------- results ----------
const results=[];
let current='';
function area(name){current=name}
function check(id,title,pass,detail=''){results.push({id,area:current,title,status:pass?'PASS':'FAIL',detail:pass?'':String(detail).slice(0,400)});if(!pass)console.log('FAIL',id,title,detail)}
function blocked(id,title,reason){results.push({id,area:current,title,status:'BLOCKED',detail:reason})}
async function attempt(id,title,fn){try{const r=await fn();check(id,title,r!==false,r===false?'assertion returned false':'')}catch(e){check(id,title,false,e.message)}}

// ---------- local server with fake login ----------
const STUBS="loadBillingSummary=async()=>{};handleBillingReturnAndPlan=async()=>{};handleMailboxReturn=()=>{};initDocumentBackgroundProcessing=async()=>{};resumePendingDocumentVerifications=async()=>{};documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;";
const COMPANY="Object.assign(state.company,{name:'Bakkerij Test',address:'Teststraat 1',postal:'3011 AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',email:'info@bakkerij.example'});";
const CUSTOMER="state.contacts=[{id:'c1',type:'customer',name:'Klant Een BV',email:'klant@een.example',address:'Klantweg 5',postal:'1011AB',city:'Amsterdam'}];";
const FRESH="currentUser={...TEST_USER,email:'nieuw@example.test'};state=structuredClone(DEFAULT);";
const boots={
  fresh:FRESH+STUBS,
  company:FRESH+COMPANY+CUSTOMER+STUBS,
  auth:FRESH+STUBS
};
const MIME={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
function htmlFor(kind,extra=''){
  let html=sourceHtml.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
  const marker=html.lastIndexOf('initAuth();');
  const tail=kind==='auth'?"showAuth('login');":'enterApp();';
  return html.slice(0,marker)+boots[kind]+extra+tail+html.slice(marker+'initAuth();'.length);
}
let bootExtra='';
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/app'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(htmlFor(u.searchParams.get('boot')||'company',bootExtra))}
  const file=path.join(dist,decodeURIComponent(u.pathname).replace(/^\//,''));
  if(file.startsWith(dist+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});return fs.createReadStream(file).pipe(res)}
  res.writeHead(404);res.end('not found');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await engine.launch({headless:true});
const pageErrors=[],consoleErrors=[],externalCalls=[];
const pdfBytes=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

async function open(boot='company',{width=1440,height=900,mobile=false}={}){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile&&engineName!=='firefox',hasTouch:mobile,acceptDownloads:true});
  await context.addInitScript(isMobile=>{
    window.__shares=[];
    Object.defineProperty(navigator,'canShare',{configurable:true,value:d=>!!(d&&d.files&&isMobile)});
    Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.__shares.push(d.title)}});
  },mobile);
  const page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(boot+' '+width+': '+e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(boot+' '+width+': '+m.text().slice(0,200))});
  // Playwright tries the newest route first: block the outside world, then answer the PDF render.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>{externalCalls.push(r.request().method()+' '+r.request().url().slice(0,100));r.abort()});
  await page.route('**/functions/v1/send-invoice',r=>r.fulfill({status:200,contentType:'application/pdf',body:pdfBytes}));
  await page.goto(base+'/app?boot='+boot,{waitUntil:'domcontentloaded'});
  if(boot==='auth')await page.locator('#authForm').waitFor();
  else await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display==='grid');
  return {context,page};
}
const shot=async(page,name)=>{if(evidence)await page.screenshot({path:path.join(evidence,engineName+'-'+name+'.png')})};
const content=async page=>plain(await page.locator('#content').innerText());
const appState=(page,fn,arg)=>page.evaluate(fn,arg);

try{
  // ================= User A: new entrepreneur, desktop =================
  area('Onboarding & bedrijfsgegevens');
  {
    const {context,page}=await open('fresh');
    await attempt('A-01','Nieuw dashboard toont één duidelijke eerste stap',async()=>/Begin met Boekuna/.test(await content(page))&&await page.getByRole('button',{name:'Bedrijfsgegevens invullen'}).count()===1);
    await shot(page,'A01-dashboard-nieuw');
    await page.getByRole('button',{name:'Bedrijfsgegevens invullen'}).click();
    const f=page.locator('#profileForm');
    for(const [k,v] of Object.entries({name:'Bakkerij Test',address:'Teststraat 1',postal:'3011 AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',iban:'NL91 ABNA 0417 1643 00',email:'info@bakkerij.example'}))await f.locator(`[name=${k}]`).fill(v);
    await page.getByRole('button',{name:'Bedrijfsgegevens opslaan'}).click();
    await attempt('A-02','Bedrijfsgegevens opslaan via formulier',async()=>{const c=await appState(page,()=>state.company);return c.name==='Bakkerij Test'&&c.kvk==='12345678'&&c.city==='Rotterdam'});
    await attempt('A-03','Melding "Factuurbasis compleet" na invullen verplichte velden',async()=>/Factuurbasis compleet/.test(await content(page)));
    await context.close();
  }

  area('Relaties');
  {
    const {context,page}=await open('company');
    await page.evaluate(()=>{state.contacts=[];navigate('contacts')});
    await page.getByRole('button',{name:'Relatie toevoegen'}).click();
    await page.locator('#contactName').fill('Klant Twee BV');
    await page.locator('#contactEmail').fill('twee@klant.example');
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    await attempt('A-10','Relatie aanmaken via formulier',async()=>(await appState(page,()=>state.contacts.map(c=>c.name))).join()==='Klant Twee BV');
    await attempt('A-11','Nieuwe relatie zichtbaar in de lijst',async()=>/Klant Twee BV/.test(await content(page)));
    await page.getByRole('button',{name:'Nieuwe relatie'}).click();
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    await attempt('C-10','Relatie zonder naam wordt niet opgeslagen',async()=>(await appState(page,()=>state.contacts.length))===1&&await page.locator('#contactForm').count()===1);
    await page.keyboard.press('Escape');
    const id=await appState(page,()=>state.contacts[0].id);
    await page.evaluate(id=>editContact(id),id);
    await page.locator('#contactCity').fill('Utrecht');
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    await attempt('A-12','Relatie wijzigen bewaart de wijziging',async()=>(await appState(page,()=>state.contacts[0].city))==='Utrecht');
    await page.locator('#content input[type=search],#content input[placeholder*="Zoek"]').first().fill('twee').catch(()=>{});
    await attempt('B-10','Zoeken in relaties vindt de relatie',async()=>/Klant Twee BV/.test(await content(page)));
    await context.close();
  }

  area('Facturen');
  // 22,50 x 21% = 4,725 -> 4,73 (half up); 3 x 4,15 = 12,45 x 9% = 1,1205 -> 1,12
  const l1=lineCents(1,'22.50'),l2=lineCents(3,'4.15'),v1=vatCents(l1,21),v2=vatCents(l2,9);
  const expNet=l1+l2,expVat=v1+v2,expGross=expNet+expVat;
  {
    const {context,page}=await open('company');
    await page.evaluate(()=>navigate('invoices'));
    await page.getByRole('button',{name:'Eerste factuur maken'}).click();
    const m=page.locator('#modalRoot');
    await m.locator('#invoiceCustomer').selectOption('c1');
    let row=m.locator('#invoiceLines .line-item').nth(0);
    await row.locator('[data-k=desc]').fill('Taart');await row.locator('[data-k=unit]').fill('22.50');await row.locator('[data-k=vat]').selectOption('21');
    await m.getByRole('button',{name:'+ Regel'}).click();
    row=m.locator('#invoiceLines .line-item').nth(1);
    await row.locator('[data-k=desc]').fill('Brood');await row.locator('[data-k=qty]').fill('3');await row.locator('[data-k=unit]').fill('4.15');await row.locator('[data-k=vat]').selectOption('9');
    const modalText=plain(await m.innerText());
    await shot(page,'A20-factuur-ingevuld');
    check('A-20','Factuurformulier: btw 21% van 22,50 is 4,73',modalText.includes('Btw 21% '+eur(v1).replace(' ',' ')),'scherm: '+modalText.match(/Btw 21%[^/]*?€ ?[\d.,]+/)?.[0]);
    check('A-21','Factuurformulier: btw 9% van 12,45 is 1,12',modalText.includes('Btw 9% '+eur(v2).replace(' ',' ')),'scherm: '+modalText.match(/Btw 9%[^/]*?€ ?[\d.,]+/)?.[0]);
    check('A-22','Factuurformulier: totaal te betalen '+eur(expGross),modalText.includes('Totaal te betalen '+eur(expGross).replace(' ',' ')),'scherm: '+modalText.match(/Totaal te betalen € ?[\d.,]+/)?.[0]);
    await m.getByRole('button',{name:'Opslaan'}).dblclick();
    await page.waitForTimeout(400);
    const inv=await appState(page,()=>state.invoices.map(i=>({id:i.id,number:i.number,status:i.status,net:Math.round(invoiceNet(i)*100),vat:Math.round(invoiceVat(i)*100),gross:Math.round(invoiceGross(i)*100)})));
    check('A-23','Dubbelklik op Opslaan maakt één concept',inv.length===1&&inv[0].status==='draft',JSON.stringify(inv));
    check('A-24','Opgeslagen concept: netto, btw en totaal kloppen',inv[0]&&inv[0].net===expNet&&inv[0].vat===expVat&&inv[0].gross===expGross,JSON.stringify(inv[0])+' verwacht '+[expNet,expVat,expGross]);
    check('A-25','Netto + btw = bruto',inv[0]&&inv[0].net+inv[0].vat===inv[0].gross,JSON.stringify(inv[0]));
    // Finalise through the normal send screen.
    const firstId=inv[0]?.id;
    await page.locator('#content tr',{hasText:'Klant Een BV'}).locator('button').last().click();
    await m.getByRole('button',{name:/Versturen/}).click();
    await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
    const sent=await appState(page,()=>state.invoices.map(i=>({number:i.number,status:i.status})));
    check('A-26','Versturen maakt het concept definitief met nummer '+new Date().getFullYear()+'-0001',sent[0]?.number===new Date().getFullYear()+'-0001'&&sent[0]?.status==='sent',JSON.stringify(sent));
    await page.locator('#modalRoot').getByRole('button',{name:/Annuleren|Sluiten/}).first().click().catch(()=>page.keyboard.press('Escape'));
    // A second invoice gets the next number, without gaps or duplicates.
    await page.evaluate(()=>newInvoice());
    await m.locator('#invoiceCustomer').selectOption('c1');
    row=m.locator('#invoiceLines .line-item').nth(0);
    await row.locator('[data-k=desc]').fill('Workshop');await row.locator('[data-k=unit]').fill('100');
    await m.locator('[name=status]').selectOption('sent');
    await m.getByRole('button',{name:'Opslaan'}).click();
    await page.waitForTimeout(300);
    const nums=await appState(page,()=>state.invoices.map(i=>i.number).sort());
    const y=new Date().getFullYear();
    check('A-27','Tweede definitieve factuur krijgt het volgende nummer zonder dubbel',JSON.stringify(nums)===JSON.stringify([y+'-0001',y+'-0002']),JSON.stringify(nums));
    // Preview / PDF
    await page.evaluate(id=>invoiceActions(id),firstId);
    await m.getByRole('button',{name:/Bekijken/}).click();
    await page.waitForTimeout(500);
    await shot(page,'A28-factuur-bekijken');
    const preview=plain(await m.innerText().catch(()=>''));
    check('A-28','Factuurvoorbeeld toont factuurnummer, IBAN en totaal',preview.includes(y+'-0001')&&/NL91/.test(preview)&&preview.includes(eur(expGross).replace(' ',' ')),preview.slice(-600));
    await page.keyboard.press('Escape');
    // Payment
    await page.evaluate(id=>registerPayment(id),firstId);
    await m.getByRole('button',{name:'Opslaan als betaald'}).click();
    const paid=await appState(page,id=>{const i=state.invoices.find(x=>x.id===id);return {status:i.status,out:invoiceOutstanding(i)}},firstId);
    check('A-29','Betaling registreren zet factuur op betaald, niets meer open',paid.status==='paid'&&paid.out===0,JSON.stringify(paid));
    await context.close();
  }

  area('Kosten');
  {
    const {context,page}=await open('company');
    page.on('dialog',d=>d.accept());
    await page.evaluate(()=>navigate('expenses'));
    // An empty Kosten page only offers upload; typing a receipt in goes through "Nieuw".
    check('A-39','Lege kostenpagina biedt ook "zelf invullen" aan',await page.locator('#content').getByRole('button',{name:/Zelf invullen|Kosten boeken/}).count()>0,'alleen "Bon of factuur toevoegen" (bestandskiezer); zelf invullen zit onder Nieuw');
    await page.getByRole('button',{name:'Nieuw',exact:true}).click();
    await page.locator('#modalRoot .quick-action',{hasText:'Kosten boeken'}).click();
    const f=page.locator('#expenseForm');
    await f.locator('[name=gross]').fill('60.50');
    await f.locator('[name=vendor]').fill('Groothandel Test');
    const g=cents('60.50'),split=(gross,rate)=>Math.floor((2*gross*rate+100+rate)/(2*(100+rate)));
    const vat21=split(g,21),vat9=split(g,9);
    await attempt('A-40','Kostenformulier toont de btw die je terugkrijgt ('+eur(vat21)+')',async()=>plain(await f.innerText()).includes('Hiervan is '+eur(vat21)+' btw'));
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    let e=await appState(page,()=>state.expenses.map(x=>({id:x.id,ex:Math.round(x.exVat*100),vat:Math.round(x.vatAmount*100),gross:Math.round(x.gross*100)})));
    check('A-41','Kosten opgeslagen: excl. '+eur(g-vat21)+', btw '+eur(vat21),e.length===1&&e[0].ex===g-vat21&&e[0].vat===vat21&&e[0].gross===g,JSON.stringify(e));
    await attempt('A-42','Kosten staan in de lijst met excl. en incl. bedrag',async()=>{const t=await content(page);return t.includes('Groothandel Test')&&t.includes(eur(g-vat21))&&t.includes(eur(g))});
    await page.evaluate(id=>expenseActions(id),e[0].id);
    await page.locator('#modalRoot').getByRole('button',{name:'Aanpassen'}).click();
    await page.locator('#expenseForm .choice-chip',{hasText:'9%'}).click();
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    e=await appState(page,()=>state.expenses.map(x=>({id:x.id,ex:Math.round(x.exVat*100),vat:Math.round(x.vatAmount*100),gross:Math.round(x.gross*100),rate:x.vatRate})));
    check('A-43','Kosten aanpassen naar 9%: btw '+eur(vat9),e.length===1&&e[0].vat===vat9&&e[0].ex===g-vat9&&e[0].rate===9,JSON.stringify(e));
    await page.evaluate(id=>expenseActions(id),e[0].id);
    await page.locator('#modalRoot').getByRole('button',{name:'Weghalen'}).click();
    const after=await appState(page,()=>({n:state.expenses.length,sum:Math.round(state.expenses.reduce((s,x)=>s+expenseGross(x),0)*100)}));
    check('A-44','Kosten weghalen boekt een tegenboeking; totaal wordt 0',after.n===2&&after.sum===0,JSON.stringify(after));
    // User C
    for(const [id,value,title] of [['C-20','0','Kosten van € 0 worden niet opgeslagen'],['C-21','-5','Negatief bedrag wordt niet opgeslagen']]){
      const before=await appState(page,()=>state.expenses.length);
      await page.evaluate(()=>newExpense());
      await page.locator('#expenseForm [name=gross]').fill(value);
      await page.locator('#expenseForm [name=vendor]').fill('Fout '+value);
      await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
      check(id,title,(await appState(page,()=>state.expenses.length))===before,'opgeslagen met bedrag '+value);
      await page.evaluate(()=>closeModal());
    }
    await page.evaluate(()=>newExpense());
    await page.locator('#expenseForm [name=gross]').fill('12.10');await page.locator('#expenseForm [name=vendor]').fill('Zonder datum');await page.locator('#expenseForm [name=date]').fill('');
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    await attempt('C-22','Kosten zonder datum worden niet opgeslagen',async()=>!(await appState(page,()=>state.expenses.some(x=>x.vendor==='Zonder datum'))));
    await page.evaluate(()=>closeModal());
    await page.evaluate(()=>newExpense());
    await page.locator('#expenseForm [name=gross]').fill('24.20');await page.locator('#expenseForm [name=vendor]').fill('Dubbel');
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).dblclick();
    await attempt('C-23','Dubbelklik op Opslaan maakt één kostenpost',async()=>(await appState(page,()=>state.expenses.filter(x=>x.vendor==='Dubbel').length))===1);
    await page.evaluate(()=>newExpense());
    await page.locator('#expenseForm [name=gross]').fill('12.10');await page.locator('#expenseForm [name=vendor]').fill('Jaar 2206');await page.locator('#expenseForm [name=date]').fill('2206-01-01');
    await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
    check('C-24','Datum ver in de toekomst (2206) wordt geweigerd of gemeld',!(await appState(page,()=>state.expenses.some(x=>x.vendor==='Jaar 2206'))),'opgeslagen op 2206-01-01 zonder melding');
    await page.evaluate(()=>closeModal&&closeModal());
    await context.close();
  }

  area('Facturen: fouten van gebruiker C');
  {
    const {context,page}=await open('company');
    await page.evaluate(()=>{navigate('invoices');newInvoice()});
    const m=page.locator('#modalRoot');
    let row=m.locator('#invoiceLines .line-item').nth(0);
    await row.locator('[data-k=desc]').fill('Zonder klant');await row.locator('[data-k=unit]').fill('50');
    await m.getByRole('button',{name:'Opslaan'}).click();
    await attempt('C-11','Factuur zonder klant wordt niet opgeslagen',async()=>(await appState(page,()=>state.invoices.length))===0&&await page.locator('#invoiceCustomer').evaluate(el=>!el.checkValidity()));
    await m.locator('#invoiceCustomer').selectOption('c1');
    await row.locator('[data-k=desc]').fill('');
    await m.getByRole('button',{name:'Opslaan'}).click();
    await attempt('C-12','Factuurregel zonder omschrijving wordt niet opgeslagen',async()=>(await appState(page,()=>state.invoices.length))===0);
    await row.locator('[data-k=desc]').fill('Halverwege');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>newInvoice());
    const kept=await m.locator('#invoiceLines .line-item').nth(0).locator('[data-k=desc]').inputValue().catch(()=>'');
    const asked=await page.locator('text=/weggooien|niet opgeslagen|Wijzigingen/i').count();
    check('C-13','Escape halverwege een factuur: invoer blijft bewaard of er komt een waarschuwing',kept==='Halverwege'||asked>0,'ingevulde factuur is zonder vraag weg');
    await page.evaluate(()=>closeModal());
    await page.evaluate(()=>navigate('bestaat-niet'));
    await attempt('C-14','Onbekende pagina valt terug op het overzicht',async()=>/Overzicht/.test(await content(page)));
    await page.evaluate(()=>navigate('invoices'));await page.evaluate(()=>navigate('expenses'));
    const backTo=await page.goBack({timeout:5000}).then(()=>page.url()).catch(()=>page.url());
    check('C-15','Terugknop van de browser blijft in de app',backTo.startsWith(base+'/app'),'terugknop verlaat de app: '+backTo);
    await context.close();
  }

  area('Creditfactuur (factuur aanpassen)');
  bootExtra="state.invoices=[{id:'i1',number:'"+new Date().getFullYear()+"-0001',numberManaged:true,numberFinalized:true,customerId:'c1',status:'sent',kind:'invoice',issueDate:addDateOnlyDays(today(),-30),supplyDate:addDateOnlyDays(today(),-30),dueDate:addDateOnlyDays(today(),-16),paymentDays:14,taxTreatment:'standard',paymentReference:'"+new Date().getFullYear()+"-0001',lines:[{desc:'Taart',qty:1,unit:22.5,unitLabel:'stuk',vat:21},{desc:'Brood',qty:3,unit:4.15,unitLabel:'stuk',vat:9}],payments:[]}];state.meta.nextInvoice=2;";
  {
    const {context,page}=await open('company');
    const m=page.locator('#modalRoot');
    await page.evaluate(()=>{navigate('invoices');invoiceActions('i1')});
    await m.getByRole('button',{name:/Factuur aanpassen/}).click();
    await m.getByRole('button',{name:'Doorgaan'}).click();
    await page.waitForTimeout(400);
    if(await m.locator('#invoiceLines').count())await m.getByRole('button',{name:'Annuleren'}).click().catch(()=>page.evaluate(()=>closeModal()));
    const creditId=await appState(page,()=>state.invoices.find(i=>i.kind==='credit')?.id);
    await page.evaluate(id=>invoiceActions(id),creditId);
    await m.getByRole('button',{name:'Verder bewerken'}).click();
    await m.locator('[name=status]').selectOption('sent');
    await m.getByRole('button',{name:'Opslaan'}).click();
    await m.getByRole('button',{name:'Toch opslaan'}).click({timeout:3000}).catch(()=>{});
    await page.waitForTimeout(400);
    const inv=await appState(page,()=>state.invoices.map(i=>({id:i.id,kind:i.kind,number:i.number,status:i.status,gross:Math.round(invoiceGross(i)*100),out:Math.round(invoiceOutstanding(i)*100),eff:invoiceEffectiveStatus(i)})));
    const credit=inv.find(i=>i.kind==='credit'),orig=inv.find(i=>i.id==='i1');
    check('A-30','Creditfactuur wordt definitief met het volgende nummer en -€ 40,80',credit&&credit.status==='sent'&&credit.number===new Date().getFullYear()+'-0002'&&credit.gross===-4080,JSON.stringify(credit));
    check('A-31','Na volledige creditfactuur staat de oude factuur op nul (niets meer open)',orig&&orig.out===0,JSON.stringify(orig));
    check('A-32','Oude factuur en creditfactuur tellen niet mee als openstaand',inv.filter(i=>i.status!=='draft').every(i=>i.out===0),JSON.stringify(inv));
    await page.evaluate(()=>navigate('dashboard'));
    await attempt('A-33','Overzicht: nog te ontvangen is € 0,00',async()=>/Nog te ontvangen € 0,00/.test(await content(page)));
    await page.evaluate(()=>{navigate('invoices');invoiceActions('i1')});
    await attempt('A-34','Gecrediteerde factuur over de vervaldatum: geen herinnering en niet "Te laat"',async()=>(await m.getByRole('button',{name:/Herinnering/}).count())===0&&!/Te laat/.test(await page.locator('#content tbody tr',{hasText:'Klant Een BV'}).last().innerText()));
    await page.evaluate(()=>closeModal());
    await shot(page,'A34-creditfactuur-lijst');
    await context.close();
  }
  bootExtra='';

  area('Btw, overzicht en rapportages');
  // Mixed rates, a 10% discount, reverse charge, a partial credit note and two receipts, all today.
  bootExtra="const d=today(),mk=(id,n,lines,extra={})=>({id,number:n,numberManaged:true,numberFinalized:true,customerId:'c1',status:'sent',kind:'invoice',issueDate:d,supplyDate:d,dueDate:addDateOnlyDays(d,14),paymentDays:14,taxTreatment:'standard',lines,payments:[],...extra});"
    +"state.contacts.push({id:'c2',type:'customer',name:'Bouw Verlegd BV',email:'bouw@example.test',address:'Bouwweg 1',postal:'1000AA',city:'Amsterdam',vat:'NL001234567B01'});"
    +"state.invoices=[mk('i1','2026-0001',[{desc:'Taart',qty:1,unit:22.5,vat:21},{desc:'Brood',qty:3,unit:4.15,vat:9}]),mk('i2','2026-0002',[{desc:'Advies',qty:2,unit:100,vat:21}],{discountType:'percent',discountValue:10}),mk('i3','2026-0003',[{desc:'Onderaanneming',qty:1,unit:500,vat:0}],{customerId:'c2',taxTreatment:'reverse'}),mk('i4','2026-0004',[{desc:'Taart',qty:1,unit:22.5,vat:21}],{kind:'credit',creditFor:'i1'})];"
    +"state.expenses=[{id:'e1',vendor:'Groothandel',date:d,category:'Inkoop',exVat:100,vatAmount:21,gross:121,vatRate:21,taxTreatment:'standard'},{id:'e2',vendor:'Meel BV',date:d,category:'Inkoop',exVat:50,vatAmount:4.5,gross:54.5,vatRate:9,taxTreatment:'standard'}];state.meta.nextInvoice=5;";
  {
    const n1=lineCents(1,'22.50'),n2=lineCents(3,'4.15'),n3=lineCents(2,'100')*90/100,n4=lineCents(1,'500'),c1=-lineCents(1,'22.50');
    const v1=vatCents(n1,21),v2=vatCents(n2,9),v3=vatCents(n3,21),vc=-vatCents(-c1,21);
    const omzet=n1+n2+n3+n4+c1,hoog=n1+n3+c1,hoogBtw=v1+v3+vc,voorbelasting=2100+450,teBetalen=hoogBtw+v2-voorbelasting;
    const open1=n1+n2+v1+v2+c1+vc,receivable=open1+(n3+v3)+n4;
    const {context,page}=await open('company');
    await page.evaluate(()=>navigate('vat'));
    const vat=await content(page);
    await shot(page,'A50-btw');
    check('A-50','Btw-rubriek 1a: omzet '+eur(hoog)+', btw '+eur(hoogBtw),vat.includes('1a Omzet hoog tarief (21%) '+eur(hoog)+' '+eur(hoogBtw)),vat.match(/1a[^%]*%\)[^1]*/)?.[0]);
    check('A-51','Btw-rubriek 1b: omzet '+eur(n2)+', btw '+eur(v2),vat.includes('1b Omzet laag tarief (9%) '+eur(n2)+' '+eur(v2)),vat.match(/1b[^%]*%\)[^1]*/)?.[0]);
    check('A-52','Btw-rubriek 1e: verlegd '+eur(n4),vat.includes('1e Omzet 0% of btw verlegd '+eur(n4)),vat.match(/1e[^3]*/)?.[0]);
    check('A-53','Btw-rubriek 5b voorbelasting '+eur(voorbelasting)+' en te betalen '+eur(teBetalen),vat.includes('5b Voorbelasting (btw op je kosten) '+eur(voorbelasting))&&vat.includes('Te betalen '+eur(teBetalen)),vat.match(/5b.{0,80}/)?.[0]);
    await page.evaluate(()=>navigate('dashboard'));
    const dash=await content(page);
    check('A-54','Overzicht: omzet '+eur(omzet)+', kosten € 150,00, winst '+eur(omzet-15000),dash.includes('Omzet '+eur(omzet))&&dash.includes('Kosten € 150,00')&&dash.includes('Winst '+eur(omzet-15000)),dash.slice(0,300));
    check('A-55','Overzicht: nog te ontvangen '+eur(receivable)+' (deels gecrediteerde factuur verrekend)',dash.includes('Nog te ontvangen '+eur(receivable)),dash.match(/Nog te ontvangen € ?[\d.,-]+/)?.[0]);
    check('A-56','Overzicht: btw apartzetten gelijk aan btw-pagina',dash.includes('Btw apartzetten '+eur(teBetalen)),dash.match(/Btw apartzetten € ?[\d.,-]+/)?.[0]);
    await page.evaluate(()=>navigate('reports'));
    const rep=await content(page);
    check('A-57','Rapportage: winst en verlies sluit aan op het overzicht',rep.includes('Creditfacturen − '+eur(-c1))&&rep.includes('Winst '+eur(omzet-15000))&&rep.includes('Kosten − € 150,00'),rep.match(/Winst & verlies.{0,200}/)?.[0]);
    await page.evaluate(()=>navigate('invoices'));
    const list=await content(page);
    check('A-58','Facturenlijst: deels gecrediteerde factuur staat nog open voor het restant',list.includes('Openstaand '+eur(receivable)),list.match(/Openstaand € ?[\d.,-]+/)?.[0]);
    await context.close();
  }
  bootExtra='';

  // ================= User B: experienced, lots of data =================
  area('Gebruiker B: veel gegevens');
  bootExtra="state.contacts=Array.from({length:150},(_,k)=>({id:'c'+k,type:k%5?'customer':'supplier',name:'Relatie '+String(k).padStart(3,'0')+' BV',email:'r'+k+'@example.test',address:'Weg '+k,postal:'1000AA',city:k%2?'Utrecht':'Rotterdam'}));"
    +"state.invoices=Array.from({length:600},(_,k)=>({id:'v'+k,number:'2026-'+String(k+1).padStart(4,'0'),numberManaged:true,numberFinalized:k%10!==0,customerId:'c'+(k%150),status:k%10===0?'draft':'sent',kind:'invoice',issueDate:'2026-0'+(1+k%9)+'-15',supplyDate:'2026-0'+(1+k%9)+'-15',dueDate:'2026-0'+(1+k%9)+'-29',taxTreatment:'standard',lines:[{desc:'Werk '+k,qty:1+k%3,unit:10+k,vat:k%4?21:9}],payments:k%3===0&&k%10?[{id:'p'+k,amount:(1+k%3)*(10+k)*(k%4?1.21:1.09),date:'2026-09-30'}]:[]}));"
    +"state.expenses=Array.from({length:900},(_,k)=>({id:'x'+k,vendor:'Leverancier '+(k%40),date:'2026-0'+(1+k%9)+'-10',category:'Inkoop',exVat:10+k%50,vatAmount:Math.round((10+k%50)*21)/100,gross:Math.round((10+k%50)*121)/100,vatRate:21,taxTreatment:'standard'}));state.meta.nextInvoice=601;";
  {
    const {context,page}=await open('company');
    page.on('dialog',d=>d.accept());
    const timings={};
    for(const p of ['dashboard','invoices','expenses','contacts','vat','reports']){
      timings[p]=await page.evaluate(async p=>{const t=performance.now();navigate(p);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return Math.round(performance.now()-t)},p);
    }
    check('B-20','Pagina\'s met 600 facturen, 900 kosten en 150 relaties openen binnen 1 seconde',Object.values(timings).every(t=>t<1000),JSON.stringify(timings));
    console.log('B-20 timings (ms):',JSON.stringify(timings));
    await page.evaluate(()=>navigate('invoices'));
    const search=page.locator('#content [data-list-search]');
    await search.fill('2026-0457');await page.waitForTimeout(400);
    const found=async()=>(await page.locator('#content tbody tr').allInnerTexts()).filter(r=>r.includes('2026-0457')&&!/Geen facturen gevonden/.test(r)).length;
    check('B-21','Zoeken op een oud factuurnummer vindt de factuur ook als de periode op "Deze maand" staat',await found()===1,'"Geen facturen gevonden" zolang de periode op deze maand staat; de melding noemt de periode niet');
    if(await page.locator('#content select.financial-period-select').count())await page.locator('#content select.financial-period-select').selectOption('all');else await page.locator('#content .period-seg-btn',{hasText:/^Alles$/}).first().click();await page.waitForTimeout(400);
    await attempt('B-22','Met periode "Alles" vindt zoeken precies die factuur',async()=>{const rows=await page.locator('#content tbody tr').allInnerTexts();return rows.length===1&&rows[0].includes('2026-0457')&&rows[0].includes('Relatie 006 BV')});
    await search.fill('');await page.waitForTimeout(300);
    const drafts=await appState(page,()=>state.invoices.filter(i=>i.status==='draft').length);
    const draftId=await appState(page,()=>state.invoices.find(i=>i.status==='draft').id);
    await page.evaluate(id=>deleteInvoice(id),draftId);
    await page.waitForTimeout(300);
    await attempt('B-23','Concept verwijderen (met ongedaan maken) haalt alleen dat concept weg',async()=>(await appState(page,()=>[state.invoices.length,state.invoices.filter(i=>i.status==='draft').length])).join()===[599,drafts-1].join());
    const finalId=await appState(page,()=>state.invoices.find(i=>i.status==='sent').id);
    await page.evaluate(id=>deleteInvoice(id),finalId);
    await page.waitForTimeout(300);
    await attempt('B-24','Definitieve factuur kan niet zomaar verwijderd worden',async()=>(await appState(page,id=>state.invoices.some(i=>i.id===id),finalId)));
    await shot(page,'B24-veel-facturen');
    await context.close();
  }
  bootExtra='';

  // ================= Phone =================
  area('Mobiel (390 px)');
  {
    const {context,page}=await open('company',{width:390,height:844,mobile:true});
    const m=page.locator('#modalRoot');
    await attempt('M-01','Onderbalk met hoofdmenu is zichtbaar',async()=>await page.locator('#mobileBottomNav').isVisible());
    await page.locator('#quickNew').click();
    await m.locator('.quick-action',{hasText:'Factuur'}).click();
    await m.getByRole('button',{name:'Klant Een BV'}).click();
    await m.getByRole('button',{name:'Volgende'}).click();
    const row=m.locator('#invoiceLines .line-item').nth(0);
    await row.locator('[data-k=desc]').fill('Taart');await row.locator('[data-k=unit]').fill('22.50');
    await attempt('M-02','Stap 2 toont het juiste totaal (€ 27,23)',async()=>plain(await m.innerText()).includes('Totaal te betalen € 27,23'));
    await m.getByRole('button',{name:'Volgende'}).click();
    await shot(page,'M03-mobiel-stap3');
    const save=m.getByRole('button',{name:'Bewaar als concept'});
    await save.click();
    await page.waitForTimeout(400);
    await attempt('M-03','Factuur maken in 3 stappen op de telefoon',async()=>(await appState(page,()=>state.invoices.map(i=>Math.round(invoiceGross(i)*100)))).join()==='2723');
    await page.evaluate(()=>closeModal&&closeModal());
    await attempt('M-04','Geen horizontaal scrollen op 390 px',async()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await context.close();
  }

  // ================= Widths =================
  area('Schermbreedtes');
  bootExtra="const d=today();state.invoices=[{id:'i1',number:'2026-0001',numberManaged:true,numberFinalized:true,customerId:'c1',status:'sent',kind:'invoice',issueDate:d,supplyDate:d,dueDate:addDateOnlyDays(d,14),taxTreatment:'standard',lines:[{desc:'Een hele lange omschrijving van het werk dat is gedaan voor deze klant',qty:1,unit:1234567.89,vat:21}],payments:[]}];state.expenses=[{id:'e1',vendor:'Leverancier met een lange naam B.V.',date:d,category:'Inkoop',exVat:100,vatAmount:21,gross:121,vatRate:21,taxTreatment:'standard'}];";
  {
    const widths=[320,375,390,430,768,1024,1440],pages=['dashboard','invoices','expenses','bank','vat','reports','documents','contacts','services','settings'];
    const {context,page}=await open('company');
    const overflow=[];
    for(const width of widths){
      await page.setViewportSize({width,height:width<768?844:900});
      for(const p of pages){
        await page.evaluate(p=>navigate(p),p);
        const w=await page.evaluate(()=>document.documentElement.scrollWidth);
        if(w>width+1)overflow.push(p+'@'+width+'='+w);
        if(['dashboard','invoices'].includes(p))await shot(page,'R-'+p+'-'+width);
      }
      await page.evaluate(()=>{navigate('invoices');newInvoice()});
      const box=await page.locator('#modalRoot .modal').boundingBox().catch(()=>null);
      if(!box||box.x<0||box.x+box.width>width+1)overflow.push('factuurformulier@'+width);
      await page.evaluate(()=>closeModal());
    }
    check('R-01','Geen horizontaal scrollen op 7 breedtes x 10 pagina\'s en het factuurformulier',overflow.length===0,overflow.join(', '));
    await context.close();
  }
  bootExtra='';

  // ================= Accessibility =================
  area('Toegankelijkheid (WCAG 2.2 AA, axe)');
  {
    const axeSource=fs.readFileSync(path.join(root,'tests','node_modules','axe-core','axe.min.js'),'utf8');
    const run=async(page,selector)=>page.evaluate(async sel=>{const r=await axe.run({include:[sel]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return r.violations.map(v=>v.impact+':'+v.id+'('+v.nodes.length+')')},selector);
    for(const [label,width] of [['desktop',1440],['mobiel',390]]){
      const {context,page}=await open('company',{width,height:width<768?844:900,mobile:width<768});
      await page.addScriptTag({content:axeSource});
      const found={};
      for(const p of ['dashboard','invoices','expenses','bank','vat','reports','documents','contacts','settings']){
        await page.evaluate(p=>navigate(p),p);
        const v=await run(page,'body');if(v.length)found[p]=v;
      }
      for(const [name,call] of [['nieuwe factuur','newInvoice()'],['nieuwe kosten','newExpense()'],['nieuwe relatie','newContact()']]){
        await page.evaluate(c=>eval(c),call);await page.waitForTimeout(350);
        const v=await run(page,'#modalRoot');if(v.length)found[name]=v;
        await page.evaluate(()=>closeModal());
      }
      if(Object.keys(found).length)console.log('axe '+label+' (alle meldingen):',JSON.stringify(found));
      const serious=Object.entries(found).flatMap(([k,v])=>v.filter(x=>/^(critical|serious)/.test(x)).map(x=>k+' '+x));
      check('W-0'+(width<768?2:1),'Geen ernstige axe-fouten '+label+' (9 pagina\'s, 3 formulieren)',serious.length===0,serious.join('; ')||JSON.stringify(found));
      if(width===1440){
        await page.evaluate(()=>navigate('invoices'));
        const opener=page.getByRole('button',{name:/factuur maken/i}).first();
        await opener.focus();await page.keyboard.press('Enter');await page.waitForTimeout(350);
        const inside=await page.evaluate(()=>!!document.getElementById('modalRoot')?.contains(document.activeElement));
        let escaped=false;for(let k=0;k<40;k++){await page.keyboard.press('Tab');if(!(await page.evaluate(()=>!!document.getElementById('modalRoot')?.contains(document.activeElement)))){escaped=true;break}}
        check('W-03','Formulier krijgt focus en Tab blijft binnen het venster',inside&&!escaped,'focus in venster: '+inside+', Tab ontsnapt: '+escaped);
        await page.keyboard.press('Escape');await page.waitForTimeout(250);
        await attempt('W-04','Na sluiten keert de focus terug naar de knop',async()=>page.evaluate(()=>/factuur maken/i.test(document.activeElement?.innerText||'')));
      }
      await context.close();
    }
    const {context,page}=await open('auth');
    await page.addScriptTag({content:axeSource});
    const v=await run(page,'body');
    check('W-05','Inlogscherm zonder ernstige axe-fouten',!v.some(x=>/^(critical|serious)/.test(x)),v.join('; '));
    await context.close();
  }
}finally{
  await browser.close();server.close();
}

const summary={engine:engineName,total:results.length,pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length,blocked:results.filter(r=>r.status==='BLOCKED').length,pageErrors,consoleErrors:[...new Set(consoleErrors)],externalCalls:[...new Set(externalCalls)]};
if(process.env.RELEASE_AUDIT_JSON)fs.writeFileSync(process.env.RELEASE_AUDIT_JSON,JSON.stringify({summary,results},null,1));
console.log(JSON.stringify(summary));
if(summary.fail||pageErrors.length){process.exitCode=1}
else console.log('release audit browser: PASS ('+engineName+', '+summary.pass+' checks)');
