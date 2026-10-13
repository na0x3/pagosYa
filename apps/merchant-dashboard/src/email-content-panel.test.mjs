import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEmailContent } from './email-content-panel.mjs';

const BASE = '/stores/store_1/source-project/emails';
const DEFAULTS = { announcement: 'Gracias por comprar en {tienda}.', storyTitle: 'Sobre {tienda}', storyText: 'Somos {tienda}.', note: 'Gracias por confiar en nosotros.' };
const body = (over = {}) => ({
  available: true, content: {}, defaults: DEFAULTS,
  promos: [{ id: 'p1', code: 'PRIVADO', discount: 'Bs 20 en tu próxima compra', shared: false }, { id: 'p2', code: 'VUELVE10', discount: '10% en tu próxima compra', shared: true }],
  photos: [{ url: '/v1/uploads/banner.webp', label: 'Portada de tu tienda' }, { url: '/v1/uploads/cafe.webp', label: 'Café' }],
  ...over,
});

function fakeApi(loaded, calls = []) {
  return async (path, init = {}) => {
    calls.push([init.method || 'GET', path, init.body ? JSON.parse(init.body) : undefined]);
    if (path === `${BASE}/content` && !init.method) return loaded;
    return {};
  };
}
function mount(api, { type = 'order_confirmation' } = {}) {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  let changes = 0;
  const panel = mountEmailContent(container, { api, base: () => BASE, type: () => type, assetUrl: path => `https://api.test${path}`, onChange: () => { changes += 1; } });
  return { container, window, panel, changes: () => changes };
}
const typeInto = (window, el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const choose = (window, el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

test('loads the content and fills the fields with the saved text or the default', async () => {
  const { container, panel } = mount(fakeApi(body({ content: { note: { text: 'Gracias por elegirnos' } } })));
  await panel.load();
  assert.equal(container.querySelector('[data-content-announcement]').value, 'Gracias por comprar en {tienda}.');
  assert.equal(container.querySelector('[data-content-note]').value, 'Gracias por elegirnos');
  assert.match(container.querySelector('[data-content-row="note"]').textContent, /Editado por ti/);
  assert.doesNotMatch(container.querySelector('[data-content-row="announcement"]').textContent, /Editado por ti/);
});

test('saving sends only the changed items, then reloads and tells the preview', async () => {
  const calls = [];
  const { container, panel, window, changes } = mount(fakeApi(body(), calls));
  await panel.load();
  typeInto(window, container.querySelector('[data-content-announcement]'), 'Envío gratis todo octubre');
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.deepEqual(calls.filter(([m]) => m !== 'GET'), [['PUT', `${BASE}/content/announcement`, { text: 'Envío gratis todo octubre' }]]);
  assert.equal(changes(), 1);
  assert.ok(calls.filter(([m]) => m === 'GET').length >= 2);
});

test('saving with nothing changed sends nothing', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(body(), calls));
  await panel.load();
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.equal(calls.filter(([m]) => m !== 'GET').length, 0);
  assert.match(container.textContent, /No hay cambios/);
});

test('restore sends DELETE for that item', async () => {
  const calls = [];
  const { container, panel, changes } = mount(fakeApi(body({ content: { note: { text: 'Gracias por elegirnos' } } }), calls));
  await panel.load();
  container.querySelector('[data-content-restore="note"]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p]) => m === 'DELETE' && p === `${BASE}/content/note`));
  assert.equal(changes(), 1);
});

test('the per-email checkbox switches the section for the selected email only', async () => {
  const calls = [];
  const { container, panel, window } = mount(fakeApi(body({ content: { emails: { appointment_confirmed: { promo: false } } } }), calls), { type: 'appointment_confirmed' });
  await panel.load();
  const promo = container.querySelector('[data-content-switch="promo"]');
  assert.equal(promo.checked, false);
  promo.checked = true;
  promo.dispatchEvent(new window.Event('change', { bubbles: true }));
  await panel.settled();
  assert.ok(calls.some(([m, p, b]) => m === 'PUT' && p === `${BASE}/content/emails/appointment_confirmed/promo` && b.on === true));
});

test('the promo select lists Automática, Ninguna and only the shared codes', async () => {
  const calls = [];
  const { container, panel, window } = mount(fakeApi(body(), calls));
  await panel.load();
  const select = container.querySelector('[data-content-promo]');
  assert.deepEqual([...select.options].map(o => o.value), ['auto', 'none', 'p2']);
  assert.match(select.options[0].textContent, /VUELVE10/);
  choose(window, select, 'none');
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p, b]) => m === 'PUT' && p === `${BASE}/content/promo` && b.promoCodeId === null));
});

