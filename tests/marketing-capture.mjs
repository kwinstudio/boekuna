import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const source=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
const financialCorrectionSource=fs.readFileSync(path.join(root,'public','assets','financial-correction.js'),'utf8');
const CAPTURE_ORIGIN=process.env.BOOKUNA_MARKETING_CAPTURE_ORIGIN||'https://boekuna-boekhouding.onrender.com';
const CAPTURE_EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const CAPTURE_PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
const SOURCE_COMMIT=process.env.GITHUB_SHA||'local';
const SOURCE_REF=process.env.GITHUB_REF_NAME||'local';
const WORKFLOW_RUN_ID=process.env.GITHUB_RUN_ID||null;
const outDir=path.join(root,'public','assets','product');
const tmpDir=path.join(root,'tests','.marketing-capture-tmp');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(tmpDir,{recursive:true});

function replaceLast(sourceText,needle,replacement){
  const i=sourceText.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return sourceText.slice(0,i)+replacement+sourceText.slice(i+needle.length);
}

const marketingSeed=String.raw`
currentUser=TEST_USER;
sessionStorage.removeItem(LIST_STATE_KEY);
listState=loadListState();
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];

const pad=n=>String(n).padStart(2,'0');
const isoOffset=days=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const year=new Date().getFullYear();
state.company={...state.company,
 name:'Boekuna Demo Administratie B.V.',
 tradeName:'Boekuna Demo',
 contactName:'Demo Beheer',
 email:'administratie@boekuna-demo.example',
 phone:'010 000 00 00',
 website:'https://boekuna-demo.example',
 address:'Demostraat 12',
 postal:'0000 AA',
 city:'Rotterdam',
 country:'Nederland',
 kvk:'DEMO0001',
 vat:'NLDEMO000000B01',
 iban:'NL00DEMO0000000000',
 bic:'DEMONL2A',
 bankAccountName:'Boekuna Demo Administratie B.V.',
 invoicePrefix:year+'-',
 paymentDays:14,
 kor:false
};

state.contacts=[
 {id:'c-noordlicht',type:'customer',name:'Studio Noordlicht Demo B.V.',contactPerson:'Projectteam',email:'finance@noordlicht-demo.example',phone:'010 000 00 11',address:'Demokade 8',postal:'0000 AB',city:'Rotterdam',kvk:'DEMO1001',vat:'NLDEMO100001B01'},
 {id:'c-haven',type:'customer',name:'Atelier Haven Demo',contactPerson:'Administratie',email:'admin@atelier-haven.example',phone:'010 000 00 12',address:'Voorbeeldplein 4',postal:'0000 AC',city:'Delft',kvk:'DEMO1002',vat:'NLDEMO100002B01'},
 {id:'c-maan',type:'customer',name:'Maan & Co Demo',contactPerson:'Financieel team',email:'boekhouding@maan-demo.example',phone:'010 000 00 13',address:'Testlaan 21',postal:'0000 AD',city:'Den Haag',kvk:'DEMO1003',vat:'NLDEMO100003B01'},
 {id:'s-atlas',type:'supplier',name:'Atlas Office Demo B.V.',contactPerson:'Facturatie',email:'facturen@atlas-demo.example',phone:'010 000 00 21',address:'Demo Industriepark 3',postal:'0000 AE',city:'Utrecht',kvk:'DEMO2001',vat:'NLDEMO200001B01'},
 {id:'s-pixel',type:'supplier',name:'PixelCloud Demo',contactPerson:'Billing',email:'billing@pixelcloud-demo.example',phone:'010 000 00 22',address:'Voorbeeldweg 19',postal:'0000 AF',city:'Amsterdam',kvk:'DEMO2002',vat:'NLDEMO200002B01'}
];

state.services=[
 {id:'svc-advies',name:'Strategisch advies',description:'Advies en voorbereiding',unitLabel:'uur',price:125,vat:21,active:true},
 {id:'svc-web',name:'Websitebeheer',description:'Maandelijks beheer en optimalisatie',unitLabel:'maand',price:295,vat:21,active:true},
 {id:'svc-report',name:'Rapportage-inrichting',description:'Inrichting van rapportages en dashboards',unitLabel:'project',price:850,vat:21,active:true},
 {id:'svc-check',name:'Administratiecheck',description:'Periodieke controle',unitLabel:'sessie',price:175,vat:21,active:false}
];

state.invoices=[
 {id:'i-41',number:year+'-0041',numberFinalized:true,kind:'invoice',customerId:'c-noordlicht',issueDate:isoOffset(-34),supplyDate:isoOffset(-34),dueDate:isoOffset(-20),status:'paid',paymentReference:year+'-0041',taxTreatment:'standard',payments:[{id:'p-41',date:isoOffset(-18),amount:1452}],lines:[{desc:'Rapportage-inrichting',qty:1,unitLabel:'project',unit:1200,vat:21}]},
 {id:'i-42',number:year+'-0042',numberFinalized:true,kind:'invoice',customerId:'c-haven',issueDate:isoOffset(-18),supplyDate:isoOffset(-18),dueDate:isoOffset(-4),status:'sent',paymentReference:year+'-0042',taxTreatment:'standard',payments:[],lines:[{desc:'Websitebeheer',qty:2,unitLabel:'maand',unit:295,vat:21}]},
 {id:'i-43',number:year+'-0043',numberFinalized:true,kind:'invoice',customerId:'c-maan',issueDate:isoOffset(-8),supplyDate:isoOffset(-8),dueDate:isoOffset(6),status:'sent',paymentReference:year+'-0043',taxTreatment:'standard',payments:[],lines:[{desc:'Strategisch advies',qty:6,unitLabel:'uur',unit:125,vat:21}]},
 {id:'i-44',number:'CONCEPT-DEMO-0044',numberManaged:true,numberFinalized:false,kind:'invoice',customerId:'c-noordlicht',issueDate:isoOffset(-1),supplyDate:isoOffset(-1),dueDate:isoOffset(13),status:'draft',paymentReference:'CONCEPT-DEMO-0044',taxTreatment:'standard',payments:[],lines:[{desc:'Websitebeheer',qty:1,unitLabel:'maand',unit:295,vat:21}]},
 {id:'i-40',number:year+'-0040',numberFinalized:true,kind:'invoice',customerId:'c-haven',issueDate:isoOffset(-48),supplyDate:isoOffset(-48),dueDate:isoOffset(-34),status:'paid',paymentReference:year+'-0040',taxTreatment:'standard',payments:[{id:'p-40',date:isoOffset(-31),amount:635.25}],lines:[{desc:'Advies en inrichting',qty:4.2,unitLabel:'uur',unit:125,vat:21}]}
];

state.expenses=[
 {id:'e-atlas',vendor:'Atlas Office Demo B.V.',date:isoOffset(-11),category:'Kantoor',paymentMethod:'Bank',exVat:200,vatRate:21,vatAmount:42,gross:242,invoiceNumber:'DEMO-INK-014',notes:'Kantoorbenodigdheden',source:'document-import',documentType:'purchase_invoice'},
 {id:'e-pixel',vendor:'PixelCloud Demo',date:isoOffset(-16),category:'Software',paymentMethod:'Bank',exVat:99,vatRate:21,vatAmount:20.79,gross:119.79,invoiceNumber:'PC-DEMO-882',notes:'Cloudsoftware',source:'document-import',documentType:'purchase_invoice'},
 {id:'e-travel',vendor:'Demo Mobiliteit',date:isoOffset(-6),category:'Reiskosten',paymentMethod:'Zakelijke kaart',exVat:64.22,vatRate:9,vatAmount:5.78,gross:70,invoiceNumber:'RIT-DEMO-21',notes:'Zakelijke ritten',source:'manual'},
 {id:'e-print',vendor:'Printstudio Voorbeeld',date:isoOffset(-27),category:'Marketing',paymentMethod:'Bank',exVat:150,vatRate:21,vatAmount:31.5,gross:181.5,invoiceNumber:'PRINT-DEMO-77',notes:'Presentatiemateriaal',source:'document-import',documentType:'purchase_invoice'}
];

state.transactions=[
 {id:'t-1',date:isoOffset(-1),description:'Studio Noordlicht Demo B.V.',amount:356.95,status:'unmatched'},
 {id:'t-2',date:isoOffset(-7),description:'Maan & Co Demo',amount:907.5,status:'matched',matchType:'invoice',matchId:'i-43'},
 {id:'t-3',date:isoOffset(-11),description:'Atlas Office Demo B.V.',amount:-242,status:'matched',matchType:'expense',matchId:'e-atlas'},
 {id:'t-4',date:isoOffset(-16),description:'PixelCloud Demo',amount:-119.79,status:'matched',matchType:'expense',matchId:'e-pixel'}
];

state.documents=[
 {id:'d-atlas',fileId:'demo-file-atlas',name:'demo-factuur-atlas-office.pdf',type:'Inkoopfactuur',date:isoOffset(-11),linkedType:'expense',linkedId:'e-atlas',source:'document-import',analyzed:true,verification:{status:'verified',method:'deterministic'}},
 {id:'d-pixel',fileId:'demo-file-pixel',name:'demo-factuur-pixelcloud.pdf',type:'Inkoopfactuur',date:isoOffset(-16),linkedType:'expense',linkedId:'e-pixel',source:'document-import',analyzed:true,verification:{status:'needs_review',differences:[{field:'gross',label:'Totaal incl. btw',current:119.79,alternative:119.8}]}},
 {id:'d-print',fileId:'demo-file-print',name:'demo-marketing-print.pdf',type:'Inkoopfactuur',date:isoOffset(-27),linkedType:'expense',linkedId:'e-print',source:'document-import',analyzed:true,verification:{status:'verified'}},
 {id:'d-note',fileId:'demo-file-note',name:'demo-projectnotitie.pdf',type:'Upload',date:isoOffset(-2),source:'archive',analyzed:false}
];

state.hours=[{id:'h1',date:isoOffset(-2),hours:4,project:'Noordlicht demo',desc:'Advies'}];
state.mileage=[{id:'m1',date:isoOffset(-3),km:32,from:'Rotterdam',to:'Delft',purpose:'Demo klantbezoek'}];
state.meta.nextInvoice=45;
enterApp();
`;

