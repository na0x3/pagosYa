# Point YAPI at a part of the page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On template stores the merchant clicks a section, circles any part of the preview (YAPI also gets a picture of it), or just looks at a section, and YAPI's quick template edit changes only that part.

**Architecture:** The injected preview script (`source-preview-edit-mode.js`) gives template sections an address `{ page, at }`, turns a drag into an area selection, and always reports the section in the middle of the viewport. The Studio validates what the preview posts and sends `selection` (with `at`/`page`/`area`) or `viewing` with the message. The API stops sending pointed requests on template stores to the code generator and passes a `foco` (plus a picture of the circled area, drawn by the thumbnail browser) to the one quick-edit call.

**Tech Stack:** plain ES5 preview script (jsdom + vitest tests), Studio TypeScript (vitest), NestJS + class-validator (jest), Playwright + sharp (thumbnail service).

**Spec:** `docs/superpowers/specs/2026-11-05-point-at-yapi-design.md`

## Global Constraints

- Template stores only: a template section is an element with `data-lb` whose parent carries `data-lb-home` (home `<main>`, menu-page div `data-lb-page="about|contact|faq|shipping"`) or `data-lb-product` (product page). Classic stores keep today's rule (direct child of `<main>` with an id matching `^[a-z][a-z0-9-]{0,47}$`) and today's `sourceSectionScope` path.
- `page` ∈ `home | product | about | contact | faq | shipping`; `at` = the section's layout number (from its `lb-N` id, else its position among the container's `[data-lb]` children), the same numbers `layoutDigest` uses; int 0–40.
- Click = pointer travels < 12 px; circle = ≥ 12 px; a loop whose box is under 24 × 24 px is ignored.
- Area limits: `points` flat `[x0,y0,x1,y1,…]` 6–128 numbers (≤ 64 points), finite; `rect` `{x,y,width,height}` ≥ 0 and ≤ 100000; `width` 280–2400; `sections` ≤ 3 `{ page, at, label ≤ 60 }`; `texts` ≤ 12 × 200 chars; `photos` ≤ 6 URLs ≤ 500 chars starting `http(s)://`, `/` or `assets/`; `parts` ⊂ `header | announcement | footer | menu`; `pageQuery` `^[a-z0-9][a-z0-9-]{0,63}\.html(\?[A-Za-z0-9=&_.%-]{0,135})?$`.
- Viewing: posted at most once per 400 ms, always on (not only in edit mode); `mirando` reaches the model only when the request has a deictic word and there is no selection.
- Picture: circle only; saved revision drawn like the store thumbnail (live catalogue, uploads from the uploads store, no network), at the preview width; clip = rect + 48 px, capped 1400 × 1000 CSS px; JPEG ≤ 1024 px wide, quality 72; 20 s budget; any failure → edit without picture, log `point_picture_failed`; never stored.
- Studio copy (Spanish): chip «Sobre: <label>» for a click, «Sobre: zona marcada · <label>» for a circle; toolbar hint «Toca una sección o dibuja un círculo alrededor de lo que quieres cambiar»; platform: «Esa parte la administra pagosYa».
- A pointed request is never a plan card, template pick or template switch: keep the `!input.selection` guards at source-chat.service.ts ~1541/1551/1577/1760/2008; only the `templateHome` guard at ~1986 changes.
- Never save an `apps/api` file while a YAPI live run is going (nest --watch restart kills it); never `sed -i` an API file; type-check with `tsc --noEmit --incremental false`; never run the whole storefront-source jest folder (froze the PC 2026-11-05) — name the spec files.

## Review Focus

1. A click on a product card inside a template's product-grid section selects the section, not «Lo administra pagosYa» → Task 1 test.
2. A section id without a number (`hero-split` is `id="inicio"`) or a section that renders nothing shifts positions → Task 1 takes `at` from `lb-N` when present, position only as fallback; test pins it.
3. A drag that starts on a link must not navigate and must not also fire a click selection → Task 2 test.
4. A malformed or oversized `area` (NaN point, 13 texts, `../` page, 501-char photo) is dropped by the Studio and refused by the DTO → Tasks 2 and 5 tests.
5. The picture capture throws or hangs → the edit still runs, without `input_image` → Task 8 test.

---

### Task 1: Template section address on click (preview script + receiver)

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-edit-mode.js`
- Modify: `packages/storefront-preview/src/source-preview.ts:44-52` (`PreviewSelection`, `receivePreviewSelection`)
- Test: `packages/storefront-preview/src/source-preview-selection.test.ts`

**Interfaces:**
- Produces: `type PointPage = 'home' | 'product' | 'about' | 'contact' | 'faq' | 'shipping'`, `POINT_PAGES`, `PreviewSelection = { kind: 'section' | 'platform' | 'area'; sectionId: string; label: string; text?: string; at?: number; page?: PointPage; area?: PointArea }` (`PointArea` in Task 2). Script posts `{ type: 'pagosya:source-select', kind: 'section', sectionId, label, at, page, text? }` for template sections; script-internal `addressOf(element, box)` returns `{ kind: 'section', element, id, label, at, page } | null`.

- [ ] **Step 1: Write the failing tests** (append to the test file)

```ts
const templatePage = `<!doctype html><html><body><header class="es-header"><nav><a href="index.html">Inicio</a></nav></header>
<main id="contenido" data-lb-home>
  <section id="lb-0" data-lb="cover-split"><h1>Alta costura</h1></section>
  <section id="lb-2" data-lb="products-grid"><h2>Colección</h2><div data-pagosya-catalog><p class="card">Vestido Cala</p></div></section>
  <section id="inicio" data-lb="hero-split"><h2>Sin número</h2></section>
</main>
<div data-lb-home data-lb-page="about"><section id="lb-0" data-lb="story-split"><h2>Nuestra historia</h2></section></div>
<footer class="es-footer"><p>NOA</p></footer></body></html>`;
function loadTemplate() {
  const snap = { ...snapshot, files: [{ path: 'index.html', content: templatePage }] };
  const dom = new JSDOM(sourcePreviewDocument(snap, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-select') posted.push(event.data); });
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  const click = (selector: string) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { w, posted, send, click };
}

it('addresses a template section by page and number, and a product card inside it selects the section', async () => {
  const { posted, send, click } = loadTemplate();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('[data-lb="cover-split"] h1');
  click('[data-pagosya-catalog] .card');
  click('[data-lb-page="about"] h2');
  await vi.waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[0]).toMatchObject({ kind: 'section', sectionId: 'lb-0', page: 'home', at: 0, label: 'Alta costura' });
  expect(posted[1]).toMatchObject({ kind: 'section', sectionId: 'lb-2', page: 'home', at: 2, label: 'Colección' });
  expect(posted[2]).toMatchObject({ kind: 'section', sectionId: 'lb-0', page: 'about', at: 0 });
});

it('falls back to the position among the [data-lb] children when the id carries no number', async () => {
  const { posted, send, click } = loadTemplate();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('#inicio h2');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ sectionId: 'inicio', page: 'home', at: 2 });
});

it('the Studio keeps a template address and drops a bad one', () => {
  const frame = { contentWindow: {} } as unknown as HTMLIFrameElement;
  const event = (data: unknown) => ({ source: frame.contentWindow, origin: 'null', data }) as unknown as MessageEvent;
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'section', sectionId: 'lb-0', label: 'x', at: 0, page: 'about' }), frame))
    .toEqual({ kind: 'section', sectionId: 'lb-0', label: 'x', at: 0, page: 'about' });
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'section', sectionId: 'lb-0', label: 'x', at: 41, page: 'home' }), frame)).toBeNull();
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'section', sectionId: 'lb-0', label: 'x', at: 1, page: 'blog' }), frame)).toBeNull();
});
```

- [ ] **Step 2: Run** `cd packages/storefront-preview && npx vitest run src/source-preview-selection.test.ts` — the three new tests FAIL (no `page`/`at`; the card posts `platform`).

- [ ] **Step 3: Implement the script.** Replace `targetOf` and give `labelOf` the id:

```js
  var PAGES = ['home', 'product', 'about', 'contact', 'faq', 'shipping'];
  function labelOf(section, id) {
    var heading = section.querySelector('h1,h2,h3,h4,h5,h6');
    var text = heading ? (heading.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (text) return text.slice(0, 40);
    var words = String(id || section.id || '').replace(/-/g, ' ');
    return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 40);
  }
  /** Template sections (spec 2026-11-05 point-at): a [data-lb] child of a [data-lb-home] / [data-lb-product] container. */
  function addressOf(element, box) {
    var named = /^lb-(\d{1,2})$/.exec(element.id || '');
    var siblings = Array.prototype.filter.call(box.children, function (child) { return child.hasAttribute('data-lb'); });
    var at = named ? Number(named[1]) : siblings.indexOf(element);
    var page = box.getAttribute('data-lb-page') || (box.hasAttribute('data-lb-product') ? 'product' : 'home');
    if (PAGES.indexOf(page) < 0 || at < 0 || at > 40) return null;
    var id = SECTION_ID.test(element.id || '') ? element.id : 'lb-' + at;
    return { kind: 'section', element: element, id: id, label: labelOf(element, id), at: at, page: page };
  }
  function templateSectionOf(node) {
    var element = node.closest('[data-lb]');
    while (element) {
      var box = element.parentElement;
      if (box && (box.hasAttribute('data-lb-home') || box.hasAttribute('data-lb-product'))) return addressOf(element, box);
      element = box ? box.closest('[data-lb]') : null;
    }
    return null;
  }
  /** A template section, a platform-owned part, or a classic section (a direct child of <main> with a literal id). */
  function targetOf(node) {
    if (!node || !node.closest) return null;
    var template = templateSectionOf(node);
    if (template) return template;
    var mount = node.closest(MOUNTS);
    if (mount) return { kind: 'platform', element: mount, id: '', label: 'Lo administra pagosYa' };
    var main = document.querySelector('main');
    if (!main) return null;
    var element = node;
    while (element && element.parentElement !== main) element = element.parentElement;
    if (!element || !element.id || !SECTION_ID.test(element.id)) return null;
    return { kind: 'section', element: element, id: element.id, label: labelOf(element, element.id) };
  }
