import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationDir=new URL('../supabase/migrations/',import.meta.url);
const migrationFiles=fs.readdirSync(migrationDir).sort();
const hardeningName=migrationFiles.find(name=>name.includes('financial_automation_restrict_table_grants'));
assert.ok(hardeningName,'forward migration restricting financial table grants must exist');

const body=fs.readFileSync(new URL(hardeningName,migrationDir),'utf8');
for(const table of ['bank_imports','bank_transactions','transaction_matches','document_duplicate_fingerprints','document_validation_results']){
  assert.ok(body.includes('public.'+table),`permission hardening must cover ${table}`);
}
assert.match(body,/revoke all privileges on table[\s\S]*from anon, authenticated;/i,'anon/authenticated must lose all table privileges first');
assert.match(body,/grant select on table[\s\S]*to authenticated;/i,'authenticated must regain SELECT only');
assert.doesNotMatch(body,/grant\s+(insert|update|delete|truncate|trigger|references)\b/i,'financial table hardening must not grant mutation-capable privileges');

console.log('Financial table permission hardening: PASS');
