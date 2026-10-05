import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('kwinest/index.html');
const asset=read('public/assets/developer-mode.js');
const edge=read('supabase/dev-only/functions/dev-session/index.ts');
const sql=read('supabase/dev-only/migrations/20260930144500_temporary_developer_mode.sql');
const processor=read('kwinest/docprocessor/app.py');
const build=read('scripts/build-app.mjs');

assert.ok(app.includes("const TEST_MODE_NO_AUTH=false;"),'Production auth test bypass must remain hard-off');
assert.ok(app.includes("window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:false,environment:'production',allowedOrigins:[]});"),'Source default Developer Mode must be production/off');
assert.ok(app.includes('/assets/developer-mode.js'),'App must load the isolated Developer Mode helper');
assert.ok(!app.includes('BOEKUNA_DEV_USER_PASSWORD='),'QA password must never be embedded in the browser');
assert.ok(!app.includes('BOEKUNA_DEV_ACCESS_KEY='),'Preview access key must never be embedded in the browser');

for(const origin of [
  'https://app.boekuna.nl',
  'https://boekuna.nl',
  'https://www.boekuna.nl',
  'https://boekuna-boekhouding.onrender.com',
  'https://kwinest-boekhouding.onrender.com'
]){
  assert.ok(edge.includes(origin),'Edge guard must hard-deny production origin '+origin);
  assert.ok(sql.includes(origin),'Database guard must hard-deny production origin '+origin);
  assert.ok(asset.includes(origin),'Browser helper must hard-deny production origin '+origin);
}

for(const envName of ['BOEKUNA_DEV_MODE','BOEKUNA_DEV_ALLOWED_ORIGINS','BOEKUNA_DEV_USER_ID','BOEKUNA_DEV_USER_EMAIL','BOEKUNA_DEV_USER_PASSWORD','BOEKUNA_DEV_ACCESS_KEY']){
  assert.ok(edge.includes('Deno.env.get("'+envName+'")'),'Developer bootstrap must use server-only env '+envName);
}
assert.ok(edge.includes('data?.user?.id===expectedUserId'),'Existing session must match the QA allowlist');
assert.ok(edge.includes('data.user.id!==expectedUserId'),'Fresh QA login must match the configured user id');
assert.ok(edge.includes('signInWithPassword'),'Auto-login must use real Supabase Auth rather than a fake user');
assert.ok(edge.includes('DEV_MODE_MISCONFIGURED'),'Misconfigured preview must fail closed');
assert.ok(!/NEXT_PUBLIC_[A-Z0-9_]*DEV/i.test(edge+app),'Sensitive Developer Mode configuration must not use NEXT_PUBLIC');

assert.ok(sql.includes('enable row level security'),'Developer session storage must keep RLS enabled');
assert.ok(sql.includes('revoke all on table public.developer_mode_sessions from public,anon,authenticated'),'Developer session table must not be client-readable');
assert.ok(sql.includes('grant execute on function public.issue_developer_mode_session(uuid,text,text,text,timestamptz) to service_role'),'Only service role may issue developer tickets');
assert.ok(sql.includes('s.user_id=p_user_id'),'Developer ticket must bind to the authenticated QA user');
assert.ok(sql.includes('s.origin=v_origin'),'Developer ticket must bind to its preview origin');
assert.ok(sql.includes('s.revoked_at is null'),'Revoked Developer Mode sessions must fail closed');
assert.ok(sql.includes('s.expires_at>now()'),'Expired Developer Mode sessions must fail closed');
assert.ok(sql.includes("and s.environment in ('development','preview','staging')"),'Developer ticket must bind to a non-production environment');
assert.ok(sql.includes("raise exception 'DEVELOPER_MODE_DISABLED'"),'Developer entitlement must fail closed');
assert.ok(sql.includes("return query select true,'pro'::text"),'Developer quota should expose the existing pro/unlimited product shape');
const recordAt=sql.indexOf('create or replace function public.record_developer_document_usage');
const recordEnd=sql.indexOf('revoke all on function public.record_developer_document_usage',recordAt);
const recordSql=sql.slice(recordAt,recordEnd);
assert.ok(!/insert\s+into\s+public\.billing_usage_monthly/i.test(recordSql),'Developer document usage must not persist billing usage');
assert.ok(!/update\s+public\.billing_usage_monthly/i.test(recordSql),'Developer document usage must not mutate billing usage');
assert.ok(!/insert\s+into\s+public\.billing_accounts/i.test(sql),'Developer Mode must never create production billing state');
assert.ok(!/apply_stripe_subscription_state|apply_subscription_entitlement/i.test(sql),'Developer Mode must not mutate real entitlements');

