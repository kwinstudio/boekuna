// Brandfetch logos for suppliers (10 October 2026).
// With a Brandfetch Client ID the existing logo chain loads the image straight from the Brandfetch CDN
// for a domain we trust (relation website/business mail, or an exact match in the verified supplier list).
// Everything else stays on initials: unknown or look-alike names, the own company, same-name relations,
// Brandfetch returning 404 or being unreachable. Logos never change bookkeeping data.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const CLIENT_ID='qa-brandfetch-client-01';
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,BOEKUNA_BRANDFETCH_CLIENT_ID:CLIENT_ID}});
assert.equal(build.status,0,'app build failed: '+(build.stderr||build.stdout));
assert.ok(!String(build.stdout+build.stderr).includes(CLIENT_ID),'the build never prints the Client ID');
const dist=path.join(root,'dist','app');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';

function replaceLast(text,needle,replacement){
  const i=text.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return text.slice(0,i)+replacement+text.slice(i+needle.length);
}
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
assert.ok(appHtml.includes('window.BOEKUNA_BRANDFETCH_CLIENT_ID="'+CLIENT_ID+'";'),'Client ID is configured at build time');
const vendors=['Coolblue','Coolblue Fietsen','Bakkerij Janssen','Action','Albert Heijn 1089','IKEA','Studio Noord','Gamma','KPN B.V.','Jumbo'];
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'bf-qa@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "state=structuredClone(DEFAULT);",
  "for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  // The own company is called "Action": a cost line that wrongly carries the own name never gets a brand logo.
  "state.company={...state.company,name:'Action Consultancy BV',tradeName:'Action',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'bf-qa@example.test'};",
  "state.contacts=[{id:'s1',type:'supplier',name:'Studio Noord',website:'https://www.studio-noord.test/contact'},{id:'g1',type:'supplier',name:'Gamma',website:'gamma-one.test'},{id:'g2',type:'supplier',name:'Gamma B.V.',website:'gamma-two.test'}];",
  "const d0=new Date().toISOString().slice(0,10);",
  "state.expenses="+JSON.stringify(vendors)+".map((vendor,i)=>({id:'e'+i,date:d0,vendor,category:'Inkoop',exVat:10+i,vatRate:21,invoiceNumber:'F-'+i}));",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
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
const logoPng=fs.readFileSync(path.join(root,'public','assets','boekuna-app-icon-180.png'));
const browser=await (browserName==='webkit'?webkit:chromium).launch();

async function openApp(width,height,scheme){
  const context=await browser.newContext({viewport:{width,height},locale:'nl-NL',colorScheme:scheme});
  const outside=[];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
    const req=route.request(),u=new URL(req.url());
    outside.push({host:u.host,path:u.pathname,query:u.search,referer:req.headers()['referer']||''});
    if(u.host==='cdn.brandfetch.io'){
      // Brandfetch temporarily down for this domain (server error, no image).
      if(u.pathname.startsWith('/ikea.com/'))return route.fulfill({status:503,body:''});
      if(/^\/(coolblue\.nl|ah\.nl|kpn\.com|jumbo\.com)\//.test(u.pathname))return route.fulfill({status:200,contentType:'image/png',body:logoPng});
      return route.fulfill({status:404,body:''});
    }
    if(u.host==='studio-noord.test'&&u.pathname==='/apple-touch-icon.png')return route.fulfill({status:200,contentType:'image/png',body:logoPng});
    return route.fulfill({status:404,body:''});
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(8000);
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page,outside,errors};
}

