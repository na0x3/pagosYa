# Rich Store Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The order and appointment confirmations become 13-section editorial emails (announcement, header links, hero photo, order with photos, delivery box, next steps, trust icons, promo card, real review or store note, brand story, recommendations, contact cards, rich footer), with merchant-controlled content and a "Mostrar en correos" switch on discount codes.

**Architecture:** Extends stage 1 (`apps/api/src/store-emails/`). New block types join the kit contract and the standard kit; a context loader gathers the store's real facts (photos, collections, links, locations, policies, reviews, promo codes, recommendations); the receipt recipe grows to 13 sections with drop priorities so the result fits Gmail's clip; merchant content lives in a new `StoreEmailContent` table and is edited in Ajustes › Correos; icons are PNGs rendered from Lucide (UI) and Simple Icons (brands) and served by a public API route.

**Tech Stack:** NestJS + Prisma 5, parse5 + juice, sharp (PNG rendering), lucide-static (already a dependency), simple-icons (new devDependency), Jest; dashboard ES modules + node:test/JSDOM + Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-store-email-rich-design.md` (builds on `2026-10-07-store-email-look-design.md`).

## Global Constraints

- Every fact comes from the platform: prices, codes, discount values, addresses, reviews, contact details, links. The AI writes only wording; the text `body` of every email is untouched.
- A promo code reaches an email only when `isActive` and `showInEmails` are both true.
- A review is shown only when `status === "PUBLISHED"` and `rating >= 4`, with the buyer's first name only.
- Never an invented testimonial: without a qualifying review the quote is the store's note, signed with the store name.
- Rendered email clamp **90 KB**; when exceeded, drop in this order: recommendations, story, quote, promo, trust, steps. Never drop: hero, items, address, contact, notes, footer.
- Copy caps (new): announcement **90**, storyTitle **60**, storyText **300**, note **200**, recommendTitle **60**, helpTitle **60**. Existing caps unchanged.
- Images and icons: absolute https only (`PUBLIC_ASSET_BASE_URL`); anything else is dropped.
- Icons: PNG only (Gmail strips SVG), 96×96, tones `dark` (#18181b) and `light` (#ffffff).
- **Database safety:** never run `prisma migrate`, `db push`, `migrate diff`, `migrate reset`, `db pull`, `migrate resolve`; never write to the dev DB. Hand-written SQL + `npx prisma generate` only; the owner applies migrations.
- Spanish copy, `es-BO`; no pagosYa branding in the email body.
- Dashboard: new `/src/*` modules go in the `server.mjs` allowlist.

## Review Focus

1. **A store with nothing set up** (no logo, photos, links, policies, reviews, codes) — the email is still complete and tidy: every optional section hidden, never an empty box. Pinned in Task 6.
2. **A promo code switched off or deactivated after a merchant picked it in Correos** — it is not sent. Pinned in Task 8.
3. **A huge order** (40 lines with photos) plus every optional section — the email fits 90 KB by dropping optional sections in order, never the order lines. Pinned in Task 4.
4. **A store link to an unknown host** (e.g. a Linktree) — shown as a text link, not a broken icon. Pinned in Tasks 4 and 5.
5. **Pickup order, delivery order, appointment** — the right box and steps for each; a delivery order without an address shows no empty box. Pinned in Task 6.

---

## File structure

| File | Change |
|---|---|
| `apps/api/scripts/build-email-icons.ts` | new: renders the PNG icon set |
| `packages/storefront-kit/kit/emails/icons/*.png` | new: 18 icons × 2 tones |
| `apps/api/src/store-emails/email-image-url.ts` | add `EMAIL_ICONS`, `emailIconUrl()` |
| `apps/api/src/store-emails/email-assets.controller.ts` | new: public icon route |
| `apps/api/src/store-emails/email-kit-contract.ts` | new block types, rows, copy fields |
| `apps/api/src/store-emails/email-kit-validate.ts` | fact slots + rows for new blocks |
| `packages/storefront-kit/kit/emails/layout.html`, `blocks.html` | new blocks, header/footer slots |
| `apps/api/src/store-emails/email-copy-defaults.ts` | default copy for new fields |
| `apps/api/src/store-emails/email-assemble.ts` | new blocks and layout rows; `assembleWithinBudget()` |
| `apps/api/src/store-emails/email-context.ts` | new: a store's real facts for an email |
| `apps/api/src/store-emails/email-recipes.ts` | 13-section `richReceiptCalls()` |
| `apps/api/prisma/schema.prisma` + migration | `PromoCode.showInEmails`, `StoreEmailContent` |
| `apps/api/src/store-emails/email-content-store.ts` | new: merchant content get/set/clear |
| `apps/api/src/promo-codes/*` | `showInEmails` on PATCH |
| `apps/api/src/store-emails/store-email.service.ts` | wires context + content into `renderReceipt` |
| `apps/api/src/payment-intents/payment-intents.service.ts` | passes delivery data to `renderReceipt` |
| `apps/api/src/store-emails/email-kit-designer.ts` | prompt for the new blocks |
| `apps/api/src/store-emails/store-email.controller.ts` | content routes |
| `apps/merchant-dashboard/src/email-content-panel.mjs` | new: Correos "Contenido" |
| `apps/merchant-dashboard/src/dashboard.js` | Descuentos "Mostrar en correos" switch |

---

### Task 1: Icons and their public route

**Files:**
- Create: `apps/api/scripts/build-email-icons.ts`, `packages/storefront-kit/kit/emails/icons/<name>-<tone>.png` (36 files), `apps/api/src/store-emails/email-assets.controller.ts` (+ spec)
- Modify: `apps/api/package.json` (devDependency `simple-icons`), `email-image-url.ts` (+ spec), `store-email.module.ts`

**Interfaces:**
- Produces: `EMAIL_ICONS = ['lock','return','truck','store','chat','check','box','calendar','mail','whatsapp','phone','pin','star','instagram','tiktok','facebook','x','youtube'] as const`; `type EmailIcon`; `type IconTone = 'dark' | 'light'`; `emailIconUrl(icon: EmailIcon, tone: IconTone, base: string | null): string | null` → `${base}/v1/email-assets/icons/${icon}-${tone}.png` only when base is https. Route `GET /v1/email-assets/icons/:file`, no auth.

- [ ] **Step 1: Failing tests.** Append to `email-image-url.spec.ts`:

```ts
import { existsSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { EMAIL_ICONS, emailIconUrl } from './email-image-url';

describe('emailIconUrl', () => {
  it('points at the public icon route in the requested tone, only over https', () => {
    expect(emailIconUrl('truck', 'light', 'https://api.pagosya.bo')).toBe('https://api.pagosya.bo/v1/email-assets/icons/truck-light.png');
    expect(emailIconUrl('truck', 'dark', 'http://localhost:3001')).toBeNull();
    expect(emailIconUrl('truck', 'dark', null)).toBeNull();
  });
  it('ships every icon in both tones', () => {
    for (const icon of EMAIL_ICONS) for (const tone of ['dark', 'light']) expect(existsSync(kitPath('emails', 'icons', `${icon}-${tone}.png`))).toBe(true);
  });
});
```

`email-assets.controller.spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { EmailAssetsController } from './email-assets.controller';

describe('public email icons', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [EmailAssetsController] }).compile();
    app = moduleRef.createNestApplication(); await app.init();
  });
  afterAll(() => app.close());
  it('serves a PNG with a long cache', async () => {
    const res = await request(app.getHttpServer()).get('/v1/email-assets/icons/truck-dark.png').expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
    expect(Buffer.from(res.body).subarray(1, 4).toString()).toBe('PNG');
  });
  it('404s anything outside the icon set', async () => {
    for (const path of ['nope-dark.png', 'truck-blue.png', '..%2Fblocks.html', 'truck-dark.svg']) await request(app.getHttpServer()).get(`/v1/email-assets/icons/${path}`).expect(404);
  });
});
```

- [ ] **Step 2:** `cd apps/api && npx jest src/store-emails/email-image-url.spec.ts src/store-emails/email-assets.controller.spec.ts` — FAIL (missing exports/module).

- [ ] **Step 3: Icons.** `cd /Users/saramia/pagosYa && pnpm --filter <api package name from apps/api/package.json> add -D simple-icons`. Then `apps/api/scripts/build-email-icons.ts`:

```ts
// Renders the email icon set to PNG (Gmail strips SVG). Run: cd apps/api && npx ts-node --transpile-only scripts/build-email-icons.ts
// UI icons: Lucide (ISC, see kit/icons/LICENSE.txt). Brand icons: Simple Icons (CC0).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import * as simple from 'simple-icons';
import { kitPath } from '@pagosya/storefront-kit';

const LUCIDE: Record<string, string> = { lock: 'lock', return: 'rotate-ccw', truck: 'truck', store: 'store', chat: 'message-circle', check: 'check', box: 'package', calendar: 'calendar', mail: 'mail', phone: 'phone', pin: 'map-pin', star: 'star' };
const BRANDS: Record<string, string> = { whatsapp: 'siWhatsapp', instagram: 'siInstagram', tiktok: 'siTiktok', facebook: 'siFacebook', x: 'siX', youtube: 'siYoutube' };
const TONES = { dark: '#18181b', light: '#ffffff' } as const;
const lucideDir = join(require.resolve('lucide-static/package.json'), '..', 'icons');

async function svgFor(name: string, colour: string): Promise<string> {
  if (LUCIDE[name]) return (await readFile(join(lucideDir, `${LUCIDE[name]}.svg`), 'utf8')).replace(/stroke="currentColor"/g, `stroke="${colour}"`);
  const icon = (simple as unknown as Record<string, { path: string }>)[BRANDS[name]];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${colour}" d="${icon.path}"/></svg>`;
}

async function main() {
  const out = kitPath('emails', 'icons');
  await mkdir(out, { recursive: true });
  for (const name of [...Object.keys(LUCIDE), ...Object.keys(BRANDS)]) for (const [tone, colour] of Object.entries(TONES)) {
    const png = await sharp(Buffer.from(await svgFor(name, colour)), { density: 384 })
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await writeFile(join(out, `${name}-${tone}.png`), png);
  }
  console.log('email icons written to', out);
}
void main();
```

Run it once; commit the PNGs. If a brand export name differs in the installed `simple-icons`, list them (`node -e "console.log(Object.keys(require('simple-icons')).filter(k => /whatsapp|instagram|tiktok|facebook|^siX$|youtube/i.test(k)))"`) and adjust `BRANDS`.

- [ ] **Step 4: Code.** Append to `email-image-url.ts`:

```ts
export const EMAIL_ICONS = ['lock', 'return', 'truck', 'store', 'chat', 'check', 'box', 'calendar', 'mail', 'whatsapp', 'phone', 'pin', 'star', 'instagram', 'tiktok', 'facebook', 'x', 'youtube'] as const;
export type EmailIcon = typeof EMAIL_ICONS[number];
export type IconTone = 'dark' | 'light';

/** Icons are PNGs on the API's public origin: Gmail strips SVG and can only fetch https. */
export function emailIconUrl(icon: EmailIcon, tone: IconTone, base: string | null): string | null {
  return base && base.startsWith('https://') ? `${base}/v1/email-assets/icons/${icon}-${tone}.png` : null;
}
```

`email-assets.controller.ts`:

```ts
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { EMAIL_ICONS } from './email-image-url';

