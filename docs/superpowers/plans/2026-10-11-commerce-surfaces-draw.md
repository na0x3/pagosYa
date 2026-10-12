# Commerce surfaces drawn per store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each style card also draws the store's account layout, checkout layout, field style and cart path, and the built store carries them, so sign-up, checkout and the way there stop looking the same in every store.

**Architecture:** A new pure module `design-engine/commerce-draw.ts` owns the catalogue, the calm/bold narrowing, the draw, the parse and the labels. `styleDraws` draws one commerce set per slot after the frames and writes it into the slot's `frame-draw.json`, so history (built stores and shown cards) and later edits read it through `parseFrameDraw`. The build turns it into runtime DNA (`cart`, `added`, `review`, `checkout`, `fields`), `config.accountTheme`, `config.checkoutPhoto` and `config.cartWord`. `commerce.js` adds CSS keyed on `data-dna-checkout` / `data-dna-fields`, puts the account submit in `KIT_BUTTONS`, and uses the cart word.

**Tech Stack:** NestJS API (TypeScript, Jest), storefront kit runtime `packages/storefront-kit/kit/commerce.js` (plain JS, tested through jsdom in `apps/api`), Merchant Studio (`apps/merchant-studio`).

**Spec:** `docs/superpowers/specs/2026-10-11-commerce-surfaces-draw-design.md`

## Global Constraints

- Everything rides on the style draw, which only runs with `YAPI_STYLE_PICK=1`. Runs without it, and stores without the new draw keys, are byte-identical to today.
- Payment flow, account security and collected data are unchanged: presentation only. No new checkout fields, steps or copy voice.
- Runtime styles read only existing `--store-*`, `--brand-*`, `--ui-*` and `--kit-*` tokens. No new colours.
- Contrast and 44px tap targets hold in every combination; nothing overflows at 320px.
- `checkout` and `fields` are NOT added to `SOURCE_DNA_ENUMS` (that would reach the planner schema and the seeded DNA of every existing store). They live in their own runtime table on both sides, pinned by a test.
- Option ids: account `card|split|minimal|panel`; checkout `columns|steps|ticket|brand`; fields `boxed|underline|filled|pill`; cart surface `drawer|sheet|page|overlay`; added `toast|ribbon|bubble|inline|stamp`.
- Cart words: café `Tu pedido`, bakery `Tu caja`, clothing `Tu bolsa`, beauty `Tu neceser`, flowers `Tu ramo`, crafts `Tu selección`, fitness `Tu plan`, services `Tu solicitud`, general `Tu carrito`.
- Do not edit `apps/api` while a YAPI chat job is RUNNING (nest --watch restarts and interrupts it). Check first.
- Subagents never run prisma migrate/diff/reset. This plan needs no migration.

## Design decisions made while planning (deviations from the spec text)

