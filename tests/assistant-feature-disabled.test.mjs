import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=spawnSync(process.execPath,['scripts/build-app.mjs'],{
  cwd:root,
  encoding:'utf8',
  env:{...process.env,BOEKUNA_ASSISTANT_ENABLED:'false'}
});
assert.equal(run.status,0,'Assistant-disabled app build must succeed:\n'+run.stdout+'\n'+run.stderr);

const dist=path.join(root,'dist','app');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const assets=path.join(dist,'assets');

for(const asset of ['personal-insights.js','personal-assistant-qna.js','personal-insights-ui.js']){
  assert.equal(fs.existsSync(path.join(assets,asset)),false,'Disabled production build must not ship '+asset);
  assert.equal(html.includes('/assets/'+asset),false,'Disabled production build must not load '+asset);
}
assert.ok(fs.existsSync(path.join(assets,'personal-insights.css')),'Shared KPI presentation CSS must remain available');
assert.equal(html.includes('data-page="insights"'),false,'Voor jou navigation must be removed');
assert.equal(html.includes('dashboard-ask-bookuna'),false,'Vraag Boekuna dashboard entry must be removed');
assert.match(html,/async function navigate\(p\)\{\n if\(p==='insights'\)p='dashboard';/,'Direct assistant navigation must fail closed to dashboard');
assert.match(html,/#mainApp \.dashboard-summary-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/,'Two remaining dashboard summary cards must fill the desktop row');

const mobileProduct=fs.readFileSync(path.join(assets,'mobile-product.js'),'utf8');
const mobilePolish=fs.readFileSync(path.join(assets,'mobile-polish-round-2.js'),'utf8');
assert.equal(mobileProduct.includes('Assistent & inzichten'),false,'Mobile settings must not expose assistant navigation');
assert.equal(mobileProduct.includes('Persoonlijke tips en samenvattingen'),false,'Mobile settings must not expose assistant copy');
assert.equal(mobilePolish.includes('+renderAssistantSettingsSafe()'),false,'Mobile settings must not inject assistant settings');

console.log('Assistant-disabled production build contract: PASS');
