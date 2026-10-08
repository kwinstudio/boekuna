// Pricing V2: price arithmetic, checkout validation and webhook plan/interval sync.
// Runs the real Edge Function code against fake Supabase + fake Stripe. No network, no live keys.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  PLANS,PAID_PLAN_IDS,priceCents,yearlyMonthlyEquivalentCents,formatEuro,lookupKey,parseLookupKey,
  canonicalPlan,normalizeInterval,resolveStripePlan,sellablePlans,DEFAULT_SELLABLE_PLANS,UNLIMITED_CLAIM_RELEASED
} from '../supabase/functions/_shared/pricing.mjs';
import {fakeSupabase,fakeStripe,loadEdgeFunction} from './lib/edge-harness.mjs';

const USER={id:'00000000-0000-4000-8000-0000000000a1',email:'qa@example.test'};

// 1. Prices: exact cents, yearly is exactly ten months, no rounding drift.
assert.deepEqual(PAID_PLAN_IDS,['zzp','pro','business']);
for(const [plan,month,year] of [['zzp',995,9950],['pro',1995,19950],['business',3495,34950]]){
  assert.equal(priceCents(plan,'month'),month);
  assert.equal(priceCents(plan,'year'),year);
  assert.equal(month*10,year,plan+': yearly must be exactly 10x monthly');
  assert.ok(Number.isInteger(year),'amounts are integer cents');
  assert.equal(Math.round((1-year/(month*12))*1000)/10,16.7,plan+': yearly discount is 16.7%');
  assert.equal(month*12-year,month*2,plan+': yearly saves exactly two months');
}
assert.equal(formatEuro(9950),'€ 99,50');
assert.equal(formatEuro(34950),'€ 349,50');
assert.deepEqual(['zzp','pro','business'].map(yearlyMonthlyEquivalentCents),[829,1663,2913],'secondary monthly indication 8,29 / 16,63 / 29,13');
assert.equal(priceCents('start','month'),null,'Start has no Stripe price');
assert.equal(priceCents('zzp','week'),null);
assert.equal(PLANS.start.paid,false);
assert.equal(UNLIMITED_CLAIM_RELEASED,false,'the word onbeperkt stays off until costs are measured');
assert.deepEqual(DEFAULT_SELLABLE_PLANS,['zzp'],'only ZZP is sold until Pro/Business features exist');
assert.deepEqual(sellablePlans('zzp, pro ,gold'),['zzp','pro']);

// 2. Legacy keys map safely onto V2.
assert.equal(canonicalPlan('boekuna'),'zzp');
assert.equal(canonicalPlan('free'),'start');
assert.equal(canonicalPlan('unlimited'),'pro');
assert.equal(canonicalPlan('gold'),'');
assert.equal(normalizeInterval('jaar'),'year');
assert.equal(normalizeInterval('quarter'),'');
assert.equal(lookupKey('business','year'),'boekuna_business_year_v2');
assert.deepEqual(parseLookupKey('boekuna_pro_month_v2'),{plan:'pro',interval:'month'});

// 3. Resolving the plan from the price the customer pays.
const sub=(price,metadata={})=>({id:'sub_1',metadata,items:{data:[{price}]}});
assert.deepEqual(
  (({plan,interval,amount})=>({plan,interval,amount}))(resolveStripePlan(sub({id:'price_a',lookup_key:'boekuna_pro_year_v2',unit_amount:19950,currency:'eur',recurring:{interval:'year',interval_count:1}},{plan:'zzp'}))),
  {plan:'pro',interval:'year',amount:19950},'portal switch: price wins over stale metadata');
