# Lively One-Product Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stores on the Único template feel alive like https://nubecorp.pages.dev — button feel, a buy bar that follows the
shopper, pills over the product photo, photo hotspots, a two-row chip band, a pinging corner bubble — with YAPI writing the words
and choosing a colourful or calm mood per product.

**Architecture:** Motion behaviour lives in the storefront kit (one new runtime part `look/lively.js`, plus small changes to the
product block and its sticky bar), switched on by `[data-pya-lively]`, which Esencial's Shell sets only for the Único theme. Two new
section-library sections (`detail-hotspots`, `chips-marquee`) and the product hero's pills are filled by the existing section
library call, which also returns the mood saved as `variants.mood`.

**Tech Stack:** Kit runtime = plain JS parts concatenated into `kit/commerce.js` by `tools/build-commerce.mjs`; templates = React TSX
(Esencial); API = NestJS + Jest; browser tests = Playwright Chromium inside Jest.

**Spec:** `docs/superpowers/specs/2026-11-03-lively-one-product-stores-design.md`

## Global Constraints

- Only stores whose `variants.theme` is `unico`; other templates and stores already built do not change.
- Mood values are exactly `colourful` and `calm`; default `calm`. `isPlayfulBusiness(...)` true forces `colourful`.
- Pills: ≤ 3, each ≤ 32 characters. Chips: 6–10 phrases, each ≤ 48 characters. Hotspot notes: ≤ 3, each ≤ 60 characters.
  An item over its cap is dropped, never cut mid-word.
- No invented facts: every number in a pill, chip or hotspot note must appear in the merchant's own words/notes; anything without
  a fact is empty, and an empty part is left out.
- Every animation stops under `prefers-reduced-motion: reduce`; only `transform`/`opacity`/`box-shadow` animate.
- WhatsApp bubble and assistant bubble never both show.
- Owner rules: no text-only sections, no dark text-only bands, calm mood keeps one accent.
- `apps/api` edits restart `nest --watch` (spec files too) and interrupt running YAPI jobs: check
  `StoreSourceChatJob` has no `RUNNING`/`QUEUED` row before saving any file under `apps/api/src`.
- Never edit `kit/commerce.js` by hand: edit `commerce-src/` parts, then `node packages/storefront-kit/tools/build-commerce.mjs`.
- Template contract suite needs `NODE_OPTIONS=--max-old-space-size=6144`; Jest `-t` joins describe/it names with a space.
- The working tree holds unrelated uncommitted work: every commit names its paths (`git commit -m … -- <paths>`).

## Review Focus

