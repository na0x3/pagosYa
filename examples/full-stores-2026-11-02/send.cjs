// Full stores 2026-11-02: one chat message to a store (first build or a follow-up) through the chat-jobs API, like the Studio.
//   node send.cjs <key> --first      (the words in <key>/first.txt, with the store's photos)
//   node send.cjs <key> <words…>
const { randomUUID } = require('node:crypto'); const fs = require('node:fs');
const D = __dirname; const live = JSON.parse(fs.readFileSync(process.env.LIVE || (D + '/live.json'), 'utf8'));  // LIVE=live-p2.json: the pruebas2 user (2026-11-04)
const key = process.argv[2]; const rec = JSON.parse(fs.readFileSync(`${D}/${key}/demo.json`, 'utf8'));
(async () => {
  const h = { authorization: `Bearer ${live.token}`, 'content-type': 'application/json' };
  const cur = await (await fetch(`http://127.0.0.1:3001/v1/stores/${rec.storeId}/source-project`, { headers: h })).json();
  const revision = cur.revision ?? cur.project?.revision ?? 0;
  const first = process.argv[3] === '--first';
  const instruction = first ? fs.readFileSync(`${D}/${key}/first.txt`, 'utf8').trim() : process.argv.slice(3).join(' ');
  const body = { revision, instruction, requestId: randomUUID(), ...(first ? { setupAction: 'generate', assetUrls: Object.values(rec.photos).filter(Boolean).slice(0, 24) } : {}) };
  const res = await fetch(`http://127.0.0.1:3001/v1/stores/${rec.storeId}/source-project/chat-jobs`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  console.log(key, 'rev', revision, res.status, (await res.text()).slice(0, 160));
})();
