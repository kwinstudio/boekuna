// Account deletion with a (possibly) running Stripe subscription.
// Fake Stripe only: no network, no live keys, no real subscriptions are touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {closeStripeBilling,cancelSubscriptionNow,stripeRequestWithKey,isChargeable} from '../supabase/functions/_shared/account-closure.ts';

const require=createRequire(new URL('./package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');

const USER='00000000-0000-4000-8000-0000000000a1';
const OTHER='00000000-0000-4000-8000-0000000000b2';

// Minimal in-memory Stripe: subscriptions and checkout sessions, call log, failure switches.
function fakeStripe({subs=[],sessions=[],fail={}}={}){
  const calls=[];
  const stripe=async(method,path,params)=>{
    calls.push(method+' '+path+(params?'?'+params.toString():''));
    const key=method+' '+path.split('?')[0].replace(/(sub|cs)_[A-Za-z0-9]+/g,'$1_X');
    if(fail[key]){const e=new Error('STRIPE:'+fail[key]);e.status=500;throw e}
    let m;
    if(method==='GET'&&path==='/checkout/sessions')return {data:sessions.filter(s=>s.customer===params.get('customer')&&s.status==='open')};
    if(method==='POST'&&(m=path.match(/^\/checkout\/sessions\/(cs_[A-Za-z0-9]+)\/expire$/))){const s=sessions.find(x=>x.id===m[1]);s.status='expired';return s}
    if(method==='GET'&&path==='/subscriptions')return {data:subs.filter(s=>s.customer===params.get('customer'))};
    if(method==='GET'&&path==='/subscriptions/search'){const id=params.get('query').match(/'([0-9a-f-]{36})'/)[1];return {data:subs.filter(s=>s.metadata?.user_id===id)}}
    if((m=path.match(/^\/subscriptions\/(sub_[A-Za-z0-9]+)$/))){
      const s=subs.find(x=>x.id===m[1]);
      if(!s){const e=new Error('STRIPE:No such subscription');e.status=404;throw e}
      if(method==='DELETE'){if(s.status==='canceled'){const e=new Error('STRIPE:already canceled');e.status=400;throw e}s.status='canceled';return s}
      return s;
    }
    throw new Error('unexpected stripe call '+method+' '+path);
  };
  return {stripe,calls,subs,sessions};
}

// 1. Active subscription + open checkout: everything is stopped before deletion may continue.
{
  const f=fakeStripe({
    subs:[{id:'sub_live1',customer:'cus_A',status:'active',metadata:{user_id:USER}},{id:'sub_old',customer:'cus_A',status:'canceled',metadata:{user_id:USER}}],
    sessions:[{id:'cs_open1',customer:'cus_A',status:'open'},{id:'cs_other',customer:'cus_B',status:'open'}]
  });
  const r=await closeStripeBilling(f.stripe,{userId:USER,customerId:'cus_A',subscriptionId:'sub_live1'});
  assert.deepEqual(r.canceledSubscriptionIds,['sub_live1']);
  assert.deepEqual(r.expiredCheckoutSessionIds,['cs_open1']);
  assert.equal(f.subs[0].status,'canceled');
  assert.equal(f.sessions[1].status,'open','other customers are never touched');
  assert.ok(!f.calls.some(c=>c.includes('sub_old')&&c.startsWith('DELETE')),'already-ended subscriptions are not cancelled again');
}

// 2. Duplicate subscription on the same customer (e.g. double checkout) is cancelled too.
{
  const f=fakeStripe({subs:[{id:'sub_a',customer:'cus_A',status:'active',metadata:{user_id:USER}},{id:'sub_b',customer:'cus_A',status:'past_due',metadata:{user_id:USER}}]});
  const r=await closeStripeBilling(f.stripe,{userId:USER,customerId:'cus_A',subscriptionId:'sub_a'});
  assert.deepEqual(r.canceledSubscriptionIds.sort(),['sub_a','sub_b']);
  assert.ok(f.subs.every(s=>s.status==='canceled'));
}

// 3. Stripe refuses to cancel and the subscription is still active: closure throws,
//    so delete-account stops before any data is removed.
{
  const f=fakeStripe({subs:[{id:'sub_stuck',customer:'cus_A',status:'active'}],fail:{'DELETE /subscriptions/sub_X':'api down'}});
  await assert.rejects(()=>closeStripeBilling(f.stripe,{userId:USER,customerId:'cus_A',subscriptionId:'sub_stuck'}),/STILL_ACTIVE/);
}

// 4. Listing the customer's subscriptions fails: throw (unknown state = do not delete).
{
  const f=fakeStripe({subs:[],fail:{'GET /subscriptions':'timeout'}});
  await assert.rejects(()=>closeStripeBilling(f.stripe,{userId:USER,customerId:'cus_A'}),/timeout/);
}

// 5. Already cancelled (e.g. a retry after a half-finished deletion) counts as done.
{
  const f=fakeStripe({subs:[{id:'sub_done',customer:'cus_A',status:'canceled'}]});
  assert.equal(await cancelSubscriptionNow(f.stripe,'sub_done'),'canceled');
}

// 6. No customer stored (webhook never arrived): the metadata search still finds and cancels
//    this user's subscription, and ignores another user's.
{
  const f=fakeStripe({subs:[{id:'sub_mine',customer:'cus_N',status:'trialing',metadata:{user_id:USER}},{id:'sub_theirs',customer:'cus_O',status:'active',metadata:{user_id:OTHER}}]});
  const r=await closeStripeBilling(f.stripe,{userId:USER});
  assert.deepEqual(r.canceledSubscriptionIds,['sub_mine']);
  assert.equal(r.customerId,'cus_N');
  assert.equal(f.subs[1].status,'active');
}

// 7. Free user and Stripe search unavailable: deletion is not blocked (nothing known to bill).
{
  const f=fakeStripe({fail:{'GET /subscriptions/search':'search unavailable'}});
  const r=await closeStripeBilling(f.stripe,{userId:USER});
  assert.equal(r.searchSkipped,true);
  assert.deepEqual(r.canceledSubscriptionIds,[]);
}

// 8. Missing Stripe key with a known Stripe customer must fail, never silently skip.
await assert.rejects(()=>closeStripeBilling(stripeRequestWithKey(''),{userId:USER,customerId:'cus_A'}),/STRIPE_NOT_CONFIGURED/);
assert.equal(isChargeable('incomplete'),true);
assert.equal(isChargeable('incomplete_expired'),false);

// 9. Request builder: DELETE without body params, GET with query, errors carry Stripe's message.
{
  const seen=[];
  const fetchImpl=async(url,init)=>{seen.push([init.method,url,init.headers['Idempotency-Key']||'']);return new Response(JSON.stringify(url.includes('bad')?{error:{message:'nope',code:'resource_missing'}}:{status:'canceled'}),{status:url.includes('bad')?404:200})};
  const s=stripeRequestWithKey('sk_test_fake',fetchImpl);
  await s('DELETE','/subscriptions/sub_1');
  await s('GET','/subscriptions',new URLSearchParams({customer:'cus_1'}));
  await assert.rejects(()=>s('GET','/bad'),/nope/);
  assert.deepEqual(seen[0],['DELETE','https://api.stripe.com/v1/subscriptions/sub_1','']);
  assert.equal(seen[1][1],'https://api.stripe.com/v1/subscriptions?customer=cus_1');
}

// 10. Source contract: billing is closed before any data is deleted, and failures keep data.
{
  const del=fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
  const claimAt=del.indexOf('begin_account_closure'),closeAt=del.indexOf('closeStripeBilling(');
  const firstDelete=del.indexOf('.remove('),deleteUserAt=del.indexOf('deleteUser(');
  assert.ok(claimAt>0&&closeAt>claimAt,'claim before Stripe');
  assert.ok(firstDelete>closeAt&&deleteUserAt>closeAt,'Stripe closure must happen before storage or account deletion');
  assert.ok(/catch \(billingError\)[\s\S]{0,400}return reply\(502/.test(del),'Stripe failure returns before deleting anything');
  assert.ok(del.includes('state: "completed"'),'successful deletion is recorded');
  const hook=fs.readFileSync('supabase/functions/billing-webhook/index.ts','utf8');
  assert.ok(hook.indexOf('closedAccountGuard(userId, String(sub.id)')<hook.indexOf('applyStripeState(admin'),'webhook checks closed accounts before writing state');
  assert.ok(hook.includes('closedAccountGuard(userId, subId)'),'completed checkouts for deleted accounts are cancelled');
  const checkout=fs.readFileSync('supabase/functions/billing-checkout/index.ts','utf8');
  assert.ok(checkout.indexOf('ACCOUNT_CLOSING')<checkout.indexOf('/checkout/sessions'),'no checkout while an account is closing');
}

// 11. Database: the closure claim is atomic and invisible to app users.
{
  const db=new PGlite();
  await db.exec([
    'create role anon;','create role authenticated;','create role service_role bypassrls;',
    'create table public.billing_accounts(user_id uuid primary key,stripe_customer_id text,stripe_subscription_id text,status text not null default \'free\');',
    'grant usage on schema public to anon,authenticated,service_role;',
    'grant select on public.billing_accounts to service_role;'
  ].join('\n'));
  await db.exec(fs.readFileSync('supabase/migrations/20261008120000_account_closure_billing_guard.sql','utf8'));
  await db.query("insert into public.billing_accounts values($1,'cus_A','sub_live1','active')",[USER]);
  await db.exec('set role service_role');
  const claim=async id=>(await db.query('select public.begin_account_closure($1) as r',[id])).rows[0].r;
  const first=await claim(USER);
  assert.equal(first.claimed,true);
  assert.equal(first.stripe_subscription_id,'sub_live1');
  assert.equal(first.subscription_status,'active');
  assert.equal((await claim(USER)).claimed,false,'a second request while one runs is refused');
  await db.query("update public.account_closures set state='failed' where user_id=$1",[USER]);
  assert.equal((await claim(USER)).claimed,true,'a failed attempt can be retried');
  await db.query("update public.account_closures set updated_at=now()-interval '11 minutes' where user_id=$1",[USER]);
  assert.equal((await claim(USER)).claimed,true,'a stale attempt can be retried');
  assert.equal((await db.query('select attempts from public.account_closures where user_id=$1',[USER])).rows[0].attempts,3);
  const freeUser=await claim(OTHER);
  assert.equal(freeUser.claimed,true);
  assert.equal(freeUser.stripe_customer_id,null);
  await assert.rejects(()=>db.query("update public.account_closures set stripe_customer_id='not-a-customer'"),/check/i);
  for(const role of ['authenticated','anon']){
    await db.exec('reset role; set role '+role);
    await assert.rejects(()=>db.query('select * from public.account_closures'),/permission denied/);
    await assert.rejects(()=>db.query('select public.begin_account_closure($1)',[USER]),/permission denied/);
  }
  await db.close();
}

console.log('Account closure (Stripe before deletion): PASS');