assert.equal(resolveStripePlan(sub({id:'price_old',unit_amount:995,currency:'eur',recurring:{interval:'month',interval_count:1}},{plan:'boekuna'})).plan,'zzp','pre-V2 Boekuna price stays ZZP');
assert.equal(resolveStripePlan(sub({id:'price_old2',unit_amount:1995,currency:'eur',recurring:{interval:'month',interval_count:1}},{plan:'pro'})).plan,'pro','pre-V2 Unlimited price stays Pro');
assert.equal(resolveStripePlan(sub({id:'p',unit_amount:34950,currency:'eur',recurring:{interval:'year',interval_count:1}})).plan,'business');
assert.equal(resolveStripePlan(sub({id:'p',unit_amount:995,currency:'eur',recurring:{interval:'month',interval_count:3}})),null,'a quarterly price is not a V2 price');
assert.equal(resolveStripePlan(sub({id:'p',unit_amount:1234,currency:'eur',recurring:{interval:'month'}},{plan:'business'})).plan,'business','unknown price falls back to subscription metadata');

// 4. Checkout.
const CHECKOUT_DIR=new URL('../supabase/functions/billing-checkout/',import.meta.url).pathname;
async function checkout({body,env={},tables={},prices={},stripeSubs=[]}){
  const supabase=fakeSupabase({users:{tok:USER},tables});
  const stripe=fakeStripe({
    'GET /prices':({query})=>({data:prices[query.get('lookup_keys[]')]?[prices[query.get('lookup_keys[]')]]:[]}),
    'GET /subscriptions':({query})=>({data:stripeSubs.filter(s=>s.customer===query.get('customer'))}),
    'POST /checkout/sessions':({body})=>({id:'cs_test_1',url:'https://checkout.stripe.test/cs_test_1',_params:body}),
  });
  const handler=await loadEdgeFunction(CHECKOUT_DIR,{env:{APP_URL:'https://app.boekuna.nl',SUPABASE_URL:'http://sb',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'svc',STRIPE_SECRET_KEY:'sk_'+'test_fake',...env},supabase,fetchImpl:stripe.fetchImpl});
  const res=await handler(new Request('https://x/functions/v1/billing-checkout',{method:'POST',headers:{origin:'https://app.boekuna.nl',authorization:'Bearer tok','content-type':'application/json'},body:JSON.stringify(body)}));
  const session=stripe.calls.find(c=>c.method==='POST'&&c.path==='/checkout/sessions');
  return {status:res.status,json:await res.json(),session,calls:stripe.calls};
}