```

In `post(target, text)` add `if (typeof target.at === 'number') { message.at = target.at; message.page = target.page; }`.

- [ ] **Step 4: Implement the receiver** in `source-preview.ts`:

```ts
export type PointPage = 'home' | 'product' | 'about' | 'contact' | 'faq' | 'shipping';
export const POINT_PAGES: readonly PointPage[] = ['home', 'product', 'about', 'contact', 'faq', 'shipping'];
export interface PreviewSelection { kind: 'section' | 'platform' | 'area'; sectionId: string; label: string; text?: string; at?: number; page?: PointPage; area?: PointArea }
const validAt = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 40;
```

and end `receivePreviewSelection` with:

```ts
  const addressed = data.kind === 'section' && (data.at !== undefined || data.page !== undefined);
  if (addressed && (!validAt(data.at) || !POINT_PAGES.includes(data.page))) return null;
  return { kind: data.kind, sectionId: data.sectionId, label: data.label, ...(text ? { text } : {}), ...(addressed ? { at: data.at, page: data.page } : {}) };
```

`PreviewSelection` names `PointArea`: add the `PointPart` type and the `PointArea` interface from Task 2 Step 4 in this step already (types only; `validPointArea` comes in Task 2).

- [ ] **Step 5: Run** `npx vitest run src/source-preview-selection.test.ts` — all PASS, old tests too.
- [ ] **Step 6: Commit** `git add packages/storefront-preview && git commit -m "feat(yapi): the preview addresses template sections by page and number; a product card selects its section (spec 2026-11-05 point-at)"`

### Task 2: Draw a circle (preview script + receiver)

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-edit-mode.js`
- Modify: `packages/storefront-preview/src/source-preview.ts`, `packages/storefront-preview/src/index.ts`
- Test: `packages/storefront-preview/src/source-preview-selection.test.ts`

**Interfaces:**
- Consumes: `addressOf`, `labelOf`, `PointPage`, `POINT_PAGES`, `validAt` (Task 1).
- Produces: `PointArea = { points: number[]; rect: { x; y; width; height }; sections: Array<{ page: PointPage; at: number; label: string }>; texts: string[]; photos: string[]; parts: PointPart[]; width: number; pageQuery: string }`, `PointPart = 'header' | 'announcement' | 'footer' | 'menu'`, `validPointArea(value: unknown): PointArea | null`. Script posts `{ type: 'pagosya:source-select', kind: 'area', sectionId, label, area }`, `sectionId` = the first section's id or `'zona-marcada'`.

- [ ] **Step 1: Write the failing tests**

```ts
/** jsdom has no layout: give elements boxes (client coordinates; the page is not scrolled). */
function box(w: any, selector: string, x: number, y: number, width: number, height: number) {
  w.document.querySelectorAll(selector).forEach((el: any) => { el.getBoundingClientRect = () => ({ left: x, top: y, right: x + width, bottom: y + height, width, height, x, y }); });
}
function drag(w: any, path: Array<[number, number]>, startOn = 'body') {
  const at = (type: string, [x, y]: [number, number], target: any) => target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  const start = w.document.querySelector(startOn);
  at('pointerdown', path[0], start);
  path.slice(1).forEach(point => at('pointermove', point, w.document));
  at('pointerup', path[path.length - 1], w.document);
  start.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
}
const square = (x: number, y: number, s: number): Array<[number, number]> => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y + 1]];

it('a circle selects the sections, words, photos and header parts it covers, and its click selects nothing more', async () => {
  const { w, posted, send } = loadTemplate();
  w.document.querySelector('[data-lb="cover-split"]').insertAdjacentHTML('beforeend', '<img src="https://api.test/v1/uploads/cala.jpg" alt="">');
  box(w, '.es-header', 0, 0, 1280, 80); box(w, '.es-header nav', 400, 20, 400, 40); box(w, '.es-header nav a', 410, 25, 60, 20);
  box(w, '[data-lb="cover-split"]', 0, 80, 1280, 600); box(w, '[data-lb="cover-split"] h1', 100, 200, 400, 80); box(w, '[data-lb="cover-split"] img', 700, 150, 300, 400);
  box(w, '[data-lb="products-grid"]', 0, 680, 1280, 800); box(w, '.es-footer', 0, 3000, 1280, 200);
  send({ type: 'pagosya:source-edit-mode', on: true });
  drag(w, square(50, 10, 1000), '[data-lb="cover-split"] h1');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  const area = posted[0].area;
  expect(posted[0]).toMatchObject({ kind: 'area', sectionId: 'lb-0', label: 'Alta costura' });
  expect(area.sections.map((s: any) => [s.page, s.at])).toEqual([['home', 0], ['home', 2]]);
  expect(area.texts).toEqual(['Inicio', 'Alta costura']);
  expect(area.photos).toEqual(['https://api.test/v1/uploads/cala.jpg']);
  expect(area.parts).toEqual(['header', 'menu']);
  expect(area.points.length % 2).toBe(0);
  expect(area.rect).toEqual({ x: 50, y: 10, width: 1000, height: 1000 });
  expect(area.pageQuery).toBe('index.html');
});

it('ignores a loop smaller than 24 × 24 and a drag never navigates', async () => {
  const { w, posted, send } = loadTemplate();
  send({ type: 'pagosya:source-edit-mode', on: true });
  const navigations: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-navigate') navigations.push(event.data); });
  drag(w, square(10, 10, 20), '.es-header nav a');
  await tick();
  expect(posted).toEqual([]);
  expect(navigations).toEqual([]);
});

it('the Studio keeps a valid area and drops a malformed one', () => {
  const frame = { contentWindow: {} } as unknown as HTMLIFrameElement;
  const event = (data: unknown) => ({ source: frame.contentWindow, origin: 'null', data }) as unknown as MessageEvent;
  const area = { points: [0, 0, 100, 0, 100, 100], rect: { x: 0, y: 0, width: 100, height: 100 }, sections: [{ page: 'home', at: 1, label: 'Hola' }], texts: ['Hola'], photos: [], parts: ['menu'], width: 1280, pageQuery: 'index.html' };
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'area', sectionId: 'lb-1', label: 'Hola', area }), frame)).toMatchObject({ kind: 'area', area });
  for (const bad of [{ ...area, points: [0, NaN, 1, 1, 2, 2] }, { ...area, texts: Array(13).fill('x') }, { ...area, parts: ['body'] }, { ...area, width: 100 }, { ...area, pageQuery: '../x.html' }, { ...area, photos: ['/' + 'x'.repeat(500)] }])
    expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'area', sectionId: 'lb-1', label: 'Hola', area: bad }), frame)).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run src/source-preview-selection.test.ts` — the three FAIL.

- [ ] **Step 3: Implement the script.** Add state `var press = null, drawing = false, swallowClick = false, loop = null;` and:

