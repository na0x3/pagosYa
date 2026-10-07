# Order Confirmation Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A buyer who pays on a pagosYa store receives an on-brand HTML confirmation email that the store's own generator authored, with every order fact filled by the platform.

**Architecture:** YAPI authors `emails/order-confirmation.html` into the source snapshot. The author writes only `data-order-*` hooks, never an order fact. At send time a pure renderer fills those hooks from the payment intent, escaping every value by construction. An email-safe validator hardens the authored markup at save time; a kit floor template serves any store without one. The plain-text body is untouched, so every failure degrades to today's email.

**Tech Stack:** NestJS, TypeScript, Prisma, parse5 (already used by `source-design.ts`), juice (new), jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-order-confirmation-email-design.md`

## Global Constraints

- Every rendered value is inserted as a **parse5 text node or an attribute**, never as raw HTML. Escaping is by construction, not by a sanitiser pass.
- The validator **never throws on content**. Violations are stripped, clamped or dropped and returned in `repairs: string[]`, matching `source-kit-css.ts`.
- `SendEmailRequest.body` stays **byte-identical**. `html` is added alongside.
- Authored template clamp: **80 KB**. Final rendered output clamp: **90 KB** (Gmail clips at 102 KB).
- Spanish copy, `es-BO`, timezone `America/La_Paz`.
- The email carries **no pagosYa branding** — it is sent on the merchant's behalf.
- Nothing may imply automatic charging. Bolivian rails cannot charge without buyer approval.
- `brand.css`, `config.js` and `commerce.js` stay reserved; the generator may not write them.
- Fall back to the floor whenever the validated template lacks `data-order-total` or `data-order-items`.

## Review Focus

The five input classes the spec implies but does not itself exercise. Each has a test assigned to the task that owns the code.

1. **A product or customer name containing HTML** (`Café <b>Premium</b>`, `Tom & Jerry`). It must appear literally, never as markup. This is script injection into a buyer's inbox. — Task 2.
2. **A rendered email that grows past the clamp** because the order has many lines. The 80 KB clamp applies to the template; cloning rows afterwards is what actually blows the budget. — Task 2.
3. **Malformed `metadata.cart`** — not an array, or a line missing `name`/`quantity`. It must not throw, because the throw would land inside a payment confirmation. — Task 2.
4. **A store logo that is not an `https:` URL** (a `data:` URI, `javascript:`, or plain `http:`). It must be dropped, not rendered. — Task 5.
5. **An authored template whose item row is missing, or doubled.** The renderer must behave predictably rather than silently emitting an empty order. — Task 2.

---

### Task 1: The slot contract and the kit floor template

**Files:**
- Create: `apps/api/src/order-emails/order-email-slots.ts`
- Create: `packages/storefront-kit/kit/emails/order-confirmation.html`
- Test: `apps/api/src/order-emails/order-email-slots.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ORDER_EMAIL_SLOTS: readonly string[]`, `ORDER_EMAIL_REQUIRED_SLOTS: readonly string[]`, `ORDER_EMAIL_ATTRIBUTE_SLOTS: Record<string, 'href' | 'src'>`, `ORDER_EMAIL_TEMPLATE_PATH = 'emails/order-confirmation.html'`, `ORDER_EMAIL_MAX_BYTES = 80 * 1024`, `ORDER_EMAIL_RENDER_MAX_BYTES = 90 * 1024`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/order-emails/order-email-slots.spec.ts
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { ORDER_EMAIL_REQUIRED_SLOTS, ORDER_EMAIL_SLOTS, ORDER_EMAIL_TEMPLATE_PATH } from './order-email-slots';

const floor = () => readFileSync(kitPath('emails', 'order-confirmation.html'), 'utf8');

describe('order email slot contract', () => {
  it('names the template path the generator writes', () => {
    expect(ORDER_EMAIL_TEMPLATE_PATH).toBe('emails/order-confirmation.html');
  });

  it('requires the two slots that make a receipt a receipt', () => {
    expect([...ORDER_EMAIL_REQUIRED_SLOTS].sort()).toEqual(['data-order-items', 'data-order-total']);
  });

  it('the kit floor carries every slot in the contract', () => {
    const html = floor();
    for (const slot of ORDER_EMAIL_SLOTS) expect(html).toContain(slot);
  });

  it('the kit floor is table-based and declares a colour scheme', () => {
    const html = floor();
    expect(html).toContain('<table');
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).toContain('color-scheme');
  });

  it('the kit floor states no automatic charge is made', () => {
    expect(floor()).toContain('No se cobra automáticamente');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/order-emails/order-email-slots.spec.ts`
Expected: FAIL — `Cannot find module './order-email-slots'`

- [ ] **Step 3: Write the slot contract**

```ts
// apps/api/src/order-emails/order-email-slots.ts
/**
 * The contract between the store that authors the confirmation email and the platform
 * that fills it. The author writes these attributes and never an order fact; the renderer
 * fills them from the payment intent. A model that cannot type a total cannot invent one.
 */
export const ORDER_EMAIL_TEMPLATE_PATH = 'emails/order-confirmation.html';

/** Authored template clamp. The rendered form gets its own, larger budget. */
export const ORDER_EMAIL_MAX_BYTES = 80 * 1024;
/** Rendered clamp. Gmail clips a message at 102 KB and hides everything after it. */
export const ORDER_EMAIL_RENDER_MAX_BYTES = 90 * 1024;

export const ORDER_EMAIL_SLOTS = [
  'data-order-greeting',
  'data-order-id',
  'data-order-items',
  'data-order-item',
  'data-order-item-name',
  'data-order-item-variant',
  'data-order-item-extras',
  'data-order-item-quantity',
  'data-order-item-amount',
  'data-order-total',
  'data-order-original-total',
  'data-order-tracking',
  'data-order-subscription',
  'data-order-appointment-name',
  'data-order-appointment-date',
  'data-store-name',
  'data-store-logo',
] as const;

/** Without these the document is not a receipt, and the floor is used instead. */
export const ORDER_EMAIL_REQUIRED_SLOTS = ['data-order-items', 'data-order-total'] as const;

/** Slots the renderer fills as an attribute rather than as text. */
export const ORDER_EMAIL_ATTRIBUTE_SLOTS: Record<string, 'href' | 'src'> = {
  'data-order-tracking': 'href',
  'data-store-logo': 'src',
};
```