try{
  // Desktop, light.
  {
    const {context,page,outside,errors}=await openApp(1280,900,'light');
    const before=await page.evaluate(()=>JSON.stringify({expenses:state.expenses,contacts:state.contacts,invoices:state.invoices,documents:state.documents}));
    await page.evaluate(()=>navigate('expenses'));
    const rowFor=name=>page.locator('table.mobile-expenses tbody tr').filter({has:page.locator('strong',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).first();
    // 1. Known supplier, no relation: Brandfetch icon with the app origin as referrer.
    await rowFor('Coolblue').locator('.party-avatar.has-logo').waitFor();
    const img=rowFor('Coolblue').locator('.party-avatar img');
    assert.match(await img.getAttribute('src'),/^https:\/\/cdn\.brandfetch\.io\/coolblue\.nl\/w\/96\/h\/96\/fallback\/404\/icon\?c=qa-brandfetch-client-01$/);
    assert.equal(await img.getAttribute('referrerpolicy'),'strict-origin');
    assert.equal(await img.getAttribute('loading'),'lazy');
    const bfCool=outside.find(r=>r.host==='cdn.brandfetch.io'&&r.path.startsWith('/coolblue.nl/'));
    assert.equal(bfCool?.referer,url+'/','Brandfetch only sees the app origin, no page path');
    // Branch number on a receipt still matches; legal form is ignored.
    await rowFor('Albert Heijn 1089').locator('.party-avatar.has-logo').waitFor();
    await rowFor('KPN B.V.').locator('.party-avatar.has-logo').waitFor();
    // 2. Relation website wins over the list and Brandfetch 404 falls back to the relation's own site.
    await rowFor('Studio Noord').locator('.party-avatar.has-logo').waitFor();
    assert.match(await rowFor('Studio Noord').locator('.party-avatar img').getAttribute('src'),/^https:\/\/studio-noord\.test\/apple-touch-icon\.png$/);
    assert.equal(await rowFor('Studio Noord').locator('.party-avatar img').getAttribute('referrerpolicy'),'no-referrer','own sites never get a referrer');
    await page.waitForTimeout(800);
    // 3. Look-alike, unknown, own company and same-name relations: initials or category icon, never a guess.
    for(const name of ['Coolblue Fietsen','Bakkerij Janssen','Action','Gamma'])assert.equal(await rowFor(name).locator('.party-avatar.has-logo').count(),0,name+' gets no logo');
    assert.equal(await rowFor('Bakkerij Janssen').locator('.party-avatar').count(),1);
    assert.ok(!outside.some(r=>/action\.com|gamma|coolbluefietsen/.test(r.host+r.path)),'no lookup for own company, ambiguous or look-alike names: '+outside.map(r=>r.host+r.path).join(', '));
    // 4. Brandfetch unreachable: falls through to initials, the list stays usable.
    // Lazy images only load near the viewport (WebKit uses a small margin), so bring the row into view first.
    await rowFor('IKEA').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>partyLogoState.get('ikea.com')===false).catch(async e=>{throw new Error('IKEA logo chain did not finish: '+JSON.stringify({state:await page.evaluate(()=>String(partyLogoState.get('ikea.com'))),img:await rowFor('IKEA').locator('.party-avatar').innerHTML(),requests:outside.filter(r=>r.path.includes('ikea')||r.host.includes('ikea'))})+' '+e.message)});
    assert.equal(await rowFor('IKEA').locator('.party-avatar.has-logo').count(),0);
    assert.equal(await rowFor('IKEA').locator('.party-avatar .party-initials').innerText(),'IK');
    // 5. Ten cost lines at once: one request per domain at most, no duplicates.
    const bf=outside.filter(r=>r.host==='cdn.brandfetch.io');
    assert.equal(new Set(bf.map(r=>r.path)).size,bf.length,'every Brandfetch URL is requested once');
    assert.ok(bf.every(r=>r.query==='?c='+CLIENT_ID),'only the Client ID is sent as query');
    // 6. Same layout with or without logo: avatar boxes have one size.
    const sizes=await page.locator('table.mobile-expenses .party-avatar').evaluateAll(els=>[...new Set(els.map(el=>{const r=el.getBoundingClientRect();return r.width+'x'+r.height}))]);
    assert.equal(sizes.length,1,'all avatars share one size: '+sizes.join(', '));
    // 7. Remembered across a reload: no new Brandfetch request for known outcomes.
    const count=outside.length;
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#mainApp').waitFor();
    await page.evaluate(()=>navigate('expenses'));
    await rowFor('Coolblue').locator('.party-avatar.has-logo').waitFor();
    await page.waitForTimeout(600);
    assert.ok(!outside.slice(count).some(r=>r.host==='cdn.brandfetch.io'&&/^\/(ikea\.com|studio-noord\.test)\//.test(r.path)),'negative outcomes are not retried after a reload');
    // 8. Bookkeeping data untouched.
    const after=await page.evaluate(()=>JSON.stringify({expenses:state.expenses,contacts:state.contacts,invoices:state.invoices,documents:state.documents}));
    assert.equal(after,before,'logos never change expenses, relations, invoices or documents');
    assert.deepEqual(errors,[],'no page errors');
    await context.close();
  }
  // iPhone size, dark.
  {
    const {context,page,errors}=await openApp(390,844,'dark');
    await page.evaluate(()=>navigate('expenses'));
    await page.locator('.mobile-card-row .party-avatar.has-logo').first().waitFor();
    const box=await page.locator('.mobile-card-row .party-avatar.has-logo').first().boundingBox();
    assert.ok(box&&Math.abs(box.width-box.height)<0.5&&box.width<=40,'logo stays a small round avatar on a phone');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,'no sideways scroll on a phone');
    assert.deepEqual(errors,[],'no page errors on a phone');
    await context.close();
  }
  console.log('brandfetch logos ('+browserName+'): ok');
}finally{
  await browser.close();
  server.close();
}