```js
  var PARTS = [['announcement', '.es-announce,[data-pagosya-announcement]'], ['header', 'body header:not(main header)'], ['menu', 'body header:not(main header) nav,[data-pagosya-store-menu]'], ['footer', 'body footer:not(main footer)']];
  function pageBox(element) { var r = element.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; }
  function overlap(a, b) { return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); }
  /** Ray casting on the flat [x0,y0,x1,y1,…] loop. */
  function inside(points, x, y) {
    var hit = false;
    for (var i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
      var xi = points[i], yi = points[i + 1], xj = points[j], yj = points[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  function centreIn(points, element) { var b = pageBox(element); return b.width > 0 && inside(points, b.x + b.width / 2, b.y + b.height / 2); }
  function simplify(points) { var step = Math.ceil(points.length / 2 / 64), out = []; for (var i = 0; i < points.length; i += 2 * step) out.push(Math.round(points[i]), Math.round(points[i + 1])); return out; }
  function areaOf(points) {
    var xs = [], ys = []; for (var i = 0; i < points.length; i += 2) { xs.push(points[i]); ys.push(points[i + 1]); }
    var left = Math.max(0, Math.min.apply(null, xs)), top = Math.max(0, Math.min.apply(null, ys));
    var rect = { x: left, y: top, width: Math.max.apply(null, xs) - left, height: Math.max.apply(null, ys) - top };
    if (rect.width < 24 || rect.height < 24) return null;
    var sections = Array.prototype.map.call(document.querySelectorAll('[data-lb-home] > [data-lb], [data-lb-product] > [data-lb]'), function (element) { return addressOf(element, element.parentElement); })
      .filter(Boolean).map(function (s) { return { s: s, o: overlap(rect, pageBox(s.element)) }; }).filter(function (e) { return e.o > 0; })
      .sort(function (a, b) { return b.o - a.o; }).slice(0, 3).map(function (e) { return e.s; });
    var texts = [];
    Array.prototype.forEach.call(document.body.querySelectorAll('*'), function (element) {
      if (texts.length >= 12 || element.children.length || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(element.tagName) || element.closest('[data-pagosya-edit-overlay]')) return;
      var text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && centreIn(points, element)) texts.push(text.slice(0, 200));
    });
    var photos = [];
    Array.prototype.forEach.call(document.querySelectorAll('img,[style*="background-image"]'), function (element) {
      if (photos.length >= 6 || !centreIn(points, element)) return;
      var url = element.tagName === 'IMG' ? (element.currentSrc || element.src) : ((/url\(["']?([^"')]+)/.exec(element.style.backgroundImage) || [])[1] || '');
      if (url && url.length <= 500 && /^(https?:\/\/|\/|assets\/)/.test(url) && photos.indexOf(url) < 0) photos.push(url);
    });
    var parts = PARTS.filter(function (part) { return Array.prototype.some.call(document.querySelectorAll(part[1]), function (element) { return overlap(rect, pageBox(element)) > 0; }); }).map(function (part) { return part[0]; });
    var page = (location.pathname.split('/').pop() || 'index.html') + (window.PAGOSYA_PREVIEW_QUERY || location.search || '');
    return { first: sections[0] || null, area: { points: simplify(points), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      sections: sections.map(function (s) { return { page: s.page, at: s.at, label: s.label }; }), texts: texts, photos: photos, parts: parts,
      width: Math.max(280, Math.min(2400, Math.round(innerWidth))), pageQuery: page.slice(0, 200) } };
  }
  /** The loop stays drawn (thin, dark, white halo) until the selection is cleared. */
  function drawLoop(points) {
    if (!loop) { loop = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); loop.setAttribute('data-pagosya-edit-overlay', ''); loop.setAttribute('aria-hidden', 'true'); document.body.appendChild(loop); }
    loop.setAttribute('style', 'position:absolute;left:0;top:0;width:' + document.documentElement.scrollWidth + 'px;height:' + document.documentElement.scrollHeight + 'px;pointer-events:none;z-index:2147483646;overflow:visible');
    var list = []; for (var i = 0; i < points.length; i += 2) list.push(points[i] + ',' + points[i + 1]);
    var line = '<polyline points="' + list.join(' ') + '" fill="none" stroke-linejoin="round" stroke-linecap="round" ';
    loop.innerHTML = line + 'stroke="#fff" stroke-width="6"/>' + line + 'stroke="#18181b" stroke-width="2.5"/>';
  }
  function clearLoop() { if (loop && loop.parentNode) loop.parentNode.removeChild(loop); loop = null; }
  function onDown(event) { if (event.button > 0) return; press = { x: event.clientX, y: event.clientY, points: [event.clientX + scrollX, event.clientY + scrollY] }; drawing = false; }
  function onDrag(event) {
    if (!press) return;
    if (!drawing && Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) < 12) return;
    if (!drawing) { drawing = true; clearLoop(); }
    event.preventDefault();
    press.points.push(event.clientX + scrollX, event.clientY + scrollY);
    drawLoop(press.points);
  }
  function onUp() {
    if (!press) return;
    var points = press.points; press = null;
    if (!drawing) return;
    drawing = false; swallowClick = true;
    var read = areaOf(points);
    if (!read) { clearLoop(); return; }
    var area = read.area, first = read.first;
    if (!first && !area.parts.length) {
      var hit = document.elementFromPoint ? document.elementFromPoint(area.rect.x - scrollX + area.rect.width / 2, area.rect.y - scrollY + area.rect.height / 2) : null;
      if (hit && hit.closest && hit.closest(MOUNTS)) { clearLoop(); post({ kind: 'platform', id: '', label: 'Lo administra pagosYa' }, ''); return; }
      if (!area.texts.length && !area.photos.length) { clearLoop(); return; }
    }
    selected = first ? first.id : '';
    parent.postMessage({ type: 'pagosya:source-select', kind: 'area', sectionId: first ? first.id : 'zona-marcada', label: (first ? first.label : area.texts[0] || 'Zona marcada').slice(0, 60), area: area }, '*');
    schedule();
  }
```

Then: first line of `onClick` → `if (swallowClick) { swallowClick = false; event.preventDefault(); event.stopPropagation(); return; }`; a normal click and Escape in `onKey` call `clearLoop()`; `turnOn` adds `pointerdown`/`pointermove`/`pointerup` listeners (capture) and sets `document.documentElement.style.touchAction = 'none'` so a finger draws instead of scrolling; `turnOff` removes them, restores `touchAction = ''` and calls `clearLoop()`.

- [ ] **Step 4: Implement the receiver** in `source-preview.ts` (export from `index.ts` next to `receivePreviewSelection`):

```ts
export type PointPart = 'header' | 'announcement' | 'footer' | 'menu';
export interface PointArea { points: number[]; rect: { x: number; y: number; width: number; height: number }; sections: Array<{ page: PointPage; at: number; label: string }>; texts: string[]; photos: string[]; parts: PointPart[]; width: number; pageQuery: string }
const POINT_PARTS: readonly PointPart[] = ['header', 'announcement', 'footer', 'menu'];
const PAGE_QUERY = /^[a-z0-9][a-z0-9-]{0,63}\.html(\?[A-Za-z0-9=&_.%-]{0,135})?$/;
const inRange = (n: unknown, max = 100000) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
/** Everything a circle in the preview says (spec 2026-11-05 point-at), checked before the Studio trusts it; null when anything is off. */
export function validPointArea(value: unknown): PointArea | null {
  const a = value as PointArea | null;
  if (!a || typeof a !== 'object') return null;
  if (!Array.isArray(a.points) || a.points.length < 6 || a.points.length > 128 || a.points.length % 2 || !a.points.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const r = a.rect;
  if (!r || ![r.x, r.y, r.width, r.height].every(n => inRange(n))) return null;
  if (!Array.isArray(a.sections) || a.sections.length > 3 || !a.sections.every(s => s && POINT_PAGES.includes(s.page) && validAt(s.at) && typeof s.label === 'string' && s.label.length <= 60)) return null;
  if (!Array.isArray(a.texts) || a.texts.length > 12 || !a.texts.every(t => typeof t === 'string' && t.length <= 200)) return null;
  if (!Array.isArray(a.photos) || a.photos.length > 6 || !a.photos.every(p => typeof p === 'string' && p.length <= 500 && /^(https?:\/\/|\/|assets\/)/.test(p))) return null;
  if (!Array.isArray(a.parts) || !a.parts.every(p => POINT_PARTS.includes(p))) return null;
  if (!inRange(a.width, 2400) || a.width < 280 || typeof a.pageQuery !== 'string' || !PAGE_QUERY.test(a.pageQuery)) return null;
  return { points: [...a.points], rect: { x: r.x, y: r.y, width: r.width, height: r.height }, sections: a.sections.map(s => ({ page: s.page, at: s.at, label: s.label })), texts: [...a.texts], photos: [...a.photos], parts: [...new Set(a.parts)], width: a.width, pageQuery: a.pageQuery };
}
```

At the top of `receivePreviewSelection`, after the source/origin/type check:

```ts
  if (data.kind === 'area') {
    const area = validPointArea(data.area);
    if (!area || typeof data.label !== 'string' || data.label.length > 60 || typeof data.sectionId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(data.sectionId)) return null;
    return { kind: 'area', sectionId: data.sectionId, label: data.label, area };
  }
```

- [ ] **Step 5: Run** `npx vitest run src/source-preview-selection.test.ts` — PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(yapi): draw a circle in the preview — sections, words, photos and header parts inside it reach the Studio (spec 2026-11-05 point-at)"`

### Task 3: What you're looking at (preview script + receiver)

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-edit-mode.js`
- Modify: `packages/storefront-preview/src/source-preview.ts`, `packages/storefront-preview/src/index.ts`
- Test: `packages/storefront-preview/src/source-preview-selection.test.ts`

**Interfaces:**
- Consumes: `addressOf`, `labelOf` (Task 1).
- Produces: post `{ type: 'pagosya:source-viewing', page, at?, sectionId, label }`; `receivePreviewViewing(event: MessageEvent, frame: HTMLIFrameElement | null): PreviewViewing | null`; `PreviewViewing = { page: PointPage; at?: number; sectionId?: string; label: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('always says which section is in the middle of the screen, without edit mode, once per 400 ms', async () => {
  const { w } = loadTemplate();
  const seen: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-viewing') seen.push(event.data); });
  Object.defineProperty(w, 'innerHeight', { value: 800, configurable: true });
  box(w, '[data-lb="cover-split"]', 0, -900, 1280, 600); box(w, '[data-lb="products-grid"]', 0, -300, 1280, 900); box(w, '#inicio', 0, 600, 1280, 500);
  w.dispatchEvent(new w.Event('scroll')); w.dispatchEvent(new w.Event('scroll')); w.dispatchEvent(new w.Event('scroll'));
  await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 1500 });
  expect(seen[0]).toMatchObject({ page: 'home', at: 2, sectionId: 'lb-2', label: 'Colección' });
});

