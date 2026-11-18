// node prepare.cjs <round> [keys…]: each brand's catalogue cloned into a fresh store «<Name> · <round>» (scripts/clone-store-catalog.ts
// writes examples/cmp-<round>-<key>/demo.json) and its first-message photos uploaded again for that store.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { API, API_DIR, KEYS, NAMES, brands, demoPath, live } = require('./common.cjs');

const [round, ...asked] = process.argv.slice(2);
if (!round) { console.error('usage: node prepare.cjs <round> [keys…]'); process.exit(1); }
(async () => {
  const all = brands(); const { token } = live();
  for (const key of asked.length ? asked : KEYS) {
    const first = all[key];
    const out = execFileSync(process.execPath, ['node_modules/ts-node/dist/bin.js', '--transpile-only', 'scripts/clone-store-catalog.ts', '--from', first.storeId, '--record', `cmp-${round}-${key}`, '--name', `${NAMES[key]} · ${round}`],
      { cwd: API_DIR, encoding: 'utf8' });
    console.log(out.trim().split('\n').pop());
    const file = demoPath(round, key); const demo = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!demo.assetUrls) {
      demo.assetUrls = [];
      for (const url of first.assetUrls ?? []) {
        const res = await fetch(`${API}${url}`); if (!res.ok) { console.log('skip', url, res.status); continue; }
        const body = new FormData(); body.append('file', await res.blob(), url.split('/').pop());
        const up = await fetch(`${API}/v1/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
        const json = await up.json().catch(() => ({})); if (!up.ok) { console.log('upload failed', up.status, JSON.stringify(json).slice(0, 200)); continue; }
        demo.assetUrls.push(json.url);
      }
      fs.writeFileSync(file, JSON.stringify(demo, null, 2) + '\n');
    }
    console.log(key, round, demo.storeId, demo.slug, 'photos', demo.assetUrls.length);
  }
})().catch(error => { console.error(error.message); process.exit(1); });