let appHtml=source.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
if(CAPTURE_EMAIL&&CAPTURE_PASSWORD){
  // Processor-backed marketing captures must prove the production processor result itself.
  // Disable only the capture copy's redundant browser PDF.js inspection so CDN/parser
  // availability cannot block the real processor response from reaching the real review UI.
  const parallelPdfInspection="const browserStructurePromise=ext==='pdf'&&file.size<9*1024*1024?readPdfStructure(file).catch(err=>{console.warn('Parallel PDF inspection',err);return null}):null;";
  assert.ok(appHtml.includes(parallelPdfInspection),'Capture source must contain the parallel PDF inspection hook');
  appHtml=appHtml.replace(parallelPdfInspection,'const browserStructurePromise=null;');
}
appHtml=replaceLast(appHtml,'initAuth();',marketingSeed);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')||pathname==='/favicon.ico'){
    const file=path.join(root,'public',pathname.replace(/^\//,''));
    if(file.startsWith(path.join(root,'public'))&&fs.existsSync(file)){
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
  }
  if(pathname==='/manifest.webmanifest'){
    res.writeHead(200,{'content-type':'application/manifest+json','cache-control':'no-store'});
    return res.end('{}');
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});

async function makeDemoPdf(){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595.28,841.89]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(0.10,0.16,0.20), muted=rgb(0.36,0.43,0.46);
  page.drawText('ATLAS OFFICE DEMO B.V.',{x:54,y:780,size:18,font:bold,color:ink});
  page.drawText('DEMO-INKOOPFACTUUR',{x:54,y:742,size:25,font:bold,color:ink});
  page.drawText('Dit document bevat uitsluitend fictieve marketingdata.',{x:54,y:716,size:9,font,color:muted});
  const rows=[
    ['Factuurnummer','DEMO-INK-2026-014'],
    ['Factuurdatum','25-09-2026'],
    ['Vervaldatum','09-10-2026'],
    ['Leverancier','Atlas Office Demo B.V.'],
    ['Adres','Demo Industriepark 3, 0000 AE Utrecht'],
    ['KVK','DEMO2001'],
    ['Btw-id','NLDEMO200001B01']
  ];
  let y=670;
  for(const [k,v] of rows){
    page.drawText(k,{x:54,y,size:10,font:bold,color:muted});
    page.drawText(v,{x:190,y,size:10,font,color:ink});
    y-=23;
  }
  page.drawLine({start:{x:54,y:485},end:{x:541,y:485},thickness:1,color:rgb(.84,.88,.90)});
  page.drawText('Omschrijving',{x:54,y:462,size:10,font:bold,color:muted});
  page.drawText('Bedrag',{x:468,y:462,size:10,font:bold,color:muted});
  page.drawText('Kantoorbenodigdheden en archiefmateriaal',{x:54,y:433,size:11,font,color:ink});
  page.drawText('EUR 200,00',{x:465,y:433,size:11,font,color:ink});
  page.drawLine({start:{x:54,y:410},end:{x:541,y:410},thickness:1,color:rgb(.84,.88,.90)});
  const totals=[['Subtotaal excl. btw','EUR 200,00'],['Btw 21%','EUR 42,00'],['Totaal incl. btw','EUR 242,00']];
  y=365;
  for(const [k,v] of totals){
    page.drawText(k,{x:316,y,size:k.startsWith('Totaal')?12:10,font:k.startsWith('Totaal')?bold:font,color:ink});
    page.drawText(v,{x:464,y,size:k.startsWith('Totaal')?12:10,font:k.startsWith('Totaal')?bold:font,color:ink});
    y-=27;
  }
  page.drawText('Betalingskenmerk DEMO-INK-2026-014',{x:54,y:240,size:10,font,color:muted});
  page.drawText('IBAN NL00DEMO0000000000 (fictief)',{x:54,y:218,size:10,font,color:muted});
  const bytes=await pdf.save();
  const file=path.join(tmpDir,'demo-inkoopfactuur-atlas-office.pdf');
  fs.writeFileSync(file,bytes);
  return file;
}

