// One spacing rhythm on every app screen (kwinest/app-assets/spacing.css), on the production build:
// equal gaps between page sections and cards, one padding per card kind, table rows on the card's
// inner edge, form fields that do not stretch, phone sheets on one left edge, no horizontal overflow
// and no overlapping sections, in Light and Dark Mode, from 375px phones to 1440px desktops.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

buildApp();
const built=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const shotDir=process.env.SPACING_SHOT_DIR||'tests/artifacts/spacing';fs.mkdirSync(shotDir,{recursive:true});
const PAGES=['dashboard','invoices','expenses','documents','bank','vat','reports','contacts','services','income','outgoings'];
const WIDTHS=[375,390,768,1280,1440];

// Static contract: the layer is loaded after the other app layers and before Dark Mode, and sets no colours.
{
  const spacing=built.indexOf('/assets/spacing.css'),dark=built.indexOf('/assets/theme-dark.css'),feedback=built.indexOf('/assets/feedback.css'),calm=built.indexOf('/assets/calm-ux.css');
  assert.ok(spacing>feedback&&spacing>calm&&spacing<dark,'spacing.css loads after the app layers and before theme-dark.css');
  const css=fs.readFileSync('dist/app/assets/spacing.css','utf8');
  assert.equal(/(^|[;{\s])(color|background|border-color|box-shadow)\s*:/i.test(css),false,'spacing.css only sets spacing and alignment');
  for(const px of css.match(/var\(--space-\d,(\d+)px\)/g)||[])assert.ok([4,8,12,16,20,24,32].includes(Number(px.match(/,(\d+)px/)[1])),'token fallback on the spacing scale: '+px);
  console.log('PASS spacing layer order and scope');
}

const {server,url}=await startAppServer();
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

const MEASURE=`(()=>{
  const vis=el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'};
  const sig=el=>el.tagName.toLowerCase()+'.'+[...el.classList].slice(0,2).join('.');
  const c=document.getElementById('content');
  const out={overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,gaps:[],overlaps:[],tiles:[],cards:[],tableEdges:[]};
  const sections=[...c.children].filter(vis);
  for(let i=1;i<sections.length;i++){const a=sections[i-1].getBoundingClientRect(),b=sections[i].getBoundingClientRect();out.gaps.push([Math.round(b.top-a.bottom),sig(sections[i])])}
  for(const g of c.querySelectorAll('.compact-metrics,.dashboard-kpis,.dashboard-main-grid,.dashboard-summary-grid,.premium-grid,.premium-split')){
    if(!vis(g))continue;const s=getComputedStyle(g);out.gaps.push([Math.round(parseFloat(s.rowGap)),sig(g)+' row-gap']);
    const kids=[...g.children].filter(vis).map(k=>k.getBoundingClientRect());
    for(let i=0;i<kids.length;i++)for(let j=i+1;j<kids.length;j++){const a=kids[i],b=kids[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)out.overlaps.push(sig(g))}
  }
  for(const t of c.querySelectorAll('.card.metric,.card.dashboard-summary-card'))if(vis(t))out.tiles.push(getComputedStyle(t).paddingLeft);
  // A section drawn without a frame (no border, no fill; e.g. Nog te doen on a phone) is not a card, so it has no card padding.
  const framed=el=>{const s=getComputedStyle(el);return parseFloat(s.borderTopWidth)>0||s.backgroundColor!=='rgba(0, 0, 0, 0)'};
  for(const k of c.querySelectorAll('.card:not(.metric):not(.table-card):not(.dashboard-summary-card):not(.report-filterbar)'))if(vis(k)&&framed(k))out.cards.push(getComputedStyle(k).paddingLeft+' '+sig(k));
  for(const t of c.querySelectorAll('.table-card')){
    const h=t.querySelector('.section-head h2'),cell=[...t.querySelectorAll('tbody td')].find(vis);
    if(h&&cell&&vis(h)){const inner=cell.querySelector('.mobile-cell-label')&&vis(cell.querySelector('.mobile-cell-label'))?cell.querySelector('.mobile-cell-label'):cell;const left=inner===cell?cell.getBoundingClientRect().left+parseFloat(getComputedStyle(cell).paddingLeft):inner.getBoundingClientRect().left;out.tableEdges.push(Math.round(left-h.getBoundingClientRect().left))}
  }
  return out;
})()`;

try{
  for(const scheme of ['light','dark']){
    for(const width of WIDTHS){
      if(scheme==='dark'&&![390,1440].includes(width))continue;
      const phone=width<=820,gap=phone?12:16,tile=phone?'12px':'16px',card=phone?'16px':'20px';
      const context=await browser.newContext({viewport:{width,height:phone?844:900},colorScheme:scheme,reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(url);await page.locator('#mainApp').waitFor();
      const problems=[];
      for(const p of PAGES){
        await page.evaluate(p=>navigate(p),p);await page.waitForTimeout(150);
        const m=await page.evaluate(MEASURE);
        if(m.overflow>1)problems.push(p+' horizontal overflow '+m.overflow+'px');
        for(const [g,where] of m.gaps)if(g!==gap)problems.push(p+' gap '+g+'px before '+where+' (expected '+gap+')');
        m.overlaps.forEach(o=>problems.push(p+' overlapping cards in '+o));
        m.tiles.filter(x=>x!==tile).forEach(x=>problems.push(p+' tile padding '+x));
        m.cards.filter(x=>!x.startsWith(card+' ')).forEach(x=>problems.push(p+' card padding '+x));
        m.tableEdges.filter(x=>Math.abs(x)>1).forEach(x=>problems.push(p+' table rows off the heading edge by '+x+'px'));
        if(scheme==='light'&&[390,1440].includes(width)&&['dashboard','invoices','documents','vat'].includes(p))await page.screenshot({path:shotDir+'/'+width+'-'+p+'-'+browserName+'.png',fullPage:true});
      }
      // Dashboard: the chart card and "Nog te doen" end on the same line when they sit side by side.
      await page.evaluate(()=>navigate('dashboard'));await page.waitForTimeout(150);
      const bottoms=await page.evaluate(()=>{const a=document.querySelector('.dashboard-chart-card').getBoundingClientRect(),b=document.querySelector('.dashboard-attention').getBoundingClientRect();return {side:Math.abs(a.top-b.top)<2,diff:Math.round(a.bottom-b.bottom)}});
      if(bottoms.side&&Math.abs(bottoms.diff)>1)problems.push('dashboard cards end '+bottoms.diff+'px apart');
      // Phone: a single page action spans the row instead of wrapping in half.
      if(phone){
        await page.evaluate(()=>navigate('documents'));await page.waitForTimeout(150);
        const fill=await page.evaluate(()=>{const a=document.querySelector('.product-page-actions');if(!a||a.children.length!==1||getComputedStyle(a).display!=='grid')return null;return Math.round(a.firstElementChild.getBoundingClientRect().width-a.getBoundingClientRect().width)});
        if(fill!==null&&fill!==0)problems.push('single page action is '+fill+'px narrower than its row');
      }
      // Forms: fields in one row start and size alike; on phones the sheet has one left edge.
      await page.evaluate(()=>newExpense());await page.waitForTimeout(250);
      const form=await page.evaluate(()=>{
        const f=[...document.querySelectorAll('#expenseForm>.field')].slice(0,2).map(x=>x.querySelector('input').getBoundingClientRect());
        const left=s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().left):null};
        return {sameRow:Math.abs(f[0].top-f[1].top)<60,topDiff:Math.round(f[1].top-f[0].top),hDiff:Math.round(f[1].height-f[0].height),title:left('#modalTitle'),label:left('#expenseForm .field label'),button:left('#modalRoot .modal-foot .btn')};
      });
      if(form.sameRow&&(form.topDiff!==0||form.hDiff!==0))problems.push('expense form: second input off by '+form.topDiff+'px top, '+form.hDiff+'px height');
      if(form.title!==form.label)problems.push('expense sheet: title at '+form.title+'px, fields at '+form.label+'px');
      if(phone&&form.button!==form.label)problems.push('expense sheet: buttons at '+form.button+'px, fields at '+form.label+'px');
      await page.evaluate(()=>closeModal());
      assert.deepEqual(problems,[],'spacing issues at '+width+'px ('+scheme+')');
      await context.close();
      console.log('PASS spacing at '+width+'px '+scheme);
    }
  }
  assert.deepEqual(errors,[]);
  console.log('Spacing layout browser QA: PASS '+browserName);
}finally{await browser.close();server.close()}