1. **The checkout layout also sets `dna.review`.** The runtime already has four review arrangements keyed on `data-dna-review` (`split`, `stacked`, `ticket`, `notebook`). Drawing a checkout layout on top of an independent review value would fight it. The drawn checkout sets the review value it builds on (`columns→split`, `steps→stacked`, `ticket→ticket`, `brand→split`) and `data-dna-checkout` adds only what review lacks: numbered steps, the brand panel, the ticket edge.
2. **Draw keys:** the frame already has a `cart` part (the header's cart button look), so the cart surface is saved as `cartSurface`; the others are `account`, `checkout`, `fields`, `added`.
3. **Account theme precedence:** YAPI's own `set_account_theme` this run wins; then a freshly drawn account (style pick); then what the store already had. A kept draw (ordinary edit) never sets the account theme, so an edit never drops CSS the agent wrote earlier.
4. **Photo:** `split` account and `brand` checkout use the first store photo (same filter `frameInputs` uses for "photos": a display image that is not the logo, not a reference). None → split without media, brand panel in an accent mix.

## Review Focus

1. A pick build from a proposal saved BEFORE this change (slots without `commerce`): must build exactly as today, no `checkout`/`fields`/`cartWord` keys.
2. An ordinary chat edit on a style-picked store: the saved commerce values and the agent's account CSS survive.
3. `config.checkoutPhoto` or `config.cartWord` carrying odd text (quotes, `)`, markup, very long): the runtime must not break out of the CSS `url()` or render more than a short plain label.
4. A store whose playbook kind is missing or unknown: no cart word, nothing else changes.
5. Phone width (320–390px) with `brand` checkout and `pill` fields: the brand panel collapses away, fields keep 44px+ height, no horizontal scroll.

---

### Task 1: The commerce draw module

**Files:**
- Create: `apps/api/src/storefront-source/design-engine/commerce-draw.ts`
- Test: `apps/api/src/storefront-source/design-engine/commerce-draw.spec.ts`

**Interfaces:**
- Produces:
  - `COMMERCE_OPTIONS` (the five option lists above, `as const`), `type CommercePart`, `type CommerceDraw`
  - `COMMERCE_LEAN: Record<'calm' | 'bold', Record<CommercePart, readonly string[]>>`
  - `drawCommerce(random, recent: Array<Partial<CommerceDraw>>, mode, spread = 1, lean = COMMERCE_LEAN[mode]): CommerceDraw`
  - `parseCommerceDraw(value: unknown): Partial<CommerceDraw>`
  - `CART_WORDS: Record<PlaybookKind, string>`; `cartWordFor(kind: unknown): string | undefined`
  - `REVIEW_FOR_CHECKOUT`, `COMMERCE_RUNTIME_ENUMS = { checkout, fields }`
  - `commerceRuntimeDna(draw): Record<string, string>` → `{ cart, added, review, checkout, fields }` for the keys present
  - `commerceSummary(draw): string` → `Cuenta: dividida · Pago: ticket · Carrito: hoja` ('' when none)

- [ ] **Step 1: Write the failing tests**

```ts
import { COMMERCE_LEAN, COMMERCE_OPTIONS, CART_WORDS, cartWordFor, commerceRuntimeDna, commerceSummary, drawCommerce, parseCommerceDraw } from './commerce-draw';
import { PLAYBOOK } from './playbook';

const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe('drawCommerce', () => {
  it('rotates every part over seeds within the mode\'s narrowing', () => {
    for (const mode of ['calm', 'bold'] as const) {
      const seen: Record<string, Set<string>> = {};
      for (let s = 0; s < 40; s++) {
        const draw = drawCommerce(seq([s / 40, (s * 7 % 40) / 40]), [], mode);
        for (const [part, id] of Object.entries(draw)) {
          expect(COMMERCE_LEAN[mode][part as keyof typeof COMMERCE_LEAN.calm]).toContain(id);
          (seen[part] ??= new Set()).add(id);
        }
      }
      for (const part of Object.keys(COMMERCE_OPTIONS)) expect(seen[part].size).toBe(COMMERCE_LEAN[mode][part as keyof typeof COMMERCE_LEAN.calm].length);
    }
  });
  it('calm leans quiet and bold leans loud, sharing no account, checkout, fields or cart surface', () => {
    expect(COMMERCE_LEAN.calm.account).toEqual(['card', 'minimal']);
    expect(COMMERCE_LEAN.bold.checkout).toEqual(['ticket', 'brand']);
    for (const part of ['account', 'checkout', 'fields', 'cartSurface'] as const) expect(COMMERCE_LEAN.calm[part].filter(id => COMMERCE_LEAN.bold[part].includes(id))).toEqual([]);
  });
  it('avoids history beyond the spread', () => {
    const recent = Array.from({ length: 3 }, () => ({ account: 'card' as const, checkout: 'columns' as const, fields: 'boxed' as const, cartSurface: 'drawer' as const, added: 'toast' as const }));
    for (let s = 0; s < 20; s++) expect(drawCommerce(seq([s / 20]), recent, 'calm', 1)).toEqual({ account: 'minimal', checkout: 'steps', fields: 'underline', cartSurface: 'page', added: 'inline' });
  });
  it('falls back to every option when a narrowing is empty', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(drawCommerce(seq([s / 40]), [], 'calm', 1, { account: [] }).account);
    expect([...seen].sort()).toEqual([...COMMERCE_OPTIONS.account].sort());
  });
});

describe('parseCommerceDraw', () => {
  it('keeps only known ids', () => {
    expect(parseCommerceDraw({ account: 'split', checkout: 'nope', fields: 'pill', cartSurface: 'sheet', added: 3, extra: 'x' })).toEqual({ account: 'split', fields: 'pill', cartSurface: 'sheet' });
    expect(parseCommerceDraw(null)).toEqual({});
  });
});

describe('cart words, runtime DNA and summary', () => {
  it('has one word per playbook kind and nothing for an unknown kind', () => {
    expect(Object.keys(CART_WORDS).sort()).toEqual(Object.keys(PLAYBOOK).sort());
    expect(cartWordFor('clothing')).toBe('Tu bolsa');
    expect(cartWordFor('flowers-gifts')).toBe('Tu ramo');
    expect(cartWordFor('nope')).toBeUndefined();
    expect(cartWordFor(undefined)).toBeUndefined();
  });
  it('maps a draw to runtime DNA, the checkout picking the review it builds on', () => {
    expect(commerceRuntimeDna({ account: 'split', checkout: 'steps', fields: 'pill', cartSurface: 'sheet', added: 'stamp' })).toEqual({ cart: 'sheet', added: 'stamp', review: 'stacked', checkout: 'steps', fields: 'pill' });
    expect(commerceRuntimeDna({ checkout: 'brand' })).toEqual({ review: 'split', checkout: 'brand' });
    expect(commerceRuntimeDna({})).toEqual({});
  });
  it('writes the preview line in Spanish', () => {
    expect(commerceSummary({ account: 'split', checkout: 'ticket', cartSurface: 'sheet' })).toBe('Cuenta: dividida · Pago: ticket · Carrito: hoja');
    expect(commerceSummary({})).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/commerce-draw.spec.ts`
Expected: FAIL, cannot find module `./commerce-draw`.

- [ ] **Step 3: Implement**

```ts
/**
 * Account, checkout and the path to them drawn per store (spec docs/superpowers/specs/2026-10-11-commerce-surfaces-draw-design.md).
 * Each style card draws these beside its header and hero; the picked card's values reach the built store. Presentation only:
 * the payment flow, account security and the data collected stay the platform's.
 */
import type { PlaybookKind } from './playbook';

export const COMMERCE_OPTIONS = {
  account: ['card', 'split', 'minimal', 'panel'],
  checkout: ['columns', 'steps', 'ticket', 'brand'],
  fields: ['boxed', 'underline', 'filled', 'pill'],
  cartSurface: ['drawer', 'sheet', 'page', 'overlay'],
  added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'],
} as const;
export type CommercePart = keyof typeof COMMERCE_OPTIONS;
export type CommerceDraw = { -readonly [P in CommercePart]: (typeof COMMERCE_OPTIONS)[P][number] };
const PARTS = Object.keys(COMMERCE_OPTIONS) as CommercePart[];

/** "Leans to": the calm card stays sober, the bold card goes loud. An empty narrowing falls back to every option. */
export const COMMERCE_LEAN: Record<'calm' | 'bold', Record<CommercePart, readonly string[]>> = {
  calm: { account: ['card', 'minimal'], checkout: ['columns', 'steps'], fields: ['boxed', 'underline'], cartSurface: ['drawer', 'page'], added: ['toast', 'inline'] },
  bold: { account: ['split', 'panel'], checkout: ['ticket', 'brand'], fields: ['filled', 'pill'], cartSurface: ['sheet', 'overlay'], added: ['ribbon', 'bubble', 'stamp'] },
};

/** Uniform among the options used at most `spread` more than the least used, like the frame draw. */
export function drawCommerce(random: () => number, recent: Array<Partial<CommerceDraw>>, mode: 'calm' | 'bold', spread = 1, lean: Partial<Record<CommercePart, readonly string[]>> = COMMERCE_LEAN[mode]): CommerceDraw {
  const draw = {} as Record<CommercePart, string>;
  for (const part of PARTS) {
    const all: readonly string[] = COMMERCE_OPTIONS[part];
    const narrowed = all.filter(id => lean[part]?.includes(id));
    const options = narrowed.length ? narrowed : all;
    const counts = options.map(id => recent.filter(item => item[part] === id).length);
    const fewest = Math.min(...counts);
    const pool = options.filter((_, i) => counts[i] <= fewest + spread);
    draw[part] = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }
  return draw as CommerceDraw;
}

export function parseCommerceDraw(value: unknown): Partial<CommerceDraw> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const part of PARTS) {
    const id = (value as Record<string, unknown>)[part];
    if (typeof id === 'string' && (COMMERCE_OPTIONS[part] as readonly string[]).includes(id)) out[part] = id;
  }
  return out as Partial<CommerceDraw>;
}

/** The cart's own word per kind of business: the cart button and the drawer title. */
export const CART_WORDS: Record<PlaybookKind, string> = {
  'cafe-food': 'Tu pedido', 'bakery-sweets': 'Tu caja', clothing: 'Tu bolsa', beauty: 'Tu neceser', 'flowers-gifts': 'Tu ramo',
  'crafts-home': 'Tu selección', 'fitness-wellness': 'Tu plan', services: 'Tu solicitud', general: 'Tu carrito',
};
export const cartWordFor = (kind: unknown): string | undefined => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(CART_WORDS, kind) ? CART_WORDS[kind as PlaybookKind] : undefined;

/** The checkout layout builds on one of the runtime's review arrangements; data-dna-checkout adds the rest. */
export const REVIEW_FOR_CHECKOUT: Record<CommerceDraw['checkout'], 'split' | 'stacked' | 'ticket'> = { columns: 'split', steps: 'stacked', ticket: 'ticket', brand: 'split' };
/** Runtime-only DNA values (never in SOURCE_DNA_ENUMS: the planner and the seed must not see them). Pinned against commerce.js. */
export const COMMERCE_RUNTIME_ENUMS = { checkout: COMMERCE_OPTIONS.checkout, fields: COMMERCE_OPTIONS.fields } as const;

export function commerceRuntimeDna(draw: Partial<CommerceDraw>): Record<string, string> {
  return {
    ...(draw.cartSurface ? { cart: draw.cartSurface } : {}),
    ...(draw.added ? { added: draw.added } : {}),
    ...(draw.checkout ? { review: REVIEW_FOR_CHECKOUT[draw.checkout], checkout: draw.checkout } : {}),
    ...(draw.fields ? { fields: draw.fields } : {}),
  };
}

const LABELS = {
  account: { card: 'tarjeta', split: 'dividida', minimal: 'mínima', panel: 'panel' },
  checkout: { columns: 'dos columnas', steps: 'por pasos', ticket: 'ticket', brand: 'con marca' },
  cartSurface: { drawer: 'lateral', sheet: 'hoja', page: 'página', overlay: 'pantalla completa' },
} as const;
/** The preview's one line: the merchant sees that the choice carries through to payment. */
export function commerceSummary(draw: Partial<CommerceDraw>): string {
  return [
    draw.account ? `Cuenta: ${LABELS.account[draw.account]}` : '',
    draw.checkout ? `Pago: ${LABELS.checkout[draw.checkout]}` : '',
    draw.cartSurface ? `Carrito: ${LABELS.cartSurface[draw.cartSurface]}` : '',
  ].filter(Boolean).join(' · ');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/commerce-draw.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/design-engine/commerce-draw.ts apps/api/src/storefront-source/design-engine/commerce-draw.spec.ts
git commit -m "feat(style-pick): commerce draw module — account, checkout, fields and cart path per card"
```

---

### Task 2: Style cards draw commerce; saved draws carry it

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/frame-draw.ts` (`parseFrameDraw`, `frameForRun` kept branch, new `storePhotoPaths`, `frameInputs` reuses it)
- Modify: `apps/api/src/storefront-source/design-engine/style-draws.ts` (`StyleSlot.commerce`, `StyleSlot.cartWord`)
- Test: `apps/api/src/storefront-source/design-engine/style-draws.spec.ts`

**Interfaces:**
- Consumes: Task 1's `drawCommerce`, `parseCommerceDraw`, `cartWordFor`, `CommerceDraw`.
- Produces:
  - `parseFrameDraw(content)` also returns the five commerce keys (validated).
  - `frameForRun(...)` result gains `commerce?: { draw: Partial<CommerceDraw>; fresh: boolean; cartWord?: string }`, set only in the NOT-fresh branch from the saved file (`fresh: false`) when the saved draw has a commerce key. Fresh ordinary runs never set it.
  - `StyleSlot.commerce?: CommerceDraw`, `StyleSlot.cartWord?: string`. The slot's `file.content` and `draw` include the commerce keys; `paragraph` gains the cart-word line.
  - `storePhotoPaths(input: { assetLegend; imageUses; logoUrl? }): string[]`.

- [ ] **Step 1: Write the failing tests** (append to `style-draws.spec.ts`, calling the file's existing input factory the way other tests do; below it is `input()`)

```ts
import { COMMERCE_LEAN } from './commerce-draw';
import { frameForRun, parseFrameDraw, FRAME_DRAW_FILE } from './frame-draw';

describe('style cards draw the commerce surfaces', () => {
  it('each slot draws its mode\'s commerce, saved in its frame-draw file and draw', () => {
    for (const slot of styleDraws(input())) {
      expect(slot.commerce).toBeDefined();
      for (const [part, id] of Object.entries(slot.commerce!)) expect(COMMERCE_LEAN[slot.mode][part as keyof typeof COMMERCE_LEAN.calm]).toContain(id);
      expect(parseFrameDraw(slot.file.content)).toMatchObject(slot.commerce!);
      expect(slot.draw).toMatchObject(slot.commerce!);
    }
  });
  it('carries the kind\'s cart word into the slot and its paragraph', () => {
    const [calm] = styleDraws({ ...input(), kind: 'clothing' });
    expect(calm.cartWord).toBe('Tu bolsa');
    expect(calm.paragraph).toContain('«Tu bolsa»');
  });
  it('avoids the commerce parts recent shown cards used', () => {
    const shown = Array.from({ length: 3 }, () => ({ kind: 'cafe-food', mode: 'calm' as const, draw: { account: 'card', checkout: 'columns', fields: 'boxed', cartSurface: 'drawer', added: 'toast' } as any }));
    for (let s = 0; s < 10; s++) {
      const [calm] = styleDraws({ ...input(), kind: 'cafe-food', shown, random: () => s / 10 });
      expect(calm.commerce).toEqual({ account: 'minimal', checkout: 'steps', fields: 'underline', cartSurface: 'page', added: 'inline' });
    }
  });
});

describe('frameForRun keeps a saved commerce draw on an edit', () => {
  const base = { enabled: true, designEnabled: true, recent: [], available: { photos: 1, products: 1, facts: true }, request: '' };
  it('returns the saved commerce, not fresh, with the kind\'s cart word', () => {
    const previous = [{ path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'stacked', kind: 'clothing', account: 'split', checkout: 'ticket', fields: 'pill', cartSurface: 'sheet', added: 'stamp' }) }];
    expect(frameForRun({ ...base, fresh: false, previous }).commerce).toEqual({ draw: { account: 'split', checkout: 'ticket', fields: 'pill', cartSurface: 'sheet', added: 'stamp' }, fresh: false, cartWord: 'Tu bolsa' });
  });
  it('returns no commerce for a saved draw without it, nor for a fresh ordinary run', () => {
    const previous = [{ path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'stacked' }) }];
    expect(frameForRun({ ...base, fresh: false, previous }).commerce).toBeUndefined();
    expect(frameForRun({ ...base, fresh: true, previous: [] }).commerce).toBeUndefined();
  });
});
```

Also: an existing test in the file that pins a slot's drawn frame for a fixed random must still pass unchanged — that is the proof commerce draws last.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/style-draws.spec.ts`
Expected: FAIL on `slot.commerce` undefined and `commerce` missing from `frameForRun`.

