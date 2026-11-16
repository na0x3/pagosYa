// node quality-bench.cjs key:storeId … — spec 2026-11-16 store quality, Part 4: rebuild each store one after another and print one
// table: minutes, dollars, attempts, the rules behind the retries, pictures on the desktop home. Dev only.
const { API, live } = require('./common.cjs');
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const rows = [];
  for (const job of process.argv.slice(2)) {
    const [key, id] = job.split(':');
    const url = `${API}/v1/stores/${id}/source-project/v2-prototype`;
    const headers = { authorization: `Bearer ${live().token}`, 'content-type': 'application/json' };
    const started = Date.now();
    const res = await fetch(url, { method: 'POST', headers, body: '{}' });
    if (!res.ok) { rows.push({ key, status: `start ${res.status}` }); console.log(JSON.stringify(rows[rows.length - 1])); continue; }
    let state;
    for (;;) { await sleep(20_000); state = await fetch(url, { headers }).then(r => r.json()).catch(() => null); if (state && state.status !== 'RUNNING') break; }
    const rules = {};
    for (const inspection of state.inspections ?? []) for (const rule of inspection.rules) rules[rule] = (rules[rule] ?? 0) + 1;
    let pictures = null;
    if (state.revision) {
      const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://r${state.revision}-${id}.localhost:4330/`, { waitUntil: 'networkidle' });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 500) { await page.evaluate(t => window.scrollTo(0, t), y); await page.waitForTimeout(80); }
      pictures = await page.evaluate(() => new Set([...document.querySelectorAll('main img')].filter(i => i.naturalWidth > 200).map(i => i.currentSrc)).size);
      await browser.close();
    }
    const row = { key, status: state.status, revision: state.revision, minutes: +((Date.now() - started) / 60000).toFixed(1), usd: +(state.usd ?? 0).toFixed(2),
      attempts: (state.attempts ?? []).map(a => a.outcome).join(','), pictures,
      stages: (state.stages ?? []).map(s => `${s.stage}:${Math.round(s.ms / 1000)}s`).join(' '), rules, error: state.error };
    rows.push(row); console.log(JSON.stringify(row));
  }
  console.table(rows.map(({ rules, stages, error, ...row }) => row));
})();
