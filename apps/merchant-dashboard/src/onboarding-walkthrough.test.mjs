import test from 'node:test';
import assert from 'node:assert/strict';
import { WALKTHROUGH_STEPS, nextState, productDrafts, runWalkthrough, walkthroughView } from './onboarding-walkthrough.mjs';

const start = { step: 0, values: {}, storeId: null, busy: false, error: null };

test('seven steps, only the first two required', () => {
  assert.deepEqual(WALKTHROUGH_STEPS.map(s => s.id), ['name', 'what', 'logo', 'photos', 'products', 'story', 'contact']);
  assert.deepEqual(WALKTHROUGH_STEPS.filter(s => !s.optional).map(s => s.id), ['name', 'what']);
});

test('cannot advance a required step while empty; optional steps can be skipped', () => {
  assert.equal(nextState(start, { type: 'next' }).error, 'Escribe el nombre de tu negocio.');
  const named = nextState(nextState(start, { type: 'field', name: 'name', value: 'Café Buna' }), { type: 'next' });
  assert.equal(named.step, 1);
  assert.equal(nextState({ ...named, step: 2 }, { type: 'skip' }).step, 3);
  assert.equal(nextState(start, { type: 'skip' }).step, 0);
  assert.equal(nextState(named, { type: 'back' }).step, 0);
});

test('one question per screen with progress, Atrás, Siguiente and Saltar only when optional', () => {
  const html = walkthroughView({ ...start, step: 2, values: { name: 'Café Buna' } });
  assert.match(html, /aria-valuenow="3"/);
  assert.match(html, /Saltar/);
  assert.match(html, /No tengo, YAPI te hace uno/);
  assert.doesNotMatch(walkthroughView(start), /Saltar/);
  assert.match(walkthroughView(start), /¿Vienes de Shopify\?/);
  assert.match(walkthroughView({ ...start, step: 6 }), /Crear mi tienda/);
  assert.doesNotMatch(walkthroughView({ ...start, values: { name: '"><img src=x>' } }), /<img src=x>/);
});

test('product rows become centavos and incomplete rows are dropped', () => {
  assert.deepEqual(productDrafts([{ name: 'Café molido', price: 'Bs 45' }, { name: 'Taza', price: '35,50', imageUrl: '/v1/uploads/t.webp' }, { name: '', price: '10' }, { name: 'Sin precio', price: '' }]),
    [{ name: 'Café molido', amount: 4500, imageUrls: [] }, { name: 'Taza', amount: 3550, imageUrls: ['/v1/uploads/t.webp'] }]);
  assert.equal(productDrafts(Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, price: '1' }))).length, 5);
  assert.deepEqual(productDrafts([{ name: 'Mil', price: '1.200' }]), [{ name: 'Mil', amount: 120000, imageUrls: [] }]);
});

// A fake root and api: drives runWalkthrough without a DOM.
async function drive(step, { fail = () => false } = {}) {
  const handlers = {}; const calls = []; let done = null;
  const root = { innerHTML: '', querySelector: () => null, addEventListener: (type, fn) => { handlers[type] = fn; } };
  const api = async (path, init = {}) => {
    const call = { path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    if (fail(call)) throw new Error('boom');
    calls.push(call);
    if (path === '/stores/onboarding') return { store: { id: 's1', name: 'Buna', onboarding: { step } } };
    if (path.endsWith('/payment_links')) return { id: `p${calls.length}` };
    if (call.body?.brief) return { brief: 'BRIEF' };
    return {};
  };
  await runWalkthrough(root, { api, uploadFile: async () => '/v1/uploads/x.webp', onDone: id => { done = id; } });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  return {
    calls, root, done: () => done,
    type: async (name, value) => handlers.input({ target: { name, type: 'text', value } }),
    submit: async () => { handlers.submit({ preventDefault() {} }); await tick(); await tick(); },
    back: async () => { handlers.click({ target: { closest: sel => (sel === '[data-wt-back]' ? {} : null) } }); },
  };
}
const posts = (calls, suffix) => calls.filter(c => c.method === 'POST' && c.path.endsWith(suffix));

test('products are created once, across Atrás/Siguiente and after a partial failure', async () => {
  const w = await drive(4);
  await w.type('p0-name', 'Café'); await w.type('p0-price', '45'); await w.type('p1-name', 'Taza'); await w.type('p1-price', '30');
  await w.submit(); await w.back(); await w.submit();
  assert.equal(posts(w.calls, '/payment_links').length, 2);
  await w.back(); await w.type('p1-price', '35'); await w.submit();
  assert.equal(posts(w.calls, '/payment_links').length, 3);

  let failRow2 = true;
  const f = await drive(4, { fail: c => failRow2 && c.body?.name === 'Taza' });
  await f.type('p0-name', 'Café'); await f.type('p0-price', '45'); await f.type('p1-name', 'Taza'); await f.type('p1-price', '30');
  await f.submit();
  assert.match(f.root.innerHTML, /No pudimos guardar/);
  failRow2 = false; await f.submit();
  assert.deepEqual(posts(f.calls, '/payment_links').map(c => c.body.name), ['Café', 'Taza']);
});

test('the chat job is posted before the store is finished, with one requestId across retries', async () => {
  let failJob = true;
  const w = await drive(6, { fail: c => failJob && c.path.endsWith('/chat-jobs') });
  await w.type('whatsapp', '+59170000000');
  await w.submit();
  assert.equal(w.calls.some(c => c.body?.finished), false);
  failJob = false; await w.submit();
  const order = w.calls.filter(c => c.method !== 'GET').map(c => (c.path.endsWith('/chat-jobs') ? 'job' : c.body?.finished ? 'finished' : c.body?.brief ? 'brief' : 'other'));
  assert.deepEqual(order.filter(x => x !== 'other'), ['brief', 'brief', 'job', 'finished']);
  const job = posts(w.calls, '/chat-jobs')[0].body;
  assert.equal(job.instruction, 'BRIEF');
  assert.ok(job.requestId);
  assert.equal(w.done(), 's1');
});

test('a failing finish PATCH is retried alone and never re-posts the job', async () => {
  let failFinish = true;
  const w = await drive(6, { fail: c => failFinish && c.body?.finished });
  await w.submit();
  assert.match(w.root.innerHTML, /No pudimos guardar/);
  assert.equal(w.done(), null);
  failFinish = false; await w.submit();
  assert.equal(posts(w.calls, '/chat-jobs').length, 1);
  assert.equal(w.done(), 's1');
});
