// node scripts/starter-ab-shots.mjs — A vs B home captures (desktop + phone) and examples/starter-ab/index.html.
// Uses the Studio's browser view with API forwarding, as checked live on 2026-10-24.
import { chromium } from '../../../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = join(import.meta.dirname, '../../../examples/starter-ab');
const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
const login = await fetch('http://localhost:3001/v1/dashboard/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo-aggregator@pagosya.bo', password: 'pagosYaDev123!' }) });
const { token } = await login.json();
const browser = await chromium.launch();
async function shot(storeId, revision, width, file) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('**/api/v1/**', async route => { const url = route.request().url().replace(/^https?:\/\/[^/]+\/api\/v1/, 'http://localhost:3001/v1'); await route.fulfill({ response: await route.fetch({ url }) }); });
  await page.addInitScript(t => sessionStorage.setItem('pagosya_merchant_session', t), token);
  await page.goto(`http://127.0.0.1:4323/studio/?source=1&browser=1&store=${storeId}&revision=${revision}&page=index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(root, file), fullPage: true, clip: { x: 0, y: 0, width, height: width > 600 ? 1600 : 1900 } });
  await page.close();
}
const keys = Object.keys(state.A);
for (const key of keys) for (const path of ['A', 'B']) {
  const s = state[path][key]; if (!s) continue;
  await shot(s.storeId, s.revision, 1280, `${key}-${path}.png`);
  await shot(s.storeId, s.revision, 390, `${key}-${path}-phone.png`);
}
await browser.close();
const row = key => `<section><h2>${key}</h2><div class="pair">${['A', 'B'].map(p => `<figure><figcaption>${p === 'A' ? 'A · estilos con dados' : 'B · Esencial al azar'} — ${state[p][key]?.label ?? ''}</figcaption><img src="${key}-${p}.png"><img src="${key}-${p}-phone.png"></figure>`).join('')}</div></section>`;
writeFileSync(join(root, 'index.html'), `<!doctype html><meta charset="utf-8"><title>A vs B</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f2}section{margin-bottom:48px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0;display:grid;grid-template-columns:3fr 1fr;gap:8px;align-items:start}figcaption{grid-column:1/-1;font-weight:600}img{width:100%;border:1px solid #ddd;background:#fff}</style>${keys.map(row).join('')}`);
console.log('open', join(root, 'index.html'));
