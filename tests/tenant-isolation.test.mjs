import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migrationDir=new URL('../supabase/migrations/',import.meta.url);
const migrations=fs.readdirSync(migrationDir)
  .filter(name=>name.endsWith('.sql'))
  .sort()
  .map(name=>fs.readFileSync(new URL(name,migrationDir),'utf8'))
  .join('\n');

function assertOwnPolicy(table,policy){
  assert.ok(migrations.includes(policy),`${table} must keep its ownership RLS policy`);
  const policyAt=migrations.indexOf(policy);
  const window=migrations.slice(policyAt,policyAt+900);
  assert.match(window,/auth\.uid\(\)/i,`${table} ownership policy must use auth.uid()`);
  assert.match(window,/user_id/i,`${table} ownership policy must bind auth.uid() to user_id`);
}

for(const [table,policy] of [
  ['profiles','profiles_select_own'],
  ['ledger_state','ledger_select_own'],
  ['ledger_revisions','ledger_revisions_select_own'],
  ['documents','documents_select_own'],
  ['invoice_sequences','invoice_sequences_select_own'],
  ['api_usage','api_usage_select_own'],
  ['email_connections','email_connections_select_own'],
  ['bank_imports','bank_imports_select_own'],
  ['bank_transactions','bank_transactions_select_own'],
  ['transaction_matches','transaction_matches_select_own'],
  ['document_duplicate_fingerprints','document_duplicate_fingerprints_select_own'],
  ['document_validation_results','document_validation_results_select_own']
]) assertOwnPolicy(table,policy);

for(const policy of ['profiles_update_own','ledger_update_own','documents_update_own','invoice_sequences_update_own']){
  const at=migrations.indexOf(policy);
  assert.ok(at>=0,`${policy} must exist`);
  const window=migrations.slice(at,at+1000);
  assert.match(window,/with check/i,`${policy} must protect ownership after UPDATE`);
  assert.match(window,/auth\.uid\(\)/i,`${policy} WITH CHECK must use auth.uid()`);
  assert.match(window,/user_id/i,`${policy} WITH CHECK must bind to user_id`);
}

assert.ok(migrations.includes('storage_select_own'),'Private document storage must keep an ownership SELECT policy');
assert.match(migrations,/storage\.foldername\(name\)[\s\S]{0,120}auth\.uid\(\)/i,'Storage access must bind the first path segment to auth.uid()');

const restoreAt=migrations.indexOf('function public.restore_ledger_revision');
assert.ok(restoreAt>=0,'restore_ledger_revision migration must be tracked');
const restoreWindow=migrations.slice(restoreAt,restoreAt+2600);
assert.match(restoreWindow,/id\s*=\s*p_revision_id/i,'Revision restore must target the requested revision id');
assert.match(restoreWindow,/user_id\s*=\s*\(select auth\.uid\(\)\)/i,'Revision restore must also require current-user ownership');

const grantFile=fs.readdirSync(migrationDir).find(name=>name.endsWith('_financial_automation_restrict_table_grants.sql'));
assert.ok(grantFile,'Financial table grant hardening migration must be tracked');
const financialGrants=fs.readFileSync(new URL(grantFile,migrationDir),'utf8');
assert.match(financialGrants,/revoke\s+all\s+privileges\s+on\s+table/i,'Financial tables must revoke mutation-capable privileges');
assert.match(financialGrants,/from\s+anon,\s*authenticated/i,'Financial table revocation must cover authenticated users');
assert.match(financialGrants,/grant\s+select\s+on\s+table/i,'Financial tables may restore SELECT only');
assert.match(financialGrants,/to\s+authenticated/i,'Financial SELECT grant must target authenticated users');
for(const table of [
  'bank_imports','bank_transactions','transaction_matches',
  'document_duplicate_fingerprints','document_validation_results'
]){
  const occurrences=financialGrants.split('public.'+table).length-1;
  assert.ok(occurrences>=2,`${table} must appear in both revoke-all and SELECT-only grant lists`);
}

const analyze=read('supabase/functions/analyze-invoice/index.ts');
assert.ok(analyze.includes('auth.getUser()'),'Invoice analysis must authenticate the bearer token');
assert.ok(analyze.includes('.eq("user_id",user.user.id)'),'Invoice analysis document lookup must be scoped to the authenticated user');
assert.ok(analyze.includes('.eq("user_id",userId)'),'Verification jobs must be scoped to the authenticated user even when using service-role access');

const financial=read('supabase/functions/financial-automation/index.ts');
assert.ok(financial.includes('auth.getUser()'),'Financial automation must authenticate the bearer token');
assert.ok(financial.includes('bankPreview(ctx.user.id,b)'),'Bank preview must receive user id from the authenticated session');
assert.ok(financial.includes('bankCommit(ctx.user.id,b)'),'Bank commit must receive user id from the authenticated session');
assert.ok(financial.includes('suggestions(ctx.user.id,ctx.userClient,b)'),'Matching suggestions must receive user id from the authenticated session');
assert.ok(financial.includes('confirm(ctx.user.id,ctx.userClient,b)'),'Match confirmation must receive user id from the authenticated session');
assert.ok(financial.includes('.eq("user_id",userId)'),'Service-role financial queries must keep explicit user_id scoping');
assert.ok(!/ctx\.user\.id\s*=/.test(financial),'Authenticated user id must never be reassigned from request data');

const checkout=read('supabase/functions/billing-checkout/index.ts');
const portal=read('supabase/functions/billing-portal/index.ts');
const sync=read('supabase/functions/billing-sync/index.ts');
for(const [name,file] of [['checkout',checkout],['portal',portal],['sync',sync]]){
  assert.ok(file.includes('auth.getUser()'),`Billing ${name} must authenticate the bearer token`);
  assert.ok(file.includes('.eq("user_id",user.id)'),`Billing ${name} service-role reads must be scoped to user.id`);
}
assert.ok(sync.includes('owner!==user.id'),'Billing sync must reject a Checkout session owned by another user');
assert.ok(sync.includes('owner&&owner!==user.id'),'Billing sync must reject a subscription owned by another user');

const send=read('supabase/functions/send-invoice/index.ts');
assert.ok(send.includes('auth.getUser()'),'Invoice email must authenticate the bearer token');
assert.ok(send.includes('mailboxConnection(auth.user.id)'),'Invoice email mailbox lookup must use the authenticated user');

const deletion=read('supabase/functions/delete-account/index.ts');
assert.ok(deletion.includes('auth.getUser()'),'Account deletion must authenticate the bearer token');
assert.ok(deletion.includes('const userId = userData.user.id'),'Account deletion scope must come from the authenticated user');

console.log('Tenant isolation source regression: PASS');
