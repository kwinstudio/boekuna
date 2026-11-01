#!/usr/bin/env node
// Turns raw simulator screenshots into App Store screenshots: headline + framed screen on a festive background.
//   node compose.mjs <shotsDir> <outDir>
// Output: <outDir>/<locale>/iphone-01.png (1320x2868) and ipad-01.png (2064x2752).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [shots, out] = process.argv.slice(2);
const listing = JSON.parse(fs.readFileSync(new URL('./listing.json', import.meta.url)));
const sizes = { iphone: [1320, 2868], ipad: [2064, 2752] };
const locales = { 'nl-NL': 'nl', 'en-US': 'en' };

const html = (img, [title, sub], [w, h], kind) => {
  const pad = Math.round(w * 0.07);
  const shotW = kind === 'iphone' ? Math.round(w * 0.80) : Math.round(w * 0.78);
  const radius = kind === 'iphone' ? Math.round(shotW * 0.11) : Math.round(shotW * 0.035);
  const stars = Array.from({ length: 34 }, (_, i) => {
    const x = (i * 137.5) % 100, y = (i * 61.3) % 30, s = 4 + (i % 4) * 3, o = 0.25 + (i % 5) * 0.12;
    return `<div class="star" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;opacity:${o}"></div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:${w}px;height:${h}px;overflow:hidden;font-family:-apple-system,"SF Pro Display","Inter","Helvetica Neue",Arial,sans-serif;
    background:radial-gradient(120% 70% at 50% 0%,#C8282E 0%,#9E1B22 45%,#6E1016 100%);color:#fff;position:relative}
  .star{position:absolute;border-radius:50%;background:#FFD98A;box-shadow:0 0 12px #FFD98A}
  .text{position:absolute;top:${Math.round(h * 0.055)}px;left:${pad}px;right:${pad}px;text-align:center}
  h1{font-size:${Math.round(w * 0.072)}px;font-weight:800;letter-spacing:-0.02em;line-height:1.08}
  p{margin-top:${Math.round(w * 0.022)}px;font-size:${Math.round(w * 0.037)}px;font-weight:500;opacity:.88;line-height:1.25}
  .shot{position:absolute;left:50%;transform:translateX(-50%);bottom:-${Math.round(h * 0.05)}px;width:${shotW}px;
    border-radius:${radius}px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.45),0 0 0 ${Math.round(w * 0.012)}px #1b1b1d}
  .shot img{display:block;width:100%}
  </style></head><body>${stars}<div class="text"><h1>${title}</h1><p>${sub}</p></div>
  <div class="shot"><img src="data:image/png;base64,${fs.readFileSync(img).toString('base64')}"></div></body></html>`;
};

const browser = await chromium.launch();
let made = 0;
for (const [locale, key] of Object.entries(locales)) {
  for (const [kind, size] of Object.entries(sizes)) {
    const dir = path.join(out, locale);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const s of listing.screenshots) {
      const file = path.join(shots, kind === 'iphone' ? s.src : s.ipad);
      if (!fs.existsSync(file)) { console.log(`skip ${kind} ${file}`); continue; }
      const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
      await page.setContent(html(file, s[key], size, kind), { waitUntil: 'load' });
      n++;
      await page.screenshot({ path: path.join(dir, `${kind}-${String(n).padStart(2, '0')}.png`) });
      await page.close();
      made++;
    }
  }
}
await browser.close();
console.log(`composed ${made} screenshots`);