it('the Studio keeps a valid viewing and drops a bad one', () => {
  const frame = { contentWindow: {} } as unknown as HTMLIFrameElement;
  const event = (data: unknown) => ({ source: frame.contentWindow, origin: 'null', data }) as unknown as MessageEvent;
  expect(receivePreviewViewing(event({ type: 'pagosya:source-viewing', page: 'faq', at: 1, sectionId: 'lb-1', label: 'Preguntas' }), frame)).toEqual({ page: 'faq', at: 1, sectionId: 'lb-1', label: 'Preguntas' });
  expect(receivePreviewViewing(event({ type: 'pagosya:source-viewing', page: 'faq', at: -1, label: 'x' }), frame)).toBeNull();
  expect(receivePreviewViewing({ source: {}, origin: 'null', data: { type: 'pagosya:source-viewing', page: 'home', label: 'x' } } as unknown as MessageEvent, frame)).toBeNull();
});
```

Rename the existing test «does nothing at all until edit mode is turned on: no selection message, no overlay, links behave as before» — wording already says «no selection message»; leave it (viewing is a different message).

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement the script** (outside `turnOn`, always on):

```js
  var viewingTimer = 0, lastViewing = '';
  function viewingNow() {
    viewingTimer = 0;
    var middle = innerHeight / 2, found = null, i, r;
    var list = document.querySelectorAll('[data-lb-home] > [data-lb], [data-lb-product] > [data-lb]');
    for (i = 0; i < list.length && !found; i++) { r = list[i].getBoundingClientRect(); if (r.height && r.top <= middle && r.bottom > middle) found = addressOf(list[i], list[i].parentElement); }
    var main = document.querySelector('main');
    for (i = 0; !found && main && i < main.children.length; i++) {
      var kid = main.children[i]; r = kid.getBoundingClientRect();
      if (r.height && r.top <= middle && r.bottom > middle && SECTION_ID.test(kid.id || '')) found = { id: kid.id, label: labelOf(kid, kid.id), page: 'home' };
    }
    if (!found) return;
    var message = { type: 'pagosya:source-viewing', page: found.page, sectionId: found.id, label: found.label };
    if (typeof found.at === 'number') message.at = found.at;
    var key = JSON.stringify(message);
    if (key === lastViewing) return;
    lastViewing = key;
    parent.postMessage(message, '*');
  }
  function onViewing() { if (!viewingTimer) viewingTimer = setTimeout(viewingNow, 400); }
  window.addEventListener('scroll', onViewing, true);
  window.addEventListener('resize', onViewing);
  window.addEventListener('load', onViewing);
```

- [ ] **Step 4: Implement the receiver** in `source-preview.ts` and export it from `index.ts`:

```ts
export interface PreviewViewing { page: PointPage; at?: number; sectionId?: string; label: string }
export function receivePreviewViewing(event: MessageEvent, frame: HTMLIFrameElement | null): PreviewViewing | null {
  const data = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || data?.type !== 'pagosya:source-viewing') return null;
  if (!POINT_PAGES.includes(data.page) || typeof data.label !== 'string' || data.label.length > 60) return null;
  if (data.at !== undefined && !validAt(data.at)) return null;
  if (data.sectionId !== undefined && (typeof data.sectionId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(data.sectionId))) return null;
  return { page: data.page, label: data.label, ...(data.at !== undefined ? { at: data.at } : {}), ...(data.sectionId ? { sectionId: data.sectionId } : {}) };
}
```

- [ ] **Step 5: Run** `cd packages/storefront-preview && npx vitest run` (the package is small) — PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(yapi): the preview always says which section is in the middle of the screen (spec 2026-11-05 point-at)"`

### Task 4: Studio — selection, chip, hint, payload, viewing

**Files:**
- Modify: `apps/merchant-studio/src/source-selection.ts`
- Modify: `apps/merchant-studio/src/source-studio.ts` (~68 `RetrySubmission`, ~135-220 selection, ~280 listener, ~745-820 send, ~891 estimate, ~993 pill, ~1151 toolbar; every `page = …` site)
- Modify: `apps/merchant-studio/src/api.ts:336-391`
- Test: `apps/merchant-studio/src/source-selection.test.ts` (and `source-selection-ui.test.ts` if it asserts «Sección:»)

**Interfaces:**
- Consumes: `PreviewSelection`, `PointArea`, `PointPage`, `PreviewViewing`, `receivePreviewViewing` from `@pagosya/storefront-preview`.
- Produces: `SectionSelection = { sectionId; label; at?; page?; area? }`; `SelectionPayload = { sectionId: string; at?: number; page?: PointPage; area?: PointArea }`; `ViewingPayload = { page: PointPage; at?: number; sectionId?: string }`; `selectionPayload(s)`, `selectionChipLabel(s)`, `viewingPayload(v)`, `createViewingState()`. `api.sendSourceMessage(…, selection?: SelectionPayload, currentPage?, onAccepted?, options?: { …; viewing?: ViewingPayload })`; `estimateSource` body gains `selection?: SelectionPayload; viewing?: ViewingPayload`.

- [ ] **Step 1: Write the failing tests** (append to `source-selection.test.ts`)

```ts
import { createViewingState, selectionChipLabel, selectionPayload, viewingPayload } from './source-selection';
const area = { points: [0, 0, 90, 0, 90, 90], rect: { x: 0, y: 0, width: 90, height: 90 }, sections: [{ page: 'home' as const, at: 1, label: 'Hola' }], texts: ['Hola'], photos: [], parts: [], width: 1280, pageQuery: 'index.html' };

it('keeps a template address and a circle, and sends them', () => {
  const state = createSelectionState();
  state.set({ sectionId: 'lb-1', label: 'Hola', at: 1, page: 'about' });
  expect(selectionPayload(state.get()!)).toEqual({ sectionId: 'lb-1', at: 1, page: 'about' });
  state.set({ sectionId: 'lb-1', label: 'Hola', area });
  expect(selectionPayload(state.get()!)).toEqual({ sectionId: 'lb-1', area });
  state.set({ sectionId: 'hero', label: 'Hola' });
  expect(selectionPayload(state.get()!)).toEqual({ sectionId: 'hero' });
});

it('labels a circle as a marked area', () => {
  expect(selectionChipLabel({ sectionId: 'lb-1', label: 'Hola' })).toBe('Hola');
  expect(selectionChipLabel({ sectionId: 'lb-1', label: 'Hola', area })).toBe('zona marcada · Hola');
});

it('remembers what the merchant is looking at until the page changes', () => {
  const viewing = createViewingState();
  viewing.set({ page: 'faq', at: 2, sectionId: 'lb-2', label: 'Preguntas' });
  expect(viewingPayload(viewing.get()!)).toEqual({ page: 'faq', at: 2, sectionId: 'lb-2' });
  viewing.clear();
  expect(viewing.get()).toBeNull();
});
```

The existing «holds and clears the selection» test keeps passing (`{ sectionId, label }` round-trips unchanged).

- [ ] **Step 2: Run** `cd apps/merchant-studio && npx vitest run src/source-selection.test.ts` — FAIL.
- [ ] **Step 3: Implement `source-selection.ts`:**

```ts
import type { PointArea, PointPage, PreviewViewing } from '@pagosya/storefront-preview';

export type SectionSelection = { sectionId: string; label: string; at?: number; page?: PointPage; area?: PointArea };
export type SelectionPayload = { sectionId: string; at?: number; page?: PointPage; area?: PointArea };
export type ViewingPayload = { page: PointPage; at?: number; sectionId?: string };

export function createSelectionState() {
  let current: SectionSelection | null = null;
  return {
    get: () => current,
    set(value: SectionSelection) {
      current = { sectionId: value.sectionId, label: value.label, ...(value.area ? { area: value.area } : typeof value.at === 'number' && value.page ? { at: value.at, page: value.page } : {}) };
    },
    clear() { current = null; },
  };
}
/** What a message carries about the pointed part (spec 2026-11-05 point-at): a circle, a template address, or a classic section id. */
export function selectionPayload(s: SectionSelection): SelectionPayload {
  return { sectionId: s.sectionId, ...(s.area ? { area: s.area } : typeof s.at === 'number' && s.page ? { at: s.at, page: s.page } : {}) };
}
export const selectionChipLabel = (s: SectionSelection) => s.area ? `zona marcada · ${s.label}` : s.label;
export const viewingPayload = (v: PreviewViewing): ViewingPayload => ({ page: v.page, ...(typeof v.at === 'number' ? { at: v.at } : {}), ...(v.sectionId ? { sectionId: v.sectionId } : {}) });
/** The section in the middle of the preview, kept per page (cleared when the page changes or reloads). */
export function createViewingState() {
  let current: PreviewViewing | null = null;
  return { get: () => current, set(value: PreviewViewing) { current = { ...value }; }, clear() { current = null; } };
}
```