- [ ] **Step 3: Implement**

`frame-draw.ts`: import `{ cartWordFor, parseCommerceDraw, type CommerceDraw } from './commerce-draw'`. Widen `parseFrameDraw`'s return type with `Partial<CommerceDraw>` and before `return out;` add `Object.assign(out, parseCommerceDraw(value));`.

Widen `frameForRun`'s result type with `commerce?: { draw: Partial<CommerceDraw>; fresh: boolean; cartWord?: string }`. In the `!input.fresh` branch, after `if (!saved) return { paragraph: '' };`:

```ts
    const kept = parseFrameDraw(saved.content);
    // A small edit keeps what the picked card drew for account, checkout and the cart path (spec 2026-10-11 commerce surfaces).
    const keptCommerce = parseCommerceDraw(kept);
    const cartWord = cartWordFor(kept.kind);
    const commerce = Object.keys(keptCommerce).length ? { commerce: { draw: keptCommerce, fresh: false, ...(cartWord ? { cartWord } : {}) } } : {};
    if (!input.designEnabled) return { file: saved, paragraph: '', ...commerce };
```
(remove the later duplicate `const kept = …`) and spread `...commerce` into the branch's final return.

Add, and use in `frameInputs` (`photos: storePhotoPaths(input).length`):

```ts
/** The store's own display photos, in legend order: not the logo, not a reference or unused image. */
export function storePhotoPaths(input: { assetLegend: Array<{ original: string; path: string }>; imageUses: Array<{ url: string; role?: string }>; logoUrl?: string | null }): string[] {
  return [...new Set(input.assetLegend.filter(asset => {
    if (!DISPLAY_IMAGE.test(asset.path) || (input.logoUrl && asset.original === input.logoUrl)) return false;
    const role = input.imageUses.find(use => use.url === asset.original)?.role;
    return !role || !NOT_PHOTOS.has(role);
  }).map(asset => asset.path))];
}
```

