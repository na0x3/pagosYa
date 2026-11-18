// node drive.cjs <round> [keys…]: each brand's first message (with its photos) through chat-jobs as the Studio sends it, YAPI's intake
// questions answered like a merchant, until the store is idle. One JSON line per store in examples/brand-bench/<round>/drive.jsonl.
// Several drivers may run side by side (waves of 4 + 3); each store is its own job.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { API, KEYS, brands, demo, live, prisma, roundDir } = require('./common.cjs');

const [round, ...asked] = process.argv.slice(2);
if (!round) { console.error('usage: node drive.cjs <round> [keys…]'); process.exit(1); }
const answer = q => /a quién|quién/i.test(q) ? 'A la gente de mi ciudad que ya compra lo que vendo; usa lo que dice mi primer mensaje.'
  : /estilo/i.test(q) ? 'El que va con mi marca y mis fotos.'
  : /incluir|qué quieres/i.test(q) ? 'El catálogo con filtros, envío a domicilio y el código de descuento si está en mi mensaje.'
  : 'Usa el catálogo tal como está, sin datos extra. Arma la tienda ya.';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function send(key, store, reply) {
  const headers = { authorization: `Bearer ${live().token}`, 'content-type': 'application/json' };
  const current = await (await fetch(`${API}/v1/stores/${store.storeId}/source-project`, { headers })).json();
  const first = brands()[key];
  const body = { revision: current.revision ?? current.project?.revision ?? 0, instruction: reply ?? first.instruction, requestId: randomUUID(), setupAction: 'generate',
    ...(!reply && store.assetUrls?.length ? { assetUrls: store.assetUrls } : {}), ...(process.env.MODEL ? { model: process.env.MODEL } : {}) };
  const res = await fetch(`${API}/v1/stores/${store.storeId}/source-project/chat-jobs`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(key, round, 'rev', body.revision, res.status, text.slice(0, 120));
  if (res.status === 401) throw new Error('session expired: run node session.cjs');
  if (!res.ok) throw new Error(`chat-jobs ${res.status}`);
}

(async () => {
  const db = prisma();
  const out = path.join(roundDir(round), 'drive.jsonl');
  for (const key of asked.length ? asked : KEYS) {
    const store = demo(round, key);
    const t0 = Date.now(); let answers = 0, idle = 0, error = '';
    try {
      await send(key, store);
      while (Date.now() - t0 < 40 * 60e3) {
        await sleep(10e3);
        const job = await db.storeSourceChatJob.findFirst({ where: { storeId: store.storeId }, orderBy: { createdAt: 'desc' }, select: { status: true, result: true } });
        if (!job) continue;
        if (['QUEUED', 'RUNNING'].includes(job.status)) { idle = 0; continue; }
        const q = job.result?.assistantMessage?.content ?? '';
        if (job.status === 'AWAITING_INPUT' && answers < 6) { answers++; console.log(key, 'Q:', q.replace(/\s+/g, ' ').slice(0, 140)); await send(key, store, answer(q)); idle = 0; continue; }
        if (++idle >= 2) break;
      }
    } catch (e) { error = String(e.message ?? e).slice(0, 200); }
    const versions = await db.storeSourceVersion.findMany({ where: { storeId: store.storeId }, orderBy: { revision: 'asc' }, select: { revision: true, label: true } });
    const last = await db.storeSourceChatJob.findFirst({ where: { storeId: store.storeId }, orderBy: { createdAt: 'desc' }, select: { status: true, error: true } });
    const line = { key, storeId: store.storeId, minutes: Number(((Date.now() - t0) / 60e3).toFixed(1)), status: error ? 'DRIVER_FAILED' : last?.status ?? 'NONE',
      error: error || (last?.error ?? '').slice(0, 200), answers, versions, at: new Date().toISOString() };
    fs.appendFileSync(out, JSON.stringify(line) + '\n');
    console.log(key, 'done', line.minutes, 'min |', versions.map(v => `${v.revision}:${v.label}`).join(' | '), '|', line.status, line.error);
  }
  await db.$disconnect();
})().catch(error => { console.error(error.message); process.exit(1); });
