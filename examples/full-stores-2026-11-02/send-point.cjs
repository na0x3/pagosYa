// Point-at live check 2026-11-05: one chat message with a selection or viewing, like the Studio sends it.
//   node send-point.cjs <key> '<json extra>' <words…>
const { randomUUID } = require('node:crypto'); const fs = require('node:fs');
const D = __dirname; const live = JSON.parse(fs.readFileSync(D + '/live.json', 'utf8'));
const key = process.argv[2]; const extra = JSON.parse(process.argv[3]); const rec = JSON.parse(fs.readFileSync(`${D}/${key}/demo.json`, 'utf8'));
(async () => {
  const h = { authorization: `Bearer ${live.token}`, 'content-type': 'application/json' };
  const cur = await (await fetch(`http://127.0.0.1:3001/v1/stores/${rec.storeId}/source-project`, { headers: h })).json();
  const revision = cur.revision ?? cur.project?.revision ?? 0;
  const body = { revision, instruction: process.argv.slice(4).join(' '), requestId: randomUUID(), currentPage: 'index.html', ...extra };
  const res = await fetch(`http://127.0.0.1:3001/v1/stores/${rec.storeId}/source-project/chat-jobs`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  console.log(key, 'rev', revision, res.status, (await res.text()).slice(0, 200));
})();