`style-draws.ts`: import `{ cartWordFor, drawCommerce, type CommerceDraw } from './commerce-draw'`; add to `StyleSlot`:

```ts
  /** Account, checkout, fields and cart path drawn for this card (spec 2026-10-11 commerce surfaces). Saved in file and draw. */
  commerce?: CommerceDraw;
  /** The cart's word for this kind of business. */
  cartWord?: string;
```

Change `return plan.map(...)` to `const slots: StyleSlot[] = plan.map(...)`, then:

```ts
  // Commerce draws after every frame, so the header, hero and design each slot drew are unchanged by it.
  const commerceTaken: Array<Partial<CommerceDraw>> = [];
  const cartWord = cartWordFor(input.kind);
  const cartLine = cartWord ? `- Cart label: the header's cart reads «${cartWord}» followed by the count in [data-cart-count]; never another word for the cart.` : '';
  return slots.map(slot => {
    const commerce = drawCommerce(random, [...commerceTaken, ...history], slot.mode, STYLE_SPREAD);
    commerceTaken.push(commerce);
    const saved = { ...JSON.parse(slot.file.content), ...commerce };
    return { ...slot, file: { ...slot.file, content: JSON.stringify(saved, null, 2) + '\n' }, draw: { ...slot.draw, ...commerce }, commerce, ...(cartWord ? { cartWord } : {}), paragraph: [slot.paragraph, cartLine].filter(Boolean).join('\n') };
  });
```

- [ ] **Step 4: Run to verify they pass, and the neighbours stay green**

Run: `cd apps/api && npx jest src/storefront-source/design-engine src/storefront-source/source-generation-style.spec.ts src/storefront-source/source-projects.service.spec.ts`
Expected: PASS. If an existing test compares a slot's `paragraph` or `file.content` exactly, update its expectation and say so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/design-engine
git commit -m "feat(style-pick): each card draws account, checkout, fields and cart path; saved draws and edits carry them"
```

---

### Task 3: The built store carries the picked commerce draw

**Files:**
- Create: `apps/api/src/storefront-source/source-commerce-config.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (`useSlot` ~575, DNA merge ~1542, account theme ~1545, config ~1551)
- Test: `apps/api/src/storefront-source/source-commerce-config.spec.ts`, `apps/api/src/storefront-source/source-generation-style.spec.ts`

**Interfaces:**
- Consumes: `frame.commerce`, `StyleSlot.commerce` / `cartWord`, `storePhotoPaths` (Task 2), `commerceRuntimeDna` (Task 1).
- Produces: `commerceConfig(input: { commerce?: { draw; fresh; cartWord? }; photos: string[] }): { dna: Record<string,string>; accountTheme?: AccountTheme; checkoutPhoto?: string; cartWord?: string }`; in the saved `config.js`: `dna.cart/added/review/checkout/fields`, `accountTheme: { layout, photo? }`, `checkoutPhoto`, `cartWord` — none of them without a commerce draw.

- [ ] **Step 1: Write the failing tests**

`source-commerce-config.spec.ts`:
```ts
import { commerceConfig } from './source-commerce-config';

