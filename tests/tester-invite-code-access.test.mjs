import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261007101500_tester_invite_code_access.sql';
const oldMigration='supabase/migrations/20261005223000_tester_access_entitlement.sql';
const scriptPath='scripts/generate-tester-invite-codes.mjs';

assert.ok(!fs.existsSync(oldMigration),'retired 90-day tester migration must be removed from PR #217');
assert.ok(fs.existsSync(migrationPath),'30-day tester invite-code migration must exist');
assert.ok(fs.existsSync(scriptPath),'admin-only tester code generator script must exist');

const sql=fs.readFileSync(migrationPath,'utf8');
const html=fs.readFileSync('kwinest/index.html','utf8');
const workflow=fs.readFileSync('.github/workflows/boekuna-backend.yml','utf8');
const generator=fs.readFileSync(scriptPath,'utf8');
const checkout=fs.readFileSync('supabase/functions/billing-checkout/index.ts','utf8');

for(const fragment of [
  'private.tester_invite_codes','code_hash bytea','campaign text','duration_days',
  'default 30','code_expires_at','redeemed_at','redeemed_by_user_id',
  'private.tester_code_redemption_attempts','public.generate_tester_invite_codes',
  'extensions.gen_random_bytes','public.redeem_tester_invite_code','auth.uid()',
  'email_confirmed_at','for update',"provider='tester_code'","'tester_code'","'boekuna'",
  "interval '30 days'",'public.apply_subscription_entitlement',
  'access_source text','access_ends_at timestamptz'
]){
  assert.ok(sql.toLowerCase().includes(fragment.toLowerCase()),'invite-code migration missing contract: '+fragment);
}

assert.match(sql,/revoke\s+all\s+on\s+table\s+private\.tester_invite_codes\s+from\s+public,\s*anon,\s*authenticated/i);
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.generate_tester_invite_codes[\s\S]*from\s+public,\s*anon,\s*authenticated/i);
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.generate_tester_invite_codes[\s\S]*to\s+service_role/i);
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.redeem_tester_invite_code[\s\S]*to\s+authenticated/i);
assert.ok(!sql.toLowerCase().includes("interval '90 days'"));
assert.ok(!sql.toLowerCase().includes('trial_period_days'));
assert.ok(!checkout.includes('trial_period_days'));

for(const fragment of [
  'Heb je een testcode?','Code activeren','activateTesterCode',"redeem_tester_invite_code",
  'Testtoegang actief','Je kunt ZZP gratis gebruiken tot',
  'Verifieer eerst je e-mailadres.','Deze testcode is niet geldig.',
  'Deze testcode is al gebruikt.','Deze testcode is verlopen.',
  'Je hebt je gratis testperiode al gebruikt.','Je hebt al een actief abonnement.'
]){
  assert.ok(html.includes(fragment),'billing UI missing tester-code contract: '+fragment);
}
// The cashflow page legitimately forecasts "90 dagen" ahead; only tester/billing copy must not mention 90 days.
const htmlWithoutCashflow=html.replace(/function renderCashflow\(\)[^\n]*/,'');
assert.ok(!/90\s*dagen|3\s*maanden|90-day|90 days/i.test(sql+'\n'+htmlWithoutCashflow+'\n'+generator));
assert.ok(html.includes("accessSource==='tester_code'")||html.includes("access_source==='tester_code'"));
assert.ok(html.includes('access_ends_at'));
assert.ok(!html.includes("localStorage.setItem('tester"));

for(const fragment of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','generate_tester_invite_codes','campaign','count']){
  assert.ok(generator.includes(fragment),'admin generator missing: '+fragment);
}
assert.ok(!/sb_secret_|eyJ[a-zA-Z0-9_-]+\./.test(generator));

assert.ok(workflow.includes('tests/tester-invite-code-access.test.mjs'));
assert.ok(workflow.includes('Tester invite-code access regression'));

console.log('BOEKUNA 30-day tester invite-code source contract: PASS');
