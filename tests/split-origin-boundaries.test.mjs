import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const APP='https://app.boekuna.nl';
const LEGACY='https://boekuna-boekhouding.onrender.com';

const originFunctions=[
  'supabase/functions/billing-checkout/index.ts',
  'supabase/functions/billing-portal/index.ts',
  'supabase/functions/billing-sync/index.ts',
  'supabase/functions/email-connection/index.ts',
  'supabase/functions/send-invoice/index.ts',
  'supabase/functions/analyze-invoice/index.ts',
  'supabase/functions/document-processing/index.ts',
  'supabase/functions/financial-automation/index.ts'
];

for(const file of originFunctions){
  const source=read(file);
  assert.ok(source.includes(APP),file+' must allow the isolated app origin');
  assert.ok(source.includes(LEGACY),file+' must retain the legacy production origin during rollback window');
}

for(const file of [
  'supabase/functions/billing-checkout/index.ts',
  'supabase/functions/billing-portal/index.ts',
  'supabase/functions/billing-sync/index.ts',
  'supabase/functions/document-processing/index.ts'
]){
  const source=read(file);
  assert.ok(
    source.includes('Deno.env.get("APP_URL")||"https://app.boekuna.nl"'),
    file+' must default APP_URL to the isolated product host'
  );
}

const checkout=read('supabase/functions/billing-checkout/index.ts');
assert.ok(checkout.includes('APP_URL+"/?login=1&billing=success&session_id={CHECKOUT_SESSION_ID}"'),
  'Stripe checkout success must return through the app host authority');
assert.ok(checkout.includes('APP_URL+"/?login=1&billing=cancelled"'),
  'Stripe checkout cancellation must return through the app host authority');

const portal=read('supabase/functions/billing-portal/index.ts');
assert.ok(portal.includes('APP_URL+"/?login=1&billing=portal-return"'),
  'Stripe portal must return through the app host authority');

const email=read('supabase/functions/email-connection/index.ts');
assert.ok(email.includes('return "https://app.boekuna.nl/";'),
  'email integration safe return fallback must be the product host');

const sendInvoice=read('supabase/functions/send-invoice/index.ts');
const sendOriginsStart=sendInvoice.indexOf('const ALLOWED_ORIGINS');
const sendOriginsEnd=sendInvoice.indexOf(']);',sendOriginsStart);
assert.ok(sendOriginsStart>=0&&sendOriginsEnd>sendOriginsStart,'send-invoice allowlist must be statically readable');
const sendOriginBlock=sendInvoice.slice(sendOriginsStart,sendOriginsEnd);
assert.ok(sendOriginBlock.includes(APP),'send-invoice trusted origin contract must explicitly contain app.boekuna.nl');
assert.ok(sendOriginBlock.includes(LEGACY),'send-invoice must retain the legacy rollback origin');
assert.ok(!sendOriginBlock.includes('*'),'send-invoice trusted origin contract must not use wildcard CORS');

console.log('BOEKUNA split origin boundaries: PASS');