describe('commerceConfig', () => {
  const draw = { account: 'split', checkout: 'brand', fields: 'filled', cartSurface: 'sheet', added: 'ribbon' } as const;
  const dna = { cart: 'sheet', added: 'ribbon', review: 'split', checkout: 'brand', fields: 'filled' };
  it('a fresh draw sets the account layout with the first store photo, the brand checkout photo and the word', () => {
    expect(commerceConfig({ commerce: { draw, fresh: true, cartWord: 'Tu caja' }, photos: ['assets/a.jpg', 'assets/b.jpg'] }))
      .toEqual({ dna, accountTheme: { layout: 'split', photo: 'assets/a.jpg' }, checkoutPhoto: 'assets/a.jpg', cartWord: 'Tu caja' });
  });
  it('without photos: split has no media and brand has no photo', () => {
    expect(commerceConfig({ commerce: { draw, fresh: true }, photos: [] })).toEqual({ dna, accountTheme: { layout: 'split' } });
  });
  it('a kept draw never sets an account theme (the store\'s saved one carries over)', () => {
    expect(commerceConfig({ commerce: { draw, fresh: false }, photos: ['assets/a.jpg'] }).accountTheme).toBeUndefined();
  });
  it('nothing without a commerce draw', () => {
    expect(commerceConfig({ commerce: undefined, photos: ['assets/a.jpg'] })).toEqual({ dna: {} });
  });
});
```

`source-generation-style.spec.ts`, inside `describe('style proposal mode')` next to "builds the picked card":
```ts
  const savedConfig = () => JSON.parse(savedFiles().find(f => f.path === 'config.js')!.content.match(/window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);

  it('carries the picked card\'s account, checkout, fields and cart path into config.js', async () => {
    const proposal = savedProposal();
    proposal.slots[1].commerce = { account: 'panel', checkout: 'ticket', fields: 'pill', cartSurface: 'overlay', added: 'stamp' };
    proposal.slots[1].cartWord = 'Tu pedido';
    await service.generate('m1', 's1', proposal.request.dto, budget, [], progress, { style: { proposal, index: 1 } });
    const config = savedConfig();
    expect(config.dna).toMatchObject({ cart: 'overlay', added: 'stamp', review: 'ticket', checkout: 'ticket', fields: 'pill' });
    expect(config.accountTheme).toEqual({ layout: 'panel' });
    expect(config.cartWord).toBe('Tu pedido');
    expect(config.checkoutPhoto).toBeUndefined();
  });

  it('builds a pick from a proposal saved before commerce draws exactly as before', async () => {
    const proposal = savedProposal();
    for (const slot of proposal.slots) { delete slot.commerce; delete slot.cartWord; }
    await service.generate('m1', 's1', proposal.request.dto, budget, [], progress, { style: { proposal, index: 0 } });
    const config = savedConfig();
    expect([config.dna.checkout, config.dna.fields, 'cartWord' in config, 'accountTheme' in config]).toEqual([undefined, undefined, false, false]);
  });
```
(`savedProposal()` builds the proposal through `styleDraws`, so its slots already carry commerce after Task 2 — the second test deletes them on purpose.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-config.spec.ts src/storefront-source/source-generation-style.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`source-commerce-config.ts`:
```ts
import { commerceRuntimeDna, type CommerceDraw } from './design-engine/commerce-draw';
import type { AccountTheme } from './account-theme';

/** What a commerce draw adds to config.js (spec 2026-10-11 commerce surfaces). A kept draw (an ordinary edit) re-applies the DNA
 *  and the word but never the account theme: the store's saved theme, possibly with YAPI's CSS, carries over instead. */
export function commerceConfig(input: { commerce?: { draw: Partial<CommerceDraw>; fresh: boolean; cartWord?: string }; photos: string[] }): { dna: Record<string, string>; accountTheme?: AccountTheme; checkoutPhoto?: string; cartWord?: string } {
  const commerce = input.commerce;
  if (!commerce) return { dna: {} };
  const photo = input.photos[0];
  const { account, checkout } = commerce.draw;
  return {
    dna: commerceRuntimeDna(commerce.draw),
    ...(commerce.fresh && account ? { accountTheme: { layout: account, ...(account === 'split' && photo ? { photo } : {}) } } : {}),
    ...(checkout === 'brand' && photo ? { checkoutPhoto: photo } : {}),
    ...(commerce.cartWord ? { cartWord: commerce.cartWord } : {}),
  };
}
```

`source-generation.service.ts`:
- import `commerceConfig` and `storePhotoPaths`.
- `useSlot`: add `...(slot.commerce ? { commerce: { draw: slot.commerce, fresh: true, ...(slot.cartWord ? { cartWord: slot.cartWord } : {}) } } : {})` to the `frame = { … }` object.
- Before the `dna` line: `const drawnCommerce = commerceConfig({ commerce: frame.commerce, photos: storePhotoPaths({ assetLegend, imageUses, logoUrl: <the same logoUrl frameInputs gets> }) });` with a one-line comment. Read how `frameInputs` is called earlier in `generate` and pass the same values.
- `dna`: append `...drawnCommerce.dna` after `...(frame.dna ?? {})`.
- `const accountTheme = agentAccountTheme ?? drawnCommerce.accountTheme ?? normalizeAccountTheme(previousConfig.accountTheme);`
- `config`: after `...(accountTheme ? { accountTheme } : {})` add `...(drawnCommerce.checkoutPhoto ? { checkoutPhoto: drawnCommerce.checkoutPhoto } : {}), ...(drawnCommerce.cartWord ? { cartWord: drawnCommerce.cartWord } : {})`.
- `KEPT_DNA`: append `'added', 'checkout', 'fields'`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-config.spec.ts src/storefront-source/source-generation`
Expected: PASS, including the older generation specs.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-commerce-config.ts apps/api/src/storefront-source/source-commerce-config.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-style.spec.ts
git commit -m "feat(style-pick): the picked card's account layout, checkout, fields, cart path and cart word reach config.js"
```

---

### Task 4: Runtime — checkout layouts, field styles, account submit, cart word

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-surfaces-draw.spec.ts` (new; copy the `boot()` harness, `DNA` and `afterEach` from `source-commerce-surfaces.spec.ts` lines 1–40)

**Interfaces:**
- Consumes: `config.dna.checkout`, `config.dna.fields`, `config.checkoutPhoto`, `config.cartWord`; `COMMERCE_RUNTIME_ENUMS` for the pin test.
- Produces: `<html data-dna-checkout=… data-dna-fields=…>`; `<style data-pagosya-kit="commerce-draw">` only when either attribute is set; `--checkout-panel` on `<html>` for a valid `checkoutPhoto`.

- [ ] **Step 1: Write the failing tests**

```ts
// harness copied from source-commerce-surfaces.spec.ts (imports, JSDOM, commerce, boot, DNA, afterEach)
import { COMMERCE_RUNTIME_ENUMS } from './design-engine/commerce-draw';
const COMMERCE_DNA: Record<string, string[]> = runInNewContext(`(${commerce.match(/const COMMERCE_DNA = (\{[\s\S]*?\});/)![1]})`);
const drawCss = (doc: any) => doc.querySelector('style[data-pagosya-kit="commerce-draw"]')?.textContent ?? '';

describe('commerce surfaces drawn per store (runtime)', () => {
  it('pins the runtime-only values to the API', () => {
    expect(COMMERCE_DNA).toEqual(Object.fromEntries(Object.entries(COMMERCE_RUNTIME_ENUMS).map(([k, v]) => [k, [...v]])));
  });
  it('sets data-dna-checkout and data-dna-fields for known values and ignores the rest', () => {
    const { doc } = boot({ ...DNA, checkout: 'steps', fields: 'pill' });
    expect([doc.documentElement.getAttribute('data-dna-checkout'), doc.documentElement.getAttribute('data-dna-fields')]).toEqual(['steps', 'pill']);
    const other = boot({ ...DNA, checkout: 'zigzag', fields: 'x' });
    expect([other.doc.documentElement.hasAttribute('data-dna-checkout'), other.doc.documentElement.hasAttribute('data-dna-fields')]).toEqual([false, false]);
  });
  it('adds no style and no attribute without the new keys (today unchanged)', () => {
    const { doc } = boot(DNA);
    expect(drawCss(doc)).toBe('');
    expect(doc.documentElement.hasAttribute('data-dna-checkout')).toBe(false);
  });
  it('has rules for every checkout layout and field style, scoped to their attribute, 48px fields, no raw colours', () => {
    const css = drawCss(boot({ ...DNA, checkout: 'brand', fields: 'boxed' }).doc);
    for (const id of ['steps', 'ticket', 'brand']) expect(css).toContain(`[data-dna-checkout=${id}]`);
    for (const id of COMMERCE_RUNTIME_ENUMS.fields) expect(css).toContain(`[data-dna-fields=${id}]`);
    expect(css).toContain('min-height:48px');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('the brand panel uses a valid store photo and refuses anything else', () => {
    const ok = boot({ ...DNA, checkout: 'brand' }, { settings: { checkoutPhoto: 'assets/hero-1.jpg' } });
    expect(ok.doc.documentElement.style.getPropertyValue('--checkout-panel')).toContain('url("assets/hero-1.jpg")');
    for (const bad of ['assets/x.jpg") ; background:red', 'https://evil.test/x.jpg', 'assets/../x.jpg', 42]) {
      expect(boot({ ...DNA, checkout: 'brand' }, { settings: { checkoutPhoto: bad } }).doc.documentElement.style.getPropertyValue('--checkout-panel')).toBe('');
    }
  });
  it('the account submit follows the button DNA', () => {
    expect(commerce).toMatch(/const KIT_BUTTONS = '[^']*\[data-account-gate\] \[data-part=submit\]/);
  });
  it('names the drawer with the store\'s word, keeps "Tu pedido" without one, refuses markup', () => {
    expect(boot(DNA, { settings: { cartWord: 'Tu bolsa' } }).doc.querySelector('#cart-drawer-title')?.textContent).toBe('Tu bolsa');
    expect(boot(DNA).doc.querySelector('#cart-drawer-title')?.textContent).toBe('Tu pedido');
    expect(boot(DNA, { settings: { cartWord: '<b>x</b>' } }).doc.querySelector('#cart-drawer-title')?.textContent).toBe('Tu pedido');
  });
  it('rewrites the kit pages\' "Mi pedido (n)" link to the word, keeping the count element', () => {
    const body = '<header class="commerce-header"><nav><a href="checkout.html">Mi pedido (<span data-cart-count>0</span>)</a></nav></header><section data-pagosya-cart></section><p data-pagosya-status></p>';
    const link = boot(DNA, { body, settings: { cartWord: 'Tu ramo' } }).doc.querySelector('a[href="checkout.html"]');
    expect(link.textContent).toBe('Tu ramo (0)');
    expect(link.querySelector('[data-cart-count]')).not.toBeNull();
  });
});
```
(If `#cart-drawer-title` exists only after the drawer opens, open it as `source-commerce-surfaces.spec.ts` does before asserting.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-surfaces-draw.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `commerce.js`**

a) Right after the `if (hasDna) { … DNA_VALUES … }` block:

```js
  // Account, checkout and the cart path drawn per store (spec 2026-10-11 commerce surfaces). Runtime-only values, never in
  // DNA_VALUES (the API's planner and seed must not see them); a test pins them to COMMERCE_RUNTIME_ENUMS.
  const COMMERCE_DNA = {
    checkout: ['columns', 'steps', 'ticket', 'brand'],
    fields: ['boxed', 'underline', 'filled', 'pill'],
  };
  if (hasDna) for (const name of Object.keys(COMMERCE_DNA)) if (COMMERCE_DNA[name].includes(config.dna[name])) document.documentElement.setAttribute(`data-dna-${name}`, config.dna[name]);
  // The brand checkout's panel photo: only a bundled asset path, so nothing can leave the url().
  const CHECKOUT_PHOTO = typeof config.checkoutPhoto === 'string' && /^assets\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp|avif|gif)$/i.test(config.checkoutPhoto) && !config.checkoutPhoto.includes('..') ? config.checkoutPhoto : '';
  if (CHECKOUT_PHOTO && document.documentElement.getAttribute('data-dna-checkout') === 'brand') document.documentElement.style.setProperty('--checkout-panel', `center / cover no-repeat url("${CHECKOUT_PHOTO}")`);
  // The cart's own word (Tu bolsa, Tu ramo…): short plain words only, else today's label.
  const CART_WORD = typeof config.cartWord === 'string' && /^[\p{L} ]{2,24}$/u.test(config.cartWord.trim()) ? config.cartWord.trim() : '';
```

b) Inject the drawn-commerce style after the DNA style element and after the account CSS (read where each is appended; append this one last, or give its rules a `:root:root` prefix if the account CSS is appended lazily — say which in a comment):