const smartLayer=app.slice(app.indexOf('function hasBoekunaSmartLayer'),app.indexOf('async function requireBoekunaSmartLayer'));
assert.ok(!smartLayer.includes('BoekunaDeveloperMode'),'Client Developer Mode state must not directly grant paid feature access');
assert.ok(asset.includes('Every page load revalidates')||asset.includes('never trusted by itself'),'Stored developer tickets must be server-revalidated on page load');
assert.ok(asset.includes('function bindUser'),'Developer ticket helper must support explicit authenticated-user binding');
assert.ok(asset.includes('value.user_id')&&asset.includes('boundUserId'),'Stored developer ticket must be bound to the current auth user');
assert.ok(asset.includes("if(!policy.allowed){removeStoredTicket();return null}"),'Disallowed environment/origin policy must purge stale Developer Mode browser state');
assert.ok(app.includes("boekuna:developer-mode-invalidated"),'Developer Mode invalidation must reset auth-scoped billing cache immediately');
assert.ok(app.includes('function resetAuthScopedClientState'),'App must centralize auth-scoped Developer Mode and billing cleanup');
assert.ok(app.includes('window.BoekunaDeveloperMode?.clear()'),'Logout/SIGNED_OUT must clear Developer Mode browser state');
assert.ok(app.includes('billingSnapshot=null')&&app.includes('billingLoadedAt=0'),'Auth state changes must clear cached billing state');
assert.ok(app.includes("billingSnapshotSource==='developer'"),'DEV MODE billing UI must require a server-validated developer billing snapshot');
assert.ok(app.includes("event==='SIGNED_OUT'")&&app.includes("resetAuthScopedClientState('')"),'SIGNED_OUT must clear auth-scoped Developer Mode and billing state');
assert.ok(app.includes("event==='SIGNED_IN'")&&app.includes('resetAuthScopedClientState(nextSession.user.id)'),'SIGNED_IN must bind the new user before hydrating account state');

assert.ok(app.includes("if(error&&billingRpc==='get_developer_billing_summary')"),'Invalid developer billing summary must clear dev state and fall back to normal billing');
assert.ok(app.includes("if(error&&quotaRpc==='check_developer_document_quota')"),'Invalid client developer quota state must fall back to normal billing quota');
const clientQuota=app.slice(app.indexOf('async function checkFallbackBillingAllowance'),app.indexOf('async function recordFallbackSmartUsage'));
assert.ok(clientQuota.includes("throw createUploadError('PROCESSOR_UNAVAILABLE'"),'Transient Developer Mode quota validation must fail closed instead of allowing local processing');
assert.ok(clientQuota.includes("quotaRpc='check_document_quota'"),'Explicit rejected/expired Developer Mode session may fall back to normal quota authority');
assert.ok(app.includes("if(error&&usageRpc==='record_developer_document_usage')"),'Invalid client developer usage state must fall back to normal billing usage');
assert.ok(app.includes("get_developer_billing_summary"),'Developer Mode must use a server-validated summary RPC');
assert.ok(app.includes("check_developer_document_quota"),'Fallback document flow must use developer quota only with a valid ticket');
assert.ok(app.includes("record_developer_document_usage"),'Fallback document usage must be non-persistent in Developer Mode');
assert.ok(app.includes("Developer Mode gebruikt geen Stripe Checkout"),'Stripe checkout must be blocked in Developer Mode');
assert.ok(app.includes("Developer Mode heeft geen Stripe-portaal"),'Stripe portal must be blocked in Developer Mode');
assert.ok(processor.includes('X-Boekuna-Dev-Session'),'Document processor CORS must allow the developer ticket header');
assert.ok(processor.includes('check_developer_document_quota'),'Processor must route a ticketed preview through developer quota');
assert.ok(processor.includes('record_developer_document_usage'),'Processor must avoid production billing usage in Developer Mode');
const documentEdge=read('supabase/functions/document-processing/index.ts');
assert.ok(documentEdge.includes('x-boekuna-dev-session'),'Document-processing Edge CORS must allow the developer ticket header');
assert.ok(documentEdge.includes('validateDeveloperContext'),'Edge function must server-validate developer context before forwarding it');
assert.ok(documentEdge.includes('if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)})'),'Document-processing Edge must answer CORS preflight explicitly');
assert.ok(documentEdge.includes('"authorization,apikey,content-type,x-boekuna-dev-session"'),'CORS must explicitly allow the Developer Mode session header');
assert.ok(!documentEdge.includes('"Access-Control-Allow-Origin":"*"'),'Document-processing Edge must never wildcard Developer Mode CORS');