async function saveWebp(page,name,{quality=84,resizeWidth=null,clip=null}={}){
  const shotOptions={type:'png',fullPage:false};if(clip)shotOptions.clip=clip;
  const png=await page.screenshot(shotOptions);
  let img=sharp(png);
  if(resizeWidth)img=img.resize({width:resizeWidth,withoutEnlargement:true});
  const target=path.join(outDir,name);
  await img.webp({quality,smartSubsample:true}).toFile(target);
  const meta=await sharp(target).metadata();
  assert.ok((meta.width||0)>0&&(meta.height||0)>0,name+' must be a valid WebP');
  return {name,width:meta.width,height:meta.height,size:fs.statSync(target).size};
}

async function saveDerivedCrop(masterName,name,extract,resizeWidth,{quality=86}={}){
  const sourcePath=path.join(outDir,masterName);
  const target=path.join(outDir,name);
  let img=sharp(sourcePath).extract(extract);
  if(resizeWidth)img=img.resize({width:resizeWidth,withoutEnlargement:true});
  await img.webp({quality,smartSubsample:true}).toFile(target);
  const meta=await sharp(target).metadata();
  assert.ok((meta.width||0)>0&&(meta.height||0)>0,name+' must be a valid derived WebP');
  return {name,width:meta.width,height:meta.height,size:fs.statSync(target).size,derivedFrom:masterName,extract};
}