```js
  const FIELD = ':is([data-pagosya-checkout] :is(input,select,textarea),[data-pagosya-cart][data-checkout-review] :is(input,select,textarea),[data-account-gate] [data-part=input])';
  const COMMERCE_DRAW_CSS = [
    `:root[data-dna-fields] ${FIELD}:not([type=checkbox],[type=radio]){box-sizing:border-box;min-height:48px;font:inherit;color:var(--kit-ink)}`,
    `:root[data-dna-fields] ${FIELD}:focus-visible{outline:2px solid var(--kit-accent);outline-offset:2px}`,
    `:root[data-dna-fields=boxed] ${FIELD}:not([type=checkbox],[type=radio]){border:1px solid var(--kit-line);border-radius:var(--kit-radius);background:var(--kit-paper);padding:0 14px}`,
    `:root[data-dna-fields=underline] ${FIELD}:not([type=checkbox],[type=radio]){border:0;border-bottom:2px solid color-mix(in srgb,var(--kit-ink) 55%,var(--kit-paper));border-radius:0;background:transparent;padding:0 2px}`,
    `:root[data-dna-fields=filled] ${FIELD}:not([type=checkbox],[type=radio]){border:0;border-bottom:2px solid color-mix(in srgb,var(--kit-ink) 40%,var(--kit-paper));border-radius:var(--kit-radius) var(--kit-radius) 0 0;background:color-mix(in srgb,var(--kit-ink) 7%,var(--kit-paper));padding:0 14px}`,
    `:root[data-dna-fields=filled] ${FIELD}:focus{border-bottom-color:var(--kit-accent)}`,
    `:root[data-dna-fields=pill] ${FIELD}:not([type=checkbox],[type=radio]){border:1.5px solid var(--kit-line);border-radius:999px;background:var(--kit-paper);padding:0 18px}`,
    ':root[data-dna-fields] :is([data-pagosya-checkout],[data-pagosya-cart],[data-account-gate]) textarea{min-height:96px;padding-block:12px}:root[data-dna-fields=pill] :is([data-pagosya-checkout],[data-pagosya-cart],[data-account-gate]) textarea{border-radius:22px}',
    ':root[data-dna-checkout=steps] .checkout-review{counter-reset:checkout-step}',
    ':root[data-dna-checkout=steps] :is(.checkout-review__summary,.checkout-review__fields)>h2::before{counter-increment:checkout-step;content:counter(checkout-step);display:inline-grid;place-items:center;width:1.7em;height:1.7em;margin-right:.5em;border-radius:50%;background:var(--kit-accent);color:var(--kit-on-accent);font-size:.8em;vertical-align:.1em}',
    ':root[data-dna-checkout=ticket] .checkout-review__summary{font-variant-numeric:tabular-nums;-webkit-mask:linear-gradient(#000 0 0) top/100% calc(100% - 10px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/20px 10px repeat-x;mask:linear-gradient(#000 0 0) top/100% calc(100% - 10px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/20px 10px repeat-x}',
    '@media(min-width:900px){:root[data-dna-checkout=brand] [data-pagosya-checkout] .checkout-page__inner{display:grid;grid-template-columns:minmax(180px,.42fr) minmax(0,1fr);column-gap:clamp(24px,4vw,56px);max-width:1280px}:root[data-dna-checkout=brand] [data-pagosya-checkout] .checkout-page__inner::before{content:"";grid-column:1;grid-row:1 / span 3;min-height:min(70vh,640px);border-radius:var(--kit-radius-panel);background:var(--checkout-panel,color-mix(in srgb,var(--kit-accent) 82%,var(--kit-paper)))}:root[data-dna-checkout=brand] [data-pagosya-checkout] .checkout-page__inner>*{grid-column:2;min-width:0}}',
  ].join('');
  if (document.documentElement.hasAttribute('data-dna-checkout') || document.documentElement.hasAttribute('data-dna-fields')) {
    const drawStyle = document.createElement('style'); drawStyle.setAttribute('data-pagosya-kit', 'commerce-draw'); drawStyle.textContent = COMMERCE_DRAW_CSS;
    document.head.append(drawStyle);
  }
```
(The masks use `#000`/`#0000` as mask alpha, not colours; if the "no raw colours" test trips on them, write them as `black`/`transparent`.)

