import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const retirement=read('supabase/migrations/20260929122626_retire_first_100_early_access.sql');
const checkout=read('supabase/functions/billing-checkout/index.ts');
const pricing=read('public/index.html');
const faq=read('public/index.html');
const terms=read('public/voorwaarden/index.html');
const html=read('kwinest/index.html');

assert.ok(retirement.includes("else 'free'"),'Non-paid users must now resolve to Gratis');
assert.ok(retirement.includes('drop trigger if exists on_auth_user_early_access'),'Automatic Early Access claim trigger must be retired');
assert.ok(retirement.includes('drop function if exists private.ensure_early_access_claim(uuid)'),'Early Access claim allocator must be retired');
assert.ok(retirement.includes('drop function if exists public.reserve_founding_offer(uuid)'),'Legacy Founding 100 reservation API must be retired');
assert.ok(retirement.includes('drop function if exists public.get_early_access_campaign_status()'),'Public campaign-status API must be retired');
assert.ok(!retirement.includes("then 'early_access_active'"),'Retirement migration must not create Early Access entitlement');
assert.ok(!retirement.includes("then 'expired_read_only'"),'Retirement migration must not create Early Access read-only state');

assert.ok(!checkout.includes('trial_end'),'Paid checkout must not create a Stripe trial');
assert.ok(!checkout.includes('reserve_founding_offer'),'Paid checkout must not allocate founder slots');

for(const [name,content] of [['pricing',pricing],['faq',faq],['terms',terms],['app',html]]){
  for(const retired of ['Early Access','Founding 100','Eerste 100']){
    assert.ok(!content.toLowerCase().includes(retired.toLowerCase()),`${name} must not expose retired offer: ${retired}`);
  }
}
assert.ok(!pricing.includes('3 kalendermaanden'),'Pricing must not promise a free introductory period');
assert.ok(!html.includes('3 kalendermaanden €0'),'App must not promise a free introductory period');

console.log('Retired First 100 offer regression: PASS');
