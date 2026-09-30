# Wix-style Plantillas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 24 new Plantillas with the look and polish of Wix's Harmony eCommerce templates, a `hidden` flag to take old templates out of the gallery, a `motor` category, and a look-alike test.

**Architecture:** Templates stay in the existing package format (`packages/store-templates/templates/<id>/`), so the API apply/preview flow, the Studio gallery and YAPI keep working unchanged. The registry gains `galleryTemplates()` (listed templates minus hidden ones), which every merchant-facing listing uses; `listTemplates()` keeps returning everything so the per-template contract tests keep covering hidden ones. Each new template owns its header, home, product page, cart, cart line, "added" notice and checkout review through the kit's template slots.

**Tech Stack:** React TSX source compiled by the storefront kit (`@pagosya/ui`), plain CSS, Node test runner (`node --test`) for the registry, Jest + Playwright sandbox (`apps/api`) for the per-template contract, Higgsfield MCP for demo photos, macOS `sips` for photo compression.

**Spec:** `docs/superpowers/specs/2026-09-28-wix-style-templates-design.md`

**Branch:** start from `main` on a new branch `feature/wix-templates`; cherry-pick the spec commit `634af53` and this plan's commit onto it first (both were committed on `feature/subscribe-and-save`).

## Global Constraints

- Originality: each template takes the *feel* of its Wix reference only. Never download, trace or reuse a Wix image, text, logo or icon. Own Spanish name, own Spanish copy for a Bolivian store, prices in Bs.
- Fonts: only kit fonts (`packages/storefront-kit/kit/fonts/`), declared as `dna.display` / `dna.text` and loaded with `@font-face` from `assets/<font>.ttf`, exactly as `templates/aro/styles/globals.css:1-2` does.
- DNA values: only values the kit knows (listed in R1); an unknown value fails `assembleTemplateRevision`.
- Demo photos: generated with Higgsfield, JPEG, each ≤ 600 KB (`DEMO_MAX_BYTES`).
- Home: 6–9 top-level `<section id="…">` inside `<main id="contenido">`, exactly one `<h1>`, the first section is the hero.
- Motion: calm. `Reveal` for entrances, hover zoom via CSS, and the one `Parallax` the motion spec requires (`mobileStrength={N}`, N ≥ 20). No new kit primitives.
- Every new template owns `CartTemplate`, `CartLineTemplate`, `AddedTemplate`, `ReviewTemplate` and `ProductPageTemplate`, each with all required slots.
- CSS: every class prefixed with the template's prefix (given per template); no rules aimed at `[data-pagosya-product…]` or `.product-detail__` (the kit strips them).
- Manifest `order`: new templates use negative orders (−240 … −10) so they list before the old 30.
- Never run `prisma migrate`, `prisma db push`, `prisma migrate reset` or `prisma diff` against the dev database. This plan needs no schema change.
- Do not touch `/Users/saramia/pagosYaWeb`.

## Review Focus

