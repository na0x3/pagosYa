# Store content pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store applied from a template gets nine information pages (about, contact, shipping, FAQ, refunds, privacy, terms, cookies, not found) filled live from its own data, plus a footer nav that links only the pages that have content.

**Architecture:** The storefront runtime (`commerce.js`) fills empty `data-pagosya-page` mounts and one `data-pagosya-pages` nav from the live `store` object, with escaped text, exactly like it does for policies. One generic kit component (`InfoPage`) draws a page's title and mount. The platform writes nine thin page files when a template is applied. Each of the 61 templates gets one nav slot in its footer.

**Tech Stack:** `packages/storefront-kit/kit/commerce.js` (vanilla JS runtime, tested with JSDOM under jest in `apps/api`), `ui.tsx`, TypeScript API, `@pagosya/store-templates`.

**Spec:** `docs/superpowers/specs/2026-09-30-store-content-pages-design.md` (parent: `2026-09-30-store-page-architecture-design.md`)

## Global Constraints

- Merchant text is always escaped; nothing from the store is ever inserted as markup.
- A page with nothing to show renders "Esta información aún no está disponible." with a link home, sets `<meta name="robots" content="noindex">`, and is not linked. No policy text is ever invented.
- The runtime must not flash "no disponible" before the live store arrives: outside preview/demo/hosted it renders only once `ready`, and falls back to whatever `store` holds if the live fetch fails.
- Published stores and stores applied before this change are untouched (files are written only when a template is applied).
- Only template apply gets the files in this plan. YAPI from-scratch stores are excluded: they have no guaranteed `Shell`. (Ruling: the spec said "a new store is generated"; sub-project 6 adds pages to those.)
- Page files start with `// @pagosya-page` (sub-project 1) and use the template's `Shell`.
- Work on `feature/store-page-architecture`. Uncommitted changes of other work live in the tree: **never `git add -A` / `git add .`**, commit only the paths named in each task. Never run prisma commands.
- Commands run from `/Users/saramia/pagosYa`; api tests: `cd apps/api && npx jest <file>`. The full `storefront-source` suite is heavy: run suites with `-w 3` in the background and read a file, never a foreground run over 10 minutes.

## Review Focus

- A hostile policy/about/address (`<script>`, backticks, `${}`, quotes) renders as text on every page — Task 1.
- `store.policies` being `null`, an array, or holding non-strings behaves as "not written" — Task 1.
- Phone and email are linked only when they are well-formed; a malformed value is never a `javascript:` link — Task 1.
- The nav never links a page with no content, and never shows "no disponible" before the live store loads — Tasks 1-2.
- The cookies text says "no usa cookies" and lists only storage the runtime really writes; a new storage prefix fails a test — Task 3.
- A template whose `Shell` lacks the nav slot (or has two) fails a test — Task 5.

---

### Task 1: Runtime fills the page mounts

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (new block after `policyLinks`, line ~1050; call from `renderPolicyLinks`, line ~1453; fallback in `load()`'s catch, line ~3564)
- Create: `apps/api/src/storefront-source/source-commerce-info-pages.spec.ts`

**Interfaces:**
- Produces (inside commerce.js): `renderInfoPages(force = false)`, `infoBody(kind)` returning an HTML string or `''`. Kinds: `about | contact | shipping | faq | refund | privacy | terms | cookies | notfound`.

- [ ] **Step 1: Write the failing tests**

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const base = { storeName: 'Marca', items: [{ id: 'p1', name: 'Café', amount: 2000, currency: 'BOB', stock: null, imageUrls: [] }] };
async function shop(kind: string, extra: Record<string, unknown> = {}, live?: Record<string, unknown>) {
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><main><div data-pagosya-page="${kind}"></div></main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  const data = { ...base, ...extra };
  w.PAGOSYA_PREVIEW = !live;
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ...data, ...live }) }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 60));
  return w;
}
const mount = (w: any) => w.document.querySelector('[data-pagosya-page]') as HTMLElement;
const noindex = (w: any) => w.document.querySelector('meta[name="robots"][content="noindex"]');
const UNAVAILABLE = 'Esta información aún no está disponible.';
const HOSTILE = 'Hola <script>alert(1)</script> `x` ${y} "z"';

