// Ingelogd blijven na een update (Kwin 2026-11-01, "slechte reviews concurrenten" 11): at a competitor the phone
// app logged everyone out after an update. Someone who was signed in with an older version opens the new build:
// the session saved by the older version (supabase-js in localStorage) must open the app straight away, without
// the login screen, and keep doing so after a reload. The real supabase-js runs in the page; only the network to
// Supabase is answered here.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const html=fs.readFileSync('dist/app/index.html','utf8');

// Static guards: what decides whether a stored session is found again.
const SUPABASE_URL=(/const SUPABASE_URL='([^']+)'/.exec(html)||[])[1];
assert.ok(SUPABASE_URL,'SUPABASE_URL is in the app');
const ref=new URL(SUPABASE_URL).hostname.split('.')[0];
assert.equal(ref,'vuwfyhtejsxhdfyvkkeq','the Supabase project stays the same, or every saved session is gone');
const client=/createClient\(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,\{auth:\{([^}]*)\}/.exec(html);
assert.ok(client,'one Supabase client');
assert.match(client[1],/persistSession:true/,'sessions are kept on the device');
assert.match(client[1],/autoRefreshToken:true/,'sessions refresh themselves');
assert.doesNotMatch(client[1],/storageKey/,'no own storage key: changing it would sign everyone out');
assert.doesNotMatch(html,/localStorage\.clear\(\)/,'an update never wipes the device storage');

const umd=fs.readFileSync('tests/node_modules/@supabase/supabase-js/dist/umd/supabase.js','utf8');
const supabaseEsm=umd+'\nexport const createClient=supabase.createClient;\n';
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')||p==='/manifest.webmanifest'){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';

const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const exp=Math.floor(Date.now()/1000)+3600;
const user={id:'00000000-0000-4000-8000-000000000042',aud:'authenticated',role:'authenticated',email:'qa@example.test',email_confirmed_at:'2026-10-01T10:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T10:00:00Z'};
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,aud:'authenticated',role:'authenticated',email:user.email,exp,aal:'aal1',session_id:'s1'})+'.sig';
const session={access_token:token,refresh_token:'refresh-qa',token_type:'bearer',expires_in:3600,expires_at:exp,user};

const browser=await chromium.launch();
const errors=[],unexpected=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'nl-NL'});
  // The session as an older version left it on the device.
  await context.addInitScript(([key,value])=>{if(!localStorage.getItem(key))localStorage.setItem(key,value)},['sb-'+ref+'-auth-token',JSON.stringify(session)]);
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',r=>r.fulfill({status:200,contentType:'text/javascript',body:supabaseEsm,headers:{'access-control-allow-origin':'*'}}));
  await context.route(/^https:\/\/[a-z0-9]+\.supabase\.co\//,r=>{
    const u=new URL(r.request().url()),cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'*'};
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:cors});
    const reply=(body,status=200)=>r.fulfill({status,contentType:'application/json',headers:cors,body:JSON.stringify(body)});
    if(u.pathname==='/auth/v1/user')return reply(user);
    if(u.pathname==='/auth/v1/token'){unexpected.push('token refresh');return reply(session)}
    if(u.pathname==='/auth/v1/logout'){unexpected.push('logout');return reply({})}
    if(u.pathname.startsWith('/auth/v1/factors')||u.pathname.includes('/mfa'))return reply({all:[],totp:[],phone:[]});
    if(u.pathname.startsWith('/rest/v1/rpc/'))return reply(null);
    if(u.pathname.startsWith('/rest/v1/'))return /single|object/.test(r.request().headers()['accept']||'')?reply({},406):reply([]);
    if(u.pathname.startsWith('/storage/v1/'))return reply([]);
    if(u.pathname.startsWith('/functions/v1/'))return reply({ok:true});
    return reply({});
  });
  await context.route(/^https:\/\/(?!127\.0\.0\.1)/,r=>{const h=new URL(r.request().url()).hostname;if(/supabase\.co$|jsdelivr\.net$/.test(h))return r.fallback();return r.fulfill({status:204,body:''})});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(20000);
  for(const round of ['first open of the new version','reload']){
    if(round==='reload')await page.reload({waitUntil:'domcontentloaded'});else await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{const m=document.getElementById('mainApp');return m&&getComputedStyle(m).display!=='none'&&typeof currentUser!=='undefined'&&currentUser&&currentUser.email},null,{timeout:20000});
    const shown=await page.evaluate(()=>({user:currentUser.email,login:!!document.querySelector('#authRoot form,#authForm'),stored:Object.keys(localStorage).filter(k=>/^sb-.*-auth-token$/.test(k))}));
    assert.equal(shown.user,'qa@example.test',round+': signed in as the same person');
    assert.equal(shown.login,false,round+': no login screen');
    assert.deepEqual(shown.stored,['sb-'+ref+'-auth-token'],round+': the session stays where the older version left it');
  }
  assert.deepEqual(unexpected,[],'no logout and no forced token refresh on opening');
  console.log('Ingelogd blijven na een update: PASS');
}finally{
  await browser.close();server.close();
}
if(errors.length)console.warn('Page errors (not about signing in):',errors.slice(0,3));
