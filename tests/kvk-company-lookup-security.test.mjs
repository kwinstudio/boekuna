import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const build=env=>spawnSync(process.execPath,['scripts/build-app.mjs'],{encoding:'utf8',env:{...process.env,BOEKUNA_DEV_MODE:'false',BOEKUNA_KVK_PREVIEW:'false',BOEKUNA_DEPLOYMENT_ENV:'production',...env}});
const sentinel='KVK_SERVER_SECRET_MUST_NEVER_SHIP_8a7a9c';
let r=build({KVK_API_KEY:sentinel,KVK_SELECTION_SECRET:sentinel,KVK_API_MODE:'test'});assert.equal(r.status,0,r.stderr);
for(const p of ['dist/app/index.html','dist/app/assets/kvk-company-lookup.js','dist/app/assets/kvk-company-lookup.css']){
 const s=fs.readFileSync(p,'utf8');assert.ok(!s.includes(sentinel),p+' leaked server env');assert.doesNotMatch(s,/api\.kvk\.nl|\/test\/api\/|l7xx1f2691f2520d487b902f4e0b57a0b197|KVK_API_KEY|KVK_SELECTION_SECRET|dev-only\/kvk/);
}
assert.ok(fs.readFileSync('dist/app/index.html','utf8').includes('window.BOEKUNA_KVK_PREVIEW=false;'));
for(const env of [{BOEKUNA_KVK_PREVIEW:'true'},{BOEKUNA_KVK_PREVIEW:'true',BOEKUNA_DEPLOYMENT_ENV:'preview',BOEKUNA_SUPABASE_URL:'https://vuwfyhtejsxhdfyvkkeq.supabase.co',BOEKUNA_SUPABASE_PUBLISHABLE_KEY:'public'},{BOEKUNA_KVK_PREVIEW:'true',BOEKUNA_DEPLOYMENT_ENV:'preview',BOEKUNA_SUPABASE_URL:'https://unknown.supabase.co',BOEKUNA_SUPABASE_PUBLISHABLE_KEY:'public'}])assert.notEqual(build(env).status,0,'unsafe preview build accepted');
const sql=fs.readFileSync('supabase/migrations/20261001112135_kvk_company_lookup_budget.sql','utf8');assert.match(sql,/security invoker/i);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/revoke all on function[\s\S]*from public, anon, authenticated/);assert.match(sql,/enable row level security/);
assert.match(fs.readFileSync('supabase/config.toml','utf8'),/verify_jwt = true/);
assert.match(fs.readFileSync('supabase/functions/kvk-company-lookup/runtime.ts','utf8'),/auth\.getUser\(\)/);
const client=fs.readFileSync('public/assets/kvk-company-lookup.js','utf8');assert.doesNotMatch(client,/localStorage|sessionStorage|console\.log|innerHTML\s*=/);assert.match(client,/response\.mode==='test'&&!previewAllowed/);
assert.equal(build({}).status,0);console.log('KVK production artifact, secret, auth and deployment guards: PASS');