async function marketingCaptureAccessToken(){
  if(!CAPTURE_EMAIL||!CAPTURE_PASSWORD)return '';
  const url=(source.match(/const SUPABASE_URL='([^']+)'/)||[])[1];
  const key=(source.match(/const SUPABASE_PUBLISHABLE_KEY='([^']+)'/)||[])[1];
  assert.ok(url&&key,'Supabase public auth configuration must exist in the current frontend source');
  const response=await fetch(url+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email:CAPTURE_EMAIL,password:CAPTURE_PASSWORD})
  });
  const json=await response.json().catch(()=>({}));
  assert.ok(response.ok&&json.access_token,'Dedicated marketing capture account could not authenticate');
  return json.access_token;
}

function assertSafeVisibleText(text,label){
  const forbidden=[
    /@(gmail|hotmail|outlook|icloud|yahoo)\./i,
    /sk-[A-Za-z0-9_-]{12,}/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /service[_-]?role/i,
    /SUPABASE_SERVICE/i
  ];
  for(const pattern of forbidden)assert.ok(!pattern.test(text),label+' contains forbidden/private-looking data: '+pattern);
}

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base='http://127.0.0.1:'+port;
const pdfPath=await makeDemoPdf();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,reducedMotion:'reduce'});
const useTrustedCaptureOrigin=!!(CAPTURE_EMAIL&&CAPTURE_PASSWORD);
const captureBase=useTrustedCaptureOrigin?CAPTURE_ORIGIN:base;
if(useTrustedCaptureOrigin){
  // Serve the unchanged Boekuna capture copy at the real trusted app origin inside
  // Playwright so the browser's own CORS origin matches production exactly.
  await context.route(CAPTURE_ORIGIN+'/app',async route=>route.fulfill({
    status:200,
    contentType:'text/html; charset=utf-8',
    body:appHtml,
    headers:{'cache-control':'no-store'}
  }));
}
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>{const msg=String(e);pageErrors.push(msg);console.error('[capture-pageerror]',msg)});
page.on('requestfailed',req=>console.error('[capture-requestfailed]',req.method(),req.url(),req.failure()?.errorText||''));
page.on('console',msg=>{if(msg.type()==='error')console.error('[capture-console]',msg.text())});
await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear()});