describe('information pages in the storefront runtime', () => {
  it('shows the about text as escaped paragraphs under the tagline, and is indexable', async () => {
    const w = await shop('about', { tagline: 'Café de altura', aboutText: `Primero.\n\n${HOSTILE}` });
    expect(mount(w).textContent).toContain('Café de altura');
    expect(mount(w).querySelectorAll('p').length).toBeGreaterThanOrEqual(3);
    expect(mount(w).innerHTML).toContain('&lt;script&gt;');
    expect(mount(w).querySelector('script')).toBeNull();
    expect(noindex(w)).toBeNull();
    w.close();
  });

  it('says the page is unavailable, links home and asks not to be indexed when there is nothing to show', async () => {
    const w = await shop('about', {});
    expect(mount(w).textContent).toContain(UNAVAILABLE);
    expect(mount(w).querySelector('a[href="index.html"]')).not.toBeNull();
    expect(noindex(w)).not.toBeNull();
    w.close();
  });

  it.each([['refund', 'returns'], ['privacy', 'privacy'], ['terms', 'terms']])('%s shows only the policy the merchant wrote, escaped', async (kind, key) => {
    const w = await shop(kind, { policies: { [key]: HOSTILE } });
    expect(mount(w).innerHTML).toContain('&lt;script&gt;');
    expect(mount(w).querySelector('script')).toBeNull();
    const empty = await shop(kind, { policies: { returns: '', privacy: '  ', terms: undefined } });
    expect(mount(empty).textContent).toContain(UNAVAILABLE);
    w.close(); empty.close();
  });

  it.each([null, [], 'texto', 7, { returns: 5, privacy: null, terms: [] }])('treats malformed policies %j as not written', async policies => {
    const w = await shop('refund', { policies });
    expect(mount(w).textContent).toContain(UNAVAILABLE);
    w.close();
  });

  it('links a well-formed phone and email, never a malformed one, and lists locations with hours', async () => {
    const w = await shop('contact', {
      contactPhone: '+591 7000 0000', contactEmail: 'hola@marca.bo',
      locations: [{ id: 'l1', name: 'Centro', address: 'Av. <b>6</b>', pickupEnabled: true, deliveryEnabled: false, openingHours: [{ day: 1, open: '09:00', close: '18:00', closed: false }, { day: 0, open: '', close: '', closed: true }] }],
    });
    expect(mount(w).querySelector('a[href="tel:+59170000000"]')).not.toBeNull();
    expect(mount(w).querySelector('a[href="mailto:hola@marca.bo"]')).not.toBeNull();
    expect(mount(w).textContent).toContain('lunes: 09:00 a 18:00');
    expect(mount(w).textContent).toContain('domingo: cerrado');
    expect(mount(w).innerHTML).toContain('Av. &lt;b&gt;6&lt;/b&gt;');
    const bad = await shop('contact', { contactPhone: 'javascript:alert(1)', contactEmail: '"><img src=x onerror=alert(1)>' });
    expect(bad.document.querySelector('[data-pagosya-page] a[href^="javascript"]')).toBeNull();
    expect(bad.document.querySelector('[data-pagosya-page] img')).toBeNull();
    w.close(); bad.close();
  });

  it('shows the delivery policy and the places that deliver or allow pickup on the shipping page', async () => {
    const w = await shop('shipping', { policies: { delivery: 'Entregamos en 48 horas.' }, locations: [{ id: 'l1', name: 'Centro', pickupEnabled: true, deliveryEnabled: true, openingHours: [] }] });
    expect(mount(w).textContent).toContain('Entregamos en 48 horas.');
    expect(mount(w).textContent).toContain('Retiro en tienda · Entrega a domicilio');
    const none = await shop('shipping', {});
    expect(mount(none).textContent).toContain(UNAVAILABLE);
    w.close(); none.close();
  });

  it('builds the FAQ only from stated facts, and needs at least two answers', async () => {
    const one = await shop('faq', { contactEmail: 'hola@marca.bo' });
    expect(mount(one).textContent).toContain(UNAVAILABLE);
    const w = await shop('faq', { checkoutMode: 'payment', shippingEnabled: true, contactEmail: 'hola@marca.bo', locations: [{ id: 'l1', name: 'Centro', address: 'Av. 6', pickupEnabled: true, deliveryEnabled: false, openingHours: [] }] });
    const text = mount(w).textContent!;
    for (const question of ['¿Hacen envíos?', '¿Puedo retirar mi pedido?', '¿Dónde están?', '¿Cómo pago?', '¿Cómo los contacto?']) expect(text).toContain(question);
    const partial = await shop('faq', { checkoutMode: 'payment', contactEmail: 'hola@marca.bo' });
    expect(mount(partial).textContent).toContain('¿Cómo pago?');
    expect(mount(partial).textContent).not.toContain('¿Hacen envíos?');
    expect(mount(partial).textContent).not.toContain('¿Dónde están?');
    one.close(); w.close(); partial.close();
  });

  it('always shows the cookies page, and says the store uses no cookies', async () => {
    const w = await shop('cookies', {});
    expect(mount(w).textContent).toContain('no usa cookies');
    expect(noindex(w)).toBeNull();
    w.close();
  });

  it('shows a not-found message with a link home', async () => {
    const w = await shop('notfound', {});
    expect(mount(w).textContent).toContain('no existe');
    expect(mount(w).querySelector('a[href="index.html"]')).not.toBeNull();
    w.close();
  });

  it('fills a page from the live store, not from the published data', async () => {
    const w = await shop('refund', { policies: {} }, { policies: { returns: 'Cambios en 7 días.' } });
    expect(mount(w).textContent).toContain('Cambios en 7 días.');
    expect(noindex(w)).toBeNull();
    w.close();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-info-pages.spec.ts`
Expected: FAIL — every mount is empty (`textContent` does not contain the expected text).

- [ ] **Step 3: Implement** — in `commerce.js`, after the `policyLinks` function (right before `let policyDialog;`), add:

```js
  // Information pages (spec 2026-09-30-store-content-pages-design): each `data-pagosya-page` mount is filled from the
  // live store with escaped text, and `data-pagosya-pages` links only the pages that have something to show.
  const INFO_LINKS = [
    ['about', 'nosotros.html', 'Nosotros'], ['contact', 'contacto.html', 'Contacto'], ['shipping', 'envios.html', 'Envíos y entregas'],
    ['faq', 'faq.html', 'Preguntas frecuentes'], ['refund', 'reembolsos.html', 'Cambios y devoluciones'], ['privacy', 'privacidad.html', 'Privacidad'],
    ['terms', 'terminos.html', 'Términos y condiciones'], ['cookies', 'cookies.html', 'Cookies y almacenamiento'],
  ];
  const infoText = value => (typeof value === 'string' ? value.trim() : '');
  const infoParagraphs = text => text.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  const policyText = key => infoText(storePolicies()[key]);
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const infoLocations = () => (Array.isArray(store.locations) ? store.locations.filter(place => place && typeof place.name === 'string') : []);
  const placeNames = places => places.map(place => escape(place.name)).join(', ');
  function placeHours(place) {
    const rows = (Array.isArray(place.openingHours) ? place.openingHours : []).filter(row => row && Number.isInteger(row.day) && row.day >= 0 && row.day <= 6);
    return rows.map(row => `${WEEKDAYS[row.day]}: ${row.closed ? 'cerrado' : `${escape(row.open)} a ${escape(row.close)}`}`).join(' · ');
  }
  function placeList(keep = () => true) {
    const items = infoLocations().filter(keep).map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? `<br>${escape(place.address)}` : ''}${placeHours(place) ? `<br>${placeHours(place)}` : ''}<br>${[place.pickupEnabled && 'Retiro en tienda', place.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`);
    return items.length ? `<ul class="pagosya-info__list">${items.join('')}</ul>` : '';
  }
  const phoneLink = () => { const phone = infoText(store.contactPhone); return /^\+?[0-9][0-9 ()-]{5,24}$/.test(phone) ? `<a href="tel:${escape(phone.replace(/[^0-9+]/g, ''))}">${escape(phone)}</a>` : ''; };
  const emailLink = () => { const email = infoText(store.contactEmail); return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) ? `<a href="mailto:${escape(email)}">${escape(email)}</a>` : ''; };
  function faqBody() {
    const places = infoLocations(), delivering = places.filter(place => place.deliveryEnabled), pickup = places.filter(place => place.pickupEnabled);
    const entries = [];
    if (store.shippingEnabled || delivering.length) entries.push(['¿Hacen envíos?', delivering.length ? `Sí, entregamos a domicilio desde: ${placeNames(delivering)}.` : 'Sí, hacemos envíos.']);
    if (pickup.length || store.shippingPickupEnabled) entries.push(['¿Puedo retirar mi pedido?', pickup.length ? `Sí, puedes retirarlo en: ${placeNames(pickup)}.` : 'Sí, puedes retirar tu pedido.']);
    if (places.length) entries.push(['¿Dónde están?', `<ul class="pagosya-info__list">${places.map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? ` — ${escape(place.address)}` : ''}</li>`).join('')}</ul>`]);
    if (store.checkoutMode === 'payment') entries.push(['¿Cómo pago?', 'Pagas con QR o tarjeta desde la tienda, con pago seguro procesado por pagosYa.']);
    const contact = [phoneLink(), emailLink()].filter(Boolean);
    if (contact.length) entries.push(['¿Cómo los contacto?', contact.join(' · ')]);
    return entries.length >= 2 ? entries.map(([question, answer]) => `<section class="pagosya-info__qa"><h2>${escape(question)}</h2>${answer.startsWith('<') ? answer : `<p>${answer}</p>`}</section>`).join('') : '';
  }
  const COOKIES_BODY = '<p>Esta tienda no usa cookies.</p><p>Para funcionar guarda algunos datos en el almacenamiento de tu navegador. Esos datos no salen de tu dispositivo, salvo lo que envías al hacer un pedido.</p><ul class="pagosya-info__list"><li><strong>Tu carrito:</strong> para que no pierdas lo que elegiste al cambiar de página.</li><li><strong>Tu elección de privacidad:</strong> si aceptaste o rechazaste las estadísticas; se recuerda 180 días.</li><li><strong>Estadísticas de visita</strong> (solo si las aceptas): identificadores anónimos de visitante y de visita para contar cuántas personas ven la tienda.</li><li><strong>Código de referido:</strong> si llegaste con un enlace de un socio, se recuerda durante la visita.</li><li><strong>Avisos de la tienda:</strong> si cerraste un aviso o tienes un enlace para recuperar un pedido, se recuerda durante la visita.</li></ul>';
  const infoBody = kind => ({
    about: () => [infoText(store.tagline) && `<p class="pagosya-info__lead">${escape(infoText(store.tagline))}</p>`, infoText(store.aboutText) && infoParagraphs(infoText(store.aboutText))].filter(Boolean).join(''),
    contact: () => [phoneLink() && `<p>Teléfono: ${phoneLink()}</p>`, emailLink() && `<p>Correo: ${emailLink()}</p>`, placeList()].filter(Boolean).join(''),
    shipping: () => [policyText('delivery') && infoParagraphs(policyText('delivery')), placeList(place => place.pickupEnabled || place.deliveryEnabled)].filter(Boolean).join(''),
    refund: () => (policyText('returns') ? infoParagraphs(policyText('returns')) : ''),
    privacy: () => (policyText('privacy') ? infoParagraphs(policyText('privacy')) : ''),
    terms: () => (policyText('terms') ? infoParagraphs(policyText('terms')) : ''),
    faq: faqBody,
    cookies: () => COOKIES_BODY,
  })[kind]?.() || '';
  const infoReady = () => ready || preview || config.demo || hosted;
  function setNoindex(on) {
    let meta = document.head.querySelector('meta[data-pagosya-noindex]');
    if (on && !meta) { meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex'; meta.setAttribute('data-pagosya-noindex', ''); document.head.append(meta); }
    else if (!on && meta) meta.remove();
  }
  function renderInfoPages(force = false) {
    if (!force && !infoReady()) return;
    document.querySelectorAll('[data-pagosya-pages]').forEach(slot => {
      slot.innerHTML = INFO_LINKS.filter(([kind]) => infoBody(kind)).map(([, href, label]) => `<a href="${href}">${escape(label)}</a>`).join('');
      slot.hidden = !slot.innerHTML;
    });
    let unavailable = false;
    document.querySelectorAll('[data-pagosya-page]').forEach(mount => {
      const kind = mount.getAttribute('data-pagosya-page');
      if (kind === 'notfound') { mount.innerHTML = '<p>La página que buscas no existe.</p><p><a href="index.html">Volver al inicio</a></p>'; return; }
      const html = infoBody(kind);
      mount.innerHTML = html ? `<div class="pagosya-info">${html}</div>` : '<p>Esta información aún no está disponible.</p><p><a href="index.html">Volver al inicio</a></p>';
      if (!html) unavailable = true;
    });
    if (document.querySelector('[data-pagosya-page]')) setNoindex(unavailable);
  }
```

Then wire it: in `renderPolicyLinks()` (line ~1453) add `renderInfoPages();` as its last line; in `load()` (line ~3564) change the catch to `} catch (error) { ready = false; renderInfoPages(true); render(); message(error.message); }`.

- [ ] **Step 4: Run them to see them pass, plus the policies spec and the kit's own checks**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-info-pages.spec.ts src/storefront-source/source-commerce-policies.spec.ts && cd ../.. && pnpm --filter @pagosya/storefront-kit test`
Expected: PASS; kit `check-runtimes` parses `commerce.js` cleanly.

If the live-store test needs stubs the harness lacks (the non-preview path), add only the stub the error names; do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-info-pages.spec.ts
git commit -m "feat(storefront): runtime fills information pages from the live store"
```

---

### Task 2: Base style for the pages and the nav

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (style block next to `.pagosya-policies`, line ~2023)
- Modify: `apps/api/src/storefront-source/source-commerce-info-pages.spec.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
describe('information page styling', () => {
  it('inherits the template colours and lays the nav out in a row', () => {
    const at = commerce.indexOf('.pagosya-info-nav');
    expect(at).toBeGreaterThan(-1);
    const css = commerce.slice(at, at + 600);
    expect(css).toMatch(/display:flex/);
    expect(css).toMatch(/color:inherit/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-info-pages.spec.ts -t "styling"`
Expected: FAIL — `.pagosya-info-nav` is not in the runtime.

- [ ] **Step 3: Implement** — directly after the `.pagosya-policies button{...}` rule in the runtime's style string, add:

```css
.pagosya-info-nav,[data-pagosya-pages]{display:flex;flex-wrap:wrap;gap:4px 16px;margin:16px 0 0}.pagosya-info-nav a,[data-pagosya-pages] a{color:inherit;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:.25em}
.pagosya-info{max-width:68ch;line-height:1.7}.pagosya-info__lead{font-size:1.15em}.pagosya-info__list{padding-left:1.2em}.pagosya-info__qa h2{margin:1.4em 0 .3em;font-size:1.05em}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-info-pages.spec.ts && cd ../.. && pnpm --filter @pagosya/storefront-kit test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-info-pages.spec.ts
git commit -m "feat(storefront): base style for information pages and their nav"
```

---

### Task 3: Pin the cookies text to what the runtime really stores

**Files:**
- Create: `apps/api/src/storefront-source/source-commerce-cookies.spec.ts`
- Modify (only if the test finds a mismatch): `COOKIES_BODY` in `packages/storefront-kit/kit/commerce.js`

- [ ] **Step 1: Write the test**

```ts
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const files = ['commerce.js', 'privacy.js', 'retention.js', 'motion.js', 'video.js'].map(name => ({ name, source: readFileSync(kitPath(name), 'utf8') }));
// Storage prefixes the runtime may write, each covered by a line of the cookies page (Task 1, COOKIES_BODY).
const DISCLOSED = ['cart', 'privacy', 'source-visitor', 'source-visit', 'partner', 'signup-dismissed', 'recovery', 'funnel', 'analytics'];

describe('the cookies page tells the truth about browser storage', () => {
  it('the runtime writes no cookies', () => {
    for (const { name, source } of files) expect({ name, cookies: /document\.cookie\s*=/.test(source) }).toEqual({ name, cookies: false });
  });

  it('every storage key prefix the runtime uses is one the page discloses', () => {
    const used = new Set<string>();
    for (const { source } of files) for (const match of source.matchAll(/pagosya:([a-z-]+):\$\{/g)) used.add(match[1]);
    const undisclosed = [...used].filter(prefix => !DISCLOSED.includes(prefix));
    expect(undisclosed).toEqual([]);
  });

  it('the page mentions each kind of stored data in words', () => {
    const body = readFileSync(kitPath('commerce.js'), 'utf8').match(/const COOKIES_BODY = '([^']*(?:\\'[^']*)*)'/)![1];
    for (const word of ['carrito', 'privacidad', 'Estadísticas', 'referido', 'Avisos']) expect(body).toContain(word);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-cookies.spec.ts`
Expected: PASS if Task 1's text is faithful. Before accepting a pass, read how `funnel`, `analytics` and `recovery` keys are used (`grep -n "pagosya:funnel\|pagosya:analytics\|pagosya:recovery" packages/storefront-kit/kit/*.js`) and confirm each falls under a listed line ("Estadísticas de visita", "Avisos de la tienda"). If one does not (for example `funnel` tracks checkout progress), add a line for it to `COOKIES_BODY` and the keyword to the third test, then re-run.

If the suite reports an undisclosed prefix, **that is a finding**: add it to `DISCLOSED` only together with a matching line in `COOKIES_BODY`.

- [ ] **Step 3: Prove the pin can fail** — temporarily change `'recovery'` to `'recoverx'` in `DISCLOSED`, run the second test, see it fail naming `recovery`, then revert the edit.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/storefront-source/source-commerce-cookies.spec.ts packages/storefront-kit/kit/commerce.js
git commit -m "test(storefront): the cookies page discloses exactly the storage the runtime uses"
```

---

### Task 4: One `InfoPage` component in the kit

**Files:**
- Modify: `packages/storefront-kit/kit/ui.tsx` (after `StandardPagePlaceholder`)
- Modify: `apps/api/src/storefront-source/source-next-pages.spec.ts`

**Interfaces:**
- Produces: `InfoPage({ kind }: { kind: InfoPageKind })` and `type InfoPageKind = 'about' | 'contact' | 'shipping' | 'faq' | 'refund' | 'privacy' | 'terms' | 'cookies' | 'notfound'` from `@pagosya/ui`. Renders `<main id="contenido" className="ui-info-page" data-info-page={kind}>` with a `Display` title and one empty `<div data-pagosya-page={kind} />`.

- [ ] **Step 1: Write the failing test** (append to `source-next-pages.spec.ts`)

```ts
describe('InfoPage', () => {
  const page = (kind: string) => ({ path: 'components/pages/faq.tsx', content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nexport default function Page() { return <Shell><InfoPage kind="${kind}" /></Shell>; }\n` });

  it.each(['about', 'contact', 'shipping', 'faq', 'refund', 'privacy', 'terms', 'cookies', 'notfound'])('%s renders a title and exactly one empty runtime mount inside the Shell', kind => {
    const files = [...templateSourceFiles('acuarela'), templateStoreDataFile({ name: 'Tienda' }, {}), page(kind)];
    const markup = nextPageMarkup(files, 'pages/faq');
    expect(markup).toMatch(/<h1\b/);
    expect(markup.match(new RegExp(`data-pagosya-page="${kind}"`, 'g'))).toHaveLength(1);
    expect(markup).toMatch(new RegExp(`<div[^>]*data-pagosya-page="${kind}"[^>]*></div>|<div[^>]*data-pagosya-page="${kind}"[^>]*/>`));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts -t "InfoPage"`
Expected: FAIL — `@pagosya/ui` has no exported member `InfoPage`.

- [ ] **Step 3: Implement** — in `ui.tsx`, after `StandardPagePlaceholder`:

```tsx
export type InfoPageKind = 'about' | 'contact' | 'shipping' | 'faq' | 'refund' | 'privacy' | 'terms' | 'cookies' | 'notfound';
const INFO_PAGE_TITLES: Record<InfoPageKind, string> = {
  about: 'Nosotros', contact: 'Contacto', shipping: 'Envíos y entregas', faq: 'Preguntas frecuentes', refund: 'Cambios y devoluciones',
  privacy: 'Privacidad', terms: 'Términos y condiciones', cookies: 'Cookies y almacenamiento', notfound: 'Página no encontrada',
};
/** A store information page: a title and the runtime's empty mount, which fills it from the live store (commerce.js,
 * `renderInfoPages`). Never put children in the mount: the runtime owns it. */
export function InfoPage({ kind }: { kind: InfoPageKind }) {
  return <main id="contenido" className="ui-info-page" data-info-page={kind}>
    <Container><Display>{INFO_PAGE_TITLES[kind]}</Display><div data-pagosya-page={kind} /></Container>
  </main>;
}
```

- [ ] **Step 4: Run it to see it pass, plus the kit checks**

Run: `cd apps/api && npx jest src/storefront-source/source-next-pages.spec.ts && cd ../.. && pnpm --filter @pagosya/storefront-kit test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/ui.tsx apps/api/src/storefront-source/source-next-pages.spec.ts
git commit -m "feat(kit): InfoPage draws a store information page and its runtime mount"
```

---

### Task 5: The footer nav slot in all 61 templates

**Files:**
- Modify: `packages/store-templates/templates/*/components/Shell.tsx` (61 files, one insertion each)
- Create: `packages/store-templates/test/info-nav-slot.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');

// The runtime fills this slot with links to the store's information pages (spec 2026-09-30-store-content-pages-design).
test('every template footer has exactly one information nav slot, inside the footer', () => {
  for (const { dir, manifest } of templates.loadTemplates()) {
    const source = readFileSync(join(dir, 'components', 'Shell.tsx'), 'utf8');
    assert.equal(source.match(/data-pagosya-pages/g)?.length ?? 0, 1, `${manifest.id}: needs exactly one data-pagosya-pages slot`);
    const footer = source.slice(source.indexOf('export function Footer'));
    assert.ok(footer.indexOf('data-pagosya-pages') < footer.indexOf('</footer>'), `${manifest.id}: the slot must sit inside the footer`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd packages/store-templates && node --test test/info-nav-slot.test.mjs`
Expected: FAIL — `<first template>: needs exactly one data-pagosya-pages slot`.

- [ ] **Step 3: Implement** — a one-off codemod (not committed): for each `Shell.tsx`, insert the slot on its own line immediately before the single `</footer>` inside `export function Footer`.

```bash
python3 - <<'EOF'
import glob
done = 0
slot = '<nav data-pagosya-pages className="pagosya-info-nav" aria-label="Información" />'
for path in sorted(glob.glob('packages/store-templates/templates/*/components/Shell.tsx')):
    s = open(path).read()
    start = s.index('export function Footer')
    assert s.count('</footer>', start) == 1, path
    end = s.index('</footer>', start)
    line_start = s.rfind('\n', 0, end) + 1
    prefix = s[line_start:end]
    if prefix.strip() == '':
        s = s[:line_start] + prefix + '  ' + slot + '\n' + s[line_start:]
    else:
        s = s[:end] + slot + s[end:]
    open(path, 'w').write(s); done += 1
print(done, 'templates updated')
EOF
```
Expected: `61 templates updated`. Read the `git diff` of any two templates and confirm the slot sits directly inside `<footer>` and the JSX still balances.

- [ ] **Step 4: Run it to see it pass, then render every template**

Run: `cd packages/store-templates && node --test test/*.test.mjs && cd ../../apps/api && npx jest src/storefront-source/source-next-pages.spec.ts`
Expected: PASS for all 61 (the `source-next-pages` per-template rendering test proves each `Shell` still parses and renders a page).

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/templates packages/store-templates/test/info-nav-slot.test.mjs
git commit -m "feat(templates): every footer carries the information nav slot"
```

---

### Task 6: Write the nine page files when a template is applied

**Files:**
- Create: `apps/api/src/storefront-source/source-content-pages.ts`
- Modify: `apps/api/src/storefront-source/source-templates.ts` (`assembleTemplateRevision`, `authored`, line ~93)
- Create: `apps/api/src/storefront-source/source-content-pages.spec.ts`

**Interfaces:**
- Produces: `CONTENT_PAGE_FILES: SourceProjectFileDto[]` — nine files `components/pages/<name>.tsx`, each starting `// @pagosya-page`, rendering `<Shell><InfoPage kind="…" /></Shell>`.
- Consumes: `standardPageRoute`, `nextContentPages` (sub-project 1); `InfoPage` (Task 4).

- [ ] **Step 1: Write the failing tests**

```ts
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { CONTENT_PAGE_FILES } from './source-content-pages';
import { nextContentPages } from './source-next';
import { assembleTemplateRevision } from './source-templates';

jest.setTimeout(120_000);

describe('content page files', () => {
  it('are nine thin files, each marked as a page and routed to its Spanish URL', () => {
    expect(CONTENT_PAGE_FILES.map(file => file.path).sort()).toEqual(['about', 'contact', 'cookies', 'faq', 'not-found', 'privacy', 'refund-policy', 'shipping', 'terms'].map(name => `components/pages/${name}.tsx`).sort());
    for (const file of CONTENT_PAGE_FILES) { expect(file.content.startsWith('// @pagosya-page\n')).toBe(true); expect(file.content).toContain('<InfoPage kind='); }
    expect(nextContentPages([...templateSourceFiles('acuarela'), ...CONTENT_PAGE_FILES]).map(p => p.path).sort()).toEqual([
      '404.html', 'checkout.html', 'contacto.html', 'cookies.html', 'envios.html', 'faq.html', 'index.html', 'nosotros.html', 'privacidad.html', 'product.html', 'reembolsos.html', 'terminos.html',
    ].sort());
  });

  it('are added to the revision when a template is applied', async () => {
    const manifest = listTemplates().find(t => t.id === 'acuarela')!;
    const revision = await assembleTemplateRevision({
      manifest, source: templateSourceFiles('acuarela'), storeId: 's1', slug: 'acuarela-tienda',
      publicStore: { storeName: 'Acuarela', items: [], categories: [], locations: [], checkoutMode: 'PAYMENT' } as never,
      apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: true,
    });
    const paths = revision.files.map(f => f.path);
    for (const file of CONTENT_PAGE_FILES) expect(paths).toContain(file.path);
    for (const html of ['nosotros.html', 'faq.html', '404.html', 'cookies.html']) expect(paths).toContain(html);
  });
});
```
If the `publicStore` fixture above lacks a field `assembleTemplateRevision` needs, copy the fixture used in `source-templates.service.spec.ts` (it already assembles a revision) instead of inventing fields.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-content-pages.spec.ts`
Expected: FAIL — `./source-content-pages` does not exist.

- [ ] **Step 3: Implement**

`source-content-pages.ts`:

```ts
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** The information pages every store applied from a template gets (spec 2026-09-30-store-content-pages-design). Each is
 * a thin file: the template's Shell around a kit InfoPage whose content the storefront runtime fills from the live store. */
const PAGES: Array<{ file: string; component: string; kind: string }> = [
  { file: 'about', component: 'About', kind: 'about' }, { file: 'contact', component: 'Contact', kind: 'contact' },
  { file: 'shipping', component: 'Shipping', kind: 'shipping' }, { file: 'faq', component: 'Faq', kind: 'faq' },
  { file: 'refund-policy', component: 'RefundPolicy', kind: 'refund' }, { file: 'privacy', component: 'Privacy', kind: 'privacy' },
  { file: 'terms', component: 'Terms', kind: 'terms' }, { file: 'cookies', component: 'Cookies', kind: 'cookies' },
  { file: 'not-found', component: 'NotFound', kind: 'notfound' },
];

export const CONTENT_PAGE_FILES: SourceProjectFileDto[] = PAGES.map(({ file, component, kind }) => ({
  path: `components/pages/${file}.tsx`,
  content: `// @pagosya-page\nimport Shell from '../Shell';\nimport { InfoPage } from '@pagosya/ui';\nexport default function ${component}() { return <Shell><InfoPage kind="${kind}" /></Shell>; }\n`,
}));
```

In `assembleTemplateRevision` (`source-templates.ts`), change

```ts
const authored = [...input.source.filter(file => file.path !== TEMPLATE_STORE_DATA_PATH), storeData];
```
to
```ts
const authored = [...input.source.filter(file => file.path !== TEMPLATE_STORE_DATA_PATH), ...CONTENT_PAGE_FILES.filter(page => !input.source.some(file => file.path === page.path)), storeData];
```
and add `import { CONTENT_PAGE_FILES } from './source-content-pages';`. A template that ships its own file at one of those paths keeps it.

- [ ] **Step 4: Run them to see them pass, then the template and generation suites**

Run (in the background, `-w 3`, read the file): `cd apps/api && npx jest -w 3 src/storefront-source/source-content-pages.spec.ts src/storefront-source/source-templates.spec.ts src/storefront-source/source-templates.service.spec.ts src/storefront-source/source-templates-contract.spec.ts src/storefront-source/source-next-pages.spec.ts`
Expected: all PASS. `source-templates-contract.spec.ts` compiles templates end to end and takes several minutes: a failure there is a real finding (a template that cannot host the pages), not a timeout, unless the output says `Exceeded timeout` — rerun that suite alone before judging.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-content-pages.ts apps/api/src/storefront-source/source-content-pages.spec.ts apps/api/src/storefront-source/source-templates.ts
git commit -m "feat(storefront): a template store gets the nine information pages"
```

---

### Task 7: Spec upkeep and whole-area check

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-store-content-pages-design.md`

- [ ] **Step 1: Update the spec to match what was built** — replace the per-page kit components sentence with the single `InfoPage kind`; in "When files are created" say only template apply gets files (YAPI from-scratch stores wait for sub-project 6); note that the contact page shows phone, email and places and does not embed the contact form.

- [ ] **Step 2: Run the affected areas**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ../.. && pnpm --filter @pagosya/storefront-kit test && (cd packages/store-templates && node --test test/*.test.mjs)` then, in the background, `cd apps/api && npx jest -w 3 src/storefront-source/source-commerce src/storefront-source/source-validation-error.spec.ts`
Expected: green. `source-commerce-motion.spec.ts` fails on `main` for an unrelated reason (kit CSS overshoot on `commerce.js`; identical before this work): if it is the only failure, record it as pre-existing. Any other failure is caused by this branch.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-30-store-content-pages-design.md
git commit -m "docs: content pages spec matches the build"
```

---

## Self-review

- **Spec coverage:** nine pages and their sources → Task 1; unavailable state, noindex, no-flash, live → Task 1; derived FAQ with ≥2 → Task 1; cookies text pinned → Task 3; nav with only pages that have content → Tasks 1-2; nav slot in 61 footers → Task 5; files on template apply → Task 6; tests on hostile/malformed input → Task 1; "store applied before is unchanged" → Global Constraints (files written only on apply) and Task 6 (only `assembleTemplateRevision`).
- **Deviations from the spec, all listed in Task 7:** one `InfoPage` instead of a component per page; YAPI from-scratch stores excluded; the contact form is not embedded.
- **Placeholders:** none. Task 3 step 2 tells the implementer to verify three storage keys before accepting the text, because their purpose was not read while planning.
- **Consistency:** kinds (`about … notfound`) are identical in Task 1 (runtime), Task 4 (`InfoPageKind`) and Task 6 (`PAGES`); `COOKIES_BODY` keywords match Task 3's third test.