- [ ] **Step 4: Wire `source-studio.ts`:**
  - Import `selectionChipLabel`, `selectionPayload`, `viewingPayload`, `createViewingState`, types `SelectionPayload`, `ViewingPayload`; and `receivePreviewViewing`, `type PreviewSelection` from `@pagosya/storefront-preview`.
  - `const viewing = createViewingState();` beside `const selection = createSelectionState();`.
  - `takeSelection(picked: PreviewSelection)`: `platform` → `platformHint = true` as today; `section`/`area` → `selection.set({ sectionId: picked.sectionId, label: picked.label || picked.sectionId, at: picked.at, page: picked.page, area: picked.area })`; only call the `matchEditableText` lookup when `picked.kind === 'section'`.
  - `selectionMarkup()`: chip text `Sobre: ${escape(selectionChipLabel(current))}`; pill at ~993: `selectionLabel: selection.get() ? selectionChipLabel(selection.get()!) : undefined`.
  - Toolbar `#source-select-mode` `title="Toca una sección o dibuja un círculo alrededor de lo que quieres cambiar"`.
  - Message listener, just before `const picked = receivePreviewSelection(...)`: `const looked = receivePreviewViewing(event, previewFrame); if (looked) { viewing.set(looked); return; }`.
  - Add `viewing.clear();` next to each `clearSelection()` that comes with a page change or reload (lines ~292, 512, 1269, 1276, 1282, 1374, 1493).
  - `RetrySubmission`: `selection?: SelectionPayload; viewing?: ViewingPayload`.
  - `send` (~745): `const submittedSelection: SelectionPayload | undefined = retry ? retry.selection : selection.get() ? selectionPayload(selection.get()!) : undefined;` `const submittedViewing: ViewingPayload | undefined = retry ? retry.viewing : !submittedSelection && viewing.get() ? viewingPayload(viewing.get()!) : undefined;` Pass `submittedSelection` straight to `api.sendSourceMessage` (drop the `{ sectionId: … }` rewrap) and `viewing: submittedViewing` in its options; the retry record (~820) stores `selection: submittedSelection, viewing: submittedViewing`.
  - Estimate (~891): `...(selection.get() ? { selection: selectionPayload(selection.get()!) } : viewing.get() ? { viewing: viewingPayload(viewing.get()!) } : {})`.
- [ ] **Step 5: `api.ts`:** `selection?: SelectionPayload` parameter; options type gains `viewing?: ViewingPayload`; POST body adds `...(options?.viewing ? { viewing: options.viewing } : {})` beside `selection`; `estimateSource` body type gets the same two fields.
- [ ] **Step 6: Run** `cd apps/merchant-studio && npx vitest run src/source-selection.test.ts src/source-selection-ui.test.ts src/source-studio.test.ts && npx tsc --noEmit -p .` — PASS. If `source-selection-ui.test.ts` expects «Sección:», change it to «Sobre:» (the spec's chip).
- [ ] **Step 7: Commit** `git commit -am "feat(studio): send what the merchant pointed at — template address, circle, or the section on screen (spec 2026-11-05 point-at)"`

### Task 5: API — DTOs and carriers

**Files:**
- Modify: `apps/api/src/storefront-source/dto/source-selection.dto.ts`, `dto/send-source-message.dto.ts:36-39`
- Modify: `apps/api/src/storefront-source/source-merchant-request.ts`, `source-draft-retry.ts`
- Test: `dto/source-selection.dto.spec.ts`, `source-merchant-request.spec.ts`, `source-draft-retry.spec.ts`

**Interfaces:**
- Produces: `POINT_PAGES`, `POINT_PARTS`, `SourcePointAreaDto`, `SourceSelectionDto { sectionId; at?; page?; area? }`, `SourceViewingDto { page; at?; sectionId? }`, `SendSourceMessageDto.viewing?`; `SourceMerchantRequest.selection?: { sectionId: string; at?: number; page?: string; area?: string }` (`area` = 12-char hash); `SourceDraftRetry.selection` carries `at`/`page`/`area`, and `viewing?`.

- [ ] **Step 1: Write the failing tests** (append to `source-selection.dto.spec.ts`)

```ts
import { SourceViewingDto } from './source-selection.dto';
const area = { points: [0, 0, 100, 0, 100, 100], rect: { x: 0, y: 0, width: 100, height: 100 }, sections: [{ page: 'home', at: 1, label: 'Hola' }], texts: ['Hola'], photos: ['/v1/uploads/a.jpg'], parts: ['menu'], width: 1280, pageQuery: 'producto.html?id=abc' };
describe('pointing (spec 2026-11-05 point-at)', () => {
  it('accepts a template address, a circle and a viewing', () => {
    expect(errors(SourceSelectionDto, { sectionId: 'lb-1', at: 1, page: 'about' })).toEqual([]);
    expect(errors(SourceSelectionDto, { sectionId: 'lb-1', area })).toEqual([]);
    expect(errors(SourceViewingDto, { page: 'faq', at: 2, sectionId: 'lb-2' })).toEqual([]);
    expect(errors(SendSourceMessageDto, { revision: 1, instruction: 'agrega una pregunta aquí', viewing: { page: 'faq', at: 2 } })).toEqual([]);
  });
  it.each([
    { at: 41, page: 'home' }, { at: 1, page: 'blog' },
    { area: { ...area, points: Array(130).fill(1) } }, { area: { ...area, points: [1, 'x', 2, 2, 3, 3] } }, { area: { ...area, texts: Array(13).fill('x') } },
    { area: { ...area, texts: ['x'.repeat(201)] } }, { area: { ...area, photos: Array(7).fill('/a.jpg') } }, { area: { ...area, photos: ['javascript:alert(1)'] } },
    { area: { ...area, parts: ['body'] } }, { area: { ...area, width: 279 } }, { area: { ...area, pageQuery: '../etc.html' } }, { area: { ...area, sections: Array(4).fill(area.sections[0]) } },
  ])('refuses %j', extra => { expect(errors(SourceSelectionDto, { sectionId: 'lb-1', ...extra })).not.toEqual([]); });
  it('refuses a viewing on an unknown page', () => { expect(errors(SourceViewingDto, { page: 'blog' })).not.toEqual([]); });
});
```

In `source-merchant-request.spec.ts`:

```ts
it('keeps a template address and the hash of a circle; two different circles are two requests', () => {
  const base = { revision: 2, instruction: 'hazla más corta', assetUrls: [] } as never;
  const at = sourceMerchantRequest({ ...(base as object), selection: { sectionId: 'lb-1', at: 1, page: 'home' } } as never);
  expect(at.selection).toEqual({ sectionId: 'lb-1', at: 1, page: 'home' });
  const one = sourceMerchantRequest({ ...(base as object), selection: { sectionId: 'lb-1', area: { points: [1, 1, 2, 2, 3, 3] } } } as never);
  const two = sourceMerchantRequest({ ...(base as object), selection: { sectionId: 'lb-1', area: { points: [9, 9, 2, 2, 3, 3] } } } as never);
  expect(one.selection?.area).toMatch(/^[a-f0-9]{12}$/);
  expect(sourceMerchantRequestKey(one)).not.toBe(sourceMerchantRequestKey(two));
});
```

In `source-draft-retry.spec.ts`:

```ts
it('carries a template address, a circle and a viewing back to the Studio', () => {
  const area = { points: [1, 1, 2, 2, 3, 3] };
  expect(sourceDraftRetry({ instruction: 'x', selection: { sectionId: 'lb-1', at: 1, page: 'faq', area }, viewing: { page: 'faq', at: 2 } }))
    .toMatchObject({ selection: { sectionId: 'lb-1', at: 1, page: 'faq', area }, viewing: { page: 'faq', at: 2 } });
  expect(sourceDraftRetry({ instruction: 'x', viewing: { page: 'blog' } })?.viewing).toBeUndefined();
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/dto/source-selection.dto.spec.ts src/storefront-source/source-merchant-request.spec.ts src/storefront-source/source-draft-retry.spec.ts` — FAIL.
- [ ] **Step 3: Implement `source-selection.dto.ts`:**

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const POINT_PAGES = ['home', 'product', 'about', 'contact', 'faq', 'shipping'] as const;
export const POINT_PARTS = ['header', 'announcement', 'footer', 'menu'] as const;
const FINITE = { allowNaN: false, allowInfinity: false };

export class SourcePointRectDto {
  @IsNumber(FINITE) @Min(0) @Max(100000) x!: number;
  @IsNumber(FINITE) @Min(0) @Max(100000) y!: number;
  @IsNumber(FINITE) @Min(0) @Max(100000) width!: number;
  @IsNumber(FINITE) @Min(0) @Max(100000) height!: number;
}
export class SourcePointSectionDto {
  @IsIn(POINT_PAGES) page!: (typeof POINT_PAGES)[number];
  @IsInt() @Min(0) @Max(40) at!: number;
  @IsString() @MaxLength(60) label!: string;
}
/** A loop the merchant drew around part of the preview (spec 2026-11-05 point-at). */
export class SourcePointAreaDto {
  @IsArray() @ArrayMinSize(6) @ArrayMaxSize(128) @IsNumber(FINITE, { each: true }) points!: number[];
  @ValidateNested() @Type(() => SourcePointRectDto) rect!: SourcePointRectDto;
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SourcePointSectionDto) sections!: SourcePointSectionDto[];
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(200, { each: true }) texts!: string[];
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) @Matches(/^(https?:\/\/|\/|assets\/)/, { each: true }) photos!: string[];
  @IsArray() @IsIn(POINT_PARTS, { each: true }) parts!: Array<(typeof POINT_PARTS)[number]>;
  @IsInt() @Min(280) @Max(2400) width!: number;
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,63}\.html(\?[A-Za-z0-9=&_.%-]{0,135})?$/) pageQuery!: string;
}

