# YAPI creates anything, part 2 — products, categories and discount codes from chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a template store, the quick edit creates, changes and removes (archives) products, categories and discount codes in the same call and revision as its section/page edits.

**Architecture:** The quick-edit answer gains a third array `catalogo` (strict schema) beside `ops` and `store`. A new pure module `source-catalog-edit.ts` reads and checks those ops against the store digest and returns `{ change, done, refused, notes }`; a new `source-catalog-write.ts` writes the change inside `writeStoreChange`'s transaction; the chat service relinks `category:<name>` section links and drops removed categories from the menu, then refills once with live data.

**Tech Stack:** NestJS + Prisma 5 (apps/api), Jest, OpenAI Responses JSON-schema call (`editLayout`).

**Spec:** `docs/superpowers/specs/2026-11-05-yapi-creates-anything-part-2-design.md`

## Global Constraints

- Branch `oct24-clean`, commit after each task, never push. Commit only the files the task names (the tree has many unrelated untracked folders).
- Run only the spec files a task names: `cd apps/api && npx jest <files>` — never the whole `src/storefront-source` folder (it stops the owner's dev stack).
- Type check with `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json` (plain `--noEmit` breaks the API watcher's buildinfo).
- Edit files with the Edit/Write tools, never `sed -i` (nest --watch stops compiling a file replaced by sed -i). Saving apps/api restarts nest --watch and kills a running YAPI request: no live YAPI run while editing.
- Never invent a price or a discount; a missing one is an `ask`. Descriptions only from the merchant's words.
- Remove a product = `status: 'ARCHIVED'` (never delete). Remove a code = `isActive: false`. A new code is private (`showInEmails`/`showInAssistant` false).
- Limits per request: 6 new products, 5 new categories, 3 new codes; category name ≤ 60; code `^[A-Z0-9][A-Z0-9_-]{2,31}$`; percent 1–99.
- Replies in Spanish, the store's `bs()` money format («Bs 1.950», «Bs 25,50»), lowercase done-fragments joined by `layoutEditReply`.
- Catalog op shape (supersedes the spec's table by adding `stock`): `{ kind, at, name, price, stock, text, category, photo, option, value }`, all present, unused `at` -1 and strings "".

## Review Focus

1. Answering YAPI's question («¿A cuánto vendes…?») re-sends the original request: products/codes it already made must be skipped quietly, never duplicated or refused noisily → Task 3 + Task 4 + Task 8 tests (`answering`).
2. A product with options asked for one stock or option change while a sale lands: the write re-reads options under `FOR UPDATE` and keeps the sale → Task 7 test.
3. A product filed into a category the same request removes → refused, nothing filed → Task 4 test.
4. Option changes that leave fewer than 2 options → the whole product's option change is refused with the reason, other changes go on → Task 4 test.
5. A catalog write that fails → honest «No pude guardar los cambios del catálogo», no section links rewritten, no revision → Task 8 test.

---

## File Structure

- Create `apps/api/src/storefront-source/source-catalog-edit.ts` — pure: op kinds/schema/reader, stock & discount parsers, `CATALOG_EDIT_PROMPT`, `applyCatalogOps`, `relinkCategories`, `withoutCategoryMenuLinks`.
- Create `apps/api/src/storefront-source/source-catalog-edit.spec.ts`.
- Create `apps/api/src/storefront-source/source-catalog-write.ts` — `writeCatalogChange(tx, storeId, change)`.
- Create `apps/api/src/storefront-source/source-catalog-write.spec.ts`.
- Modify `apps/api/src/storefront-source/source-store-edit.ts` — catalog fields on the state + digest; export text helpers; one prompt line.
- Modify `apps/api/src/storefront-source/source-layout-edit.ts` — `catalogo` in schema/read/prompt.
- Modify `apps/api/src/storefront-source/source-conversation.service.ts` — instructions + editKind wording.
- Modify `apps/api/src/storefront-source/source-chat.service.ts` — read state, apply, write, relink, menu, ask.
- Tests modified: `source-store-edit.spec.ts`, `source-layout-edit.spec.ts`, `source-conversation-point.spec.ts`, `source-chat-store-edit.spec.ts`.

---

### Task 1: Catalog fields in the store digest

**Files:**
- Modify: `apps/api/src/storefront-source/source-store-edit.ts` (types at lines 16–27, helpers at 54–60, `storeDigest` at 86–100)
- Test: `apps/api/src/storefront-source/source-store-edit.spec.ts`

**Interfaces:**
- Produces: `StoreEditProduct` gains optional `stock?: number | null; categoryId?: string | null; currency?: string; variants?: ProductVariant[]`; `StoreEditState` gains optional `archived?: Array<{ id: string; name: string }>; categories?: StoreEditCategory[]; codes?: StoreEditCode[]`; new exported types `StoreEditCategory = { id: string; name: string; count: number }`, `StoreEditCode = { id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number; active: boolean; emails: boolean; assistant: boolean }`; helpers `oneLine, block, safe, short, bs` become exported.

- [ ] **Step 1: Write the failing test** — append to `source-store-edit.spec.ts`:

```ts
describe('catalog in the digest (spec 2026-11-05 part 2)', () => {
  it('shows stock, category and options of each product, the archived ones, the categories and the codes', () => {
    const digest = storeDigest(state({
      products: [{ id: 'p1', name: 'Brownie', amount: 2000, description: '', imageUrls: [], options: false, stock: 5, categoryId: 'c1', currency: 'BOB', variants: [] },
        { id: 'p2', name: 'Polera', amount: 9000, description: '', imageUrls: [], options: true, stock: null, categoryId: null, currency: 'BOB',
          variants: [{ id: 'v1', name: 'S', amount: 9000, stock: 2 }, { id: 'v2', name: 'M', amount: 9500, stock: null }] }],
      archived: [{ id: 'p9', name: 'Torta de limón' }],
      categories: [{ id: 'c1', name: 'Postres', count: 1 }],
      codes: [{ id: 'k1', code: 'VERANO20', type: 'PERCENT', value: 20, active: true, emails: false, assistant: true },
        { id: 'k2', code: 'ENVIO', type: 'FIXED', value: 3000, active: false, emails: false, assistant: false }],
    }), []);
    expect(digest.productos[0]).toMatchObject({ stock: 5, categoria: 'Postres' });
    expect(digest.productos[1]).toMatchObject({ stock: 'sin límite', opciones: [{ nombre: 'S', precio: 'Bs 90', stock: 2 }, { nombre: 'M', precio: 'Bs 95', stock: 'sin límite' }] });
    expect(digest.archivados).toEqual([{ at: 0, nombre: 'Torta de limón' }]);
    expect(digest.categorias).toEqual([{ at: 0, nombre: 'Postres', productos: 1 }]);
    expect(digest.codigos).toEqual([{ at: 0, codigo: 'VERANO20', descuento: '20 %', activo: true, correos: false, asistente: true },
      { at: 1, codigo: 'ENVIO', descuento: 'Bs 30', activo: false, correos: false, asistente: false }]);
  });

  it('leaves the catalog lists out when the store rows could not be read', () => {
    const digest = storeDigest(state(), []);
    expect(digest).not.toHaveProperty('categorias');
    expect(digest).not.toHaveProperty('codigos');
    expect(digest).not.toHaveProperty('archivados');
    expect(digest.productos[0]).not.toHaveProperty('stock');
    expect(digest.productos[1]).toMatchObject({ opciones: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-store-edit.spec.ts`
Expected: FAIL (TS error: `stock` not in `StoreEditProduct` / `archivados` undefined).

- [ ] **Step 3: Implement**

In `source-store-edit.ts`, add after the existing imports:

```ts
import type { ProductVariant } from '../payment-links/product-variants';
```

Replace the `StoreEditProduct` line and extend `StoreEditState` (keep every existing field):

```ts
export type StoreEditProduct = { id: string; name: string; amount: number; description: string; imageUrls: string[]; options: boolean;
  /** YAPI creates anything part 2 (spec 2026-11-05): the catalog fields the chat may change; absent when the rows could not be read. */
  stock?: number | null; categoryId?: string | null; currency?: string; variants?: ProductVariant[] };
export type StoreEditCategory = { id: string; name: string; count: number };
export type StoreEditCode = { id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number; active: boolean; emails: boolean; assistant: boolean };
```

and inside `StoreEditState`, after `products: StoreEditProduct[];`:

```ts
  /** Part 2: archived products (to bring back), the categories in their order and the discount codes, active first. */
  archived?: Array<{ id: string; name: string }>;
  categories?: StoreEditCategory[];
  codes?: StoreEditCode[];
```

Export the helpers (prefix with `export`, bodies unchanged): `export const oneLine = …`, `export const block = …`, `export const safe = …`, `export const short = …`, `export const bs = …`.

In `storeDigest`, replace the `productos:` line with:

```ts
    productos: state.products.slice(0, 40).map((product, at) => ({ at, nombre: product.name, precio: bs(product.amount), descripcion: short(product.description, 160),
      ...(product.stock !== undefined ? { stock: product.stock === null ? 'sin límite' : product.stock } : {}),
      ...(product.categoryId ? { categoria: state.categories?.find(category => category.id === product.categoryId)?.name ?? '' } : {}),
      ...(product.variants?.length ? { opciones: product.variants.map(variant => ({ nombre: variant.name, precio: bs(variant.amount), stock: variant.stock == null ? 'sin límite' : variant.stock })) }
        : product.options ? { opciones: true } : {}) })),
    ...(state.archived?.length ? { archivados: state.archived.slice(0, 20).map((product, at) => ({ at, nombre: product.name })) } : {}),
    ...(state.categories ? { categorias: state.categories.map((category, at) => ({ at, nombre: category.name, productos: category.count })) } : {}),
    ...(state.codes ? { codigos: state.codes.slice(0, 20).map((code, at) => ({ at, codigo: code.code, descuento: code.type === 'PERCENT' ? `${code.value} %` : bs(code.value),
      activo: code.active, correos: code.emails, asistente: code.assistant })) } : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/source-store-edit.spec.ts`
Expected: PASS (all, old tests included).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-store-edit.ts apps/api/src/storefront-source/source-store-edit.spec.ts
git commit -m "feat(yapi): the quick edit sees stock, categories, options, archived products and codes (spec 2026-11-05 creates anything part 2)"
```

---

### Task 2: Catalog ops — kinds, schema, reader, parsers, prompt

**Files:**
- Create: `apps/api/src/storefront-source/source-catalog-edit.ts`
- Create: `apps/api/src/storefront-source/source-catalog-edit.spec.ts`

**Interfaces:**
- Consumes: `priceCents` from `source-store-edit.ts`.
- Produces: `CATALOG_KINDS`, `type CatalogKind`, `type CatalogOp = { kind; at: number; name: string; price: string; stock: string; text: string; category: string; photo: string; option: string; value: string }`, `CATALOG_LIMITS`, `catalogOpSchema()`, `readCatalogOps(raw: unknown): CatalogOp[]`, `stockValue(text): number | null | undefined` (NaN = invalid), `discountValue(text): { type: 'PERCENT' | 'FIXED'; value: number } | null`, `fold(text)`, `CODE_PATTERN`, `CATALOG_EDIT_PROMPT`.

- [ ] **Step 1: Write the failing test** — `source-catalog-edit.spec.ts`:

```ts
import { CATALOG_EDIT_PROMPT, catalogOpSchema, discountValue, readCatalogOps, stockValue } from './source-catalog-edit';

describe('catalog ops (spec 2026-11-05 creates anything part 2)', () => {
  it('reads only known kinds, every field a string', () => {
    expect(readCatalogOps([{ kind: 'product-add', at: -1, name: 'Torta', price: '120' }, { kind: 'product-delete', at: 0 }, null, 'x'])).toEqual([
      { kind: 'product-add', at: -1, name: 'Torta', price: '120', stock: '', text: '', category: '', photo: '', option: '', value: '' }]);
    expect(readCatalogOps({})).toEqual([]);
  });

  it('the schema is strict and requires every field', () => {
    const schema = catalogOpSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['kind', 'at', 'name', 'price', 'stock', 'text', 'category', 'photo', 'option', 'value']);
    expect(schema.properties.kind.enum).toContain('code-show');
  });

  it('reads stock words', () => {
    expect(stockValue('')).toBeUndefined();
    expect(stockValue('5')).toBe(5);
    expect(stockValue('12 unidades')).toBe(12);
    expect(stockValue('sin límite')).toBeNull();
    expect(stockValue('Agotado')).toBe(0);
    expect(stockValue('muchos')).toBeNaN();
  });

  it('reads a discount as a percent (1–99) or a Bs amount, never a bare number', () => {
    expect(discountValue('20 %')).toEqual({ type: 'PERCENT', value: 20 });
    expect(discountValue('15%')).toEqual({ type: 'PERCENT', value: 15 });
    expect(discountValue('Bs 30')).toEqual({ type: 'FIXED', value: 3000 });
    expect(discountValue('100 %')).toBeNull();
    expect(discountValue('20')).toBeNull();
  });

  it('the prompt never lets YAPI invent a price or a discount, and archives on «quita»', () => {
    expect(CATALOG_EDIT_PROMPT).toContain('Nunca inventes un precio');
    expect(CATALOG_EDIT_PROMPT).toContain('Nunca inventes el descuento');
    expect(CATALOG_EDIT_PROMPT).toContain('product-archive (quitar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: FAIL — `Cannot find module './source-catalog-edit'`.

- [ ] **Step 3: Implement** — create `source-catalog-edit.ts`:

```ts
/* YAPI creates anything, part 2 (spec docs/superpowers/specs/2026-11-05-yapi-creates-anything-part-2-design.md): next to the store
 * ops, the template quick edit answers «catalogo» — products made, archived, restored, stocked, filed and given options; categories
 * made, renamed, removed and ordered; discount codes made and switched. This pure module reads those operations, checks them against
 * the store as the digest showed it and turns them into one change the caller writes, plus the words of the reply. */
import { priceCents } from './source-store-edit';

export const CATALOG_KINDS = ['product-add', 'product-archive', 'product-restore', 'product-stock', 'product-category', 'option-add', 'option-remove',
  'option-price', 'option-stock', 'category-add', 'category-rename', 'category-remove', 'category-move', 'code-add', 'code-off', 'code-on', 'code-show'] as const;
export type CatalogKind = typeof CATALOG_KINDS[number];
export type CatalogOp = { kind: CatalogKind; at: number; name: string; price: string; stock: string; text: string; category: string; photo: string; option: string; value: string };
export const CATALOG_LIMITS = { products: 6, categories: 5, codes: 3, categoryName: 60, optionName: 60, shown: 40 } as const;
const FIELDS = ['name', 'price', 'stock', 'text', 'category', 'photo', 'option', 'value'] as const;
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function catalogOpSchema() {
  return { type: 'object', additionalProperties: false, required: ['kind', 'at', ...FIELDS], properties: {
    kind: { type: 'string', enum: [...CATALOG_KINDS] }, at: { type: 'integer' }, ...Object.fromEntries(FIELDS.map(field => [field, { type: 'string' }])) } };
}

/** The model's catalog operations, checked: known kinds only, every field a string. */
export function readCatalogOps(raw: unknown): CatalogOp[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((op): op is Record<string, unknown> => Boolean(op) && typeof op === 'object' && (CATALOG_KINDS as readonly string[]).includes(String((op as { kind?: unknown }).kind)))
    .map(op => ({ kind: op.kind as CatalogKind, at: Number.isInteger(op.at) ? op.at as number : -1,
      ...Object.fromEntries(FIELDS.map(field => [field, String(op[field] ?? '')])) }) as CatalogOp);
}

/** «5» → 5, «sin límite» → null, «agotado» → 0, "" → undefined (not given); NaN when it is not a stock. */
export function stockValue(text: string): number | null | undefined {
  const value = fold(text);
  if (!value) return undefined;
  if (/^(sin limite|ilimitad[oa]s?|unlimited|infinito)$/.test(value)) return null;
  if (/^(agotad[oa]s?|sold out)$/.test(value)) return 0;
  const match = /^(\d{1,7})(?: ?(?:unidades|unidad|u\.?))?$/.exec(value);
  return match && Number(match[1]) <= 1_000_000 ? Number(match[1]) : Number.NaN;
}

/** «20 %», «20%» → percent; «Bs 30» → cents; null when it is neither, or a percent outside 1–99. */
export function discountValue(text: string): { type: 'PERCENT' | 'FIXED'; value: number } | null {
  const value = text.trim();
  const percent = /^(\d{1,3})\s*(?:%|por ?ciento)$/i.exec(value);
  if (percent) { const n = Number(percent[1]); return n >= 1 && n <= 99 ? { type: 'PERCENT', value: n } : null; }
  if (!/\b(?:bs|bob)\b/i.test(value)) return null;
  const cents = priceCents(value);
  return cents ? { type: 'FIXED', value: cents } : null;
}

export const CATALOG_EDIT_PROMPT = `
Catálogo: «tienda» trae también «productos» (con stock, categoria y opciones), «archivados», «categorias» y «codigos» (de descuento).
Los cambios del catálogo van en «catalogo», operaciones { kind, at, name, price, stock, text, category, photo, option, value } (los
que no se usan: at -1, el resto ""):
- product-add: un producto nuevo. name y price (el precio que dijo el comercio, «120»). text = su descripción en 1 o 2 frases con la
  voz de la tienda y SOLO con lo que dijo el comercio (nada de ingredientes, tallas, materiales ni promesas que no dijo). category =
  su categoría (una de «categorias» o una nueva). photo = una foto de «fotos» con de "mensaje" (si no mandó foto, ""). stock = las
  unidades si las dijo («5», «sin límite»). Si tiene opciones («chica Bs 80, grande Bs 120», «tallas S, M y L»), value = una por
  línea «nombre | precio | stock» (precio "" = el del producto; stock "" = sin límite) y price puede ir "". Como mucho 6 por pedido.
  Nunca inventes un precio: si falta, no lo agregues y pregunta con «ask» («¿A cuánto vendes la Torta de chocolate?»).
- product-archive (quitar, borrar, eliminar o sacar un producto: queda archivado) y product-restore (volver a poner uno de
  «archivados»): at = su número en esa lista.
- product-stock: at, stock («5», «sin límite», «agotado»). Un producto con opciones lleva option-stock por opción.
- product-category: at, category = el nombre de la categoría ("" = sin categoría).
- option-add (at, option = el nombre, price, stock), option-remove (at, option), option-price (at, option, price), option-stock
  (at, option, stock): las opciones de un producto de «productos», por su nombre.
- category-add (name), category-rename (at, name = el nombre nuevo), category-remove (at; sus productos quedan sin categoría),
  category-move (at, value = el lugar nuevo, 0 = la primera).
- code-add: name = el código en mayúsculas (VERANO20; si el comercio no lo nombró, uno corto con sus palabras), value = el
  descuento: «20 %» o «Bs 30». Nunca inventes el descuento: si falta, pregunta con «ask». Como mucho 3 por pedido.
- code-off (quitar, borrar, apagar o desactivar un código) y code-on (volver a activarlo): at = su número en «codigos».
- code-show: at, option = correos o asistente, value = si o no (que el código salga en los correos o que el asistente lo ofrezca).
Los números son los que ves. Una categoría se nombra por su nombre, también si se crea en el mismo pedido. El nombre, el precio de
un producto sin opciones, la descripción o la foto de un producto que ya existe se cambian con «store» (part product), no aquí.
Los productos, categorías y códigos nunca van en «rest».`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-catalog-edit.ts apps/api/src/storefront-source/source-catalog-edit.spec.ts
git commit -m "feat(yapi): catalog ops for the quick edit — kinds, schema, stock and discount words, prompt (spec 2026-11-05 creates anything part 2)"
```

---

### Task 3: `applyCatalogOps` — categories and discount codes

**Files:**
- Modify: `apps/api/src/storefront-source/source-catalog-edit.ts`
- Test: `apps/api/src/storefront-source/source-catalog-edit.spec.ts`

**Interfaces:**
- Consumes: Task 1 state types and helpers (`oneLine, safe, short, bs, StoreEditState, StoreEditPhoto`), Task 2 parsers.
- Produces:
  - `type CategoryRef = string` — an existing category id, or `new:<n>` for the n-th category this change creates.
  - `type CatalogChange = { categories: { create: Array<{ ref: string; name: string }>; rename: Array<{ id: string; name: string }>; remove: Array<{ id: string; name: string }>; order?: string[] }; products: { create: CatalogNewProduct[]; update: CatalogProductUpdate[] }; codes: { create: Array<{ code: string; type: 'PERCENT' | 'FIXED'; value: number }>; flags: Array<{ id: string; isActive?: boolean; showInEmails?: boolean; showInAssistant?: boolean }> }; links: { rename: Array<{ from: string; to: string }>; remove: Array<{ id: string; name: string }> } }`
  - `type CatalogNewProduct = { name: string; description: string; amount: number; currency: string; imageUrls: string[]; stock: number | null; variants: ProductVariant[]; categoryRef: CategoryRef | null }`
  - `type CatalogProductUpdate = { id: string; status?: 'ACTIVE' | 'ARCHIVED'; stock?: number | null; categoryRef?: CategoryRef | null; variantOps?: SourceVariantOperation[] }`
  - `emptyCatalogChange(): CatalogChange`, `catalogChangeEmpty(change): boolean`
  - `applyCatalogOps(state: StoreEditState, ops: readonly CatalogOp[], photos?: readonly StoreEditPhoto[], options?: { answering?: boolean }): { change: CatalogChange; done: string[]; refused: string[]; notes: string[] }`

- [ ] **Step 1: Write the failing tests** — append to `source-catalog-edit.spec.ts` (and extend the import line to `import { CATALOG_EDIT_PROMPT, applyCatalogOps, catalogChangeEmpty, catalogOpSchema, discountValue, readCatalogOps, stockValue, type CatalogOp } from './source-catalog-edit';` plus `import type { StoreEditState } from './source-store-edit';`):

```ts
const state = (over: Partial<StoreEditState> = {}): StoreEditState => ({ tagline: '', aboutText: '', contactPhone: '', contactEmail: '', policies: {}, faq: [],
  announcement: '', footer: '', links: [], popup: { on: false, title: '', text: '', button: '', discount: 0 }, catalogTitle: null,
  products: [
    { id: 'p1', name: 'Torta de chocolate', amount: 12000, description: '', imageUrls: [], options: false, stock: null, categoryId: 'c1', currency: 'BOB', variants: [] },
    { id: 'p2', name: 'Polera', amount: 9000, description: '', imageUrls: [], options: true, stock: 3, categoryId: null, currency: 'BOB',
      variants: [{ id: 'v1', name: 'S', amount: 9000, stock: 1 }, { id: 'v2', name: 'M', amount: 9500, stock: 2 }] }],
  archived: [{ id: 'p9', name: 'Torta de limón' }],
  categories: [{ id: 'c1', name: 'Tortas', count: 1 }, { id: 'c2', name: 'Postres', count: 0 }],
  codes: [{ id: 'k1', code: 'VERANO20', type: 'PERCENT', value: 20, active: true, emails: false, assistant: false },
    { id: 'k2', code: 'NAVIDAD', type: 'PERCENT', value: 10, active: false, emails: false, assistant: false }],
  ...over });
const op = (kind: CatalogOp['kind'], fields: Partial<CatalogOp> = {}): CatalogOp => ({ kind, at: -1, name: '', price: '', stock: '', text: '', category: '', photo: '', option: '', value: '', ...fields });

describe('categories', () => {
  it('creates a category once, reusing a name the store has (accents and capitals aside)', () => {
    const { change, done } = applyCatalogOps(state(), [op('category-add', { name: 'Bebidas' }), op('category-add', { name: 'bebidas' }), op('category-add', { name: 'TORTAS' })]);
    expect(change.categories.create).toEqual([{ ref: 'new:0', name: 'Bebidas' }]);
    expect(done).toEqual(['creé la categoría «Bebidas»']);
  });

  it('renames, moves and removes, and the section links follow', () => {
    const { change, done } = applyCatalogOps(state(), [op('category-rename', { at: 0, name: 'Pasteles' }), op('category-move', { at: 1, value: '0' }), op('category-remove', { at: 1 })]);
    expect(change.categories.rename).toEqual([{ id: 'c1', name: 'Pasteles' }]);
    expect(change.categories.order).toEqual(['c2', 'c1']);
    expect(change.categories.remove).toEqual([{ id: 'c2', name: 'Postres' }]);
    expect(change.links).toEqual({ rename: [{ from: 'Tortas', to: 'Pasteles' }], remove: [{ id: 'c2', name: 'Postres' }] });
    expect(done).toEqual(['la categoría «Tortas» ahora se llama «Pasteles»', '«Postres» va primera en las categorías', 'quité la categoría «Postres»']);
  });

  it('refuses a rename onto another category\'s name, and the sixth new category', () => {
    const many = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'].map(name => op('category-add', { name }));
    const { change, refused } = applyCatalogOps(state(), [op('category-rename', { at: 0, name: 'postres' }), ...many]);
    expect(change.categories.rename).toEqual([]);
    expect(change.categories.create).toHaveLength(5);
    expect(refused).toEqual(['Ya tienes una categoría «postres».', 'No creé la categoría «F6»: como mucho 5 categorías nuevas por pedido.']);
  });

  it('a number that is not on the list does nothing', () => {
    expect(catalogChangeEmpty(applyCatalogOps(state(), [op('category-remove', { at: 7 }), op('category-rename', { at: -1, name: 'X' })]).change)).toBe(true);
  });
});

describe('discount codes', () => {
  it('creates private codes with the merchant\'s discount, upper-cased and without spaces', () => {
    const { change, done } = applyCatalogOps(state(), [op('code-add', { name: 'novia10', value: '10 %' }), op('code-add', { name: '', value: 'Bs 30' }), op('code-add', { name: 'verano 15', value: '15 %' })]);
    expect(change.codes.create).toEqual([{ code: 'NOVIA10', type: 'PERCENT', value: 10 }, { code: 'DESCUENTO30', type: 'FIXED', value: 3000 }, { code: 'VERANO15', type: 'PERCENT', value: 15 }]);
    expect(done).toEqual(['el código NOVIA10 da 10 % de descuento y ya funciona en el pago', 'el código DESCUENTO30 da Bs 30 de descuento y ya funciona en el pago',
      'el código VERANO15 da 15 % de descuento y ya funciona en el pago']);
  });

  it('never invents a discount, and refuses a code it cannot save', () => {
    const { change, refused } = applyCatalogOps(state(), [op('code-add', { name: 'GRATIS', value: '' }), op('code-add', { name: 'MITAD', value: '120 %' }), op('code-add', { name: 'año10', value: '10 %' })]);
    expect(change.codes.create).toEqual([]);
    expect(refused).toEqual(['No creé el código GRATIS: dime el descuento, por ejemplo «20 %» o «Bs 30».', 'No creé el código MITAD: dime el descuento, por ejemplo «20 %» o «Bs 30».',
      'No creé el código «año10»: usa de 3 a 32 letras, números, guion o guion bajo.']);
  });

  it('a taken code is refused, an off one with the same discount comes back on', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('code-add', { name: 'VERANO20', value: '20 %' }), op('code-add', { name: 'NAVIDAD', value: '10 %' })]);
    expect(change.codes.create).toEqual([]);
    expect(change.codes.flags).toEqual([{ id: 'k2', isActive: true }]);
    expect(refused).toEqual(['El código VERANO20 ya existe con 20 % de descuento: elige otro nombre.']);
    expect(done).toEqual(['volví a activar el código NAVIDAD (10 % de descuento)']);
  });

  it('turns codes off and on and shows them in the assistant', () => {
    const { change, done } = applyCatalogOps(state(), [op('code-off', { at: 0 }), op('code-on', { at: 1 }), op('code-show', { at: 1, option: 'asistente', value: 'sí' }), op('code-off', { at: 6 })]);
    expect(change.codes.flags).toEqual([{ id: 'k1', isActive: false }, { id: 'k2', isActive: true }, { id: 'k2', showInAssistant: true }]);
    expect(done).toEqual(['apagué el código VERANO20: ya no da descuento', 'volví a activar el código NAVIDAD', 'el asistente ahora ofrece el código NAVIDAD']);
  });

  it('the fourth new code is refused', () => {
    const { change, refused } = applyCatalogOps(state(), ['AAA1', 'BBB2', 'CCC3', 'DDD4'].map(name => op('code-add', { name, value: '5 %' })));
    expect(change.codes.create).toHaveLength(3);
    expect(refused).toEqual(['No creé el código DDD4: como mucho 3 códigos nuevos por pedido.']);
  });

  it('answering YAPI\'s question, a code the first request already made is skipped quietly', () => {
    expect(applyCatalogOps(state(), [op('code-add', { name: 'VERANO20', value: '20 %' })], [], { answering: true }).refused).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: FAIL — `applyCatalogOps` is not exported.

- [ ] **Step 3: Implement** — in `source-catalog-edit.ts` replace the import line with:

```ts
import type { ProductVariant } from '../payment-links/product-variants';
import type { SourceVariantOperation } from './source-product-options';
import { bs, oneLine, priceCents, safe, short, type StoreEditPhoto, type StoreEditState } from './source-store-edit';
```

and append:

```ts
/** An existing category id, or `new:<n>` for the n-th category this change creates. */
export type CategoryRef = string;
export type CatalogNewProduct = { name: string; description: string; amount: number; currency: string; imageUrls: string[]; stock: number | null; variants: ProductVariant[]; categoryRef: CategoryRef | null };
export type CatalogProductUpdate = { id: string; status?: 'ACTIVE' | 'ARCHIVED'; stock?: number | null; categoryRef?: CategoryRef | null; variantOps?: SourceVariantOperation[] };
export type CatalogChange = {
  categories: { create: Array<{ ref: string; name: string }>; rename: Array<{ id: string; name: string }>; remove: Array<{ id: string; name: string }>; order?: string[] };
  products: { create: CatalogNewProduct[]; update: CatalogProductUpdate[] };
  codes: { create: Array<{ code: string; type: 'PERCENT' | 'FIXED'; value: number }>; flags: Array<{ id: string; isActive?: boolean; showInEmails?: boolean; showInAssistant?: boolean }> };
  /** Section links to follow after the write: `category:<name>` renamed or removed; removed ids also leave the menu. */
  links: { rename: Array<{ from: string; to: string }>; remove: Array<{ id: string; name: string }> };
};
export const emptyCatalogChange = (): CatalogChange => ({ categories: { create: [], rename: [], remove: [] }, products: { create: [], update: [] },
  codes: { create: [], flags: [] }, links: { rename: [], remove: [] } });
export const catalogChangeEmpty = (change: CatalogChange) => !change.categories.create.length && !change.categories.rename.length && !change.categories.remove.length
  && !change.categories.order && !change.products.create.length && !change.products.update.length && !change.codes.create.length && !change.codes.flags.length;

const discountText = (code: { type: 'PERCENT' | 'FIXED'; value: number }) => code.type === 'PERCENT' ? `${code.value} %` : bs(code.value);

/** The catalog operations applied to the store as the digest showed it. Every refusal says why; `answering` (the merchant answers a
 *  question YAPI asked, so the first request comes again) skips what that request already made without a word. */
export function applyCatalogOps(state: StoreEditState, ops: readonly CatalogOp[], photos: readonly StoreEditPhoto[] = [], options: { answering?: boolean } = {}):
  { change: CatalogChange; done: string[]; refused: string[]; notes: string[] } {
  const change = emptyCatalogChange();
  const done: string[] = [], refused: string[] = [], notes: string[] = [];
  const categories = state.categories ?? [];
  const codes = state.codes ?? [];
  const removed = new Set<string>();
  // Names to refs: the store's own categories, then the ones this request makes.
  const named = new Map<string, CategoryRef>(categories.map(category => [fold(category.name), category.id]));
  const categoryName = (ref: CategoryRef) => categories.find(category => category.id === ref)?.name ?? change.categories.create.find(category => category.ref === ref)?.name ?? '';
  /** A category by name: the store's, one made earlier in this request, or made now (counted against the limit); null when refused. */
  const categoryFor = (raw: string): CategoryRef | null => {
    const name = oneLine(raw, CATALOG_LIMITS.categoryName);
    if (!name || !safe(name)) { refused.push(`No usé la categoría «${short(raw, 40)}»: escribe su nombre con letras y números.`); return null; }
    const known = named.get(fold(name));
    if (known) {
      if (removed.has(known)) { refused.push(`La categoría «${name}» se quita en este mismo pedido.`); return null; }
      return known;
    }
    if (change.categories.create.length >= CATALOG_LIMITS.categories) { refused.push(`No creé la categoría «${name}»: como mucho ${CATALOG_LIMITS.categories} categorías nuevas por pedido.`); return null; }
    const ref = `new:${change.categories.create.length}`;
    change.categories.create.push({ ref, name });
    named.set(fold(name), ref);
    done.push(`creé la categoría «${name}»`);
    return ref;
  };
  let order: string[] | undefined;
  const codesSeen = new Set(codes.map(code => code.code));

  for (const op of ops) {
    switch (op.kind) {
      case 'category-add': { categoryFor(op.name); break; }
      case 'category-rename': {
        const category = categories[op.at];
        if (!category) break;
        const name = oneLine(op.name, CATALOG_LIMITS.categoryName);
        if (!name || !safe(name) || name === category.name) break;
        const other = named.get(fold(name));
        if (other && other !== category.id) { refused.push(`Ya tienes una categoría «${name}».`); break; }
        named.delete(fold(category.name)); named.set(fold(name), category.id);
        change.categories.rename.push({ id: category.id, name });
        change.links.rename.push({ from: category.name, to: name });
        done.push(`la categoría «${category.name}» ahora se llama «${name}»`);
        break;
      }
      case 'category-remove': {
        const category = categories[op.at];
        if (!category || removed.has(category.id)) break;
        removed.add(category.id);
        change.categories.remove.push({ id: category.id, name: category.name });
        change.links.remove.push({ id: category.id, name: category.name });
        done.push(`quité la categoría «${category.name}»${category.count ? ` (sus ${category.count} productos quedan sin categoría)` : ''}`);
        break;
      }
      case 'category-move': {
        const category = categories[op.at];
        const to = Number.parseInt(op.value, 10);
        if (!category || !Number.isInteger(to)) break;
        order ??= categories.map(item => item.id);
        const from = order.indexOf(category.id);
        const place = Math.max(0, Math.min(order.length - 1, to));
        if (from === place) break;
        order.splice(from, 1); order.splice(place, 0, category.id);
        done.push(`«${category.name}» va ${place === 0 ? 'primera' : `en el lugar ${place + 1}`} en las categorías`);
        break;
      }
      case 'code-add': {
        const discount = discountValue(op.value);
        const typed = op.name.trim().toUpperCase().replace(/\s+/g, '');
        if (!discount) { refused.push(`No creé el código${typed ? ` ${short(typed, 32)}` : ''}: dime el descuento, por ejemplo «20 %» o «Bs 30».`); break; }
        let code = typed;
        if (!code) {
          const base = `DESCUENTO${discount.type === 'PERCENT' ? discount.value : Math.round(discount.value / 100)}`;
          code = base;
          for (let n = 2; codesSeen.has(code) && n < 10; n++) code = `${base}-${n}`;
        }
        if (!CODE_PATTERN.test(code)) { refused.push(`No creé el código «${short(op.name.trim(), 32)}»: usa de 3 a 32 letras, números, guion o guion bajo.`); break; }
        const existing = codes.find(item => item.code === code);
        const same = existing && existing.type === discount.type && existing.value === discount.value;
        if (existing) {
          if (same && !existing.active) { change.codes.flags.push({ id: existing.id, isActive: true }); done.push(`volví a activar el código ${code} (${discountText(discount)} de descuento)`); }
          else if (!(same && options.answering)) refused.push(`El código ${code} ya existe${existing.active ? '' : ' (apagado)'} con ${discountText(existing)} de descuento: elige otro nombre.`);
          break;
        }
        if (codesSeen.has(code)) break;
        if (change.codes.create.length >= CATALOG_LIMITS.codes) { refused.push(`No creé el código ${code}: como mucho ${CATALOG_LIMITS.codes} códigos nuevos por pedido.`); break; }
        codesSeen.add(code);
        change.codes.create.push({ code, ...discount });
        done.push(`el código ${code} da ${discountText(discount)} de descuento y ya funciona en el pago`);
        break;
      }
      case 'code-off': case 'code-on': {
        const code = codes[op.at];
        const on = op.kind === 'code-on';
        if (!code || code.active === on) break;
        change.codes.flags.push({ id: code.id, isActive: on });
        done.push(on ? `volví a activar el código ${code.code}` : `apagué el código ${code.code}: ya no da descuento`);
        break;
      }
      case 'code-show': {
        const code = codes[op.at];
        const where = fold(op.option);
        const yes = /^(si|yes|true)$/.test(fold(op.value));
        if (!code || (where !== 'correos' && where !== 'asistente')) break;
        if ((where === 'correos' ? code.emails : code.assistant) === yes) break;
        change.codes.flags.push(where === 'correos' ? { id: code.id, showInEmails: yes } : { id: code.id, showInAssistant: yes });
        done.push(where === 'correos' ? `el código ${code.code} ${yes ? 'ahora puede salir' : 'ya no sale'} en los correos` : `el asistente ${yes ? 'ahora ofrece' : 'ya no ofrece'} el código ${code.code}`);
        break;
      }
      default: break; // products and options: Task 4
    }
  }
  if (order) change.categories.order = order;
  void photos; void categoryName; void notes;
  return { change, done, refused, notes };
}
```

(The `void` line keeps tsc quiet until Task 4 uses those names; Task 4 deletes it.)

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-catalog-edit.ts apps/api/src/storefront-source/source-catalog-edit.spec.ts
git commit -m "feat(yapi): categories and discount codes from the quick edit — checked ops (spec 2026-11-05 creates anything part 2)"
```

---

### Task 4: `applyCatalogOps` — products and options

**Files:**
- Modify: `apps/api/src/storefront-source/source-catalog-edit.ts`
- Test: `apps/api/src/storefront-source/source-catalog-edit.spec.ts`

**Interfaces:**
- Consumes: `normalizeProductVariants`, `totalVariantStock` (`../payment-links/product-variants`); `applyVariantOperations` (`./source-product-options`); `STORE_CAPS`, `block`, `photoRef` (`./source-store-edit`).
- Produces: the product/option cases of `applyCatalogOps` (same signature as Task 3).

- [ ] **Step 1: Write the failing tests** — append to `source-catalog-edit.spec.ts`:

```ts
describe('products', () => {
  const photos = [{ url: '/v1/uploads/torta.jpg', from: 'mensaje' as const }];

  it('creates a product in a category made in the same request, with its options, and asks for the photo it was not sent', () => {
    const { change, done, notes } = applyCatalogOps(state(), [op('category-add', { name: 'Bebidas' }),
      op('product-add', { name: 'Limonada', text: 'Limonada de la casa.', category: 'bebidas', value: 'Chica | 15 |\nGrande | 25 | 4' })]);
    expect(change.products.create).toEqual([{ name: 'Limonada', description: 'Limonada de la casa.', amount: 1500, currency: 'BOB', imageUrls: [], stock: null, categoryRef: 'new:0',
      variants: [expect.objectContaining({ name: 'Chica', amount: 1500, stock: null }), expect.objectContaining({ name: 'Grande', amount: 2500, stock: 4 })] }]);
    expect(done).toEqual(['creé la categoría «Bebidas»', 'creé «Limonada» en Bebidas, con 2 opciones (Chica Bs 15, Grande Bs 25)']);
    expect(notes).toEqual(['Mándame la foto de «Limonada» cuando la tengas.']);
  });

  it('a single-price product takes its stock and the photo of the message', () => {
    const { change, notes } = applyCatalogOps(state(), [op('product-add', { name: 'Brownie', price: '25', stock: '10', photo: 'f0', category: 'Tortas' })], photos);
    expect(change.products.create[0]).toMatchObject({ name: 'Brownie', amount: 2500, stock: 10, imageUrls: ['/v1/uploads/torta.jpg'], variants: [], categoryRef: 'c1' });
    expect(notes).toEqual([]);
  });

  it('never creates a product without a price, twice, with one option, or past six', () => {
    const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(name => op('product-add', { name: `Galleta ${name}`, price: '5' }));
    const { change, refused } = applyCatalogOps(state(), [op('product-add', { name: 'Flan' }), op('product-add', { name: 'torta de chocolate', price: '90' }),
      op('product-add', { name: 'Queque', price: 'barato' }), op('product-add', { name: 'Combo', value: 'Solo | 30 |' }), ...seven]);
    expect(change.products.create.map(product => product.name)).toEqual(['Galleta A', 'Galleta B', 'Galleta C', 'Galleta D', 'Galleta E', 'Galleta F']);
    expect(refused).toEqual(['No creé «Flan»: dime su precio.', 'Ya tienes «torta de chocolate» en la tienda.', 'No creé «Queque»: «barato» no es un precio.',
      expect.stringMatching(/^No creé «Combo»: Agrega por lo menos 2 opciones/), 'No creé «Galleta G»: como mucho 6 productos nuevos por pedido.']);
  });

  it('answering YAPI\'s question, a product the first request already made is skipped quietly', () => {
    const { change, refused } = applyCatalogOps(state(), [op('product-add', { name: 'Torta de chocolate', price: '120' }), op('product-add', { name: 'Flan', price: '40' })], [], { answering: true });
    expect(change.products.create.map(product => product.name)).toEqual(['Flan']);
    expect(refused).toEqual([]);
  });

  it('archives, restores and files a product', () => {
    const { change, done } = applyCatalogOps(state(), [op('product-archive', { at: 0 }), op('product-restore', { at: 0 }), op('product-category', { at: 1, category: 'Postres' }),
      op('product-category', { at: 0, category: 'tortas' })]);
    expect(change.products.update).toEqual([{ id: 'p1', status: 'ARCHIVED' }, { id: 'p9', status: 'ACTIVE' }, { id: 'p2', categoryRef: 'c2' }]);
    expect(done).toEqual(['archivé «Torta de chocolate»: ya no aparece en la tienda y puedes volver a activarlo en Productos', '«Torta de limón» vuelve a estar en la tienda', '«Polera» está en Postres']);
  });

  it('stock: a number, «sin límite» or «agotado»; a product with options is asked per option', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('product-stock', { at: 0, stock: 'agotado' }), op('product-stock', { at: 1, stock: '5' })]);
    expect(change.products.update).toEqual([{ id: 'p1', stock: 0 }]);
    expect(done).toEqual(['«Torta de chocolate» está agotado']);
    expect(refused).toEqual(['«Polera» tiene opciones: dime el stock de cada opción.']);
  });

  it('options: add, price, stock and remove by name, checked together', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('option-add', { at: 1, option: 'L', price: '100', stock: '3' }), op('option-price', { at: 1, option: 's', price: '85' }),
      op('option-stock', { at: 1, option: 'M', stock: 'sin límite' }), op('option-remove', { at: 1, option: 'S' }), op('option-price', { at: 0, option: 'Grande', price: '150' })]);
    expect(change.products.update).toEqual([{ id: 'p2', variantOps: [{ action: 'add', changes: { name: 'L', amount: 10000, stock: 3 } }, { action: 'update', variantId: 'v1', changes: { amount: 8500 } },
      { action: 'update', variantId: 'v2', changes: { stock: null } }, { action: 'delete', variantId: 'v1' }] }]);
    expect(done).toEqual(['«Polera» tiene la opción «L» a Bs 100', '«S» de «Polera» ahora cuesta Bs 85', '«M» de «Polera» ya no tiene límite de stock', 'quité la opción «S» de «Polera»']);
    expect(refused).toEqual(['«Torta de chocolate» no tiene opciones.']);
  });

  it('option changes that would leave fewer than two are refused as a whole', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('option-remove', { at: 1, option: 'S' })]);
    expect(change.products.update).toEqual([]);
    expect(done).toEqual([]);
    expect(refused[0]).toMatch(/^No cambié las opciones de «Polera»: /);
  });

  it('never files a product into a category this request removes', () => {
    const { change, refused } = applyCatalogOps(state(), [op('category-remove', { at: 1 }), op('product-category', { at: 0, category: 'Postres' })]);
    expect(change.products.update).toEqual([]);
    expect(refused).toEqual(['La categoría «Postres» se quita en este mismo pedido.']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: FAIL — product tests (nothing created).

- [ ] **Step 3: Implement** — in `source-catalog-edit.ts`:

Replace the three import lines with:

```ts
import { normalizeProductVariants, totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import { applyVariantOperations, type SourceVariantOperation } from './source-product-options';
import { STORE_CAPS, block, bs, oneLine, photoRef, priceCents, safe, short, type StoreEditPhoto, type StoreEditProduct, type StoreEditState } from './source-store-edit';
```

Add above `applyCatalogOps`:

```ts
/** «Chica | 15 | 5» lines → a new product's options (at least two, as Productos asks), or why not. */
function optionsFrom(lines: readonly string[], price: number | null): ProductVariant[] | string {
  if (!lines.length) return [];
  const asked: Array<{ name: string; amount: number; stock: number | null }> = [];
  for (const line of lines) {
    const [rawName = '', rawPrice = '', rawStock = ''] = line.split('|').map(part => part.trim());
    const name = oneLine(rawName, CATALOG_LIMITS.optionName);
    if (!name || !safe(name)) return `la opción «${short(rawName, 30)}» no tiene nombre.`;
    const amount = rawPrice ? priceCents(rawPrice) : price;
    if (amount === null) return `dime el precio de la opción «${name}».`;
    const stock = stockValue(rawStock);
    if (Number.isNaN(stock)) return `«${short(rawStock, 20)}» no es un stock.`;
    asked.push({ name, amount, stock: stock ?? null });
  }
  try { return normalizeProductVariants(asked as never); } catch (error) { return `${String((error as Error).message).replace(/\.$/, '')}.`; }
}
const currencyOf = (state: StoreEditState) => state.products.find(product => product.currency)?.currency ?? 'BOB';
const listNames = (names: readonly string[]) => names.length > 1 ? `${names.slice(0, -1).map(name => `«${name}»`).join(', ')} y «${names.at(-1)}»` : `«${names[0]}»`;
```

Inside `applyCatalogOps`, after `const removed = new Set<string>();` add:

```ts
  const shown = state.products.slice(0, CATALOG_LIMITS.shown);
  const archived = state.archived ?? [];
  const productUpdate = (id: string) => { let entry = change.products.update.find(item => item.id === id); if (!entry) { entry = { id }; change.products.update.push(entry); } return entry; };
  const optionDone = new Map<string, string[]>();
  const noPhoto: string[] = [];
```

Replace `default: break; // products and options: Task 4` with:

```ts
      case 'product-add': {
        const name = oneLine(op.name, STORE_CAPS.productName);
        if (!name || !safe(name)) break;
        if (shown.some(item => fold(item.name) === fold(name)) || change.products.create.some(item => fold(item.name) === fold(name))) {
          if (!options.answering) refused.push(`Ya tienes «${short(name, 40)}» en la tienda.`);
          break;
        }
        if (change.products.create.length >= CATALOG_LIMITS.products) { refused.push(`No creé «${short(name, 40)}»: como mucho ${CATALOG_LIMITS.products} productos nuevos por pedido.`); break; }
        const price = op.price.trim() ? priceCents(op.price) : null;
        if (op.price.trim() && price === null) { refused.push(`No creé «${short(name, 40)}»: «${short(op.price, 20)}» no es un precio.`); break; }
        const variants = optionsFrom(op.value.split('\n').map(line => line.trim()).filter(Boolean), price);
        if (typeof variants === 'string') { refused.push(`No creé «${short(name, 40)}»: ${variants}`); break; }
        if (!variants.length && price === null) { refused.push(`No creé «${short(name, 40)}»: dime su precio.`); break; }
        const stock = stockValue(op.stock);
        if (Number.isNaN(stock)) { refused.push(`No creé «${short(name, 40)}»: «${short(op.stock, 20)}» no es un número de unidades.`); break; }
        const categoryRef = op.category.trim() ? categoryFor(op.category) : null;
        if (op.category.trim() && categoryRef === null) break;
        const description = block(op.text, STORE_CAPS.productDescription);
        const photo = op.photo.trim() ? photoRef(op.photo, photos) : undefined;
        const amount = variants.length ? Math.min(...variants.map(variant => variant.amount)) : price!;
        change.products.create.push({ name, description: description && safe(description) ? description : '', amount, currency: currencyOf(state),
          imageUrls: photo ? [photo] : [], stock: variants.length ? totalVariantStock(variants) : stock ?? null, variants, categoryRef });
        done.push(`creé «${name}»${categoryRef ? ` en ${categoryName(categoryRef)}` : ''}${variants.length
          ? `, con ${variants.length} opciones (${variants.map(variant => `${variant.name} ${bs(variant.amount)}`).join(', ')})` : ` a ${bs(amount)}`}`);
        if (!photo) noPhoto.push(name);
        break;
      }
      case 'product-archive': {
        const item = shown[op.at];
        if (!item) break;
        const entry = productUpdate(item.id);
        if (entry.status === 'ARCHIVED') break;
        entry.status = 'ARCHIVED';
        done.push(`archivé «${short(item.name, 40)}»: ya no aparece en la tienda y puedes volver a activarlo en Productos`);
        break;
      }
      case 'product-restore': {
        const item = archived[op.at];
        if (!item) break;
        productUpdate(item.id).status = 'ACTIVE';
        done.push(`«${short(item.name, 40)}» vuelve a estar en la tienda`);
        break;
      }
      case 'product-stock': {
        const item = shown[op.at];
        if (!item) break;
        if (item.options) { refused.push(`«${short(item.name, 40)}» tiene opciones: dime el stock de cada opción.`); break; }
        const stock = stockValue(op.stock);
        if (stock === undefined) break;
        if (Number.isNaN(stock)) { refused.push(`No cambié el stock de «${short(item.name, 40)}»: «${short(op.stock, 20)}» no es un número de unidades.`); break; }
        if (stock === item.stock) break;
        productUpdate(item.id).stock = stock;
        done.push(stock === null ? `«${short(item.name, 40)}» ya no tiene límite de stock` : stock === 0 ? `«${short(item.name, 40)}» está agotado` : `quedan ${stock} de «${short(item.name, 40)}»`);
        break;
      }
      case 'product-category': {
        const item = shown[op.at];
        if (!item) break;
        const ref = op.category.trim() ? categoryFor(op.category) : null;
        if (op.category.trim() && ref === null) break;
        if (ref === (item.categoryId ?? null)) break;
        productUpdate(item.id).categoryRef = ref;
        done.push(ref ? `«${short(item.name, 40)}» está en ${categoryName(ref)}` : `«${short(item.name, 40)}» ya no tiene categoría`);
        break;
      }
      case 'option-add': case 'option-remove': case 'option-price': case 'option-stock': {
        const item: StoreEditProduct | undefined = shown[op.at];
        if (!item) break;
        const label = short(item.name, 40);
        const name = oneLine(op.option, CATALOG_LIMITS.optionName);
        if (!name || !safe(name)) break;
        if (item.options && !item.variants) { refused.push(`No pude leer las opciones de «${label}»: cámbialas en Productos.`); break; }
        const variants = item.variants ?? [];
        const target = variants.find(variant => fold(variant.name) === fold(name));
        let next: SourceVariantOperation;
        let line: string;
        if (op.kind === 'option-add') {
          if (target) { refused.push(`«${label}» ya tiene la opción «${target.name}».`); break; }
          const amount = op.price.trim() ? priceCents(op.price) : item.amount;
          if (amount === null) { refused.push(`No agregué «${name}» a «${label}»: «${short(op.price, 20)}» no es un precio.`); break; }
          const stock = stockValue(op.stock);
          if (Number.isNaN(stock)) { refused.push(`No agregué «${name}» a «${label}»: «${short(op.stock, 20)}» no es un stock.`); break; }
          next = { action: 'add', changes: { name, amount, stock: stock ?? null } as never };
          line = `«${label}» tiene la opción «${name}» a ${bs(amount)}`;
        } else if (!target) {
          refused.push(variants.length ? `«${label}» no tiene la opción «${name}».` : `«${label}» no tiene opciones.`);
          break;
        } else if (op.kind === 'option-remove') {
          next = { action: 'delete', variantId: target.id };
          line = `quité la opción «${target.name}» de «${label}»`;
        } else if (op.kind === 'option-price') {
          const amount = priceCents(op.price);
          if (amount === null) { refused.push(`No cambié el precio de «${target.name}»: «${short(op.price, 20)}» no es un precio.`); break; }
          if (amount === target.amount) break;
          next = { action: 'update', variantId: target.id, changes: { amount } as never };
          line = `«${target.name}» de «${label}» ahora cuesta ${bs(amount)}`;
        } else {
          const stock = stockValue(op.stock);
          if (stock === undefined) break;
          if (Number.isNaN(stock)) { refused.push(`No cambié el stock de «${target.name}»: «${short(op.stock, 20)}» no es un número de unidades.`); break; }
          if (stock === (target.stock ?? null)) break;
          next = { action: 'update', variantId: target.id, changes: { stock } as never };
          line = stock === null ? `«${target.name}» de «${label}» ya no tiene límite de stock` : `quedan ${stock} de «${target.name}» en «${label}»`;
        }
        const entry = productUpdate(item.id);
        entry.variantOps = [...(entry.variantOps ?? []), next];
        optionDone.set(item.id, [...(optionDone.get(item.id) ?? []), line]);
        break;
      }
```

Replace `void photos; void categoryName; void notes;` with:

```ts
  // A product's option changes are checked together (Productos asks for at least two options, unique names).
  for (const entry of change.products.update) {
    if (!entry.variantOps?.length) continue;
    const item = shown.find(product => product.id === entry.id)!;
    try { applyVariantOperations(item.variants ?? [], entry.variantOps); done.push(...(optionDone.get(entry.id) ?? [])); }
    catch (error) { delete entry.variantOps; refused.push(`No cambié las opciones de «${short(item.name, 40)}»: ${String((error as Error).message)}`); }
  }
  change.products.update = change.products.update.filter(entry => Object.keys(entry).length > 1);
  if (noPhoto.length) notes.push(`Mándame la foto de ${listNames(noPhoto)} cuando la tengas.`);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-catalog-edit.ts apps/api/src/storefront-source/source-catalog-edit.spec.ts
git commit -m "feat(yapi): products from the quick edit — create with options, archive, restore, stock, category, option edits (spec 2026-11-05 creates anything part 2)"
```

---

### Task 5: Category links follow a rename or removal (sections + menu)

**Files:**
- Modify: `apps/api/src/storefront-source/source-catalog-edit.ts`
- Test: `apps/api/src/storefront-source/source-catalog-edit.spec.ts`

**Interfaces:**
- Consumes: `LayoutBlock` (`./source-section-library`), `StoreMenu` (`./source-store-menu`), `CatalogChange['links']`.
- Produces: `relinkCategories(blocks: readonly LayoutBlock[], links: CatalogChange['links']): LayoutBlock[]` (returns the same array when there is nothing to do); `withoutCategoryMenuLinks(menu: StoreMenu | undefined, ids: readonly string[]): StoreMenu | undefined` (same object when nothing to do).

- [ ] **Step 1: Write the failing tests** — append (and add `relinkCategories, withoutCategoryMenuLinks` to the import, plus `import type { LayoutBlock } from './source-section-library'; import type { StoreMenu } from './source-store-menu';`):

```ts
describe('category links', () => {
  const blocks: LayoutBlock[] = [{ type: 'cover-split', title: 'Hola', cta: 'Ver tortas', link: 'category:Tortas' },
    { type: 'categories-tiles', items: [{ title: 'Tortas', link: 'category:Tortas' }, { title: 'Postres', link: 'category:Postres' }, { title: 'Bebidas', link: 'category:Bebidas' }] },
    { type: 'products-cards', cta2: 'Ver todo', link2: 'category:postres' }];

  it('a rename follows into links and tiles; a removal sends links to all products and drops its tile', () => {
    const next = relinkCategories(blocks, { rename: [{ from: 'Tortas', to: 'Pasteles' }], remove: [{ id: 'c2', name: 'Postres' }] });
    expect(next[0].link).toBe('category:Pasteles');
    expect(next[1].items).toEqual([{ title: 'Pasteles', link: 'category:Pasteles' }, { title: 'Bebidas', link: 'category:Bebidas' }]);
    expect(next[2].link2).toBe('products');
    expect(blocks[0].link).toBe('category:Tortas');
  });

  it('nothing to follow leaves the blocks as they are', () => {
    expect(relinkCategories(blocks, { rename: [], remove: [] })).toBe(blocks);
  });

  it('a removed category leaves the menu; a dropdown left empty goes', () => {
    const menu: StoreMenu = { style: 'dropdowns', groups: [
      { label: 'Tienda', links: [{ to: 'category:c2' }, { to: 'all' }], tiles: [{ title: 'Postres', image: 'https://x.test/p.jpg', to: 'category:c2' }] },
      { label: 'Postres', links: [{ to: 'category:c2' }] }] };
    expect(withoutCategoryMenuLinks(menu, ['c2'])).toEqual({ style: 'dropdowns', groups: [{ label: 'Tienda', links: [{ to: 'all' }], tiles: [] }] });
    expect(withoutCategoryMenuLinks(menu, [])).toBe(menu);
    expect(withoutCategoryMenuLinks(undefined, ['c2'])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: FAIL — `relinkCategories` is not exported.

- [ ] **Step 3: Implement** — add the type imports at the top of `source-catalog-edit.ts`:

```ts
import type { LayoutBlock } from './source-section-library';
import type { StoreMenu } from './source-store-menu';
```

and append:

```ts
const CATEGORY_LISTS = new Set(['categories-list', 'categories-tiles']);

/** Section links to a renamed or removed category (`category:<name>`) and its tiles in the category lists follow the change: a
 *  rename keeps pointing at it, a removal points at all the products and drops its tile. The same array when nothing follows. */
export function relinkCategories(blocks: readonly LayoutBlock[], links: CatalogChange['links']): LayoutBlock[] {
  if (!links.rename.length && !links.remove.length) return blocks as LayoutBlock[];
  const renamed = new Map(links.rename.map(entry => [fold(entry.from), entry.to]));
  const gone = new Set(links.remove.map(entry => fold(entry.name)));
  const target = (link: string) => {
    if (!link.startsWith('category:')) return link;
    const name = fold(link.slice('category:'.length));
    return gone.has(name) ? 'products' : renamed.has(name) ? `category:${renamed.get(name)}` : link;
  };
  return blocks.map(block => {
    const next: LayoutBlock = { ...block };
    if (block.link !== undefined) next.link = target(block.link);
    if (block.link2 !== undefined) next.link2 = target(block.link2);
    if (block.items) {
      const list = CATEGORY_LISTS.has(block.type);
      next.items = block.items.filter(item => !(list && gone.has(fold(item.title))))
        .map(item => ({ ...item, ...(list && renamed.has(fold(item.title)) ? { title: renamed.get(fold(item.title))! } : {}), ...(item.link !== undefined ? { link: target(item.link) } : {}) }));
    }
    return next;
  });
}

/** The store menu without its links and tiles to removed categories (`category:<id>`); a dropdown left empty goes too. */
export function withoutCategoryMenuLinks(menu: StoreMenu | undefined, ids: readonly string[]): StoreMenu | undefined {
  if (!menu?.groups?.length || !ids.length) return menu;
  const gone = new Set(ids.map(id => `category:${id}`));
  const groups = menu.groups.map(group => {
    const { footer, ...rest } = group;
    return { ...rest, links: group.links.filter(link => !gone.has(link.to)), ...(group.tiles ? { tiles: group.tiles.filter(tile => !gone.has(tile.to)) } : {}),
      ...(footer && !gone.has(footer.to) ? { footer } : {}) };
  }).filter(group => group.links.length || group.tiles?.length);
  return { ...menu, groups };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-edit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-catalog-edit.ts apps/api/src/storefront-source/source-catalog-edit.spec.ts
git commit -m "feat(yapi): section and menu links follow a renamed or removed category (spec 2026-11-05 creates anything part 2)"
```

---

### Task 6: «catalogo» in the quick-edit answer, prompt and call

**Files:**
- Modify: `apps/api/src/storefront-source/source-layout-edit.ts` (`LayoutEditRead` line 37, `LAYOUT_EDIT_PROMPT` lines 90–93 and the `rest` rule, `layoutEditSchema` 145–150, `readLayoutEdit` 153–163)
- Modify: `apps/api/src/storefront-source/source-store-edit.ts` (`STORE_EDIT_PROMPT` product line)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (editKind text line 105; `editLayout` instructions)
- Test: `apps/api/src/storefront-source/source-layout-edit.spec.ts`, `apps/api/src/storefront-source/source-conversation-point.spec.ts`

**Interfaces:**
- Consumes: `catalogOpSchema`, `readCatalogOps`, `CatalogOp`, `CATALOG_EDIT_PROMPT` (Task 2).
- Produces: `LayoutEditRead = { ops; store; catalog: CatalogOp[]; rest; ask? }`; schema `required: ['ops', 'store', 'catalogo', 'rest', 'ask']`.

- [ ] **Step 1: Write the failing tests**

In `source-layout-edit.spec.ts`, change line 86's expectation to include `catalog: []`:

```ts
    expect(readLayoutEdit({ ops: [op({ at: 1, field: 'title', value: 'Hola' }), { op: 'paint' }], rest: '  verde lima ' })).toEqual({ ops: [op({ at: 1, field: 'title', value: 'Hola' })], store: [], catalog: [], rest: 'verde lima' });
```

and line 88's to:

```ts
    expect(layoutEditSchema().required).toEqual(['ops', 'store', 'catalogo', 'rest', 'ask']);
```

Append to the same file:

```ts
it('reads the catalog ops beside the section and store ops (spec 2026-11-05 creates anything part 2)', () => {
  const read = readLayoutEdit({ ops: [], store: [], catalogo: [{ kind: 'code-add', at: -1, name: 'VERANO20', price: '', stock: '', text: '', category: '', photo: '', option: '', value: '20 %' }, { kind: 'hack' }], rest: '', ask: '' });
  expect(read?.catalog).toEqual([expect.objectContaining({ kind: 'code-add', name: 'VERANO20', value: '20 %' })]);
  expect(layoutEditSchema().properties.catalogo.items.required).toContain('kind');
  expect(LAYOUT_EDIT_PROMPT).toContain('«catalogo»');
  expect(STORE_EDIT_PROMPT).toContain('option-price');
});
```

In `source-conversation-point.spec.ts`, add `import { CATALOG_EDIT_PROMPT } from './source-catalog-edit';` and append:

```ts
it('the quick edit call carries the catalog rules and asks for «catalogo» (spec 2026-11-05 creates anything part 2)', async () => {
  await service().editLayout('m1', { storeId: 's1', layout: [{ type: 'cover-split', title: 'Hola' }] as never, request: 'agrega la Torta a Bs 120' });
  const body = sent();
  expect(body.instructions).toContain(CATALOG_EDIT_PROMPT);
  expect(body.text.format.schema.required).toContain('catalogo');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/storefront-source/source-layout-edit.spec.ts src/storefront-source/source-conversation-point.spec.ts`
Expected: FAIL (no `catalog`, no `catalogo`, prompt missing).

- [ ] **Step 3: Implement**

`source-layout-edit.ts` — add import:

```ts
import { catalogOpSchema, readCatalogOps, type CatalogOp } from './source-catalog-edit';
```

Change `LayoutEditRead`:

```ts
export type LayoutEditRead = { ops: LayoutOp[]; store: StoreOp[]; catalog: CatalogOp[]; rest: string; ask?: string };
```

In `LAYOUT_EDIT_PROMPT`, replace the opening sentence lines

```
diseñadas que se pueden agregar. El comercio pide un cambio. Respondes «ops» con los cambios exactos de las secciones, «store» con
los de los datos de la tienda y «rest» con lo que estas operaciones no pueden hacer.
```

with

```
diseñadas que se pueden agregar. El comercio pide un cambio. Respondes «ops» con los cambios exactos de las secciones, «store» con
los de los datos de la tienda, «catalogo» con los del catálogo (productos, categorías y códigos de descuento) y «rest» con lo que
estas operaciones no pueden hacer.
```

and in the `rest:` rule replace `una foto que no mandó —, con sus` with `una foto que no mandó; nunca productos, categorías ni códigos —, con sus`. Then replace `- Si nada del pedido se hace con ops ni con store: ops = [], store = [] y rest = el pedido entero.` with `- Si nada del pedido se hace con ops, store ni catalogo: ops = [], store = [], catalogo = [] y rest = el pedido entero.`

In `layoutEditSchema`, change the returned object to:

```ts
  return { type: 'object', additionalProperties: false, required: ['ops', 'store', 'catalogo', 'rest', 'ask'], properties: { ops: { type: 'array', items: op },
    store: { type: 'array', items: storeOpSchema() }, catalogo: { type: 'array', items: catalogOpSchema() }, rest: { type: 'string' }, ask: { type: 'string' } } };
```

In `readLayoutEdit`, read `catalogo` (add it to the `raw` type: `catalogo?: unknown`) and return:

```ts
  return { ops, store: readStoreOps(raw.store), catalog: readCatalogOps(raw.catalogo), rest: String(raw.rest ?? '').replace(/\s+/g, ' ').trim(), ...(ask ? { ask } : {}) };
```

`source-store-edit.ts` `STORE_EDIT_PROMPT` — replace `«fotos», f0, f1…). Un producto con opciones no cambia de precio aquí.` with `«fotos», f0, f1…). Un producto con opciones no cambia de precio aquí: sus opciones cambian con option-price en «catalogo».`

`source-conversation.service.ts`:
- add `import { CATALOG_EDIT_PROMPT } from './source-catalog-edit';`
- in `editLayout`, `instructions: \`${LAYOUT_EDIT_PROMPT}\n${STORE_EDIT_PROMPT}\`` → `instructions: \`${LAYOUT_EDIT_PROMPT}\n${STORE_EDIT_PROMPT}\n${CATALOG_EDIT_PROMPT}\``
- in the editKind instruction (line 105), replace `a product's name, price, description or photo.` with `a product's name, price, description or photo, or its catalog: new products, archiving, stock, options, categories and discount codes.`

Search for any other code building a `LayoutEditRead` literal: `grep -rn "LayoutEditRead" apps/api/src --include=*.ts`; any non-spec literal gets `catalog: []`.

- [ ] **Step 4: Run to verify pass + type check**

Run: `cd apps/api && npx jest src/storefront-source/source-layout-edit.spec.ts src/storefront-source/source-conversation-point.spec.ts src/storefront-source/source-store-edit.spec.ts`
Expected: PASS.
Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-layout-edit.ts apps/api/src/storefront-source/source-layout-edit.spec.ts apps/api/src/storefront-source/source-store-edit.ts apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-conversation-point.spec.ts
git commit -m "feat(yapi): the quick edit answers «catalogo» with the catalog rules (spec 2026-11-05 creates anything part 2)"
```

---

### Task 7: Writing the catalog change

**Files:**
- Create: `apps/api/src/storefront-source/source-catalog-write.ts`
- Create: `apps/api/src/storefront-source/source-catalog-write.spec.ts`

**Interfaces:**
- Consumes: `CatalogChange`, `emptyCatalogChange` (Task 3), `applyVariantOperations`, `totalVariantStock`.
- Produces: `writeCatalogChange(tx: Prisma.TransactionClient, storeId: string, change: CatalogChange): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `source-catalog-write.spec.ts`:

```ts
import { writeCatalogChange } from './source-catalog-write';
import { emptyCatalogChange, type CatalogChange } from './source-catalog-edit';

const txMock = () => {
  const calls: string[] = [];
  const track = (name: string, answer: (args: any) => unknown) => jest.fn(async (args: any) => { calls.push(name); return answer(args); });
  const tx = {
    category: { count: track('category.count', () => 2), create: track('category.create', args => ({ id: `cat-${args.data.name}` })),
      updateMany: track('category.updateMany', () => ({ count: 1 })), deleteMany: track('category.deleteMany', () => ({ count: 1 })) },
    paymentLink: { create: track('paymentLink.create', () => ({})), update: track('paymentLink.update', () => ({})),
      findFirst: track('paymentLink.findFirst', args => ({ id: args.where.id, variants: [{ id: 'v1', name: 'S', amount: 9000, stock: 0 }, { id: 'v2', name: 'M', amount: 9500, stock: 2 }] })) },
    promoCode: { create: track('promoCode.create', () => ({})), updateMany: track('promoCode.updateMany', () => ({ count: 1 })) },
    $queryRaw: track('$queryRaw', () => []),
  };
  return { tx, calls };
};
const change = (fill: (c: CatalogChange) => void) => { const c = emptyCatalogChange(); fill(c); return c; };

it('creates the new categories first and files new and existing products into them', async () => {
  const { tx } = txMock();
  await writeCatalogChange(tx as never, 's1', change(c => {
    c.categories.create.push({ ref: 'new:0', name: 'Bebidas' });
    c.products.create.push({ name: 'Limonada', description: '', amount: 1500, currency: 'BOB', imageUrls: [], stock: null, variants: [], categoryRef: 'new:0' });
    c.products.update.push({ id: 'p1', categoryRef: 'new:0' }, { id: 'p3', categoryRef: null });
  }));
  expect(tx.category.create).toHaveBeenCalledWith({ data: { storeId: 's1', name: 'Bebidas', sortOrder: 2 }, select: { id: true } });
  expect(tx.paymentLink.create).toHaveBeenCalledWith({ data: { storeId: 's1', name: 'Limonada', description: null, amount: 1500, currency: 'BOB', imageUrls: [], stock: null, categoryId: 'cat-Bebidas' } });
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(1, { where: { id: 'p1' }, data: { categoryId: 'cat-Bebidas' } });
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(2, { where: { id: 'p3' }, data: { categoryId: null } });
});

it('archives instead of deleting, and re-reads options under a row lock so a sale in between is kept', async () => {
  const { tx, calls } = txMock();
  await writeCatalogChange(tx as never, 's1', change(c => {
    c.products.update.push({ id: 'p9', status: 'ARCHIVED' }, { id: 'p2', variantOps: [{ action: 'update', variantId: 'v2', changes: { stock: 5 } as never }] });
  }));
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(1, { where: { id: 'p9' }, data: { status: 'ARCHIVED' } });
  // S sold out between the chat's read and this write: it stays 0, only M changes.
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(2, { where: { id: 'p2' }, data: expect.objectContaining({ amount: 9000, stock: 5,
    variants: [expect.objectContaining({ id: 'v1', stock: 0 }), expect.objectContaining({ id: 'v2', stock: 5 })] }) });
  expect(calls.indexOf('$queryRaw')).toBeLessThan(calls.lastIndexOf('paymentLink.findFirst'));
  expect(calls.some(call => call.includes('delete') && call.startsWith('paymentLink'))).toBe(false);
});

it('codes are made private, flags go by id, and the removed categories go last', async () => {
  const { tx, calls } = txMock();
  await writeCatalogChange(tx as never, 's1', change(c => {
    c.categories.remove.push({ id: 'c2', name: 'Postres' });
    c.categories.rename.push({ id: 'c1', name: 'Pasteles' });
    c.categories.order = ['c2', 'c1'];
    c.codes.create.push({ code: 'NOVIA10', type: 'PERCENT', value: 10 });
    c.codes.flags.push({ id: 'k1', isActive: false });
  }));
  expect(tx.promoCode.create).toHaveBeenCalledWith({ data: { storeId: 's1', code: 'NOVIA10', discountType: 'PERCENT', discountValue: 10 } });
  expect(tx.promoCode.updateMany).toHaveBeenCalledWith({ where: { id: 'k1', storeId: 's1' }, data: { isActive: false } });
  expect(tx.category.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', storeId: 's1' }, data: { name: 'Pasteles' } });
  expect(tx.category.updateMany).toHaveBeenCalledWith({ where: { id: 'c2', storeId: 's1' }, data: { sortOrder: 0 } });
  expect(tx.category.deleteMany).toHaveBeenCalledWith({ where: { storeId: 's1', id: { in: ['c2'] } } });
  expect(calls.at(-1)).toBe('category.deleteMany');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-write.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `source-catalog-write.ts`:

```ts
/* YAPI creates anything, part 2 (spec 2026-11-05 creates anything part 2 §5): a checked catalog change, written inside the quick
 * edit's transaction — new categories first (so products can be filed into them), renames and order, products, codes, and the
 * removed categories last (their products are left without a category by the schema). Products are archived, never deleted. */
import type { Prisma } from '@prisma/client';
import { totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import { applyVariantOperations } from './source-product-options';
import type { CatalogChange } from './source-catalog-edit';

export async function writeCatalogChange(tx: Prisma.TransactionClient, storeId: string, change: CatalogChange): Promise<void> {
  const made = new Map<string, string>();
  if (change.categories.create.length) {
    let sortOrder = await tx.category.count({ where: { storeId } });
    for (const category of change.categories.create)
      made.set(category.ref, (await tx.category.create({ data: { storeId, name: category.name, sortOrder: sortOrder++ }, select: { id: true } })).id);
  }
  const categoryId = (ref: string | null) => ref === null ? null : ref.startsWith('new:') ? made.get(ref) ?? null : ref;
  for (const category of change.categories.rename) await tx.category.updateMany({ where: { id: category.id, storeId }, data: { name: category.name } });
  for (const [sortOrder, id] of (change.categories.order ?? []).entries()) await tx.category.updateMany({ where: { id, storeId }, data: { sortOrder } });
  for (const product of change.products.create) {
    await tx.paymentLink.create({ data: { storeId, name: product.name, description: product.description || null, amount: product.amount, currency: product.currency,
      imageUrls: product.imageUrls, stock: product.stock, categoryId: categoryId(product.categoryRef),
      ...(product.variants.length ? { variants: product.variants as unknown as Prisma.InputJsonValue } : {}) } });
  }
  for (const update of change.products.update) {
    // Options are re-read under a row lock: a sale between the chat's read and this write keeps its stock.
    if (update.variantOps?.length) await tx.$queryRaw`SELECT id FROM "PaymentLink" WHERE id = ${update.id} AND "storeId" = ${storeId} FOR UPDATE`;
    const existing = await tx.paymentLink.findFirst({ where: { id: update.id, storeId }, select: { id: true, variants: true } });
    if (!existing) continue;
    const variants = update.variantOps?.length
      ? applyVariantOperations((Array.isArray(existing.variants) ? existing.variants : []) as unknown as ProductVariant[], update.variantOps) : undefined;
    await tx.paymentLink.update({ where: { id: existing.id }, data: {
      ...(update.status ? { status: update.status } : {}),
      ...(update.stock !== undefined ? { stock: update.stock } : {}),
      ...(update.categoryRef !== undefined ? { categoryId: categoryId(update.categoryRef) } : {}),
      ...(variants ? { variants: variants as unknown as Prisma.InputJsonValue, amount: Math.min(...variants.map(variant => variant.amount)),
        ...(variants.every(variant => variant.stock !== undefined) ? { stock: totalVariantStock(variants) } : {}),
        ...(update.variantOps!.some(operation => operation.changes?.amount !== undefined) ? { priceToConfirm: false } : {}) } : {}),
    } });
  }
  for (const code of change.codes.create) await tx.promoCode.create({ data: { storeId, code: code.code, discountType: code.type, discountValue: code.value } });
  for (const { id, ...flags } of change.codes.flags) await tx.promoCode.updateMany({ where: { id, storeId }, data: flags });
  if (change.categories.remove.length) await tx.category.deleteMany({ where: { storeId, id: { in: change.categories.remove.map(category => category.id) } } });
}
```

Note: in the archive test the first update's data must be exactly `{ status: 'ARCHIVED' }` — the spreads above add nothing else for it.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && npx jest src/storefront-source/source-catalog-write.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-catalog-write.ts apps/api/src/storefront-source/source-catalog-write.spec.ts
git commit -m "feat(yapi): write a catalog change in one transaction — categories, products (archived, options under a row lock), codes (spec 2026-11-05 creates anything part 2)"
```

---

### Task 8: The chat service runs it — read, apply, write, relink, menu, ask

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` — `templateLayoutEdit` (~1125–1290), `storeEditState` (~1293–1318), `writeStoreChange` (~1330)
- Test: `apps/api/src/storefront-source/source-chat-store-edit.spec.ts`

**Interfaces:**
- Consumes: everything above; `readStoreMenu`, `withStoreMenuConfig` (`./source-store-menu`, already imported in this file — check, import if not).
- Produces: `writeStoreChange(merchantId, storeId, change: StoreChange, catalog?: CatalogChange)`.

- [ ] **Step 1: Write the failing tests** — append to `source-chat-store-edit.spec.ts` (add `import { readStoreMenu } from './source-store-menu';` at the top):

```ts
describe('the catalog through the quick edit (spec 2026-11-05 creates anything part 2)', () => {
  const cat = (fields: Record<string, unknown>) => ({ kind: '', at: -1, name: '', price: '', stock: '', text: '', category: '', photo: '', option: '', value: '', ...fields });
  const linked: LayoutBlock[] = [{ type: 'cover-split', title: 'Gelato de tofu', cta: 'Ver helados', link: 'category:Helados' }, { type: 'products-grid', card: 'classic' }];
  const editOn = (blocks: LayoutBlock[], instruction: string) => chat.templateLayoutEdit('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction, revision: 5, assetUrls: [] }, 5, blocks);
  beforeEach(() => {
    prisma.paymentLink = { findMany: jest.fn(async ({ where }: any) => where.status === 'ARCHIVED' ? [{ id: 'p9', name: 'Torta de limón' }]
      : [{ id: 'p1', stock: null, categoryId: 'c1', currency: 'BOB', variants: [] }]) };
    prisma.category = { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Helados', _count: { paymentLinks: 1 } }]) };
    prisma.promoCode.findMany = jest.fn().mockResolvedValue([]);
    Object.assign(prisma.tx, {
      category: { count: jest.fn().mockResolvedValue(1), create: jest.fn(async ({ data }: any) => ({ id: `cat-${data.name}` })), updateMany: jest.fn(), deleteMany: jest.fn() },
      promoCode: { create: jest.fn(), updateMany: jest.fn() }, $queryRaw: jest.fn(),
    });
    prisma.tx.paymentLink.create = jest.fn();
  });

  it('sends categories, codes and archived products, and makes a category, a product in it and a code in one revision', async () => {
    editLayout.mockResolvedValue(read({ ops: [{ op: 'text', at: 0, field: 'title', item: -1, value: 'Gelato y más', to: -1, type: '' }], catalog: [
      cat({ kind: 'category-add', name: 'Paletas' }), cat({ kind: 'product-add', name: 'Paleta de mango', price: '15', text: 'De mango.', category: 'Paletas' }),
      cat({ kind: 'code-add', name: 'PALETA10', value: '10 %' })] }));
    const result = await edit('crea la categoría Paletas con la Paleta de mango a Bs 15, un código PALETA10 de 10 % y cambia el título');
    const sentState = editLayout.mock.calls[0][1].store;
    expect(sentState.categories).toEqual([{ id: 'c1', name: 'Helados', count: 1 }]);
    expect(sentState.archived).toEqual([{ id: 'p9', name: 'Torta de limón' }]);
    expect(sentState.products[0]).toMatchObject({ id: 'p1', stock: null, categoryId: 'c1' });
    expect(prisma.tx.category.create).toHaveBeenCalledWith({ data: { storeId: 's1', name: 'Paletas', sortOrder: 1 }, select: { id: true } });
    expect(prisma.tx.paymentLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Paleta de mango', amount: 1500, categoryId: 'cat-Paletas' }) });
    expect(prisma.tx.promoCode.create).toHaveBeenCalledWith({ data: { storeId: 's1', code: 'PALETA10', discountType: 'PERCENT', discountValue: 10 } });
    expect(refill).toHaveBeenCalledTimes(1);
    expect(refill.mock.calls[0][5]).toMatchObject({ refreshData: true });
    expect(result.assistantMessage.content).toContain('creé «Paleta de mango» en Paletas a Bs 15');
    expect(result.assistantMessage.content).toContain('el código PALETA10 da 10 % de descuento');
    expect(result.assistantMessage.content).toContain('Mándame la foto de «Paleta de mango» cuando la tengas.');
  });

  it('a renamed category takes its section links along', async () => {
    editLayout.mockResolvedValue(read({ catalog: [cat({ kind: 'category-rename', at: 0, name: 'Gelatos' })] }));
    await editOn(linked, 'renombra Helados a Gelatos');
    expect(prisma.tx.category.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', storeId: 's1' }, data: { name: 'Gelatos' } });
    expect(refill.mock.calls[0][3].layout[0].link).toBe('category:Gelatos');
  });

  it('a removed category sends its links to all products and leaves the menu', async () => {
    editLayout.mockResolvedValue(read({ catalog: [cat({ kind: 'category-remove', at: 0 })] }));
    await editOn(linked, 'borra la categoría Helados');
    expect(prisma.tx.category.deleteMany).toHaveBeenCalledWith({ where: { storeId: 's1', id: { in: ['c1'] } } });
    expect(refill.mock.calls[0][3].layout[0].link).toBe('products');
    const config = { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ header: { menu: { style: 'dropdowns', groups: [
      { label: 'Helados', links: [{ to: 'category:c1' }] }, { label: 'Info', links: [{ to: 'page:about' }] }] } } })};` };
    expect(readStoreMenu(refill.mock.calls[0][5].files([config]))?.groups?.map((group: { label: string }) => group.label)).toEqual(['Info']);
  });

  it('a failed catalog write is said honestly, and no link is rewritten', async () => {
    prisma.$transaction = jest.fn().mockRejectedValue(new Error('db down'));
    editLayout.mockResolvedValue(read({ catalog: [cat({ kind: 'category-rename', at: 0, name: 'Gelatos' })] }));
    const result = await editOn(linked, 'renombra Helados a Gelatos');
    expect(result.assistantMessage.content).toContain('No pude guardar los cambios del catálogo');
    expect(refill).not.toHaveBeenCalled();
  });

  it('a product without its price is asked while the rest is done, and the answer never makes a twin', async () => {
    editLayout.mockResolvedValueOnce(read({ catalog: [cat({ kind: 'product-add', name: 'Paleta de mango', price: '15' })], ask: '¿A cuánto vendes la Paleta de coco?' }));
    const first = await edit('agrega Paleta de mango a Bs 15 y Paleta de coco');
    expect(first.assistantMessage.content).toContain('¿A cuánto vendes la Paleta de coco?');
    expect(first.assistantMessage.metadata.storeAsk).toEqual({ request: 'agrega Paleta de mango a Bs 15 y Paleta de coco', ask: '¿A cuánto vendes la Paleta de coco?' });
    prisma.storeAgentMessage.findFirst = jest.fn().mockResolvedValue({ metadata: { storeAsk: { request: 'agrega Gelato chocolate a Bs 30 y Paleta de coco', ask: '¿A cuánto vendes la Paleta de coco?' } } });
    prisma.tx.paymentLink.create.mockClear();
    editLayout.mockResolvedValueOnce(read({ catalog: [cat({ kind: 'product-add', name: 'Gelato chocolate', price: '30' }), cat({ kind: 'product-add', name: 'Paleta de coco', price: '12' })] }));
    const second = await edit('a Bs 12');
    expect(prisma.tx.paymentLink.create).toHaveBeenCalledTimes(1);
    expect(second.assistantMessage.content).not.toContain('Ya tienes');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-store-edit.spec.ts`
Expected: the new describe FAILs (state lacks categories, nothing written); old tests still PASS.

- [ ] **Step 3: Implement** in `source-chat.service.ts`:

Imports (top of file, beside the other `./source-…` imports):

```ts
import { applyCatalogOps, catalogChangeEmpty, emptyCatalogChange, relinkCategories, withoutCategoryMenuLinks, type CatalogChange } from './source-catalog-edit';
import { writeCatalogChange } from './source-catalog-write';
import type { ProductVariant } from '../payment-links/product-variants';
```

(Check `readStoreMenu` and `withStoreMenuConfig` are already imported from `./source-store-menu`; add them to that import if not.)

**a. `storeEditState`** — after the `Promise.all([...])` that reads `record, links, retention, catalog`, and after `const items = …`, add:

```ts
    // Part 2 (spec 2026-11-05 creates anything): the catalog rows the chat may change; any read that fails leaves its part out.
    const safely = <T,>(run: () => Promise<T>, fallback: T): Promise<T> => Promise.resolve().then(run).catch(() => fallback);
    const [rows, archived, categories, codes] = await Promise.all([
      safely(() => this.prisma.paymentLink.findMany({ where: { storeId, id: { in: items.map(item => item.id) } }, select: { id: true, stock: true, categoryId: true, currency: true, variants: true } }),
        [] as Array<{ id: string; stock: number | null; categoryId: string | null; currency: string; variants: Prisma.JsonValue }>),
      safely(() => this.prisma.paymentLink.findMany({ where: { storeId, status: 'ARCHIVED' }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, name: true } }), null),
      safely(() => this.prisma.category.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, _count: { select: { paymentLinks: { where: { status: 'ACTIVE' } } } } } }), null),
      safely(() => this.prisma.promoCode.findMany({ where: { storeId }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }], take: 20,
        select: { id: true, code: true, discountType: true, discountValue: true, isActive: true, showInEmails: true, showInAssistant: true } }), null),
    ]);
    const row = new Map(rows.map(entry => [entry.id, entry]));
```

In the returned object, replace the `products:` mapping with:

```ts
      products: items.map(item => {
        const saved = row.get(item.id);
        return { id: item.id, name: item.name, amount: Number(item.amount) || 0, description: item.description ?? '', imageUrls: (item.imageUrls ?? []).map(url => uploadOnly(url) ?? url),
          options: Array.isArray(item.variants) && item.variants.length > 0,
          ...(saved ? { stock: saved.stock, categoryId: saved.categoryId, currency: saved.currency, variants: (Array.isArray(saved.variants) ? saved.variants : []) as unknown as ProductVariant[] } : {}) };
      }),
      ...(archived ? { archived } : {}),
      ...(categories ? { categories: categories.map(category => ({ id: category.id, name: category.name, count: category._count.paymentLinks })) } : {}),
      ...(codes ? { codes: codes.map(code => ({ id: code.id, code: code.code, type: code.discountType, value: code.discountValue, active: code.isActive,
        emails: code.showInEmails, assistant: code.showInAssistant })) } : {}),
```

**b. `writeStoreChange`** — signature `private async writeStoreChange(merchantId: string, storeId: string, change: StoreChange, catalog?: CatalogChange)`; as the last statement inside its `$transaction(async tx => { … })` body add:

```ts
      if (catalog) await writeCatalogChange(tx, storeId, catalog);
```

**c. `templateLayoutEdit`**:

1. The early ask return: `if (read.ask && !read.ops.length && !read.store.length) {` → `if (read.ask && !read.ops.length && !read.store.length && !(read.catalog ?? []).length) {`.
2. After `const store = editState ? applyStoreOps(editState, read.store, photos) : …;` add:

```ts
    // Part 2 (spec 2026-11-05 creates anything): products, categories and codes, checked against what the digest showed.
    const catalog = editState ? applyCatalogOps(editState, read.catalog ?? [], photos, { answering: Boolean(pendingAsk) })
      : { change: emptyCatalogChange(), done: [] as string[], refused: [] as string[], notes: [] as string[] };
```

   and change the `refused` line to end with `..., ...store.refused, ...catalog.refused];`.
3. In the `template_layout_edit` log object add `catalog: (read.catalog ?? []).map(op => \`${op.kind}${op.at >= 0 ? \`[${op.at}]\` : ''}\`),` after the `store:` entry.
4. Replace the block from `let dataChanged = false;` through `if (written) done.push(...store.done); else refused.push(…);\n    }` with:

```ts
    let dataChanged = false;
    const catalogWrite = !catalogChangeEmpty(catalog.change);
    const dataEmpty = storeChangeEmpty({ ...data, products: data.products });
    if (!storeChangeEmpty(store.change) || catalogWrite) {
      const written = dataEmpty && !catalogWrite ? true : await (async () => {
        await workflow.report('saving');
        return this.writeStoreChange(merchantId, storeId, store.change, catalogWrite ? catalog.change : undefined).then(() => (dataChanged = true), error => {
          this.productLogger.warn(JSON.stringify({ event: 'store_edit_write_failed', storeId, reason: String((error as Error)?.message ?? error).slice(0, 300) }));
          return false;
        });
      })();
      if (written) { done.push(...store.done, ...catalog.done); refused.push(...catalog.notes); }
      else refused.push(catalogWrite && dataEmpty ? 'No pude guardar los cambios del catálogo. Inténtalo de nuevo en un momento.'
        : 'No pude guardar los cambios de los datos de tu tienda. Inténtalo de nuevo en un momento.');
    }
    // Links to a renamed or removed category follow it on every page, only once the change is saved; the menu follows in the files.
    const links = dataChanged && catalogWrite ? catalog.change.links : { rename: [], remove: [] };
    const relink = (list: LayoutBlock[]) => relinkCategories(list, links);
    const homeNow = relink(applied.layout);
    const productNow = relink(product.layout);
    const pagesNow = Object.fromEntries(MENU_PAGES.map(page => [page, relink(menu.find(entry => entry.page === page)?.layout ?? pages[page])])) as Record<MenuPage, LayoutBlock[]>;
    const pagesNowChanged = MENU_PAGES.some(page => JSON.stringify(pagesNow[page]) !== JSON.stringify(pages[page]));
    const extraNow = extra.map(page => ({ ...page, layout: relink(page.layout) }));
    const extraNowChanged = JSON.stringify(extraNow) !== JSON.stringify(extraPages);
    const removedCategoryIds = links.remove.map(entry => entry.id);
```

5. Replace the `const filesChange: MasterFill = { … };` statement with:

```ts
    const filesChange: MasterFill = { ...(JSON.stringify(homeNow) !== JSON.stringify(layout) ? { layout: homeNow } : {}),
      ...(JSON.stringify(productNow) !== JSON.stringify(productLayout) ? { productLayout: productNow } : {}), ...(store.change.copy ? { copy: store.change.copy } : {}),
      ...(pagesNowChanged ? { pageLayouts: pagesNow } : {}), ...(extraNowChanged ? { extraPages: extraNow } : {}) };
```

6. In the refill block: in `withExtra`, use `extraNowChanged` instead of `extraChanged` and `extraNow` instead of `extra` (both occurrences: the guard and `withExtraPages(list, extraNow)` / `withExtraPageLinks(readStoreMenu(list), extraNow)`); add after `withExtra`:

```ts
      const withoutRemovedCategories = <T extends { path: string; content: string }>(list: T[]): T[] => {
        if (!removedCategoryIds.length) return list;
        const before = readStoreMenu(list);
        const after = withoutCategoryMenuLinks(before, removedCategoryIds);
        return after && after !== before ? withStoreMenuConfig(list, list, after) : list;
      };
```

   change the `pageFiles` condition to `title !== undefined || sectioned.length || extraNowChanged || removedCategoryIds.length` and its function body to `withoutRemovedCategories(withExtra(withSectionedPages(title !== undefined ? withCatalogTitle(list, title) : list, sectioned)))`; in the refill label condition replace `extraChanged` with `extraNowChanged`.
7. The reply: replace

```ts
    const content = `${layoutEditReply(done, refused)}${rest ? ` Ahora sigo con lo demás: ${quoteRest(rest)}.` : ''}`.trim();
```

with

```ts
    // Part 2: a question YAPI still needs answered (a price it was not told) rides after what it did, and is remembered for the answer.
    const content = `${layoutEditReply(done, refused)}${read.ask ? ` ${read.ask}` : ''}${rest ? ` Ahora sigo con lo demás: ${quoteRest(rest)}.` : ''}`.trim();
```

   and in that message's `metadata` add `...(read.ask ? { storeAsk: { request: input.instruction.slice(0, 2000), ask: read.ask } } : {}),`.

- [ ] **Step 4: Run to verify pass + type check**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-store-edit.spec.ts src/storefront-source/source-catalog-edit.spec.ts src/storefront-source/source-catalog-write.spec.ts src/storefront-source/source-store-edit.spec.ts src/storefront-source/source-layout-edit.spec.ts src/storefront-source/source-conversation-point.spec.ts`
Expected: PASS (all).
Run: `cd apps/api && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: no errors.
Run the other chat specs that drive `templateLayoutEdit`: `cd apps/api && npx jest src/storefront-source/source-chat.service.spec.ts src/storefront-source/source-chat-plantilla.spec.ts src/storefront-source/source-chat-master.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-store-edit.spec.ts
git commit -m "feat(yapi): the quick edit makes products, categories and codes in one revision; links follow, a missing price is asked (spec 2026-11-05 creates anything part 2)"
```

---

### Task 9: Live check and ledger

**Files:**
- Create: `.superpowers/sdd/2026-11-05-yapi-creates-anything-part-2/progress.md`
- Modify (memory, outside the repo): `~/.claude/projects/-Users-saramia-pagosYa/memory/project_yapi_creates_anything.md`

- [ ] **Step 1: Check the stack is up on the ChatGPT plan**

Run: `lsof -iTCP -sTCP:LISTEN -n -P | grep -E ':(3000|3001|3002|3003|3010)\b'`
If the API is down: `cd /Users/saramia/pagosYa && nohup pnpm dev:chatgpt > /tmp/pagosya-dev.log 2>&1 &` (never plain `pnpm dev`). Confirm `apps/api/dist/storefront-source/source-catalog-edit.js` exists after the watcher rebuilds.

- [ ] **Step 2: Run the seven steps on NOA nvkv5rvk (or a fresh test store) in Studio's YAPI chat**, one message each, checking the preview, Productos/Categorías/Códigos in the dashboard after each:
  1. «crea la categoría Novias y agrega Vestido Aurora a Bs 2.400 con talla S, M y L en Novias» → category, product with 3 options, in the menu.
  2. «quedan 2 del Vestido Aurora en talla M» → that option's stock is 2.
  3. «quita el Vestido Aurora» → archived (dashboard shows it archived); «vuélvelo a poner» → active again.
  4. «crea un código NOVIA10 de 10 %» → the code exists, private; a checkout with it gets 10 % off.
  5. «apaga NOVIA10» → the checkout refuses it.
  6. «renombra Novias a Bridal» → menu and section links still open the category.
  7. «borra la categoría Bridal» → its products are uncategorised, links point at all products, the menu entry is gone.
  Plus: «agrega Velo Luna» (no price) → YAPI asks the price; answer «Bs 350» → one product, no twin.

- [ ] **Step 3: Record results** — write `.superpowers/sdd/2026-11-05-yapi-creates-anything-part-2/progress.md` with each step PASS/FAIL, the revision numbers, and any minors found («Final: minor» list, as part 1's ledger). Fix any FAIL with its own test-first commit before moving on.

- [ ] **Step 4: Update memory** — in `project_yapi_creates_anything.md` replace the «Part 2 spec written… awaiting owner review» bullet with the built range (first..last commit), the live results and the open minors.

- [ ] **Step 5: Commit the ledger**

```bash
git add .superpowers/sdd/2026-11-05-yapi-creates-anything-part-2/progress.md
git commit -m "docs(yapi): creates anything part 2 — live check ledger (2026-11-05)"
```