1. **A store with one product (or none) applied to a new template** — rails, grids and category tiles must not render as broken empty boxes or cause sideways scroll. Pinned by the one-product check in every Batch QA task.
2. **Long Spanish product names and four-digit Bs prices ("Bs 12.500,00") at 390 px** — card titles clamp to two lines, prices never overflow. Pinned by the R6 card rules and the Batch QA long-name check.
3. **Merchant photos with other aspect ratios (tall phone photos) replacing demo photos** — every photo frame uses a fixed `aspect-ratio` with `object-fit: cover`. Pinned by the R6 rules and the Batch QA portrait-photo check.
4. **A hidden template requested by id** (a YAPI brief's `templateId`, rework flows, a stale Studio tab) — it must still resolve, preview and apply. Pinned by the Task 1 and Task 2 tests.
5. **A commerce template missing a required slot** — the kit silently falls back to its default cart (`cartTemplateInvalid`), shipping an unstyled cart. Pinned by the Task 3 slot test.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/store-templates/index.js` | Registry: `motor` category, `hidden` validation, `gallerySelection()` / `galleryTemplates()` |
| `packages/store-templates/index.d.ts` | Types for the above |
| `packages/store-templates/test/registry.test.mjs` | Registry unit tests |
| `packages/store-templates/test/lookalike.test.mjs` (new) | Look-alike and commerce-slot tests |
| `apps/api/src/storefront-source/source-templates.service.ts` | Gallery list uses `galleryTemplates()` |
| `apps/api/src/storefront-source/source-chat.service.ts:28,383` | YAPI template ranking uses `galleryTemplates()` |
| `apps/api/src/storefront-source/source-conversation.service.ts:1,67,70` | YAPI catalog prompt uses `galleryTemplates()` |
| `apps/api/src/storefront-source/source-templates.ts:73-76` | `motor` business label |
| `apps/merchant-studio/src/source-templates.ts:9-11` | `motor` gallery label |
| `packages/store-templates/templates/<id>/**` (24 new) | The templates |
| `apps/merchant-studio/public/plantillas/<id>.webp`, `<id>-mobile.webp` | Gallery previews (from the preview tool) |

---

## Template Recipe (used by every template task)

Each template task gives a **brief** (id, prefix, reference, fonts, palette, DNA, header, home sections in order, product page, cart, photos). Build it with this recipe; `xx` below stands for the brief's prefix. The automated gates (registry tests, look-alike test, API contract and motion specs) define "works"; the Batch QA task defines "looks right".

### R1. `template.json`

```json
{
  "id": "<id>",
  "name": "<Name>",
  "category": "<category>",
  "description": "<the brief's description, ≤160 chars>",
  "tags": ["<the brief's 4 tags>"],
  "sitePurpose": "shop",
  "order": -240,
  "dna": { "display": "<font>", "text": "<font>", "case": "none", "radius": "none", "border": "hairline", "button": "block", "hover": "invert", "press": "sink", "motion": "snappy", "cart": "drawer", "added": "toast", "card": "zoom", "frame": "inset" },
  "photos": [ { "slot": "hero", "role": "hero", "demo": "hero.jpg" }, { "slot": "p1", "role": "product", "demo": "p1.jpg" } ]
}
```

Replace every value with the brief's. Known DNA values: `case` none|upper · `radius` none|soft|round|pill · `border` none|hairline|bold · `button` block|brutal|bubbly|outline|pill|sticker|underline · `hover` fill|invert|lift|underline-grow · `press` none|pop|sink|squash · `motion` calm|cinematic|playful|snappy · `cart` drawer|overlay|sheet · `added` bubble|inline|ribbon|stamp|toast · `card` still|tilt|zoom · `frame` arch|bleed|blob|inset|rounded. Photo roles: `hero` (the brief's hero photo), `product` (`p*` slots), `lifestyle` (all other scene photos), `detail` (macro shots). Slots are `[a-z0-9]{1,30}` (no dashes, so they work as `photos.<slot>`).

### R2. `components/Shell.tsx` — header, footer and the commerce templates

`Commerce` holds the commerce templates so both `Shell` (every store page) and `checkout.tsx` render them. Required slots (from `apps/api/src/storefront-source/source-generation.service.ts:429`): cart `lines`, `total`, `action` + one `button[data-cart-close]`; line `name`, `line-total`, `quantity`; added `message` + one `button[data-cart-open]`; review `summary`, `fields`. Leave every slot empty — the kit fills it.

```tsx
import type { ReactNode } from 'react';
import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, KitSlot } from '@pagosya/ui';
import { store } from './store-data';

// 3–5 links to this template's home section ids, labels in Spanish
const links = [{ label: 'Tienda', href: 'index.html#tienda-id' }, { label: 'Nosotros', href: 'index.html#historia-id' }];

export function Header() {
  return <header className="xx-header">
    <a className="xx-logo" href="index.html">{store.name}</a>
    <nav className="xx-nav" aria-label="Principal">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
    <button type="button" className="xx-cart" data-cart-open>Carrito <span data-cart-count>0</span></button>
  </header>;
}

export function Footer() {
  return <footer className="xx-footer">
    <p className="xx-footer__name">{store.name}</p>
    <nav className="xx-footer__links" aria-label="Pie de página">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}<a href="checkout.html">Mi pedido</a></nav>
    <p className="xx-footer__note">{store.city ? `${store.city} · ` : ''}Pagos seguros con QR y tarjeta</p>
  </footer>;
}

export function Commerce() {
  return <>
    <CartTemplate>
      <div className="xx-cartpanel">
        <header className="xx-cartpanel__head"><h2>Tu carrito</h2><button type="button" data-cart-close>Cerrar</button></header>
        <KitSlot kind="cart" name="lines" className="xx-cartpanel__lines" />
        <KitSlot kind="cart" name="empty" className="xx-cartpanel__empty" />
        <KitSlot kind="cart" name="savings" />
        <KitSlot kind="cart" name="total" className="xx-cartpanel__total" />
        <KitSlot kind="cart" name="note" />
        <KitSlot kind="cart" name="action" className="xx-cartpanel__action" />
        <KitSlot kind="cart" name="policies" className="xx-cartpanel__policies" />
      </div>
    </CartTemplate>
    <CartLineTemplate>
      <div className="xx-line">
        <KitSlot kind="line" name="photo" as="img" className="xx-line__photo" />
        <div><KitSlot kind="line" name="name" as="p" className="xx-line__name" /><KitSlot kind="line" name="option" as="p" /><KitSlot kind="line" name="quantity" /></div>
        <KitSlot kind="line" name="line-total" as="p" className="xx-line__total" />
        <KitSlot kind="line" name="remove" as="button" className="xx-line__remove" />
      </div>
    </CartLineTemplate>
    <AddedTemplate>
      <div className="xx-added">
        <KitSlot kind="added" name="photo" as="img" />
        <p><KitSlot kind="added" name="name" as="b" /> <KitSlot kind="added" name="message" as="span" /></p>
        <button type="button" data-cart-open>Ver carrito</button>
      </div>
    </AddedTemplate>
    <ReviewTemplate>
      <div className="xx-review">
        <KitSlot kind="review" name="summary" className="xx-review__summary" />
        <KitSlot kind="review" name="fields" className="xx-review__fields" />
      </div>
    </ReviewTemplate>
  </>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="xx">
    <Header />
    {children}
    <Footer />
    <Commerce />
    <div data-pagosya-cart hidden />
  </div>;
}
```

Build the header and footer to the brief (announcement bar, wordmark position, nav, newsletter line, link columns); the skeleton above is the minimum.

### R3. `components/home.tsx`

```tsx
import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="hero-id" className="xx-hero">
        <h1 className="xx-display">Titular del brief</h1>
        <img src={photos.hero} alt={`Portada de ${store.name}`} />
      </section>

      <section id="catalogo-id" className="xx-shop" aria-labelledby="xx-shop-title">
        <Reveal className="xx-shop__head"><h2 id="xx-shop-title" className="xx-title">Los más elegidos</h2></Reveal>
        <template data-pagosya-product-template>
          <article className="xx-card">
            <a className="xx-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="xx-card__name" data-product-field="name">Producto</h3>
            <p className="xx-card__price" data-product-field="price" />
            <button type="button" className="xx-card__add" data-product-add>Agregar</button>
          </article>
        </template>
        <div className="xx-grid" data-pagosya-catalog />
      </section>

      <section id="historia-id" className="xx-story">
        <Parallax strength={60} mobileStrength={24} className="xx-drift"><img src={photos.historia} alt="" aria-hidden="true" /></Parallax>
        <Reveal className="xx-story__copy"><h2 className="xx-title">Nuestra historia</h2><p>…</p></Reveal>
      </section>
    </main>
  </Shell>;
}
```

Use the brief's section ids, order, compositions and copy; the ids above are stand-ins. Rules the contract spec enforces (`apps/api/src/storefront-source/source-templates-contract.spec.ts`): every `<section` directly under `<main>` (6-space indent) has an `id`; the first is the hero; one `<h1>`; no sideways scroll at 390/1280; no missing images; each product can be added and checkout reached. The motion spec (`source-templates-motion.spec.ts`) requires `Parallax` and `Reveal` imported from `@pagosya/ui` in `home.tsx`, a `<Parallax … mobileStrength={N}>`, visible drift while scrolling at 1280 and 390, and no `Reveal` left hidden at the page end.

### R4. `components/product.tsx`

```tsx
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="xx-pdp">
        <KitSlot kind="product" name="breadcrumb" className="xx-pdp__crumbs" />
        <div className="xx-pdp__grid">
          <KitSlot kind="product" name="gallery" className="xx-pdp__gallery" />
          <div className="xx-pdp__info">
            <KitSlot kind="product" name="title" className="xx-pdp__title" />
            <KitSlot kind="product" name="pricing" className="xx-pdp__price" />
            <KitSlot kind="product" name="buy" className="xx-pdp__buy" />
            <KitSlot kind="product" name="description" />
            <KitSlot kind="product" name="delivery" />
          </div>
        </div>
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="xx-page" data-pagosya-product-page />
  </Shell>;
}
```

Arrange to the brief's product layout. Required: `gallery`, `title`, `pricing`, `buy`. Optional: `breadcrumb`, `category`, `description`, `highlights`, `info`, `delivery`, `rating`, `reviews`, `bundles`, `related`.

### R5. `components/checkout.tsx`

```tsx
import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="xx">
    <Header />
    <main id="contenido" className="xx-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="xx-status" />
    <Footer />
    <Commerce />
  </div>;
}
```

### R6. `styles/globals.css` — required rules

```css
@font-face{font-family:'Display Name';src:url(assets/display-font.ttf) format('truetype');font-weight:100 900;font-display:swap}
@font-face{font-family:'Text Name';src:url(assets/text-font.ttf) format('truetype');font-weight:100 900;font-display:swap}
.xx{--xx-bg:#fff;--xx-ink:#111;--xx-accent:#c00;background:var(--xx-bg);color:var(--xx-ink);font-family:'Text Name',system-ui,sans-serif;overflow-x:clip}
.xx img{max-width:100%;display:block}
/* Review Focus 3: fixed frames that cover */
.xx-hero img,.xx-card__media img,.xx-tile img{width:100%;height:100%;object-fit:cover}
.xx-card__media{aspect-ratio:4/5;overflow:hidden;display:block}
/* Review Focus 2: long names clamp, prices stay on one line */
.xx-card__name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.xx-card__price{white-space:nowrap}
.xx-card__media img{transition:transform .6s ease}.xx-card:hover .xx-card__media img{transform:scale(1.04)}
@media (prefers-reduced-motion:reduce){.xx *{transition:none!important;animation:none!important}}
```

Use the brief's font file ids (`assets/<dna.display>.ttf`, `assets/<dna.text>.ttf`), family names as in the font files (see `templates/aro/styles/globals.css:1-2` for the naming), and the brief's palette. Lay out the phone (390 px) first, then the desktop composition at ≥ 900 px. Horizontal rails scroll inside their own container (`overflow-x:auto; scroll-snap-type:x mandatory; overscroll-behavior-x:contain`) so the page never scrolls sideways.

### R7. Demo photos (Higgsfield)

1. Once per batch: `mcp__claude_ai_higgsfield__balance`. A batch needs ~50 images; if credits are short, stop and tell the owner.
2. Once per batch: `mcp__claude_ai_higgsfield__models_explore` with `action: "recommend"` for "photorealistic e-commerce product and lifestyle photography"; use that model for the batch.
3. Per template: `mcp__claude_ai_higgsfield__generate_image_batch` with the brief's prompts, each ending ", professional e-commerce photography, natural light, no text, no logos, no watermark", at the brief's aspect ratios; then `mcp__claude_ai_higgsfield__jobs_wait`. Regenerate any image with visible text, logos or malformed hands/products.
4. Download each result URL into the scratchpad and compress into the template:

```bash
curl -sL "$RESULT_URL" -o "$SCRATCH/$ID-$SLOT.png"
sips -s format jpeg -s formatOptions 72 -Z 1400 "$SCRATCH/$ID-$SLOT.png" --out "packages/store-templates/templates/$ID/demo/$SLOT.jpg"
stat -f%z "packages/store-templates/templates/$ID/demo/$SLOT.jpg"   # must be ≤ 614400; else rerun with formatOptions 60
```

### R8. Per-template gate

```bash
cd /Users/saramia/pagosYa/packages/store-templates && node --test test/*.test.mjs
cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-templates-contract.spec.ts src/storefront-source/source-templates-motion.spec.ts -t "plantilla $ID"
cd /Users/saramia/pagosYa/apps/api && CAPTURE_TEMPLATE_PREVIEWS=1 TEMPLATE_IDS=$ID npx jest source-templates-previews.tool
```

Expected: all pass; previews written to `apps/merchant-studio/public/plantillas/$ID.webp` and `$ID-mobile.webp`. Open both with the Read tool and check them against the brief; fix and rerun until they match.

### R9. Template task steps (every template task follows these)

- [ ] Generate photos (R7 steps 3–4) into `templates/<id>/demo/`.
- [ ] Write `template.json` (R1) with the brief's fields and listed slots.
- [ ] Run `node --test test/*.test.mjs` in `packages/store-templates` and see the red: `lookalike.test.mjs` fails with "<id> has fewer than 6 home sections" or "<id> has no <CartTemplate>".
- [ ] Write `Shell.tsx`, `home.tsx`, `product.tsx`, `checkout.tsx`, `globals.css` (R2–R6) to the brief.
- [ ] Run the gate (R8); read the previews; iterate until they match the brief.
- [ ] Commit: `git add packages/store-templates/templates/<id> apps/merchant-studio/public/plantillas/<id>.webp apps/merchant-studio/public/plantillas/<id>-mobile.webp` and the commit message given in the task.

### R10. Batch QA steps (every batch QA task follows these)

- [ ] `cd packages/store-templates && node --test test/*.test.mjs` and `cd apps/api && npx jest src/storefront-source/source-templates` — all PASS.
- [ ] Browser QA: start the dev stack (use the `run` skill), open the Studio gallery, preview each batch template on a dev store with several real products. At 390 px and 1440 px: compare with its Wix reference (https://www.wix.com/website/templates/html/online-store, pages 1–2) — same level of polish, clearly different design; run product → add → cart → checkout review and confirm the template's own cart, added notice and review appear (not the kit default); no console errors.
- [ ] Review Focus checks on each batch template: (1) preview on a dev store with **one product** — no empty rail/grid boxes, no sideways scroll; (2) rename a product to "Mochila de cuero artesanal con bolsillo interior para laptop de 15 pulgadas" priced Bs 12.500 — the card clamps to two lines and the price stays on one line at 390 px; (3) give a product a tall portrait phone photo — every frame crops cleanly. Fix failures, rerun R8 for that template, commit `fix(templates): <id> — <what>`.
- [ ] Owner review: send the owner the batch's desktop and mobile previews; ask (a) any template to redo and what to change, (b) which old templates to hide now.
- [ ] Hide the old templates the owner named: add `"hidden": true,` after `"order"` in each named legacy `template.json`, run `node --test test/*.test.mjs`, then `git add packages/store-templates/templates/*/template.json && git commit -m "chore(templates): hide <ids> from the gallery at the owner's request"`.

---

### Task 1: Registry — `motor` category, `hidden` flag, `galleryTemplates()`

**Files:**
- Modify: `packages/store-templates/index.js:7` (categories), `validate` (after the `order` check), after `templateManifest` (new functions), `module.exports`
- Modify: `packages/store-templates/index.d.ts`
- Test: `packages/store-templates/test/registry.test.mjs`

**Interfaces:**
- Produces: `gallerySelection(manifests): TemplateManifest[]` (drops `hidden: true`), `galleryTemplates(): TemplateManifest[]` (`gallerySelection(listTemplates())`), `TemplateManifest.hidden?: boolean`, `TemplateCategory` includes `'motor'`. `listTemplates()` and `templateManifest(id)` still include hidden templates.

- [ ] **Step 1: Write the failing tests** — append to `registry.test.mjs`:

```js
function writeTemplate(root, id, extra = {}) {
  mkdirSync(join(root, id, 'components'), { recursive: true });
  writeFileSync(join(root, id, 'template.json'), JSON.stringify({ id, name: id, category: 'comida', description: 'x', tags: [], sitePurpose: 'shop', order: 1, photos: [], ...extra }));
}

test('motor is a template category', () => {
  assert.ok(templates.TEMPLATE_CATEGORIES.includes('motor'));
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'autos', { category: 'motor' });
  assert.equal(templates.loadTemplates(root)[0].manifest.category, 'motor');
});

