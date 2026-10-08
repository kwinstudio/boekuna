import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';

// Real user flows for bank import in the production build: preview before booking, problems visible,
// duplicate upload, column mapping, clear errors, and conservative matching. Synthetic fixtures only.
execFileSync(process.execPath, ['scripts/build-app.mjs']);
const original = fs.readFileSync(new URL('../dist/app/index.html', import.meta.url), 'utf8').replace('const today=()=>localDateOnly(new Date());', "const today=()=> '2026-10-10';");
const bootstrap = String.raw`
window.__db={version:1,state:{...structuredClone(DEFAULT),
 contacts:[{id:'c1',type:'customer',name:'Voorbeeld Klant BV',iban:'NL91ABNA0417164300'}],
 invoices:[
  {id:'i14',number:'F2026-014',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-09-20',dueDate:'2026-10-20',lines:[{qty:1,unit:1000,vat:21}],payments:[]},
  {id:'i30',number:'F2026-030',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-09-20',dueDate:'2026-10-20',lines:[{qty:1,unit:100,vat:21}],payments:[]}
 ],expenses:[],transactions:[]}};
getSupabase=async()=>({
 rpc:async(name,args)=>{if(name!=='save_ledger_state')throw new Error('Unexpected RPC');window.__db.state=structuredClone(args.p_state);return {data:++window.__db.version,error:null}},
 from:()=>{const q={select:()=>q,eq:()=>({maybeSingle:async()=>({data:structuredClone(window.__db),error:null}),then:r=>r({data:null,error:null})}),update:()=>q,insert:async()=>({error:null})};return q}
});
currentUser={id:'account-a',email:'a@example.test'};
state=normalizeState(structuredClone(window.__db.state));cloudVersion=1;
setBootstrapVisible(false);setProductUiAuthenticated(true);document.getElementById('authRoot').innerHTML='';document.getElementById('mainApp').style.display='grid';page='bank';render();
`;
const at = original.lastIndexOf('initAuth();');
assert.ok(at >= 0);
const html = original.slice(0, at) + bootstrap + original.slice(at + 'initAuth();'.length);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/assets/') && !pathname.includes('..')) {
    const file = new URL('../dist/app' + pathname, import.meta.url);
    if (fs.existsSync(file)) { res.writeHead(200, { 'content-type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'image/svg+xml' }); return res.end(fs.readFileSync(file)); }
  }
  if (pathname === '/manifest.webmanifest') { res.writeHead(200, { 'content-type': 'application/manifest+json' }); return res.end('{}'); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engine = process.env.BOOKUNA_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const shots = process.env.BANK_IMPORT_SCREENSHOTS || '';
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
const fixture = name => ({ name, mimeType: 'text/csv', buffer: fs.readFileSync(new URL('./fixtures/bank/' + name, import.meta.url)) });

async function run(viewport, label) {
  const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const shot = async name => { if (!shots) return; await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/${engine}-${label}-${name}.png` }); };
  const dialog = page.getByRole('dialog');
  const noHorizontalScroll = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll');
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/app`, { waitUntil: 'domcontentloaded' });
    assert.deepEqual(errors, [], 'Bootstrap browser errors');

    // FLOW 6: valid ING file -> preview -> nothing booked yet -> confirm -> imported.
    await page.setInputFiles('#csvFile', fixture('ing-semicolon.csv'));
    await dialog.getByText('3 transacties gevonden').waitFor();
    assert.equal(await page.evaluate(() => state.transactions.length), 0, 'preview books nothing');
    await noHorizontalScroll(); await shot('1-preview');
    await dialog.getByRole('button', { name: '3 transacties importeren' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => state.transactions.map(t => [t.date, t.amount])), [['2026-10-01', -3.5], ['2026-10-01', -3.5], ['2026-10-02', 1210]]);

    // Duplicate upload: recognised, nothing to import.
    await page.setInputFiles('#csvFile', fixture('ing-semicolon.csv'));
    await dialog.getByText('al eerder geïmporteerd').waitFor();
    assert.equal(await dialog.getByRole('button', { name: /importeren$/ }).count(), 0);
    await shot('2-duplicate');
    await dialog.getByRole('button', { name: 'Annuleren' }).click();

    // FLOW 7: partly invalid file -> problems listed with line numbers, valid rows importable.
    await page.setInputFiles('#csvFile', fixture('messy-partly-invalid.csv'));
    await dialog.getByText('Deze regels worden niet geïmporteerd.').waitFor();
    assert.match(await dialog.innerText(), /Regel 7:[\s\S]*31-02-2026/);
    await noHorizontalScroll(); await shot('3-problems');
    await dialog.getByRole('button', { name: '4 transacties importeren' }).click();
    assert.equal(await page.evaluate(() => state.transactions.length), 7);

    // Unrecognised columns -> mapping -> preview -> import.
    await page.setInputFiles('#csvFile', fixture('unknown-columns.csv'));
    await dialog.getByText('kon de kolommen in dit bestand niet herkennen').waitFor();
    await shot('4-mapping');
    await page.getByLabel('Datum').selectOption('0');
    await page.getByLabel('Bedrag (met min-teken voor uitgaven)').selectOption('2');
    await page.getByLabel('Omschrijving', { exact: true }).selectOption('1');
    await dialog.getByRole('button', { name: 'Controleren' }).click();
    await dialog.getByRole('button', { name: '1 transactie importeren' }).click();
    assert.equal(await page.evaluate(() => state.transactions.at(-1).amount), -45);

    // Unsupported file: clear reason, no stack trace.
    await page.setInputFiles('#csvFile', { name: 'afschrift.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 test') });
    await dialog.getByRole('alert').getByText('Dit is een PDF.').waitFor();
    await shot('5-error');
    await dialog.locator('.modal-foot').getByRole('button', { name: 'Sluiten' }).click();

    // FLOW 8: matching. Invoice number + amount links; amount + name only becomes a suggestion to confirm.
    await page.evaluate(() => { state.transactions.push({ id: 'tx30', date: '2026-10-05', amount: 121, description: 'Voorbeeld Klant BV', counterpartyIban: 'NL91ABNA0417164300', status: 'unmatched' }); render(); });
    await page.getByRole('button', { name: 'Automatisch koppelen' }).click();
    const after = await page.evaluate(() => ({ ing: state.transactions.find(t => t.amount === 1210), t30: state.transactions.find(t => t.id === 'tx30'), i30: state.invoices.find(i => i.id === 'i30').status }));
    assert.equal(after.ing.matchId, 'i14'); assert.equal(after.ing.matchConfidence, 'high');
    assert.equal(after.t30.status, 'unmatched'); assert.equal(after.t30.matchSuggestion.id, 'i30'); assert.equal(after.i30, 'sent', 'suggestion books nothing');
    await page.getByText('Mogelijke koppeling: F2026-030 Voorbeeld Klant BV').filter({ visible: true }).waitFor();
    await shot('6-suggestion');
    const card = label === 'mobile' ? page.locator('.mobile-card-row', { hasText: 'Mogelijke koppeling: F2026-030' }) : page.getByRole('row', { name: /Mogelijke koppeling: F2026-030/ });
    await card.getByRole('button', { name: 'Controleren' }).click();
    assert.equal(await page.getByLabel('Kies boeking').inputValue(), 'invoice:i30');
    await dialog.getByRole('button', { name: 'Koppelen' }).click();
    assert.deepEqual(await page.evaluate(() => [state.transactions.find(t => t.id === 'tx30').matchConfidence, state.invoices.find(i => i.id === 'i30').status]), ['manual', 'paid']);
    assert.deepEqual(errors, [], 'No browser errors during the flows');
  } finally { await page.close(); }
}

try {
  await run({ width: 1280, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
  console.log(`bank import browser (${engine}): ok`);
} finally { await browser.close(); server.close(); }