const FILE = new RegExp(`^(?:${EMAIL_ICONS.join('|')})-(?:dark|light)\\.png$`);

/** Public: email clients fetch these with no session. Only the fixed icon set is reachable. */
@Controller('v1/email-assets')
export class EmailAssetsController {
  @Get('icons/:file')
  async icon(@Param('file') file: string, @Res() res: Response) {
    if (!FILE.test(file)) throw new NotFoundException();
    let bytes: Buffer;
    try { bytes = await readFile(kitPath('emails', 'icons', file)); } catch { throw new NotFoundException(); }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    res.send(bytes);
  }
}
```

Add it to `StoreEmailModule.controllers`. Check for a global guard (`grep -rn "APP_GUARD" apps/api/src`); if one exists, mark this controller public the same way the public source-site controller is.

- [ ] **Step 5:** specs + `npx tsc --noEmit -p tsconfig.json` — PASS. **Commit:** `feat(store-emails): a PNG icon set for emails, served publicly`.

---

### Task 2: Contract and validation for the new blocks

**Files:** Modify `email-kit-contract.ts`, `email-kit-validate.ts`; Test `email-kit-validate.spec.ts`.

**Interfaces:**
- `EMAIL_BLOCK_TYPES` += `'announce','address','steps','trust','quote','story','contact'`.
- `EMAIL_COPY_FIELDS` += `announcement: 90, storyTitle: 60, storyText: 300, note: 200, recommendTitle: 60, helpTitle: 60`.
- `ATTRIBUTE_SLOTS` += `'data-step-icon':'src', 'data-trust-icon':'src', 'data-contact-icon':'src', 'data-contact-value':'href', 'data-nav-link':'href', 'data-social':'href', 'data-social-icon':'src', 'data-policy-link':'href'`.
- `BLOCK_ROWS: Partial<Record<EmailBlockType, string>> = { items: 'data-item', products: 'data-product', address: 'data-line', steps: 'data-step', trust: 'data-trust', contact: 'data-contact' }`.

- [ ] **Step 1: Failing tests** (append):

```ts
describe('new blocks', () => {
  const rich = blocks + `
    <table data-block="announce" data-tone="dark"><tr><td data-block-text></td></tr></table>
    <table data-block="address"><tr><td><h3 data-block-title></h3><p data-line></p></td></tr></table>
    <table data-block="steps"><tr><td data-step><img data-step-icon><span data-step-title></span></td></tr></table>
    <table data-block="trust"><tr><td data-trust><img data-trust-icon><span data-trust-label></span></td></tr></table>
    <table data-block="quote"><tr><td><p data-quote-text></p><span data-quote-author></span><span data-quote-stars></span></td></tr></table>
    <table data-block="story"><tr><td><img data-block-image><h3 data-block-title></h3><p data-block-text></p></td></tr></table>
    <table data-block="contact"><tr><td><h3 data-block-title></h3></td></tr><tr><td data-contact><img data-contact-icon><span data-contact-label></span><a data-contact-value></a></td></tr></table>`;

  it('accepts every new block with its slots and keeps data-tone', () => {
    const { kit } = validateEmailKit({ layout, blocks: rich, copy: {} });
    expect(Object.keys(kit.blocks).sort()).toEqual(['address', 'announce', 'button', 'contact', 'heading', 'items', 'note', 'quote', 'steps', 'story', 'trust']);
    expect(kit.blocks.announce).toContain('data-tone="dark"');
  });
  it('refuses a repeated block without exactly one row', () => {
    const { kit, repairs } = validateEmailKit({ layout, blocks: rich.replace('<td data-step>', '<td data-step></td><td data-step>'), copy: {} });
    expect(kit.blocks.steps).toBeUndefined();
    expect(repairs.join(' ')).toMatch(/steps needs exactly one data-step/);
  });
  it('refuses a quote without its text slot, so no AI-written testimonial can stand in', () => {
    expect(validateEmailKit({ layout, blocks: rich.replace('<p data-quote-text></p>', '<p>“Me encantó”</p>'), copy: {} }).kit.blocks.quote).toBeUndefined();
  });
  it('drops an invalid data-tone', () => {
    expect(validateEmailKit({ layout, blocks: rich.replace('data-tone="dark"', 'data-tone="neon"'), copy: {} }).kit.blocks.announce).not.toContain('data-tone');
  });
  it('checks the new wording fields with their caps', () => {
    const { copy } = validateEmailCopy({ order_confirmation: { announcement: 'x'.repeat(120), storyText: 'Hecho a mano en La Paz.', note: 'Desde 2019 con cariño.' } });
    expect(copy.order_confirmation!.announcement).toHaveLength(90);
    expect(copy.order_confirmation!.storyText).toBe('Hecho a mano en La Paz.');
    expect(copy.order_confirmation!.note).toBeUndefined(); // "2019": a four-digit number is dropped as a possible fact
  });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Contract per Interfaces. In `email-kit-validate.ts`, extend `FACT_SLOTS`:

```ts
const FACT_SLOTS: Record<EmailBlockType, string[]> = {
  hero: ['data-block-title'], heading: ['data-block-title'],
  items: ['data-item-name', 'data-item-quantity', 'data-item-amount', 'data-items-total'],
  button: ['data-block-link', 'data-block-label'],
  products: ['data-product-name', 'data-product-price', 'data-product-link'],
  promo: ['data-block-code', 'data-block-discount'], note: ['data-block-text'],
  announce: ['data-block-text'], address: ['data-block-title', 'data-line'],
  steps: ['data-step-icon', 'data-step-title'], trust: ['data-trust-icon', 'data-trust-label'],
  quote: ['data-quote-text', 'data-quote-author'], story: ['data-block-title', 'data-block-text'],
  contact: ['data-block-title', 'data-contact-icon', 'data-contact-label', 'data-contact-value'],
};
```

Replace the hard-coded `items`/`products` row checks with a loop over `BLOCK_ROWS`: `count(el, row) !== 1` → repair `emails/blocks.html: ${block} needs exactly one ${row} row; the standard block is used` and skip; otherwise `blankLooseText` on that row (widen `SLOT_ATTRIBUTE` to `/^data-(?:block|item|items|product|line|step|trust|quote|contact)(?:-|$)/`). After accepting a block, an invalid `data-tone` (not `light`/`dark`) is removed with a repair. The promo block now requires `data-block-discount`; add it to the floor's promo block in Task 3 (do that edit now if the floor test fails).

- [ ] **Step 4:** `npx jest src/store-emails` — PASS. **Commit:** `feat(store-emails): the kit contract gains announce, address, steps, trust, quote, story and contact blocks`.

---

### Task 3: The standard kit, rich

**Files:** Modify `packages/storefront-kit/kit/emails/layout.html`, `blocks.html`, `apps/api/src/store-emails/email-copy-defaults.ts`; Test `email-floor.spec.ts`.

- [ ] **Step 1: Failing test** (the existing tests already require every block type and every copy field):

```ts
it('has header links, social icons, address and policy links in the layout', async () => {
  const { layout } = await loadFloorKit();
  for (const slot of ['data-nav-link', 'data-social', 'data-social-icon', 'data-store-address', 'data-policy-link']) expect(layout).toContain(slot);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**

`layout.html` — keep the stage-1 structure; in the logo row add, right-aligned, `<a data-nav-link style="margin-left:14px;font-size:13px;text-decoration:none;color:var(--brand-foreground,#18181b);background:var(--brand-surface,#ffffff)"></a>`. After the content row add a footer row on the accent colour (comment: footer icons always use the light tone because the footer sits on the accent): store name, a line of `<a data-social style="display:inline-block;margin:0 6px;background:var(--brand-accent,#18181b)"><img data-social-icon width="24" height="24" alt=""></a>`, `<p data-store-address style="margin:12px 0 0;font-size:12px;color:var(--brand-accent-foreground,#ffffff);background:var(--brand-accent,#18181b)"></p>`, a line of `<a data-policy-link style="margin:0 8px;font-size:12px;color:var(--brand-accent-foreground,#ffffff);background:var(--brand-accent,#18181b)"></a>`, then the existing unsubscribe link.

`blocks.html` — add seven top-level tables, each with `data-tone`, every colour paired with a background, brand tokens with fallbacks:
- `announce` (`data-tone="dark"`): accent bar, centred 13px `<td data-block-text>`.
- `address` (`light`): surface card, 1px `#e7e5e4` border, `<h3 data-block-title>` 15px bold, one `<p data-line>` row 14px.
- `steps` (`light`): one `<tr>` with one `<td data-step align="center" width="33%">` holding `<img data-step-icon width="32" height="32" alt="">` and `<p data-step-title style="font-size:13px">`.
- `trust` (`light`): one `<td data-trust align="center" width="25%">` with `<img data-trust-icon width="28" height="28" alt="">` and `<p data-trust-label style="font-size:12px">`.
- `quote` (`light`): a 36px `“`, italic 18px `<p data-quote-text>`, `<p data-quote-stars style="color:#c8961a;background:var(--brand-surface,#ffffff)">`, `<p data-quote-author style="font-size:13px;color:#6b6b73;…">`.
- `story` (`light`): `<td width="50%"><img data-block-image width="260" alt=""></td><td width="50%"><h3 data-block-title></h3><p data-block-text></p></td>`.
- `contact` (`light`): `<h3 data-block-title>` row, then one `<td data-contact width="50%">` card with `<img data-contact-icon width="24" height="24" alt="">`, `<p data-contact-label style="font-size:11px;text-transform:uppercase;…">`, `<a data-contact-value style="font-size:14px;…">`.
- `promo`: add `<p data-block-discount style="margin:0 0 6px;font-size:15px;font-weight:bold;color:var(--brand-foreground,#18181b);background:var(--brand-surface,#ffffff)"></p>` above the code.
- `hero`: add a button row: `<a data-block-link style="display:inline-block;margin-top:16px;padding:12px 20px;border-radius:8px;font-weight:bold;text-decoration:none;color:var(--brand-accent,#18181b);background:var(--brand-accent-foreground,#ffffff)"><span data-block-label></span></a>`.

`email-copy-defaults.ts` — add to `order_confirmation`:

```ts
announcement: 'Gracias por comprar en {tienda}.',
storyTitle: 'Sobre {tienda}',
storyText: 'Somos {tienda}. Cuidamos cada pedido para que llegue tal como lo imaginaste.',
note: 'Gracias por confiar en nosotros.',
recommendTitle: 'También te puede gustar',
helpTitle: '¿Problemas con tu pedido?',
```

and to `appointment_confirmed` the same with `recommendTitle: 'Otros servicios'`, `helpTitle: '¿Necesitas cambiar tu cita?'`.

- [ ] **Step 4:** `npx jest src/store-emails && node ../../packages/storefront-kit/kit/check-runtimes.mjs` — PASS (fix the HTML if the floor reports repairs). **Commit:** `feat(store-emails): the standard kit gains every new block and a rich header and footer`.

---

### Task 4: Assembling the new blocks, within budget

**Files:** Modify `email-assemble.ts`; Test `email-assemble.spec.ts`.

**Interfaces:**
- Consumes `emailIconUrl`, `EmailIcon`, `IconTone`, `BLOCK_ROWS`.
- `BlockCall` gains (all accept `drop?: number`, higher drops first; existing variants gain it too):

```ts
| { block: 'announce'; text: string; drop?: number }
| { block: 'hero'; image: EmailImage | null; title: string; text: string | null; href?: string | null; label?: string | null; drop?: number }
| { block: 'address'; title: string; lines: string[]; drop?: number }
| { block: 'steps'; steps: { icon: EmailIcon; title: string }[]; drop?: number }
| { block: 'trust'; items: { icon: EmailIcon; label: string }[]; drop?: number }
| { block: 'quote'; text: string; author: string; stars: number | null; drop?: number }
| { block: 'story'; image: EmailImage | null; title: string; text: string; drop?: number }
| { block: 'contact'; title: string; cards: { icon: EmailIcon; label: string; value: string; href: string }[]; drop?: number }
| { block: 'promo'; code: string; discount: string; text: string | null; drop?: number }
```

- `EmailItem` gains `productId?: string | null`.
- `LayoutData` gains `nav: { label: string; href: string }[]`, `socials: { icon: EmailIcon | null; label: string; href: string }[]`, `address: string | null`, `policies: { label: string; href: string }[]`, `iconBase: string | null` (optional fields with `[]`/`null` defaults so stage-1 callers compile).
- `assembleWithinBudget(kit, floor, calls, layout): { html: string; repairs: string[] }`.

- [ ] **Step 1: Failing tests** (append; `const rich: LayoutData = { ...layoutData, nav: [], socials: [], address: null, policies: [], iconBase: 'https://api.example' };`):

```ts
it('fills repeated rows with icons', () => {
  const { html } = assembleEmail(floor, floor, [{ block: 'steps', steps: [{ icon: 'check', title: 'Confirmado' }, { icon: 'box', title: 'Preparando' }, { icon: 'truck', title: 'En camino' }] }], rich);
  expect(html.match(/(?:check|box|truck)-(?:dark|light)\.png/g)).toHaveLength(3);
  expect(html).toContain('En camino');
});
it('a block on a dark background gets light icons', () => {
  const kit = { ...floor, blocks: { ...floor.blocks, trust: floor.blocks.trust!.replace('data-tone="light"', 'data-tone="dark"') } };
  expect(assembleEmail(kit, floor, [{ block: 'trust', items: [{ icon: 'lock', label: 'Pago seguro' }] }], rich).html).toContain('lock-light.png');
});
it('fills header links, social icons, an unknown link as text, the address and policies', () => {
  const { html } = assembleEmail(floor, floor, [], { ...rich, nav: [{ label: 'Café', href: 'https://s/cafe' }],
    socials: [{ icon: 'instagram', label: 'Instagram', href: 'https://instagram.com/x' }, { icon: null, label: 'Linktree', href: 'https://linktr.ee/x' }],
    address: 'Av. 6 de Agosto 123, La Paz', policies: [{ label: 'Cambios', href: 'https://s/cambios' }] });
  expect(html).toContain('instagram-light.png');
  expect(html).toMatch(/href="https:\/\/linktr\.ee\/x"[^>]*>Linktree</);
  expect(html).toContain('Av. 6 de Agosto 123, La Paz');
  expect(html).toContain('href="https://s/cambios"');
});
it('drops optional sections in priority order to fit 90 KB, never the order lines', () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({ name: `Producto ${i} ${'x'.repeat(200)}`, variant: null, extras: null, quantity: 1, amount: 'Bs 1,00', image: { src: 'https://api.example/v1/uploads/a.webp', alt: 'a' } }));
  const calls: BlockCall[] = [
    { block: 'items', items: lines, total: 'Bs 40,00', originalTotal: null },
    { block: 'products', products: Array.from({ length: 4 }, () => ({ name: 'p'.repeat(6000), price: 'Bs 1', href: 'https://s', image: null })), drop: 6 },
    { block: 'story', image: null, title: 't', text: 's'.repeat(6000), drop: 5 },
    { block: 'quote', text: 'q'.repeat(3000), author: 'Ana', stars: 5, drop: 4 },
  ];
  const { html, repairs } = assembleWithinBudget(floor, floor, calls, rich);
  expect(Buffer.byteLength(html)).toBeLessThanOrEqual(90 * 1024);
  expect(html).toContain('Producto 39');
  expect(repairs[0]).toMatch(/products removed/);
});
it('stars come from the number, never from text', () => {
  expect(assembleEmail(floor, floor, [{ block: 'quote', text: 'Excelente', author: 'Ana', stars: 4 }], rich).html).toContain('★★★★☆');
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** `fillBlock(html, call, layout)` gains the layout. Helpers:

```ts
const blockTone = (root: Node): IconTone => ([...walk(root)].some(el => attrOf(el, 'data-tone')?.value === 'dark') ? 'light' : 'dark');
const iconImage = (name: EmailIcon | null, tone: IconTone, base: string | null, alt: string): EmailImage | null => {
  const src = name ? emailIconUrl(name, tone, base) : null;
  return src ? { src, alt } : null;
};
```

(A dark background takes light icons.) Cases: `announce` → `data-block-text`; `hero` → stage-1 fill + `'data-block-link': call.href ?? null, 'data-block-label': call.label ?? null`; `address` → title + `repeat(root, 'data-line', call.lines, (row, line) => setText(row, line))`; `steps`/`trust` → `repeat` with `fillImages(row, '<icon slot>', iconImage(...))` and the title/label; `quote` → `'data-quote-text': call.text, 'data-quote-author': `— ${call.author}`, 'data-quote-stars': call.stars ? '★'.repeat(call.stars) + '☆'.repeat(5 - call.stars) : null`; `story` → image + title + text; `contact` → title + rows (icon, label, value as text and `href` on `data-contact-value` — set text then `setAttr(el,'href',card.href)`); `promo` → code, discount, text. Add `data-tone` to the detached attributes (widen `SLOT` to `/^data-(?:block|item|items|product|store|email|line|step|trust|quote|contact|nav|social|policy|tone)(?:-|$)/`). Layout after content insertion:

```ts
repeat(doc, 'data-nav-link', layout.nav ?? [], (a, n) => { setAttr(a, 'href', n.href); setText(a, n.label); });
repeat(doc, 'data-policy-link', layout.policies ?? [], (a, p) => { setAttr(a, 'href', p.href); setText(a, p.label); });
repeat(doc, 'data-social', layout.socials ?? [], (a, s) => {
  setAttr(a, 'href', s.href);
  const img = [...walk(a)].find(e => has(e, 'data-social-icon'));
  const icon = iconImage(s.icon, 'light', layout.iconBase ?? null, s.label);
  if (img && icon) fillImage(img, icon); else { if (img) remove(img); setText(a, s.label); }
});
fillWithin(doc, { 'data-store-address': layout.address ?? null });
```

`assembleWithinBudget`:

```ts
export function assembleWithinBudget(kit: ValidEmailKit, floor: ValidEmailKit, calls: BlockCall[], layout: LayoutData) {
  const dropped: string[] = [];
  let current = [...calls];
  for (;;) {
    const result = assembleEmail(kit, floor, current, layout);
    const over = result.repairs.some(r => r.startsWith('render: clamped'));
    const droppable = current.map((call, index) => ({ call, index })).filter(({ call }) => call.drop !== undefined);
    if (!over || !droppable.length) return { html: result.html, repairs: [...dropped, ...result.repairs] };
    const victim = droppable.reduce((a, b) => (b.call.drop! >= a.call.drop! ? b : a));
    dropped.push(`budget: ${victim.call.block} removed to fit Gmail`);
    current = current.filter((_, i) => i !== victim.index);
  }
}
```

- [ ] **Step 4:** `npx jest src/store-emails` — PASS. **Commit:** `feat(store-emails): fill the new blocks, header and footer, and drop optional sections to fit Gmail`.

---

### Task 5: The store's facts for an email

**Files:** Create `apps/api/src/store-emails/email-context.ts` + `email-context.spec.ts`.

**Interfaces:**

```ts
export type EmailContext = {
  storeUrl: string | null; heroImage: EmailImage | null; nav: { label: string; href: string }[];
  socials: { icon: EmailIcon | null; label: string; href: string }[]; address: string | null;
  policies: { key: 'returns' | 'delivery' | 'privacy' | 'terms'; label: string; href: string }[];
  contact: { email: string | null; phone: string | null; whatsapp: boolean };
  delivers: boolean; review: { text: string; author: string; stars: number } | null;
  promos: { id: string; code: string; discount: string }[];   // isActive && showInEmails, newest first
  recommendations: (exclude: string[]) => EmailProduct[];      // 2–4 active products not in `exclude`, else []
};
export function socialIcon(url: string): EmailIcon | null;
export function promoDiscountLabel(type: 'PERCENT' | 'FIXED', value: number, currency: string): string;
export async function loadEmailContext(prisma: PrismaService, storeId: string, opts: { assetBase: string | null; checkoutOrigin: string | null }): Promise<EmailContext>;
```

- [ ] **Step 1: Failing tests.**

```ts
describe('socialIcon', () => {
  it.each([
    ['https://www.instagram.com/cafe', 'instagram'], ['https://tiktok.com/@cafe', 'tiktok'], ['https://wa.me/59170000000', 'whatsapp'],
    ['https://x.com/cafe', 'x'], ['https://twitter.com/cafe', 'x'], ['https://m.facebook.com/cafe', 'facebook'],
    ['https://youtu.be/1', 'youtube'], ['https://linktr.ee/cafe', null], ['nota', null],
  ])('%s → %s', (url, icon) => expect(socialIcon(url)).toBe(icon));
});
describe('promoDiscountLabel', () => {
  it('builds the discount from the code itself', () => {
    expect(promoDiscountLabel('PERCENT', 10, 'BOB')).toBe('10% en tu próxima compra');
    expect(promoDiscountLabel('FIXED', 2000, 'BOB')).toBe('Bs 20 en tu próxima compra');
  });
});
```

and for `loadEmailContext`, a `prisma(over)` mock helper returning `jest.fn` lookups for `store.findUnique`, `storeLink.findMany`, `collection.findMany`, `storeReview.findFirst`, `promoCode.findMany`, `paymentLink.findMany`, `storeSourceVersion.findUnique`, with these cases (each with concrete rows and expectations):

```ts
it('only shares codes that are active and marked for emails', async () => {
  const ctx = await loadEmailContext(prisma({ promos: [{ id: 'p2', code: 'VUELVE10', discountType: 'PERCENT', discountValue: 10 }] }), 's1', opts);
  expect(ctx.promos).toEqual([{ id: 'p2', code: 'VUELVE10', discount: '10% en tu próxima compra' }]);
  expect(mock.promoCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 's1', isActive: true, showInEmails: true } }));
});
it('uses only a published review of 4★ or more, with the first name only', async () => {
  // storeReview.findFirst resolves { displayName: 'Ana María Quispe', rating: 5, body: 'Llegó perfecto' }
  // expect ctx.review = { text: 'Llegó perfecto', author: 'Ana', stars: 5 } and the query where { storeId, status: 'PUBLISHED', rating: { gte: 4 } }
});
it('a store with nothing set up yields empty, never broken, facts', async () => {
  // every lookup empty/null → heroImage null, nav [], socials [], address null, policies [], review null, promos [], contact { email: null, phone: null, whatsapp: false }, delivers false
});
it('picks the published homepage first photo as hero, else the banner', async () => {
  // publishedSourceRevision 3, version { digest: 'a'.repeat(64), snapshot: { files: [{ path: 'index.html', content: '<img src="assets/hero.jpg">' }] } }
  // → heroImage.src 'https://api.example/v1/stores/public/cafe/source-site/assets/3-aaaaaaaaaaaa/assets/hero.jpg'
  // without a published revision → banner '/v1/uploads/banner.webp' → 'https://api.example/v1/uploads/banner.webp'
});
it('recommends active products with photos, never ones in the order', async () => {
  // paymentLink rows pl_1, pl_2, pl_3 with imageUrls; ctx.recommendations(['pl_1']) → names of pl_2, pl_3; price '50.00 BOB'
});
it('marks WhatsApp when the store takes orders by WhatsApp', async () => {
  // checkoutMode 'whatsapp', contactPhone '+591 70000000' → contact.whatsapp true
});
it('links an unknown social host as text and a known one with its icon', async () => {
  // links [{ label: 'IG', url: 'https://instagram.com/cafe' }, { label: 'Linktree', url: 'https://linktr.ee/cafe' }] → icons ['instagram', null]
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**

```ts
const HOSTS: [RegExp, EmailIcon][] = [
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
  [/(^|\.)(x|twitter)\.com$/, 'x'], [/(^|\.)facebook\.com$/, 'facebook'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
];
export function socialIcon(url: string): EmailIcon | null {
  try { const host = new URL(url).hostname.toLowerCase(); return HOSTS.find(([re]) => re.test(host))?.[1] ?? null; } catch { return null; }
}
export function promoDiscountLabel(type: 'PERCENT' | 'FIXED', value: number, currency: string): string {
  if (type === 'PERCENT') return `${value}% en tu próxima compra`;
  const units = value / 100;
  return `${currency === 'BOB' ? 'Bs' : currency} ${Number.isInteger(units) ? units : units.toFixed(2)} en tu próxima compra`;
}
```

(Confirm FIXED values are cents by reading the dashboard's `money()`; if they are whole units, drop the `/100`.)

`loadEmailContext` runs one `Promise.all`:
- `store.findUnique({ where: { id }, select: { name, slug, logoUrl, bannerUrl, contactEmail, contactPhone, checkoutMode, policies, locations, publishedSourceRevision, customDomains: { where: { status: 'ACTIVE' }, select: { hostname: true }, take: 1 } } })`
- `storeLink.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' }, take: 6 })`
- `collection.findMany({ where: { storeId }, take: 3, select: { name: true, slug: true } })` (order by `sortOrder` if `Collection` has it, else `createdAt`)
- `storeReview.findFirst({ where: { storeId, status: 'PUBLISHED', rating: { gte: 4 } }, orderBy: { createdAt: 'desc' } })`
- `promoCode.findMany({ where: { storeId, isActive: true, showInEmails: true }, orderBy: { createdAt: 'desc' } })`
- `paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 8, select: { id, name, amount, currency, imageUrls } })`

then, when `publishedSourceRevision` is set, `storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { snapshot: true, digest: true } })` and the first `<img src="assets/…">` of `index.html` → `${assetBase}/v1/stores/public/${slug}/source-site/assets/${revision}-${digest.slice(0, 12)}/${path}` when `assetBase` is https. Hero fallback: `emailImageUrl(bannerUrl, assetBase)`.

storeUrl: active domain → `https://host`, else `${checkoutOrigin}/s/${slug}`. nav: collections → `${storeUrl}/coleccion.html?c=${encodeURIComponent(slug)}` — **verify** the checkout app serves that path under `/s/<slug>/` (open one in the running app); if not, use `storeUrl` for each link. policies: non-empty keys of `policies` → labels `Cambios y devoluciones` (returns), `Envíos` (delivery), `Privacidad` (privacy), `Términos` (terms), all `href: storeUrl`. address: the first location's `address`. delivers: any location with `deliveryEnabled`, or a non-empty delivery policy. contact: `contactEmail`, `contactPhone`, `whatsapp: checkoutMode === 'whatsapp' && !!contactPhone`. review author: first word of `displayName`. recommendations: closure over the fetched products, excluding ids, preferring those with a resolvable photo, up to 4; fewer than 2 → `[]`; price via `formatAmount(amount, currency)` (`${(amount / 100).toFixed(2)} ${currency}`, the receipt's own format).

- [ ] **Step 4:** PASS. **Commit:** `feat(store-emails): load a store's real facts for its emails`.

---

### Task 6: The 13-section recipe

**Files:** Modify `email-recipes.ts` (+ spec).

**Interfaces:**

```ts
export type Delivery = { method: 'delivery'; recipient: string | null; lines: string[] } | { method: 'pickup'; location: string | null } | null;
export type ResolvedContent = { announcement: string | null; heroImage: EmailImage | null; promo: { code: string; discount: string } | null; story: { title: string; text: string; image: EmailImage | null } | null; note: string; recommendations: boolean };
export function richReceiptCalls(type: EmailType, data: ReceiptData & { delivery: Delivery }, copy: ResolvedCopy, ctx: EmailContext, content: ResolvedContent): BlockCall[];
```

- [ ] **Step 1: Failing tests.**

```ts
const ctx: EmailContext = { storeUrl: 'https://s/cafe', heroImage: { src: 'https://h', alt: 'Café' }, nav: [], socials: [], address: null,
  policies: [{ key: 'returns', label: 'Cambios y devoluciones', href: 'https://s/cafe' }], contact: { email: 'hola@cafe.bo', phone: '+59170000000', whatsapp: true },
  delivers: true, review: null, promos: [], recommendations: () => [] };
const content: ResolvedContent = { announcement: 'Envío gratis desde Bs 300', heroImage: null, promo: null, story: null, note: 'Gracias por confiar.', recommendations: true };
const rich = (over = {}) => ({ ...data, delivery: null, ...over });

it('orders the sections: announcement, hero, items, address, steps, trust, quote, contact, signoff', () => {
  const calls = richReceiptCalls('order_confirmation', rich({ trackingUrl: 'https://t', delivery: { method: 'delivery', recipient: 'Ana', lines: ['Av. 1', 'La Paz'] } }), copy, ctx, content);
  expect(calls.map(c => c.block)).toEqual(['announce', 'hero', 'items', 'address', 'steps', 'trust', 'quote', 'contact', 'note']);
});
it('shows only the trust items the store actually offers', () => {
  const calls = richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, policies: [], delivers: false, contact: { email: null, phone: null, whatsapp: false } }, content);
  expect((calls.find(c => c.block === 'trust') as any).items.map((i: any) => i.label)).toEqual(['Pago seguro']);
});
it('a store with nothing set up still gets a complete email and no empty boxes', () => {
  const bare: EmailContext = { ...ctx, heroImage: null, policies: [], contact: { email: null, phone: null, whatsapp: false }, delivers: false };
  const calls = richReceiptCalls('order_confirmation', rich(), copy, bare, { ...content, announcement: null });
  expect(calls.map(c => c.block)).toEqual(['hero', 'items', 'steps', 'trust', 'quote', 'note']);
  expect((calls[0] as any).image).toBeNull();
});
it('pickup and appointment get their own box and steps', () => {
  const pickup = richReceiptCalls('order_confirmation', rich({ delivery: { method: 'pickup', location: 'Sucursal Centro' } }), copy, ctx, content);
  expect(pickup.find(c => c.block === 'address')).toMatchObject({ title: 'Retiro en tienda', lines: ['Sucursal Centro'] });
  expect((pickup.find(c => c.block === 'steps') as any).steps.at(-1).title).toBe('Listo para retirar');
  const appt = richReceiptCalls('appointment_confirmed', rich({ appointment: { name: 'Corte', date: '12/10/2026, 10:00' } }), copy, ctx, content);
  expect(appt.find(c => c.block === 'address')).toMatchObject({ title: 'Tu cita', lines: ['Corte', '12/10/2026, 10:00'] });
  expect((appt.find(c => c.block === 'steps') as any).steps.map((s: any) => s.title)).toEqual(['Confirmada', 'Recordatorio', 'Te esperamos']);
});
it('a delivery order without an address shows no empty box', () => {
  expect(richReceiptCalls('order_confirmation', rich({ delivery: { method: 'delivery', recipient: null, lines: [] } }), copy, ctx, content).map(c => c.block)).not.toContain('address');
});
it('uses a real review when there is one, else the store note signed by the store', () => {
  const withReview = richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, review: { text: 'Llegó perfecto', author: 'Ana', stars: 5 } }, content);
  expect(withReview.find(c => c.block === 'quote')).toMatchObject({ text: 'Llegó perfecto', author: 'Ana', stars: 5 });
  expect(richReceiptCalls('order_confirmation', rich(), copy, ctx, content).find(c => c.block === 'quote')).toMatchObject({ text: 'Gracias por confiar.', author: 'Café Illimani', stars: null });
});
it('adds promo, story and recommendations when present, each droppable in order', () => {
  const products = [{ name: 'A', price: '1', href: 'h', image: null }, { name: 'B', price: '1', href: 'h', image: null }];
  const calls = richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, recommendations: () => products },
    { ...content, promo: { code: 'VUELVE10', discount: '10% en tu próxima compra' }, story: { title: 'Sobre', text: 'Hecho a mano', image: null } });
  const drop = Object.fromEntries(calls.filter(c => c.drop !== undefined).map(c => [c.block, c.drop]));
  expect(drop).toMatchObject({ steps: 1, trust: 2, promo: 3, quote: 4, story: 5, products: 6 });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**

```ts
const STEPS: Record<'delivery' | 'pickup' | 'appointment', [EmailIcon, string][]> = {
  delivery: [['check', 'Confirmado'], ['box', 'Preparando'], ['truck', 'En camino']],
  pickup: [['check', 'Confirmado'], ['box', 'Preparando'], ['store', 'Listo para retirar']],
  appointment: [['check', 'Confirmada'], ['calendar', 'Recordatorio'], ['pin', 'Te esperamos']],
};

export function richReceiptCalls(type: EmailType, data: ReceiptData & { delivery: Delivery }, copy: ResolvedCopy, ctx: EmailContext, content: ResolvedContent): BlockCall[] {
  const calls: BlockCall[] = [];
  if (content.announcement) calls.push({ block: 'announce', text: content.announcement });
  calls.push({ block: 'hero', image: content.heroImage ?? ctx.heroImage, title: copy.headline, text: copy.intro, href: data.trackingUrl, label: data.trackingUrl ? copy.cta : null });
  if (type === 'appointment_confirmed' && data.appointment) calls.push({ block: 'address', title: 'Tu cita', lines: [data.appointment.name, data.appointment.date].filter((x): x is string => !!x) });
  if (data.items.length) calls.push({ block: 'items', items: data.items, total: data.total, originalTotal: data.originalTotal });
  const d = data.delivery;
  if (d?.method === 'delivery' && (d.recipient || d.lines.length)) calls.push({ block: 'address', title: 'Envío a', lines: [d.recipient, ...d.lines].filter((x): x is string => !!x) });
  if (d?.method === 'pickup') calls.push({ block: 'address', title: 'Retiro en tienda', lines: [d.location ?? data.storeName] });
  const flow = type === 'appointment_confirmed' ? 'appointment' : d?.method === 'pickup' ? 'pickup' : 'delivery';
  calls.push({ block: 'steps', steps: STEPS[flow].map(([icon, title]) => ({ icon, title })), drop: 1 });
  const trust: { icon: EmailIcon; label: string }[] = [{ icon: 'lock', label: 'Pago seguro' }];
  if (ctx.policies.some(p => p.key === 'returns')) trust.push({ icon: 'return', label: 'Cambios y devoluciones' });
  if (ctx.delivers) trust.push({ icon: 'truck', label: 'Envíos' });
  if (ctx.contact.email || ctx.contact.phone) trust.push({ icon: 'chat', label: 'Atención personalizada' });
  calls.push({ block: 'trust', items: trust, drop: 2 });
  if (content.promo) calls.push({ block: 'promo', code: content.promo.code, discount: content.promo.discount, text: null, drop: 3 });
  calls.push(ctx.review
    ? { block: 'quote', text: ctx.review.text, author: ctx.review.author, stars: ctx.review.stars, drop: 4 }
    : { block: 'quote', text: content.note, author: data.storeName, stars: null, drop: 4 });
  if (content.story) calls.push({ block: 'story', ...content.story, drop: 5 });
  const recs = content.recommendations ? ctx.recommendations(data.items.map(i => i.productId ?? '').filter(Boolean)) : [];
  if (recs.length) calls.push({ block: 'heading', title: copy.recommendTitle, text: null, drop: 6 }, { block: 'products', products: recs, drop: 6 });
  const cards: { icon: EmailIcon; label: string; value: string; href: string }[] = [];
  if (ctx.contact.email) cards.push({ icon: 'mail', label: 'Escríbenos', value: ctx.contact.email, href: `mailto:${ctx.contact.email}` });
  if (ctx.contact.phone) cards.push(ctx.contact.whatsapp
    ? { icon: 'whatsapp', label: 'WhatsApp', value: ctx.contact.phone, href: `https://wa.me/${ctx.contact.phone.replace(/\D/g, '')}` }
    : { icon: 'phone', label: 'Llámanos', value: ctx.contact.phone, href: `tel:${ctx.contact.phone.replace(/[^\d+]/g, '')}` });
  if (cards.length) calls.push({ block: 'contact', title: copy.helpTitle, cards });
  if (data.subscription) {
    const line = data.subscription.trim();
    calls.push({ block: 'note', text: /autom[aá]tic/i.test(line) ? line : `${line} No se cobra automáticamente.` });
  }
  calls.push({ block: 'note', text: `${copy.signoff} Orden: ${data.orderId}` });
  return calls;
}
```

`richReceiptCalls` needs `EmailContext` from Task 5 and `EmailIcon` from Task 1 (type imports only).

- [ ] **Step 4:** PASS. **Commit:** `feat(store-emails): the 13-section receipt recipe`.

---

### Task 7: Storage — promo switch and merchant content

**Files:** Modify `apps/api/prisma/schema.prisma`; Create `apps/api/prisma/migrations/20261007180000_store_email_content/migration.sql`, `apps/api/src/store-emails/email-content-store.ts` (+ spec); Modify `apps/api/src/promo-codes/dto/update-promo-code.dto.ts`, `promo-codes.service.ts` (+ spec), `promo-codes.controller.ts`.

**Interfaces:**
- `PromoCode.showInEmails Boolean @default(false)`; `PATCH …/promo-codes/:id` accepts `{ isActive?: boolean; showInEmails?: boolean }`, at least one.
- `model StoreEmailContent { storeId String @id; store Store @relation(fields: [storeId], references: [id], onDelete: Cascade); data Json @default("{}"); updatedAt DateTime @updatedAt }` and `emailContent StoreEmailContent?` on `Store`.
- ```ts
  export type ContentItem = 'announcement' | 'heroImage' | 'promo' | 'story' | 'note' | 'recommendations';
  export type SwitchItem = 'announcement' | 'promo' | 'story' | 'recommendations';
  export type StoredContent = {
    announcement?: { text: string } | { off: true }; heroImage?: { url: string }; promo?: { promoCodeId: string | null };
    story?: { title: string; text: string; imageUrl: string | null } | { off: true }; note?: { text: string }; recommendations?: { on: boolean };
    emails?: Partial<Record<EmailType, Partial<Record<SwitchItem, boolean>>>>;
  };
  @Injectable() export class EmailContentStore {
    get(storeId: string): Promise<StoredContent>;
    set(storeId: string, item: ContentItem, value: unknown): Promise<StoredContent>;
    clear(storeId: string, item: ContentItem): Promise<StoredContent>;
    setSwitch(storeId: string, type: EmailType, item: SwitchItem, on: boolean): Promise<StoredContent>;
  }
  ```
  Validation in `set`: text items via `cleanCopyValue` with caps announcement 90, note 200, story title 60 / text 300 (empty → `BadRequestException('Escribe un texto.')`; only facts → `BadRequestException('Ese texto solo tenía datos que pone la plataforma (montos, fechas o números de orden).')`); `{ off: true }` allowed for announcement and story; `heroImage.url` and `story.imageUrl` must match `/^\/v1\/uploads\/[A-Za-z0-9._-]+$/`; `promo.promoCodeId` is a string or null; `recommendations.on` a boolean; anything else → 400.

- [ ] **Step 1: Schema + SQL** (then only `npx prisma generate`):

```sql
ALTER TABLE "PromoCode" ADD COLUMN "showInEmails" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "StoreEmailContent" (
  "storeId" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreEmailContent_pkey" PRIMARY KEY ("storeId")
);
ALTER TABLE "StoreEmailContent" ADD CONSTRAINT "StoreEmailContent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 2: Failing tests** (`email-content-store.spec.ts`, prisma mocked with an in-memory `findUnique`/`upsert`):

```ts
it('keeps the merchant announcement cleaned, and refuses one that is only a fact', async () => {
  await store.set('s', 'announcement', { text: 'Envío gratis todo octubre' });
  expect((await store.get('s')).announcement).toEqual({ text: 'Envío gratis todo octubre' });
  await expect(store.set('s', 'announcement', { text: 'Bs 300' })).rejects.toBeInstanceOf(BadRequestException);
});
it('refuses a photo that is not one of the store uploads', async () => {
  await expect(store.set('s', 'heroImage', { url: 'https://evil.example/x.png' })).rejects.toBeInstanceOf(BadRequestException);
});
it('clears one item without touching the others, and keeps per-email switches', async () => {
  await store.set('s', 'note', { text: 'Gracias por elegirnos' });
  await store.setSwitch('s', 'appointment_confirmed', 'promo', false);
  await store.clear('s', 'note');
  expect(await store.get('s')).toEqual({ emails: { appointment_confirmed: { promo: false } } });
});
it('caps the story', async () => {
  await store.set('s', 'story', { title: 't'.repeat(70), text: 'Hecho a mano', imageUrl: null });
  expect(((await store.get('s')).story as any).title).toHaveLength(60);
});
```

and in `promo-codes.service.spec.ts`: `setFlags('m','s','id',{ showInEmails: true })` updates only `showInEmails`; `{}` rejects with `BadRequestException`.

- [ ] **Step 3: Implement** (whole-JSON upsert per store; promo DTO both fields `@IsOptional() @IsBoolean()`; service `setFlags`; controller calls it; keep `setActive` if other callers use it — `grep -rn "setActive(" apps/api/src`).
- [ ] **Step 4:** `npx jest src/store-emails src/promo-codes && npx tsc --noEmit -p tsconfig.json` — PASS. **Commit:** `feat(store-emails): merchant email content and a Mostrar en correos switch on promo codes (migration, not applied)`.

---

### Task 8: Wiring it into the receipt

**Files:** Modify `store-email.service.ts` (+ spec), `store-email.module.ts`, `apps/api/src/payment-intents/payment-intents.service.ts`, `payment-intents.order-email.spec.ts`.

**Interfaces:**
- `ReceiptInput` gains `delivery?: Delivery` (default `null`).
- `renderReceipt` loads `loadEmailContext(this.prisma, storeId, { assetBase: this.base(), checkoutOrigin })` (guarded: on failure use an empty context with a repair) and `EmailContentStore.get` (guarded: `{}`), resolves `ResolvedContent` with `resolveContent(type, stored, ctx, copy, storeName, base)`:
  - announcement: per-email switch `false` or `{ off: true }` → null; `{ text }` → it; else `copy.announcement`.
  - heroImage: `{ url }` → `emailImageUrl(url, base)` as `{ src, alt: storeName }`; else null.
  - promo: per-email switch `false` → null; `promoCodeId === null` → null; a `promoCodeId` → that code **only if it is in `ctx.promos`**; else `ctx.promos[0] ?? null`.
  - story: `{ off: true }` or switch `false` → null; stored → it (image via `emailImageUrl`); else `{ title: copy.storyTitle, text: copy.storyText, image: null }`.
  - note: `{ text }` → it; else `copy.note`.
  - recommendations: `stored.recommendations?.on !== false && switch !== false`.
  - renders with `richReceiptCalls` and `assembleWithinBudget`; `LayoutData` gets `nav`, `socials`, `address`, `policies` from the context, `storeUrl: ctx.storeUrl`, `iconBase: this.base()`; items carry `productId: line.paymentLinkId`.
- `sampleReceipt` adds `delivery`: `{ method: 'delivery', recipient: 'Ana Quispe', lines: ['Av. 6 de Agosto 123', 'La Paz'] }`.
- `payment-intents.service.ts`: the order lookup selects `fulfillmentMethod, fulfillmentLocationName, recipientName, shippingStreet, shippingCity, shippingDepartment, shippingReferences` and passes `delivery` (`'pickup'` → `{ method: 'pickup', location: fulfillmentLocationName }`; `'delivery'` → `{ method: 'delivery', recipient: recipientName, lines: [shippingStreet, shippingReferences, [shippingCity, shippingDepartment].filter(Boolean).join(', ')].filter(Boolean) }`; else null). Text body untouched.

- [ ] **Step 1: Failing tests** (extend the service harness with mocks for the context queries — or `jest.spyOn(contextModule, 'loadEmailContext')` returning a fixed context — and a `content.get` mock):

```ts
it('a promo picked in Correos but since switched off is not sent', async () => {
  // stored { promo: { promoCodeId: 'p1' } }, ctx.promos [] → html lacks 'VUELVE10'
});
it('the latest shared code goes out by default', async () => {
  // ctx.promos [{ id: 'p2', code: 'VUELVE10', discount: '10% en tu próxima compra' }] → html contains both
});
it('a per-email switch hides the promo on appointments only', async () => {
  // emails.appointment_confirmed.promo false → appointment lacks the code, order keeps it
});
it('renders the hero photo, the delivery box and contact cards from real data', async () => {
  // ctx hero src, delivery { method: 'delivery', recipient: 'Ana', lines: ['Av. 1'] }, contact email/whatsapp → 'Envío a', 'Av. 1', 'hola@cafe.bo', 'whatsapp-'
});
it('a content lookup failure still sends the full email', async () => {
  // content.get rejects → html contains the items; repairs mention 'content lookup failed'
});
```

and in `payment-intents.order-email.spec.ts`, the order mock returns delivery fields; assert `renderReceipt.mock.calls[0][1].delivery` equals `{ method: 'delivery', recipient: 'Ana', lines: ['Av. 1', 'La Paz'] }` and the body is still byte-identical.

- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npx jest src/store-emails src/payment-intents src/order-emails --maxWorkers=4 && npx tsc --noEmit -p tsconfig.json` — PASS. **Commit:** `feat(store-emails): receipts carry the store's photos, delivery, promo, review, story, recommendations and contact`.

---

### Task 9: The designer writes the full editorial kit

**Files:** Modify `email-kit-designer.ts` (+ spec).

- [ ] **Step 1: Failing test:**

```ts
it('asks for every new block and the tone marker, editorial like the references', () => {
  const prompt = emailKitPrompt(input);
  for (const needle of ['data-block="announce"', 'data-block="steps"', 'data-step', 'data-block="trust"', 'data-block="quote"', 'data-quote-text', 'data-block="story"', 'data-block="contact"', 'data-contact', 'data-tone="dark"', 'data-nav-link', 'data-social', 'data-store-address', 'data-policy-link', 'editorial', 'never write a review']) expect(prompt).toContain(needle);
  expect(prompt.length).toBeLessThan(48_000);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** extend `emailKitPrompt`: one line per new block with its slots (as `FACT_SLOTS`), the layout rows, "mark every block data-tone=\"dark\" when its background is dark, else data-tone=\"light\"", "a full editorial email like a premium brand's: an announcement bar, a header with links, a big hero, generous spacing, confident type, a coloured footer with social icons", copy keys `announcement, storyTitle, storyText, note, recommendTitle, helpTitle`, and "Leave the quote slots empty: the platform fills them with a real review; never write a review or testimonial." Raise `OUTPUT_TOKENS` to `18_000`; if `budget.reserve` refuses within 25 credits, raise `EMAIL_KIT_MAX_CREDITS` to 30 and note it. **Step 4:** PASS. **Commit:** `feat(store-emails): the designer writes the full editorial kit`.

---

### Task 10: Content routes

**Files:** Modify `store-email.controller.ts` (+ spec), `store-email.module.ts`.

**Interfaces** (under `v1/stores/:storeId/source-project/emails`, same guards and ownership check):

| Route | Body | Returns |
|---|---|---|
| `GET /content` | — | `{ available: boolean, content: StoredContent, promos: { id, code, discount, shared }[], photos: { url, label }[], defaults: { announcement, storyTitle, storyText, note } }` |
| `PUT /content/:item` | item value | `StoredContent` |
| `DELETE /content/:item` | — | `StoredContent` |
| `PUT /content/emails/:type/:item` | `{ on: boolean }` | `StoredContent` |

`promos` = every active code, `shared = showInEmails`, `discount` via `promoDiscountLabel`. `photos` = the store banner plus up to 12 product photos (uploads only), each `{ url, label }`. `defaults` = the active kit's resolved copy for `order_confirmation` with placeholders intact. Unknown item/type → 400. A lookup failure on `GET` → `{ available: false, … }` with empty content.

- [ ] **Step 1: Failing tests** (supertest, same harness as the stage-1 controller spec, plus `EmailContentStore` and `prisma.promoCode.findMany` / `paymentLink.findMany` / `store.findFirst` mocks): 404 when not owned; GET shape with `shared` flags; `PUT /content/announcement` delegates to the store; `PUT /content/heroImage` with a non-upload URL → 400 (the store throws); `PUT /content/emails/order_confirmation/promo` `{ on: false }`; unknown item → 400; content table missing → `available: false`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Commit:** `feat(store-emails): routes to edit the content of a store's emails`.

---

### Task 11: Dashboard — Contenido and the Descuentos switch

**Files:** Create `apps/merchant-dashboard/src/email-content-panel.mjs` (+ `.test.mjs`); Modify `src/email-studio-panel.mjs` (a `<div data-email-content-root>` below the wording form; mount the content panel there with an `onChange` that reloads the preview), `src/email-studio.css`, `src/dashboard.js` (promo rows: a `Mostrar en correos` toggle `data-promo-email="<id>"` sending `PATCH { showInEmails }`, and the row text "Se muestra en tus correos" when on), `server.mjs` allowlist, `tests/email-studio-panel.spec.mjs`.

**Interfaces:** `mountEmailContent(container, { api, base: () => string, type: () => string, onChange: () => void }): { load(): Promise<void> }`.

Layout:

```
Contenido de tus correos
Anuncio           [__________________ 0/90]  [☑ en este correo]   Editado por ti · restaurar
Foto principal    (Automática) (banner) (product photos…)            restaurar
Promoción         [Automática — VUELVE10 · 10% … ▾ | Ninguna | each shared code]  [☑ en este correo]
                  "Marca códigos con «Mostrar en correos» en Descuentos."
Mensaje de marca  Título [__ /60]  Texto [____ /300]  Foto (thumbnails)  [☑ en este correo]  [Quitar]
Nota de la tienda [________ /200]  (se usa cuando no hay reseñas publicadas)
Recomendaciones   [☑ Mostrar productos recomendados]  [☑ en este correo]
[Guardar contenido]
```

- [ ] **Step 1: Failing JSDOM tests** (pattern of `email-studio-panel.test.mjs`): loads `GET …/emails/content` and fills the fields; saving sends only changed items (`PUT …/content/announcement`…); restore sends `DELETE`; the per-email checkbox sends `PUT …/content/emails/<type>/<item>`; the promo select lists "Automática", "Ninguna" and only shared codes; every save calls `onChange`; `available: false` hides the panel. Browser test (in `tests/email-studio-panel.spec.mjs`, routing `/promo-codes`): toggling "Mostrar en correos" on a code sends `PATCH { showInEmails: true }` and the row shows "Se muestra en tus correos".
- [ ] **Step 2:** FAIL. **Step 3:** implement in the style of `email-studio-panel.mjs` (one `state`, `render()` escaping with `esc`, a generation counter). **Step 4:** `npm run test:unit && npx tsc --noEmit -p tsconfig.json && npx playwright test tests/email-studio-panel.spec.mjs` — PASS. **Commit:** `feat(store-emails): merchants edit their email content and choose which codes emails may share`.

---

### Task 12: Hand-off note and the real Gmail check

**Files:** Modify `docs/superpowers/notes/2026-10-07-store-email-testing.md`.

- [ ] Add: the second migration (`20261007180000_store_email_content`) — back up, then `npx prisma migrate deploy` (applies both); the icon build command (only when icons change); the tunnel steps together with `EMAIL_TEST_TO`; a checklist for the Gmail look (desktop and phone, light and dark mode, photos and icons loaded, each section present or correctly hidden).
- [ ] If the owner opens a tunnel during execution, send one test per receipt and attach screenshots; otherwise record that it is pending.
- [ ] **Commit:** `docs(store-emails): rich emails — migration, icons and the Gmail check`.

---

## Verification

- [ ] `cd apps/api && npx tsc --noEmit -p tsconfig.json` — clean
- [ ] `cd apps/api && npx jest src/store-emails src/promo-codes src/order-emails src/payment-intents src/config --maxWorkers=4` — pass
- [ ] `cd apps/merchant-dashboard && npm run test:unit && npx tsc --noEmit -p tsconfig.json && npx playwright test tests/email-studio-panel.spec.mjs tests/store-settings-tabs.spec.mjs` — pass
- [ ] `node packages/storefront-kit/kit/check-runtimes.mjs` — pass
- [ ] Owner: both migrations applied; one Gmail test per receipt through the tunnel.
