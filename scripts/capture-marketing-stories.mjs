// Capture the current built product with fictive, local-only demo data.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from '../tests/node_modules/playwright/index.mjs';
const root=process.cwd(), out=path.join(root,'public/assets/stories');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('dist/app/index.html','utf8');
const capture=fs.readFileSync('tests/marketing-capture.mjs','utf8');
const seed=capture.match(/const marketingSeed=String.raw`([\s\S]*?)`;/)[1];
let html=source.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const i=html.lastIndexOf('initAuth();');
if(i<0)throw new Error('Local capture bootstrap missing');
html=html.slice(0,i)+seed+html.slice(i+'initAuth();'.length);
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/assets/')){
    const p=path.join(root,'dist/app',url.pathname);
    if(!fs.existsSync(p)){res.writeHead(404);res.end();return;}
    const type=p.endsWith('.css')?'text/css':p.endsWith('.js')?'application/javascript':p.endsWith('.woff2')?'font/woff2':p.endsWith('.ttf')?'font/ttf':p.endsWith('.svg')?'image/svg+xml':'image/png';
    res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(p));return;
  }
  res.writeHead(200,{'content-type':'text/html'});res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:860},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**',r=>r.abort());
const files=[];
async function shot(name,locator){
  await page.evaluate(()=>document.fonts.ready);
  await locator.screenshot({path:path.join(out,name)});files.push(name);
  // Pillow exports the captured pixels; no UI recreation or retouching.
  execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=90)',path.join(out,name),path.join(out,name.replace('.png','.webp'))]);
}
try {
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'networkidle'});
  await page.locator('#mainApp').waitFor({state:'visible'});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await shot('overzicht.png',page.locator('#content'));
  await page.evaluate(()=>navigate('invoices'));
  await shot('facturen.png',page.locator('#content'));
  await page.evaluate(()=>navigate('bank'));
  await shot('bank.png',page.locator('#content'));
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>navigate('dashboard'));
  await shot('overzicht-mobiel.png',page.locator('#content'));
  await page.setViewportSize({width:1280,height:860});
  await page.evaluate(()=>navigate('documents'));
  await shot('documenten.png',page.locator('#content'));
  await page.evaluate(()=>navigate('vat'));
  await shot('btw.png',page.locator('#content'));
  await page.evaluate(()=>{
    pendingPdfImport={file:new File(['demo'],'voorbeeldbon.pdf',{type:'application/pdf'}),previewUrl:null,sha256:'marketing-demo',sourceClientRef:'marketing-demo',sourceDocumentId:'',processingJobId:'',parsed:{documentType:'receipt',party:'Papierhuis',invoiceNumber:'B-20418',issueDate:'2026-10-05',dueDate:'',description:'Kantoormaterialen',category:'Kantoorkosten',currency:'EUR',status:'paid',net:40,vatAmount:8.4,gross:48.4,vatRate:21,mixedRates:false,vatLines:[{rate:21,taxableAmount:40,vatAmount:8.4}],lineItems:[],adjustments:[],fieldConfidence:{party:95,issueDate:95,net:98,vatAmount:98,gross:98,vatRate:98,category:85}}};
    showPdfImportReview(pendingPdfImport.parsed);
  });
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
  await page.evaluate(()=>goToReviewWizardStep(2));
  await page.locator('[data-review-page="2"]').waitFor({state:'visible'});
  await page.evaluate(()=>document.activeElement?.blur());
  await shot('bon-controleren.png',page.locator('.document-review-fields'));
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(out,'capture-proof.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,sourceHtmlSha256:crypto.createHash('sha256').update(source).digest('hex'),capture:'Current built product; only local bootstrap and fictive demo data; external requests blocked',files},null,2));
  console.log('Current product story captures: PASS');
} finally {await browser.close();await new Promise(r=>server.close(r));}
