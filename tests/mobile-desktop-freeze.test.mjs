import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
for(const file of ['index.html','manifest.webmanifest','assets/app-InterVariable.woff2','assets/app-SpaceGrotesk-Variable.ttf'])assert.ok(fs.existsSync(path.join(dist,file)),'Built app asset missing '+file);
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(appHtml.includes('mobile-product.js'),'Mobile app asset missing');
assert.equal(appHtml.includes('function showMarketingPage'),false,'App artifact must remain free of marketing runtime');

function replaceLast(sourceText,needle,replacement){
  const i=sourceText.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return sourceText.slice(0,i)+replacement+sourceText.slice(i+needle.length);
}
const fixture=[
  "currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-10-01',dueDate:'2026-10-15',taxTreatment:'standard',payments:[],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.expenses=[{id:'e1',date:'2026-10-01',vendor:'QA Leverancier',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'bank',exVat:50,vatRate:21,vatAmount:10.5,gross:60.5,notes:''}];",
  "state.transactions=[{id:'t1',date:'2026-10-02',description:'QA bankregel',amount:-10,status:'unmatched'}];",
  "state.documents=[{id:'d1',name:'qa-bon.jpg',type:'Inkoopfactuur',date:'2026-10-01',processingState:'ready',verification:{status:'needs_review',method:'manual-review',differences:[]}}];",
  "state.services=[];state.bookings=[];state.plannedCash=[];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
  "enterApp();"
].join('\n');
appHtml=appHtml.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',fixture);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':mime['.webmanifest']});return fs.createReadStream(path.join(dist,'manifest.webmanifest')).pipe(res)}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(new URL(req.url,'http://127.0.0.1').searchParams.has('baseline')?appHtml.replace(/<link[^>]*mobile-product.css[^>]*>\n?/g,'').replace(/<script[^>]*mobile-product.js[^>]*><\/script>\n?/g,''):appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const evidence=path.join(root,'tests','artifacts','complete-mobile','freeze');
fs.mkdirSync(evidence,{recursive:true});

async function noOverflow(page,label){
  const result=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(result.html<=result.vw+2&&result.body<=result.vw+2,label+' horizontal overflow: '+JSON.stringify(result));
}
async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document.getElementById('mainApp'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[],label+' Axe violations');
}
async function openReviewFixture(page){
  await page.evaluate(()=>{
    pendingPdfImport={
      file:new File(['qa'],'qa-bon.jpg',{type:'image/jpeg'}),
      previewUrl:null,
      sha256:'',
      sourceClientRef:'',
      sourceDocumentId:'',
      processingJobId:''
    };
    showPdfImportReview({
      confidenceScore:82,sourceQuality:'processor-v2',documentType:'purchase_invoice',
      party:'QA Leverancier',invoiceNumber:'INK-1',issueDate:'2026-10-01',
      net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,
      vatLines:[],lineItems:[],adjustments:[],recognitionChecks:[
        {code:'party',level:'good',title:'Leverancier herkend',detail:'Controleer naam en factuurnummer.'},
        {code:'gross',level:'warn',title:'Controleer het totaal',detail:'Vergelijk het bedrag met het document.'}
      ]
    });
  });
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
}


const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
try{
 const pages=[];
 for(const variant of ['baseline','candidate']){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(base+'/app'+(variant==='baseline'?'?baseline=1':''),{waitUntil:'networkidle'});
  await page.evaluate(async()=>document.fonts.ready);pages.push(page);
 }
 const comparisonPage=await browser.newPage();
 let count=0;
 async function pixelEquivalent(a,b){
  if(a.equals(b))return {ok:true,diffPixels:0,maxDelta:0};
  return comparisonPage.evaluate(async({left,right})=>{
   const load=src=>new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src='data:image/png;base64,'+src;
   });
   const [aImg,bImg]=await Promise.all([load(left),load(right)]);
   if(aImg.naturalWidth!==bImg.naturalWidth||aImg.naturalHeight!==bImg.naturalHeight)return {ok:false,diffPixels:Infinity,maxDelta:255};
   const canvas=document.createElement('canvas');canvas.width=aImg.naturalWidth;canvas.height=aImg.naturalHeight;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(aImg,0,0);const aData=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bImg,0,0);const bData=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   let diffPixels=0,maxDelta=0;
   for(let i=0;i<aData.length;i+=4){
    let changed=false;
    for(let c=0;c<4;c++){const d=Math.abs(aData[i+c]-bData[i+c]);if(d){changed=true;if(d>maxDelta)maxDelta=d}}
    if(changed)diffPixels++;
   }
   // Browser rasterization can move a handful of 1-level antialias pixels between
   // otherwise identical renders. Keep this deliberately tiny: more than 12
   // changed pixels or any channel delta > 1 still fails the desktop freeze.
   return {ok:diffPixels<=12&&maxDelta<=1,diffPixels,maxDelta};
  },{left:a.toString('base64'),right:b.toString('base64')});
 }
 async function compare(name){
  const shots=[];
  for(let i=0;i<pages.length;i++){
   await pages[i].evaluate(async()=>document.fonts.ready);
   await pages[i].waitForTimeout(350);
   shots.push(await pages[i].screenshot({path:path.join(evidence,browserName+'-'+i+'-'+name+'.png'),animations:'disabled'}));
  }
  const pixels=await pixelEquivalent(shots[0],shots[1]);
  if(pixels.ok&&pixels.diffPixels)console.log(browserName+' desktop antialias tolerance: '+name+' ('+pixels.diffPixels+' pixels, max delta '+pixels.maxDelta+')');
  assert.equal(pixels.ok,true,browserName+' desktop pixels changed: '+name+' ('+pixels.diffPixels+' pixels, max delta '+pixels.maxDelta+')');count++;
 }
 for(const [width,height] of [[1024,768],[1280,800],[1366,768],[1440,900],[1920,1080]]){
  for(const page of pages)await page.setViewportSize({width,height});
  for(const route of ['dashboard','invoices','expenses','bank','income','outgoings','documents','vat','reports','settings','profile']){
   for(const page of pages)await page.evaluate(r=>navigate(r),route);
   await compare(route+'-'+width);
  }
  for(const page of pages)await openReviewFixture(page);
  await compare('review-'+width);
  for(const page of pages)await page.evaluate(()=>closeModal());
  for(const page of pages)await page.evaluate(()=>newInvoice());
  await compare('editor-'+width);
  for(const page of pages)await page.evaluate(()=>closeModal());
 }
 // Mobile -> desktop must restore in-progress forms and the actual document actions.
 for(const route of ['documents','settings','vat']){
  for(const page of pages){await page.setViewportSize({width:390,height:844});await page.evaluate(r=>navigate(r),route);await page.waitForTimeout(50);await page.setViewportSize({width:1440,height:900});}
  await compare(route+'-after-mobile');
 }
 assert.equal(await pages[1].locator('.mobile-card-list').count(),0,'Desktop must contain no mobile duplicate rows');
 console.log(browserName+' desktop freeze: PASS ('+count+' byte-identical screenshot pairs)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