1. A product with options not chosen yet: the buy bar's button must say «Elegir opciones» and scroll back to the options, on
   laptops too (today's logic only ran on phones). — pinned in Task 3.
2. A store with a logo image: no letter splitting, the image stays. — pinned in Task 5 (calm/colourful markup test uses the demo,
   which has no logo; add a logo case there).
3. A long store name (≥ 24 characters) in colourful mood on a 390 px phone: header must not scroll sideways. — pinned in Task 8.
4. A model answer that invents a delivery time («Entrega 24–48 h») the merchant never wrote: the pill is dropped. — pinned in Task 6.
5. A hotspot point at the photo's edge (x = 0 or 100): clamped inside so the «+» and its note stay on screen. — pinned in Task 6.

---

### Task 1: Esencial switches — mood variant, lively flag, lettered wordmark, button DNA

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (master.variants: add `"mood": ["calm", "colourful"]`)
- Modify: `packages/store-templates/templates/esencial/components/Shell.tsx:75` and `:197`
- Modify: `apps/api/src/storefront-source/source-master.ts:214-218` (`masterDnaLook`)
- Test: `apps/api/src/storefront-source/source-master-lively.spec.ts` (create)

**Interfaces:**
- Produces: `variants.mood` accepted by `refillMasterFiles` (it keeps only ids listed in `master.variants`); the root `.es` element
  carries `data-es-mood="calm|colourful"` always and `data-pya-lively=""` when `variants.theme === 'unico'`;
  `masterDnaLook({ theme: 'unico', ... })` returns `hover: 'lift', press: 'squash'` in addition to button/radius.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/storefront-source/source-master-lively.spec.ts
import { templateManifest } from '@pagosya/store-templates';
import { masterDnaLook } from './source-master';

describe('lively one-product stores: Esencial switches (spec 2026-11-03)', () => {
  it('lists the mood variant', () => {
    expect(templateManifest('esencial')!.master!.variants!.mood).toEqual(['calm', 'colourful']);
  });
  it('gives Único buttons a lift on hover and a squash on press', () => {
    expect(masterDnaLook({ theme: 'unico', button: 'pill', corners: 'round' } as never)).toEqual({ button: 'pill', radius: 'round', hover: 'lift', press: 'squash' });
    expect(masterDnaLook({ theme: 'calma', button: 'pill' } as never)).toEqual({ button: 'pill' });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-master-lively.spec.ts`
Expected: FAIL — `mood` undefined; `masterDnaLook` lacks hover/press.

- [ ] **Step 3: Implement**

`template.json` → inside `master.variants`, after `"theme": [...]`, add `"mood": ["calm", "colourful"],`.

`source-master.ts`:

```ts
export function masterDnaLook(variants: Partial<MasterVariants> | undefined): Record<string, string> {
  const button = DNA_BUTTON[String(variants?.button)];
  const radius = DNA_RADIUS[String(variants?.corners)];
  // Lively one-product stores (spec 2026-11-03): Único's buttons lift on hover and squash on press, like nubecorp's.
  const lively = variants?.theme === 'unico' ? { hover: 'lift', press: 'squash' } : {};
  return { ...(button ? { button } : {}), ...(radius ? { radius } : {}), ...lively };
}
```

`Shell.tsx` line 197 — add two attributes to the root `<div className="es" ...>`:

```tsx
data-es-mood={variant('mood', 'calm')} data-pya-lively={variant('theme', 'none') === 'unico' ? '' : undefined}
```

`Shell.tsx` line 75 — replace `{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}` with `<Wordmark />`, and add
above `Header`:

```tsx
/** Lively one-product stores (spec 2026-11-03): in the colourful mood a store with no logo image shows its name letter by letter,
 *  each letter coloured and bobbing (theme CSS); screen readers read the name once. */
function Wordmark() {
  if (store.logo) return <img src={store.logo} alt={store.name} />;
  if (variant('mood', 'calm') !== 'colourful') return <>{store.name}</>;
  return <><span className="lb-visually-hidden">{store.name}</span><span className="es-logo__letters" aria-hidden="true">
    {[...store.name].map((letter, at) => <span key={at} style={{ ['--i' as string]: at } as CSSProperties}>{letter === ' ' ? ' ' : letter}</span>)}
  </span></>;
}
```

(`CSSProperties` — add to the existing `react` import in Shell.tsx if missing. `lb-visually-hidden` lives in the library CSS; if
Shell's pages can render without it, use the Esencial skip-link's hiding class instead — check `.es-skip` in globals.css.)

- [ ] **Step 4: Run the test**

Run: `cd apps/api && npx jest src/storefront-source/source-master-lively.spec.ts && npx tsc -p tsconfig.json --noEmit --incremental false | grep -c "error TS"`
Expected: PASS; `0`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(unico): mood variant, lively flag, lettered wordmark and lift/squash buttons for one-product stores" -- packages/store-templates/templates/esencial/template.json packages/store-templates/templates/esencial/components/Shell.tsx apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-master-lively.spec.ts
```

---

### Task 2: Kit part `look/lively.js` — glow, add-button pulse, bubble ripple, WhatsApp bubble

**Files:**
- Create: `packages/storefront-kit/commerce-src/look/lively.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (PARTS: insert `'look/lively.js'` right after `'look/motion-pieces.js'`)
- Regenerate: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-lively.spec.ts` (create)

**Interfaces:**
- Consumes: `[data-pya-lively]` (Task 1); kit shared-scope `store` (shared/state.js line 14: `store.checkoutMode`, `store.contactPhone`).
- Produces: `:root[data-pya-lively]`; `.product-detail__buy[data-pya-pulse]` until the button has been scrolled past once;
  `a.pya-wa[href^="https://wa.me/"]` when `store.checkoutMode === 'whatsapp'`, the phone has ≥ 7 digits, there is no
  `[data-pagosya-assistant]` and the page is not a checkout.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/storefront-source/source-commerce-lively.spec.ts
jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';

/** Lively one-product stores (spec 2026-11-03): kit behaviour under [data-pya-lively], read in Chromium. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEM = { id: 'sofa', name: 'Sofá cama plegable', amount: 300000, currency: 'BOB', stock: 5, imageUrls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='] };
const PAGE = (extra = '') => `<div class="es" data-pya-lively><div data-pagosya-product-page data-product-id="sofa"${extra}></div><div style="height:2400px"></div><footer>pie</footer></div><section data-pagosya-cart></section>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { body?: string; data?: Record<string, unknown>; width?: number; reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 800 }, reducedMotion: options.reducedMotion ?? 'no-preference' });
  const config = { slug: 'sofa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Sofá Nube', items: [ITEM], ...options.data } };
  await page.setContent(`<!doctype html><html lang="es"><head></head><body>${options.body ?? PAGE()}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  await page.waitForSelector('.product-detail__buy');
  return page;
}

describe('lively runtime', () => {
  it('marks the page, pulses the product add button until it is scrolled past', async () => {
    const page = await open();
    try {
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pya-lively'))).toBe(true);
      expect(await page.locator('.product-detail__buy[data-pya-pulse]').count()).toBe(1);
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForFunction(() => !document.querySelector('.product-detail__buy[data-pya-pulse]'));
    } finally { await page.close(); }
  });

  it('shows a WhatsApp bubble for a WhatsApp store with no assistant, never next to the assistant', async () => {
    const page = await open({ data: { checkoutMode: 'whatsapp', contactPhone: '+591 700 12345' } });
    try {
      await page.waitForSelector('a.pya-wa');
      expect(await page.getAttribute('a.pya-wa', 'href')).toBe('https://wa.me/59170012345');
      await page.evaluate(() => { const box = document.createElement('div'); box.setAttribute('data-pagosya-assistant', ''); document.body.append(box); });
      await page.waitForFunction(() => !document.querySelector('a.pya-wa'));
    } finally { await page.close(); }
  });

  it('stands still with reduced motion', async () => {
    const page = await open({ reducedMotion: 'reduce' });
    try {
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.product-detail__buy')!).animationName)).toBe('none');
    } finally { await page.close(); }
  });

  it('lifts the WhatsApp bubble above a visible buy bar', async () => {
    const page = await open({ width: 390, data: { checkoutMode: 'whatsapp', contactPhone: '70012345' } });
    try {
      await page.waitForSelector('a.pya-wa');
      await page.evaluate(() => { const bar = document.querySelector('[data-product-sticky]') as HTMLElement; bar.hidden = false; });
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--pya-lift').trim() !== '0px');
    } finally { await page.close(); }
  });

  it('does nothing without [data-pya-lively]', async () => {
    const page = await open({ body: PAGE().replace(' data-pya-lively', ''), data: { checkoutMode: 'whatsapp', contactPhone: '70012345' } });
    try {
      expect(await page.locator('.product-detail__buy[data-pya-pulse], a.pya-wa').count()).toBe(0);
    } finally { await page.close(); }
  });
});
```

(Read `commerce-src/shared/state.js:14` first: if `checkoutMode`/`contactPhone` are not taken from `config.data`, put them in the
test config where `store` reads them.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-lively.spec.ts`
Expected: FAIL — no `data-pya-lively` on the root, no pulse, no `.pya-wa`.

- [ ] **Step 3: Implement the part**

```js
  // Lively one-product stores (spec 2026-11-03, after nubecorp.pages.dev): only on a page that carries [data-pya-lively] (Esencial's
  // Único theme). Buttons glow in the accent, the product's own add button pulses until the shopper has scrolled past it once, the
  // corner bubble ripples, and a WhatsApp store with no assistant gets a WhatsApp bubble. Everything stands still with reduced motion.
  (function lively() {
    if (!document.querySelector('[data-pya-lively]')) return;
    const rootEl = document.documentElement;
    rootEl.setAttribute('data-pya-lively', '');
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-lively', '');
    style.textContent = `@layer pagosya-motion{
      :root[data-pya-lively] :is(.es-btn,.checkout-button){transition:transform .2s cubic-bezier(.2,.9,.2,1),box-shadow .2s}
      :root[data-pya-lively] :is(.es-btn,.checkout-button):not(:disabled){box-shadow:0 12px 26px -14px color-mix(in srgb,var(--kit-accent,var(--es-accent,#2457c5)) 75%,transparent)}
      @media (hover:hover){:root[data-pya-lively] .es-btn:hover{transform:translateY(-2px)}}
      :root[data-pya-lively] .es-btn:active{transform:scale(.96)}
      .pya-wa{position:fixed;right:24px;bottom:calc(24px + var(--pya-lift,0px));z-index:1000;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;box-shadow:0 10px 26px -10px #25d366b3}
      .pya-wa svg{width:28px;height:28px}
      @media (max-width:560px){.pya-wa{right:16px;bottom:calc(16px + var(--pya-lift,0px))}}
      @media (prefers-reduced-motion:no-preference){
        :root[data-pya-lively] .product-detail__buy[data-pya-pulse]:not(:disabled){animation:pya-pulse 4s ease-in-out infinite}
        :root[data-pya-lively] [data-pagosya-assistant] .pya-launcher{animation:pya-ripple 2.4s ease-out infinite}
        .pya-wa{animation:pya-ripple-wa 2.4s ease-out infinite}
      }
      @keyframes pya-pulse{0%,84%,100%{transform:none}92%{transform:scale(1.04)}}
      @keyframes pya-ripple{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--kit-accent,#20211d) 45%,transparent),0 8px 24px rgba(0,0,0,.18)}100%{box-shadow:0 0 0 16px transparent,0 8px 24px rgba(0,0,0,.18)}}
      @keyframes pya-ripple-wa{0%{box-shadow:0 0 0 0 #25d36673}100%{box-shadow:0 0 0 16px #25d36600}}
    }`;
    document.head.append(style);
    // The pulse stops for good once the button has left the screen upwards.
    const pulsed = new WeakSet();
    const watchBuy = () => document.querySelectorAll('[data-pagosya-product-page] .product-detail__buy').forEach(buy => {
      if (pulsed.has(buy)) return;
      pulsed.add(buy); buy.setAttribute('data-pya-pulse', '');
      if (typeof IntersectionObserver !== 'function') return;
      const seen = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting && entry.boundingClientRect.bottom <= 0) { buy.removeAttribute('data-pya-pulse'); seen.disconnect(); }
      }));
      seen.observe(buy);
    });
    // WhatsApp bubble: a WhatsApp store, a number, no assistant, not the checkout.
    const phone = String(store.contactPhone || '').replace(/\D/g, '');
    const bubble = () => {
      const wa = document.querySelector('a.pya-wa');
      const wanted = store.checkoutMode === 'whatsapp' && phone.length >= 7 && !document.querySelector('[data-pagosya-assistant]') && !document.querySelector('[data-pagosya-checkout],.pya-checkout');
      if (wanted && !wa) {
        const link = document.createElement('a');
        link.className = 'pya-wa'; link.href = `https://wa.me/${phone}`; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Escríbenos por WhatsApp');
        link.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>';
        document.body.append(link);
      } else if (!wanted && wa) wa.remove();
    };
    // The corner bubble rides above the buy bar when it shows (chat.js does this only for its own launcher).
    const lift = () => { const bar = document.querySelector('[data-product-sticky]'); rootEl.style.setProperty('--pya-lift', !bar || bar.hidden ? '0px' : Math.ceil(bar.getBoundingClientRect().height + 12) + 'px'); };
    watchBuy(); bubble(); lift();
    new MutationObserver(() => { watchBuy(); bubble(); lift(); }).observe(document.body || rootEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  })();
```

`build-commerce.mjs` PARTS: `'look/motion-pieces.js',` → `'look/motion-pieces.js',` + new line `'look/lively.js',`.

Run: `node packages/storefront-kit/tools/build-commerce.mjs`

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-lively.spec.ts && cd ../../packages/storefront-kit && npm test`
Expected: PASS; kit build check and runtime checks pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): lively part — accent glow, add-button pulse, bubble ripple, WhatsApp bubble under [data-pya-lively]" -- packages/storefront-kit/commerce-src/look/lively.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-lively.spec.ts
```

---

### Task 3: The buy bar — the sticky bar on laptops too, with photo, selection and footer hiding

**Files:**
- Modify: `packages/storefront-kit/commerce-src/product/page.js:179` (sticky bar markup)
- Modify: `packages/storefront-kit/commerce-src/product/bundles-related.js:50-81` (`updateStickyBar`, `watchStickyBar`)
- Modify: `packages/storefront-kit/commerce-src/product/dialog-style.js` (laptop bar CSS, after the `@media(max-width:640px)` sticky rules)
- Regenerate: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-lively.spec.ts` (extend)

**Interfaces:**
- Consumes: `:root[data-pya-lively]` (Task 2), existing `buyPassed`, `stickyObserver`, `selectedProduct`, `selectedVariant()`.
- Produces: `[data-product-sticky]` shown on any width when lively and the buy button is passed and the footer is not in view;
  children `[data-product-sticky-photo]` (img) and `[data-product-sticky-choice]` (text).

- [ ] **Step 1: Write the failing tests** (append to the spec)

```ts
describe('buy bar', () => {
  it('slides up on a laptop once the add button is passed, with photo and price, and hides near the footer', async () => {
    const page = await open();
    try {
      expect(await page.isVisible('[data-product-sticky]')).toBe(false);
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForSelector('[data-product-sticky]:not([hidden])');
      expect(await page.locator('[data-product-sticky] [data-product-sticky-photo]').count()).toBe(1);
      expect(await page.textContent('[data-product-sticky-price]')).toMatch(/3[.,]000/);
      await page.evaluate(() => document.querySelector('footer')!.scrollIntoView());
      await page.waitForSelector('[data-product-sticky][hidden]', { state: 'attached' });
    } finally { await page.close(); }
  });

  it('asks to choose options first when a colour is not picked (Review Focus 1)', async () => {
    const withColours = { ...ITEM, variants: [{ id: 'v1', name: 'Gris', amount: 300000, stock: 3, options: [{ name: 'Color', value: 'Gris' }] }, { id: 'v2', name: 'Azul', amount: 300000, stock: 3, options: [{ name: 'Color', value: 'Azul' }] }] };
    const page = await open({ data: { items: [withColours] } });
    try {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForSelector('[data-product-sticky]:not([hidden])');
      expect((await page.textContent('[data-product-jump]'))!.trim()).toBe('Elegir opciones');
    } finally { await page.close(); }
  });

  it('stays phone-only on a store that is not lively', async () => {
    const page = await open({ body: PAGE().replace(' data-pya-lively', '') });
    try {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(300);
      expect(await page.isHidden('[data-product-sticky]')).toBe(true);
    } finally { await page.close(); }
  });
});
```

(If the kit preselects the first value of a single option group, Review Focus 1 needs two groups — add a `Largo` option to both
variants so nothing is preselected.)

- [ ] **Step 2: Run to make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-lively.spec.ts -t "buy bar"`
Expected: first two FAIL (bar never shows at 1280); third PASS.

- [ ] **Step 3: Implement**

`page.js` — in the sticky bar markup replace
`<div class="product-detail__sticky" data-product-sticky hidden><div><strong>${escape(p.name)}</strong><span data-product-sticky-price></span></div>`
with
`<div class="product-detail__sticky" data-product-sticky hidden><img data-product-sticky-photo alt="" hidden /><div><strong>${escape(p.name)}</strong><span data-product-sticky-choice></span><span data-product-sticky-price></span></div>`

`bundles-related.js`:

```js
  let footerSeen = false, footerObserver = null;
  function updateStickyBar() {
    const bar = detail.querySelector('[data-product-sticky]');
    if (!bar || !selectedProduct) return;
    const groups = optionGroups(selectedProduct), variant = selectedVariant(), buy = detail.querySelector('.product-detail__buy');
    const box = boxGroup(selectedProduct), pending = groups && !variant || box && selectedPicks.length !== box.count;
    bar.querySelector('[data-product-sticky-price]').textContent = detail.querySelector('.product-detail__price')?.textContent || '';
    // Lively stores (spec 2026-11-03): the bar shows the photo and what is chosen, on every width.
    const photo = bar.querySelector('[data-product-sticky-photo]'), shown = detail.querySelector('.product-detail__photo img, .product-detail__gallery img');
    if (photo) { photo.hidden = !shown; if (shown) photo.src = shown.currentSrc || shown.src; }
    const choice = bar.querySelector('[data-product-sticky-choice]');
    if (choice) choice.textContent = [...detail.querySelectorAll('[data-product-selection]')].map(el => el.textContent.trim()).filter(Boolean).join(' · ');
    const jump = bar.querySelector('[data-product-jump]');
    jump.textContent = pending ? 'Elegir opciones' : isMembership(selectedProduct) ? 'Hacerme miembro' : 'Añadir';
    jump.disabled = !pending && (!buy || buy.disabled);
    const phone = matchMedia('(max-width: 640px)').matches, lively = document.documentElement.hasAttribute('data-pya-lively');
    const show = buyPassed && !footerSeen && (lively || phone);
    bar.hidden = !show; detail.querySelector('[data-product-sticky-space]').hidden = !show || !phone;
  }
```

In `watchStickyBar()`, after `stickyObserver.observe(buy);` add:

```js
    footerObserver?.disconnect(); footerSeen = false;
    const footer = document.querySelector('footer');
    if (footer) { footerObserver = new IntersectionObserver(entries => { footerSeen = entries[entries.length - 1].isIntersecting; updateStickyBar(); }); footerObserver.observe(footer); }
```

(`footerSeen`/`footerObserver` declared next to `stickyObserver, buyPassed` in product/setup.js line 185 instead, if parts must
declare shared state there — follow how `buyPassed` is declared.)

`dialog-style.js` — after the phone sticky rules, outside the media query (in the file's own CSS-string style):

```css
:root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){position:fixed;left:50%;right:auto;bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:12px;width:min(720px,calc(100% - 24px));padding:10px 10px 10px 12px;border:1px solid var(--pd-line);border-radius:20px;background:var(--pd-paper);color:var(--pd-ink);box-shadow:0 18px 40px -18px #0000004d;transform:translateX(-50%)}
:root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky img{width:44px;height:44px;border-radius:12px;object-fit:cover;flex:0 0 auto}
:root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky [data-product-sticky-choice]{display:block;color:var(--pd-muted)}
@media (prefers-reduced-motion:no-preference){:root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){animation:pya-bar-in .35s cubic-bezier(.2,.9,.2,1) both}}
@keyframes pya-bar-in{from{opacity:0;transform:translate(-50%,24px)}to{opacity:1;transform:translateX(-50%)}}
```

Rebuild: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-lively.spec.ts && cd ../../packages/storefront-kit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): lively buy bar — the sticky bar shows on laptops too, with photo and selection, and hides near the footer" -- packages/storefront-kit/commerce-src/product/page.js packages/storefront-kit/commerce-src/product/bundles-related.js packages/storefront-kit/commerce-src/product/dialog-style.js packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-lively.spec.ts
```

---

### Task 4: Hero pills on the product photo

**Files:**
- Modify: `packages/storefront-kit/commerce-src/product/page.js` (new `pillsMarkup()`, appended inside the gallery section at line 179)
- Modify: `packages/storefront-kit/commerce-src/product/dialog-style.js` (pill CSS)
- Regenerate: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-lively.spec.ts` (extend)

**Interfaces:**
- Consumes: host attribute `data-product-pills` — a JSON array of strings on `[data-pagosya-product-page]` (Task 5 writes it).
- Produces: `ul.product-detail__pills > li` (≤ 3, each ≤ 32 chars), only when the gallery has photos.

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe('hero pills', () => {
  it('draws up to three pills over the product photo from data-product-pills', async () => {
    const page = await open({ body: PAGE(` data-product-pills='["Entrega en Santa Cruz","Llega en caja","Pago seguro","Cuarta de más"]'`) });
    try {
      expect(await page.locator('.product-detail__gallery .product-detail__pills li').allTextContents()).toEqual(['Entrega en Santa Cruz', 'Llega en caja', 'Pago seguro']);
    } finally { await page.close(); }
  });
  it('draws none with a broken attribute', async () => {
    const page = await open({ body: PAGE(` data-product-pills='not json'`) });
    try { expect(await page.locator('.product-detail__pills').count()).toBe(0); } finally { await page.close(); }
  });
});
```

- [ ] **Step 2: Run to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-lively.spec.ts -t "hero pills"`
Expected: first FAIL, second PASS.

- [ ] **Step 3: Implement**

`page.js`, next to `galleryMarkup`:

```js
  // Lively one-product stores (spec 2026-11-03): short facts the store wrote (data-product-pills on the embedded product) float over
  // the photo, each with a pinging dot. Never more than three, never without a photo.
  function pillsMarkup(images) {
    if (!images.length || !fullProductPage) return '';
    let pills = [];
    try { pills = JSON.parse(fullProductPage.getAttribute('data-product-pills') || '[]'); } catch { pills = []; }
    pills = (Array.isArray(pills) ? pills : []).map(pill => String(pill).replace(/\s+/g, ' ').trim()).filter(pill => pill && pill.length <= 32).slice(0, 3);
    return pills.length ? `<ul class="product-detail__pills" aria-label="Destacados">${pills.map((pill, at) => `<li style="--i:${at}"><span aria-hidden="true"></span>${escape(pill)}</li>`).join('')}</ul>` : '';
  }
```

In the template string at line 179 change `${galleryMarkup(images, p)}</section>` to `${galleryMarkup(images, p)}${pillsMarkup(images)}</section>`.

`dialog-style.js`:

```css
[data-pagosya-product][data-style] .product-detail__gallery{position:relative}
.product-detail__pills{position:absolute;left:14px;top:14px;z-index:2;display:grid;gap:8px;margin:0;padding:0;list-style:none;pointer-events:none}
.product-detail__pills li{display:inline-flex;align-items:center;gap:8px;justify-self:start;padding:7px 12px;border-radius:999px;background:color-mix(in srgb,var(--pd-paper,#fff) 92%,transparent);color:var(--pd-ink,#111);font-size:12.5px;font-weight:600;box-shadow:0 8px 22px -12px #0000004d;backdrop-filter:blur(8px)}
.product-detail__pills li span{width:7px;height:7px;border-radius:50%;background:#2fbf71}
@media (max-width:640px){.product-detail__pills{top:auto;bottom:14px}}
@media (prefers-reduced-motion:no-preference){.product-detail__pills li{animation:pya-float 5s ease-in-out infinite;animation-delay:calc(var(--i) * -1.4s)}.product-detail__pills li span{animation:pya-ping 2s ease-out infinite}}
@keyframes pya-ping{0%{box-shadow:0 0 0 0 #2fbf7180}100%{box-shadow:0 0 0 8px #2fbf7100}}
```

(The gallery on product pages is `position:sticky` — keep that; only add `position:relative` where it is not already positioned.
`pya-float` is defined by look/motion-pieces.js, which every page loads.) Rebuild the kit.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-lively.spec.ts && cd ../../packages/storefront-kit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): hero pills — up to three short facts float over the product photo with a pinging dot" -- packages/storefront-kit/commerce-src/product/page.js packages/storefront-kit/commerce-src/product/dialog-style.js packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-lively.spec.ts
```

---

### Task 5: Library sections and Único's home — pills, `detail-hotspots`, `chips-marquee`, mood CSS

**Files:**
- Modify: `packages/store-templates/templates/esencial/components/library.tsx` (ProductHero ~line 377; two new components next to
  `ShopLook` ~line 984; the section registry ~line 1287)
- Modify: `packages/store-templates/templates/esencial/styles/globals.css` (new `/* lb:detail-hotspots */`, `/* lb:chips-marquee */`
  blocks; mood rules inside `/* theme:unico */`)
- Modify: `packages/store-templates/templates/unico/template.json` (layout: pills on product-hero, the two new sections with demo words)
- Test: `apps/api/src/storefront-source/source-unico-lively.spec.ts` (create)

**Interfaces:**
- Consumes: `LibraryBlock.items` (`title`, `x`, `y`), `block.photo`, `variant('mood')`, Task 4's `data-product-pills`.
- Produces: markup `data-lb="detail-hotspots"` with `button.lb-hotspots__pin[aria-expanded]`; `data-lb="chips-marquee"` with two
  `ul.lb-chips__row[data-pya-motion="marquee"]`; product hero host attribute `data-product-pills` (JSON array of item titles).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/storefront-source/source-unico-lively.spec.ts
import { listTemplates, templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { nextPageMarkup } from './source-next';

jest.setTimeout(120_000);
async function unicoHome(mood?: 'colourful' | 'calm') {
  const manifest = listTemplates().find(entry => entry.id === 'unico')!;
  const resolved = resolvePresetTemplate(manifest, templateManifest);
  const preset = mood ? { ...resolved.preset, variants: { ...(resolved.preset as any).variants, mood } } : resolved.preset;
  const assembled = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), preset as never);
  const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
  const authored = snapshot.files.filter(file => /^components\/.+\.tsx$/.test(file.path) || file.path === 'styles/globals.css');
  return nextPageMarkup(authored, 'home');
}

describe('Único lively home (spec 2026-11-03)', () => {
  it('is lively, calm by default, with pills, hotspots and the chip band', async () => {
    const html = await unicoHome();
    expect(html).toContain('data-pya-lively=""');
    expect(html).toContain('data-es-mood="calm"');
    expect(html).toMatch(/data-product-pills="\[&quot;/);
    expect(html.match(/class="lb-hotspots__pin"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/class="lb-chips__row"[^>]*data-pya-motion="marquee"/g)).toHaveLength(2);
    expect(html).not.toContain('es-logo__letters');
  });
  it('spells the name in letters in the colourful mood', async () => {
    const html = await unicoHome('colourful');
    expect(html).toContain('data-es-mood="colourful"');
    expect(html).toContain('es-logo__letters');
  });
});
```

(If `resolved.preset` does not carry `variants`, set the mood where the Único preset's variants are read — `template.json`
`preset.variants` — by passing a manifest copy with `preset.variants.mood` instead. For Review Focus 2, add a third case with a
`store.logo` set in the demo store data if the assembled store-data lets you; otherwise cover it in Task 8's live check.)

- [ ] **Step 2: Run to make sure it fails**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-unico-lively.spec.ts`
Expected: FAIL — no pills attribute, no hotspots, no chip rows.

- [ ] **Step 3: Implement**

`library.tsx` — ProductHero:

```tsx
function ProductHero({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.product) return null;
  // Lively one-product stores (spec 2026-11-03): the items are short facts the kit floats over the product photo.
  const pills = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 3);
  return <Band block={block} index={index}>
    {block.eyebrow ? <p className="es-eyebrow lb-eyebrow lb-product-hero__note">{block.eyebrow}</p> : null}
    {block.title ? <h2 id={`lb-${index}-title`} className="lb-visually-hidden">{block.title}</h2> : null}
    <div className="lb-product-hero" data-pagosya-product-page="" data-product-id={block.product} data-product-pills={pills.length ? JSON.stringify(pills) : undefined} />
  </Band>;
}
```

New components (next to ShopLook):

```tsx
/** Lively one-product stores (spec 2026-11-03, nubecorp «la textura que se siente»): a close-up photo with up to three pulsing «+»;
 *  each opens a one-line note about what is there. The notes are also a list beside the photo, so nothing hides behind a tap. */
function DetailHotspots({ block, index }: { block: LibraryBlock; index: number }) {
  const spots = (block.items ?? []).filter(item => item.title && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(0, 3);
  const [open, setOpen] = useState(-1);
  useEffect(() => {
    if (open < 0) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(-1); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!block.photo || !spots.length) return null;
  return <Band block={block} index={index}>
    <div className="lb-hotspots">
      <div className="lb-hotspots__frame">
        <Photo src={block.photo} className="lb-hotspots__photo" />
        {spots.map((spot, at) => <div key={at} className="lb-hotspots__spot" data-open={open === at ? '' : undefined} style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
          <button type="button" className="lb-hotspots__pin" aria-expanded={open === at} aria-label={spot.title} onClick={() => setOpen(open === at ? -1 : at)}><Icons.IconPlus /></button>
          <p className="lb-hotspots__note">{spot.title}</p>
        </div>)}
      </div>
      <div className="lb-hotspots__words">
        <Head block={block} index={index} />
        <ul className="lb-hotspots__list">{spots.map((spot, at) => <li key={at}><button type="button" aria-pressed={open === at} onClick={() => setOpen(at)}>{spot.title}</button></li>)}</ul>
      </div>
    </div>
  </Band>;
}

/** Lively one-product stores (spec 2026-11-03): short facts about the product in two rows sliding opposite ways, each chip with the
 *  product's photo (never a text-only band). The motion is the kit's marquee piece: off-screen it pauses, reduced motion stops it. */
function ChipsMarquee({ block, index }: { block: LibraryBlock; index: number }) {
  const phrases = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 10);
  if (phrases.length < 6 || !block.photo) return null;
  const rows = [phrases.filter((_, at) => at % 2 === 0), phrases.filter((_, at) => at % 2 === 1)];
  return <Band block={block} index={index}>
    <Head block={block} index={index} align="center" />
    <ul className="lb-visually-hidden">{phrases.map((phrase, at) => <li key={at}>{phrase}</li>)}</ul>
    <div className="lb-chips" aria-hidden="true">{rows.map((row, r) => <ul key={r} className="lb-chips__row" data-pya-motion="marquee" data-dir={r ? 'right' : 'left'}>
      {[0, 1].flatMap(round => row.map((phrase, at) => <li key={`${round}-${at}`} className="lb-chips__chip"><Photo src={block.photo} className="lb-chips__thumb" /><span>{phrase}</span></li>))}
    </ul>)}</div>
  </Band>;
}
```

Registry (the object near line 1287): add `'detail-hotspots': DetailHotspots, 'chips-marquee': ChipsMarquee,`.

`globals.css` — append two blocks with markers exactly like the existing `/* lb:shop-look */ … /* /lb:shop-look */`:

```css
/* lb:detail-hotspots */
.lb-hotspots{display:grid;gap:clamp(24px,4vw,56px);align-items:center}
@media (min-width:861px){.lb-hotspots{grid-template-columns:1.1fr 1fr}}
.lb-hotspots__frame{position:relative;border-radius:24px;overflow:hidden}
.lb-hotspots__photo{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.lb-hotspots__spot{position:absolute;transform:translate(-50%,-50%)}
.lb-hotspots__pin{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:50%;background:#fff;color:#111;box-shadow:0 0 0 6px #ffffff59;cursor:pointer}
.lb-hotspots__pin svg{width:18px;height:18px;transition:transform .2s}
.lb-hotspots__spot[data-open] .lb-hotspots__pin svg{transform:rotate(45deg)}
.lb-hotspots__note{position:absolute;left:50%;top:calc(100% + 10px);width:max-content;max-width:min(240px,60vw);margin:0;padding:8px 12px;border-radius:12px;background:#fff;color:#111;font-size:13px;box-shadow:0 12px 28px -14px #0006;opacity:0;transform:translate(-50%,6px);pointer-events:none;transition:opacity .2s,transform .2s}
.lb-hotspots__spot[data-open] .lb-hotspots__note{opacity:1;transform:translate(-50%,0)}
.lb-hotspots__list{display:grid;gap:10px;margin:18px 0 0;padding:0;list-style:none}
.lb-hotspots__list button{all:unset;cursor:pointer;display:block;padding:12px 14px;border-radius:14px;background:var(--es-muted);font-weight:600}
.lb-hotspots__list button[aria-pressed=true]{outline:2px solid var(--es-accent)}
@media (prefers-reduced-motion:no-preference){.lb-hotspots__pin{animation:lb-hot 2s ease-out infinite}}
@keyframes lb-hot{0%{box-shadow:0 0 0 0 #ffffffb3}100%{box-shadow:0 0 0 14px #fff0}}
/* /lb:detail-hotspots */
/* lb:chips-marquee */
.lb-chips{display:grid;gap:12px;overflow:hidden;margin-top:clamp(18px,3vw,28px);-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.lb-chips__row{gap:12px;margin:0;padding:0;list-style:none}
.lb-chips__row[data-dir=right]{animation-direction:reverse}
.lb-chips__chip{display:inline-flex;align-items:center;gap:12px;padding:10px 18px 10px 10px;border-radius:18px;background:var(--es-paper);box-shadow:0 1px 0 color-mix(in srgb,var(--es-ink) 10%,transparent);font-weight:600;white-space:nowrap}
.lb-chips__thumb{width:40px;height:40px;border-radius:50%;object-fit:cover}
/* /lb:chips-marquee */
```

Inside `/* theme:unico */ … /* /theme:unico */` add the mood rules:

```css
[data-es-theme="unico"] .es-logo__letters{display:inline-flex;white-space:nowrap}
[data-es-theme="unico"][data-es-mood="colourful"] .es-logo__letters span:nth-child(3n+1){color:var(--es-accent)}
[data-es-theme="unico"][data-es-mood="colourful"] .es-logo__letters span:nth-child(3n+2){color:var(--es-deep)}
[data-es-theme="unico"][data-es-mood="colourful"] .es-logo__letters span:nth-child(3n){color:color-mix(in srgb,var(--es-accent) 55%,var(--es-deep))}
[data-es-theme="unico"][data-es-mood="colourful"] .lb-chips__chip:nth-child(3n+1) span{color:var(--es-accent)}
[data-es-theme="unico"][data-es-mood="colourful"] .lb-chips__chip:nth-child(3n+2) span{color:var(--es-deep)}
[data-es-theme="unico"][data-es-mood="colourful"] [data-lb="chips-marquee"]{background:color-mix(in srgb,var(--es-accent) 10%,var(--es-paper))}
[data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]{position:relative;isolation:isolate}
[data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]::before,[data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]::after{content:"";position:absolute;z-index:-1;width:42vmax;height:42vmax;border-radius:50%;filter:blur(70px);opacity:.35;pointer-events:none}
[data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]::before{left:-12vmax;top:-10vmax;background:var(--es-accent)}
[data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]::after{right:-14vmax;bottom:-12vmax;background:color-mix(in srgb,var(--es-deep) 60%,var(--es-accent))}
@media (prefers-reduced-motion:no-preference){
  [data-es-theme="unico"][data-es-mood="colourful"] .es-logo__letters span{display:inline-block;animation:pya-float 3.2s ease-in-out infinite;animation-delay:calc(var(--i) * -.22s)}
  [data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]::before,[data-es-theme="unico"][data-es-mood="colourful"] section[data-lb="product-hero"]::after{animation:lb-drift 18s ease-in-out infinite alternate}
}
@keyframes lb-drift{from{transform:translate(0,0)}to{transform:translate(6vmax,4vmax)}}
```

(The blobs sit inside the section, which must clip them sideways: check the contract suite's «no sideways scroll» at 390 px; if
it fails, add `overflow:clip` on `section[data-lb="product-hero"]` — not on `main`.)

`unico/template.json` layout — first block becomes a countdown slot (a template's fixed home only fills the sections it has; this
one draws nothing and is dropped without a date the merchant named, so the demo shows none):
`{ "type": "promo-countdown", "title": "Precio de lanzamiento", "text": "Hasta que se acabe el tiempo." },`
then on the `product-hero` block add
`"items": [{ "title": "Envío a todo el país" }, { "title": "Pago seguro" }]`; after `benefits-bento` insert

```json
{ "type": "detail-hotspots", "title": "Mira de *cerca*", "text": "Toca los + para ver cada detalle.", "photo": "slot:un-p3",
  "items": [ { "title": "Materiales que se sienten bien", "x": 32, "y": 40 }, { "title": "Terminaciones prolijas", "x": 66, "y": 58 } ] },
```

and before `reviews-cards` insert

```json
{ "type": "chips-marquee", "title": "Lo que te va a *encantar*", "photo": "slot:un-p1", "band": "muted",
  "items": [ { "title": "Listo para usar" }, { "title": "Fácil de guardar" }, { "title": "Para todos los días" }, { "title": "Cómodo de llevar" }, { "title": "Hecho para durar" }, { "title": "Fácil de limpiar" } ] },
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-unico-lively.spec.ts && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-templates-contract.spec.ts -t "plantilla unico "`
Expected: PASS (5 contract tests for Único).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(unico): hero pills, detail hotspots and a two-row chip band; colourful mood letters, tints and drifting blobs" -- packages/store-templates/templates/esencial/components/library.tsx packages/store-templates/templates/esencial/styles/globals.css packages/store-templates/templates/unico/template.json apps/api/src/storefront-source/source-unico-lively.spec.ts
```

---

### Task 6: Section library — catalogue, caps, backed facts, spots and mood

**Files:**
- Modify: `apps/api/src/storefront-source/source-section-library.ts` (types lines 7-10; catalogue lines 19-86; schema lines 110-123;
  item loop lines 285-305; new `libraryMood`; prompt `LIBRARY_FILL_PROMPT`)
- Test: `apps/api/src/storefront-source/source-section-library-lively.spec.ts` (create)

**Interfaces:**
- Consumes: `LibraryFacts`, `validateLibraryLayout`, `isPlayfulBusiness` from `./home-directions`.
- Produces: `LibraryNeeds.spots?: boolean`; catalogue entries `detail-hotspots`, `chips-marquee`; product-hero accepts items 0–3;
  answer schema top-level `mood: 'colourful' | 'calm'`; `export function libraryMood(answer: { mood?: unknown } | null | undefined, facts: LibraryFacts): 'colourful' | 'calm'`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-section-library-lively.spec.ts
import { libraryAnswerSchema, libraryMood, validateLibraryLayout, type LibraryFacts } from './source-section-library';

const facts: LibraryFacts = { storeName: 'Nube', what: 'Vendo un sofá cama plegable comprimido. Entrega en Santa Cruz.', story: '', city: 'Santa Cruz', request: 'sofá cama plegable, llega en caja',
  tone: 'calm', products: [{ id: 'p1', name: 'Sofá cama plegable', about: 'Llega comprimido en una caja. 7 colores.' }], categories: [],
  photos: [{ url: '/v1/uploads/a.jpg', product: 'Sofá cama plegable' }, { url: '/v1/uploads/b.jpg', product: 'Sofá cama plegable' }], codes: [], services: [], reviews: 0 };
const raw = (type: string, extra: Record<string, unknown>) => ({ type, look: '', band: '', eyebrow: '', title: '', text: '', cta: '', link: '', cta2: '', link2: '', photo: -1, photo2: -1, items: [], products: [], product: '', code: '', card: '', endsAt: '', ...extra });
const item = (title: string, x = -1, y = -1) => ({ title, text: '', icon: '', photo: -1, link: '', value: '', x, y });
const fill = (block: ReturnType<typeof raw>) => validateLibraryLayout({ blocks: [block] } as never, facts, { fixed: [{ type: block.type }] });

describe('section library — lively one-product parts (spec 2026-11-03)', () => {
  it('keeps short backed pills and drops long or invented ones (Review Focus 4)', () => {
    const [hero] = fill(raw('product-hero', { product: 'p1', items: [item('Entrega en Santa Cruz'), item('Llega en caja'), item('Entrega 24–48 h'), item('Un texto demasiado largo para una etiqueta flotante')] }));
    expect(hero.items?.map(entry => entry.title)).toEqual(['Entrega en Santa Cruz', 'Llega en caja']);
  });
  it('keeps hotspots with a photo, clamps points into the photo (Review Focus 5) and drops the section without points', () => {
    const [spots] = fill(raw('detail-hotspots', { photo: 1, items: [item('Tela de pana suave', 0, 100), item('Costura doble', 50, 50)] }));
    expect(spots.photo).toBe('/v1/uploads/b.jpg');
    expect(spots.items).toEqual([{ title: 'Tela de pana suave', x: 6, y: 94 }, { title: 'Costura doble', x: 50, y: 50 }]);
    expect(fill(raw('detail-hotspots', { photo: 1, items: [item('Sin punto')] }))).toEqual([]);
  });
  it('keeps a chip band of six to ten short phrases with a photo', () => {
    const phrases = ['Llega en una caja', 'Se despliega en cama', 'Sin herramientas', 'Para departamentos', '7 colores', 'Fácil de mover'];
    const [chips] = fill(raw('chips-marquee', { photo: 0, items: phrases.map(phrase => item(phrase)) }));
    expect(chips.items?.map(entry => entry.title)).toEqual(phrases);
    expect(fill(raw('chips-marquee', { photo: 0, items: phrases.slice(0, 4).map(phrase => item(phrase)) }))).toEqual([]);
  });
  it('asks for a mood and reads it; a playful business is always colourful', () => {
    expect((libraryAnswerSchema(2) as any).required).toContain('mood');
    expect(libraryMood({ mood: 'colourful' }, facts)).toBe('colourful');
    expect(libraryMood({ mood: 'loud' }, facts)).toBe('calm');
    expect(libraryMood(null, { ...facts, what: 'Gomitas y caramelos para fiestas infantiles' })).toBe('colourful');
  });
});
```

- [ ] **Step 2: Run to make sure they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-section-library-lively.spec.ts`
Expected: FAIL — unknown sections, no `libraryMood`.

- [ ] **Step 3: Implement**

Types — add to `LibraryNeeds`: `/** Points on a close-up photo, each with a note (detail-hotspots, spec 2026-11-03). */ spots?: boolean;`

Catalogue — replace product-hero's entry and add two entries:

```ts
  { id: 'product-hero', role: 'products', use: 'El producto completo arriba de todo: galería grande, precio, opciones y botón Agregar (product = su id). eyebrow = una línea corta de la tienda sobre el producto (envío, garantía). items = hasta 3 etiquetas que flotan sobre la foto (title ≤ 32 letras): solo hechos que el comercio dio (su ciudad de entrega, «Llega en caja», garantía); vacío si no hay. Solo en tiendas de un producto.', needs: { product: true, items: [0, 3] }, templateOnly: true },
  { id: 'detail-hotspots', role: 'story', use: 'Una foto de cerca del producto (photo: la que muestra un detalle: tela, textura, botones, terminación) con hasta 3 puntos «+». items: title = qué se ve en ese punto (≤ 60 letras), x, y = dónde está, en % del ancho y alto de la foto. title y text de la sección cortos. Sin una foto de detalle, deja la sección vacía.', needs: { photos: 1, items: [1, 3], spots: true }, templateOnly: true },
  { id: 'chips-marquee', role: 'proof', use: 'Dos filas de frases cortas que se deslizan, cada una con la foto del producto (photo). items: 6 a 10 title de ≤ 48 letras, solo hechos del producto o de la tienda (cómo llega, para qué sirve, colores que hay), nada inventado.', needs: { photos: 1, items: [6, 10] }, templateOnly: true },
```

Item loop — change the pins line to include spots:

```ts
      if ((needs.pins || needs.spots) && Number(item.x) >= 0 && Number(item.y) >= 0) { out.x = Math.round(Math.min(94, Math.max(6, Number(item.x)))); out.y = Math.round(Math.min(94, Math.max(6, Number(item.y)))); }
```

and after the existing `if (needs.pins) items = ...` line add:

```ts
    // Lively one-product parts (spec 2026-11-03): an item over its cap goes whole (never cut mid-word), every number in it must be
    // one the merchant wrote, and a hotspot needs its point.
    const liveCap = section.id === 'product-hero' ? 32 : section.id === 'chips-marquee' ? 48 : section.id === 'detail-hotspots' ? 60 : 0;
    if (liveCap) items = items.filter((entry, at) => String(rawItems[at]?.title ?? '').replace(/\s+/g, ' ').trim().length <= liveCap
      && (entry.title.match(/\d+/g) ?? []).every(number => merchantWords.includes(number)));
    if (needs.spots) items = items.filter(entry => entry.x !== undefined).map(({ title, x, y }) => ({ title, x, y }));
```

(`rawItems[at]` lines up with `items[at]` only before any earlier filter — put this block right after the `.map(...)` that builds
`items`, before the `.filter(item => item.title)` chain if indexes would shift; otherwise compare `entry.title.length` against the
cap on an un-clipped copy kept on the item. `merchantWords` is the folded merchant text the loop already uses for stats and press:
confirm it includes `facts.what`, `facts.request`, `facts.notes` and each product's `about`; add `about` where it is built if missing.)

Schema — top level becomes:

```ts
  return { type: 'object', additionalProperties: false, required: ['blocks', 'mood'], properties: { blocks: { type: 'array', items: block }, mood: { type: 'string', enum: ['colourful', 'calm'] } } };
```

Mood:

```ts
import { isPlayfulBusiness } from './home-directions';

/** Lively one-product stores (spec 2026-11-03): the mood YAPI chose for the product; a playful business (sweets, toys, parties) is
 *  always colourful; anything else not exactly «colourful» is calm. */
export function libraryMood(answer: { mood?: unknown } | null | undefined, facts: LibraryFacts): 'colourful' | 'calm' {
  if (isPlayfulBusiness([facts.what, facts.request, ...facts.products.map(product => `${product.name} ${product.about ?? ''}`)].join('\n'))) return 'colourful';
  return answer?.mood === 'colourful' ? 'colourful' : 'calm';
}
```

Prompt — append to `LIBRARY_FILL_PROMPT` (keep its template-literal style):

```
- mood: «colourful» para productos alegres, de casa o de regalo que piden juego (un sofá nube, una bebida, juguetes, dulces); «calm» para productos serios o técnicos (herramientas, cuidado de la piel, salud, finanzas). Fuera de la plantilla Único no cambia nada.
- Etiquetas (product-hero items), frases (chips-marquee) y notas (detail-hotspots): solo hechos que están en los datos (lo que dijo el comercio, la descripción del producto, sus notas de entrega). Ningún plazo, número, premio o calificación que no esté escrito. Si no hay hechos, déjalos vacíos.
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-section-library --maxWorkers=2`
Expected: PASS (new spec and the existing section-library specs; an existing spec that snapshots the schema's `required` list
needs `mood` added).

- [ ] **Step 5: Commit** (check no YAPI job is RUNNING first — Global Constraints)

```bash
git commit -m "feat(library): pills, detail hotspots and chip band for one-product stores — capped, backed by the merchant's facts; YAPI picks colourful or calm" -- apps/api/src/storefront-source/source-section-library.ts apps/api/src/storefront-source/source-section-library-lively.spec.ts
```

---

### Task 7: Save the mood with the home, and «hazla más tranquila / más colorida»

**Files:**
- Create: `apps/api/src/storefront-source/source-mood-ask.ts`
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (`sectionLibrary` refill call ~line 795; `send()` routing next to the
  shipping-ask check ~line 1225; a small `storeTheme` helper)
- Test: `apps/api/src/storefront-source/source-mood-ask.spec.ts` (create)

**Interfaces:**
- Consumes: `libraryMood` (Task 6); `this.templates.refill(merchantId, storeId, revision, change, label)` with `change.variants`.
- Produces: `export function readMoodAsk(text: string): 'colourful' | 'calm' | null`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/storefront-source/source-mood-ask.spec.ts
import { readMoodAsk } from './source-mood-ask';

describe('mood asks on a one-product store (spec 2026-11-03)', () => {
  it.each([
    ['hazla más tranquila', 'calm'], ['quiero algo más sobrio, menos colores', 'calm'], ['más seria por favor', 'calm'],
    ['hazla más colorida', 'colourful'], ['más divertida y con más colores', 'colourful'], ['dale más color', 'colourful'],
  ])('%s → %s', (text, mood) => expect(readMoodAsk(text)).toBe(mood));
  it('ignores other edits', () => {
    expect(readMoodAsk('cambia el color del botón a azul')).toBeNull();
    expect(readMoodAsk('pon la foto del sofá gris')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to make sure it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-mood-ask.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/storefront-source/source-mood-ask.ts
/** Lively one-product stores (spec 2026-11-03): «hazla más tranquila» / «más colorida» on a Único store switch its mood, never a
 *  specific colour (that stays a design edit). */
const CALM = /\bm[aá]s\s+(tranquil[ao]|sobri[ao]|seri[ao]|calmad[ao])\b|\bmenos\s+colou?r(es)?\b/i;
const COLOURFUL = /\bm[aá]s\s+(colorid[ao]|divertid[ao]|alegre|juguet[oó]n[ao]?)\b|\bm[aá]s\s+colou?r(es)?\b|\bdale\s+m[aá]s\s+color\b/i;
export function readMoodAsk(text: string): 'colourful' | 'calm' | null {
  if (CALM.test(text)) return 'calm';
  if (COLOURFUL.test(text)) return 'colourful';
  return null;
}
```

`source-chat.service.ts` — in `sectionLibrary`, before `await workflow.report('saving');`:

```ts
    // Lively one-product stores (spec 2026-11-03): YAPI's mood for the product is saved with the home on Único.
    const mood = theme === 'unico' ? libraryMood(answer as never, facts) : undefined;
```

and the refill call becomes
`this.templates.refill(merchantId, storeId, revision, { layout, ...(productTemplate ? { productLayout } : {}), ...(mood ? { variants: { mood } } : {}) } as never, 'Portada de YAPI')`
(`refillMasterFiles` keeps only variant ids listed in `master.variants`, which Task 1 added; drop the `as never` if `MasterFill`
already types `variants`).

In `send()`, inside `if (current.revision && !input.personalTouch && !input.resumeWords && !input.selection)` next to the shipping
check:

```ts
      const moodAsk = readMoodAsk(input.instruction);
      if (moodAsk && await this.storeTheme(merchantId, storeId, current.revision) === 'unico') {
        await workflow.report('saving');
        const saved = await this.templates.refill(merchantId, storeId, current.revision, { variants: { mood: moodAsk } } as never, moodAsk === 'calm' ? 'Más tranquila' : 'Más colorida');
        await workflow.finish('completed');
        const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT',
          content: moodAsk === 'calm' ? 'Listo: tu tienda ahora se mueve con sus colores de siempre, sin arcoíris. Revisa la vista previa.' : 'Listo: tu tienda ahora tiene más color y movimiento. Revisa la vista previa.',
          metadata: { progress: workflow.value, sourceRevision: saved.revision, label: saved.label } } });
        return { userMessage, assistantMessage, revision: saved };
      }
```

and on the class:

```ts
  /** The whole template a saved revision wears (variants.theme), or 'none'. */
  private async storeTheme(merchantId: string, storeId: string, revision: number): Promise<string> {
    const snapshot = (await this.projects.version(merchantId, storeId, revision)).snapshot as unknown as SourceProjectSnapshot;
    return String((readMasterState(snapshot.files).variants as Record<string, unknown> | undefined)?.theme ?? 'none');
  }
```

(Match the return shape of the neighbouring `shippingEdit` early return — read it first.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-mood-ask.spec.ts && npx jest src/storefront-source/source-chat --maxWorkers=2 && npx tsc -p tsconfig.json --noEmit --incremental false | grep -c "error TS"`
Expected: PASS, all chat specs pass, `0`.

- [ ] **Step 5: Commit** (no RUNNING YAPI job first)

```bash
git commit -m "feat(unico): save YAPI's mood with the home; «hazla más tranquila / más colorida» switches it" -- apps/api/src/storefront-source/source-mood-ask.ts apps/api/src/storefront-source/source-mood-ask.spec.ts apps/api/src/storefront-source/source-chat.service.ts
```

---

### Task 8: Rebuild, full checks, live check with the owner's photos

**Files:** none new (verification). Live test stores are created through the Studio.

- [ ] **Step 1: Rebuild the kit and the Studio**

Run: `node packages/storefront-kit/tools/build-commerce.mjs --check && pnpm --filter @pagosya/merchant-dashboard run build:studio`
Expected: check passes; Studio builds into `apps/merchant-dashboard/public/studio`.

- [ ] **Step 2: Full template contract suite**

Run: `cd apps/api && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-templates-contract.spec.ts`
Expected: all pass (585 before this work; Único's count grows by none — it is still five tests).

- [ ] **Step 3: Live stores** (needs the owner's photos; stack on `pnpm dev:chatgpt`)

1. New store «Sofá Nube Test»: send the supplier screenshot, then the owner's sofa photos (one fabric close-up). Expect: Único,
   colourful mood, pills from real facts only, hotspots on the close-up, chip band, buy bar on laptop and phone, pinging bubble.
2. New store for a calm product (owner's photos): expect calm mood, the same motion in the store's own colours, no blobs or
   rainbow letters.
3. Review Focus 3: rename store 1 to a ≥ 24-character name; at 390 px the header has no sideways scroll.
4. Review Focus 2: give store 2 a logo image; the header shows the image, no letters.
5. Reduced motion (Chrome DevTools → Rendering → prefers-reduced-motion: reduce): everything still.
6. Screenshots of both stores next to nubecorp at 1280 and 390 for the owner.

- [ ] **Step 4: Report to the owner** with the screenshots and anything that did not match the spec.
