// Pricing V2 on boekuna.nl: three sellable plans, month/year switch, honest claims, prices equal the server.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {PLANS,formatEuro,yearlyMonthlyEquivalentCents,UNLIMITED_CLAIM_RELEASED,DEFAULT_SELLABLE_PLANS} from '../supabase/functions/_shared/pricing.mjs';
import {serveMarketing} from './helpers/marketing-site.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const home=read('public/index.html'),prices=read('public/prijzen/index.html'),terms=read('public/voorwaarden/index.html'),faq=read('public/faq/index.html');
const copy=JSON.parse(read('docs/marketing/pricing-v2-copy.json'));
const all=[home,prices,faq,...['bonnen','facturen','hoe-het-werkt','functies','btw','bank'].map(s=>read(`public/${s}/index.html`))].join('\n');

// Static: every price shown equals the server-side config; hidden plans are not shown at all.
const hiddenPlans=Object.keys(PLANS).filter(id=>PLANS[id].paid&&!DEFAULT_SELLABLE_PLANS.includes(id));
for(const page of [home,prices]){
  for(const id of DEFAULT_SELLABLE_PLANS){
    for(const interval of ['month','year'])assert.ok(page.includes(formatEuro(PLANS[id].prices[interval])),`${id} ${interval} price missing`);
    assert.ok(page.includes(formatEuro(yearlyMonthlyEquivalentCents(id))),`${id} yearly per-month indication missing`);
  }
  for(const id of hiddenPlans){
    assert.ok(!page.includes(`data-plan="${id}"`)&&!page.includes(`plan=${id}`),id+' has no features of its own yet and must not be shown');
    for(const interval of ['month','year'])assert.ok(!page.includes(formatEuro(PLANS[id].prices[interval])),id+' price must not be shown');
  }
  assert.ok(page.includes('Eenvoudige prijzen.'),'title');
  assert.ok(page.includes('Gratis factureren, of je hele boekhouding voor een vast bedrag.'),'subtitle');
  assert.ok(page.includes('2 maanden gratis'),'yearly switch label');
  assert.ok(page.includes('inclusief btw')&&!page.includes('exclusief btw.'),'VAT basis: prices incl. btw');
  for(const id of DEFAULT_SELLABLE_PLANS)
    assert.ok(page.includes(`href="https://app.boekuna.nl/?register=1&amp;plan=${id}&amp;interval=year"`),id+' CTA carries plan and default interval');
}
// Cards list only the main features, matching the plan split in the app.
const card=id=>{const from=prices.indexOf(`data-plan="${id}"`);return prices.slice(from,prices.indexOf('</article>',from))};
const cardFeatures={start:["Facturen en creditnota's",'Klanten en betalingen','Export en back-up'],zzp:['Alles van Start','Kosten, bonnetjes en btw-overzicht','Bankimport en rapporten','100 slimme documentherkenningen per maand'],pro:['Alles van ZZP','Documentherkenning zonder maandlimiet','Herstelpunten']};
for(const [id,features] of Object.entries(cardFeatures)){
  const html=card(id).replaceAll('&#39;',"'");
  assert.equal((html.match(/<li>/g)||[]).length,features.length,id+' card lists only its main features');
  for(const feature of features)assert.ok(html.includes(feature),id+' card feature: '+feature);
}
assert.ok(!card('start').includes('Kosten, bonnetjes'),'Start does not promise bookkeeping');
for(const [id,p] of Object.entries(copy.plans)){
  if(!PLANS[id].paid)continue;
  assert.equal(p.sellable,DEFAULT_SELLABLE_PLANS.includes(id),'Klaviyo copy '+id+' sellable flag');
  if(!p.sellable)continue;
  assert.equal(p.monthly,formatEuro(PLANS[id].prices.month),'Klaviyo copy '+id+' monthly');
  assert.equal(p.yearly,formatEuro(PLANS[id].prices.year),'Klaviyo copy '+id+' yearly');
  assert.equal(p.yearlyPerMonth,formatEuro(yearlyMonthlyEquivalentCents(id)),'Klaviyo copy '+id+' per month');
}
const ld=JSON.parse(prices.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"SoftwareApplication"[\s\S]*?)<\/script>/)[1]);
assert.deepEqual(ld.offers.map(o=>[o.name,o.price]),[['Start','0'],['ZZP maandelijks','9.95'],['ZZP jaarlijks','99.50'],['Pro maandelijks','19.95'],['Pro jaarlijks','199.50']],'structured data lists only purchasable offers');

// Honest claims only.
const lower=all.toLowerCase();
if(!UNLIMITED_CLAIM_RELEASED)assert.ok(!/onbeperkt/.test(lower),'"onbeperkt" stays off until costs are measured');
for(const banned of ['meest gekozen','populairst','unlimited','documentchecks per maand','early access','eerste 100','proefperiode','tijdelijke korting','data-plan-helper'])
  assert.ok(!lower.includes(banned),'banned or stale pricing copy: '+banned);
// Plan cards and the comparison list only existing features: no roadmap items or "soon" promises.
const homePricing=home.slice(home.indexOf('id="tarieven"'),home.indexOf('</section>',home.indexOf('id="tarieven"')));
for(const block of [homePricing,prices])for(const roadmap of ['binnenkort','terugkerende facturen','boekingsregels','meerdere gebruikers','batchverwerking','automatische betalingsherinnering','rollen'])
  assert.ok(!block.toLowerCase().includes(roadmap),'pricing must not promise a feature that does not exist: '+roadmap);
