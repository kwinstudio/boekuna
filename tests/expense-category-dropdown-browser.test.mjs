// Kosten: "Waarvoor?" is one dropdown instead of a row of chips (Kwin, 12 October 2026).
// The dropdown holds the standard categories plus a custom one from the line being edited,
// saving keeps the chosen category, and "Net als vorige keer bij ..." still folds the btw
// chips and the dropdown into one row on the phone until "Wijzigen" is tapped.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'app build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';

function replaceLast(text,needle,replacement){
  const i=text.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return text.slice(0,i)+replacement+text.slice(i+needle.length);
}
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'kosten-qa@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "state=structuredClone(DEFAULT);",
  "for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Kosten QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'kosten-qa@example.test'};",
  "state.expenses=[{id:'e-custom',date:new Date().toISOString().slice(0,10),vendor:'AV Service Zuid',category:'Onderhoud',paymentMethod:'Bank',exVat:1299,vatRate:21,vatAmount:272.79,gross:1571.79,notes:''}];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;window.confirm=()=>true;",
  "enterApp();"
].join('\n'));

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':mime['.webmanifest']});return fs.createReadStream(path.join(dist,'manifest.webmanifest')).pipe(res)}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const context=await browser.newContext({viewport:{width:390,height:844},locale:'nl-NL',isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
page.setDefaultTimeout(8000);
await page.goto(url+'/',{waitUntil:'domcontentloaded'});
await page.locator('#mainApp').waitFor();

const form=()=>page.locator('#expenseForm');
const category=()=>form().locator('select[name="category"]');
async function closeForm(){await page.evaluate(()=>closeModal());await page.locator('#expenseForm').waitFor({state:'detached'})}

try{
  // 1. New cost line: one dropdown with the standard categories, no chips for the category.
  await page.evaluate(()=>newExpense());
  await form().waitFor();
  assert.equal(await category().count(),1,'the category is one dropdown');
  assert.equal(await form().locator('input[name="category"]').count(),0,'no category chips remain');
  assert.equal(await form().locator('fieldset.choice-group').count(),1,'only the btw question keeps its chips');
  const labels=await category().locator('option').allTextContents();
  assert.deepEqual(labels,['Kantoor','Software & abonnementen','Reizen & vervoer','Reclame','Eten & drinken (zakelijk)','Inkoop','Huur & energie','Overig']);
  assert.equal(await category().inputValue(),'Overig','a new line starts on Overig');
  assert.equal(await category().evaluate(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>=40),true,'the dropdown is visible and tappable on the phone');
  assert.ok((await page.locator('#modalRoot').innerText()).includes('Waarvoor?'),'the question stays');

  // 2. Choosing and saving keeps the category.
  await form().locator('[name=gross]').fill('121.00');
  await form().locator('[name=vendor]').fill('Energie Noord');
  await form().locator('.choice-chip',{hasText:'21%'}).click();
  await category().selectOption('Huisvesting');
  await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
  await page.waitForFunction(()=>state.expenses.some(e=>e.vendor==='Energie Noord'));
  assert.equal(await page.evaluate(()=>state.expenses.find(e=>e.vendor==='Energie Noord').category),'Huisvesting');

  // 3. Same shop again: the memory row folds btw and category away; "Wijzigen" brings the dropdown back.
  await page.evaluate(()=>newExpense());
  await form().waitFor();
  await form().locator('[name=vendor]').fill('Energie Noord');
  await form().locator('[name=vendor]').dispatchEvent('input');
  const memory=form().locator('.expense-memory');
  await memory.waitFor();
  assert.match(await memory.innerText(),/21% btw · Huur & energie/);
  assert.equal(await category().inputValue(),'Huisvesting','the dropdown is filled from memory');
  assert.equal(await category().isVisible(),false,'the dropdown is folded away behind the memory row');
  await memory.getByRole('button',{name:'Wijzigen'}).click();
  await category().waitFor({state:'visible'});
  assert.equal(await memory.count(),0,'the memory row is gone after Wijzigen');
  await category().selectOption('Kantoor');
  await form().locator('[name=gross]').fill('12.10');
  await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
  await page.waitForFunction(()=>state.expenses.filter(e=>e.vendor==='Energie Noord').length===2);
  assert.deepEqual(await page.evaluate(()=>state.expenses.filter(e=>e.vendor==='Energie Noord').map(e=>e.category).sort()),['Huisvesting','Kantoor']);

  // 4. Editing a line with a category outside the list keeps that category selectable.
  await page.evaluate(()=>newExpense('e-custom'));
  await form().waitFor();
  assert.equal(await category().inputValue(),'Onderhoud');
  assert.equal(await category().locator('option').count(),9,'the custom category is added once');
  await closeForm();

  assert.deepEqual(errors,[],'no page errors');
  console.log('expense category dropdown ('+browserName+'): ok');
}finally{
  await browser.close();
  server.close();
}