const assets=[];
async function openAppPage(name){
  await page.evaluate(name=>navigate(name),name);
  await page.waitForTimeout(180);
  assertSafeVisibleText(await page.locator('body').innerText(),name);
}

try{
  await page.goto(captureBase+'/app',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  await page.locator('.sidebar img.bookuna-logo-icon').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('img.bookuna-logo-icon')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:10000});
  assert.equal(await page.locator('.sidebar img.bookuna-logo-icon').evaluate(img=>img.naturalWidth>0),true,'Brand logo assets must be loaded before marketing capture');
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} .toast-wrap{display:none!important}'});

  assets.push(await saveWebp(page,'boekuna-dashboard-desktop.webp'));
  assets.push(await saveWebp(page,'boekuna-dashboard-desktop-960.webp',{resizeWidth:960}));

  await openAppPage('invoices');
  assets.push(await saveWebp(page,'boekuna-invoices-desktop.webp'));
  assets.push(await saveWebp(page,'boekuna-invoices-desktop-960.webp',{resizeWidth:960}));

  await openAppPage('documents');
  assets.push(await saveWebp(page,'boekuna-documents-desktop.webp'));
  assets.push(await saveWebp(page,'boekuna-documents-desktop-960.webp',{resizeWidth:960}));

  await openAppPage('vat');
  assets.push(await saveWebp(page,'boekuna-vat-desktop.webp'));
  assets.push(await saveWebp(page,'boekuna-vat-desktop-960.webp',{resizeWidth:960}));

  await openAppPage('contacts');
  assets.push(await saveWebp(page,'boekuna-contacts-desktop.webp'));

  await openAppPage('services');
  assets.push(await saveWebp(page,'boekuna-services-desktop.webp'));

  await openAppPage('profile');
  assets.push(await saveWebp(page,'boekuna-company-settings-desktop.webp'));

  await openAppPage('reports');
  assets.push(await saveWebp(page,'boekuna-reports-desktop.webp'));
  assets.push(await saveWebp(page,'boekuna-reports-desktop-960.webp',{resizeWidth:960}));

  // The normal marketing captures do not depend on processor credentials.
  // The review captures run only with the dedicated fictive QA/demo account.
  let processorResponse=null,parsed=null,processorStatus='blocked-no-dedicated-account';
  const accessToken=await marketingCaptureAccessToken();
  if(accessToken){
    await context.route('https://kwinest-docprocessor.onrender.com/**',async route=>{
      const req=route.request();
      const headers={...req.headers()};
      if(req.method()!=='OPTIONS')headers.authorization='Bearer '+accessToken;
      await route.continue({headers});
    });
    await openAppPage('documents');
    await page.evaluate(()=>{pendingUploadKind='purchase'});
    const processorResponsePromise=page.waitForResponse(res=>res.url().includes('kwinest-docprocessor.onrender.com/analyze')&&res.request().method()==='POST',{timeout:150000});
    await page.locator('#docFile').setInputFiles(pdfPath);
    const liveProcessorResponse=await processorResponsePromise;
    processorResponse={status:liveProcessorResponse.status(),ok:liveProcessorResponse.ok(),url:liveProcessorResponse.url()};
    assert.ok(processorResponse.ok,'Real document processor did not return a successful response: '+JSON.stringify(processorResponse));
    try{
      await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    }catch(err){
      const diag=await page.evaluate(()=>({
        modalTitle:document.querySelector('.modal h2,.modal h3')?.textContent?.trim()||'',
        modalText:document.querySelector('.modal')?.innerText?.slice(0,1800)||'',
        progressTitle:document.querySelector('#importProgressTitle')?.textContent?.trim()||'',
        progressMessage:document.querySelector('#importProgressMessage')?.textContent?.trim()||'',
        pending:!!pendingPdfImport,
        pendingSourceQuality:pendingPdfImport?.parsed?.sourceQuality||'',
        pendingHasProcessor:!!pendingPdfImport?.parsed?.processor
      }));
      console.error('[capture-review-diagnostic]',JSON.stringify(diag));
      throw err;
    }
    parsed=await page.evaluate(()=>({
      sourceQuality:pendingPdfImport?.parsed?.sourceQuality||'',
      processor:pendingPdfImport?.parsed?.processor||null,
      party:pendingPdfImport?.parsed?.party||'',
      invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber||'',
      gross:pendingPdfImport?.parsed?.gross??null
    }));
    assert.ok(parsed.processor,'Document review must contain processor metadata');
    assert.ok(parsed.party&&parsed.invoiceNumber,'Processor result must contain recognizable demo invoice fields');
    processorStatus='real-processor-confirmed';

    await page.evaluate(()=>setDocumentReviewStep(2));
    await page.waitForTimeout(120);
    assertSafeVisibleText(await page.locator('.modal').innerText(),'document-review-desktop');
    assets.push(await saveWebp(page,'boekuna-document-review-desktop.webp'));
    assets.push(await saveWebp(page,'boekuna-document-review-desktop-960.webp',{resizeWidth:960}));

    await page.evaluate(()=>setDocumentReviewStep(1));
    assets.push(await saveWebp(page,'boekuna-document-review-step-document-desktop.webp'));
    for(const [step,name] of [[2,'amounts'],[3,'relation'],[4,'save']]){
      await page.evaluate(step=>setDocumentReviewStep(step),step);
      await page.locator('[data-review-step="'+step+'"]').evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.waitForTimeout(100);
      assets.push(await saveWebp(page,'boekuna-document-review-step-'+name+'-desktop.webp'));
    }

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>setDocumentReviewStep(1));
    await page.waitForTimeout(120);
    assets.push(await saveWebp(page,'boekuna-document-review-mobile.webp',{quality:86}));
    await page.evaluate(()=>setDocumentReviewStep(2));
    await page.waitForTimeout(120);
    assets.push(await saveWebp(page,'boekuna-document-review-amounts-mobile.webp',{quality:86}));
    await page.evaluate(()=>{cleanupPendingImport();closeModal()});
  }

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>navigate('dashboard'));
  await page.waitForTimeout(180);
  assertSafeVisibleText(await page.locator('body').innerText(),'dashboard-mobile');
  assets.push(await saveWebp(page,'boekuna-dashboard-mobile.webp',{quality:86}));

  await page.evaluate(()=>navigate('invoices'));
  await page.waitForTimeout(180);
  assertSafeVisibleText(await page.locator('body').innerText(),'invoices-mobile');
  assets.push(await saveWebp(page,'boekuna-invoices-mobile.webp',{quality:86}));

  await page.evaluate(()=>navigate('documents'));
  await page.waitForTimeout(180);
  assertSafeVisibleText(await page.locator('body').innerText(),'documents-mobile');
  assets.push(await saveWebp(page,'boekuna-documents-mobile.webp',{quality:86}));

  await page.evaluate(()=>navigate('vat'));
  await page.waitForTimeout(180);
  assertSafeVisibleText(await page.locator('body').innerText(),'vat-mobile');
  assets.push(await saveWebp(page,'boekuna-vat-mobile.webp',{quality:86}));

  // Editorial crops: pixels are only removed from the unchanged real master captures.
  // Coordinates are tied to the stable 1440×960 QA viewport above.
  assets.push(await saveDerivedCrop('boekuna-dashboard-desktop.webp','boekuna-dashboard-overview-crop.webp',{left:170,top:0,width:1270,height:715},1120));
  assets.push(await saveDerivedCrop('boekuna-dashboard-desktop.webp','boekuna-dashboard-action-center-crop.webp',{left:500,top:270,width:880,height:660},650));
  assets.push(await saveDerivedCrop('boekuna-invoices-desktop.webp','boekuna-invoices-list-crop.webp',{left:250,top:70,width:1170,height:720},760));
  assets.push(await saveDerivedCrop('boekuna-documents-desktop.webp','boekuna-documents-upload-crop.webp',{left:250,top:70,width:1170,height:720},760));
  assets.push(await saveDerivedCrop('boekuna-documents-desktop.webp','boekuna-documents-workflow-crop.webp',{left:330,top:235,width:1040,height:650},680));
  assets.push(await saveDerivedCrop('boekuna-vat-desktop.webp','boekuna-vat-summary-crop.webp',{left:250,top:70,width:1170,height:720},760));
  assets.push(await saveDerivedCrop('boekuna-reports-desktop.webp','boekuna-reports-primary-crop.webp',{left:250,top:70,width:1170,height:720},760));
  assets.push(await saveDerivedCrop('boekuna-contacts-desktop.webp','boekuna-contacts-list-crop.webp',{left:250,top:70,width:1170,height:650},760));
  assets.push(await saveDerivedCrop('boekuna-services-desktop.webp','boekuna-services-list-crop.webp',{left:250,top:70,width:1170,height:650},760));
  assets.push(await saveDerivedCrop('boekuna-company-settings-desktop.webp','boekuna-company-settings-group-crop.webp',{left:250,top:70,width:1170,height:820},760));

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));

  const proof={
    generatedAt:new Date().toISOString(),
    source:'kwinest/index.html',
    sourceCommit:SOURCE_COMMIT,
    sourceRef:SOURCE_REF,
    workflowRunId:WORKFLOW_RUN_ID,
    viewportDesktop:'1440x960',
    viewportMobile:'390x844',
    demoDataset:'permanent-fictive-marketing-v1',
    processorStatus,
    processor:processorResponse,
    processorResult:parsed?{sourceQuality:parsed.sourceQuality,party:parsed.party,invoiceNumber:parsed.invoiceNumber,gross:parsed.gross}:null,
    assets
  };
  fs.writeFileSync(path.join(outDir,'capture-proof.json'),JSON.stringify(proof,null,2)+'\n');
  console.log('Marketing screenshot capture PASS');
  console.log(JSON.stringify(proof,null,2));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(tmpDir,{recursive:true,force:true});
}