for(const q of ['Kan ik later upgraden?','Hoe werkt het jaarabonnement?','Kan ik opzeggen?','Hoeveel documenten kan ik verwerken?','Wat gebeurt er met mijn gegevens na opzegging?','Zijn de prijzen inclusief of exclusief btw?'])
  assert.ok(prices.includes(q),'pricing FAQ missing: '+q);
for(const clause of ['jaarabonnement wordt per jaar vooraf betaald','12 maanden toegang','ook niet bij een jaarabonnement','einde van de betaalde periode'])
  assert.ok(terms.includes(clause),'terms must cover yearly billing: '+clause);

// Browser: switch works without reload, keyboard, CTA carries period, no overflow.
const server=await serveMarketing('public');
const engines=(process.env.BOOKUNA_BROWSER==='webkit')?[['webkit',webkit]]:[['chromium',chromium]];
const shots=process.env.PRICING_SCREENSHOTS||'';
try{
  for(const [name,engine] of engines){
    const browser=await engine.launch();
    try{
      for(const route of ['/','/prijzen/']){
        for(const width of [320,390,768,1440]){
          const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
          const errors=[];page.on('pageerror',e=>errors.push(String(e)));
          await page.goto(server.base+route,{waitUntil:'networkidle'});
          const grid=page.locator('[data-pricing]');
          await grid.scrollIntoViewIfNeeded();
          const zzp=grid.locator('[data-plan=zzp]');
          assert.equal(await page.getByRole('radio',{name:/Jaarlijks/}).getAttribute('aria-checked'),'true',route+' yearly is the default');
          const price=zzp.locator('.pricing-price');
          assert.match((await price.innerText()).trim(),/^€ 99,50 \/ jaar$/,'yearly total visible first');
          const top=()=>grid.evaluate(el=>el.getBoundingClientRect().top+window.scrollY);
          const before=await top();
          const navigations=[];page.on('framenavigated',f=>{if(f===page.mainFrame())navigations.push(f.url())});
          await page.getByRole('radio',{name:'Maandelijks'}).click();
          assert.match((await price.innerText()).trim(),/^€ 9,95 \/ maand$/,'monthly price after switch');
          assert.match(await zzp.locator('a[data-plan-cta]').getAttribute('href'),/interval=month/,'CTA carries the chosen period');
          const pro=grid.locator('[data-plan=pro]');
          assert.match((await pro.locator('.pricing-price').innerText()).trim(),/^€ 19,95 \/ maand$/,'Pro monthly price after switch');
          assert.match(await pro.locator('a[data-plan-cta]').getAttribute('href'),/plan=pro&interval=month/,'Pro CTA carries the chosen period');
          assert.deepEqual(navigations,[],'switching does not reload the page');
          const after=await top();
          assert.ok(Math.abs(after-before)<1,`switch causes no layout shift above the cards (${route} ${width}px: ${after-before})`);
          assert.equal((await page.locator('[data-interval-status]').innerText()).trim(),'Maandprijzen worden getoond.','screen readers hear the change');
          await page.getByRole('radio',{name:'Maandelijks'}).focus();
          await page.keyboard.press('ArrowRight');
          assert.equal(await page.getByRole('radio',{name:/Jaarlijks/}).getAttribute('aria-checked'),'true','arrow keys switch period');
          assert.match(await zzp.locator('a[data-plan-cta]').getAttribute('href'),/interval=year/);
          assert.equal(await page.evaluate(()=>document.activeElement?.dataset.interval),'year','focus follows selection');
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
          assert.ok(overflow<=1,`${name} ${route} ${width}px horizontal overflow ${overflow}`);
          const toggle=await page.locator('.interval-toggle button').first().boundingBox();
          assert.ok(toggle.height>=44,'touch target at least 44px');
          if(shots&&(width===390||width===1440)){
            await page.getByRole('radio',{name:/Jaarlijks/}).click();
            await grid.screenshot({path:`${shots}/${route==='/'?'home':'prijzen'}-${width}-jaar.png`});
            await page.getByRole('radio',{name:'Maandelijks'}).click();
            await grid.screenshot({path:`${shots}/${route==='/'?'home':'prijzen'}-${width}-maand.png`});
            if(route==='/prijzen/'){const cmp=page.locator('.table-scroll:has(table.compare-plans)');await page.evaluate(()=>{for(const el of document.querySelectorAll('header,.skip-link'))el.style.visibility='hidden'});await cmp.screenshot({path:`${shots}/vergelijking-${width}.png`})}
          }
          assert.deepEqual(errors,[]);
          await page.close();
        }
      }
      // Without JavaScript the yearly price and the monthly alternative are both readable.
      const ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
      const page=await ctx.newPage();
      await page.goto(server.base+'/prijzen/');
      const text=await page.locator('[data-plan=zzp]').innerText();
      assert.ok(text.includes('€ 99,50')&&text.includes('€ 9,95 per maand'),'no-JS fallback shows yearly and monthly');
      const proText=await page.locator('[data-plan=pro]').innerText();
      assert.ok(proText.includes('€ 199,50')&&proText.includes('€ 19,95 per maand'),'no-JS fallback shows Pro yearly and monthly');
      await ctx.close();
      console.log('Pricing V2 website ('+name+'): PASS');
    }finally{await browser.close()}
  }
}finally{await server.close()}
