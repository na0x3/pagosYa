import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WALKTHROUGH_STEPS, isUnfinishedStore, showWalkthroughChoice, walkthroughChoiceView, nextState, productDrafts, runWalkthrough, walkthroughEntry, walkthroughView } from './onboarding-walkthrough.mjs';

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
async function drive(step, { fail = () => false, uploadFail = () => false } = {}) {
  const handlers = {}; const calls = []; const uploads = []; let done = null;
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
  const uploadFile = async file => { if (uploadFail(file)) throw new Error('upload'); uploads.push(file.name); return `/v1/uploads/${file.name}`; };
  await runWalkthrough(root, { api, uploadFile, onDone: id => { done = id; } });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  return {
    calls, root, uploads, done: () => done,
    drop: (type, files) => { const event = { prevented: false, preventDefault() { event.prevented = true; }, dataTransfer: { files } }; handlers[type](event); return event; },
    pick: (name, files) => handlers.change({ target: { name, type: 'file', files } }),
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
  // An edited row updates the product it already created, never a second one.
  assert.equal(posts(w.calls, '/payment_links').length, 2);
  const patches = w.calls.filter(c => c.method === 'PATCH' && c.path.includes('/payment_links/'));
  assert.deepEqual(patches.map(c => [c.path, c.body]), [['/stores/s1/payment_links/p3', { name: 'Taza', amount: 3500 }]]);
  await w.back(); await w.submit();
  assert.equal(w.calls.filter(c => c.method === 'PATCH' && c.path.includes('/payment_links/')).length, 1);

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

const image = name => ({ name, type: 'image/jpeg' });

test('dropping photos keeps image files only, shows them before Siguiente, and survives a failed upload', async () => {
  let failOnce = true;
  const w = await drive(3, { uploadFail: () => (failOnce ? ((failOnce = false), true) : false) });
  assert.equal(w.drop('dragover', []).prevented, true);
  const dropped = w.drop('drop', [image('tienda.jpg'), { name: 'menu.pdf', type: 'application/pdf' }, image('equipo.jpg')]);
  assert.equal(dropped.prevented, true);
  assert.match(w.root.innerHTML, /tienda\.jpg/); assert.match(w.root.innerHTML, /equipo\.jpg/); assert.doesNotMatch(w.root.innerHTML, /menu\.pdf/);
  await w.submit();
  assert.match(w.root.innerHTML, /No pudimos guardar/);
  assert.match(w.root.innerHTML, /tienda\.jpg/);
  await w.submit();
  const saved = w.calls.find(c => c.method === 'PATCH' && c.body?.photos);
  assert.deepEqual(saved.body.photos, ['/v1/uploads/tienda.jpg', '/v1/uploads/equipo.jpg']);
});

test('photos picked with the file input show at once; at most 20 are kept', async () => {
  const w = await drive(3);
  w.pick('photos', [image('a.jpg')]);
  assert.match(w.root.innerHTML, /a\.jpg/);
  w.drop('drop', Array.from({ length: 25 }, (_, i) => image(`d${i}.jpg`)));
  await w.submit();
  assert.equal(w.calls.find(c => c.body?.photos).body.photos.length, 20);
  assert.equal(w.uploads.length, 20);
});

test('a dropped logo is used on the logo step; a drop on another step is only blocked', async () => {
  const w = await drive(2);
  w.drop('drop', [image('logo.png')]);
  assert.match(w.root.innerHTML, /logo\.png/);
  await w.submit();
  assert.ok(w.calls.some(c => c.body?.logoUrl === '/v1/uploads/logo.png'));
  const s = await drive(5);
  assert.equal(s.drop('drop', [image('x.jpg')]).prevented, true);
  assert.doesNotMatch(s.root.innerHTML, /x\.jpg/);
});

test('walkthroughEntry: boot resumes, opens fresh for an empty merchant, else nothing', () => {
  assert.equal(walkthroughEntry({ enabled: true, storeCount: 3, resumable: true, intent: 'boot' }), 'resume');
  assert.equal(walkthroughEntry({ enabled: true, storeCount: 0, resumable: false, intent: 'boot' }), 'fresh');
  assert.equal(walkthroughEntry({ enabled: true, storeCount: 2, resumable: false, intent: 'boot' }), 'none');
  assert.equal(walkthroughEntry({ enabled: false, storeCount: 0, resumable: false, intent: 'boot' }), 'none');
});

test('walkthroughEntry: create is always fresh with the flag on, the modal with it off', () => {
  assert.equal(walkthroughEntry({ enabled: true, storeCount: 4, resumable: true, intent: 'create' }), 'fresh');
  assert.equal(walkthroughEntry({ enabled: true, storeCount: 0, intent: 'create' }), 'fresh');
  assert.equal(walkthroughEntry({ enabled: false, storeCount: 4, intent: 'create' }), 'modal');
});

test('a fresh run (resume: null) never looks up or resumes another store', async () => {
  const calls = [];
  const root = { innerHTML: '', addEventListener() {}, querySelector: () => null };
  const api = async path => { calls.push(path); return { store: { id: 'other', name: 'Otra', onboarding: { step: 4 } } }; };
  await runWalkthrough(root, { api, uploadFile: async () => '', onDone() {}, resume: null });
  assert.deepEqual(calls, []);
  assert.match(root.innerHTML, /¿Cómo se llama tu negocio\?/);
});

test('Salir calls onExit and leaves the store alone', async () => {
  const listeners = {};
  const root = { innerHTML: '', addEventListener: (t, h) => { listeners[t] = h; }, querySelector: () => null };
  const calls = [];
  let exited = 0;
  await runWalkthrough(root, { api: async p => { calls.push(p); }, uploadFile: async () => '', onDone() {}, onExit: () => { exited++; }, resume: null });
  listeners.click({ target: { closest: sel => (sel === '[data-wt-exit]' ? {} : null) } });
  assert.equal(exited, 1);
  assert.deepEqual(calls, []);
});

test('choice screen: verbatim copy, escaped name', () => {
  const html = walkthroughChoiceView({ id: 's1', name: '<b>"Buna"</b>' });
  assert.match(html, /Tienes una tienda sin terminar/);
  assert.match(html, /«&lt;b&gt;&quot;Buna&quot;&lt;\/b&gt;» quedó a medio crear\./);
  assert.match(html, /Continuar con «&lt;b&gt;/);
  assert.match(html, /Empezar una nueva/);
  assert.match(html, /Salir/);
  assert.doesNotMatch(html, /<b>/);
});

test('choice screen: Continuar resumes that store, Empezar una nueva starts fresh, Salir exits', () => {
  let handler; const root = { innerHTML: '', addEventListener: (_t, fn) => { handler = fn; } };
  const log = [];
  const store = { id: 's1', name: 'Buna', onboarding: { step: 2 } };
  showWalkthroughChoice(root, { store, onContinue: s => log.push(['continue', s.id]), onFresh: () => log.push(['fresh']), onExit: () => log.push(['exit']) });
  assert.match(root.innerHTML, /data-wt-choice/);
  const click = attr => handler({ target: { closest: sel => (sel === attr ? {} : null) } });
  click('[data-wt-continue]'); click('[data-wt-fresh]'); click('[data-wt-exit]');
  assert.deepEqual(log, [['continue', 's1'], ['fresh'], ['exit']]);
});

test('list badge only for non-null, unfinished onboarding', () => {
  assert.equal(isUnfinishedStore({ onboarding: { step: 2, finishedAt: null } }), true);
  assert.equal(isUnfinishedStore({ onboarding: { step: 7, finishedAt: '2026-10-11T00:00:00.000Z' } }), false);
  assert.equal(isUnfinishedStore({ onboarding: null }), false);
  assert.equal(isUnfinishedStore({}), false);
});

test('dashboard wiring: Salir refreshes the data, the list shows Sin terminar + Continuar, create offers the choice', () => {
  const src = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(src, /onExit: \(\) => \{ root\.hidden = true; root\.innerHTML = ""; void refresh\(\); \}/);
  assert.match(src, /isUnfinishedStore\(store, onboardingEnabled\) \? '<span class="store-card-status" data-status="draft">Sin terminar<\/span>'/);
  assert.match(src, /continue-store/);
  assert.match(src, /\/stores\/onboarding\?storeId=/);
  assert.match(src, /isUnfinishedStore\(store, onboardingEnabled\)/);
  assert.match(src, /showWalkthroughChoice\(root/);
});

test('list badge: not for archived stores or with the walkthrough disabled', () => {
  const open = { onboarding: { step: 2, finishedAt: null } };
  assert.equal(isUnfinishedStore({ ...open, status: 'ACTIVE' }, true), true);
  assert.equal(isUnfinishedStore({ ...open, status: 'ARCHIVED' }, true), false);
  assert.equal(isUnfinishedStore({ ...open, status: 'ACTIVE' }, false), false);
});

test('resuming with only {step} and skipping photos and contact sends no photos or contact keys', async () => {
  const d = await drive(4);
  await d.submit(); // products step, nothing typed
  await d.submit(); // story step
  await d.submit(); // contact step: nothing typed
  const patches = d.calls.filter(c => c.method === 'PATCH' && c.body);
  assert.ok(patches.length >= 3);
  for (const c of patches) { assert.ok(!('photos' in c.body), JSON.stringify(c.body)); assert.ok(!('contact' in c.body), JSON.stringify(c.body)); }
});

test('resuming at the photos step and skipping it sends no photos key', async () => {
  const d = await drive(3);
  await d.submit();
  const c = d.calls.filter(x => x.method === 'PATCH' && x.body);
  assert.ok(c.length && c.every(x => !('photos' in x.body)));
});