test('hidden must be true or false when present', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'raro', { hidden: 'yes' });
  assert.throws(() => templates.loadTemplates(root), /raro.*hidden/);
});

test('the gallery leaves hidden templates out, but a hidden template keeps its manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'visible');
  writeTemplate(root, 'oculta', { hidden: true });
  const manifests = templates.loadTemplates(root).map(entry => entry.manifest);
  assert.deepEqual(templates.gallerySelection(manifests).map(m => m.id), ['visible']);
  assert.equal(manifests.find(m => m.id === 'oculta').hidden, true);
});

test('the real gallery is the full list minus hidden ones, and hidden ones still resolve by id', () => {
  const all = templates.listTemplates();
  assert.deepEqual(templates.galleryTemplates().map(t => t.id), all.filter(t => !t.hidden).map(t => t.id));
  for (const t of all.filter(t => t.hidden)) assert.equal(templates.templateManifest(t.id).id, t.id);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/saramia/pagosYa/packages/store-templates && node --test test/registry.test.mjs`
Expected: FAIL — `motor` is not a category; `templates.gallerySelection is not a function`.

- [ ] **Step 3: Implement** in `index.js`. Line 7:

```js
const TEMPLATE_CATEGORIES = Object.freeze(['comida', 'moda', 'belleza', 'hogar', 'arte', 'tecnologia', 'mascotas', 'ninos', 'deporte', 'servicios', 'libros', 'producto-unico', 'motor']);
```

In `validate`, right after the `order` check:

```js
  if (manifest.hidden !== undefined && typeof manifest.hidden !== 'boolean') fail(id, 'hidden', 'must be true or false');
```

After `templateManifest`:

```js
/** What merchants may pick from: every template except the ones the owner hid. Hidden ones still resolve by id. */
const gallerySelection = manifests => manifests.filter(manifest => manifest.hidden !== true);
const galleryTemplates = () => gallerySelection(listTemplates());
```

`module.exports`: add `gallerySelection, galleryTemplates`.

`index.d.ts`: add `| 'motor'` to `TemplateCategory`; inside `TemplateManifest` add `/** Left out of the gallery and YAPI picks; still resolvable by id. */ readonly hidden?: boolean;`; add

```ts
export declare function galleryTemplates(): TemplateManifest[];
export declare function gallerySelection(manifests: readonly TemplateManifest[]): TemplateManifest[];
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/saramia/pagosYa/packages/store-templates && node --test test/*.test.mjs`
Expected: PASS (new and existing tests).

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/index.js packages/store-templates/index.d.ts packages/store-templates/test/registry.test.mjs
git commit -m "feat(templates): motor category, hidden flag and galleryTemplates() for the Plantillas gallery"
```

---

### Task 2: Merchant-facing listings use the gallery; `motor` labels

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts:15,20`
- Modify: `apps/api/src/storefront-source/source-chat.service.ts:28,383`
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts:1,67,70`
- Modify: `apps/api/src/storefront-source/source-templates.ts:73-76`
- Modify: `apps/merchant-studio/src/source-templates.ts:9-11`
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts:131-135`

**Interfaces:**
- Consumes: `galleryTemplates()` from Task 1.
- Produces: `SourceTemplatesService.registry: Pick<typeof registry, 'galleryTemplates' | 'templateManifest' | 'templateSourceFiles'>`.

- [ ] **Step 1: Write the failing tests** — replace the `lists templates without file details` test with:

```ts
  it('lists the gallery templates without file details', () => {
    const { templates } = service(0);
    templates.registry = { ...templates.registry, galleryTemplates: () => [manifest] };
    expect(templates.list()).toEqual([{ id: 'prueba', name: 'Prueba', category: 'comida', description: 'Una tienda de prueba.', tags: [], order: 1 }]);
  });

  it('still previews a template the owner hid from the gallery', async () => {
    const { templates } = service(0);
    templates.registry = { ...templates.registry, galleryTemplates: () => [] };
    await expect(templates.preview('m1', 'store-1', 'prueba')).resolves.toBeDefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-templates.service.spec.ts`
Expected: FAIL — `list()` still reads `listTemplates`, so it returns the real registry instead of `[manifest]`.

- [ ] **Step 3: Implement**

`source-templates.service.ts`:

```ts
  registry: Pick<typeof registry, 'galleryTemplates' | 'templateManifest' | 'templateSourceFiles'> = registry;
```

```ts
  list() {
    return this.registry.galleryTemplates().map(({ id, name, category, description, tags, order }) => ({ id, name, category, description, tags, order }));
  }
```

`source-chat.service.ts:28`: `import { galleryTemplates, templateManifest } from '@pagosya/store-templates';` and line 383: `templateChoices = rankTemplates(decision.summary, galleryTemplates(), decision.templates);`

`source-conversation.service.ts:1`: `import { galleryTemplates } from '@pagosya/store-templates';`; line 67: `const templateIds = galleryTemplates().map(template => template.id);`; line 70: replace `listTemplates()` with `galleryTemplates()` (mapping unchanged).

`source-templates.ts` `CATEGORY_BUSINESS`: add `motor: 'Autopartes y motor',` after `'producto-unico'`.

`apps/merchant-studio/src/source-templates.ts` `CATEGORY_LABELS`: add `motor: 'Motor',` after `'producto-unico'`.

- [ ] **Step 4: Run to verify**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-templates.service.spec.ts src/storefront-source/source-chat src/storefront-source/source-conversation && npx tsc --noEmit -p .`
Expected: PASS, no type errors.
Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx tsc --noEmit -p .`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-templates.service.ts apps/api/src/storefront-source/source-templates.service.spec.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-templates.ts apps/merchant-studio/src/source-templates.ts
git commit -m "feat(templates): gallery, YAPI ranking and catalog prompt skip hidden Plantillas; motor labels"
```

---

### Task 3: Look-alike and commerce-slot tests

**Files:**
- Create: `packages/store-templates/test/lookalike.test.mjs`

**Interfaces:**
- Consumes: `listTemplates`, `templateSourceFiles`.
- Produces: `LEGACY` (the 30 pre-existing ids), exempt from these rules.

- [ ] **Step 1: Write the test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { listTemplates, templateSourceFiles } = require('../index.js');

/** The Plantillas that existed before the Wix-style set (spec 2026-09-28 §6.3). */
const LEGACY = new Set(['aro', 'aurora', 'barro', 'brillo', 'chispa', 'crunch', 'cumbre', 'encaje', 'flora', 'huella', 'huerta', 'juguete', 'lienzo', 'miga', 'nido', 'pagina', 'pasarela', 'paso', 'pausa', 'piel', 'punto', 'raiz', 'ritmo', 'sesion', 'solo', 'taller', 'tostado', 'trenza', 'urbano', 'vela']);

const tsx = id => templateSourceFiles(id).filter(f => f.path.endsWith('.tsx')).map(f => f.content).join('\n');
const homeSections = id => {
  const home = templateSourceFiles(id).find(f => f.path === 'components/home.tsx')?.content ?? '';
  return [...home.matchAll(/\n {6}<section id="([^"]+)"/g)].map(m => m[1]);
};
const fresh = () => listTemplates().filter(t => !LEGACY.has(t.id));

test('a new template has 6–9 home sections in a sequence no other template uses', () => {
  const all = listTemplates().map(t => ({ id: t.id, seq: homeSections(t.id).join(',') }));
  for (const t of fresh()) {
    const count = homeSections(t.id).length;
    assert.ok(count >= 6 && count <= 9, `${t.id} has ${count} home sections; it needs 6–9`);
    const seq = homeSections(t.id).join(',');
    const twin = all.find(o => o.id !== t.id && o.seq === seq);
    assert.equal(twin, undefined, `${t.id} repeats the home sections of ${twin?.id}: ${seq}`);
  }
});

const REQUIRED = {
  CartTemplate: ['data-cart-close', 'name="lines"', 'name="total"', 'name="action"'],
  CartLineTemplate: ['name="name"', 'name="line-total"', 'name="quantity"'],
  AddedTemplate: ['name="message"', 'data-cart-open'],
  ReviewTemplate: ['name="summary"', 'name="fields"'],
  ProductPageTemplate: ['name="gallery"', 'name="title"', 'name="pricing"', 'name="buy"'],
};

test('a new template owns its cart, line, added notice, review and product page with every required slot', () => {
  for (const t of fresh()) {
    const code = tsx(t.id);
    for (const [component, slots] of Object.entries(REQUIRED)) {
      const block = code.match(new RegExp(`<${component}>([\\s\\S]*?)</${component}>`))?.[1];
      assert.ok(block, `${t.id} has no <${component}>`);
      for (const slot of slots) assert.ok(block.includes(slot), `${t.id} <${component}> is missing ${slot}`);
    }
  }
});

test('the section reader sees real home sections', () => {
  assert.ok(homeSections('aro').length >= 3);
});
```

- [ ] **Step 2: Run it**

Run: `cd /Users/saramia/pagosYa/packages/store-templates && node --test test/lookalike.test.mjs`
Expected: PASS (no new templates yet; the legacy pair `pasarela`/`urbano` shares a sequence and is exempt).

- [ ] **Step 3: Prove it bites**

```bash
cd /Users/saramia/pagosYa/packages/store-templates
cp -R templates/aro templates/zzcopia && sed -i '' 's/"id": "aro"/"id": "zzcopia"/' templates/zzcopia/template.json
node --test test/lookalike.test.mjs   # expect FAIL: "zzcopia has 4 home sections…" (or "repeats … aro") and "zzcopia has no <CartTemplate>"
rm -rf templates/zzcopia && node --test test/lookalike.test.mjs   # expect PASS
```

- [ ] **Step 4: Commit**

```bash
git add packages/store-templates/test/lookalike.test.mjs
git commit -m "test(templates): new Plantillas need 6–9 unique home sections and must own every commerce template"
```

---

## Batch 1 — bolso, brote, granja, rubor, colita, enchufe

Before Task 4: R7 steps 1–2 (balance, model) for the batch.

### Task 4: Plantilla "Bolso" (ref. Wix "Tote")

**Files:** Create `packages/store-templates/templates/bolso/**`; previews `apps/merchant-studio/public/plantillas/bolso{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Bolso — printed totes, product-as-hero on white (Wix Tote feel)`

**Brief:**
- id `bolso` · name "Bolso" · category `moda` · order −240 · prefix `bo`
- Description: "Bolsos y totes estampados: fondo blanco, producto como protagonista, colores vivos y un nombre con carácter."
- Tags: bolsos, estampados, accesorios, colorido
- Fonts: display `young-serif`, text `figtree`
- Palette: bg #ffffff, ink #1d1a17, sky #7fa7d6, brick #c8423b, mustard #e9c46a
- DNA: case none · radius none · border hairline · button block · hover invert · press sink · motion snappy · cart drawer · added toast · card zoom · frame inset
- Header: white; chunky store name left with a tiny tagline under it; small centered nav; account + cart right.
- Home sections: `portada` — centered small heading "Bolsos con actitud" (h1) above a row of four product photos `p1`–`p4` standing on white, each with a short name under it (phone: 2×2) · `mas-vendidos` — catalog, 4 columns desktop / 2 phone · `estampas` — three category tiles Animales, Signos, Frutas on sky/brick/mustard · `hecho-a-mano` — split: `taller` photo in `Parallax` + "Serigrafía a mano en El Alto" · `resenas` — three quotes with first name and city · `boletin` — mustard band with email line and button.
- Product page: gallery left 60%; right: category, title, rating, pricing, buy, `info`, `delivery`; related below.
- Cart: right drawer, white, square thumbnails, big total, black block action. Added: bottom-left toast with photo.
- Photos (slots `p1, p2, p3, p4, taller, calle`): `p1`–`p4` (4:5): canvas tote bags on pure white, each a bold screen print — olive scorpion on sky-blue bag; white scales on navy bag; abstract red animal on pink bag; red dragon line art on coral bag · `taller` (3:2): hands pulling a screen-print squeegee over a canvas bag in a small workshop · `calle` (4:5): young woman walking a sunny La Paz street carrying a printed tote (used in `resenas` as background tile).

### Task 5: Plantilla "Brote" (ref. Wix "Re.vert")

**Files:** Create `packages/store-templates/templates/brote/**`; previews `brote{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Brote — sustainable home essentials, big serif name hero (Wix Re.vert feel)`

**Brief:**
- id `brote` · name "Brote" · category `hogar` · order −230 · prefix `br`
- Description: "Esenciales sostenibles para el hogar: bodegones cálidos, un gran nombre en serif y cero plástico."
- Tags: sostenible, jabones, hogar, natural
- Fonts: display `fraunces`, text `outfit`
- Palette: bg #f1ede2, ink #2f3326, olive #d9dc9a, clay #b8674a
- DNA: case none · radius pill · border hairline · button pill · hover fill · press sink · motion calm · cart drawer · added toast · card zoom · frame rounded
- Header: pale-olive announcement bar "Envío gratis en Cochabamba desde Bs 200"; row with "Menú" left, store initials monogram center, account + cart right.
- Home sections: `origen` — full-bleed `hero` still life; store name huge in cream serif, centered (h1); one-line subtitle; small pill button · `esenciales` — catalog 3 columns on cream cards · `rituales` — three tall tiles Baño, Cocina, Limpieza (`bano`, `cocina`, `limpieza`) · `sin-plastico` — three big figures "0 plástico", "100% compostable", "Hecho en Cochabamba" · `recarga` — split: `recarga` photo in `Parallax` + refill program · `resenas` — two long quotes · `boletin` — email signup on olive.
- Product page: gallery with thumbnails left; right: title, pricing, `highlights` as ingredient chips, buy, `description`, `info` titled "Cómo usar".
- Cart: cream drawer, rounded thumbnails, pill action. Added: toast.
- Photos (slots `hero, p1, p2, p3, bano, cocina, limpieza, recarga`): `hero` (3:2): natural soap bars and a glass bottle on grey stone, soft shadow, muted olive tones · `p1` soap bar stack, `p2` amber refill bottle, `p3` wooden dish brush (4:5 on linen) · `bano`, `cocina`, `limpieza` (4:5): each room detail with the products in use · `recarga` (3:2): refilling a glass bottle from a large jug.

### Task 6: Plantilla "Granja" (ref. Wix "Lewis Chicken Farm")

**Files:** Create `packages/store-templates/templates/granja/**`; previews `granja{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Granja — farm produce, giant wide-caps name over a field (Wix Farm feel)`

**Brief:**
- id `granja` · name "Granja" · category `comida` · order −220 · prefix `gr`
- Description: "Granja y productos del campo: fotos a todo lo ancho, nombre gigante y reparto por días de la semana."
- Tags: granja, huevos, orgánico, campo
- Fonts: display `syne`, text `bitter`
- Palette: bg #f5f1e6, ink #1e2a1a, green #3f5b2c, yolk #f2b632
- DNA: case upper · radius soft · border none · button block · hover lift · press sink · motion cinematic · cart sheet · added ribbon · card zoom · frame rounded
- Header: sticky, transparent over the hero, cream background after the hero (CSS only); small store name left; nav right.
- Home sections: `campo` — full-bleed `hero`; store name in huge wide white caps stacked over it (h1, `overflow-wrap:anywhere`); strip "100% orgánico / Pastoreo libre / Sin químicos" · `canasta` — catalog 3 columns · `como-criamos` — three numbered columns with `gallinas`, `pasto`, `recoleccion` · `reparto` — two big cards "Martes" and "Viernes" with Cochabamba zones (Cercado, Sacaba, Quillacollo) · `visita` — split: `granjero` photo in `Parallax` + "Visítanos los sábados" · `preguntas` — 4-item FAQ.
- Product page: large photo (full width phone / left desktop); info: title, pricing, buy (options as pills), `delivery` prominent.
- Cart: cream bottom sheet, yolk action. Added: ribbon.
- Photos (slots `hero, p1, p2, p3, gallinas, pasto, recoleccion, granjero`): `hero` (16:9): green field with free-range hens, a hand holding a wicker basket of brown eggs · `p1` eggs in a carton, `p2` fresh farm cheese, `p3` jar of honey (4:5 rustic wood) · `gallinas`, `pasto`, `recoleccion` (1:1) · `granjero` (3:2): farmer in rubber boots at sunrise.

### Task 7: Plantilla "Rubor" (ref. Wix "dreama.")

**Files:** Create `packages/store-templates/templates/rubor/**`; previews `rubor{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Rubor — bold pink skincare, giant lowercase name (Wix dreama feel)`

**Brief:**
- id `rubor` · name "Rubor" · category `belleza` · order −210 · prefix `ru`
- Description: "Skincare con actitud: rosa intenso, retrato a pantalla completa y un nombre enorme en minúsculas."
- Tags: skincare, piel, rutina, rosa
- Fonts: display `bricolage`, text `figtree`
- Palette: pink #f06a8a, wine #3a0f1a, cream #fff1e6, red #c8102e
- DNA: case none · radius pill · border none · button pill · hover fill · press pop · motion snappy · cart drawer · added toast · card zoom · frame bleed
- Header: wine announcement bar "Envío gratis desde Bs 250"; white header: bold lowercase store name + "." left, nav center (Limpiar, Hidratar, Proteger, Novedades), cart right.
- Home sections: `piel` — full-bleed pink `hero` portrait; top-left "la revolución del cuidado de la piel" + red pill; store name in huge cream bold lowercase with a period across the bottom (h1, `overflow-wrap:anywhere`) · `rutina` — three numbered cards Limpia / Hidrata / Protege · `mas-queridos` — catalog 4 columns on pink-tinted cards · `ingredientes` — glossary grid of 6 (niacinamida, ácido hialurónico, vitamina C, centella, ceramidas, SPF) with the `textura` photo in `Parallax` · `antes-despues` — kit `BeforeAfter` (import from `@pagosya/ui`) with `antes`/`despues` · `resenas` · `boletin`.
- Product page: photo left; right: title, pricing, `highlights` as skin-type chips, buy, `description`, `info` as ingredients.
- Cart: cream drawer with a pink header strip. Added: toast.
- Photos (slots `hero, p1, p2, p3, textura, antes, despues`): `hero` (3:2): close portrait of a young woman with glowing skin on a hot-pink background · `p1` serum dropper bottle, `p2` cream jar, `p3` sunscreen tube (4:5 pink studio) · `textura` (1:1): cream swatch texture · `antes`, `despues` (4:5): same cheek close-up, dry then hydrated.

### Task 8: Plantilla "Colita" (ref. Wix "Magora")

**Files:** Create `packages/store-templates/templates/colita/**`; previews `colita{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Colita — playful pet store, floating yellow nav (Wix Magora feel)`

**Brief:**
- id `colita` · name "Colita" · category `mascotas` · order −200 · prefix `co`
- Description: "Tienda de mascotas alegre: barra flotante amarilla, perros felices desde arriba y una caja central que invita."
- Tags: mascotas, perros, gatos, juguetes
- Fonts: display `chivo`, text `outfit`
- Palette: plum #6b1d3a, yellow #fff27a, cream #fff9e8, blue #58a6ff
- DNA: case none · radius round · border bold · button bubbly · hover lift · press squash · motion playful · cart sheet · added bubble · card tilt · frame rounded
- Header: floating rounded yellow bar inset 12 px; bold store name left, nav center, account + cart right.
- Home sections: `colas` — plum full-bleed `hero`; centered yellow rounded box "Colas felices empiezan aquí" (h1), one line, round plum "Comprar" button · `por-mascota` — four round tiles Perro, Gato, Cachorro, Senior (`perro`, `gato`, `cachorro`, `senior`) · `favoritos` — catalog 4 columns, yellow cards · `nutricion` — split: `comida` photo in `Parallax` + feeding guide · `club` — plum band "Club Colita: 10% en cada pedido repetido" · `resenas` — three pet-owner quotes · `boletin`.
- Product page: photo in a rounded yellow frame; `highlights` as "Para: perro / gato" chips; `info` as a feeding table.
- Cart: cream bottom sheet with bold border. Added: bubble.
- Photos (slots `hero, p1, p2, p3, perro, gato, cachorro, senior, comida`): `hero` (16:9): overhead shot of five happy dogs of different breeds on a plum floor with colorful toys · `p1` rope toy, `p2` bag of dog food, `p3` round pet bed (4:5 cream) · `perro`, `gato`, `cachorro`, `senior` (1:1 portraits) · `comida` (3:2): dog eating from a ceramic bowl.

### Task 9: Plantilla "Enchufe" (ref. Wix "Jauter")

**Files:** Create `packages/store-templates/templates/enchufe/**`; previews `enchufe{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Enchufe — gadgets, rounded grey panels and comparison table (Wix Jauter feel)`

**Brief:**
- id `enchufe` · name "Enchufe" · category `tecnologia` · order −190 · prefix `ec` (legacy `encaje` already uses `en-`)
- Description: "Gadgets y accesorios: paneles grises redondeados, titulares directos y comparación de productos."
- Tags: tecnología, gadgets, accesorios, audio
- Fonts: display `familjen-grotesk`, text `manrope`
- Palette: bg #f2f2f2, ink #0f0f0f, lime #d4ff3d, purple #5b2eff
- DNA: case none · radius round · border none · button pill · hover lift · press pop · motion snappy · cart overlay · added toast · card zoom · frame rounded
- Header: lime announcement "Envío gratis desde Bs 500"; black rounded header bar inset 12 px: store name left, nav center (Todo, Audio, Carga, Hogar inteligente, Novedades), black "Carrito (0)" pill right.
- Home sections: `conectado` — light grey rounded panel with a subtle CSS grid pattern; small `hero` product image top-center; huge bold "Tecnología útil. Precios justos." (h1); purple pill · `mas-vendidos` — catalog as a contained horizontal snap rail inside a grey rounded panel · `categorias` — four tiles Audio, Carga, Hogar inteligente, Accesorios (`audio`, `carga`, `hogar`, `accesorios`) · `comparar` — static 3-column table comparing three earbuds (batería, cancelación de ruido, resistencia al agua, precio) · `soporte` — trust strip: garantía 1 año, soporte por WhatsApp, factura con NIT · `escritorio` — `escritorio` photo in `Parallax` with a caption card · `preguntas`.
- Product page: product on a grey rounded card left; right: title, rating, pricing, buy, `highlights` as spec rows, `info` titled "Qué incluye".
- Cart: centered overlay, white card. Added: toast.
- Photos (slots `hero, p1, p2, p3, audio, carga, hogar, accesorios, escritorio`): `hero` (1:1): compact camera on light grey · `p1` wireless earbuds, `p2` fast charger, `p3` smart plug (4:5 light grey) · `audio`, `carga`, `hogar`, `accesorios` (1:1) · `escritorio` (3:2): clean desk setup with laptop and gadgets.

### Task 10: Batch 1 QA and owner review

**Steps:** R10 for `bolso, brote, granja, rubor, colita, enchufe`.

---

## Batch 2 — sastre, regalo, voltio, rocio, vinilo, papel

Before Task 11: R7 steps 1–2 for the batch.

### Task 11: Plantilla "Sastre" (ref. Wix "Fashion Store (Clean)")

**Files:** Create `packages/store-templates/templates/sastre/**`; previews `sastre{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Sastre — clean tailoring, floating product card over portrait (Wix Fashion Clean feel)`

**Brief:**
- id `sastre` · name "Sastre" · category `moda` · order −180 · prefix `sa`
- Description: "Moda sastre limpia: retrato a pantalla completa, serif itálica y una tarjeta de producto flotando sobre la foto."
- Tags: moda, sastrería, mujer, elegante
- Fonts: display `instrument-serif`, text `instrument`
- Palette: bg #f4f1ec, ink #1b1b1b, oxblood #7a1f1f
- DNA: case none · radius none · border none · button underline · hover underline-grow · press none · motion calm · cart drawer · added inline · card still · frame bleed
- Header: thin, over the hero: italic serif store name left, nav beside it (Todo, Mujer, Hombre, Accesorios), account + cart right.
- Home sections: `presentacion` — full-bleed `hero`; bottom-left italic "Estilo, redefinido" (h1) + one line + underline link; bottom-right floating white card with `p1`, name and "Bs 890" linking to `#novedades` (phone: card sits below the photo) · `novedades` — catalog as a contained horizontal snap rail · `colecciones` — two tall split tiles Mujer / Hombre (`mujer`, `hombre`) · `sastreria` — large italic editorial quote with a small `detalle` photo in `Parallax` · `entrega` — trust strip: envío en La Paz en 24 h, cambios en 15 días, pago con QR · `boletin`.
- Product page: `gallery` styled as a vertical stack of full-width photos left; sticky info right: title, pricing, buy, `description`, `delivery`.
- Cart: full-height drawer, serif heading "Tu bolsa", hairline separators. Added: inline.
- Photos (slots `hero, p1, p2, p3, mujer, hombre, detalle`): `hero` (16:9): woman in a tailored camel blazer seated on a deep red velvet sofa, editorial · `p1` black leather handbag (4:5 white) · `p2` blazer on a hanger, `p3` wide trousers flat lay (4:5) · `mujer`, `hombre` (3:4 editorial portraits) · `detalle` (1:1): hand stitching a lapel.

### Task 12: Plantilla "Regalo" (ref. Wix "JSY")

**Files:** Create `packages/store-templates/templates/regalo/**`; previews `regalo{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Regalo — pastel gift shop, half color half photo (Wix JSY feel)`

**Brief:**
- id `regalo` · name "Regalo" · category `hogar` · order −170 · prefix `rg`
- Description: "Tienda de regalos en pasteles: mitad color, mitad foto, packs listos y fechas para regalar."
- Tags: regalos, velas, pastel, packs
- Fonts: display `sora`, text `nunito`
- Palette: bg #fbf6e9, butter #efe3a7, lilac #d9d2f2, ink #262626, peach #f3b391
- DNA: case none · radius pill · border none · button outline · hover fill · press pop · motion playful · cart drawer · added bubble · card tilt · frame rounded
- Header: lilac announcement "15% en tu primera compra"; bold store name centered; nav centered under it (Hogar · Accesorios · Packs); account + cart at the right of the name row.
- Home sections: `obsequio` — 50/50 split: left butter panel "El regalo de buen gusto" (h1), copy, outline pill; right `hero` · `para-quien` — four pastel tiles Para ella, Para él, Para casa, Hasta Bs 100 · `favoritos` — catalog 4 columns · `packs` — two big pastel cards with `pack1`, `pack2` and bundle copy · `envuelto` — split: `envoltura` photo in `Parallax` + gift-wrap and card-message service · `fechas` — strip of Bolivian gift dates: Día del Padre 19 de marzo, Día de la Madre 27 de mayo, Día del Amor 21 de septiembre, Navidad · `boletin`.
- Product page: centered stacked gallery on butter; info below: title, pricing, buy, `info` titled "Agrega una tarjeta".
- Cart: drawer with a peach header, rounded lines. Added: bubble.
- Photos (slots `hero, p1, p2, p3, pack1, pack2, envoltura`): `hero` (4:5): twisted pastel candles in pink, blue and orange on a lilac sphere, soft studio light · `p1` ceramic mug, `p2` scented candle jar, `p3` silk scrunchie set (4:5 pastel) · `pack1`, `pack2` (3:2): gift boxes with tissue paper · `envoltura` (3:2): hands tying a ribbon on a wrapped gift.

### Task 13: Plantilla "Voltio" (ref. Wix "Zelcon")

**Files:** Create `packages/store-templates/templates/voltio/**`; previews `voltio{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Voltio — energy drinks on an electric gradient (Wix Zelcon feel)`

**Brief:**
- id `voltio` · name "Voltio" · category `comida` · order −160 · prefix `vo`
- Description: "Bebidas energéticas: degradado eléctrico, latas inclinadas y titulares enormes con energía."
- Tags: bebidas, energía, latas, deporte
- Fonts: display `anton`, text `rubik`
- Palette: blue #1d2bff, green #19c38a, red #ff2d2d, white #ffffff, ink #0a0a0a
- DNA: case upper · radius pill · border none · button sticker · hover lift · press squash · motion playful · cart overlay · added bubble · card tilt · frame blob
- Header: red announcement using kit `Marquee` (three short lines); header on the gradient: bold store name left, nav right (Sabores, Packs, Nosotros), white cart pill.
- Home sections: `energia` — blue→green gradient; "Hecho para moverte" huge, centered (h1); `hero` photo of three tilted cans overlapping the bottom edge · `sabores` — catalog; card backgrounds cycle red, blue, green, yellow via `:nth-child` · `ingredientes` — three giant stats "0 azúcar", "80 mg cafeína", "Vitamina B12" · `packs` — three cards 6 / 12 / 24 latas · `atletas` — mosaic of `atleta1`, `atleta2`, `atleta3`, with `atleta1` in `Parallax` · `preguntas`.
- Product page: can photo centered huge on a flavor-colored panel; below in two columns: pricing + buy / `info` as a nutrition table.
- Cart: centered rounded white overlay. Added: bubble.
- Photos (slots `hero, p1, p2, p3, atleta1, atleta2, atleta3`): `hero` (16:9): three energy drink cans (red, yellow, green, abstract unbranded graphics) tilted mid-air on a blue-green gradient · `p1` red can, `p2` yellow can, `p3` green can (4:5 flat color) · `atleta1` runner at dawn, `atleta2` cyclist, `atleta3` climber (3:4).

### Task 14: Plantilla "Rocío" (ref. Wix "Noelle")

**Files:** Create `packages/store-templates/templates/rocio/**`; previews `rocio{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Rocío — radiant makeup, close portrait and shade row (Wix Noelle feel)`

**Brief:**
- id `rocio` · name "Rocío" · category `belleza` · order −150 · prefix `ro`
- Description: "Maquillaje luminoso: retrato de cerca, serif itálica, tonos lila y una fila de tonos para elegir."
- Tags: maquillaje, labios, ojos, brillo
- Fonts: display `playfair-display`, text `sora`
- Palette: bg #f7f2ef, ink #2d2a3a, lilac #b7b0e8, rose #d98b8b
- DNA: case none · radius soft · border hairline · button block · hover invert · press sink · motion cinematic · cart drawer · added inline · card zoom · frame rounded
- Header: italic serif store name left; small nav right (Todo, Ojos, Labios, Rostro, Novedades); account + cart.
- Home sections: `destello` — full-bleed `hero`; bottom-left small caps "NOVEDAD" + italic "Metálicos que brillan" (h1) + lilac button · `categorias` — four round tiles Ojos, Labios, Rostro, Uñas (`ojos`, `labios`, `rostro`, `unas`) · `tonos` — row of 8 CSS color circles with shade names (Canela, Durazno, Malva, Cereza, Arena, Coral, Ciruela, Nude) · `novedades` — catalog 3 columns · `tutorial` — three step photos `paso1`–`paso3` with captions, `paso2` in `Parallax` · `resenas` · `boletin`.
- Product page: gallery with vertical thumbnails; info: title, rating, pricing, buy, `info` titled "Cómo aplicar".
- Cart: lilac-tinted drawer. Added: inline.
- Photos (slots `hero, p1, p2, p3, ojos, labios, rostro, unas, paso1, paso2, paso3`): `hero` (3:2): close portrait, freckles, flushed cheeks, pearl earring, green top, soft blue backdrop · `p1` lipstick, `p2` eyeshadow palette, `p3` blush compact (4:5) · `ojos`, `labios`, `rostro`, `unas` (1:1 macro) · `paso1`–`paso3` (4:5): applying primer, eyeshadow, lip color.

### Task 15: Plantilla "Vinilo" (ref. Wix "Vintage Needle")

**Files:** Create `packages/store-templates/templates/vinilo/**`; previews `vinilo{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Vinilo — secondhand books and records, giant grey headline (Wix Vintage Needle feel)`

**Brief:**
- id `vinilo` · name "Vinilo" · category `libros` · order −140 · prefix `vn`
- Description: "Libros y discos de segunda mano: titular gris gigante, géneros numerados y el estado de cada pieza."
- Tags: vinilos, libros, usados, música
- Fonts: display `oswald`, text `space-mono`
- Palette: bg #f4f0e6, ink #2b2b2b, grey #8e8e8e, red #c0392b
- DNA: case upper · radius none · border bold · button block · hover invert · press sink · motion snappy · cart drawer · added stamp · card still · frame inset
- Header: thin: tiny nav left, condensed store name centered, account + cart right.
- Home sections: `aguja` — giant grey condensed "Gira la historia" across the width (h1); row of six small b&w thumbnails numbered 01–06 (Rock boliviano, Folklore, Jazz, Cumbia, Novela, Poesía — `g1`–`g6`, scrolling in a contained row on phone); `hero` photo below · `llegados` — catalog 4 columns, sepia-toned cards · `estado` — grading legend: Nuevo, Como nuevo, Muy bueno, Bueno with one-line meanings · `vende` — split: `vende` photo in `Parallax` + "Te compramos tus discos y libros" · `visitanos` — address, hours and a block map drawn with CSS borders · `boletin`.
- Product page: photo left; right: `category` as a condition badge, title, pricing, buy, `description` as track list / synopsis.
- Cart: drawer with a bold black border. Added: stamp.
- Photos (slots `hero, g1, g2, g3, g4, g5, g6, p1, p2, p3, vende`): `hero` (16:9): two friends laughing between tall bookshelves and record crates · `g1`–`g6` (1:1 b&w): record covers and book spines, abstract, no text · `p1` vinyl record sleeve, `p2` stack of used books, `p3` cassette (4:5) · `vende` (3:2): hands flipping through a record crate.

### Task 16: Plantilla "Papel" (ref. Wix "Lou Paperi")

**Files:** Create `packages/store-templates/templates/papel/**`; previews `papel{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Papel — colorful stationery, collection tiles (Wix Lou Paperi feel)`

**Brief:**
- id `papel` · name "Papel" · category `arte` · order −130 · prefix `pa`
- Description: "Papelería con color: marquesina azul, colecciones en cuadros de colores y patrones que se lucen."
- Tags: papelería, cuadernos, regalo, diseño
- Fonts: display `outfit`, text `space-mono`
- Palette: white #ffffff, blue #1f3ecf, yellow #ffd23f, red #e4572e, black #111111
- DNA: case none · radius none · border bold · button block · hover invert · press sink · motion snappy · cart drawer · added ribbon · card zoom · frame inset
- Header: blue announcement using kit `Marquee`; white header: nav left (Inicio, Tienda, Nosotros), centered store name with a small circle mark, account + cart right.
- Home sections: `colecciones` — "Papelería con color" (h1) centered, then four square tiles Cuadernos, Lápices, Papel de regalo, Tarjetas (`c1`–`c4` on yellow/blue/red/yellow with black label bars) · `novedades` — catalog as a contained rail on a black strip · `patrones` — three large pattern tiles `patron1`–`patron3` · `personaliza` — split: `imprenta` photo in `Parallax` + custom printing for businesses · `talleres` — three workshops with dates and "Bs 120" · `boletin`.
- Product page: `gallery` styled as a 2×2 grid; info right: title, pricing, buy, `highlights` titled "Incluye".
- Cart: white drawer, black 2 px border. Added: ribbon.
- Photos (slots `c1, c2, c3, c4, p1, p2, p3, patron1, patron2, patron3, imprenta`; role `hero` on `c1`): `c1` notebooks, `c2` colored pencils, `c3` patterned wrapping paper, `c4` greeting cards (1:1 each on a flat color) · `p1` dotted notebook, `p2` pen set, `p3` sticker sheet (4:5) · `patron1`–`patron3` (1:1): bold geometric paper patterns · `imprenta` (3:2): risograph printer with colorful prints.

### Task 17: Batch 2 QA and owner review

**Steps:** R10 for `sastre, regalo, voltio, rocio, vinilo, papel`.

---

## Batch 3 — lente, suela, manta, helado, tinta, blandito

Before Task 18: R7 steps 1–2 for the batch.

### Task 18: Plantilla "Lente" (ref. Wix "Zilo Optics")

**Files:** Create `packages/store-templates/templates/lente/**`; previews `lente{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Lente — eyewear split screen, product on grey (Wix Zilo Optics feel)`

**Brief:**
- id `lente` · name "Lente" · category `moda` · order −120 · prefix `le`
- Description: "Óptica y lentes de sol: pantalla partida en blanco y negro, producto sobre gris y una tarjeta de colección."
- Tags: lentes, óptica, gafas, sol
- Fonts: display `bodoni-moda`, text `familjen-grotesk`
- Palette: black #0d0d0d, light #f2f2f2, grey #9a9a9a, gold #d4af37 (hairlines only)
- DNA: case upper · radius none · border hairline · button outline · hover invert · press sink · motion cinematic · cart overlay · added ribbon · card zoom · frame bleed
- Header: black announcement using kit `Marquee`; black header: store name in spaced serif caps centered; nav left (Inicio, Tienda, Historia); account + cart right.
- Home sections: `mirada` — 50/50 split: left b&w `hero` with bottom-left "Mirá diferente" (h1) and one line; right grey gradient with `producto`; floating white card top-right "Colección Sol" with a thumbnail and link · `formas` — four big-type tiles Redondos, Cuadrados, Aviador, Ojo de gato; on hover/focus each shows its photo (`f1`–`f4`) · `vitrina` — catalog 3 columns on grey · `laboratorio` — dark, three numbered steps Medida → Lentes → Entrega for prescription glasses · `probador` — split: `probador` photo in `Parallax` + "Probátelos en casa en La Paz" · `preguntas`.
- Product page: big centered photo on grey with thumbnails beneath; below in two columns: pricing + buy / `info` as a measurements table (ancho, puente, varilla).
- Cart: centered dark overlay. Added: ribbon.
- Photos (slots `hero, producto, p1, p2, p3, f1, f2, f3, f4, probador`): `hero` (3:4 b&w): man in dark sunglasses in profile on black · `producto` (4:5): black wraparound sunglasses on a grey gradient · `p1`–`p3` (4:5 grey): three frames · `f1`–`f4` (1:1): round, square, aviator, cat-eye frames · `probador` (3:2): woman trying glasses at a mirror at home.

### Task 19: Plantilla "Suela" (ref. Wix "Concrete Pulse")

**Files:** Create `packages/store-templates/templates/suela/**`; previews `suela{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Suela — urban footwear, twin panels and size band (Wix Concrete Pulse feel)`

**Brief:**
- id `suela` · name "Suela" · category `moda` · order −110 · prefix `su`
- Description: "Calzado urbano: dos paneles lado a lado, título apilado sobre el producto y guía de tallas grande."
- Tags: zapatillas, calzado, urbano, cuero
- Fonts: display `space-grotesk`, text `chivo`
- Palette: bg #e9e9e7, ink #111111, orange #ff5a1f
- DNA: case none · radius soft · border none · button block · hover lift · press pop · motion snappy · cart sheet · added toast · card tilt · frame inset
- Header: thin black announcement bar; minimal header: small round store-initial mark left; "Carrito ●" and a menu button right (the menu opens the nav in a `<details>` panel).
- Home sections: `pulso` — two equal panels: left `hero` lifestyle photo; right `zapatilla` close-up with the store name stacked large top-left (h1), short copy and a black button bottom-left (phone: panels stack) · `nuevos` — catalog 4 columns · `talla` — size band with chips 35–44 and a "Guía de tallas" note · `materiales` — three columns Cuero, Gamuza, Caucho (`m1`–`m3`) · `en-la-calle` — masonry of `calle1`–`calle4`, `calle1` in `Parallax` · `boletin`.
- Product page: `gallery` styled as a full-width contained horizontal snap strip on top; below, title + pricing left, buy right.
- Cart: bottom sheet on phone, right sheet on desktop. Added: toast.
- Photos (slots `hero, zapatilla, p1, p2, p3, m1, m2, m3, calle1, calle2, calle3, calle4`): `hero` (4:5): young woman crouched on a metal chair in brown suede shoes, pink top, white jeans, grey studio · `zapatilla` (4:5): brown suede shoe with cream laces, close-up · `p1`–`p3` (4:5): three sneakers · `m1`–`m3` (1:1 macro): leather, suede, rubber sole · `calle1`–`calle4` (3:4): street-style shots.

### Task 20: Plantilla "Manta" (ref. Wix "Umbui")

**Files:** Create `packages/store-templates/templates/manta/**`; previews `manta{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Manta — calm home textiles, best sellers overlapping the hero (Wix Umbui feel)`

**Brief:**
- id `manta` · name "Manta" · category `hogar` · order −100 · prefix `ma`
- Description: "Textiles para el hogar: dormitorio sereno, serif clásica y los más vendidos asomando sobre la portada."
- Tags: textiles, alpaca, hogar, dormitorio
- Fonts: display `libre-caslon-text`, text `manrope`
- Palette: bg #efece7, ink #3a3632, taupe #a48d74
- DNA: case none · radius none · border hairline · button pill · hover fill · press none · motion calm · cart drawer · added inline · card zoom · frame bleed
- Header: transparent over the hero: small serif store name left, nav inline (Todo, Living, Baño, Dormitorio, Novedades, Ofertas), account + cart right.
- Home sections: `calma` — full-bleed `hero` bedroom; centered serif "Hecho con calma para vivir" (h1) + italic line + black pill · `mas-vendidos` — catalog 4 columns in a white card overlapping the hero bottom by 80 px on desktop (no overlap on phone) · `ambientes` — three tall tiles Dormitorio, Living, Baño (`dormitorio`, `living`, `bano`) · `fibras` — split: `alpaca` photo in `Parallax` + "Alpaca y algodón de Bolivia" · `cuidado` — four care notes (lavar en frío, secar a la sombra, sin cloro, planchar tibio) · `resenas` · `boletin`.
- Product page: `gallery` as a 2×2 grid left; sticky info right: title, pricing, buy, `info` as fabric details.
- Cart: warm drawer, serif heading. Added: inline.
- Photos (slots `hero, p1, p2, p3, dormitorio, living, bano, alpaca`): `hero` (16:9): serene bedroom, linen bedding, grey-beige walls, morning light · `p1` alpaca throw, `p2` bathrobe, `p3` folded towels (4:5) · `dormitorio`, `living`, `bano` (3:4) · `alpaca` (3:2): alpaca yarn beside a loom.

### Task 21: Plantilla "Helado" (ref. Wix "Gelato")

**Files:** Create `packages/store-templates/templates/helado/**`; previews `helado{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Helado — ice cream parlour, sky and giant cream headline (Wix Gelato feel)`

**Brief:**
- id `helado` · name "Helado" · category `comida` · order −90 · prefix `he`
- Description: "Heladería artesanal: cielo azul, un cono en mano y un titular gigante en crema. Sabores de frutas bolivianas."
- Tags: helados, heladería, postres, frutas
- Fonts: display `shrikhand`, text `nunito`
- Palette: sky #7fb3e0, butter #fff3a6, brown #5a2e1b, cream #fff8e6
- DNA: case none · radius round · border none · button bubbly · hover lift · press squash · motion playful · cart sheet · added bubble · card tilt · frame blob
- Header: brown info bar (store city · "Todos los días 11:00–21:00"); butter header: nav left (Sabores, Nosotros, Eventos), store name centered, account right.
- Home sections: `cono` — sky-blue full `hero`; huge cream "Helado" across the bottom (h1); "Artesanal" bottom-left; brown "Sabores" button bottom-right · `sabores` — catalog with round photo cards · `de-temporada` — split: `temporada` photo in `Parallax` + seasonal flavors tumbo, chirimoya, copoazú · `para-eventos` — band with `evento` photo "Carrito de helados para tu evento" · `local` — address, hours and a CSS-drawn mini map · `boletin`.
- Product page: blob-framed photo; large title; pricing; buy with sizes (vaso, cono, litro); `description`.
- Cart: cream bottom sheet. Added: bubble.
- Photos (slots `hero, p1, p2, p3, temporada, evento`): `hero` (16:9): hand holding a three-scoop cone against a clear blue sky · `p1` cup of fruit gelato, `p2` pint tub, `p3` popsicle (4:5 pastel) · `temporada` (3:2): Bolivian tropical fruits (tumbo, chirimoya) beside gelato · `evento` (3:2): vintage ice cream cart at an outdoor party.

### Task 22: Plantilla "Tinta" (ref. Wix "Malen Vosse")

**Files:** Create `packages/store-templates/templates/tinta/**`; previews `tinta{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Tinta — an author's page with books and events (Wix Writer feel)`

**Brief:**
- id `tinta` · name "Tinta" · category `libros` · order −80 · prefix `ti`
- Description: "La página de una autora: titular condensado enorme, retrato en el campo, fragmento para leer y presentaciones."
- Tags: autora, libros, novela, lectura
- Fonts: display `bebas-neue`, text `lora`
- Palette: pink #fbe7e3, paper #fdf8f1, ink #2a2522, sky #3b6fb6
- DNA: case none · radius round · border hairline · button outline · hover fill · press none · motion calm · cart drawer · added toast · card tilt · frame rounded
- Header: floating pink rounded card with a hairline border: italic store name left, nav center (Sobre mí, Libros, Eventos, Contacto), account + cart right.
- Home sections: `autora` — huge condensed "Mundos tejidos con palabras" (h1); below, a big rounded `hero`; overlapping its bottom, a small pink card "La página oficial de {store.name}" with two lines · `libros` — catalog of covers, 3 columns, shadowed · `fragmento` — reading block with a drop cap and a two-paragraph original excerpt · `presentaciones` — three upcoming events with dates (Feria Internacional del Libro de La Paz, a café reading in Sucre, an online reading club) · `prensa` — three short quotes attributed generically ("Revista cultural", "Suplemento de libros", "Club de lectura") · `cartas` — newsletter "Cartas de la autora" with `escritorio` in `Parallax`.
- Product page: cover centered with a soft shadow; info: title, pricing, buy, `description` as sinopsis, `info` (páginas, editorial, año).
- Cart: paper-colored drawer. Added: toast.
- Photos (slots `hero, p1, p2, p3, escritorio`): `hero` (16:9): woman with pink hair and round glasses, chin on hand, in a sunlit wildflower field · `p1`–`p3` (2:3): novel covers with abstract illustrated art and **no text** · `escritorio` (3:2): writing desk with a notebook and fountain pen.

### Task 23: Plantilla "Blandito" (ref. Wix "Squishy Sandbox")

**Files:** Create `packages/store-templates/templates/blandito/**`; previews `blandito{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Blandito — soft toys under a giant bubble-letter name (Wix Squishy Sandbox feel)`

**Brief:**
- id `blandito` · name "Blandito" · category `ninos` · order −70 · prefix `bl`
- Description: "Juguetes suaves: el nombre de la tienda en letras burbuja gigantes y los peluches justo debajo."
- Tags: juguetes, peluches, niños, regalo
- Fonts: display `unbounded`, text `figtree`
- Palette: white #ffffff, ink #111111, pink #ffd1dc, yellow #ffe066, sky #bde0fe
- DNA: case upper · radius round · border none · button bubbly · hover lift · press squash · motion playful · cart overlay · added bubble · card tilt · frame blob
- Header: plain white: small store name left, nav (Tienda, Nosotros, Contacto), three outlined text pills center (TikTok, Instagram, YouTube), account + cart right.
- Home sections: `abrazo` — store name in huge black rounded letters filling the width (h1, `font-size:clamp(3rem,16vw,12rem)`, `overflow-wrap:anywhere`); directly below, `p1`–`p4` on white with a name and star rating each · `coleccion` — catalog 4 columns · `por-edad` — three colored tiles 0–2 años, 3–5 años, 6+ años · `seguro` — trust: materiales no tóxicos, costuras reforzadas, lavable · `cumple` — band with `fiesta` in `Parallax` "Regalos para cumpleaños" · `resenas` · `boletin`.
- Product page: plush centered on a pastel circle; `highlights` as age and size chips; pricing and buy below.
- Cart: centered rounded overlay. Added: bubble.
- Photos (slots `p1, p2, p3, p4, fiesta`; role `hero` on `p1`): `p1` dumpling-shaped plush, `p2` yellow star plush, `p3` white cloud plush, `p4` donut plush (1:1 on white, cute embroidered faces) · `fiesta` (3:2): kids at a birthday party hugging plush toys.

### Task 24: Batch 3 QA and owner review

**Steps:** R10 for `lente, suela, manta, helado, tinta, blandito`. Extra check: rename the dev store to "Juguetería Los Pequeños Exploradores" and confirm Blandito's and Granja's giant names wrap with no sideways scroll at 390 px.

---

## Batch 4 — perla, hora, estampa, maceta, telar, motor

Before Task 25: R7 steps 1–2 for the batch.

### Task 25: Plantilla "Perla" (ref. Wix "Érice")

**Files:** Create `packages/store-templates/templates/perla/**`; previews `perla{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Perla — quiet-luxury jewelry, intimate full-bleed portrait (Wix Érice feel)`

**Brief:**
- id `perla` · name "Perla" · category `moda` · order −60 · prefix `pe`
- Description: "Joyería de lujo silencioso: retrato íntimo a pantalla completa, serif fina y mucho aire."
- Tags: joyería, perlas, oro, lujo
- Fonts: display `dm-serif-display`, text `manrope`
- Palette: bg #efeae4, ink #2b2622, bronze #8c7a5b
- DNA: case none · radius none · border none · button underline · hover underline-grow · press none · motion cinematic · cart drawer · added stamp · card still · frame bleed
- Header: thin: spaced serif store name left, small nav center (Todo, Novedades, Anillos, Collares, Aros, Nosotros), account + cart right.
- Home sections: `retrato` — full-bleed moody `hero`; lower-third centered "Silenciosamente extraordinaria" (h1), one line, underlined "Nuevas piezas" · `piezas` — catalog 3 columns, generous whitespace, borderless cards · `materiales` — split: `perla` macro in `Parallax` + "Perlas de agua dulce, oro de 18k" · `manifiesto` — centered large italic paragraph · `cuidado` — three text columns Guardar, Limpiar, Garantía · `cita` — band "Visítanos en Santa Cruz con cita previa" with an outline button · `boletin`.
- Product page: 50/50: sticky photo left with vertical thumbnails; serif info right: title, pricing, buy, `description`, `info` as materials.
- Cart: beige drawer. Added: stamp.
- Photos (slots `hero, p1, p2, p3, perla`): `hero` (16:9): a woman's profile in soft shadow wearing a long pearl drop earring, muted beige tones · `p1` pearl ring, `p2` gold chain necklace, `p3` pearl drop earrings (4:5 on warm stone) · `perla` (1:1 macro): a single pearl on silk.

### Task 26: Plantilla "Hora" (ref. Wix "Vesper Caliber")

**Files:** Create `packages/store-templates/templates/hora/**`; previews `hora{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Hora — watches, dark wrist hero with floating product card (Wix Vesper feel)`

**Brief:**
- id `hora` · name "Hora" · category `moda` · order −50 · prefix `ho`
- Description: "Relojes con carácter: foto oscura de muñeca, tarjeta de producto flotante y especificaciones en grande."
- Tags: relojes, acero, precisión, regalo
- Fonts: display `big-shoulders-display`, text `sora`
- Palette: dark #111315, light #e8e6e1, brass #b08d57
- DNA: case upper · radius none · border hairline · button block · hover invert · press sink · motion cinematic · cart overlay · added ribbon · card zoom · frame bleed
- Header: a bordered white card floating over the hero top-left with the store name and a utility row ("Cuenta", "Carrito (0)"); a menu button right opens the nav in a `<details>` panel.
- Home sections: `calibre` — dark full-bleed `hero`; left "Hecho para el rigor" (h1) in condensed caps + small link; right floating white card with `reloj`, name and "Bs 2.400" (phone: card below the photo) · `series` — catalog as a contained rail on dark · `especificaciones` — four big figures: Movimiento automático, Cristal de zafiro, 100 m, Correa de acero · `relojero` — split: `relojero` in `Parallax` + craft story · `garantia` — trust strip: 2 años de garantía, servicio técnico en La Paz, envío asegurado · `preguntas`.
- Product page: dark page; huge centered photo; `info` spec grid below; pricing + buy in a light panel.
- Cart: centered dark overlay with brass accents. Added: ribbon.
- Photos (slots `hero, reloj, p1, p2, p3, relojero`): `hero` (16:9): man adjusting a steel watch on his wrist, dark moody light · `reloj` (4:5): steel automatic watch on white · `p1`–`p3` (4:5 dark): three watches · `relojero` (3:2): watchmaker with a loupe at a bench.

### Task 27: Plantilla "Estampa" (ref. Wix "T-Shirt Store (Urban)")

**Files:** Create `packages/store-templates/templates/estampa/**`; previews `estampa{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Estampa — streetwear tees, three-column model collage (Wix T-Shirt Urban feel)`

**Brief:**
- id `estampa` · name "Estampa" · category `moda` · order −40 · prefix `es`
- Description: "Poleras y ropa urbana: collage de tres columnas, verde lima y drops para la comunidad."
- Tags: poleras, streetwear, urbano, drops
- Fonts: display `rubik`, text `figtree`
- Palette: white #ffffff, ink #0f0f0f, lime #d7ff3a, blue #2f5bff
- DNA: case none · radius pill · border bold · button pill · hover fill · press pop · motion playful · cart sheet · added bubble · card zoom · frame inset
- Header: lime bar: nav left (Todo, Hombre, Mujer, Nuevo), round badge with the store initials centered, account + cart right.
- Home sections: `drop` — three columns: left `modelo1` full height; center white column with stacked bold "Lo último en ropa urbana" (h1), one line, a green pill, and `modelo2` below; right `modelo3` full height (phone: title first, then the three photos in a contained swipe strip) · `recien-salido` — catalog 4 columns · `graficos` — sticker-style chips Anime, Música, Bolivia, Minimal · `colaboracion` — split: `artista` in `Parallax` + artist collab story · `comunidad` — 6-photo grid `u1`–`u6` "Etiquétanos" · `boletin` "Entérate del próximo drop".
- Product page: `gallery` as a 2×2 grid left; info right: title, pricing, buy (size chips), `info` titled "Guía de tallas".
- Cart: bottom sheet with a lime header. Added: bubble.
- Photos (slots `modelo1, modelo2, modelo3, p1, p2, p3, artista, u1, u2, u3, u4, u5, u6`; role `hero` on `modelo2`): `modelo1`–`modelo3` (3:4): young people in oversized graphic tees and wide jeans, light grey studio · `p1`–`p3` (4:5): tees flat on white with bold abstract prints (no text) · `artista` (3:2): illustrator drawing a t-shirt graphic · `u1`–`u6` (1:1): street style in La Paz.

### Task 28: Plantilla "Maceta" (ref. Wix "Sprout")

**Files:** Create `packages/store-templates/templates/maceta/**`; previews `maceta{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Maceta — plant shop, dark leafy interior and shop by light (Wix Sprout feel)`

**Brief:**
- id `maceta` · name "Maceta" · category `hogar` · order −30 · prefix `mc`
- Description: "Plantas y macetas: interior oscuro y frondoso, pregunta grande en serif y compra según la luz de tu casa."
- Tags: plantas, macetas, interior, verde
- Fonts: display `newsreader`, text `figtree`
- Palette: forest #1f2a22, paper #e7e4d8, moss #8a9a5b, amber #d6a55c
- DNA: case none · radius soft · border hairline · button outline · hover invert · press sink · motion calm · cart drawer · added toast · card zoom · frame arch
- Header: olive announcement "10% en tu primera compra"; dark translucent header over the hero: nav pills left (Plantas, Macetas, Ofertas, Suscripción), round store-initials mark center, account + cart right.
- Home sections: `selva` — dark full-bleed `hero`; centered light serif "¿Existen demasiadas plantas?" (h1) + outline button · `por-luz` — four tiles Mucha luz, Poca luz, Aptas para mascotas, Fáciles de cuidar · `vivero` — catalog 3 columns on forest green with arch-framed photos · `cuidados` — three numbered care cards Riego, Luz, Abono · `suscripcion` — band "Una planta nueva cada mes" with `caja` in `Parallax` · `boletin`.
- Product page: arch-framed photo left; right: title, pricing, `highlights` as care chips (luz, riego, tamaño), buy, `description`.
- Cart: paper drawer with a forest header. Added: toast.
- Photos (slots `hero, p1, p2, p3, caja`): `hero` (16:9): dark moody living room full of plants on a rattan sideboard · `p1` monstera in a ceramic pot, `p2` snake plant, `p3` hanging pothos (4:5 on paper background) · `caja` (3:2): plant subscription box being unboxed.

### Task 29: Plantilla "Telar" (ref. Wix "Warmthwoven")

**Files:** Create `packages/store-templates/templates/telar/**`; previews `telar{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Telar — handmade slow living with named artisans (Wix Warmthwoven feel)`

**Brief:**
- id `telar` · name "Telar" · category `hogar` · order −20 · prefix `tl`
- Description: "Objetos hechos a mano para una vida lenta: franja oscura, cocina luminosa y artesanos con nombre y pueblo."
- Tags: artesanía, hecho a mano, cerámica, tejido
- Fonts: display `lora`, text `epilogue`
- Palette: bg #f3efe8, ink #3b3530, sage #6d7a5d, band #4a4540
- DNA: case none · radius none · border hairline · button block · hover fill · press sink · motion calm · cart drawer · added stamp · card still · frame inset
- Header: nav left (Inicio, Nuestra historia, Tienda), spaced caps store name centered, account + cart right.
- Home sections: `lento` — dark band on top with "Volver a lo lento" (h1) left and a short paragraph right; below, the big `hero` kitchen photo in `Parallax` with a white card top-left "La selección de temporada" (`p1` thumbnail + link) · `temporada` — catalog 4 columns · `artesanos` — three maker portraits `a1`–`a3` with name and town (Tarabuco, Charazani, Huari) · `proceso` — four numbered steps with `s1`–`s4` · `palabra` — one big quote from a maker · `boletin`.
- Product page: vertical thumbnails left, main photo center, info right: title, pricing, buy, `description` titled "Hecho por…".
- Cart: warm drawer. Added: stamp.
- Photos (slots `hero, p1, p2, p3, a1, a2, a3, s1, s2, s3, s4`): `hero` (16:9): bright rustic kitchen with a clay jug and wildflowers on a wooden table · `p1` clay bowl, `p2` woven basket, `p3` handwoven textile (4:5) · `a1`–`a3` (3:4): Andean artisans at work, respectful documentary style · `s1`–`s4` (1:1): spinning wool, dyeing, weaving, finishing.

### Task 30: Plantilla "Motor" (ref. Wix "Auto Parts Store (Dark)")

**Files:** Create `packages/store-templates/templates/motor/**`; previews `motor{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Motor — dark auto parts store with brand finder (Wix Auto Parts feel)`

**Brief:**
- id `motor` · name "Motor" · category `motor` · order −10 · prefix `mo`
- Description: "Autopartes: fondo negro, auto en penumbra, oferta directa y búsqueda por marca de vehículo."
- Tags: autopartes, repuestos, autos, taller
- Fonts: display `anton`, text `chivo`
- Palette: black #0b0b0b, panel #1a1a1a, white #ffffff, red #e10600
- DNA: case upper · radius soft · border none · button block · hover lift · press sink · motion snappy · cart drawer · added ribbon · card zoom · frame rounded
- Header: black: thin top row "Envío en 24 h en La Paz · Atención por WhatsApp"; store name left; nav right (Repuestos, Marcas, Ofertas, Contacto); account + cart.
- Home sections: `taller` — black with the dim `hero` in `Parallax`; left "Armá el auto que soñás. 15% en todo." (h1) + small red button; three trust items along the bottom (Envío rápido, Repuestos probados, Atención 24/7) · `marcas` — chips Toyota, Nissan, Suzuki, Hyundai, Kia, Mitsubishi linking to `#repuestos` · `repuestos` — catalog 4 columns on dark panels · `categorias` — four tiles Frenos, Filtros, Suspensión, Iluminación (`k1`–`k4`) · `garantia` — split: `mecanico` photo + warranty copy · `preguntas`.
- Product page: dark; photo left; right: `category` as part number, title, pricing, buy, `info` titled "Compatible con".
- Cart: dark drawer, red action. Added: ribbon.
- Photos (slots `hero, p1, p2, p3, k1, k2, k3, k4, mecanico`): `hero` (16:9): dark sports car silhouette in a dim garage, dramatic rim light · `p1` brake disc, `p2` oil filter, `p3` LED headlight (4:5 on dark grey) · `k1`–`k4` (1:1): brake caliper, air filter, shock absorber, headlight · `mecanico` (3:2): mechanic working under a car.

### Task 31: Batch 4 QA, owner review and wrap-up

**Steps:** R10 for `perla, hora, estampa, maceta, telar, motor`, then:

- [ ] Confirm the Studio gallery shows the "Motor" category label for `motor`.
- [ ] Full regression: `cd apps/api && npx jest src/storefront-source` and `cd packages/store-templates && node --test test/*.test.mjs` — all PASS.