assert.ok(documentEdge.includes('check_developer_document_quota'),'Edge validation must use server-side developer entitlement authority');
assert.ok(documentEdge.includes('processorHeaders["X-Boekuna-Dev-Session"]=jobDeveloper.token'),'Only job-owner-bound Developer Mode context may be forwarded to the processor');
assert.ok(documentEdge.includes('developer?.userId===String(claimed.user_id)'),'Validated Developer Mode context must be rebound to the claimed processing-job owner before processor forwarding');
assert.ok(documentEdge.includes('developer?.userId===String(userId)'),'Queued job dispatch must drop Developer Mode context on any user mismatch');
assert.ok(documentEdge.includes('for(const job of queued||[])run(job.id,authHeader,scopedDeveloper)'),'Queued jobs must receive only user-scoped Developer Mode context');
assert.ok(documentEdge.includes('triggerNext(authHeader,jobId,jobDeveloper)'),'Background triggerNext must preserve only job-owner-bound validated developer context');
assert.ok(documentEdge.includes('async function enqueue(req:Request,a:{user:any,auth:string},body:any,developer:DeveloperContext|null=null)'),'Enqueue must receive validated developer context');
assert.ok(documentEdge.includes('async function retry(req:Request,a:{user:any,auth:string},body:any,developer:DeveloperContext|null=null)'),'Retry must receive validated developer context');
assert.ok(documentEdge.includes('async function resume(req:Request,a:{user:any,auth:string},developer:DeveloperContext|null=null)'),'Resume must receive validated developer context');
assert.ok(documentEdge.includes('const developer=await validateDeveloperContext(req,a)'),'Every externally-triggered processing action must server-validate the developer session');
assert.ok(documentEdge.includes('const started=await kickUser(a.user.id,a.auth,developer)'),'run_next must revalidate and propagate only current developer context');
assert.ok(documentEdge.includes('kickUser(a.user.id,a.auth,developer)'),'Enqueue/retry/resume must pass validated developer context into queued jobs');
assert.ok(processor.includes('developer_session_rejected'),'Processor must distinguish revoked/expired developer sessions from transient RPC failures');
assert.ok(processor.includes('if dev_token and developer_session_rejected(resp)'),'Only an explicitly rejected developer session may fall back to normal quota/usage');


for(const marker of ['BOEKUNA_DEV_MODE','BOEKUNA_DEPLOYMENT_ENV','BOEKUNA_DEV_ALLOWED_ORIGINS','BOEKUNA_SUPABASE_URL','BOEKUNA_SUPABASE_PUBLISHABLE_KEY']){
  assert.ok(build.includes(marker),'App build must explicitly gate '+marker);
}
assert.ok(build.includes('Refusing Developer Mode for production'),'Production build guard must fail closed');
assert.ok(build.includes("enabled:false,environment:'production',allowedOrigins:[]"),'Normal app build must keep Developer Mode off');

const prod=spawnSync(process.execPath,['scripts/build-app.mjs'],{encoding:'utf8'});
assert.equal(prod.status,0,'Normal app build must stay green: '+prod.stderr);
let built=fs.readFileSync('dist/app/index.html','utf8');
assert.ok(built.includes("enabled:false,environment:'production',allowedOrigins:[]"),'Normal build must ship Developer Mode off');

// Security guard is exercised with the full QA profile.\nconst bad=spawnSync(process.execPath,['scripts/build-app.mjs'],{
  encoding:'utf8',
  env:{...process.env,BOEKUNA_RELEASE_PROFILE:'full',BOEKUNA_DEV_MODE:'true',BOEKUNA_DEPLOYMENT_ENV:'production',BOEKUNA_DEV_ALLOWED_ORIGINS:'http://127.0.0.1:3000',BOEKUNA_SUPABASE_URL:'https://example.supabase.co',BOEKUNA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}
});
assert.notEqual(bad.status,0,'Production + dev flag must be rejected');
assert.match(bad.stderr+bad.stdout,/Refusing Developer Mode for production/);

const good=spawnSync(process.execPath,['scripts/build-app.mjs'],{
  encoding:'utf8',
  env:{...process.env,BOEKUNA_RELEASE_PROFILE:'full',BOEKUNA_DEV_MODE:'true',BOEKUNA_DEPLOYMENT_ENV:'preview',BOEKUNA_DEV_ALLOWED_ORIGINS:'http://127.0.0.1:3000',BOEKUNA_SUPABASE_URL:'https://example.supabase.co',BOEKUNA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}
});
assert.equal(good.status,0,'Explicit preview Developer Mode build should succeed: '+good.stderr);
built=fs.readFileSync('dist/app/index.html','utf8');
assert.match(built,/enabled:true,environment:"preview",allowedOrigins:\["http:\/\/127\.0\.0\.1:3000"\]/,'Preview build must carry only explicit allowed origins');
assert.ok(built.includes('const SUPABASE_URL="https://example.supabase.co";'),'Preview build must use the explicitly configured non-production Supabase URL');

console.log('BOEKUNA Developer Mode source/build safety: PASS');