/** A section picked in the Studio preview; the id has the same shape the preview and the section scope accept. On a template
 *  store it also carries its address (page + number) or the circle drawn around it (spec 2026-11-05 point-at). */
export class SourceSelectionDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{0,47}$/) sectionId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(40) at?: number;
  @IsOptional() @IsIn(POINT_PAGES) page?: (typeof POINT_PAGES)[number];
  @IsOptional() @ValidateNested() @Type(() => SourcePointAreaDto) area?: SourcePointAreaDto;
}
/** The section in the middle of the preview when nothing is selected. */
export class SourceViewingDto {
  @IsIn(POINT_PAGES) page!: (typeof POINT_PAGES)[number];
  @IsOptional() @IsInt() @Min(0) @Max(40) at?: number;
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{0,47}$/) sectionId?: string;
}
```

`send-source-message.dto.ts`, under `selection`: `/** What the merchant had on screen (spec 2026-11-05 point-at). */ @IsOptional() @ValidateNested() @Type(() => SourceViewingDto) viewing?: SourceViewingDto;`. Run `grep -n "SourceSelectionDto" src/storefront-source/dto/*.ts src/storefront-source/*.controller.ts`; any other body that takes `selection` (the estimate) gets `viewing` the same way.

- [ ] **Step 4: Carriers.** `source-merchant-request.ts`:

```ts
  selection?: { sectionId: string; at?: number; page?: string; area?: string };
// sourceMerchantRequest:
    selection: input.selection ? { sectionId: input.selection.sectionId,
      ...(typeof input.selection.at === 'number' && input.selection.page ? { at: input.selection.at, page: input.selection.page } : {}),
      ...(input.selection.area ? { area: createHash('sha256').update(JSON.stringify(input.selection.area)).digest('hex').slice(0, 12) } : {}) } : undefined,
// sourceMerchantRequestKey: replace `selection: request.selection?.sectionId || null` with
    selection: request.selection ? [request.selection.sectionId, request.selection.page ?? null, request.selection.at ?? null, request.selection.area ?? null] : null,
```

`source-draft-retry.ts`:

```ts
const POINT_PAGES = ['home', 'product', 'about', 'contact', 'faq', 'shipping'];
const pointAt = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 40;
// type: selection?: { sectionId: string; at?: number; page?: string; area?: unknown }; viewing?: { page: string; at?: number; sectionId?: string };
// in the returned object, replace the selection line with:
    ...(typeof sectionId === 'string' && sectionId ? { selection: { sectionId,
      ...(pointAt(job.selection.at) && POINT_PAGES.includes(job.selection.page) ? { at: job.selection.at, page: job.selection.page } : {}),
      ...(job.selection.area && typeof job.selection.area === 'object' ? { area: job.selection.area } : {}) } } : {}),
    ...(job.viewing && POINT_PAGES.includes(job.viewing.page) ? { viewing: { page: job.viewing.page, ...(pointAt(job.viewing.at) ? { at: job.viewing.at } : {}),
      ...(typeof job.viewing.sectionId === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(job.viewing.sectionId) ? { sectionId: job.viewing.sectionId } : {}) } } : {}),
```

(The area is re-checked by the DTO when the Studio resends it. The chat job stores the whole input JSON, so `area` and `viewing` already reach the worker.)

- [ ] **Step 5: Run** the Step 2 command — PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(yapi): the API takes a template address, a circle and what the merchant is looking at (spec 2026-11-05 point-at)"`

### Task 6: The focus for the quick edit

**Files:**
- Create: `apps/api/src/storefront-source/source-point-focus.ts`
- Modify: `apps/api/src/storefront-source/source-layout-edit.ts` (`LAYOUT_EDIT_PROMPT`, line ~79; export `MENU_PAGE_URLS`)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts:357-377` (`editLayout`)
- Test: `apps/api/src/storefront-source/source-point-focus.spec.ts`; the spec that already calls `editLayout` against a mocked `fetch` (`grep -ln "editLayout(" apps/api/src/storefront-source/*.spec.ts`)

**Interfaces:**
- Consumes: `SourceSelectionDto`, `SourceViewingDto` (Task 5).
- Produces: `PointFocus = { pagina: string; secciones: number[]; textos: string[]; fotos: string[]; partes: string[]; mirando?: { pagina: string; at?: number } }`; `pointFocus(input: { instruction: string; selection?: SourceSelectionDto; viewing?: SourceViewingDto }): PointFocus | null`; `outsideFocus(ops: Array<{ page?: string; at: number }>, focus: PointFocus | null): string[]`; `DEICTIC`; `editLayout` input `focus?: PointFocus; picture?: Buffer`.

- [ ] **Step 1: Write the failing tests** (`source-point-focus.spec.ts`)

```ts
import { outsideFocus, pointFocus } from './source-point-focus';
const area = { points: [0, 0, 1, 0, 1, 1], rect: { x: 0, y: 0, width: 90, height: 90 }, sections: [{ page: 'home', at: 2, label: 'A' }, { page: 'home', at: 3, label: 'B' }], texts: ['Hola'], photos: ['/v1/uploads/a.jpg'], parts: ['menu'], width: 1280, pageQuery: 'index.html' } as never;

describe('pointFocus', () => {
  it('a clicked template section', () => {
    expect(pointFocus({ instruction: 'hazla más corta', selection: { sectionId: 'lb-1', at: 1, page: 'about' } }))
      .toEqual({ pagina: 'about', secciones: [1], textos: [], fotos: [], partes: [] });
  });
  it('a circle', () => {
    expect(pointFocus({ instruction: 'cambia esta foto', selection: { sectionId: 'lb-2', area } }))
      .toEqual({ pagina: 'home', secciones: [2, 3], textos: ['Hola'], fotos: ['/v1/uploads/a.jpg'], partes: ['menu'] });
  });
  it('what the merchant is looking at, only with «esto», «aquí»…', () => {
    expect(pointFocus({ instruction: 'agrega una pregunta aquí sobre arreglos', viewing: { page: 'faq', at: 2 } }))
      .toEqual({ pagina: 'faq', secciones: [], textos: [], fotos: [], partes: [], mirando: { pagina: 'faq', at: 2 } });
    expect(pointFocus({ instruction: 'agrega una pregunta sobre arreglos', viewing: { page: 'faq', at: 2 } })).toBeNull();
    expect(pointFocus({ instruction: 'la tienda está linda', viewing: { page: 'faq', at: 2 } })).toBeNull();
  });
  it('a classic store section (no address) is not a focus', () => {
    expect(pointFocus({ instruction: 'hazla más corta', selection: { sectionId: 'hero' } })).toBeNull();
  });
});

it('outsideFocus names ops on the focused page outside its sections', () => {
  const focus = pointFocus({ instruction: 'x', selection: { sectionId: 'lb-1', at: 1, page: 'home' } });
  expect(outsideFocus([{ at: 1 }, { at: 4 }, { page: 'about', at: 0 }], focus)).toEqual(['home:4']);
  expect(outsideFocus([{ at: 4 }], null)).toEqual([]);
});
```

In the `editLayout` spec: with `focus` the posted body's `input[0].content[0].text` parses to an object whose `foco` equals it; with `picture: Buffer.from('jpg')` `content[1]` is `{ type: 'input_image', image_url: 'data:image/jpeg;base64,anBn', detail: 'high' }`; without either, `content` has one item and no `foco`.

- [ ] **Step 2: Run** `npx jest src/storefront-source/source-point-focus.spec.ts` — FAIL (no module).
- [ ] **Step 3: Implement `source-point-focus.ts`:**

```ts
import type { SourceSelectionDto, SourceViewingDto } from './dto/source-selection.dto';

/** What the merchant pointed at in the preview (spec 2026-11-05 point-at), as the quick template edit reads it. */
export type PointFocus = { pagina: string; secciones: number[]; textos: string[]; fotos: string[]; partes: string[]; mirando?: { pagina: string; at?: number } };
/** «esto», «esta foto», «aquí», «acá»: the words that mean «what I'm looking at». «está» (the verb) never matches. */
export const DEICTIC = /(?<!\p{L})(?:esto|esta|este|estas|estos|aqu[ií]|ac[aá]|ah[ií])(?!\p{L})/iu;

export function pointFocus(input: { instruction: string; selection?: SourceSelectionDto; viewing?: SourceViewingDto }): PointFocus | null {
  const selection = input.selection;
  if (selection?.area) {
    const area = selection.area;
    const pagina = area.sections[0]?.page ?? 'home';
    return { pagina, secciones: area.sections.filter(s => s.page === pagina).map(s => s.at), textos: [...area.texts], fotos: [...area.photos], partes: [...area.parts] };
  }
  if (selection && typeof selection.at === 'number' && selection.page) return { pagina: selection.page, secciones: [selection.at], textos: [], fotos: [], partes: [] };
  if (selection) return null;
  if (input.viewing && DEICTIC.test(input.instruction)) {
    const { page, at } = input.viewing;
    return { pagina: page, secciones: [], textos: [], fotos: [], partes: [], mirando: { pagina: page, ...(typeof at === 'number' ? { at } : {}) } };
  }
  return null;
}

