// node scripts/starter-ab.mjs <A|B> — builds the five comparison stores for one path (spec 2026-10-24-starter-dice §3).
// Path A needs YAPI_STARTERS=on, path B YAPI_STARTERS=off in apps/api/.env, each with the API restarted first.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const path = process.argv[2];
if (!['A', 'B'].includes(path)) throw new Error('usage: starter-ab.mjs <A|B>');
const base = 'http://localhost:3001', root = join(import.meta.dirname, '../../../examples/starter-ab');
const BUSINESSES = [
  { key: 'boxy', from: 'BOXY', name: 'BOXY', brief: 'Crea la tienda de BOXY, nuestra marca de ropa urbana minimalista: poleras, polerones y gorras en blanco y negro, cortes amplios.' },
  { key: 'lana', from: 'BOXY', name: 'Lana Norte', brief: 'Crea la tienda de Lana Norte: prendas de autor hechas a mano en La Paz, cortes amplios en algodón y lana, piezas únicas.' },
  { key: 'peppa', from: 'PEPPA please', name: 'PEPPA please', brief: 'Crea la tienda de PEPPA please: salsas picantes artesanales hechas en pequeñas tandas, una marca alegre y atrevida.' },
  { key: 'baek', from: 'BAEK Korean Bakehouse', name: 'BAEK Korean Bakehouse', brief: 'Crea la tienda de BAEK Korean Bakehouse: panadería coreana de masa madre, croissants y cajas para cafeterías.' },
  { key: 'maestros', from: 'Atelier Maestros', name: 'Atelier Maestros', brief: 'Crea la tienda de Atelier Maestros: pinturas originales de artistas bolivianos, retratos y paisajes para coleccionistas.' },
];
mkdirSync(root, { recursive: true });
const stateFile = join(root, 'state.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { A: {}, B: {} };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
const login = await fetch(`${base}/v1/dashboard/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo-aggregator@pagosya.bo', password: 'pagosYaDev123!' }) });
const h = { authorization: `Bearer ${(await login.json()).token}`, 'content-type': 'application/json' };
const api = (p, init = {}) => fetch(`${base}/v1/stores/${p}`, { headers: h, ...init }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitJob(storeId, id) {
  // A transient error answer (no status) is not the end of the job: keep polling.
  for (;;) { await sleep(8000); const job = await api(`${storeId}/source-project/chat-jobs/${id}`).catch(() => null); if (job?.status && !['QUEUED', 'RUNNING'].includes(job.status)) return job; }
}
async function cancelFollowUps(storeId) {
  await sleep(4000);
  // The latest-job endpoint answers { job }; the follow-up is queued as soon as the first build's job closes.
  for (let tries = 0; tries < 5; tries++) {
    const { job } = await api(`${storeId}/source-project/chat-jobs`);
    if (job?.id && ['QUEUED', 'RUNNING'].includes(job.status)) { await api(`${storeId}/source-project/chat-jobs/${job.id}/cancel`, { method: 'POST' }); return; }
    await sleep(2000);
  }
}
for (const b of BUSINESSES) {
  if (state[path][b.key]) continue;
  const record = `starter-ab-${path}-${b.key}`;
  const out = spawnSync('npx', ['ts-node', '--transpile-only', 'scripts/clone-store-catalog.ts', '--from', b.from, '--record', record, '--name', `${b.name} · ${path}`], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' });
  if (out.status !== 0) throw new Error(out.stderr.slice(-800));
  const { storeId } = JSON.parse(readFileSync(join(import.meta.dirname, '../../../examples', record, 'demo.json'), 'utf8'));
  const send = body => api(`${storeId}/source-project/chat-jobs`, { method: 'POST', body: JSON.stringify({ model: 'auto', motion: 'auto', scrollFeel: 'soft', sitePurpose: 'shop', setupStep: 'conversation', maxCredits: 200, currentPage: 'index.html', revision: 0, assetUrls: [], requestId: randomUUID(), ...body }) });
  // A rerun picks up where the last one stopped: a build still running is waited for, a store with a version is not rebuilt.
  const { job: active } = await api(`${storeId}/source-project/chat-jobs`);
  const built = (await api(`${storeId}/source-project`)).revision > 0;
  let job = !built && active && ['QUEUED', 'RUNNING'].includes(active.status) ? await waitJob(storeId, active.id) : null;
  if (!job && !built) job = await waitJob(storeId, (await send({ instruction: b.brief })).id);
  if (!(await api(`${storeId}/source-project`)).revision) {
    // Path B: the plan card waits for «Construir».
    const conversation = await api(`${storeId}/source-project/conversation`);
    const card = [...(conversation.messages ?? [])].reverse().find(m => m.role === 'ASSISTANT' && m.metadata?.plan);
    if (!card) throw new Error(`${b.key}: no revision and no plan card (${job?.status} ${job?.error ?? ''})`);
    job = await waitJob(storeId, (await send({ instruction: 'Construir', planId: card.id })).id);
  }
  await cancelFollowUps(storeId);
  const project = await api(`${storeId}/source-project`);
  const first = project.versions.find(v => v.revision === 1);
  state[path][b.key] = { storeId, revision: 1, label: first?.label ?? '?' };
  save();
  console.log(path, b.key, storeId, first?.label);
}