- [ ] **Step 4: Write the kit floor template**

Create `packages/storefront-kit/kit/emails/order-confirmation.html`. Table layout, inline styles only, an explicit background beside every colour, `color-scheme` declared, every slot present.

```html
<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
</head>
<body style="margin:0;padding:0;background:#f5f5f4;color:#1c1917;font-family:Helvetica,Arial,sans-serif;color-scheme:light only">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px">

<tr><td style="padding:28px 28px 0;background:#ffffff"><img data-store-logo alt="" width="48" style="display:block;border:0"></td></tr>
<tr><td style="padding:12px 28px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;background:#ffffff" data-store-name></td></tr>
<tr><td style="padding:8px 28px 0;font-size:22px;font-weight:700;color:#1c1917;background:#ffffff" data-order-greeting></td></tr>
<tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.6;color:#44403c;background:#ffffff">Tu pago fue confirmado.</td></tr>

<tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.6;color:#44403c;background:#ffffff" data-order-appointment-name></td></tr>
<tr><td style="padding:4px 28px 0;font-size:15px;line-height:1.6;color:#44403c;background:#ffffff" data-order-appointment-date></td></tr>

<tr><td style="padding:20px 28px 0;font-size:13px;color:#78716c;background:#ffffff" data-order-id></td></tr>

<tr><td style="padding:12px 28px 0;background:#ffffff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-order-items>
    <tr data-order-item>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4;font-size:15px;color:#1c1917;background:#ffffff">
        <span data-order-item-name></span>
        <span data-order-item-variant style="color:#78716c"></span>
        <span data-order-item-extras style="color:#78716c"></span>
        <span data-order-item-quantity style="color:#78716c"></span>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #e7e5e4;font-size:15px;color:#1c1917;background:#ffffff" data-order-item-amount></td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:16px 28px 0;font-size:18px;font-weight:700;color:#1c1917;background:#ffffff" data-order-total></td></tr>
<tr><td style="padding:2px 28px 0;font-size:13px;color:#78716c;background:#ffffff" data-order-original-total></td></tr>

<tr><td style="padding:20px 28px 0;background:#ffffff"><a data-order-tracking style="display:inline-block;padding:12px 20px;background:#1c1917;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px">Sigue tu pedido</a></td></tr>

<tr><td style="padding:20px 28px 0;font-size:14px;line-height:1.6;color:#44403c;background:#ffffff" data-order-subscription></td></tr>

<tr><td style="padding:24px 28px 28px;font-size:13px;line-height:1.6;color:#78716c;background:#ffffff">Gracias por tu compra. Si tu pedido es una suscripción, te enviamos un enlace para pagar antes de cada entrega. No se cobra automáticamente.</td></tr>

</table></td></tr></table></body></html>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/order-emails/order-email-slots.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/order-emails/order-email-slots.ts apps/api/src/order-emails/order-email-slots.spec.ts packages/storefront-kit/kit/emails/order-confirmation.html
git commit -m "feat(order-email): the slot contract and the kit floor a store starts from"
```

---

### Task 2: The renderer

This task carries the guarantee, and four of the five Review Focus items.

**Files:**
- Create: `apps/api/src/order-emails/order-email-render.ts`
- Test: `apps/api/src/order-emails/order-email-render.spec.ts`

**Interfaces:**
- Consumes: `ORDER_EMAIL_ATTRIBUTE_SLOTS`, `ORDER_EMAIL_RENDER_MAX_BYTES` from Task 1.
- Produces: `renderOrderEmail(template: string, data: OrderEmailData): { html: string; repairs: string[] }`, `interface OrderEmailData`, `interface OrderEmailLine`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/order-emails/order-email-render.spec.ts
import { renderOrderEmail, type OrderEmailData } from './order-email-render';

const template = `<!doctype html><html><body>
<p data-order-greeting></p><p data-order-id></p>
<table data-order-items><tr data-order-item><td data-order-item-name></td><td data-order-item-variant></td><td data-order-item-extras></td><td data-order-item-quantity></td><td data-order-item-amount></td></tr></table>
<p data-order-total></p><p data-order-original-total></p>
<a data-order-tracking>Seguir</a><p data-order-subscription></p>
<img data-store-logo><span data-store-name></span>
</body></html>`;

const base: OrderEmailData = {
  storeName: 'Mantecate', logoUrl: null, customerName: 'Ana', orderId: 'pi_SYNTH001',
  items: [{ name: 'Café', variantName: null, extras: null, quantity: 2, amount: 'Bs 150,00' }],
  total: 'Bs 150,00', originalTotal: null, trackingUrl: null, subscription: null, appointment: null,
};