c) `KIT_BUTTONS`: add `,[data-account-gate] [data-part=submit]` inside its `:where(...)`. In `ACCOUNT_CSS`, split the submit rule so the DNA can restyle it:
```css
[data-account-gate] [data-part=submit]{min-height:48px;font:inherit;font-weight:700;cursor:pointer}
:root:not([data-dna-button]) [data-account-gate] [data-part=submit]{background:var(--acc-accent);color:var(--ui-on-accent,#fff);border-radius:var(--acc-radius);border:0}
```
Check `source-commerce-account-views.spec.ts` for assertions on the old rule; update if any.

d) Cart word: drawer `<h2 id="cart-drawer-title">` and its templated `aria-label` use `CART_WORD || 'Tu pedido'` (escaped); the review summary `<h2>Tu pedido</h2>` likewise. Kit pages' header link, once at boot after the DOM is there:
```js
  // The kit pages' header says "Mi pedido (n)"; with a word of its own the store says "Tu bolsa (n)". The count element stays.
  if (CART_WORD) document.querySelectorAll('a[href="checkout.html"]').forEach(link => {
    const first = link.firstChild;
    if (first && first.nodeType === 3 && /^\s*Mi pedido\s*\($/.test(first.textContent) && link.querySelector('[data-cart-count]')) first.textContent = `${CART_WORD} (`;
  });
```
Check the `Tu pedido` literals in `product.html`, `productos.html`, `coleccion.html`: if they are the kit page's cart panel title with a stable hook, apply the word by selector; if not, leave them and note it in the commit body.

- [ ] **Step 4: Run to verify they pass, and the runtime suites stay green**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit apps/api/src/storefront-source/source-commerce-surfaces-draw.spec.ts apps/api/src/storefront-source/source-commerce-account-views.spec.ts
git commit -m "feat(kit): drawn checkout layouts and field styles, account submit follows the button DNA, the cart's own word"
```

---

### Task 5: The preview line in Studio

**Files:**
- Modify: `apps/api/src/storefront-source/source-style-proposal.ts`
- Modify: `apps/merchant-studio/src/source-style-pick.ts` (+ its stylesheet for `.style-preview__commerce`)
- Test: `apps/api/src/storefront-source/source-style-proposal.spec.ts`, `apps/merchant-studio/src/source-style-pick.test.ts`

**Interfaces:**
- Consumes: `commerceSummary` (Task 1), `StyleSlot.commerce` (Task 2).
- Produces: `StyleCardView.commerce: string` ('' for a slot without commerce); Studio's `StyleCard.commerce?: string`; `<p class="style-preview__commerce">` under Tipografía only when non-empty.

- [ ] **Step 1: Write the failing tests**

`source-style-proposal.spec.ts` (with the file's fixture; its concepts sit on slots 0 and 2 — index slots by `slot.slot` and give the fixture a slot entry for each):
```ts
  it('each card carries its commerce line, empty for a slot drawn before commerce draws', () => {
    const slots = [0, 1, 2].map(slot => ({ slot, mode: slot < 2 ? 'calm' : 'bold', ...(slot === 2 ? { commerce: { account: 'split', checkout: 'ticket', fields: 'pill', cartSurface: 'sheet', added: 'stamp' } } : {}) }));
    const view = styleProposalView('g1', { ...proposal, slots } as any);
    expect(view.cards.map(card => [card.slot, card.commerce])).toEqual([[0, ''], [2, 'Cuenta: dividida · Pago: ticket · Carrito: hoja']]);
  });
```
`source-style-pick.test.ts` (with the file's card/view factories):
```ts
  it('shows the commerce line in the preview side panel, escaped, and nothing when empty', () => {
    const state = { open: 0, device: 'desktop' as const, storeName: 'Café', busy: false };
    expect(renderStylePicker(viewWith({ commerce: 'Cuenta: dividida · Pago: <b>ticket</b>' }), state)).toContain('<p class="style-preview__commerce">Cuenta: dividida · Pago: &lt;b&gt;ticket&lt;/b&gt;</p>');
    expect(renderStylePicker(viewWith({ commerce: '' }), state)).not.toContain('style-preview__commerce');
  });
```
(`viewWith(extra)`: a one-card view whose card 0 has `html` set and `extra` spread in; build it from the test file's existing fixture.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-style-proposal.spec.ts`; Studio: the test command in `apps/merchant-studio/package.json`, on `src/source-style-pick.test.ts`.
Expected: FAIL.

- [ ] **Step 3: Implement**

`source-style-proposal.ts`: import `commerceSummary`; add `commerce: string` to `StyleCardView`; in `styleProposalView` add `commerce: commerceSummary(proposal.slots.find(entry => entry.slot === slot)?.commerce ?? {}),` (the existing code reads `proposal.slots[slot]`; use the same lookup it uses).

`source-style-pick.ts`: `commerce?: string` on `StyleCard`; after the Tipografía paragraph:
```ts
        ${open.commerce ? `<p class="style-preview__commerce">${escape(open.commerce)}</p>` : ''}
```
CSS next to `.style-type`: `.style-preview__commerce{margin-top:12px;font-size:13px;line-height:1.45;color:<the Studio's muted token>}`.

- [ ] **Step 4: Run to verify they pass; rebuild the Studio the dashboard serves**

Both test commands PASS. Rebuild the pre-built Studio (memory "Stale Studio/API in pnpm dev": `grep -n '"build' apps/merchant-studio/package.json`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-style-proposal.ts apps/api/src/storefront-source/source-style-proposal.spec.ts apps/merchant-studio/src
git commit -m "feat(studio): the style preview says where account, payment and cart go"
```

---

### Task 6: Visual check and whole-branch review

- [ ] **Step 1: Typecheck and suites** — `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/storefront-source`; the Studio's test + typecheck commands. Expected: clean / PASS.
- [ ] **Step 2: Chrome check** — a scratchpad harness: the kit's `checkout.html` + `commerce.js` + `commerce-pages.css` with one `config.js` per combination (a light calm palette and a dark bold palette × checkout 4 × fields 4), a preview cart (`PAGOSYA_PREVIEW_CART`) with the review open, and the account login view in the 4 layouts (split with a photo). Serve with `python3 -m http.server` from the scratchpad; screenshot at 390 and 1440 (and spot-check 320). Check: no horizontal scroll, fields ≥ 44px, step numbers readable, ticket edge visible, brand panel only ≥ 900px, account submit takes the button form, contrast of borders and labels.
- [ ] **Step 3: Fix what the check finds**, one commit per fix.
- [ ] **Step 4: Whole-branch review** — one fresh reviewer on the most capable model over `4239bf15..HEAD`; apply fixes.
- [ ] **Step 5: Live (owner)** — with `YAPI_STYLE_PICK=1`, build one store from each card and walk product → cart → checkout → account. Needs the owner's signed-in session and a YAPI run on the ChatGPT bridge.
