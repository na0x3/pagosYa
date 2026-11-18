// Runs requests.cjs against one store through the chat-jobs API (like the Studio), one at a time; after each, reads the store and
// records path, time, reply, revision and the check. node sweep.cjs <storeId> [fromId]   → results.jsonl + a summary.
const { PrismaClient } = require('/Users/saramia/pagosYa/apps/api/node_modules/@prisma/client');
const { readMasterState } = require('/Users/saramia/pagosYa/apps/api/dist/src/storefront-source/source-templates.js');
const { readStoreMenu } = require('/Users/saramia/pagosYa/apps/api/dist/src/storefront-source/source-store-menu.js');
const { randomUUID } = require('node:crypto'); const fs = require('node:fs'); const { execFileSync } = require('node:child_process');
const p = new PrismaClient(); const [storeId, fromId] = process.argv.slice(2);
const FULL = '/Users/saramia/pagosYa/examples/full-stores-2026-11-02'; const TRACE = '/Users/saramia/pagosYa/.superpowers/yapi-trace.jsonl';
const token = () => JSON.parse(fs.readFileSync(`${FULL}/live.json`, 'utf8')).token;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function state() {
  const v = await p.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } });
  const files = v.snapshot.files; const m = readMasterState(files);
  const cats = await p.category.findMany({ where: { storeId }, select: { id: true, name: true } });
  const products = (await p.paymentLink.findMany({ where: { storeId }, select: { name: true, amount: true, stock: true, status: true, categoryId: true, variants: true } }))
    .map(x => ({ ...x, category: x.categoryId ? cats.find(c => c.id === x.categoryId)?.name ?? '?' : null }));
  const codes = await p.promoCode.findMany({ where: { storeId }, select: { code: true, discountValue: true, isActive: true } });
  const store = await p.store.findUnique({ where: { id: storeId }, select: { contactPhone: true, policies: true } });
  const retention = (await p.storeRetention.findUnique({ where: { storeId }, select: { settings: true } }))?.settings ?? {};
  return { revision: v.revision, layout: m.layout ?? [], pageLayouts: m.pageLayouts ?? {}, extraPages: m.extraPages ?? [], copy: m.copy ?? {}, look: m.look ?? {}, variants: m.variants ?? {},
    theme: String(m.variants?.theme ?? ''), menu: readStoreMenu(files), categories: cats.map(c => c.name), products, codes, store, retention,
    product: name => products.find(x => x.name.toLowerCase().startsWith(name.toLowerCase())), code: c => codes.find(x => x.code === c) };
}

async function send(instruction) {
  const h = { authorization: `Bearer ${token()}`, 'content-type': 'application/json' };
  const v = await p.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { revision: true } });
  let res = await fetch(`http://127.0.0.1:3001/v1/stores/${storeId}/source-project/chat-jobs`, { method: 'POST', headers: h, body: JSON.stringify({ revision: v.revision, instruction, requestId: randomUUID() }) });
  if (res.status === 401) { execFileSync('node', [`${FULL}/new-session.cjs`]); return send(instruction); }
  if (res.status === 429) { await wait(30e3); return send(instruction); }
  return res.status;
}

async function idle(since) {
  const start = Date.now(); let quiet = 0;
  while (Date.now() - start < 30 * 60e3) {
    const busy = await p.storeSourceChatJob.count({ where: { storeId, createdAt: { gte: since }, status: { in: ['QUEUED', 'RUNNING'] } } });
    quiet = busy ? 0 : quiet + 1; if (quiet >= 2) break; await wait(5e3);
  }
  return Math.round((Date.now() - start) / 1000);
}

(async () => {
  const requests = require(process.env.REQUESTS || './requests.cjs'); let started = !fromId;
  for (const r of requests) {
    if (!started) { if (r.id === fromId) started = true; else continue; }
    const before = await state(); const since = new Date(); const traced = fs.existsSync(TRACE) ? fs.readFileSync(TRACE, 'utf8').split('\n').length : 0;
    const status = await send(r.say); const seconds = await idle(since); const after = await state();
    const thread = await p.storeAgentThread.findMany({ where: { storeId }, select: { id: true } });
    const reply = (await p.storeAgentMessage.findMany({ where: { threadId: { in: thread.map(t => t.id) }, role: 'ASSISTANT', createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } })).map(m => m.content.replace(/\s+/g, ' ')).join(' / ');
    const jobs = await p.storeSourceChatJob.findMany({ where: { storeId, createdAt: { gte: since } }, select: { status: true, progress: true } });
    const stages = [...new Set(jobs.flatMap(j => (j.progress?.steps ?? []).map(s => s.stage)))];
    const trace = fs.existsSync(TRACE) ? fs.readFileSync(TRACE, 'utf8').split('\n').slice(traced - 1).filter(Boolean).map(l => JSON.parse(l)).filter(l => l.storeId === storeId).map(l => l.outcome + (l.rest ? ` rest=«${l.rest.slice(0, 80)}»` : '')) : [];
    let ok; try { ok = Boolean(r.check(after, before)); } catch (e) { ok = false; }
    if (r.expectReply && !r.expectReply.test(reply)) ok = false;
    const slowPath = stages.includes('building');
    const row = { id: r.id, say: r.say, ok, seconds, revision: `${before.revision}→${after.revision}`, slowPath, status, trace, jobs: jobs.map(j => j.status), reply: reply.slice(0, 400) };
    fs.appendFileSync(`${__dirname}/results.jsonl`, JSON.stringify(row) + '\n');
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(16)} ${String(seconds).padStart(4)}s ${slowPath ? 'SLOW(generator)' : 'quick'} ${row.revision} | ${trace.join(' ; ')} | ${reply.slice(0, 160)}`);
  }
  await p.$disconnect();
})();