describe('order email renderer', () => {
  it('fills the slots it has values for', () => {
    const { html } = renderOrderEmail(template, base);
    expect(html).toContain('Ana');
    expect(html).toContain('pi_SYNTH001');
    expect(html).toContain('Bs 150,00');
  });

  it('removes a slot it has no value for, label and all', () => {
    const { html } = renderOrderEmail(template, base);
    expect(html).not.toContain('data-order-original-total');
    expect(html).not.toContain('Seguir');
  });

  // Review Focus 1 — script injection into a buyer's inbox.
  it('escapes markup in a product or customer name instead of emitting it', () => {
    const { html } = renderOrderEmail(template, {
      ...base, customerName: 'Tom & Jerry',
      items: [{ name: 'Café <b>Premium</b><script>alert(1)</script>', variantName: null, extras: null, quantity: 1, amount: 'Bs 10,00' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Premium</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('clones the marked row once per cart line and drops the template row', () => {
    const { html } = renderOrderEmail(template, {
      ...base,
      items: [
        { name: 'Café', variantName: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00' },
        { name: 'Taza', variantName: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00' },
      ],
    });
    expect(html.match(/Café/g)).toHaveLength(1);
    expect(html).toContain('Taza');
    expect(html).toContain('250 g');
    expect(html).toContain('grabado');
    expect(html).not.toContain('data-order-item=');
  });

  // Review Focus 3 — a throw here would land inside a payment confirmation.
  it('does not throw on a malformed cart and reports what it dropped', () => {
    const bad = { ...base, items: [{ name: '', variantName: null, extras: null, quantity: 0, amount: '' }] } as OrderEmailData;
    const { html, repairs } = renderOrderEmail(template, bad);
    expect(typeof html).toBe('string');
    expect(repairs.join(' ')).toContain('line');
  });

  it('does not throw when items is not a list at all', () => {
    const { repairs } = renderOrderEmail(template, { ...base, items: 'nope' as unknown as OrderEmailData['items'] });
    expect(repairs.join(' ')).toContain('not a list');
  });

  // Review Focus 5 — a template with no item row, or two.
  it('reports a template whose item row is missing, and uses the first when there are two', () => {
    const noRow = template.replace(' data-order-item>', '>');
    expect(renderOrderEmail(noRow, base).repairs.join(' ')).toContain('data-order-item');
    const twoRows = template.replace('</table>', '<tr data-order-item><td data-order-item-name></td></tr></table>');
    expect(renderOrderEmail(twoRows, base).repairs.join(' ')).toContain('more than one');
  });

  // Review Focus 2 — the clamp that actually matters is on the rendered form.
  it('clamps a render that many cart lines pushed past the budget', () => {
    const many = Array.from({ length: 4000 }, (_, i) => ({ name: `Producto ${i} ${'x'.repeat(40)}`, variantName: null, extras: null, quantity: 1, amount: 'Bs 1,00' }));
    const { html, repairs } = renderOrderEmail(template, { ...base, items: many });
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(90 * 1024);
    expect(repairs.join(' ')).toContain('clamped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/order-emails/order-email-render.spec.ts`
Expected: FAIL — `Cannot find module './order-email-render'`

- [ ] **Step 3: Write the renderer**

```ts
// apps/api/src/order-emails/order-email-render.ts
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { ORDER_EMAIL_ATTRIBUTE_SLOTS, ORDER_EMAIL_RENDER_MAX_BYTES } from './order-email-slots';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];

export interface OrderEmailLine {
  name: string;
  variantName?: string | null;
  extras?: string | null;
  quantity: number;
  amount: string;
}

export interface OrderEmailData {
  storeName: string;
  logoUrl: string | null;
  customerName: string | null;
  orderId: string;
  items: OrderEmailLine[];
  total: string;
  originalTotal: string | null;
  trackingUrl: string | null;
  subscription: string | null;
  appointment: { name: string; date: string | null } | null;
}

const isElement = (node: Node): node is Element => 'tagName' in node;
const children = (node: Node): Node[] => ('childNodes' in node ? (node.childNodes as Node[]) : []);

function* walk(node: Node): Generator<Element> {
  for (const child of children(node)) if (isElement(child)) { yield child; yield* walk(child); }
}

const attrOf = (el: Element, name: string) => el.attrs.find(a => a.name === name);
const has = (el: Element, name: string) => attrOf(el, name) !== undefined;

function setAttr(el: Element, name: string, value: string) {
  const existing = attrOf(el, name);
  if (existing) existing.value = value; else el.attrs.push({ name, value });
}

/** Text goes in as a text node, so parse5's serializer escapes it. Never string concatenation. */
function setText(el: Element, value: string) {
  (el as any).childNodes = [{ nodeName: '#text', value, parentNode: el }];
}

function remove(el: Element) {
  const parent: any = (el as any).parentNode;
  if (parent) parent.childNodes = parent.childNodes.filter((c: Node) => c !== el);
}

/** Once filled, a slot attribute has done its job and should not reach the buyer. */
function detachSlots(el: Element) {
  el.attrs = el.attrs.filter(a => !a.name.startsWith('data-order-') && a.name !== 'data-store-logo' && a.name !== 'data-store-name');
}

/** Fills one slot, or removes the element when there is nothing truthful to put in it. */
function fill(el: Element, slot: string, value: string | null) {
  if (value === null || value === '') { remove(el); return; }
  const asAttribute = ORDER_EMAIL_ATTRIBUTE_SLOTS[slot];
  if (asAttribute) setAttr(el, asAttribute, value); else setText(el, value);
  detachSlots(el);
}

function sanitiseLines(items: unknown, repairs: string[]): OrderEmailLine[] {
  if (!Array.isArray(items)) { repairs.push('order lines: not a list, dropped'); return []; }
  const out: OrderEmailLine[] = [];
  for (const raw of items) {
    const line = raw as Partial<OrderEmailLine> | null;
    if (!line || typeof line.name !== 'string' || !line.name.trim() || !Number.isFinite(line.quantity) || Number(line.quantity) <= 0) {
      repairs.push('order line: missing name or non-positive quantity, dropped');
      continue;
    }
    out.push({
      name: line.name,
      variantName: line.variantName ?? null,
      extras: line.extras ?? null,
      quantity: Number(line.quantity),
      amount: typeof line.amount === 'string' ? line.amount : '',
    });
  }
  return out;
}

export function renderOrderEmail(template: string, data: OrderEmailData): { html: string; repairs: string[] } {
  const repairs: string[] = [];
  const doc = parse(template);
  const lines = sanitiseLines(data.items, repairs);

  // Item rows first: cloning changes the tree the rest of the walk sees.
  for (const container of [...walk(doc as unknown as Node)].filter(el => has(el, 'data-order-items'))) {
    const rows = [...walk(container)].filter(el => has(el, 'data-order-item'));
    if (rows.length === 0) { repairs.push('template: no data-order-item row to clone'); detachSlots(container); continue; }
    if (rows.length > 1) repairs.push('template: more than one data-order-item row, using the first');
    const model = rows[0];
    const parent: any = (model as any).parentNode;
    const modelHtml = serialize({ childNodes: [model] } as any);
    const built: Node[] = [];

    for (const line of lines) {
      const fragment = parseFragment(modelHtml);
      const row = [...walk(fragment as unknown as Node)].find(el => has(el, 'data-order-item'));
      if (!row) continue;
      for (const el of [row, ...walk(row)]) {
        if (has(el, 'data-order-item-name')) fill(el, 'data-order-item-name', line.name);
        else if (has(el, 'data-order-item-variant')) fill(el, 'data-order-item-variant', line.variantName ?? null);
        else if (has(el, 'data-order-item-extras')) fill(el, 'data-order-item-extras', line.extras ?? null);
        else if (has(el, 'data-order-item-quantity')) fill(el, 'data-order-item-quantity', `x${line.quantity}`);
        else if (has(el, 'data-order-item-amount')) fill(el, 'data-order-item-amount', line.amount || null);
      }
      detachSlots(row);
      (row as any).parentNode = parent;
      built.push(row);
    }
    parent.childNodes = parent.childNodes.flatMap((c: Node) => (c === model ? built : [c]));
    detachSlots(container);
  }

  const values: Record<string, string | null> = {
    'data-order-greeting': data.customerName ? `Hola ${data.customerName},` : 'Hola,',
    'data-order-id': `Orden: ${data.orderId}`,
    'data-order-total': `Total: ${data.total}`,
    'data-order-original-total': data.originalTotal,
    'data-order-tracking': data.trackingUrl,
    'data-order-subscription': data.subscription,
    'data-order-appointment-name': data.appointment?.name ?? null,
    'data-order-appointment-date': data.appointment?.date ?? null,
    'data-store-name': data.storeName,
    'data-store-logo': data.logoUrl,
  };

  for (const el of [...walk(doc as unknown as Node)]) {
    for (const [slot, value] of Object.entries(values)) if (has(el, slot)) { fill(el, slot, value); break; }
  }

  let html = serialize(doc as any);
  if (Buffer.byteLength(html, 'utf8') > ORDER_EMAIL_RENDER_MAX_BYTES) {
    repairs.push(`render: clamped to ${ORDER_EMAIL_RENDER_MAX_BYTES} bytes`);
    html = Buffer.from(html, 'utf8').subarray(0, ORDER_EMAIL_RENDER_MAX_BYTES).toString('utf8') + '</body></html>';
  }
  return { html, repairs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/order-emails/order-email-render.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/order-emails/order-email-render.ts apps/api/src/order-emails/order-email-render.spec.ts
git commit -m "feat(order-email): the renderer fills the slots and escapes every value by construction"
```

---

### Task 3: The email-safe validator

**Files:**
- Create: `apps/api/src/storefront-source/source-email-html.ts`
- Test: `apps/api/src/storefront-source/source-email-html.spec.ts`
- Modify: `apps/api/package.json` (add `juice`)

**Interfaces:**
- Consumes: `ORDER_EMAIL_MAX_BYTES`, `ORDER_EMAIL_REQUIRED_SLOTS`, `ORDER_EMAIL_TEMPLATE_PATH` from Task 1.
- Produces: `validateOrderEmailHtml(input: string, path?: string): { html: string; repairs: string[]; usable: boolean }`.

- [ ] **Step 1: Install juice**

```bash
cd apps/api && npm install juice
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/storefront-source/source-email-html.spec.ts
import { validateOrderEmailHtml } from './source-email-html';

const wrap = (inner: string) =>
  `<!doctype html><html><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p>${inner}</body></html>`;

describe('order email validator', () => {
  it('strips a script and reports it, without throwing', () => {
    const { html, repairs, usable } = validateOrderEmailHtml(wrap('<script>alert(1)</script>'));
    expect(html).not.toContain('<script');
    expect(repairs.join(' ')).toContain('script');
    expect(usable).toBe(true);
  });

  it.each(['iframe', 'form', 'input', 'object', 'embed'])('drops a %s element', tag => {
    expect(validateOrderEmailHtml(wrap(`<${tag}></${tag}>`)).html).not.toContain(`<${tag}`);
  });

  it('drops event handlers and javascript: urls', () => {
    const { html } = validateOrderEmailHtml(wrap('<a href="javascript:alert(1)" onclick="x()">hola</a>'));
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });

  it('strips flex, grid and position declarations but keeps colour', () => {
    const { html } = validateOrderEmailHtml(wrap('<div style="display:flex;position:fixed;color:#111;background:#fff">x</div>'));
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('position:fixed');
    expect(html).toContain('color');
  });

  it('drops external stylesheets', () => {
    expect(validateOrderEmailHtml(wrap('<link rel="stylesheet" href="https://cdn.example/x.css">')).html).not.toContain('stylesheet');
  });

  it('inlines a style block onto the element', () => {
    const { html } = validateOrderEmailHtml(
      `<!doctype html><html><head><style>.t{color:#b3261e}</style></head><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p><p class="t">x</p></body></html>`,
    );
    expect(html).toMatch(/style="[^"]*color/);
  });

  // The truthfulness guarantee, both halves.
  it('rejects a literal amount inside the order summary but keeps one in the footer', () => {
    const inside = `<!doctype html><html><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total>Bs 120</p></body></html>`;
    expect(validateOrderEmailHtml(inside).repairs.join(' ')).toContain('amount');

    const footer = wrap('<p>Envíos gratis desde Bs 300</p>');
    const { html, repairs } = validateOrderEmailHtml(footer);
    expect(html).toContain('Envíos gratis desde Bs 300');
    expect(repairs.join(' ')).not.toContain('amount');
  });

  it('marks a template missing a required slot as unusable', () => {
    expect(validateOrderEmailHtml('<!doctype html><html><body><p>hola</p></body></html>').usable).toBe(false);
  });

  // Gmail inverts colours in dark mode; a foreground with no background becomes unreadable.
  it('gives an element that sets a colour an explicit background too', () => {
    const { html, repairs } = validateOrderEmailHtml(wrap('<p style="color:#111">x</p>'));
    expect(html).toMatch(/style="[^"]*background/);
    expect(repairs.join(' ')).toContain('background');
  });

  it('leaves an element that already pairs them alone', () => {
    expect(validateOrderEmailHtml(wrap('<p style="color:#111;background:#fff">x</p>')).repairs.join(' ')).not.toContain('background');
  });

  it('clamps an oversized document', () => {
    const { html, repairs } = validateOrderEmailHtml(wrap(`<p>${'x'.repeat(200 * 1024)}</p>`));
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(80 * 1024);
    expect(repairs.join(' ')).toContain('clamped');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-email-html.spec.ts`
Expected: FAIL — `Cannot find module './source-email-html'`

- [ ] **Step 4: Write the validator**

```ts
// apps/api/src/storefront-source/source-email-html.ts
import juice from 'juice';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { ORDER_EMAIL_MAX_BYTES, ORDER_EMAIL_REQUIRED_SLOTS, ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];

/** Email clients render a narrow vocabulary; everything else is removed rather than trusted. */
const ALLOWED = new Set(['html', 'head', 'meta', 'title', 'body', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'a', 'p', 'h1', 'h2', 'h3', 'span', 'strong', 'em', 'b', 'i', 'img', 'div', 'ul', 'ol', 'li', 'br', 'hr', 'center']);
const BANNED_DECLS = /(?:^|;)\s*(?:display\s*:\s*(?:flex|grid|inline-flex|inline-grid)|position\s*:\s*[a-z]+)\s*(?=;|$)/gi;
/** A currency amount: Bs / BOB / USD / $ followed by a digit. */
const LITERAL_AMOUNT = /\b(?:Bs|BOB|USD|\$)\s?\d/;

const isElement = (node: Node): node is Element => 'tagName' in node;
const children = (node: Node): Node[] => ('childNodes' in node ? (node.childNodes as Node[]) : []);
function* walk(node: Node): Generator<Element> {
  for (const child of children(node)) if (isElement(child)) { yield child; yield* walk(child); }
}
const has = (el: Element, name: string) => el.attrs.some(a => a.name === name);
function remove(el: Element) {
  const parent: any = (el as any).parentNode;
  if (parent) parent.childNodes = parent.childNodes.filter((c: Node) => c !== el);
}
const textOf = (el: Element): string =>
  children(el).map(c => (isElement(c) ? textOf(c) : ((c as any).value ?? ''))).join('');

/**
 * Validated authored email. Like `validateStoreKitCss`, this never throws on content:
 * violations are stripped, clamped or dropped, and reported.
 */
export function validateOrderEmailHtml(input: string, path = ORDER_EMAIL_TEMPLATE_PATH): { html: string; repairs: string[]; usable: boolean } {
  const repairs: string[] = [];
  let source = input;
  try { source = juice(input, { removeStyleTags: true, preserveMediaQueries: true }); }
  catch { repairs.push(`${path}: style block could not be inlined, dropped`); }

  const doc = parse(source);

  for (const el of [...walk(doc as unknown as Node)]) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED.has(tag)) { remove(el); repairs.push(`${path}: <${tag}> removed`); continue; }
    el.attrs = el.attrs.filter(a => {
      if (/^on/i.test(a.name)) { repairs.push(`${path}: ${a.name} handler removed`); return false; }
      if ((a.name === 'href' || a.name === 'src') && /^\s*(javascript|vbscript|data):/i.test(a.value)) {
        repairs.push(`${path}: unsafe ${a.name} removed`); return false;
      }
      return true;
    });
    const style = el.attrs.find(a => a.name === 'style');
    if (style) {
      BANNED_DECLS.lastIndex = 0;
      if (BANNED_DECLS.test(style.value)) {
        BANNED_DECLS.lastIndex = 0;
        style.value = style.value.replace(BANNED_DECLS, '').replace(/^;+|;+$/g, '');
        repairs.push(`${path}: layout declaration removed`);
      }
      // Gmail inverts an unpaired colour in dark mode until it is unreadable.
      if (/(?:^|;)\s*color\s*:/i.test(style.value) && !/background(?:-color)?\s*:/i.test(style.value)) {
        style.value = `${style.value.replace(/;+$/, '')};background:#ffffff`;
        repairs.push(`${path}: background added beside an unpaired colour`);
      }
    }
  }

  // Truthfulness: no literal amount where an order fact belongs. Static copy elsewhere is fine.
  for (const el of [...walk(doc as unknown as Node)]) {
    if (!has(el, 'data-order-items') && !has(el, 'data-order-total')) continue;
    if (!LITERAL_AMOUNT.test(textOf(el))) continue;
    repairs.push(`${path}: literal amount inside the order summary removed; the platform fills it`);
    for (const node of children(el)) if (!isElement(node)) (node as any).value = '';
  }

  let html = serialize(doc as any);
  if (Buffer.byteLength(html, 'utf8') > ORDER_EMAIL_MAX_BYTES) {
    repairs.push(`${path}: clamped to ${ORDER_EMAIL_MAX_BYTES} bytes`);
    html = Buffer.from(html, 'utf8').subarray(0, ORDER_EMAIL_MAX_BYTES).toString('utf8') + '</body></html>';
  }
  const usable = ORDER_EMAIL_REQUIRED_SLOTS.every(slot => html.includes(slot));
  return { html, repairs, usable };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-email-html.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/storefront-source/source-email-html.ts apps/api/src/storefront-source/source-email-html.spec.ts
git commit -m "feat(order-email): an email-safe validator that strips, clamps and reports rather than throwing"
```

---

### Task 4: Let the generator write the template

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:139`
- Test: `apps/api/src/storefront-source/source-generation.service.spec.ts`

**Interfaces:**
- Consumes: `ORDER_EMAIL_TEMPLATE_PATH` (Task 1), `validateOrderEmailHtml` (Task 3).
- Produces: generated projects may contain a validated `emails/order-confirmation.html`.

- [ ] **Step 1: Write the failing test**

Add to `source-generation.service.spec.ts`, using the spec's existing save helper:

```ts
it('accepts the authored order confirmation email and validates it on the way in', async () => {
  const saved = await saveGenerated([{
    path: 'emails/order-confirmation.html',
    content: '<!doctype html><html><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p><script>alert(1)</script></body></html>',
  }]);
  const email = saved.find((f: any) => f.path === 'emails/order-confirmation.html');
  expect(email).toBeDefined();
  expect(email.content).not.toContain('<script');
});

it('still rejects a path outside the allowlist', async () => {
  await expect(saveGenerated([{ path: 'emails/evil.sh', content: 'x' }])).rejects.toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-generation.service.spec.ts -t "authored order confirmation"`
Expected: FAIL — "La generación intentó cambiar un archivo reservado."

- [ ] **Step 3: Extend the allowlist and validate**

At line 139, add `|| file.path === ORDER_EMAIL_TEMPLATE_PATH` to the accepted-path condition. Then, where `applySourceKitCss` already runs over the returned files, run `validateOrderEmailHtml` over that file's content, replace it with the validated form, and append its `repairs` to the generation's `autoRepairs` exactly as the CSS path does.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/source-generation.service.spec.ts`
Expected: PASS except the pre-existing failure. Confirm the only failure is named `dna: fingerprint … was used by a recent store`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation.service.spec.ts
git commit -m "feat(order-email): the generator may write emails/order-confirmation.html, validated on the way in"
```

---

### Task 5: Choosing and rendering a store's email

**Files:**
- Create: `apps/api/src/order-emails/order-email.service.ts`
- Create: `apps/api/src/order-emails/order-email.module.ts`
- Test: `apps/api/src/order-emails/order-email.service.spec.ts`

**Interfaces:**
- Consumes: `renderOrderEmail`, `OrderEmailData` (Task 2), `validateOrderEmailHtml` (Task 3), `ORDER_EMAIL_TEMPLATE_PATH` (Task 1), `kitPath` from `@pagosya/storefront-kit`, `PrismaService`.
- Produces: `OrderEmailService.renderForStore(storeId: string | null, data: OrderEmailData): Promise<{ html: string; repairs: string[] }>`, `OrderEmailService.sampleData(storeName: string): OrderEmailData`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/order-emails/order-email.service.spec.ts
describe('OrderEmailService', () => {
  it('uses the floor when the store has no authored template', async () => {
    const { html } = await service.renderForStore(null, sample);
    expect(html).toContain('Gracias por tu compra');
  });

  it('uses the authored template when the store has a usable one', async () => {
    prisma.storeSourceVersion.findFirst.mockResolvedValue({ snapshot: { files: [{ path: 'emails/order-confirmation.html', content: authored }] } });
    const { html } = await service.renderForStore('store_1', sample);
    expect(html).toContain('MARCA DE PRUEBA');
  });

  it('falls back to the floor when the authored template lacks a required slot', async () => {
    prisma.storeSourceVersion.findFirst.mockResolvedValue({ snapshot: { files: [{ path: 'emails/order-confirmation.html', content: '<html><body>nada</body></html>' }] } });
    const { html, repairs } = await service.renderForStore('store_1', sample);
    expect(html).toContain('Gracias por tu compra');
    expect(repairs.join(' ')).toContain('floor');
  });

  // Review Focus 4 — a logo that is not https must not be rendered.
  it.each(['data:image/png;base64,AAA', 'javascript:alert(1)', 'http://insecure.example/l.png'])('drops a %s logo', async logoUrl => {
    const { html } = await service.renderForStore(null, { ...sample, logoUrl });
    expect(html).not.toContain(logoUrl);
  });

  it('keeps an https logo', async () => {
    const { html } = await service.renderForStore(null, { ...sample, logoUrl: 'https://cdn.example/l.png' });
    expect(html).toContain('https://cdn.example/l.png');
  });

  it('resolves brand tokens to literal values, never leaving a custom property', async () => {
    const { html } = await service.renderForStore('store_1', sample);
    expect(html).not.toContain('var(--brand');
  });

  it('never rejects — a thrown lookup still yields the floor', async () => {
    prisma.storeSourceVersion.findFirst.mockRejectedValue(new Error('db down'));
    await expect(service.renderForStore('store_1', sample)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/order-emails/order-email.service.spec.ts`
Expected: FAIL — `Cannot find module './order-email.service'`

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/order-emails/order-email.service.ts
@Injectable()
export class OrderEmailService {
  constructor(private readonly prisma: PrismaService) {}

  /** Email clients do not support custom properties, so every token becomes a literal. */
  private resolveTokens(html: string, confirmed: Array<{ name: string; value: string }>): string {
    let out = html;
    for (const { name, value } of confirmed) out = out.split(`var(--${name})`).join(value);
    // Anything still unresolved falls back to its own declared fallback, or disappears.
    return out.replace(/var\(\s*--[\w-]+\s*(?:,\s*([^()]*?)\s*)?\)/g, (_, fallback) => fallback ?? '');
  }

  /** A logo is only ever fetched over https; anything else is dropped rather than rendered. */
  private safeLogo(url: string | null, repairs: string[]): string | null {
    if (!url) return null;
    try {
      if (new URL(url).protocol === 'https:') return url;
    } catch { /* not a URL at all */ }
    repairs.push('logo: not an https url, dropped');
    return null;
  }

  private async floor(): Promise<string> {
    return readFile(kitPath('emails', 'order-confirmation.html'), 'utf8');
  }

  async renderForStore(storeId: string | null, data: OrderEmailData): Promise<{ html: string; repairs: string[] }> {
    const repairs: string[] = [];
    let template: string | null = null;
    try {
      if (storeId) {
        const version = await this.prisma.storeSourceVersion.findFirst({
          where: { storeId }, orderBy: { revision: 'desc' }, select: { snapshot: true },
        });
        const files = (version?.snapshot as { files?: Array<{ path: string; content: string }> } | null)?.files ?? [];
        const authored = files.find(f => f.path === ORDER_EMAIL_TEMPLATE_PATH)?.content;
        if (authored) {
          const checked = validateOrderEmailHtml(authored);
          repairs.push(...checked.repairs);
          if (checked.usable) template = checked.html;
          else repairs.push('floor: authored template unusable, using the kit template');
        }
        if (template) {
          const brand = await this.prisma.storeBrandProfile.findUnique({ where: { storeId }, select: { data: true } });
          const confirmed = (brand?.data as { confirmed?: Array<{ name: string; value: string }> } | null)?.confirmed ?? [];
          template = this.resolveTokens(template, confirmed);
        }
      }
    } catch (err) {
      // The caller is a payment confirmation. Nothing here may become its problem.
      repairs.push(`floor: ${(err as Error).message}`);
      template = null;
    }

    const html = template ?? (await this.floor());
    const rendered = renderOrderEmail(html, { ...data, logoUrl: this.safeLogo(data.logoUrl, repairs) });
    return { html: rendered.html, repairs: [...repairs, ...rendered.repairs] };
  }

  /** A fixed synthetic order for the preview, populating every slot the merchant can style. */
  sampleData(storeName: string): OrderEmailData {
    return {
      storeName, logoUrl: null, customerName: 'Ana', orderId: 'pi_SYNTH001',
      items: [
        { name: 'Café de altura, grano entero', variantName: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00' },
        { name: 'Taza de cerámica', variantName: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00' },
      ],
      total: 'Bs 150,00', originalTotal: null,
      trackingUrl: 'https://example.test/track/sample',
      subscription: 'Tu suscripción se renueva cada mes. Te enviamos un enlace para pagar antes de cada entrega.',
      appointment: null,
    };
  }
}
```

Note `safeLogo` runs on the floor path too, which is what makes Review Focus 4 pass for a store with no authored template.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/order-emails/order-email.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/order-emails/order-email.service.ts apps/api/src/order-emails/order-email.module.ts apps/api/src/order-emails/order-email.service.spec.ts
git commit -m "feat(order-email): choose the authored template when it is usable, the kit floor otherwise"
```

---

### Task 6: Send it

**Files:**
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts:794-836`
- Test: `apps/api/src/payment-intents/payment-intents.service.spec.ts`

**Interfaces:**
- Consumes: `OrderEmailService.renderForStore` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
it('sends the HTML confirmation alongside the unchanged text body', async () => {
  await confirmAnOrder();
  const sent = email.send.mock.calls[0][0];
  expect(sent.html).toContain('pi_');          // a filled order id, not a slot attribute
  expect(sent.body).toBe(expectedTextBody);    // byte-identical to today
});

it('still sends the text receipt when rendering the HTML throws', async () => {
  orderEmail.renderForStore.mockRejectedValue(new Error('boom'));
  await confirmAnOrder();
  const sent = email.send.mock.calls[0][0];
  expect(sent.body).toBe(expectedTextBody);
  expect(sent.html).toBeUndefined();
});
```

Capture `expectedTextBody` from the current implementation before changing anything, so the assertion pins today's string rather than a re-derived one.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/payment-intents/payment-intents.service.spec.ts -t "HTML confirmation"`
Expected: FAIL — `sent.html` is `undefined`

- [ ] **Step 3: Wire it in**

Inside the existing `try` of `sendReceiptEmail()`, after `order` resolves, build `OrderEmailData` from values already computed there — `cart`, `lineCurrency`, `invoiceAmount`, the tracking URL inside `trackingLine`, `subscriptionBlock`, `appointment` — and call `renderForStore(order?.storeId ?? null, data)` inside its own `try/catch` yielding `undefined` on failure. Pass the result as `html`. **Do not touch the `body` string.**

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/payment-intents/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payment-intents/
git commit -m "feat(order-email): the buyer's receipt carries the store's own HTML, and the text body is untouched"
```

---

### Task 7: Teach the generator to author it

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (prompt array, near line 519)
- Test: `apps/api/src/storefront-source/source-generation.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('asks the generator for the confirmation email and forbids writing an amount', () => {
  const prompt = buildPromptForTest();
  expect(prompt).toContain('emails/order-confirmation.html');
  expect(prompt).toContain('data-order-total');
  expect(prompt).toContain('nunca escribas un monto');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-generation.service.spec.ts -t "confirmation email"`
Expected: FAIL

- [ ] **Step 3: Add the instruction**

Add one paragraph to the prompt array, in the voice of its neighbours:

> "Also author `emails/order-confirmation.html`: the email the buyer receives after paying, in this store's own typography and palette. Use table layout and inline styles only — email clients drop flexbox, grid and custom properties. Mark the order facts with `data-order-greeting`, `data-order-id`, `data-order-items` (containing exactly one `data-order-item` row with `data-order-item-name`, `-variant`, `-extras`, `-quantity` and `-amount`), `data-order-total`, `data-order-original-total`, `data-order-tracking` on a link, `data-order-subscription`, `data-store-name`, and `data-store-logo` on an image. The platform fills every one of them from the real order: nunca escribas un monto, un total ni un número de orden, and never imply an automatic charge. An element whose value is absent is removed entirely, so put its label inside the marked element."

**Do not add this to `design-engine/sep5-author.ts`.** `sep5-author.spec.ts` pins that text byte for byte against `sep5-prompt.26f889c8.txt`; a Sep-5 authored store gets the floor instead.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/`
Expected: the new test PASSes and `sep5-author.spec.ts` stays at 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation.service.spec.ts
git commit -m "feat(order-email): the generator authors the confirmation email in the store's own voice"
```

---

### Task 8: Preview in the dashboard

**Files:**
- Create: `apps/api/src/order-emails/order-email.controller.ts`
- Create: `apps/merchant-dashboard/src/order-email-panel.mjs`
- Test: `apps/api/src/order-emails/order-email.controller.spec.ts`, `apps/merchant-dashboard/tests/order-email-panel.spec.mjs`

**Interfaces:**
- Consumes: `OrderEmailService.renderForStore`, `OrderEmailService.sampleData` (Task 5).
- Produces: `GET v1/stores/:storeId/source-project/order-email/preview`, `POST v1/stores/:storeId/source-project/order-email/test-send`.

The route sits under `v1/stores/:storeId/source-project`, matching `sketch-studio.controller.ts` and `source-assets.controller.ts`, rather than the `/stores/:id/emails/…` shape sketched in the spec. Follow the codebase.

- [ ] **Step 1: Write the failing controller test**

```ts
it('renders a preview against sample data behind the merchant guard', async () => {
  const res = await request(app.getHttpServer()).get('/v1/stores/store_1/source-project/order-email/preview').set(authHeader);
  expect(res.status).toBe(200);
  expect(res.body.html).toContain('Orden:');
});

it('refuses an unauthenticated preview', async () => {
  const res = await request(app.getHttpServer()).get('/v1/stores/store_1/source-project/order-email/preview');
  expect(res.status).toBe(401);
});

it("sends a test only to the merchant's own address", async () => {
  await request(app.getHttpServer()).post('/v1/stores/store_1/source-project/order-email/test-send').set(authHeader).expect(201);
  expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: merchantEmail }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/order-emails/order-email.controller.spec.ts`
Expected: FAIL — `Cannot find module './order-email.controller'`

- [ ] **Step 3: Write the controller**

```ts
@UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
@Controller('v1/stores/:storeId/source-project')
export class OrderEmailController {
  constructor(
    private readonly orderEmail: OrderEmailService,
    private readonly stores: StoresService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  @Get('order-email/preview')
  async preview(@Param('storeId') storeId: string) {
    const store = await this.stores.byId(storeId);
    const { html, repairs } = await this.orderEmail.renderForStore(storeId, this.orderEmail.sampleData(store.name));
    return { html, repairs };
  }

  @Post('order-email/test-send')
  async testSend(@Param('storeId') storeId: string, @Req() req: MerchantRequest) {
    const store = await this.stores.byId(storeId);
    const { html } = await this.orderEmail.renderForStore(storeId, this.orderEmail.sampleData(store.name));
    await this.email.send({ to: req.merchant.email, subject: `Prueba · Recibo de tu compra en ${store.name}`, body: 'Vista previa del correo de confirmación.', html });
    return { sent: true };
  }
}
```

The test-send address comes from the authenticated merchant record, never from the request body.

- [ ] **Step 4: Write the panel**

`order-email-panel.mjs`, following `subscriptions-panel.mjs`: fetch the preview, render it into a sandboxed `<iframe srcdoc>` at 390 px and 640 px side by side, show any `repairs` as a muted list, and wire a "Enviar una prueba" button to test-send.

- [ ] **Step 5: Run all tests**

Run: `cd apps/api && npx jest src/order-emails/` then `cd apps/merchant-dashboard && npm run test:e2e -- tests/order-email-panel.spec.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/order-emails/ apps/merchant-dashboard/src/order-email-panel.mjs apps/merchant-dashboard/tests/order-email-panel.spec.mjs
git commit -m "feat(order-email): the merchant previews the buyer's email and can send themselves a copy"
```

---

## Final verification

- [ ] `cd apps/api && npx tsc --noEmit -p tsconfig.json` — clean
- [ ] `cd apps/api && npx jest src/order-emails src/storefront-source src/payment-intents` — only the pre-existing DNA-fingerprint failure
- [ ] `cd apps/merchant-studio && npm run test:e2e -- tests/product-page-kit.spec.ts` — only the pre-existing dense-above-the-fold failure
- [ ] `node packages/storefront-kit/kit/check-runtimes.mjs` — runtimes parse
- [ ] Open the preview panel and read the email at phone width against a real store's brand.