/** Ops that touched a section of the focused page outside the focus — logged, never blocked (the merchant may have named it). */
export function outsideFocus(ops: Array<{ page?: string; at: number }>, focus: PointFocus | null): string[] {
  if (!focus?.secciones.length) return [];
  return ops.filter(op => (op.page || 'home') === focus.pagina && op.at >= 0 && !focus.secciones.includes(op.at)).map(op => `${focus.pagina}:${op.at}`);
}
```

- [ ] **Step 4: Prompt rule.** Append to the end of `LAYOUT_EDIT_PROMPT` (inside the template string, as new lines):

```
«foco» (si viene) es lo que el comercio señaló en la vista previa: «pagina» (home, product, about, contact, faq, shipping), «secciones»
(los números at de esa página), los «textos» y «fotos» dentro de la zona que marcó y «partes» (header, announcement, footer, menu).
Palabras como esto, esta, este, aquí, acá, este título, esta foto se refieren al foco. Cambia solo las secciones del foco, salvo que el
pedido nombre otras; en una página del menú tus ops llevan page con esa página. Si viene una imagen, la línea dibujada en ella marca la
parte. «mirando» es la sección que el comercio tenía en pantalla: úsala solo para esas palabras. Si «partes» es lo único del foco, el
cambio es del menú, la cinta de anuncio o el pie: va en «store».
```

Also `export` the existing `MENU_PAGE_URLS` constant in `source-layout-edit.ts` (Task 7 uses it).

- [ ] **Step 5: `editLayout`.** Input type adds `focus?: PointFocus; picture?: Buffer` (import the type). In `body`, before `pedido`: `...(input.focus ? { foco: input.focus } : {}),`. Replace the inline content array with:

```ts
    const content: Array<Record<string, string>> = [{ type: 'input_text', text: JSON.stringify(body) }];
    // Spec 2026-11-05 point-at: the circled area with the merchant's loop drawn on it.
    if (input.picture) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${input.picture.toString('base64')}`, detail: 'high' });
```

and use `input: [{ role: 'user', content }]` in the fetch body.

- [ ] **Step 6: Run** `npx jest src/storefront-source/source-point-focus.spec.ts src/storefront-source/source-layout-edit.spec.ts <the editLayout spec>` — PASS.
- [ ] **Step 7: Commit** `git add -A apps/api/src/storefront-source && git commit -m "feat(yapi): the quick template edit reads what the merchant pointed at (foco, picture) (spec 2026-11-05 point-at)"`

### Task 7: Route pointed requests on template stores to the quick edit

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (~1986 `templateHome`; `templateLayoutEdit` 1108-1160)
- Test: `apps/api/src/storefront-source/source-chat-store-edit.spec.ts`, `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Consumes: `pointFocus`, `outsideFocus` (Task 6), `MENU_PAGE_URLS` (Task 6).
- Produces: `templateLayoutEdit` passes `focus` to `editLayout`; the `template_layout_edit` log gains `focus` and `outsideFocus`.

- [ ] **Step 1: Write the failing tests.** In `source-chat-store-edit.spec.ts`, after `edit`:

```ts
const pointed = (instruction: string, extra: Record<string, unknown>) => chat.templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction, revision: 5, assetUrls: [], ...extra }, 5, home);

it('sends what the merchant pointed at, and logs an op outside it', async () => {
  editLayout.mockResolvedValue(read({ ops: [{ op: 'text', at: 1, field: 'title', value: 'Más corto', item: -1 }] }));
  const log = jest.spyOn((chat as any).productLogger, 'log');
  await pointed('hazla más corta', { selection: { sectionId: 'lb-0', at: 0, page: 'home' } });
  expect(editLayout.mock.calls[0][1].focus).toEqual({ pagina: 'home', secciones: [0], textos: [], fotos: [], partes: [] });
  expect(log.mock.calls.map(call => String(call[0])).find(line => line.includes('template_layout_edit'))).toContain('"outsideFocus":["home:1"]');
});

it('the section on screen reaches the edit only with «aquí»', async () => {
  editLayout.mockResolvedValue(read());
  await pointed('agrega una pregunta aquí', { viewing: { page: 'home', at: 1 } });
  await pointed('agrega una pregunta', { viewing: { page: 'home', at: 1 } });
  expect(editLayout.mock.calls[0][1].focus).toMatchObject({ mirando: { pagina: 'home', at: 1 } });
  expect(editLayout.mock.calls[1][1].focus).toBeUndefined();
});
```

(Shape the `ops` entry like the other tests in that file do — copy one of their `read({ ops: [...] })` entries and set `at: 1`.) In `source-chat-master.spec.ts`, inside the describe that has `say()` and a template store, add:

```ts
  it('a clicked section of a template store goes to the quick edit, never the code generator or a plan', async () => {
    const quick = jest.spyOn(chat, 'templateLayoutEdit').mockResolvedValue({ revision: 4 } as never);
    await chat.send('m1', 's1', { revision: 3, instruction: 'hazla más corta', requestId: uuid(), selection: { sectionId: 'lb-0', at: 0, page: 'home' } });
    expect(quick).toHaveBeenCalledWith('m1', 's1', expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ selection: { sectionId: 'lb-0', at: 0, page: 'home' } }), 3, expect.any(Array));
    expect(pickTemplate).not.toHaveBeenCalled();
  });