test('a saved choice shows as selected', async () => {
  const none = mount(fakeApi(body({ content: { promo: { promoCodeId: null } } })));
  await none.panel.load();
  assert.equal(none.container.querySelector('[data-content-promo]').value, 'none');
  const picked = mount(fakeApi(body({ content: { promo: { promoCodeId: 'p2' } } })));
  await picked.panel.load();
  assert.equal(picked.container.querySelector('[data-content-promo]').value, 'p2');
});

test('without shared codes the promo row says where to mark one', async () => {
  const { container, panel } = mount(fakeApi(body({ promos: [{ id: 'p1', code: 'PRIVADO', discount: 'x', shared: false }] })));
  await panel.load();
  assert.match(container.querySelector('[data-content-row="promo"]').textContent, /Mostrar en correos/);
  assert.match(container.querySelector('[data-content-row="promo"]').textContent, /en Códigos promocionales/);
});

test('a picked code that is no longer shared is shown as such, not as Automática', async () => {
  const { container, panel } = mount(fakeApi(body({ content: { promo: { promoCodeId: 'p1' } } })));
  await panel.load();
  const select = container.querySelector('[data-content-promo]');
  assert.equal(select.value, 'p1');
  assert.match(select.selectedOptions[0].textContent, /ya no se comparte/);
});

test('choosing a photo from the store sends its upload path; Automática clears it', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(body({ content: { heroImage: { url: '/v1/uploads/banner.webp' } } }), calls));
  await panel.load();
  assert.equal(container.querySelector('[data-content-hero="/v1/uploads/banner.webp"]').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelector('[data-content-hero="/v1/uploads/cafe.webp"] img').getAttribute('src'), 'https://api.test/v1/uploads/cafe.webp');
  container.querySelector('[data-content-hero="/v1/uploads/cafe.webp"]').click();
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p, b]) => m === 'PUT' && p === `${BASE}/content/heroImage` && b.url === '/v1/uploads/cafe.webp'));
  container.querySelector('[data-content-hero=""]').click();
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p]) => m === 'DELETE' && p === `${BASE}/content/heroImage`));
});

test('the brand story saves whole, and can be taken out of the emails', async () => {
  const calls = [];
  const { container, panel, window } = mount(fakeApi(body(), calls));
  await panel.load();
  typeInto(window, container.querySelector('[data-content-story-text]'), 'Tostamos cada semana en La Paz.');
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p, b]) => m === 'PUT' && p === `${BASE}/content/story` && b.title === 'Sobre {tienda}' && b.text === 'Tostamos cada semana en La Paz.' && b.imageUrl === null));
  container.querySelector('[data-content-story-off]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p, b]) => m === 'PUT' && p === `${BASE}/content/story` && b.off === true));
});

test('a story taken out says so and can be restored', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(body({ content: { story: { off: true } } }), calls));
  await panel.load();
  assert.match(container.querySelector('[data-content-row="story"]').textContent, /no aparece en tus correos/);
  container.querySelector('[data-content-restore="story"]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p]) => m === 'DELETE' && p === `${BASE}/content/story`));
});

test('recommendations: the store-wide switch saves with the rest', async () => {
  const calls = [];
  const { container, panel, window } = mount(fakeApi(body(), calls));
  await panel.load();
  const box = container.querySelector('[data-content-recommendations]');
  box.checked = false;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.ok(calls.some(([m, p, b]) => m === 'PUT' && p === `${BASE}/content/recommendations` && b.on === false));
});

test('a refused save shows the reason and keeps what the merchant typed', async () => {
  const api = async (path, init = {}) => {
    if (!init.method) return body();
    throw new Error('Ese texto solo tenía datos que pone la plataforma (montos, fechas o números de orden).');
  };
  const { container, panel, window } = mount(api);
  await panel.load();
  typeInto(window, container.querySelector('[data-content-announcement]'), 'Bs 300');
  container.querySelector('[data-content-save]').click();
  await panel.settled();
  assert.match(container.textContent, /solo tenía datos/);
  assert.equal(container.querySelector('[data-content-announcement]').value, 'Bs 300');
});

test('when the content is unavailable the panel stays hidden', async () => {
  const { container, panel } = mount(fakeApi(body({ available: false })));
  await panel.load();
  assert.equal(container.innerHTML, '');
});

test('escapes what it shows', async () => {
  const { container, panel } = mount(fakeApi(body({ content: { note: { text: '<img src=x onerror=alert(1)>' } }, photos: [{ url: '/v1/uploads/a.webp', label: '"><script>x</script>' }] })));
  await panel.load();
  assert.equal(container.querySelector('script'), null);
  assert.equal(container.querySelector('[data-content-note]').value, '<img src=x onerror=alert(1)>');
});
