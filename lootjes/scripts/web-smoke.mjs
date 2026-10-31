#!/usr/bin/env node
// Real browser check of the web page people without the app use: join via code link,
// get drawn, scratch the lootje open, wishlist + anonymous question. Saves screenshots.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const API = process.env.LOOTJES_API || 'https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/lootjes';
const WEB = process.env.LOOTJES_WEB || 'https://lootjes-zichtwerf.vercel.app';
const OUT = process.env.SHOTS || 'build/web-shots';
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (c, m) => { if (c) console.log(`ok   ${m}`); else { failures++; console.log(`::error title=Web smoke::${m}`); } };
const call = async (action, p = {}) => {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...p }) });
  const j = await r.json(); if (!r.ok) throw new Error(`${action} ${JSON.stringify(j)}`); return j;
};

const g = await call('createGroup', { name: 'Familie Jansen', occasion: 'sinterklaas', eventDate: '2026-12-05', budgetCents: 2500,
  note: 'We vieren het bij oma!', organizerName: 'Kwin', members: ['Sanne', 'Daan', 'Oma Riet'] });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], locale: 'nl-NL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${WEB}/j/${g.group.joinCode}`);
  await page.getByText('Familie Jansen').first().waitFor();
  await page.screenshot({ path: `${OUT}/web-join.png` });
  await page.fill('#nm', 'Lotte');
  await page.click('#go');
  await page.getByText('Je doet mee').waitFor();
  ok(page.url().includes('/m/'), 'join leads to a personal page');
  await page.fill('#wish', 'Een mooie sjaal\nhttps://example.com/sjaal');
  await page.click('#saveWish');
  await page.getByText('Opgeslagen').waitFor();
  await page.screenshot({ path: `${OUT}/web-waiting.png` });

  await call('draw', { adminToken: g.adminToken });
  await page.reload();
  await page.locator('#reveal').waitFor();
  await page.screenshot({ path: `${OUT}/web-scratch.png` });
  await page.click('#reveal');
  await page.getByText('Jij koopt een cadeau voor').waitFor({ timeout: 8000 });
  ok(true, 'tapping reveal shows the lootje');
  await page.fill('#in_myLootje', 'Welke kleur vind je mooi?');
  await page.click('[data-thread="myLootje"]');
  await page.locator('#msgs_myLootje .bubble.me').waitFor();
  ok(true, 'anonymous question sent');
  await page.screenshot({ path: `${OUT}/web-lootje.png`, fullPage: true });

  // The receiver's wishlist and the giver relation are consistent with the API.
  const me = await call('me', { token: page.url().split('/m/')[1] });
  ok(await page.locator('.name').first().textContent() === me.receiver.name, 'page shows the same lootje as the API');
  await page.goto(`${WEB}/privacy`);
  await page.getByText('Wat we niet doen').waitFor();
  ok(true, 'privacy page renders');
  ok(errors.length === 0, `no JavaScript errors (${errors.join('; ')})`);
} catch (e) {
  failures++; console.log(`::error title=Web smoke::${e.message.split('\n')[0]}`);
  await page.screenshot({ path: `${OUT}/web-failure.png` }).catch(() => {});
} finally {
  await browser.close();
  await call('deleteGroup', { adminToken: g.adminToken }).catch(() => {});
}
console.log(failures ? `${failures} failed` : 'web checks passed');
process.exit(failures ? 1 : 0);