{
  const r=await checkout({body:{plan:'zzp',interval:'year',amount:1}})
  assert.equal(r.status,200);
  assert.equal(r.json.amount,9950,'server decides the amount, a client amount is ignored');
  const p=r.session.body;
  assert.equal(p.get('mode'),'subscription');
  assert.equal(p.get('line_items[0][price_data][unit_amount]'),'9950');
  assert.equal(p.get('line_items[0][price_data][recurring][interval]'),'year','a yearly plan is charged yearly, not in monthly instalments');
  assert.equal(p.get('line_items[0][price_data][tax_behavior]'),'exclusive');
  assert.equal(p.get('automatic_tax[enabled]'),'true');
  assert.equal(p.get('subscription_data[metadata][plan]'),'zzp');
  assert.equal(p.get('subscription_data[metadata][interval]'),'year');
  assert.equal(p.get('subscription_data[trial_end]'),null,'no trials');
  assert.equal(p.get('subscription_data[trial_period_days]'),null,'no trials');
  const text=p.get('custom_text[submit][message]');
  for(const must of ['€ 99,50 excl. btw','12 maanden','verlengt','opzegt','btw'])assert.ok(text.includes(must),'checkout text must mention '+must);
  assert.ok(text.length<=1200,'Stripe custom text limit');
  assert.match(r.session.headers['Idempotency-Key'],/^boekuna-checkout:[^:]+:zzp:year:/);
}
{
  const official={id:'price_zzp_m',lookup_key:'boekuna_zzp_month_v2',currency:'eur',unit_amount:995,type:'recurring',recurring:{interval:'month',interval_count:1},tax_behavior:'exclusive'};
  const r=await checkout({body:{plan:'zzp',interval:'month'},prices:{boekuna_zzp_month_v2:official}});
  assert.equal(r.status,200);
  assert.equal(r.session.body.get('line_items[0][price]'),'price_zzp_m','official Stripe recurring price is used when configured');
  assert.equal(r.session.body.get('line_items[0][price_data][unit_amount]'),null);
  assert.ok(r.session.body.get('custom_text[submit][message]').includes('€ 9,95 excl. btw per maand'));
}
{
  const wrong={id:'price_bad',currency:'eur',unit_amount:990,type:'recurring',recurring:{interval:'month',interval_count:1},tax_behavior:'exclusive'};
  const r=await checkout({body:{plan:'zzp',interval:'month'},prices:{boekuna_zzp_month_v2:wrong}});
  assert.equal(r.json.code,'PRICE_MISMATCH');
  assert.equal(r.session,undefined,'a mismatching Stripe price never reaches Checkout');
  const inclusive=await checkout({body:{plan:'zzp',interval:'month'},prices:{boekuna_zzp_month_v2:{...wrong,unit_amount:995,tax_behavior:'inclusive'}}});
  assert.equal(inclusive.json.code,'PRICE_MISMATCH','prices are excl. btw; an inclusive price is refused');
}
{
  const legacy=await checkout({body:{plan:'boekuna'}});
  assert.equal(legacy.status,200,'an older app sending plan=boekuna still gets ZZP monthly');
  assert.equal(legacy.session.body.get('line_items[0][price_data][unit_amount]'),'995');
  assert.equal(legacy.session.body.get('line_items[0][price_data][recurring][interval]'),'month');

  assert.equal((await checkout({body:{plan:'pro',interval:'month'}})).json.code,'PLAN_NOT_AVAILABLE','Pro is behind the feature flag');
  assert.equal((await checkout({body:{plan:'business',interval:'year'}})).json.code,'PLAN_NOT_AVAILABLE','Business is behind the feature flag');
  const pro=await checkout({body:{plan:'pro',interval:'year'},env:{BILLING_SELLABLE_PLANS:'zzp,pro,business'}});
  assert.equal(pro.session.body.get('line_items[0][price_data][unit_amount]'),'19950');
  const biz=await checkout({body:{plan:'business',interval:'month'},env:{BILLING_SELLABLE_PLANS:'zzp,pro,business'}});
  assert.equal(biz.session.body.get('line_items[0][price_data][unit_amount]'),'3495');

  assert.equal((await checkout({body:{plan:'gold',interval:'month'}})).status,400);
  assert.equal((await checkout({body:{plan:'start',interval:'month'}})).status,400,'Start needs no Stripe subscription');
  assert.equal((await checkout({body:{plan:'zzp',interval:'week'}})).status,400);
}
{
  const active=await checkout({body:{plan:'zzp',interval:'year'},tables:{billing_accounts:[{user_id:USER.id,stripe_customer_id:'cus_1',stripe_subscription_id:'sub_1',status:'active',plan:'zzp'}]}});
  assert.equal(active.json.code,'EXISTING_SUBSCRIPTION');
  assert.equal(active.session,undefined);
  const racing=await checkout({body:{plan:'zzp',interval:'year'},tables:{billing_accounts:[{user_id:USER.id,stripe_customer_id:'cus_1',stripe_subscription_id:null,status:'free',plan:'free'}]},stripeSubs:[{id:'sub_9',customer:'cus_1',status:'active'}]});
  assert.equal(racing.json.code,'EXISTING_SUBSCRIPTION','a paid subscription the webhook has not delivered yet still blocks a second one');
  const ended=await checkout({body:{plan:'zzp',interval:'year'},tables:{billing_accounts:[{user_id:USER.id,stripe_customer_id:'cus_1',stripe_subscription_id:'sub_1',status:'canceled',plan:'zzp'}]},stripeSubs:[{id:'sub_1',customer:'cus_1',status:'canceled'}]});
  assert.equal(ended.status,200,'after cancellation a customer can subscribe again');
  assert.equal(ended.session.body.get('customer'),'cus_1','existing Stripe customer is reused');
  const closing=await checkout({body:{plan:'zzp',interval:'month'},tables:{account_closures:[{user_id:USER.id,state:'pending'}]}});
  assert.equal(closing.json.code,'ACCOUNT_CLOSING','no checkout while the account is being deleted');
}
{
  const a=await checkout({body:{plan:'zzp',interval:'year'}});
  const b=await checkout({body:{plan:'zzp',interval:'year'}});
  assert.equal(a.session.headers['Idempotency-Key'],b.session.headers['Idempotency-Key'],'a double click maps to one Stripe Checkout');
  const c=await checkout({body:{plan:'zzp',interval:'month'}});
  assert.notEqual(a.session.headers['Idempotency-Key'],c.session.headers['Idempotency-Key']);
}
{
  const supabase=fakeSupabase({users:{}});
  const handler=await loadEdgeFunction(CHECKOUT_DIR,{env:{SUPABASE_URL:'x',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',STRIPE_SECRET_KEY:'sk_'+'test_fake'},supabase,fetchImpl:async()=>{throw new Error('no network')}});
  const res=await handler(new Request('https://x',{method:'POST',headers:{authorization:'Bearer nope'},body:'{"plan":"zzp","interval":"year"}'}));
  assert.equal(res.status,401,'checkout requires a signed-in user');
}

// 5. Webhook: plan + interval from the paid price, idempotency, legacy writer fallback, closed accounts.
const WEBHOOK_DIR=new URL('../supabase/functions/billing-webhook/',import.meta.url).pathname;
const SECRET='whsec_test_fake';
function signed(event){
  const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000);
  const sig=crypto.createHmac('sha256',SECRET).update(`${t}.${raw}`).digest('hex');
  return new Request('https://x/functions/v1/billing-webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${sig}`},body:raw});
}
const priceYear={id:'price_pro_y',lookup_key:'boekuna_pro_year_v2',unit_amount:19950,currency:'eur',recurring:{interval:'year',interval_count:1}};
function stripeSub(over={}){return {id:'sub_A',customer:'cus_A',status:'active',cancel_at_period_end:false,metadata:{user_id:USER.id,plan:'zzp'},items:{data:[{price:priceYear,current_period_end:Math.floor(Date.now()/1000)+365*86400}]},...over}}
async function webhook(event,{rpc,tables={},subscription=stripeSub(),users={tok:USER}}={}){
  const supabase=fakeSupabase({users,tables,rpc});
  const stripe=fakeStripe({
    'GET /subscriptions/sub_X':()=>subscription,
    'DELETE /subscriptions/sub_X':()=>({...subscription,status:'canceled'}),
    'POST /subscriptions/sub_X':()=>({...subscription,status:'canceled'}),
  });
  const handler=await loadEdgeFunction(WEBHOOK_DIR,{env:{SUPABASE_URL:'x',SUPABASE_SERVICE_ROLE_KEY:'s',STRIPE_SECRET_KEY:'sk_'+'test_fake',STRIPE_WEBHOOK_SIGNING_SECRET:SECRET},supabase,fetchImpl:stripe.fetchImpl});
  const res=await handler(signed(event));
  return {status:res.status,json:await res.json(),rpcs:supabase.calls.filter(c=>c[0]==='rpc'),stripe:stripe.calls,tables:supabase.tables};
}
const v2ok={apply_stripe_subscription_state_v2:()=>({data:true,error:null})};
const evt=(type,object,id='evt_'+type.replace(/\W/g,''))=>({id,type,created:Math.floor(Date.now()/1000),livemode:false,data:{object}});
{
  const r=await webhook(evt('customer.subscription.updated',{id:'sub_A',customer:'cus_A',metadata:{user_id:USER.id}}),{rpc:v2ok});
  assert.equal(r.status,200,JSON.stringify(r.json));
  const [,fn,args]=r.rpcs[0];
  assert.equal(fn,'apply_stripe_subscription_state_v2');
  assert.equal(args.p_plan,'pro','portal upgrade ZZP -> Pro is read from the price');
  assert.equal(args.p_billing_interval,'year');
  assert.equal(args.p_unit_amount_cents,19950);
  assert.equal(args.p_stripe_price_id,'price_pro_y');
  assert.equal(args.p_status,'active');
}
for(const type of ['invoice.paid','invoice.payment_failed']){
  const r=await webhook(evt(type,{id:'in_1',subscription:'sub_A',customer:'cus_A'}),{rpc:v2ok,subscription:stripeSub({status:type==='invoice.paid'?'active':'past_due'})});
  assert.equal(r.status,200,type);
  assert.equal(r.rpcs[0][2].p_status,type==='invoice.paid'?'active':'past_due',type+' syncs the current Stripe status');
}
{
  const r=await webhook(evt('customer.subscription.deleted',stripeSub({status:'canceled'})),{rpc:v2ok});
  assert.equal(r.rpcs[0][2].p_status,'canceled','cancellation reaches Boekuna (data is kept, access ends)');
}
{
  const r=await webhook(evt('checkout.session.completed',{id:'cs_1',client_reference_id:USER.id,subscription:'sub_A',metadata:{user_id:USER.id,plan:'zzp',interval:'year'}}),{rpc:v2ok,subscription:stripeSub({items:{data:[{price:{id:'price_inline',unit_amount:9950,currency:'eur',recurring:{interval:'year',interval_count:1}}}]}})});
  assert.equal(r.rpcs[0][2].p_plan,'zzp');
  assert.equal(r.rpcs[0][2].p_billing_interval,'year','a yearly checkout is stored as yearly');
}
{
  const e=evt('customer.subscription.updated',{id:'sub_A',metadata:{user_id:USER.id}},'evt_dup');
  const tables={billing_events:[{stripe_event_id:'evt_dup',status:'processed'}]};
  const r=await webhook(e,{rpc:v2ok,tables});
  assert.equal(r.json.duplicate,true,'a duplicate Stripe event is not processed twice');
  assert.equal(r.rpcs.length,0);
}
{
  const r=await webhook(evt('customer.subscription.updated',{id:'sub_A',metadata:{user_id:USER.id}}),{rpc:{apply_stripe_subscription_state:()=>({data:true,error:null})},subscription:stripeSub({items:{data:[{price:{id:'p_old',unit_amount:995,currency:'eur',recurring:{interval:'month',interval_count:1}}}]}})});
  assert.equal(r.status,200);
  assert.deepEqual(r.rpcs.map(c=>c[1]),['apply_stripe_subscription_state_v2','apply_stripe_subscription_state'],'before the migration the old writer is used');
  assert.equal(r.rpcs[1][2].p_plan,'boekuna','old writer gets its legacy key');
}
{
  const r=await webhook(evt('checkout.session.completed',{id:'cs_2',client_reference_id:USER.id,subscription:'sub_A'}),{rpc:v2ok,tables:{account_closures:[{user_id:USER.id,state:'billing_closed'}]}});
  assert.equal(r.status,200);
  assert.equal(r.rpcs.length,0,'no billing state is written for a closed account');
  assert.ok(r.stripe.some(c=>c.path==='/subscriptions/sub_A'&&c.method!=='GET'),'a subscription completed during deletion is cancelled at once');
}
{
  const live=evt('customer.subscription.updated',{id:'sub_A'});live.livemode=true;
  const r=await webhook(live,{rpc:v2ok});
  assert.equal(r.status,400,'a live event is rejected by a test-mode deployment');
}

console.log('Pricing V2 billing tests: PASS');