```

(The `decide` mock in that describe must answer `editKind: 'content'` for this instruction; set it with `decide.mockResolvedValueOnce({ ...<that file's default decision>, editKind: 'content' })` if the default is not.)

- [ ] **Step 2: Run** `npx jest src/storefront-source/source-chat-store-edit.spec.ts src/storefront-source/source-chat-master.spec.ts -t "pointed|aquí|clicked section"` — FAIL.
- [ ] **Step 3: Implement.**
  - ~1986: delete `!input.selection && ` from the `templateHome` condition and add above it `// Spec 2026-11-05 point-at: a clicked or circled part of a template store is a quick edit too (it went to the code generator).`
  - `templateLayoutEdit`, before the `menuPagesFor` line: `const focus = pointFocus({ instruction: input.instruction, selection: input.selection, viewing: input.viewing });` and `const focusPage = focus && (MENU_PAGES as readonly string[]).includes(focus.pagina) ? MENU_PAGE_URLS[focus.pagina as MenuPage] : undefined;` then `menuPagesFor(pages, input.instruction, focusPage ?? input.currentPage)`; pass `...(focus ? { focus } : {})` to `editLayout`.
  - The `template_layout_edit` log object gains `focus: focus ? { pagina: focus.pagina, secciones: focus.secciones, partes: focus.partes, mirando: Boolean(focus.mirando) } : null, outsideFocus: outsideFocus(read.ops, focus)`.
- [ ] **Step 4: Run** `npx jest src/storefront-source/source-chat-store-edit.spec.ts src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-layout-edit.spec.ts src/storefront-source/source-point-focus.spec.ts` — PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(yapi): a pointed request on a template store goes to the quick edit with its focus (spec 2026-11-05 point-at)"`

### Task 8: The picture of the circled area

**Files:**
- Modify: `apps/api/src/storefront-source/source-thumbnails.service.ts`
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (constructor ~271, `templateLayoutEdit`)
- Test: `apps/api/src/storefront-source/source-thumbnails.service.spec.ts`, `source-chat-store-edit.spec.ts`

**Interfaces:**
- Consumes: `SourcePointAreaDto` (Task 5), `editLayout` `picture` (Task 6), `pointed()` helper (Task 7).
- Produces: `regionClip(area: { rect: { x; y; width; height }; width: number }): { x: number; y: number; width: number; height: number }`; `SourceThumbnailsService.region(merchantId, storeId, revision, area: { pageQuery: string; width: number; rect; points: number[] }): Promise<Buffer>`; `SourceChatService` constructor's last parameter `@Optional() thumbnails?: SourceThumbnailsService`.

- [ ] **Step 1: Write the failing tests.** In `source-thumbnails.service.spec.ts`:

```ts
it('clips the circled rect plus 48 px, inside the page, never past 1400 × 1000', () => {
  const { regionClip } = require('./source-thumbnails.service');
  expect(regionClip({ rect: { x: 100, y: 200, width: 300, height: 100 }, width: 1280 })).toEqual({ x: 52, y: 152, width: 396, height: 196 });
  expect(regionClip({ rect: { x: 10, y: 10, width: 3000, height: 3000 }, width: 1280 })).toEqual({ x: 0, y: 0, width: 1280, height: 1000 });
  expect(regionClip({ rect: { x: 1200, y: 0, width: 200, height: 50 }, width: 1280 })).toEqual({ x: 1152, y: 0, width: 128, height: 98 });
});
```

In `source-chat-store-edit.spec.ts`:

```ts
const circle = { points: [0, 0, 90, 0, 90, 90], rect: { x: 0, y: 0, width: 90, height: 90 }, sections: [{ page: 'home', at: 0, label: 'Gelato' }], texts: [], photos: [], parts: [], width: 1280, pageQuery: 'index.html' };
it('a circle sends a picture of the area; a failed picture still edits, without it', async () => {
  editLayout.mockResolvedValue(read());
  const region = jest.fn().mockResolvedValueOnce(Buffer.from('jpg')).mockRejectedValueOnce(new Error('browser died'));
  (chat as any).thumbnails = { region };
  await pointed('cambia esta foto', { selection: { sectionId: 'lb-0', area: circle } });
  expect(region).toHaveBeenCalledWith('m1', 's1', 5, expect.objectContaining({ pageQuery: 'index.html', width: 1280 }));
  expect(editLayout.mock.calls[0][1].picture).toEqual(Buffer.from('jpg'));
  await pointed('cambia esta foto', { selection: { sectionId: 'lb-0', area: circle } });
  expect(editLayout.mock.calls[1][1].picture).toBeUndefined();
});
it('a picture that takes longer than 20 s is dropped', async () => {
  jest.useFakeTimers();
  editLayout.mockResolvedValue(read());
  (chat as any).thumbnails = { region: jest.fn(() => new Promise(() => undefined)) };
  const done = pointed('cambia esta foto', { selection: { sectionId: 'lb-0', area: circle } });
  await jest.advanceTimersByTimeAsync(20_001);
  await done;
  expect(editLayout.mock.calls[0][1].picture).toBeUndefined();
  jest.useRealTimers();
});
it('a click (no circle) never draws a picture', async () => {
  editLayout.mockResolvedValue(read());
  const region = jest.fn(); (chat as any).thumbnails = { region };
  await pointed('hazla más corta', { selection: { sectionId: 'lb-0', at: 0, page: 'home' } });
  expect(region).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run** `npx jest src/storefront-source/source-thumbnails.service.spec.ts src/storefront-source/source-chat-store-edit.spec.ts` — FAIL.
- [ ] **Step 3: Implement `source-thumbnails.service.ts`.** Add (exported, above the class):

```ts
/** The part of the page a circle covers (spec 2026-11-05 point-at): its box plus 48 px, inside the page, at most 1400 × 1000. */
export function regionClip(area: { rect: { x: number; y: number; width: number; height: number }; width: number }) {
  const x = Math.max(0, Math.round(area.rect.x - 48)), y = Math.max(0, Math.round(area.rect.y - 48));
  const width = Math.min(1400, area.width - x, Math.round(area.rect.x + area.rect.width + 48) - x);
  const height = Math.min(1000, Math.round(area.rect.y + area.rect.height + 48) - y);
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}
```

Refactor `draw` so the browser part is shared: move everything from `currentSourceRuntime(stored)` to `await page.waitForTimeout(1200)` into

```ts
  private async withStorePage<T>(merchantId: string, storeId: string, stored: SourceProjectSnapshot, viewport: { width: number; height: number }, pageQuery: string, use: (page: import('playwright').Page) => Promise<T>): Promise<T>
```

with `viewport` replacing the fixed 1280 × 800, `const [path, query = ''] = pageQuery.split('?');`, the init script taking the query (`context.addInitScript(q => { const w = window as unknown as Record<string, unknown>; w.PAGOSYA_PREVIEW_QUERY = q ? `?${q}` : ''; w.PAGOSYA_PREVIEW = true; w.PAGOSYA_HOSTED = false; window.open = () => null; }, query)`), `page.goto(`${ORIGIN}/${path}`)`, then `return await use(page)`; the `catch` (logs `store_thumbnail_failed` only for `draw`; `region` logs its own) and `finally` (deadline + `browser.close()`) stay. `draw` becomes:

```ts
  private async draw(merchantId: string, storeId: string, stored: SourceProjectSnapshot): Promise<Buffer> {
    try {
      const shot = await this.withStorePage(merchantId, storeId, stored, { width: 1280, height: 800 }, 'index.html', page => page.screenshot({ type: 'png', timeout: 10_000 }));
      return await sharp(shot).resize({ width: 640 }).jpeg({ quality: 74 }).toBuffer();
    } catch (error) {
      this.logger.warn(JSON.stringify({ event: 'store_thumbnail_failed', storeId, reason: (error as Error).message.slice(0, 200) }));
      throw error;
    }
  }
```

and add:

```ts
  /** A circled area of a saved revision with the merchant's loop drawn on it (spec 2026-11-05 point-at). Not cached, never stored. */
  async region(merchantId: string, storeId: string, revision: number, area: { pageQuery: string; width: number; rect: { x: number; y: number; width: number; height: number }; points: number[] }): Promise<Buffer> {
    const saved = await this.projects.version(merchantId, storeId, revision);
    const clip = regionClip(area);
    const job = this.queue.then(() => this.withStorePage(merchantId, storeId, saved.snapshot as unknown as SourceProjectSnapshot, { width: area.width, height: 900 }, area.pageQuery, async page => {
      await page.evaluate(points => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('style', `position:absolute;left:0;top:0;width:${document.documentElement.scrollWidth}px;height:${document.documentElement.scrollHeight}px;pointer-events:none;z-index:2147483647;overflow:visible`);
        const list: string[] = []; for (let i = 0; i < points.length; i += 2) list.push(`${points[i]},${points[i + 1]}`);
        svg.innerHTML = `<polyline points="${list.join(' ')}" fill="none" stroke="#fff" stroke-width="8"/><polyline points="${list.join(' ')}" fill="none" stroke="#e11d48" stroke-width="4"/>`;
        document.body.appendChild(svg);
      }, area.points);
      return page.screenshot({ type: 'png', fullPage: true, clip, timeout: 10_000 });
    })).then(shot => sharp(shot).resize({ width: Math.min(1024, clip.width), withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer());
    this.queue = job.catch(() => undefined);
    return job;
  }
```

(`points` are finite numbers and `pageQuery` matches the DTO regex, so nothing the merchant sends becomes markup or leaves `ORIGIN`.)

- [ ] **Step 4: Wire `source-chat.service.ts`.** Import `SourceThumbnailsService`; constructor gets `@Optional() private readonly thumbnails?: SourceThumbnailsService` after `plans` (it is already a provider in `storefront-source.module.ts` and does not depend on `SourceChatService`). In `templateLayoutEdit`, first thing after reading `files`:

```ts
    // Spec 2026-11-05 point-at: a circle comes with a picture of the area, drawn beside the store-state read, at most 20 s.
    const area = input.selection?.area;
    const picture: Promise<Buffer | null> = area && this.thumbnails ? (() => {
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<null>(resolve => { timer = setTimeout(() => { this.productLogger.warn(JSON.stringify({ event: 'point_picture_failed', storeId, reason: 'timeout' })); resolve(null); }, 20_000); });
      const drawn = this.thumbnails!.region(merchantId, storeId, revision, area).catch(error => {
        this.productLogger.warn(JSON.stringify({ event: 'point_picture_failed', storeId, reason: String((error as Error)?.message ?? error).slice(0, 200) }));
        return null;
      });
      return Promise.race([drawn, late]).finally(() => clearTimeout(timer));
    })() : Promise.resolve(null);
```

Right before `this.dialogue.editLayout(...)`: `const shot = await picture;` and pass `...(shot ? { picture: shot } : {})`.

- [ ] **Step 5: Run** `npx jest src/storefront-source/source-thumbnails.service.spec.ts src/storefront-source/source-chat-store-edit.spec.ts src/storefront-source/source-chat-master.spec.ts` — PASS. Then `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json` — no errors.
- [ ] **Step 6: Commit** `git commit -am "feat(yapi): a circle sends YAPI a picture of the area with the loop drawn on it (spec 2026-11-05 point-at)"`

### Task 9: Live check

**Files:** none in the repo; notes in `.superpowers/sdd/2026-11-05-point-at/live.md`.

- [ ] **Step 1:** Stack on the ChatGPT plan (`ps aux | grep chatgpt-plan` shows `node scripts/chatgpt-plan.mjs dev`; never plain `pnpm dev`). Rebuild the Studio bundle the dashboard serves (merchant-dashboard/public/studio). Before saving any API file, check no YAPI job is RUNNING.
- [ ] **Step 2:** In the Studio, on NOA VARGAS `9wj1ec11` (Gumdrop), NOA `qg4wudkg` (Pecas) or `nvkv5rvk`, and a store with a sectioned «Nosotros» (BOXY `izomtsx0` or rhode `bwne3ayi`):
  1. «Seleccionar» → click the story section → «hazla más corta».
  2. Circle a photo inside a section → «cambia esta foto por otra del Vestido Cala».
  3. Circle a title → «más corto».
  4. Scroll to the FAQ, nothing selected → «agrega una pregunta aquí sobre arreglos».
  5. Circle the menu bar → «agrega Novias al menú».
  6. Open «Nosotros», click its first section → «hazla más bonita».
- [ ] **Step 3:** For each: only that part changed (`node examples/full-stores-2026-11-02/layout.cjs <key>` before/after), it took seconds, the API log has `template_layout_edit` with `focus` and an empty `outsideFocus`, and circles have no `point_picture_failed`. Write the results, failures included, to the notes file and report them to the owner.
