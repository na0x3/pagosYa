# Showcase Stores and the Header Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A business that does not sell online gets a showcase site: no catalog, cart, search or account, and every call to action leads to its main action. Every new Sep-5 store, shop or showcase, gets a real platform header in the shape its frame draw picked.

**Architecture:** The 10 drawn header shapes become kit templates (`packages/storefront-kit/kit/headers/<shape>.html`) plus one token-only stylesheet. The API renders them through `renderSourceHeader`, and the kit runtime (`commerce.js`) owns the menu. YAPI now writes only `<header data-pagosya-header></header>` and marks menu sections with `data-nav-label`. A save step, `withSourceHeader`, draws the drawn shape into that slot on every page, in `acceptCandidate` (so the preview, the self-review capture and the header-clickable gate all see it) and again in `assembleSave` (so the kit commerce pages get it too). A showcase is `sitePurpose: 'service'` plus a `primaryAction` kept in `config.js`. The Sep-5 author, the standard-page set, the kit footer, the setup form and the style cards all follow it.

Choices this plan fixes where the spec left room (simplest consistent option each time):
- **Where `primaryAction` lives.** It is a top-level key of `window.PAGOSYA_CONFIG` in `config.js`, next to `sitePurpose`, and every save carries it forward. A new store takes its first value from the setup form's answer, which is saved in the existing `Store.onboarding` JSON column. No migration is needed. It cannot live in the brief: `brief.primaryAction` is already a required text field, and `sourceProjectSnapshot` keeps only known brief keys.
- **Contact leads already reach the panel, so no new lead model is added.** The kit launcher posts `{ items: [], name, email, phone, message }` to `POST /v1/stores/public/:slug/leads`. `StoreCheckoutService.submitLead` saves a `StoreLead` with `items: []`, emails the merchant, and opens an inbox thread («Consulta desde la tienda»). The dashboard lists those leads from `GET /stores/:id/inbox`. Task 9 pins that path with a test. Choosing «Formulario de contacto» in setup turns on `Store.contactFormEnabled`.
- **Header CSS is inlined.** Each rendered header carries the kit stylesheet as `<style data-pagosya-header-style>`. This adds no new store file, and it renders the same in the Studio preview, the review capture, the style cards and the exported site.
- **The edit base drops the header.** For an edit, `oldFiles` (what YAPI sees and edits) has every platform header collapsed back to the empty slot. The edit therefore never touches platform markup, and the save draws the header again. If an edit deletes the slot from a page that had one, the slot is put back.
- **The Sep-5 author no longer gets the frame's header and cart lines.** `framePlatformHeader` strips them, because the platform builds those parts now. The agent (React) path is unchanged.
- **The main-action choice appears only for a showcase.** A shop's main action is its catalog and cart.
- **Unusable actions fall back to the form at generation time, without changing settings.** In that case `Store.contactFormEnabled` is left alone. The header's «Pide una cotización» link opens the form when the store has it on, and otherwise goes to `contacto.html`.
- **The style cards always preview the form label for a showcase.** The cards preview the drawn shape, but the setup answer is not stored on the proposal, so a showcase card shows «Pide una cotización».
- **The info bar uses a real fact.** That is the first sentence of `brief.businessInformation` that names hours, days or delivery, else the first location's address, else no bar at all.
- **Not infeasible, but a known risk.** A YAPI section sized `100vw` next to the side rail's 88px body padding can scroll sideways. The existing page-width fact reports it to the self-review.

**Tech Stack:** NestJS 11 + Prisma 5 (apps/api; Jest + ts-jest; jsdom borrowed from apps/checkout; Playwright chromium), the storefront kit's classic browser JS (packages/storefront-kit), the merchant dashboard's plain ES modules (node:test), and the Studio's vanilla TypeScript (Vitest 4).

**Spec:** `docs/superpowers/specs/2026-10-13-showcase-stores-and-header-library-design.md`

## Global Constraints

- Branch: stay on `feature/store-page-architecture`. Never switch branches; the owner's dev servers read this working tree.
- Database: never run `prisma migrate`, `prisma migrate diff`, `prisma migrate reset`, `prisma db push` or anything that writes to the dev DB. This plan needs no migration.
- Tests: run only the spec files named in each step, always with `--maxWorkers=2`. Never run a whole folder, `pnpm test`, or `npm test`.
- API tests: `cd /Users/saramia/pagosYa/apps/api && npx jest src/<path>.spec.ts --maxWorkers=2`. API typecheck: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`.
- Dashboard tests: `cd /Users/saramia/pagosYa/apps/merchant-dashboard && node --test src/onboarding-walkthrough.test.mjs`.
- Studio tests: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-style-pick.test.ts --maxWorkers=2`.
- Kit parse check: `cd /Users/saramia/pagosYa/packages/storefront-kit && node kit/check-runtimes.mjs`.
- Never touch `/Users/saramia/pagosYaWeb`. This repo uses pnpm.
- Copy, verbatim: «¿Vas a vender en línea?», «Sí, quiero vender», «No, solo mostrar mi negocio», «¿Qué hace el botón principal?», «WhatsApp», «Formulario de contacto», «Enlace de reservas», «Llamada». Header buttons: «Escríbenos» (WhatsApp), «Pide una cotización» (form), «Agenda una cita» (booking), «Llámanos» (phone).
- Showcase: saved as `sitePurpose: 'service'` plus `primaryAction: { kind: 'whatsapp' | 'form' | 'booking' | 'phone', value?: string }`.
  - Booking links must be https only.
  - With no choice, the default is WhatsApp when a number is given, otherwise the form.
  - An invalid action, or one with no usable value, becomes the form.
- Showcase pages: Inicio, Nosotros, Contacto, Preguntas frecuentes, Privacidad, Términos, Cookies, 404, and nothing else. That is `index.html`, `nosotros.html`, `contacto.html`, `faq.html`, `privacidad.html`, `terminos.html`, `cookies.html`, `404.html`.
  - Never added to a showcase: `acceso-*`, `cuenta-*`, `buscar.html`, `colecciones.html`, `envios.html`, `reembolsos.html`, `product.html`, `productos.html`, `coleccion.html`, `checkout.html`.
- Header shapes:
  - Calm: `centered-split`, `menu-button`, `info-bar`, `stacked`, `shrinking`.
  - Bold: `wordmark-band`, `side-rail`, `bottom-pill`, `overlay`, `reveal`.
  - An unknown or missing shape falls back to `menu-button` and is logged (`source_header_shape_fallback`).
- Header contract:
  - YAPI writes `<header data-pagosya-header></header>` as the first element of `<body>`, plus `data-nav-label="…"` (with an `id`) on menu sections.
  - Index links read `#id`; links on other pages read `index.html#id`, with `../` per folder level.
  - A page without a slot is left alone and logged once per run (`source_header_slot_missing`).
- Header styling comes only from the store tokens: `--store-*`, then `--brand-*`, then the legacy `--paper`/`--ink`/`--accent`.
- Header menu: focus moves into it, Escape closes it, and any scroll lock it set is always released on close.
- Unchanged:
  - Shop stores' Part A behaviour, apart from the new header.
  - Existing stores, until a redesign gives them the slot.
  - The header-clickable check (`header-clickable.ts`).
  - The Studio «Quiero crear» picker, which still offers all four purposes.
  - The agent/React path.
- Dev servers: the API reloads on save; the dashboard serves `src/*.mjs` directly; the Studio code is not changed (only a test is added), so no Studio rebuild is needed.

## Review Focus

1. **A YAPI edit deletes `<header data-pagosya-header>` from a page that had one.** The header must come back on the next save, not silently disappear. Test: Task 3, "puts back a slot an edit removed from a page that had one".
2. **A store name or menu label containing HTML or `$&`.** It must show as text, never as markup, and never be mangled by string replacement. Test: Task 1, "escapes the store name and labels it was given".
3. **A long store name on a 390px phone.** No header shape may make the page scroll sideways. Test: Task 2, "a long store name never makes the page wider than a 390px phone".
4. **A Bolivian mobile typed without its country code («70012345»).** The WhatsApp button must dial `59170012345`, not a dead number. Test: Task 1, "dials a Bolivian mobile typed without its country code".
5. **The menu closes while the page already had its own overflow value, or the shopper leaves with the menu open.** The page must get back exactly what it had and never stay locked. Tests: Task 2, "closes on a link inside it, on Cerrar and on the backdrop, and gives back the overflow the page already had" and "frees the page when the shopper leaves it with the menu open".

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/storefront-kit/kit/headers/headers.css` | Create | The one token-only stylesheet for every shape, desktop and phone (breakpoint 860px) |
| `packages/storefront-kit/kit/headers/<shape>.html` (10 files) | Create | One template per shape, using the placeholders `{{brand}} {{nav}} {{navStart}} {{navEnd}} {{tools}} {{cta}} {{toggle}} {{menu}} {{fact}}` |
| `packages/storefront-kit/kit/commerce.js` | Modify | Header behaviour (menu, focus, Escape, scroll lock, shrinking/reveal), `[data-pagosya-contact-open]`, showcase footer links |
| `apps/api/src/storefront-source/source-primary-action.ts` | Create | Resolve, link and persist a showcase's main action; the contact slot a showcase home needs |
| `apps/api/src/storefront-source/source-header.ts` | Create | `renderSourceHeader`, `withSourceHeader`, `emptySourceHeaders`, `headerFact`, `swapPreviewHeader`, the edit-prompt line |
| `apps/api/src/storefront-source/source-commerce-design.ts` | Modify | Stop copying the home header and its panels when the home header is the platform's |
| `apps/api/src/storefront-source/source-generation.service.ts` | Modify | Wire the header into accept and save, collapse the edit base, wire showcase purpose and action |
| `apps/api/src/storefront-source/design-engine/sep5-author.ts` | Modify | Platform shell, showcase shell, main action, purpose-aware usability, review wording |
| `apps/api/src/storefront-source/design-engine/sep5-review-capture.ts` | Modify | Stop wording header-contents facts |
| `apps/api/src/storefront-source/design-engine/frame-draw.ts` | Modify | `framePlatformHeader` |
| `apps/api/src/storefront-source/source-static-pages.ts` | Modify | `staticStandardPagePaths(purpose)`; `withStaticStandardPages(files, purpose)` |
| `apps/api/src/storefront-source/source-autorepair.ts` | Modify | `platformSuppliedPages` uses the purpose's page set |
| `apps/api/src/storefront-source/source-projects.service.ts` | Modify | «Agregar páginas estándar» adds the purpose's page set |
| `apps/api/src/storefront-source/source-style-proposal.ts` | Modify | Cards show the platform header in their drawn shape |
| `apps/api/src/storefront-source/source-chat.service.ts` | Modify | Pass the store name to the card view |
| `apps/api/src/stores/store-onboarding.ts`, `dto/store-onboarding.dto.ts`, `stores.service.ts` | Modify | The `sell` step, `purpose`, `primaryAction`, contact form on, showcase brief |
| `apps/merchant-dashboard/src/onboarding-walkthrough.mjs` (+ `.css`) | Modify | Guess, sell step, products skip, main-action choice, `sitePurpose: 'service'` job |
| Tests | Create/Modify | `source-primary-action.spec.ts`, `source-header.spec.ts`, `source-header-runtime.spec.ts`, `source-header-browser.spec.ts`, `source-generation-header.spec.ts`, `source-commerce-showcase.spec.ts`, `stores/store-contact-lead.spec.ts`, plus updates to `sep5-author.spec.ts`, `sep5-review-capture.spec.ts`, `frame-draw.spec.ts`, `source-generation-style.spec.ts`, `source-static-pages.spec.ts`, `source-autorepair.spec.ts`, `source-projects.service.spec.ts`, `source-commerce-design.spec.ts`, `source-style-proposal.spec.ts`, `store-onboarding.spec.ts`, `onboarding-state.spec.ts`, `onboarding-walkthrough.test.mjs`, `source-style-pick.test.ts` |

Task order lands working software at each step: library → behaviour → save step → wiring → prompts → showcase pages → showcase author → showcase wiring → setup API → setup form → cards.

---
### Task 1: The header library (kit templates and stylesheet) and the main action

**Files:**
- Create: `packages/storefront-kit/kit/headers/headers.css`
- Create: `packages/storefront-kit/kit/headers/centered-split.html`, `menu-button.html`, `info-bar.html`, `stacked.html`, `shrinking.html`, `wordmark-band.html`, `side-rail.html`, `bottom-pill.html`, `overlay.html`, `reveal.html`
- Create: `apps/api/src/storefront-source/source-primary-action.ts`
- Create: `apps/api/src/storefront-source/source-header.ts`
- Test: `apps/api/src/storefront-source/source-primary-action.spec.ts`, `apps/api/src/storefront-source/source-header.spec.ts`

**Interfaces:**
- Consumes: `FRAME_CATALOGUE` (`design-engine/frame-draw.ts`), `CONVENTIONAL_HEADERS` (`design-engine/playbook.ts`), `kitPath` (`@pagosya/storefront-kit`), `SourceSitePurpose` (`source-site-purpose.ts`).
- Produces (later tasks rely on these exact names):
  - `PRIMARY_ACTION_KINDS = ['whatsapp', 'form', 'booking', 'phone'] as const`; `type PrimaryActionKind`; `type PrimaryAction = { kind: PrimaryActionKind; value?: string }`
  - `dialDigits(value: unknown): string | null`
  - `sourcePrimaryAction(saved: unknown, contactPhone?: string | null): PrimaryAction`
  - `primaryActionLink(action: PrimaryAction): { href: string; label: string; attributes: string }`
  - `HEADER_SHAPES` (readonly tuple of the 10 ids); `type HeaderShape`; `FALLBACK_HEADER_SHAPE: HeaderShape = 'menu-button'`; `type HeaderLink = { href: string; label: string }`
  - `renderSourceHeader(input: { shape: HeaderShape; purpose: SourceSitePurpose; storeName: string; links: HeaderLink[]; logoPath?: string; action?: PrimaryAction; fact?: string; search?: boolean; prefix?: string }): string`. The result starts with `<header data-pagosya-header data-shape="<shape>" data-purpose="shop|showcase" class="pyh pyh--<shape>">`. The hooks are `[data-pagosya-header-toggle]`, `[data-pagosya-header-menu]` (`hidden`) and `[data-pagosya-header-close]`. A showcase form action carries `data-pagosya-contact-open`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/source-primary-action.spec.ts`:

```ts
import { dialDigits, primaryActionLink, sourcePrimaryAction, PRIMARY_ACTION_KINDS } from './source-primary-action';

describe('a showcase main action (spec 2026-10-13)', () => {
  it('offers exactly WhatsApp, the contact form, a booking link and a phone call', () => {
    expect([...PRIMARY_ACTION_KINDS]).toEqual(['whatsapp', 'form', 'booking', 'phone']);
  });

  it('keeps a valid choice and normalises its value', () => {
    expect(sourcePrimaryAction({ kind: 'whatsapp', value: '+591 700-12345' })).toEqual({ kind: 'whatsapp', value: '59170012345' });
    expect(sourcePrimaryAction({ kind: 'phone', value: '+591 2 2441234' })).toEqual({ kind: 'phone', value: '59122441234' });
    expect(sourcePrimaryAction({ kind: 'booking', value: ' https://cal.com/estudio-deff ' })).toEqual({ kind: 'booking', value: 'https://cal.com/estudio-deff' });
    expect(sourcePrimaryAction({ kind: 'form' })).toEqual({ kind: 'form' });
  });

  it('uses the store number for a WhatsApp or phone choice saved without one', () => {
    expect(sourcePrimaryAction({ kind: 'whatsapp' }, '+591 71234567')).toEqual({ kind: 'whatsapp', value: '59171234567' });
  });

  it('turns an unusable or unknown choice into the contact form', () => {
    expect(sourcePrimaryAction({ kind: 'whatsapp' }, null)).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'phone', value: '123' })).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'booking', value: 'http://cal.com/x' })).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'booking', value: 'agenda conmigo' })).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'fax', value: '70012345' }, '+591 71234567')).toEqual({ kind: 'form' });
  });

  it('with no choice at all, uses WhatsApp when the store has a number, otherwise the form', () => {
    expect(sourcePrimaryAction(undefined, '+591 71234567')).toEqual({ kind: 'whatsapp', value: '59171234567' });
    expect(sourcePrimaryAction(undefined, null)).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction(null, '')).toEqual({ kind: 'form' });
  });

  it('dials a Bolivian mobile typed without its country code', () => {
    expect(dialDigits('70012345')).toBe('59170012345');
    expect(dialDigits('6 123 4567')).toBe('59161234567');
    expect(dialDigits('22441234')).toBe('22441234');
    expect(primaryActionLink(sourcePrimaryAction({ kind: 'whatsapp', value: '70012345' })).href).toBe('https://wa.me/59170012345');
  });

  it('links each action the same way for the header and the page', () => {
    expect(primaryActionLink({ kind: 'whatsapp', value: '59170012345' })).toEqual({ href: 'https://wa.me/59170012345', label: 'Escríbenos', attributes: ' target="_blank" rel="noopener"' });
    expect(primaryActionLink({ kind: 'form' })).toEqual({ href: 'contacto.html', label: 'Pide una cotización', attributes: ' data-pagosya-contact-open' });
    expect(primaryActionLink({ kind: 'booking', value: 'https://cal.com/deff' })).toEqual({ href: 'https://cal.com/deff', label: 'Agenda una cita', attributes: ' target="_blank" rel="noopener"' });
    expect(primaryActionLink({ kind: 'phone', value: '59122441234' })).toEqual({ href: 'tel:+59122441234', label: 'Llámanos', attributes: '' });
  });
});
```

Create `apps/api/src/storefront-source/source-header.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { FRAME_CATALOGUE } from './design-engine/frame-draw';
import { CONVENTIONAL_HEADERS } from './design-engine/playbook';
import { FALLBACK_HEADER_SHAPE, HEADER_SHAPES, renderSourceHeader, type HeaderShape } from './source-header';

const links = [{ href: '#servicios', label: 'Servicios' }, { href: 'nosotros.html', label: 'Nosotros' }];
const render = (shape: HeaderShape, purpose: 'shop' | 'service', extra: Partial<Parameters<typeof renderSourceHeader>[0]> = {}) =>
  renderSourceHeader({ shape, purpose, storeName: 'Estudio deff', links, action: { kind: 'whatsapp', value: '59170012345' }, fact: 'Atendemos de lunes a viernes.', search: true, ...extra });

describe('the platform header library (spec 2026-10-13)', () => {
  it('has one kit template for every drawn header shape, calm and bold as the catalogue draws them', () => {
    expect([...HEADER_SHAPES].sort()).toEqual(FRAME_CATALOGUE.header.map(entry => entry.id).sort());
    expect(FRAME_CATALOGUE.header.filter(entry => !entry.bold).map(entry => entry.id)).toEqual([...CONVENTIONAL_HEADERS]);
    for (const shape of HEADER_SHAPES) expect(readFileSync(kitPath('headers', `${shape}.html`), 'utf8')).toContain('{{menu}}');
    expect(FALLBACK_HEADER_SHAPE).toBe('menu-button');
  });

  it.each([...HEADER_SHAPES])('«%s» renders a shop header with Buscar, Mi cuenta, the kit cart and one menu', shape => {
    const html = render(shape, 'shop');
    expect(html.startsWith(`<header data-pagosya-header data-shape="${shape}" data-purpose="shop" class="pyh pyh--${shape}">`)).toBe(true);
    expect(html).toContain('<style data-pagosya-header-style>');
    expect(html).toContain('<span data-store-name>Estudio deff</span>');
    expect(html).toContain('href="buscar.html"');
    expect(html).toContain('data-pagosya-account="login"');
    expect(html).toContain('data-cart-open');
    expect(html).toContain('data-cart-count');
    expect(html.match(/data-pagosya-header-toggle/g)).toHaveLength(1);
    expect(html.match(/data-pagosya-header-menu/g)).toHaveLength(1);
    expect(html).toContain('id="pyh-menu" data-pagosya-header-menu hidden');
    expect(html).toContain('<a href="#servicios">Servicios</a>');
    expect(html).not.toContain('{{');
    expect(html.endsWith('</header>')).toBe(true);
  });

  it.each([...HEADER_SHAPES])('«%s» renders a showcase header around its main action, with no shop controls', shape => {
    const html = render(shape, 'service');
    expect(html).toContain(`data-shape="${shape}" data-purpose="showcase"`);
    expect(html).toContain('href="https://wa.me/59170012345" target="_blank" rel="noopener">Escríbenos</a>');
    expect(html).not.toContain('data-cart-open');
    expect(html).not.toContain('buscar.html');
    expect(html).not.toContain('data-pagosya-account');
  });

  it('shows the brief fact only in the info-bar shape, and no bar without a fact', () => {
    expect(render('info-bar', 'shop')).toContain('<p class="pyh-fact">Atendemos de lunes a viernes.</p>');
    expect(render('menu-button', 'shop')).not.toContain('class="pyh-fact"');
    expect(render('info-bar', 'shop', { fact: '  ' })).not.toContain('class="pyh-fact"');
  });

  it('styles itself only from the store tokens, and resets what a store rule for a bare header would leak in', () => {
    const css = readFileSync(kitPath('headers', 'headers.css'), 'utf8');
    expect(css).toContain('var(--store-background,var(--brand-background,var(--paper,');
    expect(css).toContain('var(--store-heading-font,var(--brand-heading-font,inherit))');
    expect(css).toMatch(/\.pyh\{all:initial;/);
    // A colour literal may appear only as the last fallback of a token chain.
    const withoutFallbacks = css.replace(/var\(--[\w-]+,(?:var\(--[\w-]+,)*#[0-9a-f]{3,8}\)+/gi, '');
    expect(withoutFallbacks).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('escapes the store name and labels it was given', () => {
    const html = render('menu-button', 'shop', { storeName: '<img src=x onerror=alert(1)> $& Café', links: [{ href: '#a"b', label: '<b>Menú</b>' }] });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; $&amp; Café');
    expect(html).toContain('&lt;b&gt;Menú&lt;/b&gt;');
    expect(html).toContain('href="#a&quot;b"');
  });

  it('prefixes its own links for a page in a folder, and leaves anchors and absolute links alone', () => {
    const html = renderSourceHeader({ shape: 'menu-button', purpose: 'service', storeName: 'deff', links: [{ href: 'index.html#servicios', label: 'Servicios' }, { href: '#arriba', label: 'Arriba' }], action: { kind: 'form' }, logoPath: 'assets/logo.png', prefix: '../' });
    expect(html).toContain('href="../index.html#servicios"');
    expect(html).toContain('href="#arriba"');
    expect(html).toContain('<a class="pyh-brand" href="../index.html"><img class="pyh-logo" src="../assets/logo.png" alt="">');
    expect(html).toContain('<a class="pyh-action" href="../contacto.html" data-pagosya-contact-open>Pide una cotización</a>');
    expect(renderSourceHeader({ shape: 'menu-button', purpose: 'service', storeName: 'deff', links: [], action: { kind: 'phone', value: '59122441234' }, prefix: '../' })).toContain('href="tel:+59122441234"');
  });

  it('leaves Buscar out when the store has no search page', () => {
    expect(render('centered-split', 'shop', { search: false })).not.toContain('buscar.html');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-primary-action.spec.ts src/storefront-source/source-header.spec.ts --maxWorkers=2`
Expected: FAIL with "Cannot find module './source-primary-action'" and "Cannot find module './source-header'".

- [ ] **Step 3: Write the main action module**

Create `apps/api/src/storefront-source/source-primary-action.ts`:

```ts
/**
 * A showcase store's main action (spec docs/superpowers/specs/2026-10-13-showcase-stores-and-header-library-design.md):
 * WhatsApp, the contact form, a booking link or a phone call. The setup form saves the merchant's answer in Store.onboarding;
 * every save keeps the resolved action in config.js as `primaryAction`, and the platform header and the page's calls to
 * action both use primaryActionLink, so they always agree. Anything unusable becomes the contact form.
 */
export const PRIMARY_ACTION_KINDS = ['whatsapp', 'form', 'booking', 'phone'] as const;
export type PrimaryActionKind = typeof PRIMARY_ACTION_KINDS[number];
export type PrimaryAction = { kind: PrimaryActionKind; value?: string };

/** Digits a wa.me or tel: link can dial. A Bolivian mobile typed without its country code (7xxxxxxx, 6xxxxxxx) gets 591. */
export function dialDigits(value: unknown): string | null {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  const full = digits.length === 8 && /^[67]/.test(digits) ? `591${digits}` : digits;
  return full.length >= 7 && full.length <= 15 ? full : null;
}

function bookingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.includes('.') ? url.href : null;
  } catch { return null; }
}

/** The action a store uses: its saved choice made usable, or, with no choice at all, WhatsApp when it has a number. */
export function sourcePrimaryAction(saved: unknown, contactPhone?: string | null): PrimaryAction {
  if (saved === undefined || saved === null) {
    const digits = dialDigits(contactPhone);
    return digits ? { kind: 'whatsapp', value: digits } : { kind: 'form' };
  }
  const choice = typeof saved === 'object' ? saved as { kind?: unknown; value?: unknown } : {};
  if (choice.kind === 'whatsapp' || choice.kind === 'phone') {
    const digits = dialDigits(choice.value) ?? dialDigits(contactPhone);
    return digits ? { kind: choice.kind, value: digits } : { kind: 'form' };
  }
  if (choice.kind === 'booking') {
    const url = bookingUrl(choice.value);
    return url ? { kind: 'booking', value: url } : { kind: 'form' };
  }
  return { kind: 'form' };
}

/** The action as a link. `attributes` is trusted markup; `href` is escaped by whoever writes it into HTML. */
export function primaryActionLink(action: PrimaryAction): { href: string; label: string; attributes: string } {
  switch (action.kind) {
    case 'whatsapp': return { href: `https://wa.me/${action.value}`, label: 'Escríbenos', attributes: ' target="_blank" rel="noopener"' };
    case 'booking': return { href: action.value ?? 'contacto.html', label: 'Agenda una cita', attributes: ' target="_blank" rel="noopener"' };
    case 'phone': return { href: `tel:+${action.value}`, label: 'Llámanos', attributes: '' };
    default: return { href: 'contacto.html', label: 'Pide una cotización', attributes: ' data-pagosya-contact-open' };
  }
}
```

- [ ] **Step 4: Write the kit stylesheet**

Create `packages/storefront-kit/kit/headers/headers.css` (one file; the renderer inlines it):

```css
.pyh{all:initial;display:block;position:sticky;top:0;z-index:1000;box-sizing:border-box;width:100%;--pyh-bg:var(--store-background,var(--brand-background,var(--paper,#ffffff)));--pyh-fg:var(--store-foreground,var(--brand-foreground,var(--ink,#161616)));--pyh-accent:var(--store-accent,var(--brand-accent,var(--accent,#161616)));--pyh-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,#ffffff));--pyh-line:color-mix(in srgb,var(--pyh-fg) 16%,transparent);background:var(--pyh-bg);color:var(--pyh-fg);font-family:var(--store-body-font,var(--brand-body-font,inherit));font-size:16px;line-height:1.3;border-bottom:1px solid var(--pyh-line)}
.pyh *,.pyh *::before,.pyh *::after{box-sizing:border-box}
.pyh [hidden]{display:none!important}
.pyh a{color:inherit;text-decoration:none}
.pyh button{all:unset;box-sizing:border-box;cursor:pointer;font:inherit;color:inherit}
.pyh :focus-visible{outline:3px solid var(--pyh-accent);outline-offset:3px}
.pyh .pyh-bar{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:68px;padding:12px clamp(16px,4vw,48px)}
.pyh .pyh-brand{display:inline-flex;align-items:center;gap:10px;min-width:0;min-height:44px;max-width:100%;font-family:var(--store-heading-font,var(--brand-heading-font,inherit));font-size:22px;font-weight:700;letter-spacing:-.01em}
.pyh .pyh-brand [data-store-name]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pyh .pyh-logo{display:block;flex:none;width:auto;height:40px;max-width:160px;object-fit:contain}
.pyh .pyh-nav{display:flex;flex-wrap:wrap;align-items:center;gap:0 24px;min-width:0}
.pyh .pyh-nav a,.pyh .pyh-tool{display:inline-flex;align-items:center;min-height:44px;font-size:15px;white-space:nowrap}
.pyh .pyh-nav a:hover,.pyh .pyh-tool:hover,.pyh .pyh-menu-link:hover{text-decoration:underline;text-underline-offset:5px}
.pyh .pyh-left,.pyh .pyh-right{display:flex;flex:none;align-items:center;gap:20px}
.pyh .pyh-cart,.pyh .pyh-action{display:inline-flex;flex:none;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 18px;border-radius:999px;background:var(--pyh-accent);color:var(--pyh-on-accent);font-size:15px;font-weight:700;white-space:nowrap}
.pyh .pyh-cart-count{min-width:1.2em;text-align:center;font-variant-numeric:tabular-nums}
.pyh .pyh-toggle{display:none;flex:none;align-items:center;justify-content:center;gap:10px;min-width:44px;min-height:44px;padding:0 14px;border:1.5px solid currentColor;border-radius:999px;font-size:15px;font-weight:600}
.pyh .pyh-toggle-bars{display:block;width:18px;height:2px;background:currentColor;box-shadow:0 -6px 0 currentColor,0 6px 0 currentColor}
.pyh .pyh-menu{position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:flex-end;background:rgb(0 0 0 / .4)}
.pyh .pyh-menu-panel{display:flex;flex-direction:column;gap:28px;width:min(420px,100%);height:100%;overflow:auto;padding:24px clamp(20px,4vw,40px);background:var(--pyh-bg);color:var(--pyh-fg)}
.pyh .pyh-close{display:inline-flex;align-self:flex-end;align-items:center;min-height:44px;padding:0 18px;border:1.5px solid currentColor;border-radius:999px;font-weight:600}
.pyh .pyh-menu-nav{display:flex;flex-direction:column;gap:4px}
.pyh .pyh-menu-nav a{display:flex;align-items:center;min-height:48px;font-family:var(--store-heading-font,var(--brand-heading-font,inherit));font-size:28px;font-weight:700;line-height:1.1}
.pyh .pyh-menu-tools{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding-top:20px;border-top:1px solid var(--pyh-line)}
.pyh .pyh-menu-link{display:inline-flex;align-items:center;min-height:44px;font-size:17px}
.pyh .pyh-menu-action{padding:0 20px;border-radius:999px;background:var(--pyh-accent);color:var(--pyh-on-accent);font-weight:700}
.pyh .pyh-fact{margin:0;padding:8px 16px;background:var(--pyh-accent);color:var(--pyh-on-accent);font-size:13px;line-height:1.4;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pyh--menu-button .pyh-toggle,.pyh--side-rail .pyh-toggle,.pyh--bottom-pill .pyh-toggle,.pyh--overlay .pyh-toggle{display:inline-flex}
.pyh--centered-split .pyh-bar{display:grid;grid-template-columns:1fr auto 1fr}
.pyh--centered-split .pyh-left{justify-self:start}
.pyh--centered-split .pyh-brand{justify-self:center;max-width:36vw}
.pyh--centered-split .pyh-right{justify-self:end}
.pyh--stacked .pyh-top{display:flex;justify-content:center;padding:20px clamp(16px,4vw,48px) 0;text-align:center}
.pyh--stacked .pyh-top .pyh-brand{font-size:clamp(28px,4vw,44px)}
.pyh--stacked .pyh-top .pyh-brand [data-store-name]{white-space:normal}
.pyh--stacked .pyh-bar{justify-content:center;min-height:56px}
.pyh--shrinking .pyh-bar{min-height:96px;transition:min-height .25s ease,padding .25s ease}
.pyh--shrinking .pyh-brand{font-size:clamp(26px,3.4vw,40px);transition:font-size .25s ease}
.pyh--shrinking[data-scrolled] .pyh-bar{min-height:60px;padding-top:6px;padding-bottom:6px}
.pyh--shrinking[data-scrolled] .pyh-brand{font-size:20px}
.pyh--wordmark-band{position:relative}
.pyh--wordmark-band .pyh-bar{min-height:52px;border-bottom:1px solid var(--pyh-line)}
.pyh--wordmark-band .pyh-word{overflow:hidden;padding:8px clamp(16px,4vw,48px) 16px}
.pyh--wordmark-band .pyh-word .pyh-brand{display:block;font-size:min(13vw,200px);font-weight:800;line-height:.9;letter-spacing:-.03em}
.pyh--wordmark-band .pyh-word .pyh-brand [data-store-name]{white-space:normal;overflow-wrap:break-word}
.pyh--bottom-pill{position:relative}
.pyh--bottom-pill .pyh-pill{position:fixed;left:50%;bottom:20px;z-index:1000;display:flex;align-items:center;gap:16px;max-width:calc(100vw - 32px);padding:8px 8px 8px 12px;transform:translateX(-50%);border-radius:999px;background:var(--pyh-fg);color:var(--pyh-bg);box-shadow:0 12px 32px -12px rgb(0 0 0 / .45)}
.pyh--bottom-pill .pyh-pill .pyh-nav a:nth-child(n+4){display:none}
body:has(.pyh--bottom-pill){padding-bottom:96px}
.pyh--reveal{transition:transform .3s ease}
.pyh--reveal[data-hidden]{transform:translateY(-100%)}
.pyh--overlay .pyh-menu{background:var(--pyh-bg)}
.pyh--overlay .pyh-menu-panel{width:100%;justify-content:center;padding:24px clamp(24px,8vw,120px)}
.pyh--overlay .pyh-close{position:absolute;top:20px;right:clamp(16px,4vw,48px)}
.pyh--overlay .pyh-menu-nav a{font-size:clamp(40px,8vw,96px);line-height:1}
@media (min-width:861px){
.pyh--side-rail{position:fixed;top:0;bottom:0;left:0;width:88px;border-bottom:0;border-right:1px solid var(--pyh-line)}
.pyh--side-rail .pyh-rail{display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:100%;padding:24px 8px}
.pyh--side-rail .pyh-rail>.pyh-brand{writing-mode:vertical-rl;transform:rotate(180deg);max-height:55vh;font-size:22px}
.pyh--side-rail .pyh-right{flex-direction:column;gap:12px}
.pyh--side-rail .pyh-toggle{padding:0}
.pyh--side-rail .pyh-toggle-label,.pyh--side-rail .pyh-cart-word{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pyh--side-rail .pyh-cart{padding:0 12px}
.pyh--side-rail .pyh-action{writing-mode:vertical-rl;transform:rotate(180deg);width:44px;min-height:0;padding:16px 0}
body:has(.pyh--side-rail){padding-left:88px}
}
@media (max-width:860px){
.pyh .pyh-bar,.pyh--side-rail .pyh-rail{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;padding:8px 16px}
.pyh .pyh-nav,.pyh .pyh-tool{display:none}
.pyh .pyh-toggle{display:inline-flex;padding:0}
.pyh .pyh-toggle-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pyh .pyh-brand{font-size:19px}
.pyh .pyh-cart,.pyh .pyh-action{padding:0 14px}
.pyh--centered-split .pyh-left{display:none}
.pyh--centered-split .pyh-brand{max-width:none}
.pyh--stacked .pyh-top{padding-top:14px}
.pyh--shrinking .pyh-bar{min-height:60px}
.pyh--bottom-pill .pyh-pill{left:16px;right:88px;justify-content:space-between;transform:none}
.pyh--bottom-pill .pyh-pill .pyh-nav{display:none}
}
@media (prefers-reduced-motion:reduce){.pyh,.pyh *{transition:none!important}}
```

Note for the reviewer: `.pyh--side-rail .pyh-rail` sits inside the phone media block so the rail becomes a slim top bar there; `body:has(...)` padding keeps the page clear of the fixed rail and the floating pill.

- [ ] **Step 5: Write the ten templates**

Each file is one line, with no trailing markup. The renderer fills `{{…}}` and drops any placeholder it does not know.

`packages/storefront-kit/kit/headers/centered-split.html`:
```html
<div class="pyh-bar">{{toggle}}<div class="pyh-left">{{navStart}}</div>{{brand}}<div class="pyh-right">{{navEnd}}{{tools}}{{cta}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/menu-button.html`:
```html
<div class="pyh-bar">{{brand}}<div class="pyh-right">{{cta}}{{toggle}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/info-bar.html`:
```html
{{fact}}<div class="pyh-bar">{{brand}}{{nav}}<div class="pyh-right">{{tools}}{{cta}}{{toggle}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/stacked.html`:
```html
<div class="pyh-top">{{brand}}</div><div class="pyh-bar">{{toggle}}{{nav}}<div class="pyh-right">{{tools}}{{cta}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/shrinking.html`:
```html
<div class="pyh-bar">{{brand}}{{nav}}<div class="pyh-right">{{tools}}{{cta}}{{toggle}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/wordmark-band.html`:
```html
<div class="pyh-bar">{{toggle}}{{nav}}<div class="pyh-right">{{tools}}{{cta}}</div></div><div class="pyh-word">{{brand}}</div>{{menu}}
```
`packages/storefront-kit/kit/headers/side-rail.html`:
```html
<div class="pyh-rail">{{brand}}<div class="pyh-right">{{toggle}}{{cta}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/bottom-pill.html`:
```html
<div class="pyh-bar">{{brand}}</div><div class="pyh-pill">{{toggle}}{{nav}}{{cta}}</div>{{menu}}
```
`packages/storefront-kit/kit/headers/overlay.html`:
```html
<div class="pyh-bar">{{brand}}<div class="pyh-right">{{cta}}{{toggle}}</div></div>{{menu}}
```
`packages/storefront-kit/kit/headers/reveal.html`:
```html
<div class="pyh-bar">{{brand}}{{nav}}<div class="pyh-right">{{tools}}{{cta}}{{toggle}}</div></div>{{menu}}
```

- [ ] **Step 6: Write the renderer**

Create `apps/api/src/storefront-source/source-header.ts`:

```ts
/**
 * The platform header library (spec docs/superpowers/specs/2026-10-13-showcase-stores-and-header-library-design.md, part B).
 * One kit template per drawn shape (packages/storefront-kit/kit/headers/<shape>.html) and one stylesheet that reads only the
 * store's tokens; the kit runtime (commerce.js) owns the menu. A shop header carries Buscar, Mi cuenta and the kit cart
 * (data-cart-open / data-cart-count); a showcase header carries the business's main action instead.
 */
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { primaryActionLink, type PrimaryAction } from './source-primary-action';
import type { SourceSitePurpose } from './source-site-purpose';

export const HEADER_SHAPES = ['centered-split', 'menu-button', 'info-bar', 'stacked', 'shrinking', 'wordmark-band', 'side-rail', 'bottom-pill', 'overlay', 'reveal'] as const;
export type HeaderShape = typeof HEADER_SHAPES[number];
/** The calm, safe shape for a store whose drawn shape is missing or unknown. */
export const FALLBACK_HEADER_SHAPE: HeaderShape = 'menu-button';
export type HeaderLink = { href: string; label: string };
export type RenderHeaderInput = {
  shape: HeaderShape; purpose: SourceSitePurpose; storeName: string; links: HeaderLink[];
  logoPath?: string; action?: PrimaryAction; fact?: string;
  /** False when the store has no buscar.html to link. */
  search?: boolean;
  /** '../' per folder level of the page the header goes on. */
  prefix?: string;
};

const kitFiles = new Map<string, string>();
const kitText = (file: string) => {
  if (!kitFiles.has(file)) kitFiles.set(file, readFileSync(kitPath('headers', file), 'utf8').trim());
  return kitFiles.get(file)!;
};
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A page-relative link gets the folder prefix; an anchor, an absolute URL, tel: or mailto: stays as it is. */
const local = (href: string, prefix: string) => /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href) ? href : prefix + href;

export function renderSourceHeader(input: RenderHeaderInput): string {
  const prefix = input.prefix ?? '';
  const showcase = input.purpose !== 'shop';
  const anchor = (link: HeaderLink) => `<a href="${escape(local(link.href, prefix))}">${escape(link.label)}</a>`;
  const nav = (items: HeaderLink[], label: string) => items.length ? `<nav class="pyh-nav" aria-label="${label}">${items.map(anchor).join('')}</nav>` : '';
  const half = Math.ceil(input.links.length / 2);
  const search = !showcase && input.search !== false;
  const link = showcase ? primaryActionLink(input.action ?? { kind: 'form' }) : null;
  const actionHref = link ? escape(local(link.href, prefix)) : '';
  const parts: Record<string, string> = {
    brand: `<a class="pyh-brand" href="${escape(prefix)}index.html">${input.logoPath ? `<img class="pyh-logo" src="${escape(local(input.logoPath, prefix))}" alt="">` : ''}<span data-store-name>${escape(input.storeName)}</span></a>`,
    nav: nav(input.links, 'Principal'),
    navStart: nav(input.links.slice(0, half), 'Principal'),
    navEnd: nav(input.links.slice(half), 'Más secciones'),
    tools: showcase ? '' : `${search ? `<a class="pyh-tool" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-tool" href="#" data-pagosya-account="login">Mi cuenta</a>`,
    cta: link
      ? `<a class="pyh-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
      : '<button type="button" class="pyh-cart" data-cart-open><span class="pyh-cart-word">Carrito</span> <span class="pyh-cart-count" data-cart-count>0</span></button>',
    toggle: '<button type="button" class="pyh-toggle" data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu"><span class="pyh-toggle-bars" aria-hidden="true"></span><span class="pyh-toggle-label">Menú</span></button>',
    menu: `<div class="pyh-menu" id="pyh-menu" data-pagosya-header-menu hidden><div class="pyh-menu-panel" role="dialog" aria-modal="true" aria-label="Menú"><button type="button" class="pyh-close" data-pagosya-header-close>Cerrar</button>${input.links.length ? `<nav class="pyh-menu-nav" aria-label="Menú">${input.links.map(anchor).join('')}</nav>` : ''}<div class="pyh-menu-tools">${link
      ? `<a class="pyh-menu-link pyh-menu-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
      : `${search ? `<a class="pyh-menu-link" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-menu-link" href="#" data-pagosya-account="login">Mi cuenta</a>`}</div></div></div>`,
    fact: input.fact?.trim() ? `<p class="pyh-fact">${escape(input.fact.trim())}</p>` : '',
  };
  // A callback, never a replacement string: a store name containing "$&" must stay literal.
  const body = kitText(`${input.shape}.html`).replace(/\{\{(\w+)\}\}/g, (_match, key: string) => parts[key] ?? '');
  return `<header data-pagosya-header data-shape="${input.shape}" data-purpose="${showcase ? 'showcase' : 'shop'}" class="pyh pyh--${input.shape}"><style data-pagosya-header-style>${kitText('headers.css')}</style>${body}</header>`;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-primary-action.spec.ts src/storefront-source/source-header.spec.ts --maxWorkers=2`
Expected: PASS (2 suites).

- [ ] **Step 8: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add packages/storefront-kit/kit/headers apps/api/src/storefront-source/source-primary-action.ts apps/api/src/storefront-source/source-primary-action.spec.ts apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-header.spec.ts
git commit -m "feat(kit): platform header library, ten shapes in shop and showcase versions"
```

---
### Task 2: The kit runs the header (menu, focus, Escape, scroll lock, contact opener)

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (insert before the line `  void loadCommerceContent();`, near the end of the file)
- Test: `apps/api/src/storefront-source/source-header-runtime.spec.ts` (jsdom), `apps/api/src/storefront-source/source-header-browser.spec.ts` (Chromium probes at 1440 and 390)

**Interfaces:**
- Consumes: `renderSourceHeader`, `HEADER_SHAPES`, `type HeaderShape` (Task 1); `measureHeaderCovers(page, { maxPositions })` (`design-engine/header-clickable.ts`).
- Produces (the DOM contract other tasks rely on):
  - **Menu.** Clicking `header[data-pagosya-header] [data-pagosya-header-toggle]` toggles `[data-pagosya-header-menu]`. On open, focus moves to the menu's first link or button and `document.documentElement.style.overflow` becomes `'hidden'`. Escape, Cerrar, the backdrop, any link inside the menu and `pagehide` all close it. On close the overflow goes back to the value it had before the menu opened.
  - **Scroll states.** The `shrinking` shape gets `data-scrolled` past 40px. The `reveal` shape gets `data-hidden` while scrolling down past 120px.
  - **Contact opener.** A click on any `[data-pagosya-contact-open]` opens the platform contact form when the store has one (`[data-pagosya-contact]:not([hidden]) [data-contact-toggle]`). Without one, the link is followed.

- [ ] **Step 1: Write the failing jsdom tests**

Create `apps/api/src/storefront-source/source-header-runtime.spec.ts`:

```ts
/// <reference lib="dom" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { renderSourceHeader, type HeaderShape } from './source-header';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const links = [{ href: '#servicios', label: 'Servicios' }, { href: '#nosotros', label: 'Nosotros' }];

/** A page with the platform header, run by the real kit runtime in preview. */
async function store(options: { shape?: HeaderShape; purpose?: 'shop' | 'service'; contact?: boolean; overflow?: string } = {}) {
  const purpose = options.purpose ?? 'shop';
  const header = renderSourceHeader({ shape: options.shape ?? 'menu-button', purpose, storeName: 'Marca', links, action: { kind: 'form' }, search: true });
  const dom = new JSDOM(`<html><head></head><body>${header}<main><section id="servicios" data-nav-label="Servicios"><a href="contacto.html" data-pagosya-contact-open>Cotiza tu proyecto</a></section>${options.contact ? '<section data-pagosya-contact hidden></section>' : ''}</main><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  if (options.overflow) w.document.documentElement.style.overflow = options.overflow;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', sitePurpose: purpose, data: { storeName: 'Marca', items: [], contactFormEnabled: Boolean(options.contact) } };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 30));
  return w;
}
const $ = (w: any, selector: string): any => w.document.querySelector(selector);
const click = (w: any, el: any) => { const event = new w.MouseEvent('click', { bubbles: true, cancelable: true }); el.dispatchEvent(event); return event; };
const key = (w: any, target: any, name: string, shiftKey = false) => { const event = new w.KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event; };
const scrollTo = (w: any, y: number) => { Object.defineProperty(w, 'scrollY', { value: y, configurable: true }); w.dispatchEvent(new w.Event('scroll')); };

describe('the platform header in the kit runtime (spec 2026-10-13)', () => {
  it('opens the menu with the focus inside it and the page locked, and Escape closes it, frees the page and returns the focus', async () => {
    const w = await store();
    const toggle = $(w, '[data-pagosya-header-toggle]'), menu = $(w, '[data-pagosya-header-menu]');
    click(w, toggle);
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(menu.contains(w.document.activeElement)).toBe(true);
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    expect(key(w, w.document, 'Escape').defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(w.document.documentElement.style.overflow).toBe('');
    expect(w.document.activeElement).toBe(toggle);
    w.close();
  });

  it('closes on a link inside it, on Cerrar and on the backdrop, and gives back the overflow the page already had', async () => {
    const w = await store({ overflow: 'scroll' });
    const toggle = $(w, '[data-pagosya-header-toggle]'), menu = $(w, '[data-pagosya-header-menu]');
    for (const target of [() => $(w, '.pyh-menu-nav a'), () => $(w, '[data-pagosya-header-close]'), () => menu]) {
      click(w, toggle);
      expect(w.document.documentElement.style.overflow).toBe('hidden');
      click(w, target());
      expect(menu.hidden).toBe(true);
      expect(w.document.documentElement.style.overflow).toBe('scroll');
    }
    w.close();
  });

  it('frees the page when the shopper leaves it with the menu open', async () => {
    const w = await store();
    click(w, $(w, '[data-pagosya-header-toggle]'));
    w.dispatchEvent(new w.Event('pagehide'));
    expect($(w, '[data-pagosya-header-menu]').hidden).toBe(true);
    expect(w.document.documentElement.style.overflow).toBe('');
    w.close();
  });

  it('keeps Tab inside the open menu', async () => {
    const w = await store();
    click(w, $(w, '[data-pagosya-header-toggle]'));
    const items = [...$(w, '[data-pagosya-header-menu]').querySelectorAll('a[href],button')];
    const first = items[0], last = items[items.length - 1];
    last.focus();
    expect(key(w, last, 'Tab').defaultPrevented).toBe(true);
    expect(w.document.activeElement).toBe(first);
    expect(key(w, first, 'Tab', true).defaultPrevented).toBe(true);
    expect(w.document.activeElement).toBe(last);
    w.close();
  });

  it('tightens the shrinking header once the page scrolls, and slides the reveal header away going down and back going up', async () => {
    const shrink = await store({ shape: 'shrinking' });
    scrollTo(shrink, 200);
    expect($(shrink, 'header[data-pagosya-header]').hasAttribute('data-scrolled')).toBe(true);
    scrollTo(shrink, 0);
    expect($(shrink, 'header[data-pagosya-header]').hasAttribute('data-scrolled')).toBe(false);
    const reveal = await store({ shape: 'reveal' });
    scrollTo(reveal, 400);
    expect($(reveal, 'header[data-pagosya-header]').hasAttribute('data-hidden')).toBe(true);
    scrollTo(reveal, 300);
    expect($(reveal, 'header[data-pagosya-header]').hasAttribute('data-hidden')).toBe(false);
    shrink.close(); reveal.close();
  });

  it('opens the platform contact form from the header action and any marked call to action, and follows the link without one', async () => {
    const w = await store({ purpose: 'service', contact: true });
    const launcher = $(w, '[data-pagosya-contact] [data-contact-toggle]');
    expect(launcher).not.toBeNull();
    expect(click(w, $(w, '.pyh-action')).defaultPrevented).toBe(true);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    click(w, $(w, 'main [data-pagosya-contact-open]'));
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    w.close();
    const bare = await store({ purpose: 'service' });
    expect(click(bare, $(bare, '.pyh-action')).defaultPrevented).toBe(false);
    bare.close();
  });
});
```

- [ ] **Step 2: Write the failing Chromium probes**

Create `apps/api/src/storefront-source/source-header-browser.spec.ts`:

```ts
/// <reference lib="dom" />
jest.setTimeout(180_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { HEADER_SHAPES, renderSourceHeader, type HeaderShape } from './source-header';
import { measureHeaderCovers } from './design-engine/header-clickable';

/** Spec 2026-10-13, part B testing: every shape × shop/showcase in a real browser at the widths part 1 probes (1440, 390). */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LONG = 'Estudio de Arquitectura y Diseño Interior Montenegro Hermanos';
const links = [{ href: '#servicios', label: 'Servicios' }, { href: '#proyectos', label: 'Proyectos' }, { href: '#nosotros', label: 'Nosotros' }, { href: '#equipo', label: 'Equipo' }];

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(shape: HeaderShape, purpose: 'shop' | 'service', width: number, storeName = 'Marca'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const header = renderSourceHeader({ shape, purpose, storeName, links, action: { kind: 'whatsapp', value: '59170000000' }, fact: 'Atendemos de lunes a viernes, de 9:00 a 18:00.', search: true });
  const css = ':root{--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff}body{margin:0;font-family:Georgia,serif}section{min-height:620px;padding:40px}';
  const body = `${header}<main><section id="servicios" data-nav-label="Servicios"><h1>Hola</h1></section><section id="proyectos" data-nav-label="Proyectos"></section><section id="nosotros" data-nav-label="Nosotros"></section></main><p data-pagosya-status></p>`;
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`);
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: purpose, data: { storeName, items: [] } };
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  return page;
}
const menuState = (page: Page) => page.evaluate(() => {
  const menu = document.querySelector('[data-pagosya-header-menu]') as HTMLElement;
  return { open: !menu.hidden, focusInside: Boolean(document.activeElement?.closest('[data-pagosya-header-menu]')), focusOnToggle: Boolean(document.activeElement?.matches('[data-pagosya-header-toggle]')), overflow: document.documentElement.style.overflow };
});

describe.each([...HEADER_SHAPES])('the «%s» platform header in a browser', shape => {
  it.each(['shop', 'service'] as const)('%s: every control can be clicked, nothing is wider than the screen, the cart or main action stays on the phone bar, and the menu gives the page back on Escape', async purpose => {
    for (const width of [1440, 390]) {
      const page = await open(shape, purpose, width);
      try {
        expect(await measureHeaderCovers(page, { maxPositions: 3 })).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect(await page.locator('header [data-cart-open], header .pyh-action').first().isVisible()).toBe(true);
        const toggle = page.locator('[data-pagosya-header-toggle]');
        if (await toggle.isVisible()) {
          await toggle.click();
          expect(await menuState(page)).toMatchObject({ open: true, focusInside: true, overflow: 'hidden' });
          await page.keyboard.press('Escape');
          expect(await menuState(page)).toEqual({ open: false, focusInside: false, focusOnToggle: true, overflow: '' });
        } else {
          // Only a desktop bar may keep its menu button out of sight; every phone layout opens through it.
          expect(width).toBe(1440);
        }
      } finally { await page.close(); }
    }
  });
});

it('a long store name never makes the page wider than a 390px phone', async () => {
  for (const shape of HEADER_SHAPES) for (const purpose of ['shop', 'service'] as const) {
    const page = await open(shape, purpose, 390, LONG);
    try {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > 390);
      expect({ shape, purpose, wide }).toEqual({ shape, purpose, wide: false });
    } finally { await page.close(); }
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-header-runtime.spec.ts src/storefront-source/source-header-browser.spec.ts --maxWorkers=2`
Expected: FAIL. In the runtime suite, `expect(menu.hidden).toBe(false)` fails (nothing opens the menu yet). In the browser suite, `menuState` reports `open: false` after the toggle click.

- [ ] **Step 4: Add the behaviour to the kit runtime**

In `packages/storefront-kit/kit/commerce.js`, find the line `  void loadCommerceContent();` (it appears once, two lines above the file's closing `})();`). Insert this block directly above it:

```js
  // ---- Platform header (spec 2026-10-13 showcase stores and the header library) ----
  // The platform writes the header (header[data-pagosya-header]); the kit owns how it behaves. One menu: it takes the focus
  // when it opens; Escape, its close button, its backdrop or any choice inside it closes it; Tab stays inside it; and the
  // scroll lock it set always goes back to what the page had (part 1: a lock left behind froze the page).
  function initPlatformHeader() {
    const header = document.querySelector('header[data-pagosya-header]');
    if (!header || header.hasAttribute('data-header-ready')) return;
    header.setAttribute('data-header-ready', '');
    const menu = header.querySelector('[data-pagosya-header-menu]');
    const toggles = [...header.querySelectorAll('[data-pagosya-header-toggle]')];
    const focusable = () => (menu ? [...menu.querySelectorAll('a[href],button:not([disabled])')] : []);
    let lockedFrom = null, opener = null;
    const isOpen = () => Boolean(menu && !menu.hidden);
    const setOpen = (open, returnFocus) => {
      if (!menu || open === isOpen()) return;
      menu.hidden = !open;
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', String(open)));
      if (open) {
        lockedFrom = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        (focusable()[0] || menu).focus({ preventScroll: true });
        return;
      }
      document.documentElement.style.overflow = lockedFrom || '';
      lockedFrom = null;
      if (returnFocus) (opener || toggles[0])?.focus({ preventScroll: true });
    };
    toggles.forEach(toggle => toggle.addEventListener('click', () => { opener = toggle; setOpen(!isOpen(), true); }));
    header.querySelector('[data-pagosya-header-close]')?.addEventListener('click', () => setOpen(false, true));
    menu?.addEventListener('click', event => {
      if (event.target === menu) setOpen(false, true);
      else if (event.target.closest('a[href],[data-cart-open],[data-pagosya-account]')) setOpen(false, false);
    });
    menu?.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && isOpen()) { event.preventDefault(); setOpen(false, true); } });
    window.addEventListener('pagehide', () => setOpen(false, false));
    const shape = header.getAttribute('data-shape');
    if (shape === 'shrinking' || shape === 'reveal') {
      let last = window.scrollY;
      const onScroll = () => {
        const y = window.scrollY;
        if (shape === 'shrinking') header.toggleAttribute('data-scrolled', y > 40);
        else header.toggleAttribute('data-hidden', y > 120 && y > last && !isOpen());
        last = y;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
  initPlatformHeader();
  // «Pide una cotización» in the header, and any call to action marked data-pagosya-contact-open, opens the platform contact
  // form; a store without the form keeps the link, which goes to its Contacto page.
  document.addEventListener('click', event => {
    const trigger = event.target.closest && event.target.closest('[data-pagosya-contact-open]');
    const launcher = trigger && document.querySelector('[data-pagosya-contact]:not([hidden]) [data-contact-toggle]');
    if (!launcher) return;
    event.preventDefault();
    if (launcher.getAttribute('aria-expanded') !== 'true') launcher.click();
  });
```

- [ ] **Step 5: Run the kit parse check and the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/packages/storefront-kit && node kit/check-runtimes.mjs`
Expected: `… storefront runtimes parsed cleanly.`

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-header-runtime.spec.ts src/storefront-source/source-header-browser.spec.ts --maxWorkers=2`
Expected: PASS (2 suites; the browser suite takes about a minute).

If a browser probe fails for one shape, the failure message names the shape, purpose and width. Fix the CSS for that shape in `packages/storefront-kit/kit/headers/headers.css`, keeping the colours token-only, and rerun only this command.

- [ ] **Step 6: Make sure the existing contact and cart behaviour still passes**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-commerce-info-pages.spec.ts src/storefront-source/source-commerce-responsive.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/saramia/pagosYa
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-header-runtime.spec.ts apps/api/src/storefront-source/source-header-browser.spec.ts
git commit -m "feat(kit): the runtime owns the platform header menu, its scroll states and the contact opener"
```

---
### Task 3: The save step `withSourceHeader`, which replaces the shared-header copy

**Files:**
- Modify: `apps/api/src/storefront-source/source-header.ts` (append)
- Modify: `apps/api/src/storefront-source/source-commerce-design.ts:37-43,71`
- Test: `apps/api/src/storefront-source/source-header.spec.ts` (append), `apps/api/src/storefront-source/source-commerce-design.spec.ts` (append)

**Interfaces:**
- Consumes: `renderSourceHeader`, `HEADER_SHAPES`, `FALLBACK_HEADER_SHAPE`, `type HeaderShape`, `type PrimaryAction` (Task 1); `ORDER_EMAIL_TEMPLATE_PATH` (`../order-emails/order-email-slots`).
- Produces:
  - `type SourceHeaderInput = { shape?: string; purpose: SourceSitePurpose; storeName: string; logoPath?: string; action?: PrimaryAction; fact?: string; platformPages?: string[]; previous?: Array<{ path: string; content: string }> }`
  - `withSourceHeader<F extends { path: string; content: string; encoding?: string }>(files: F[], input: SourceHeaderInput): { files: F[]; rendered: boolean; shape: HeaderShape; fallback: boolean; missing: string[] }`. `rendered` is false, and the files come back untouched, when `index.html` has no slot. `missing` lists the HTML pages left without a header.
  - `emptySourceHeaders<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[]`: every platform header goes back to `<header data-pagosya-header></header>`.
  - `headerFact(businessInformation: unknown, locations?: unknown[]): string`
  - `decodeEntities(value: string): string`; `elementAt(html: string, start: number): string | null`
  - `withSourceCommerceDesign` no longer copies the home header, or its panels, onto kit pages when that header has `data-pagosya-header`. The footer is still shared.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/source-header.spec.ts`. First extend its import from `./source-header` to:

```ts
import { emptySourceHeaders, FALLBACK_HEADER_SHAPE, headerFact, HEADER_SHAPES, renderSourceHeader, withSourceHeader, type HeaderShape } from './source-header';
```

Then append at the end of the file:

```ts
describe('withSourceHeader: the save step that draws the header on every page (spec 2026-10-13)', () => {
  const page = (main: string, header = '<header data-pagosya-header></header>') => `<!doctype html><html lang="es"><head><link rel="stylesheet" href="styles.css"></head><body>${header}<main>${main}</main><footer><p>deff</p></footer><script src="config.js" defer></script><script src="commerce.js" defer></script></body></html>`;
  const home = page('<section id="servicios" data-nav-label="Servicios"><h1>Arquitectura</h1></section><section id="obra" data-nav-label="Obra &amp; diseño"></section><section id="sin-menu"></section>');
  const site = () => [
    { path: 'index.html', content: home },
    { path: 'nosotros.html', content: page('<div data-pagosya-page="about"></div>') },
    { path: 'pages/equipo.html', content: page('<h1>Equipo</h1>') },
    { path: 'pages/viejo.html', content: page('<h1>Sin slot</h1>', '<header class="mio">Mío</header>') },
    { path: 'styles.css', content: 'body{}' },
  ];
  const input = { shape: 'stacked', purpose: 'shop' as const, storeName: 'deff', platformPages: ['buscar.html'] };
  const file = (files: Array<{ path: string; content: string }>, path: string) => files.find(entry => entry.path === path)!.content;

  it('draws the drawn shape into every page slot, linking the sections the home page marks', () => {
    const out = withSourceHeader(site(), input);
    expect(out).toMatchObject({ rendered: true, shape: 'stacked', fallback: false, missing: ['pages/viejo.html'] });
    expect(file(out.files, 'index.html')).toContain('<header data-pagosya-header data-shape="stacked" data-purpose="shop"');
    expect(file(out.files, 'index.html')).toContain('<a href="#servicios">Servicios</a>');
    expect(file(out.files, 'index.html')).toContain('<a href="#obra">Obra &amp; diseño</a>');
    expect(file(out.files, 'index.html')).not.toContain('href="#sin-menu"');
    expect(file(out.files, 'nosotros.html')).toContain('<a href="index.html#servicios">Servicios</a>');
    expect(file(out.files, 'pages/equipo.html')).toContain('<a href="../index.html#servicios">Servicios</a>');
    expect(file(out.files, 'pages/equipo.html')).toContain('<a class="pyh-brand" href="../index.html">');
    expect(file(out.files, 'pages/equipo.html')).toContain('href="../buscar.html"');
    expect(file(out.files, 'pages/viejo.html')).toBe(site()[3].content);
    expect(file(out.files, 'styles.css')).toBe('body{}');
  });

  it('renders the same bytes on every save', () => {
    const once = withSourceHeader(site(), input).files;
    expect(withSourceHeader(once, input).files).toEqual(once);
    expect(withSourceHeader(emptySourceHeaders(once), input).files).toEqual(once);
  });

  it('leaves an older store without a slot exactly as it was', () => {
    const older = site().map(entry => entry.path === 'index.html' ? { ...entry, content: page('<h1>Antes</h1>', '<header class="viejo">Viejo</header>') } : entry);
    const out = withSourceHeader(older, input);
    expect(out.rendered).toBe(false);
    expect(out.files).toBe(older);
    expect(out.missing).toEqual([]);
  });

  it('falls back to menu-button for an unknown or missing drawn shape', () => {
    for (const shape of ['zigzag', undefined]) {
      const out = withSourceHeader(site(), { ...input, shape });
      expect(out).toMatchObject({ shape: FALLBACK_HEADER_SHAPE, fallback: true });
      expect(file(out.files, 'index.html')).toContain('data-shape="menu-button"');
    }
  });

  it('turns a kit commerce page stock or copied header into the slot, and drops the panels the old copy brought along', () => {
    const kit = readFileSync(kitPath('product.html'), 'utf8');
    const copied = kit.replace(/<header class="commerce-header">[\s\S]*?<\/header>/, '<header class="site-header" data-pagosya-shared-shell="header"><button aria-controls="menu-panel">Menú</button></header>\n<div id="menu-panel" data-pagosya-shared-shell="header-panel"><a href="index.html#servicios">Servicios</a></div>');
    const out = withSourceHeader([...site(), { path: 'product.html', content: kit }, { path: 'productos.html', content: copied }], input);
    for (const path of ['product.html', 'productos.html']) {
      const html = file(out.files, path);
      expect(html).toContain('<header data-pagosya-header data-shape="stacked"');
      expect(html).toContain('<a href="index.html#servicios">Servicios</a>');
      expect(html).not.toContain('class="commerce-header"');
      expect(html).not.toContain('data-pagosya-shared-shell');
    }
  });

  it('puts back a slot an edit removed from a page that had one', () => {
    const edited = site().map(entry => entry.path === 'nosotros.html' ? { ...entry, content: entry.content.replace('<header data-pagosya-header></header>', '') } : entry);
    const out = withSourceHeader(edited, { ...input, previous: site() });
    expect(file(out.files, 'nosotros.html')).toContain('<body><header data-pagosya-header data-shape="stacked"');
    expect(out.missing).not.toContain('nosotros.html');
  });

  it('links the information pages that exist when no section is marked for the menu', () => {
    const plain = site().map(entry => entry.path === 'index.html' ? { ...entry, content: page('<section id="hola"><h1>Hola</h1></section>') } : entry);
    const html = file(withSourceHeader(plain, { ...input, purpose: 'service', platformPages: ['contacto.html'] }).files, 'index.html');
    expect(html).toContain('<a href="nosotros.html">Nosotros</a>');
    expect(html).toContain('<a href="contacto.html">Contacto</a>');
    expect(html).not.toContain('productos.html');
  });

  it('takes the info bar from one real fact in the brief, else the first address, else nothing', () => {
    expect(headerFact('Diseñamos casas. Atendemos de lunes a viernes de 9:00 a 18:00. Llámanos.')).toBe('Atendemos de lunes a viernes de 9:00 a 18:00.');
    expect(headerFact(`Hacemos envíos a toda Bolivia ${'con mucho cuidado '.repeat(10)}`).length).toBeLessThanOrEqual(90);
    expect(headerFact('Diseñamos casas.', [{ name: 'Estudio', address: 'Av. Arce 2020, La Paz' }])).toBe('Estamos en Av. Arce 2020, La Paz');
    expect(headerFact(undefined, [])).toBe('');
  });
});
```

Append to `apps/api/src/storefront-source/source-commerce-design.spec.ts`:

```ts
describe('Platform header (spec 2026-10-13)', () => {
  it('leaves a platform header to the save step: no header or panel copy, while the footer is still shared', async () => {
    const platformHome = home.replace(/<header class="site-header">[\s\S]*?<\/header>/, '<header data-pagosya-header data-shape="menu-button" class="pyh pyh--menu-button"><button aria-controls="pyh-menu">Menú</button><div id="pyh-menu" hidden></div></header>');
    const result = await withSourceCommerceDesign(files().map(file => file.path === 'index.html' ? { ...file, content: platformHome } : file));
    const page = result.find(file => file.path === 'product.html')!.content;
    expect(page).toContain('<header class="commerce-header">');
    expect(page).not.toContain('data-pagosya-shared-shell="header"');
    expect(page).not.toContain('data-pagosya-shared-shell="header-panel"');
    expect(page).toContain('class="site-footer"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-header.spec.ts src/storefront-source/source-commerce-design.spec.ts --maxWorkers=2`
Expected: FAIL. The header suite fails to compile with "Module './source-header' has no exported member 'withSourceHeader'". The commerce-design test fails on `expect(page).toContain('<header class="commerce-header">')`, because the platform header was copied.

- [ ] **Step 3: Write the save step**

First change the import at the top of `apps/api/src/storefront-source/source-header.ts`. Replace

```ts
import type { SourceSitePurpose } from './source-site-purpose';
```

with

```ts
import type { SourceSitePurpose } from './source-site-purpose';
import { ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';
```

Then append to the end of `apps/api/src/storefront-source/source-header.ts`:

```ts
const SLOT = /<header\b[^>]*\bdata-pagosya-header(?=[\s=>\/])[^>]*>/i;
const EMPTY_SLOT = '<header data-pagosya-header></header>';
/** The kit's stock commerce header, or the copy withSourceCommerceDesign used to put there. */
const STOCK_HEADER = /<header\b[^>]*(?:\bclass\s*=\s*["']commerce-header["']|\bdata-pagosya-shared-shell\s*=\s*["']header["'])[^>]*>/i;
const SHARED_PANEL = /<([a-z][\w-]*)\b[^>]*\bdata-pagosya-shared-shell\s*=\s*["']header-panel["'][^>]*>/i;
const KIT_PAGE = /data-pagosya-(?:product|checkout)-page|data-catalog-full/;
/** The words frameInputs counts as a fact (design-engine/frame-draw.ts): hours, days, delivery and pickup. */
const FACT_WORDS = /(horario|abrimos|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}:\d{2}|env[ií]o|delivery|entrega|recojo|retiro|pickup)/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
export const decodeEntities = (value: string) => value.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_match, name: string) => ENTITIES[name]);

/** The whole element that opens at `start`, counting nested tags of the same name; null when it never closes. */
export function elementAt(html: string, start: number): string | null {
  const open = html.slice(start).match(/^<([a-z][\w-]*)\b[^>]*>/i);
  if (!open) return null;
  const tags = new RegExp(`<(\\/?)${open[1]}\\b[^>]*>`, 'gi');
  tags.lastIndex = start + open[0].length;
  for (let depth = 1, tag: RegExpExecArray | null; (tag = tags.exec(html));) {
    if (tag[1]) depth -= 1; else if (!tag[0].endsWith('/>')) depth += 1;
    if (!depth) return html.slice(start, tags.lastIndex);
  }
  return null;
}

/** The element `pattern` finds, replaced by `replacement` (the whole element, nested tags included); null when absent. */
function replaceElement(html: string, pattern: RegExp, replacement: string): string | null {
  const match = pattern.exec(html);
  const whole = match ? elementAt(html, match.index) : null;
  return match && whole ? html.slice(0, match.index) + replacement + html.slice(match.index + whole.length) : null;
}

/** The sections index.html marks for the menu: data-nav-label with an id, in page order, at most six. */
function navSections(html: string): Array<{ id: string; label: string }> {
  const sections: Array<{ id: string; label: string }> = [];
  for (const match of html.matchAll(/<[a-z][\w-]*\b[^>]*\bdata-nav-label\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    const id = match[0].match(/\sid\s*=\s*(["'])([^"']+)\1/i)?.[2];
    const label = decodeEntities(match[2]).replace(/\s+/g, ' ').trim().slice(0, 40);
    if (id && label && !sections.some(section => section.id === id)) sections.push({ id, label });
    if (sections.length === 6) break;
  }
  return sections;
}

/** The info bar's one real fact (spec: "one real fact from the brief"): a sentence naming hours or delivery, else the address. */
export function headerFact(businessInformation: unknown, locations: unknown[] = []): string {
  const text = typeof businessInformation === 'string' ? businessInformation : '';
  const sentence = text.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).find(part => part && FACT_WORDS.test(part));
  if (sentence) return sentence.length > 90 ? `${sentence.slice(0, 88).replace(/\s+\S*$/, '')}…` : sentence;
  const place = locations.find((entry): entry is { address?: unknown } => Boolean(entry) && typeof entry === 'object');
  const address = typeof place?.address === 'string' ? place.address.trim() : '';
  return address ? `Estamos en ${address}`.slice(0, 90) : '';
}

/** Every page's platform header back to its empty slot: what an edit works on, so YAPI never edits platform markup. */
export function emptySourceHeaders<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  return files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path)) return file;
    const content = replaceElement(file.content, SLOT, EMPTY_SLOT);
    return content === null || content === file.content ? file : { ...file, content };
  });
}

export type SourceHeaderInput = {
  /** The drawn shape (frame-draw.json `header`); anything else falls back to FALLBACK_HEADER_SHAPE. */
  shape?: string; purpose: SourceSitePurpose; storeName: string; logoPath?: string; action?: PrimaryAction; fact?: string;
  /** Pages the platform adds after this step, so the header may link them (buscar.html, contacto.html…). */
  platformPages?: string[];
  /** The store's saved files: a page whose saved version had the slot gets it back if an edit removed it. */
  previous?: Array<{ path: string; content: string }>;
};

/**
 * The platform header on every HTML page of a static store (spec 2026-10-13, B2): the drawn shape, rendered from the store's
 * name, logo, purpose and action and the sections index.html marks with data-nav-label. A store whose index.html has no slot
 * (an older store) comes back untouched. Kit commerce pages trade their stock or copied header for the slot. Idempotent.
 */
export function withSourceHeader<F extends { path: string; content: string; encoding?: string }>(files: F[], input: SourceHeaderInput): { files: F[]; rendered: boolean; shape: HeaderShape; fallback: boolean; missing: string[] } {
  const known = (HEADER_SHAPES as readonly string[]).includes(input.shape ?? '');
  const shape = known ? input.shape as HeaderShape : FALLBACK_HEADER_SHAPE;
  const index = files.find(file => file.path === 'index.html' && file.encoding !== 'base64');
  if (!index || !SLOT.test(index.content)) return { files, rendered: false, shape, fallback: !known, missing: [] };
  const sections = navSections(index.content);
  const exists = new Set([...files.map(file => file.path), ...(input.platformPages ?? [])]);
  const pages: Array<[string, string]> = input.purpose === 'shop' ? [['productos.html', 'Productos'], ['nosotros.html', 'Nosotros'], ['contacto.html', 'Contacto']] : [['nosotros.html', 'Nosotros'], ['contacto.html', 'Contacto']];
  const pageLinks = pages.filter(([path]) => exists.has(path)).map(([href, label]) => ({ href, label }));
  const missing: string[] = [];
  const out = files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path) || file.path === ORDER_EMAIL_TEMPLATE_PATH) return file;
    let content = file.content;
    if (!SLOT.test(content) && KIT_PAGE.test(content)) content = replaceElement(content, STOCK_HEADER, EMPTY_SLOT) ?? content;
    if (!SLOT.test(content) && input.previous?.some(saved => saved.path === file.path && SLOT.test(saved.content))) content = content.replace(/<body\b[^>]*>/i, tag => `${tag}${EMPTY_SLOT}`);
    for (let panel = SHARED_PANEL.exec(content); panel; panel = SHARED_PANEL.exec(content)) {
      const whole = elementAt(content, panel.index) ?? panel[0];
      content = content.slice(0, panel.index) + content.slice(panel.index + whole.length);
    }
    const home = file.path === 'index.html';
    const links = sections.length ? sections.map(section => ({ href: home ? `#${section.id}` : `index.html#${section.id}`, label: section.label })) : pageLinks;
    const header = renderSourceHeader({ shape, purpose: input.purpose, storeName: input.storeName, links, logoPath: input.logoPath, action: input.action, fact: input.fact, search: exists.has('buscar.html'), prefix: '../'.repeat(file.path.split('/').length - 1) });
    const drawn = replaceElement(content, SLOT, header);
    if (drawn === null) { missing.push(file.path); return file; }
    return drawn === file.content ? file : { ...file, content: drawn };
  });
  return { files: out, rendered: true, shape, fallback: !known, missing };
}
```

- [ ] **Step 4: Stop copying a platform header onto kit pages**

In `apps/api/src/storefront-source/source-commerce-design.ts`, replace the line

```ts
  const homeHeader = block(home.split(/<main\b/i)[0], 'header');
```

with

```ts
  const homeHeader = block(home.split(/<main\b/i)[0], 'header');
  // Spec 2026-10-13: a platform header is drawn on every page by withSourceHeader at save, so it is never copied here, nor its panels.
  const platformHeader = Boolean(homeHeader && /^<header\b[^>]*\bdata-pagosya-header(?=[\s=>\/])/i.test(homeHeader));
```

Then replace

```ts
  const homePanels = homeHeader ? [...new Set(
```

with

```ts
  const homePanels = homeHeader && !platformHeader ? [...new Set(
```

and replace

```ts
    for (const [name, shared] of [['header', homeHeader], ['footer', homeFooter]] as const) {
```

with

```ts
    for (const [name, shared] of [['header', platformHeader ? undefined : homeHeader], ['footer', homeFooter]] as const) {
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-header.spec.ts src/storefront-source/source-commerce-design.spec.ts --maxWorkers=2`
Expected: PASS (2 suites, including the existing header-panel tests in `source-commerce-design.spec.ts`).

- [ ] **Step 6: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-header.spec.ts apps/api/src/storefront-source/source-commerce-design.ts apps/api/src/storefront-source/source-commerce-design.spec.ts
git commit -m "feat(api): withSourceHeader draws the platform header on every page and replaces the shared-header copy"
```

---
### Task 4: Wire the header into every static save

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`. These are the frame-draw import (line 18), the line after the review-capture import (line 9), the `oldFiles` line (~535), the task prompt list (~723), the lines before `acceptCandidate` (~887), the static-wiring block inside `acceptCandidate` (~936) and the `assembleSave` return (~1645).
- Modify: `apps/api/src/storefront-source/source-header.ts` (append `SOURCE_PLATFORM_HEADER_EDIT`)
- Test: `apps/api/src/storefront-source/source-generation-header.spec.ts` (create)

**Interfaces:**
- Consumes: `withSourceHeader`, `emptySourceHeaders`, `headerFact` (Task 3); `parseFrameDraw`, `FRAME_DRAW_FILE` (`design-engine/frame-draw.ts`); `platformSuppliedPages` (already imported in the service).
- Produces:
  - `SOURCE_PLATFORM_HEADER_EDIT: string`, added to static edit prompts when the store already has the slot.
  - A closure `platformHeader(files, platformPages)` inside `generate()`, which Task 8 extends with `action`.
  - The log events `source_header_shape_fallback` `{ generationId, drawn, shape }` and `source_header_slot_missing` `{ generationId, pages }`, each at most once per run.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/storefront-source/source-generation-header.spec.ts`:

```ts
// Spec 2026-10-13: a Sep-5 store saved with the platform header on every page (Task 4), and a showcase store (Task 8).
jest.setTimeout(60_000);

import { Logger } from '@nestjs/common';
import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';

// Pixel sampling and the header sweep launch Chromium; these tests exercise what the service saves.
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna() });
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(concept), selected: 0 }, 0, true, true);
const shell = (main: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><title>Inicio</title></head><body><header data-pagosya-header></header><main>${main}</main><footer><p>Pie</p></footer><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script></body></html>`;
const shopFiles = () => [
  { path: 'index.html', content: shell('<section id="menu" data-nav-label="Menú"><h1>Menú</h1><div data-pagosya-catalog></div></section><section id="historia" data-nav-label="Nuestra historia"><h2>Historia</h2></section><div data-pagosya-cart></div><p data-pagosya-status role="status" aria-live="polite"></p>') },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Menú primero' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;
const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 1000, output_tokens: 1000 } }));

function setup() {
  const prisma: any = {
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSourceGeneration: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe' }), findUnique: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = {
    prepare: jest.fn(async value => sourceProjectSnapshot(value)),
    current: jest.fn(async () => ({ revision: 0, slug: 'cafe' })),
    version: jest.fn(),
    save: jest.fn(async (_m: string, _s: string, value: any) => ({ revision: 1, label: value.label, digest: 'd', createdAt: new Date(), restoredFrom: null, createdProducts: [], updatedProducts: [], deletedProducts: [] })),
    recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]),
  };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': false }));
  const config: any = { get: jest.fn((key: string) => values.get(key)) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, projects };
}

describe('the platform header on a Sep-5 store', () => {
  let service: SourceGenerationService, prisma: any, projects: any, fetchMock: jest.SpyInstance, warn: jest.SpyInstance;
  const saved = () => projects.save.mock.calls[0][2].files as Array<{ path: string; content: string }>;
  const file = (path: string) => saved().find(entry => entry.path === path)?.content;
  const authorBody = () => fetchMock.mock.calls.map(call => JSON.parse(call[1].body)).find(body => body.text?.format?.name === 'independent_storefront');
  const warned = (event: string) => warn.mock.calls.some(([message]) => String(message).includes(`"event":"${event}"`));
  beforeEach(() => {
    ({ service, prisma, projects } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => answer({ label: 'Café', files: shopFiles(), products: [] }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves a shop with the drawn header (menu-button without a draw) on the home, standard and kit commerce pages', async () => {
    const result: any = await service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    expect(result.revision).toBe(1);
    expect(file('index.html')).toContain('<header data-pagosya-header data-shape="menu-button" data-purpose="shop"');
    expect(file('index.html')).toContain('<a href="#menu">Menú</a>');
    expect(file('index.html')).toContain('<a href="#historia">Nuestra historia</a>');
    expect(file('index.html')).toContain('data-cart-open');
    expect(file('index.html')).toContain('<span data-store-name>Café</span>');
    expect(file('nosotros.html')).toContain('<a href="index.html#menu">Menú</a>');
    expect(file('product.html')).toContain('<header data-pagosya-header data-shape="menu-button"');
    expect(file('product.html')).toContain('<a href="index.html#menu">Menú</a>');
    expect(file('product.html')).not.toContain('class="commerce-header"');
    expect(warned('source_header_shape_fallback')).toBe(true);
    expect(warned('source_header_slot_missing')).toBe(false);
    expect(prisma.storeSourceGeneration.create).toHaveBeenCalled();
    expect(authorBody()).toBeDefined();
  });

  it('leaves a store whose author wrote its own header alone, and says nothing about it', async () => {
    fetchMock.mockImplementation(async () => answer({ label: 'Café', files: shopFiles().map(entry => entry.path === 'index.html' ? { ...entry, content: entry.content.replace('<header data-pagosya-header></header>', '<header class="propio"><a href="index.html">Café</a></header>') } : entry), products: [] }));
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    expect(file('index.html')).toContain('<header class="propio">');
    expect(file('index.html')).not.toContain('data-pagosya-header');
    expect(warned('source_header_shape_fallback')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-header.spec.ts --maxWorkers=2`
Expected: FAIL. The first test fails on `expect(file('index.html')).toContain('<header data-pagosya-header data-shape="menu-button" data-purpose="shop"')`, because the slot is still empty.

- [ ] **Step 3: Add the edit-prompt line to the header module**

Append to `apps/api/src/storefront-source/source-header.ts`:

```ts
/** What a static edit of a store that has the slot must know: the header is the platform's, the menu comes from data-nav-label. */
export const SOURCE_PLATFORM_HEADER_EDIT = 'PLATFORM HEADER: <header data-pagosya-header></header> on every page is filled by the platform at save time with the store name, the menu and the store\'s actions. Leave that element empty and in place; never write, restyle or remove it. To change the menu, add or remove data-nav-label="…" (with an id) on the sections of index.html; to change its colours or fonts, change --store-background, --store-foreground, --store-accent, --store-accent-foreground, --store-heading-font or --store-body-font in styles.css.';
```

- [ ] **Step 4: Import the pieces in the generation service**

In `apps/api/src/storefront-source/source-generation.service.ts`, replace the line

```ts
import { asksForBold, designBrandCss, designCategory, frameForRun, frameFresh, frameInputs, storePhotoPaths } from './design-engine/frame-draw';
```

with

```ts
import { asksForBold, designBrandCss, designCategory, frameForRun, frameFresh, frameInputs, parseFrameDraw, storePhotoPaths, FRAME_DRAW_FILE } from './design-engine/frame-draw';
```

and directly below the line `import { captureSep5Draft, sep5MeasuredFacts } from './design-engine/sep5-review-capture';` add:

```ts
import { emptySourceHeaders, headerFact, SOURCE_PLATFORM_HEADER_EDIT, withSourceHeader } from './source-header';
```

- [ ] **Step 5: Collapse the platform header in the edit base**

Replace the line

```ts
    const oldFiles = previousFiles.filter((f: SourceProjectFileDto) => isNextSource(previousFiles) ? nextSourceFile(f.path) : /\.(html|css|js)$/.test(f.path) && !["config.js", "commerce.js", "brand.css"].includes(f.path));
```

with

```ts
    // Spec 2026-10-13: the platform header is drawn again at every save, so the files YAPI reads and edits carry only its empty slot.
    const oldFiles = emptySourceHeaders(previousFiles.filter((f: SourceProjectFileDto) => isNextSource(previousFiles) ? nextSourceFile(f.path) : /\.(html|css|js)$/.test(f.path) && !["config.js", "commerce.js", "brand.css"].includes(f.path)));
```

- [ ] **Step 6: Tell a static edit about the slot**

Replace the line

```ts
      sourceSitePurposePrompt(sitePurpose),
```

(it appears once, inside the `taskPrompt` array) with

```ts
      sourceSitePurposePrompt(sitePurpose),
      oldFiles.some((file: SourceProjectFileDto) => file.path === 'index.html' && file.content.includes('data-pagosya-header')) ? SOURCE_PLATFORM_HEADER_EDIT : '',
```

- [ ] **Step 7: Add the header closure before `acceptCandidate`**

Directly below the line `      let savedHeaderCovers: Promise<HeaderCover[]> | undefined;` add:

```ts
      // Spec 2026-10-13: the platform draws the header into <header data-pagosya-header> on every page of a static store, from the
      // drawn shape (frame-draw.json), the store's name and logo, the sections index.html marks with data-nav-label and the brief's
      // one fact. A store without the slot is left alone. Each note is logged once per run.
      const headerNotes = new Set<string>();
      const platformHeader = (files: SourceProjectFileDto[], platformPages: string[]) => {
        const drawn = parseFrameDraw((frame.file ?? previousFiles.find(file => file.path === FRAME_DRAW_FILE))?.content).header;
        const result = withSourceHeader(files, { shape: drawn, purpose: sitePurpose, storeName: data.storeName, logoPath: assetLegend.find(asset => asset.original === (data as { logoUrl?: string | null }).logoUrl)?.path, fact: headerFact(businessInfo, storeData.locations), platformPages, previous: previousFiles });
        if (result.rendered && result.fallback && !headerNotes.has('shape')) { headerNotes.add('shape'); this.logger.warn(JSON.stringify({ event: 'source_header_shape_fallback', generationId: run.id, drawn: drawn ?? null, shape: result.shape })); }
        if (result.missing.length && !headerNotes.has('slot')) { headerNotes.add('slot'); this.logger.warn(JSON.stringify({ event: 'source_header_slot_missing', generationId: run.id, pages: result.missing })); }
        return result.files;
      };
```

- [ ] **Step 8: Draw it on every accepted draft**

Directly below the line `          autoRepairs.push(...wiring.repairs);` (inside `if (!useNext) {` in `acceptCandidate`) add:

```ts
          // Spec 2026-10-13: the draft is checked, previewed and reviewed with the platform header drawn, never with an empty slot.
          generated.files = platformHeader(generated.files, platformSuppliedPages(sitePurpose));
```

- [ ] **Step 9: Draw it on the saved files, kit commerce pages included**

Replace

```ts
files: await withSourceMotion(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
```

with

```ts
files: await withSourceMotion(platformHeader(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
```

and replace

```ts
], previousFiles, assetLegend, imageUses, photoFacts))), motion) };
```

with

```ts
], previousFiles, assetLegend, imageUses, photoFacts))), []), motion) };
```

- [ ] **Step 10: Run the new test and the neighbouring Sep-5 suites**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-header.spec.ts src/storefront-source/source-generation-review.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: PASS (3 suites). The two existing suites author no slot, so their saved files are unchanged.

- [ ] **Step 11: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-generation-header.spec.ts
git commit -m "feat(api): every static save draws the platform header, including the kit commerce pages"
```

---
### Task 5: The Sep-5 author asks for the slot, and the self-review stops judging header contents

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts`. That covers a new `SEP5_KEEP_PICKED_HERO` below `SEP5_KEEP_HERO` (line 58) and its use in the prompt (line 116), `sep5CardLook` (lines 61-70), the input type of `sep5AuthorPrompt` (lines 72-104), the shell line in the prompt (line 114), `SEP5_STORE_SHELL` and `SEP5_STORE_SHELL_FRAMED` (lines 169-172), and `sep5ReviewPrompt` (lines 179-189).
- Modify: `apps/api/src/storefront-source/design-engine/sep5-review-capture.ts:34-36`
- Modify: `apps/api/src/storefront-source/design-engine/frame-draw.ts` (add `framePlatformHeader` after `frameDirection`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`, the end of the `authorInput` line (~1020) and the frame-draw import
- Test: `design-engine/sep5-author.spec.ts`, `design-engine/sep5-review-capture.spec.ts`, `design-engine/frame-draw.spec.ts`, `source-generation-style.spec.ts` (all under `apps/api/src/storefront-source/`)

**Interfaces:**
- Consumes: the header contract from Tasks 1 and 3 (`<header data-pagosya-header></header>`, `data-nav-label`).
- Produces:
  - `SEP5_STORE_SHELL` (the platform-header shell; `SEP5_STORE_SHELL_FRAMED` is now the same string).
  - `SEP5_KEEP_PICKED_HERO(html)` («PICKED HERO: …»), which the Sep-5 prompt uses for a picked card. `SEP5_KEEP_HERO` («PICKED HEADER AND HERO: …») stays for the React planner path.
  - `sep5AuthorPrompt` input gains `purpose?: SourceSitePurpose`. In this task it only changes the self-review wording; Task 7 adds the showcase shell.
  - `framePlatformHeader(paragraph: string): string`, which drops the `- Header:`, `- Cart and account:` and `- Cart label:` lines (the style cards append the last one).

- [ ] **Step 1: Update and add the failing tests**

In `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`, make these replacements.

Replace the whole test that begins with `it('asks for the store shell when told to, before the choreography', () => {` (through its closing `});`) with:

```ts
it('asks for the store shell when told to, before the choreography', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  expect(sep5AuthorPrompt(base)).not.toContain('STORE SHELL');
  const shelled = sep5AuthorPrompt({ ...base, storeShell: true, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
  expect(shelled).toContain(SEP5_STORE_SHELL);
  expect(SEP5_STORE_SHELL).toContain('<header data-pagosya-header></header>');
  expect(SEP5_STORE_SHELL).toContain('data-nav-label');
  expect(SEP5_STORE_SHELL).toContain('--store-heading-font');
  expect(SEP5_STORE_SHELL).toContain('data-pagosya-pages');
  expect(SEP5_STORE_SHELL).not.toContain('data-cart-count');
  expect(shelled.indexOf('STORE SHELL')).toBeLessThan(shelled.indexOf('MOTION CHOREOGRAPHY'));
  expect(shelled.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
});
```

Replace the whole test that begins with `it('builds the drawn frame instead of the ordered shell, and stays byte-identical without one', () => {` with:

```ts
it('keeps one platform shell with or without a drawn frame, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const frame = 'FRAME AND HERO: test frame\n- Hero: giant type.';
  const framed = sep5AuthorPrompt({ ...base, storeShell: true, frame, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
  expect(framed).toContain(frame);
  expect(framed.split(SEP5_STORE_SHELL)).toHaveLength(2);
  expect(SEP5_STORE_SHELL_FRAMED).toBe(SEP5_STORE_SHELL);
  expect(framed.indexOf(frame)).toBeLessThan(framed.indexOf('MOTION CHOREOGRAPHY'));
  expect(sep5AuthorPrompt({ ...base, storeShell: true, frame: '  ' })).toBe(sep5AuthorPrompt({ ...base, storeShell: true }));
  expect(sep5AuthorPrompt({ ...base, frame: '  ' })).toBe(sep5AuthorPrompt(base));
  expect(sep5AuthorPrompt({ ...base, storeShell: true, purpose: 'shop' })).toBe(sep5AuthorPrompt({ ...base, storeShell: true }));
});
```

Replace the whole test that begins with `it('asks the self-review to check the drawn frame only when there is one', () => {` with:

```ts
it('asks the self-review to check the drawn hero only when there is one, and to leave the platform header alone', () => {
  const input = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft: [], measured: [] };
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).toMatch(/hero matches FRAME AND HERO/);
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).toContain('leave <header data-pagosya-header> alone');
  expect(sep5ReviewPrompt(input)).not.toMatch(/FRAME AND HERO/);
  expect(sep5ReviewPrompt(input)).not.toContain('search, account and cart');
  expect(sep5ReviewPrompt(input)).toContain('whether the catalog and the primary action are easy to find');
});
```

Replace both the test that begins with `it('keeps the cart, Buscar and Mi cuenta reachable on phones even when the merchant overrides the drawn header', () => {` and the test that begins with `it('keeps the whole store name inside one data-store-name slot', () => {` with this single test:

```ts
it('leaves the header, its menu and the store name to the platform', () => {
  expect(SEP5_STORE_SHELL).toMatch(/The platform draws the header on every page, so do not write one/);
  expect(SEP5_STORE_SHELL).not.toMatch(/data-pagosya-account|buscar\.html|data-cart-count|\[data-store-name\]/);
});
```

In the test that begins with `it('appends the picked header and hero, and stays byte-identical without one', () => {`, replace

```ts
  expect(prompt).toContain('PICKED HEADER AND HERO');
```

with

```ts
  expect(prompt).toContain('PICKED HERO');
  expect(prompt).toContain('start the page with the empty <header data-pagosya-header></header>');
```

In the test that begins with `it('describes the picked card when its hero was not finished, and stays byte-identical without one', () => {`, replace

```ts
  expect(card).toContain('header "wordmark-band" and hero "poster"');
```

with

```ts
  expect(card).toContain('hero "poster"');
  expect(card).not.toContain('wordmark-band');
  expect(card).toContain('Draw the first screen yourself');
```

and replace

```ts
  expect(prompt).not.toContain('PICKED HEADER AND HERO');
```

with

```ts
  expect(prompt).not.toContain('PICKED HERO');
```

In `apps/api/src/storefront-source/design-engine/sep5-review-capture.spec.ts`, inside the test that begins with `it('reports a header without search or account even when the footer has both', async () => {`, replace

```ts
  expect(sep5MeasuredFacts(facts)).toEqual(expect.arrayContaining([
    '1280px: no hay enlace a buscar.html fuera del pie de página.',
    '390px: no hay enlace data-pagosya-account fuera del pie de página.',
  ]));
```

with

```ts
  // Spec 2026-10-13: the platform draws the header, so its contents are measured but never worded for the model.
  expect(sep5MeasuredFacts(facts).join('\n')).not.toMatch(/buscar\.html|data-pagosya-account|\[data-cart-count\]/);
```

and append at the end of that file:

```ts
it('never words header contents for the model: the platform draws the header (spec 2026-10-13)', () => {
  expect(sep5MeasuredFacts([{ width: 390, pageWidth: 390, missingImages: 0, search: false, account: false, cart: false, brokenWords: [], errors: [] }])).toEqual([]);
});
```

In `apps/api/src/storefront-source/design-engine/frame-draw.spec.ts`, replace `paletteBrandCss, parseFrameDraw,` in the import from `./frame-draw` with `paletteBrandCss, parseFrameDraw, framePlatformHeader,` and append at the end of the file:

```ts
it('drops the header and cart lines for an author whose header the platform draws (spec 2026-10-13)', () => {
  const paragraph = frameDirection({ header: 'stacked', cart: 'word-count', footer: 'quiet-line', hero: 'split' });
  expect(paragraph).toMatch(/^- Header:/m);
  const stripped = framePlatformHeader(paragraph);
  expect(stripped).not.toMatch(/^- (Header|Cart and account):/m);
  expect(stripped).toMatch(/^- Footer:/m);
  expect(stripped).toMatch(/^- Hero:/m);
  expect(stripped.startsWith('FRAME AND HERO:')).toBe(true);
  expect(framePlatformHeader('FRAME AND HERO: x\n- Cart label: the header\'s cart reads «Tu bolsa».\n- Hero: y')).toBe('FRAME AND HERO: x\n- Hero: y');
  expect(framePlatformHeader('')).toBe('');
});
```

In `apps/api/src/storefront-source/source-generation-style.spec.ts`, below the line `import { validDna } from './fixtures/dna';` add

```ts
import { framePlatformHeader } from './design-engine/frame-draw';
```

and make these replacements:
- each of the three lines `    expect(prompt).toContain(proposal.slots[1].paragraph);` (two of them) and `    expect(prompt).toContain(proposal.slots[0].paragraph);` (one) becomes the same line with the paragraph wrapped, i.e. `    expect(prompt).toContain(framePlatformHeader(proposal.slots[1].paragraph));` and `    expect(prompt).toContain(framePlatformHeader(proposal.slots[0].paragraph));`
- `    expect(prompt).toContain('PICKED HEADER AND HERO');` becomes `    expect(prompt).toContain('PICKED HERO');`
- `    expect(prompt).not.toContain('PICKED HEADER AND HERO');` becomes `    expect(prompt).not.toContain('PICKED HERO');`

Then, in the test that begins with `  it('builds the picked card: forced concept, its draw as the frame, its palette, bold mode and hero to Sep-5, no planner call', async () => {`, add below its `const prompt = authorPrompt()!;` line:

```ts
    expect(prompt).not.toMatch(/^- Header:/m);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts src/storefront-source/design-engine/frame-draw.spec.ts --maxWorkers=2`
Expected: FAIL. `sep5-author.spec.ts` fails on `expect(SEP5_STORE_SHELL).toContain('<header data-pagosya-header></header>')`. `frame-draw.spec.ts` fails to compile with "has no exported member 'framePlatformHeader'".

- [ ] **Step 3: Rewrite the shell, the picked-hero paragraphs and the review wording**

In `apps/api/src/storefront-source/design-engine/sep5-author.ts`:

At the top, below `import { requestedSourceProducts, sourceProductsSchema, type SourceProduct } from '../source-products';`, add:

```ts
import type { SourceSitePurpose } from '../source-site-purpose';
```

Keep `SEP5_KEEP_HERO` exactly as it is: the React planner path still appends it to its `taskPrompt` (`source-generation.service.ts` ~866), and that path builds its own header. Directly below the line that begins with `export const SEP5_KEEP_HERO = (html: string) =>` add:

```ts
/** The picked card for a Sep-5 store, whose header the platform draws (spec 2026-10-13): keep its first screen, drop its header. */
export const SEP5_KEEP_PICKED_HERO = (html: string) => `PICKED HERO: The merchant chose this design from the styles YAPI offered. Keep its first screen exactly as given (markup and CSS), move its CSS into styles.css, and build the rest of the store in the same fonts, colours and language. Its header was only a preview of the platform header: leave it out and start the page with the empty <header data-pagosya-header></header>, where the platform draws the store's header. Replace preview-only links with real ones (index.html, the catalog, the sections of this page).\n${html}`;
```

Replace the line

```ts
    ...(input.hero?.trim() ? [SEP5_KEEP_HERO(input.hero.trim())] : []),
```

with

```ts
    ...(input.hero?.trim() ? [SEP5_KEEP_PICKED_HERO(input.hero.trim())] : []),
```

Replace the whole function `sep5CardLook` (from `export function sep5CardLook(` through its closing `}`) with:

```ts
export function sep5CardLook(card: { name: string; fonts: { display: string; text: string }; palette?: { paper: string; ink: string; accent: string; accent2: string }; header?: string; hero?: string; eyebrow?: string; headline: string; support?: string; action?: string }): string {
  const family = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)?.family ?? id;
  const words = [card.eyebrow ? `eyebrow "${card.eyebrow}"` : '', `headline "${card.headline}"`, card.support ? `line "${card.support}"` : '', card.action ? `action "${card.action}"` : ''].filter(Boolean).join(', ');
  // The card's header shape is drawn by the platform (spec 2026-10-13); only its first screen is the author's.
  return [
    `PICKED STYLE: The merchant chose the style card «${card.name}». Draw the first screen yourself in that card's look (the platform draws the header): display type ${family(card.fonts.display)}, text ${family(card.fonts.text)}`,
    card.palette ? `, colours background ${card.palette.paper}, text ${card.palette.ink}, accent ${card.palette.accent}, panels ${card.palette.accent2}` : '',
    card.hero ? `, hero "${card.hero}" as the frame above describes it` : '',
    `. Open with the card's own words: ${words}. Build the rest of the store in the same fonts, colours and language.`,
  ].join('');
}
```

In the input type of `sep5AuthorPrompt`, directly below the line `  card?: string;`, add:

```ts
  /** The site purpose (spec 2026-10-13). 'shop' or absent keeps the prompt byte-identical; the self-review wording follows it. */
  purpose?: SourceSitePurpose;
```

Replace the line

```ts
    ...(input.storeShell ? [input.frame?.trim() ? SEP5_STORE_SHELL_FRAMED : SEP5_STORE_SHELL] : []),
```

with

```ts
    ...(input.storeShell ? [SEP5_STORE_SHELL] : []),
```

Replace the whole line that begins with `export const SEP5_STORE_SHELL = 'STORE SHELL:` and the whole line that begins with `export const SEP5_STORE_SHELL_FRAMED = 'STORE SHELL:` (together with the one-line comment between them) with:

```ts
export const SEP5_STORE_SHELL = 'STORE SHELL: The platform draws the header on every page, so do not write one. Make <header data-pagosya-header></header> the first element inside <body> of every page, empty, exactly like that: the platform fills it at save time with the store name, the menu, the search and account links and the cart, in the header shape drawn for this store. Put data-nav-label="…" (a short Spanish menu label) and an id on each top-level section of index.html that belongs in the menu, at most six. Declare --store-background, --store-foreground, --store-accent, --store-accent-foreground, --store-heading-font and --store-body-font in :root of styles.css; the header takes its colours and fonts from them. Never wrap the header in another element and never let page content sit above it (no z-index over 999 near the top of the page). The footer contains <nav data-pagosya-pages aria-label="Información" hidden></nav>, which the runtime fills with the store\'s information pages. pages/ paths use ../ for these links too.';

/** Kept for callers that still name it: with the platform header there is one shell, framed or not (spec 2026-10-13). */
export const SEP5_STORE_SHELL_FRAMED = SEP5_STORE_SHELL;
```

In `sep5ReviewPrompt`, replace

```ts
    ? 'Check that the header and hero match the frame lines of the DESIGN DRAW, and that the colours, buttons, photo treatment and structure match DESIGN DRAW, at both widths; rebuild whichever does not. '
    : 'Check that the header and hero match FRAME AND HERO at both widths; rebuild whichever does not. ';
```

with

```ts
    ? 'Check that the hero matches the frame lines of the DESIGN DRAW, and that the colours, buttons, photo treatment and structure match DESIGN DRAW, at both widths; rebuild whichever does not. The header is the platform\'s: leave <header data-pagosya-header> alone. '
    : 'Check that the hero matches FRAME AND HERO at both widths; rebuild it if it does not. The header is the platform\'s: leave <header data-pagosya-header> alone. ';
  const findable = input.purpose && input.purpose !== 'shop'
    ? 'anything that covers the platform header at the top; whether the main action is easy to find (this site has no catalog or cart on purpose);'
    : 'anything that covers the platform header at the top; whether the catalog and the primary action are easy to find;';
```

and in the long template string of the same function replace

```
a header that is cramped or wraps badly; whether the store name, search, account and cart are visible and reachable; whether the catalog and the primary action are easy to find;
```

with

```
${findable}
```

(the rest of that line stays exactly as it is).

- [ ] **Step 4: Stop wording header contents in the measured facts**

In `apps/api/src/storefront-source/design-engine/sep5-review-capture.ts`, delete these three lines from `sep5MeasuredFacts`:

```ts
    ...(fact.search ? [] : [`${fact.width}px: no hay enlace a buscar.html fuera del pie de página.`]),
    ...(fact.account ? [] : [`${fact.width}px: no hay enlace data-pagosya-account fuera del pie de página.`]),
    ...(fact.cart ? [] : [`${fact.width}px: no hay botón de carrito con [data-cart-count].`]),
```

(The capture still measures `search`, `account` and `cart`; only the model no longer reads them.)

- [ ] **Step 5: Add `framePlatformHeader` and pass the stripped frame to the author**

In `apps/api/src/storefront-source/design-engine/frame-draw.ts`, directly above the line `// \b treats accented letters as non-word characters, so "menú" would never match; whole words via letter lookarounds.`, add:

```ts
/** The drawn frame without its header and cart lines (spec 2026-10-13): the platform draws the header for a static author,
 *  which is told only the hero and footer. The style cards' "- Cart label:" line goes too. Every other line is kept as it is. */
export function framePlatformHeader(paragraph: string): string {
  return paragraph.split('\n').filter(line => !/^- (?:Header|Cart and account|Cart label):/.test(line)).join('\n');
}
```

In `apps/api/src/storefront-source/source-generation.service.ts`, replace

```ts
import { asksForBold, designBrandCss, designCategory, frameForRun, frameFresh, frameInputs, parseFrameDraw, storePhotoPaths, FRAME_DRAW_FILE } from './design-engine/frame-draw';
```

with

```ts
import { asksForBold, designBrandCss, designCategory, frameForRun, frameFresh, frameInputs, framePlatformHeader, parseFrameDraw, storePhotoPaths, FRAME_DRAW_FILE } from './design-engine/frame-draw';
```

and replace `frame: frame.paragraph, hero: pickedHero, card: pickedCard };` (the end of the `authorInput` line) with `frame: framePlatformHeader(frame.paragraph), hero: pickedHero, card: pickedCard };`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts src/storefront-source/design-engine/frame-draw.spec.ts src/storefront-source/design-engine/sep5-review-capture.spec.ts src/storefront-source/source-generation-style.spec.ts src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
Expected: PASS (5 suites; the review-capture suite drives Chromium and takes a little longer).

- [ ] **Step 7: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts apps/api/src/storefront-source/design-engine/sep5-review-capture.ts apps/api/src/storefront-source/design-engine/sep5-review-capture.spec.ts apps/api/src/storefront-source/design-engine/frame-draw.ts apps/api/src/storefront-source/design-engine/frame-draw.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-style.spec.ts
git commit -m "feat(yapi): the Sep-5 author leaves the header to the platform and marks its menu sections"
```

---
### Task 6: The showcase page set and footer

**Files:**
- Modify: `apps/api/src/storefront-source/source-static-pages.ts:29,145-157`
- Modify: `apps/api/src/storefront-source/source-autorepair.ts:4,43-45`
- Modify: `apps/api/src/storefront-source/source-projects.service.ts:295` («Agregar páginas estándar» on an existing store)
- Modify: `packages/storefront-kit/kit/commerce.js`, in `renderAccountGateLinks` (~1255) and `renderInfoPages` (~1497-1499), plus two constants above the account comment (~1247)
- Test: `apps/api/src/storefront-source/source-static-pages.spec.ts`, `apps/api/src/storefront-source/source-autorepair.spec.ts`, `apps/api/src/storefront-source/source-projects.service.spec.ts`, `apps/api/src/storefront-source/source-commerce-showcase.spec.ts` (create)

**Interfaces:**
- Consumes: `STOREFRONT_PAGES` (already used by the module).
- Produces:
  - `staticStandardPagePaths(purpose = 'shop'): string[]`. For a shop that is every standard page. For any other purpose it is `['nosotros.html', 'contacto.html', 'faq.html', 'privacidad.html', 'terminos.html', 'cookies.html', '404.html']`.
  - `withStaticStandardPages(files, purpose = 'shop')`
  - `platformSuppliedPages(sitePurpose)`, which now uses `staticStandardPagePaths(sitePurpose)`.
  - `SourceProjectsService.addStandardPages` adds the purpose's page set to a static store.
  - Kit: when `config.sitePurpose` is set and is not `'shop'`, the footer's `[data-pagosya-pages]` never lists Colecciones, Buscar, Envíos or Cambios, nor Mi cuenta, and no account nav is added.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/source-static-pages.spec.ts` (first change its second import line to `import { SOURCE_STATIC_ACCOUNT_PAGES, staticAccountGateProblems, staticStandardPagePaths, withStaticStandardPages, withStaticNavSlot } from './source-static-pages';`):

```ts
describe('a showcase gets only the pages a business that does not sell needs (spec 2026-10-13)', () => {
  const SHOWCASE = ['nosotros.html', 'contacto.html', 'faq.html', 'privacidad.html', 'terminos.html', 'cookies.html', '404.html'];

  it('adds Nosotros, Contacto, Preguntas frecuentes, the policies and 404, and nothing a shop needs', () => {
    const { files, added } = withStaticStandardPages(store(), 'service');
    expect(added).toEqual(SHOWCASE);
    for (const path of ['buscar.html', 'colecciones.html', 'envios.html', 'reembolsos.html', 'acceso-ingresar.html', 'cuenta-pedidos.html']) expect(files.some(file => file.path === path)).toBe(false);
    expect(files.find(file => file.path === 'faq.html')!.content).toContain('data-pagosya-page="faq"');
  });

  it('is the same set for every purpose that is not a shop, and the full set for a shop', () => {
    for (const purpose of ['service', 'portfolio', 'editorial']) expect(staticStandardPagePaths(purpose)).toEqual(SHOWCASE);
    expect(staticStandardPagePaths('shop')).toEqual(expect.arrayContaining([...SHOWCASE, 'buscar.html', 'acceso-ingresar.html', 'envios.html']));
    expect(staticStandardPagePaths()).toEqual(staticStandardPagePaths('shop'));
  });
});
```

Append to `apps/api/src/storefront-source/source-autorepair.spec.ts`, inside the `describe` that holds `it('does not promise the commerce pages to a site that is not a shop', …)` (directly after that test):

```ts
  it('promises a showcase only its own standard pages (spec 2026-10-13)', () => {
    expect(platformSuppliedPages('service')).toEqual(expect.arrayContaining(['nosotros.html', 'contacto.html', 'faq.html', '404.html']));
    for (const path of ['buscar.html', 'acceso-ingresar.html', 'cuenta-pedidos.html', 'envios.html', 'product.html']) expect(platformSuppliedPages('service')).not.toContain(path);
    expect(platformSuppliedPages('shop')).toEqual(expect.arrayContaining(['buscar.html', 'acceso-ingresar.html', 'product.html']));
  });
```

In `apps/api/src/storefront-source/source-projects.service.spec.ts`, inside `describe('adding the standard pages to a store that already exists', () => {`, add directly above the test that begins with `  it('refuses when there is nothing to add, when there is no Shell, for a missing site and for a store it does not own', async () => {`:

```ts
  it('gives a static showcase only the showcase pages (spec 2026-10-13)', async () => {
    const { service } = setup();
    const page = '<!doctype html><html lang="es"><head><title>deff</title></head><body><header data-pagosya-header></header><main><h1>Arquitectura</h1></main><footer><p>Pie</p></footer></body></html>';
    await service.save('m1', 's1', { ...input(), brief: { ...input().brief, sitePurpose: 'service' as const }, files: [...input().files, { path: 'index.html', content: page }] });
    await service.addStandardPages('m1', 's1', 1);
    const paths = ((await service.version('m1', 's1', 2)) as any).snapshot.files.map((f: any) => f.path);
    for (const html of ['nosotros.html', 'faq.html', '404.html']) expect(paths).toContain(html);
    for (const html of ['buscar.html', 'acceso-ingresar.html', 'envios.html']) expect(paths).not.toContain(html);
  });
```

Create `apps/api/src/storefront-source/source-commerce-showcase.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const data = { storeName: 'deff', tagline: 'Arquitectura', aboutText: 'Diseñamos casas.', items: [{ id: 'p1', name: 'Asesoría', description: '', amount: 100, currency: 'BOB', stock: 1, imageUrls: [], tags: [] }], collections: [{ name: 'Todo', slug: 'todo', productIds: ['p1'] }], policies: { delivery: 'Envíos a todo el país.', returns: 'Cambios en 7 días.', privacy: 'Cuidamos tus datos.', terms: 'Términos.' } };

async function page(sitePurpose?: string) {
  const dom = new JSDOM('<html><head></head><body><main><div data-pagosya-page="about"></div></main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window as any;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_CONFIG = { slug: 'deff', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', ...(sitePurpose ? { sitePurpose } : {}), data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 60));
  return w;
}
const labels = (w: any) => Array.from(w.document.querySelectorAll('[data-pagosya-pages] a')).map((a: any) => a.textContent);

describe('the footer of a showcase (spec 2026-10-13)', () => {
  it('links the information pages but never search, collections, shipping, refunds or a shopper account', async () => {
    const w = await page('service');
    expect(labels(w)).toEqual(expect.arrayContaining(['Nosotros', 'Privacidad']));
    for (const label of ['Colecciones', 'Buscar', 'Envíos y entregas', 'Cambios y devoluciones', 'Mi cuenta']) expect(labels(w)).not.toContain(label);
    expect(w.document.querySelector('a[data-pagosya-account]')).toBeNull();
    w.close();
  });

  it('keeps every link for a shop, and for a store saved before sitePurpose was written', async () => {
    for (const purpose of ['shop', undefined]) {
      const w = await page(purpose);
      expect(labels(w)).toEqual(expect.arrayContaining(['Colecciones', 'Buscar', 'Envíos y entregas', 'Cambios y devoluciones', 'Mi cuenta']));
      w.close();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-static-pages.spec.ts src/storefront-source/source-autorepair.spec.ts src/storefront-source/source-commerce-showcase.spec.ts --maxWorkers=2`
Expected: FAIL. The static-pages suite fails to compile ("has no exported member 'staticStandardPagePaths'"). The autorepair test fails on `not.toContain('buscar.html')`. The showcase footer test fails on `not.toContain('Colecciones')`.

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-projects.service.spec.ts -t "standard pages" --maxWorkers=2`
Expected: FAIL on `expect(paths).not.toContain(html)` for `buscar.html`.

- [ ] **Step 3: Make the standard pages follow the purpose**

In `apps/api/src/storefront-source/source-static-pages.ts`, directly below the line that begins with `export const STATIC_STANDARD_PAGE_PATHS: readonly string[] =`, add:

```ts

/** A showcase (spec 2026-10-13) has nothing to search, collect, ship, refund or sign in to: it keeps Nosotros, Contacto,
 *  Preguntas frecuentes, the three policies and 404. Every purpose that is not a shop gets this set. */
const SHOWCASE_PAGE_KINDS = new Set(['about', 'contact', 'faq', 'privacy', 'terms', 'cookies', 'notfound']);
export function staticStandardPagePaths(purpose: string = 'shop'): string[] {
  return purpose === 'shop' ? [...STATIC_STANDARD_PAGE_PATHS] : PAGES.filter(page => SHOWCASE_PAGE_KINDS.has(page.kind)).map(page => page.url);
}
```

Replace

```ts
export function withStaticStandardPages(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; added: string[]; refreshed: string[]; slotAdded: boolean } {
```

with

```ts
export function withStaticStandardPages(files: SourceProjectFileDto[], purpose: string = 'shop'): { files: SourceProjectFileDto[]; added: string[]; refreshed: string[]; slotAdded: boolean } {
```

and replace

```ts
  for (const page of standard) {
```

with

```ts
  const allowed = new Set(staticStandardPagePaths(purpose));
  for (const page of standard.filter(entry => allowed.has(entry.url))) {
```

In `apps/api/src/storefront-source/source-autorepair.ts`, replace

```ts
import { STATIC_STANDARD_PAGE_PATHS } from './source-static-pages';
```

with

```ts
import { staticStandardPagePaths } from './source-static-pages';
```

and replace

```ts
  return [...STATIC_STANDARD_PAGE_PATHS, ...(sitePurpose === 'shop' ? COMMERCE_KIT_PAGES : [])];
```

with

```ts
  return [...staticStandardPagePaths(sitePurpose), ...(sitePurpose === 'shop' ? COMMERCE_KIT_PAGES : [])];
```

In `apps/api/src/storefront-source/source-projects.service.ts` (`addStandardPages`), replace `withStaticStandardPages(snapshot.files);` with `withStaticStandardPages(snapshot.files, sourceSitePurpose(snapshot.brief));` (`sourceSitePurpose` is already imported there).

- [ ] **Step 4: Keep shop links out of a showcase footer**

In `packages/storefront-kit/kit/commerce.js`, directly above the line `  // The shopper's account is served by the checkout app on its own origin, never inside the store, where authored code runs.` add:

```js
  // A showcase (spec 2026-10-13) sells nothing online: its footer never links search, collections, shipping, refunds or a
  // shopper account. A store saved before sitePurpose was written into config.js is a shop.
  const SHOWCASE = typeof config.sitePurpose === 'string' && config.sitePurpose !== 'shop';
  const SHOP_ONLY_INFO = new Set(['collections', 'search', 'shipping', 'refund']);
```

Replace

```js
    if (base && !document.querySelector('[data-pagosya-pages],a[data-pagosya-account],a[href="acceso-ingresar.html"],a[href="cuenta-perfil.html"]')) {
```

with

```js
    if (base && !SHOWCASE && !document.querySelector('[data-pagosya-pages],a[data-pagosya-account],a[href="acceso-ingresar.html"],a[href="cuenta-perfil.html"]')) {
```

Replace

```js
      const account = accountEntry();
      slot.innerHTML = INFO_LINKS.filter(([kind]) => infoBody(kind)).map(
```

with

```js
      const account = SHOWCASE ? '' : accountEntry();
      slot.innerHTML = INFO_LINKS.filter(([kind]) => !(SHOWCASE && SHOP_ONLY_INFO.has(kind)) && infoBody(kind)).map(
```

(The rest of that `slot.innerHTML = …` line stays exactly as it is.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/packages/storefront-kit && node kit/check-runtimes.mjs`
Expected: `… storefront runtimes parsed cleanly.`

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-static-pages.spec.ts src/storefront-source/source-autorepair.spec.ts src/storefront-source/source-commerce-showcase.spec.ts src/storefront-source/source-commerce-info-pages.spec.ts --maxWorkers=2`
Expected: PASS (4 suites).

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-projects.service.spec.ts -t "standard pages" --maxWorkers=2`
Expected: PASS (the `standard pages` tests; the rest of the suite is skipped by the filter).

- [ ] **Step 6: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-static-pages.ts apps/api/src/storefront-source/source-static-pages.spec.ts apps/api/src/storefront-source/source-autorepair.ts apps/api/src/storefront-source/source-autorepair.spec.ts apps/api/src/storefront-source/source-projects.service.ts apps/api/src/storefront-source/source-projects.service.spec.ts packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-showcase.spec.ts
git commit -m "feat(api,kit): a showcase gets only Nosotros, Contacto, FAQ, the policies and 404, and a footer without shop links"
```

---
### Task 7: The Sep-5 author follows the site purpose

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts`. That covers the imports, the input type (add `action`), the shell line, the new `SEP5_SHOWCASE_SHELL` and `sep5MainAction`, and `sep5ProjectIsUsable` (~224-228).
- Test: `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`

**Interfaces:**
- Consumes: `sourceSitePurposePrompt`, `type SourceSitePurpose` (`source-site-purpose.ts`); `primaryActionLink`, `type PrimaryAction` (Task 1); `SEP5_STORE_SHELL` and the `purpose` input (Task 5).
- Produces:
  - `SEP5_SHOWCASE_SHELL: string`; `sep5MainAction(action: PrimaryAction): string`
  - `sep5AuthorPrompt` input gains `action?: PrimaryAction`. With `storeShell` and a purpose that is not `'shop'`, the prompt carries `SEP5_SHOWCASE_SHELL`, then `sourceSitePurposePrompt(purpose)`, then `sep5MainAction(action ?? { kind: 'form' })`, in place of `SEP5_STORE_SHELL`.
  - `sep5ProjectIsUsable(files, purpose: SourceSitePurpose = 'shop'): boolean`. A shop needs styles, catalog, cart and status. Any other purpose needs styles, status, and its main action: the header slot or an action link.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`, extend the first import line by adding `SEP5_SHOWCASE_SHELL, sep5MainAction` to the names imported from `./sep5-author`, and append at the end of the file:

```ts
describe('a showcase author (spec 2026-10-13)', () => {
  const base = { brief: { businessType: 'Arquitectura' }, instruction: 'Crea el sitio de mi estudio', data: {}, assetLegend: [], storeShell: true };

  it('drops the shop shell for the showcase shell, the purpose override and the main action, and asks for no products', () => {
    const prompt = sep5AuthorPrompt({ ...base, purpose: 'service', action: { kind: 'booking', value: 'https://cal.com/deff' }, products: false, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
    expect(prompt).toContain(SEP5_SHOWCASE_SHELL);
    expect(prompt).not.toContain(SEP5_STORE_SHELL);
    expect(prompt).toContain('SITE PURPOSE OVERRIDE: service');
    expect(prompt).toContain('MAIN ACTION:');
    expect(prompt).toContain('<a href="https://cal.com/deff" target="_blank" rel="noopener">Agenda una cita</a>');
    expect(prompt).not.toContain('PRODUCTS:');
    expect(prompt.indexOf('SITE SHELL')).toBeLessThan(prompt.indexOf('MAIN ACTION'));
    expect(prompt.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
  });

  it('asks for the slot, the menu marks and the platform hooks, and no catalog, cart, checkout, search or account', () => {
    expect(SEP5_SHOWCASE_SHELL).toContain('<header data-pagosya-header></header>');
    expect(SEP5_SHOWCASE_SHELL).toContain('data-nav-label');
    expect(SEP5_SHOWCASE_SHELL).toContain('<section data-pagosya-contact hidden></section>');
    expect(SEP5_SHOWCASE_SHELL).toContain('data-pagosya-status');
    expect(SEP5_SHOWCASE_SHELL).toMatch(/Never write a catalog, cart, checkout, search or account link/);
  });

  it('points every call to action at the main action, and lets the platform open its form', () => {
    expect(sep5MainAction({ kind: 'whatsapp', value: '59170012345' })).toContain('<a href="https://wa.me/59170012345" target="_blank" rel="noopener">Escríbenos</a>');
    expect(sep5MainAction({ kind: 'phone', value: '59122441234' })).toContain('<a href="tel:+59122441234">Llámanos</a>');
    const form = sep5MainAction({ kind: 'form' });
    expect(form).toContain('<a href="contacto.html" data-pagosya-contact-open>Pide una cotización</a>');
    expect(form).toContain('never build a form yourself');
    expect(sep5AuthorPrompt({ ...base, purpose: 'portfolio' })).toContain('<a href="contacto.html" data-pagosya-contact-open>');
  });

  it('keeps the shop prompt byte-identical', () => {
    expect(sep5AuthorPrompt({ ...base, purpose: 'shop', action: { kind: 'form' } })).toBe(sep5AuthorPrompt(base));
  });

  it('judges a showcase by its main action, never by a catalog or cart', () => {
    const styles = { path: 'styles.css', content: ':root{}' };
    const page = (body: string) => [{ path: 'index.html', content: `${body}<p data-pagosya-status></p>` }, styles];
    expect(sep5ProjectIsUsable(page('<header data-pagosya-header></header><main>Hola</main>'), 'service')).toBe(true);
    expect(sep5ProjectIsUsable(page('<main><a href="https://wa.me/59170012345">Escríbenos</a></main>'), 'service')).toBe(true);
    expect(sep5ProjectIsUsable(page('<main><a href="contacto.html" data-pagosya-contact-open>Cotiza</a></main>'), 'portfolio')).toBe(true);
    expect(sep5ProjectIsUsable(page('<main>Hola</main>'), 'service')).toBe(false);
    expect(sep5ProjectIsUsable([{ path: 'index.html', content: '<header data-pagosya-header></header>' }, styles], 'service')).toBe(false);
    expect(sep5ProjectIsUsable(page('<header data-pagosya-header></header>'), 'shop')).toBe(false);
    expect(sep5ProjectIsUsable(page('<div data-pagosya-catalog></div><div data-pagosya-cart></div>'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts --maxWorkers=2`
Expected: FAIL. The suite does not compile ("has no exported member 'SEP5_SHOWCASE_SHELL'").

- [ ] **Step 3: Implement the showcase author**

In `apps/api/src/storefront-source/design-engine/sep5-author.ts`, replace

```ts
import type { SourceSitePurpose } from '../source-site-purpose';
```

with

```ts
import { sourceSitePurposePrompt, type SourceSitePurpose } from '../source-site-purpose';
import { primaryActionLink, type PrimaryAction } from '../source-primary-action';
```

In the input type of `sep5AuthorPrompt`, directly below the `purpose?: SourceSitePurpose;` line added in Task 5, add:

```ts
  /** A showcase's main action (Task 1's sourcePrimaryAction); every call to action on the site uses it. Default: the form. */
  action?: PrimaryAction;
```

Replace the line

```ts
    ...(input.storeShell ? [SEP5_STORE_SHELL] : []),
```

with

```ts
    ...(input.storeShell ? (input.purpose && input.purpose !== 'shop'
      ? [SEP5_SHOWCASE_SHELL, sourceSitePurposePrompt(input.purpose), sep5MainAction(input.action ?? { kind: 'form' })]
      : [SEP5_STORE_SHELL]) : []),
```

Directly below the line `export const SEP5_STORE_SHELL_FRAMED = SEP5_STORE_SHELL;` add:

```ts

/** A business that does not sell online (spec 2026-10-13): the site shows it and leads to one main action. */
export const SEP5_SHOWCASE_SHELL = 'SITE SHELL: This business does not sell online; the site shows the business and leads to one main action. The platform draws the header on every page, so do not write one: make <header data-pagosya-header></header> the first element inside <body> of every page, empty, exactly like that; the platform fills it with the business name, the menu and the main action button. Put data-nav-label="…" (a short Spanish menu label) and an id on each top-level section of index.html that belongs in the menu, at most six. Declare --store-background, --store-foreground, --store-accent, --store-accent-foreground, --store-heading-font and --store-body-font in :root of styles.css; the header takes its colours and fonts from them. Never write a catalog, cart, checkout, search or account link, product cards or prices. Keep <p data-pagosya-status role="status" aria-live="polite"></p> on every page and <section data-pagosya-contact hidden></section> on index.html. The footer contains <nav data-pagosya-pages aria-label="Información" hidden></nav>, which the runtime fills with the information pages. pages/ paths use ../ for these links too.';

/** Every call to action on a showcase leads to its main action, with the very link the platform header uses. */
export function sep5MainAction(action: PrimaryAction): string {
  const link = primaryActionLink(action);
  const what = action.kind === 'whatsapp' ? 'a WhatsApp chat' : action.kind === 'booking' ? 'its booking page' : action.kind === 'phone' ? 'a phone call' : 'the platform contact form';
  return `MAIN ACTION: This business's main action is ${what}. Every call to action on the site (the hero button, a closing band, the contact section) uses exactly this link, with your own short Spanish label if you like: <a href="${link.href}"${link.attributes}>${link.label}</a>.${action.kind === 'form' ? ' The platform opens its contact form from that link; never build a form yourself.' : ''}`;
}
```

Replace the whole function `sep5ProjectIsUsable` (from `export function sep5ProjectIsUsable(` through its closing `}`, keeping the comment above it) with:

```ts
export function sep5ProjectIsUsable(files: Sep5Files['files'], purpose: SourceSitePurpose = 'shop'): boolean {
  const html = files.find(file => file.path === 'index.html')?.content ?? '';
  if (!files.some(file => file.path === 'styles.css') || !/data-pagosya-status/.test(html)) return false;
  if (purpose === 'shop') return /data-pagosya-catalog/.test(html) && /data-pagosya-cart/.test(html);
  // A showcase needs its main action, never a catalog or cart (spec 2026-10-13): the header slot the platform fills with it,
  // or a call to action that already links it.
  return /<header\b[^>]*\bdata-pagosya-header(?=[\s=>\/])/i.test(html) || /href=["'](?:https:\/\/wa\.me\/|tel:)|data-pagosya-contact-open/i.test(html);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts
git commit -m "feat(yapi): the Sep-5 author writes a showcase with its main action, no catalog and no cart"
```

---
### Task 8: Generation builds a showcase

**Files:**
- Modify: `apps/api/src/storefront-source/source-primary-action.ts` (append `savedPrimaryAction`, `withShowcaseContactSlot`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`. That covers a new import, the `primaryAction` resolution after the `previousFiles` line (~523), the `platformHeader` closure (Task 4), the Task 4 line in `acceptCandidate`, the `authorInput` line (~1020), the author call and usability check (~1050-1055), the products line (~1062), `addSep5StandardPages` (~1080), the review usability check (~1117) and the `config` object in `assembleSave` (~1641).
- Test: `apps/api/src/storefront-source/source-primary-action.spec.ts` (append), `apps/api/src/storefront-source/source-generation-header.spec.ts` (append)

**Interfaces:**
- Consumes: `sourcePrimaryAction`, `type PrimaryAction` (Task 1); `withStaticStandardPages(files, purpose)` (Task 6); `sep5ProjectIsUsable(files, purpose)` and the `purpose`/`action` author inputs (Tasks 5 and 7); `platformHeader` (Task 4).
- Produces:
  - `savedPrimaryAction(files: Array<{ path: string; content: string }>): unknown`, which reads `config.js`.
  - `withShowcaseContactSlot<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[]`
  - A showcase save whose `config.js` carries `primaryAction` and `sitePurpose: 'service'`, with no products, no product schema, no kit commerce pages and only the showcase standard pages.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/source-primary-action.spec.ts`. First change its import line to `import { dialDigits, primaryActionLink, savedPrimaryAction, sourcePrimaryAction, withShowcaseContactSlot, PRIMARY_ACTION_KINDS } from './source-primary-action';`.

```ts
describe('where a showcase keeps its action and its contact slot', () => {
  it('reads the action a store saved in config.js, and nothing from a malformed or absent one', () => {
    expect(savedPrimaryAction([{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"sitePurpose":"service","primaryAction":{"kind":"phone","value":"59122441234"}};\n' }])).toEqual({ kind: 'phone', value: '59122441234' });
    expect(savedPrimaryAction([{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"sitePurpose":"shop"};' }])).toBeUndefined();
    expect(savedPrimaryAction([{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {roto' }])).toBeUndefined();
    expect(savedPrimaryAction([])).toBeUndefined();
  });

  it('adds the hidden contact slot to a showcase home once, before </main>, and leaves other pages alone', () => {
    const files = [{ path: 'index.html', content: '<body><main><h1>Hola</h1></main></body>' }, { path: 'nosotros.html', content: '<main></main>' }];
    const once = withShowcaseContactSlot(files);
    expect(once[0].content).toBe('<body><main><h1>Hola</h1><section data-pagosya-contact hidden></section></main></body>');
    expect(once[1]).toBe(files[1]);
    expect(withShowcaseContactSlot(once)).toEqual(once);
    const marked = [{ path: 'index.html', content: '<main><a href="contacto.html" data-pagosya-contact-open>Cotiza</a></main>' }];
    expect(withShowcaseContactSlot(marked)[0].content).toContain('<section data-pagosya-contact hidden></section></main>');
  });
});
```

Append to `apps/api/src/storefront-source/source-generation-header.spec.ts`:

```ts
describe('a showcase store (spec 2026-10-13)', () => {
  let service: SourceGenerationService, prisma: any, projects: any, fetchMock: jest.SpyInstance;
  const showcaseFiles = () => [
    { path: 'index.html', content: shell('<section id="servicios" data-nav-label="Servicios"><h1>Arquitectura</h1><a href="https://cal.com/estudio-deff">Agenda una cita</a></section><section id="proyectos" data-nav-label="Proyectos"><h2>Proyectos</h2></section><p data-pagosya-status role="status" aria-live="polite"></p>') },
    { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
  ];
  const showcaseDto = { ...dto, brief: { ...dto.brief, businessType: 'Estudio de arquitectura', sitePurpose: 'service' }, instruction: 'Crea el sitio de mi estudio de arquitectura' };
  const saved = () => projects.save.mock.calls[0][2].files as Array<{ path: string; content: string }>;
  const file = (path: string) => saved().find(entry => entry.path === path)?.content;
  const authorBody = () => fetchMock.mock.calls.map(call => JSON.parse(call[1].body)).find(body => body.text?.format?.name === 'independent_storefront');
  beforeEach(() => {
    ({ service, prisma, projects } = setup());
    prisma.store.findFirst.mockResolvedValue({ slug: 'deff', onboarding: { version: 1, primaryAction: { kind: 'booking', value: 'https://cal.com/estudio-deff' } } });
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => answer({ label: 'deff', files: showcaseFiles() }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks the author for a showcase with its booking action and no products', async () => {
    await service.generate('m1', 's1', showcaseDto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    const body = authorBody();
    const prompt: string = body.input[0].content[0].text;
    expect(prompt).toContain('SITE SHELL:');
    expect(prompt).toContain('SITE PURPOSE OVERRIDE: service');
    expect(prompt).toContain('<a href="https://cal.com/estudio-deff" target="_blank" rel="noopener">Agenda una cita</a>');
    expect(prompt).not.toContain('PRODUCTS:');
    expect(body.text.format.schema.required).toEqual(['label', 'files']);
  });

  it('saves a showcase with the action in its header and config.js, its contact slot, and only the showcase pages', async () => {
    const result: any = await service.generate('m1', 's1', showcaseDto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    expect(result.revision).toBe(1);
    expect(file('index.html')).toContain('data-purpose="showcase"');
    expect(file('index.html')).toContain('<a class="pyh-action" href="https://cal.com/estudio-deff" target="_blank" rel="noopener">Agenda una cita</a>');
    expect(file('index.html')).not.toContain('data-cart-open');
    expect(file('index.html')).toContain('<section data-pagosya-contact hidden></section>');
    for (const path of ['nosotros.html', 'contacto.html', 'faq.html', 'privacidad.html', 'terminos.html', 'cookies.html', '404.html']) expect(file(path)).toContain('data-purpose="showcase"');
    for (const path of ['buscar.html', 'colecciones.html', 'envios.html', 'reembolsos.html', 'acceso-ingresar.html', 'cuenta-pedidos.html', 'product.html', 'productos.html', 'coleccion.html', 'checkout.html']) expect(file(path)).toBeUndefined();
    const config = JSON.parse(file('config.js')!.match(/window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
    expect(config).toMatchObject({ sitePurpose: 'service', primaryAction: { kind: 'booking', value: 'https://cal.com/estudio-deff' } });
  });

  it('falls back to the contact form when the setup answer is unusable', async () => {
    prisma.store.findFirst.mockResolvedValue({ slug: 'deff', onboarding: { version: 1, primaryAction: { kind: 'booking', value: 'http://inseguro.test' } } });
    await service.generate('m1', 's1', showcaseDto, new SourceRequestBudget(25), [], jest.fn(async () => undefined));
    expect(file('index.html')).toContain('<a class="pyh-action" href="contacto.html" data-pagosya-contact-open>Pide una cotización</a>');
    expect(JSON.parse(file('config.js')!.match(/window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]).primaryAction).toEqual({ kind: 'form' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-primary-action.spec.ts src/storefront-source/source-generation-header.spec.ts --maxWorkers=2`
Expected: FAIL. `source-primary-action.spec.ts` fails to compile ("has no exported member 'savedPrimaryAction'"). The showcase generation tests fail on `expect(prompt).toContain('SITE SHELL:')`.

- [ ] **Step 3: Add the two helpers**

Append to `apps/api/src/storefront-source/source-primary-action.ts`:

```ts
/** The action a saved store keeps in config.js (`window.PAGOSYA_CONFIG.primaryAction`); undefined when it has none. */
export function savedPrimaryAction(files: Array<{ path: string; content: string }>): unknown {
  const match = files.find(file => file.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) return undefined;
  try { return (JSON.parse(match[1]) as { primaryAction?: unknown }).primaryAction; } catch { return undefined; }
}

const CONTACT_SLOT = '<section data-pagosya-contact hidden></section>';
/** A showcase home needs the platform contact slot (the publish contract and the form action rely on it): added once, never fatal. */
export function withShowcaseContactSlot<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  return files.map(file => {
    if (file.path !== 'index.html' || file.encoding === 'base64' || /data-pagosya-contact(?:\s|=|>)/.test(file.content)) return file;
    const at = file.content.lastIndexOf('</main>') >= 0 ? file.content.lastIndexOf('</main>') : file.content.lastIndexOf('</body>');
    return { ...file, content: at >= 0 ? `${file.content.slice(0, at)}${CONTACT_SLOT}${file.content.slice(at)}` : `${file.content}${CONTACT_SLOT}` };
  });
}
```

- [ ] **Step 4: Wire the purpose and the action through the Sep-5 run**

In `apps/api/src/storefront-source/source-generation.service.ts`:

Directly below the line `import { emptySourceHeaders, headerFact, SOURCE_PLATFORM_HEADER_EDIT, withSourceHeader } from './source-header';` add:

```ts
import { savedPrimaryAction, sourcePrimaryAction, withShowcaseContactSlot } from './source-primary-action';
```

Directly below the line `    const previousFiles: SourceProjectFileDto[] = (previous?.snapshot as any)?.files || [];` add:

```ts
    // Spec 2026-10-13: a showcase's main action. A saved store keeps the one in its config.js; a new one starts from the setup
    // form's answer (Store.onboarding.primaryAction), else WhatsApp when the store has a number, else the contact form.
    const keptAction = savedPrimaryAction(previousFiles);
    const setupRow = sitePurpose === 'shop' || keptAction !== undefined ? null
      : await Promise.resolve().then(() => this.prisma.store.findFirst({ where: { id: storeId }, select: { onboarding: true } })).catch(() => null);
    const primaryAction = sitePurpose === 'shop' ? undefined : sourcePrimaryAction(keptAction ?? (setupRow?.onboarding as any)?.primaryAction, (data as { contactPhone?: string | null }).contactPhone);
```

In the `platformHeader` closure added in Task 4, replace

```ts
        const result = withSourceHeader(files, { shape: drawn, purpose: sitePurpose, storeName: data.storeName,
```

with

```ts
        const result = withSourceHeader(files, { shape: drawn, purpose: sitePurpose, action: primaryAction, storeName: data.storeName,
```

In `acceptCandidate`, replace the two lines added in Task 4

```ts
          // Spec 2026-10-13: the draft is checked, previewed and reviewed with the platform header drawn, never with an empty slot.
          generated.files = platformHeader(generated.files, platformSuppliedPages(sitePurpose));
```

with

```ts
          // Spec 2026-10-13: the draft is checked, previewed and reviewed with the platform header drawn, never with an empty slot,
          // and a showcase home always has the contact slot its form action and the publish contract need.
          if (sitePurpose !== 'shop') generated.files = withShowcaseContactSlot(generated.files);
          generated.files = platformHeader(generated.files, platformSuppliedPages(sitePurpose));
```

Replace the start of the `authorInput` line

```ts
const authorInput = { products: true, brief: dto.brief, instruction: dto.instruction, data, assetLegend, previousSource: sep5PreviousSource(oldFiles), motionPlan, storeShell: true,
```

with

```ts
const authorInput = { products: sitePurpose === 'shop', purpose: sitePurpose, action: primaryAction, brief: dto.brief, instruction: dto.instruction, data, assetLegend, previousSource: sep5PreviousSource(oldFiles), motionPlan, storeShell: true,
```

Replace `sep5ResponseSchema(true), SEP5_CLIENT_TIMEOUT_MS);` with `sep5ResponseSchema(sitePurpose === 'shop'), SEP5_CLIENT_TIMEOUT_MS);`.

Replace `if (!authored.success || !sep5ProjectIsUsable(authored.data.files)) {` with `if (!authored.success || !sep5ProjectIsUsable(authored.data.files, sitePurpose)) {`.

Replace the line

```ts
        const listed = sep5Products(authored.data.products, dto.instruction, ownedUrls);
```

with

```ts
        // A showcase sells nothing online: it never creates products, whatever the author returned.
        const listed: { products: typeof products; note?: string } = sitePurpose === 'shop' ? sep5Products(authored.data.products, dto.instruction, ownedUrls) : { products: [] };
```

Replace `const pages = withStaticStandardPages(generated.files);` with `const pages = withStaticStandardPages(generated.files, sitePurpose);`.

Replace

```ts
if (!sep5ProjectIsUsable(edited.files)) throw new Error('la revisión dejó el proyecto sin catálogo, carrito o estilos');
```

with

```ts
if (!sep5ProjectIsUsable(edited.files, sitePurpose)) throw new Error(sitePurpose === 'shop' ? 'la revisión dejó el proyecto sin catálogo, carrito o estilos' : 'la revisión dejó el sitio sin su acción principal o sin estilos');
```

In `assembleSave`, replace

```ts
...(useNext && sitePurpose === 'shop' ? { productPage: 'product.html', checkoutPage: 'checkout.html' } : {}), sitePurpose, scrollFeel, demo: false,
```

with

```ts
...(useNext && sitePurpose === 'shop' ? { productPage: 'product.html', checkoutPage: 'checkout.html' } : {}), ...(primaryAction ? { primaryAction } : {}), sitePurpose, scrollFeel, demo: false,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-primary-action.spec.ts src/storefront-source/source-generation-header.spec.ts src/storefront-source/source-generation-review.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: PASS (4 suites).

- [ ] **Step 6: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-primary-action.ts apps/api/src/storefront-source/source-primary-action.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-header.spec.ts
git commit -m "feat(api): a showcase builds with its main action, no products and only the showcase pages"
```

---
### Task 9: Setup answers reach the store, and contact messages are pinned as panel leads

**Files:**
- Modify: `apps/api/src/stores/store-onboarding.ts` (steps, types, `mergeOnboarding`, `onboardingBrief`)
- Modify: `apps/api/src/stores/dto/store-onboarding.dto.ts`
- Modify: `apps/api/src/stores/stores.service.ts` (`saveOnboarding`)
- Test: `apps/api/src/stores/store-onboarding.spec.ts`, `apps/api/src/stores/onboarding-state.spec.ts`, `apps/api/src/stores/store-contact-lead.spec.ts` (create)

**Interfaces:**
- Consumes: `PRIMARY_ACTION_KINDS`, `type PrimaryActionKind` (Task 1).
- Produces (the dashboard in Task 10 sends these):
  - `ONBOARDING_STEPS = ['name', 'what', 'sell', 'logo', 'photos', 'products', 'story', 'contact']`.
  - `PATCH /v1/stores/:id/onboarding` accepts `purpose: 'shop' | 'showcase'` and `primaryAction: { kind: 'whatsapp' | 'form' | 'booking' | 'phone'; value?: string (≤ 300) }`. `step` may now reach 8.
  - `StoreOnboarding.purpose`, `StoreOnboarding.primaryAction` (read by Task 8 as `Store.onboarding.primaryAction`).
  - When a patch sets `primaryAction.kind === 'form'`, `Store.contactFormEnabled = true`.
  - `onboardingBrief` for a showcase says «No vendemos en línea: …» and ends «Crea mi sitio.».

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/stores/store-onboarding.spec.ts`, replace `  expect(ONBOARDING_STEPS).toHaveLength(7);` with `  expect(ONBOARDING_STEPS).toEqual(['name', 'what', 'sell', 'logo', 'photos', 'products', 'story', 'contact']);` and append:

```ts
it('keeps the showcase answer and a valid main action, and ignores anything else (spec 2026-10-13)', () => {
  const state = mergeOnboarding(null, { purpose: 'showcase', primaryAction: { kind: 'booking', value: '  https://cal.com/deff  ' } });
  expect(state).toMatchObject({ purpose: 'showcase', primaryAction: { kind: 'booking', value: 'https://cal.com/deff' } });
  expect(mergeOnboarding(state, { purpose: 'otro' as any, primaryAction: { kind: 'fax' } }).primaryAction).toEqual({ kind: 'booking', value: 'https://cal.com/deff' });
  expect(mergeOnboarding(state, { purpose: 'otro' as any }).purpose).toBe('showcase');
  expect(mergeOnboarding(state, { primaryAction: { kind: 'form' } }).primaryAction).toEqual({ kind: 'form' });
});

it('briefs a showcase as a site that does not sell online', () => {
  const brief = onboardingBrief('deff', { version: 1, step: 8, done: [], skipped: [], what: 'Estudio de arquitectura', purpose: 'showcase', primaryAction: { kind: 'form' } }, []);
  expect(brief).toContain('No vendemos en línea');
  expect(brief.endsWith('Crea mi sitio.')).toBe(true);
  expect(onboardingBrief('Buna', { version: 1, step: 8, done: [], skipped: [], what: 'Café' }, []).endsWith('Crea mi tienda.')).toBe(true);
});
```

Append to `apps/api/src/stores/onboarding-state.spec.ts`:

```ts
describe("saveOnboarding (spec 2026-10-13)", () => {
  it("keeps the showcase answers, turns the contact form on when it is the main action, and briefs a site", async () => {
    const update = jest.fn(async () => ({}));
    const prisma = { store: { findFirst: jest.fn(async () => ({ name: "deff", onboarding: { version: 1, step: 7, done: [], skipped: [] } })), update }, paymentLink: { findMany: jest.fn(async () => []) } };
    const service = new StoresService(prisma as any, undefined as any, undefined as any);
    const result: any = await service.saveOnboarding("m_1", "s_1", { step: 8, done: ["contact"], purpose: "showcase", primaryAction: { kind: "form" }, brief: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "s_1" }, data: expect.objectContaining({ contactFormEnabled: true, onboarding: expect.objectContaining({ purpose: "showcase", primaryAction: { kind: "form" } }) }) });
    expect(result.brief).toContain("Crea mi sitio.");
    await service.saveOnboarding("m_1", "s_1", { primaryAction: { kind: "booking", value: "https://cal.com/deff" } });
    expect((update.mock.calls[1] as any[])[0].data).not.toHaveProperty("contactFormEnabled");
  });
});
```

Create `apps/api/src/stores/store-contact-lead.spec.ts`:

```ts
import { StoreStatus } from "@prisma/client";
import { StoreCheckoutService } from "./store-checkout.service";

/**
 * Spec 2026-10-13, A2: a showcase's contact form must reach the merchant's panel as a lead. Today's path already does
 * (kit commerce.js renderContact → POST /stores/public/:slug/leads with items: [] → StoreLead + inbox thread, listed by
 * GET /stores/:id/inbox), so no new lead model is added; this pins that path.
 */
describe("a contact message from the storefront form", () => {
  it("is saved as a lead with no cart, opens its inbox thread and emails the store", async () => {
    const prisma: any = {
      store: { findUnique: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "m_1", slug: "deff", name: "deff", status: StoreStatus.ACTIVE, sourcePublicationPaused: false, publicVisibility: true, contactFormEnabled: true, contactFormEmail: null, contactEmail: "hola@deff.bo", checkoutMode: "payment", locations: [] }) },
      merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", email: "owner@deff.bo" }) },
      paymentLink: { findMany: jest.fn().mockResolvedValue([]) },
      storeLead: { create: jest.fn().mockResolvedValue({ id: "lead_1" }) },
    };
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const inbox = { threadForLead: jest.fn().mockResolvedValue(undefined) };
    const service = new StoreCheckoutService(prisma, { create: jest.fn() } as any, email as any, undefined, undefined, inbox as any);
    await expect(service.submitLead("deff", { items: [], name: "Lucía", email: "lucia@gmail.com", message: "Quiero cotizar una casa." })).resolves.toEqual({ submitted: true, leadId: "lead_1" });
    expect(prisma.storeLead.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store_1", customerName: "Lucía", customerEmail: "lucia@gmail.com", message: "Quiero cotizar una casa.", items: [], amount: 0 }) }));
    expect(inbox.threadForLead).toHaveBeenCalledWith(expect.objectContaining({ id: "lead_1", storeId: "store_1", message: "Quiero cotizar una casa." }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "hola@deff.bo", subject: "Nuevo mensaje para deff: Lucía" }));
  });
});
```

- [ ] **Step 2: Run the tests to verify which fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/stores/store-onboarding.spec.ts src/stores/onboarding-state.spec.ts src/stores/store-contact-lead.spec.ts --maxWorkers=2`
Expected:
- FAIL for `store-onboarding.spec.ts`, on `expect(ONBOARDING_STEPS).toEqual([...'sell'...])`.
- FAIL for `onboarding-state.spec.ts`, on `contactFormEnabled: true`.
- PASS for `store-contact-lead.spec.ts`. This is today's path, pinned on purpose; if it fails, stop and report, because the spec then requires a plain contact lead.

- [ ] **Step 3: Implement the onboarding changes**

In `apps/api/src/stores/store-onboarding.ts`, replace the first five lines (the comment, `ONBOARDING_STEPS`, `OnboardingStep`, `StoreOnboarding`, `StoreOnboardingPatch`) with:

```ts
/** First-store walkthrough state (spec 2026-10-11 Elige tu estilo, C1; the sell step: spec 2026-10-13). Pure: the service persists what this returns. */
import { PRIMARY_ACTION_KINDS, type PrimaryActionKind } from '../storefront-source/source-primary-action';

export const ONBOARDING_STEPS = ['name', 'what', 'sell', 'logo', 'photos', 'products', 'story', 'contact'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingAction = { kind: PrimaryActionKind; value?: string };
export type StoreOnboarding = { version: 1; step: number; done: string[]; skipped: string[]; what?: string; story?: string; photos?: string[]; contact?: { whatsapp?: string; city?: string }; purpose?: 'shop' | 'showcase'; primaryAction?: OnboardingAction; finishedAt?: string };
export type StoreOnboardingPatch = { step?: number; done?: OnboardingStep[]; skipped?: OnboardingStep[]; what?: string; story?: string; photos?: string[]; contact?: { whatsapp?: string; city?: string }; purpose?: 'shop' | 'showcase'; primaryAction?: { kind?: unknown; value?: unknown }; finished?: boolean; brief?: boolean };
```

In `mergeOnboarding`, directly below the line `  const story = text(patch.story, 1200) ?? base.story;` add:

```ts
  const purpose = patch.purpose === 'shop' || patch.purpose === 'showcase' ? patch.purpose : base.purpose;
  const actionValue = text(patch.primaryAction?.value, 300);
  const primaryAction: OnboardingAction | undefined = patch.primaryAction && PRIMARY_ACTION_KINDS.includes(patch.primaryAction.kind as PrimaryActionKind)
    ? { kind: patch.primaryAction.kind as PrimaryActionKind, ...(actionValue ? { value: actionValue } : {}) } : base.primaryAction;
```

and replace the line

```ts
    ...(what ? { what } : {}), ...(story ? { story } : {}), ...(photos?.length ? { photos } : {}), ...(contact && Object.keys(contact).length ? { contact } : {}),
```

with

```ts
    ...(what ? { what } : {}), ...(story ? { story } : {}), ...(photos?.length ? { photos } : {}), ...(contact && Object.keys(contact).length ? { contact } : {}),
    ...(purpose ? { purpose } : {}), ...(primaryAction ? { primaryAction } : {}),
```

In `onboardingBrief`, replace the line

```ts
    'Crea mi tienda.',
```

with

```ts
    onboarding.purpose === 'showcase' ? 'No vendemos en línea: el sitio muestra el negocio y lleva a su acción principal.' : '',
    onboarding.purpose === 'showcase' ? 'Crea mi sitio.' : 'Crea mi tienda.',
```

In `apps/api/src/stores/dto/store-onboarding.dto.ts`, replace the line

```ts
import { ONBOARDING_STEPS, type OnboardingStep } from '../store-onboarding';
```

with

```ts
import { ONBOARDING_STEPS, type OnboardingStep } from '../store-onboarding';
import { PRIMARY_ACTION_KINDS, type PrimaryActionKind } from '../../storefront-source/source-primary-action';
```

Directly above `export class StoreOnboardingDto {` add:

```ts
class StoreOnboardingActionDto {
  @IsIn(PRIMARY_ACTION_KINDS) kind!: PrimaryActionKind;
  @IsOptional() @IsString() @MaxLength(300) value?: string;
}
```

Replace `  @IsOptional() @IsInt() @Min(0) @Max(7) step?: number;` with `  @IsOptional() @IsInt() @Min(0) @Max(8) step?: number;`. Then, directly below the line `  @IsOptional() @ValidateNested() @Type(() => StoreOnboardingContactDto) contact?: StoreOnboardingContactDto;` add:

```ts
  @IsOptional() @IsIn(['shop', 'showcase']) purpose?: 'shop' | 'showcase';
  @IsOptional() @ValidateNested() @Type(() => StoreOnboardingActionDto) primaryAction?: StoreOnboardingActionDto;
```

In `apps/api/src/stores/stores.service.ts`, replace

```ts
...(patch.contact?.whatsapp && onboarding.contact?.whatsapp ? { contactPhone: onboarding.contact.whatsapp } : {}) } });
```

with

```ts
...(patch.contact?.whatsapp && onboarding.contact?.whatsapp ? { contactPhone: onboarding.contact.whatsapp } : {}), ...(patch.primaryAction && onboarding.primaryAction?.kind === 'form' ? { contactFormEnabled: true } : {}) } });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/stores/store-onboarding.spec.ts src/stores/onboarding-state.spec.ts src/stores/store-contact-lead.spec.ts --maxWorkers=2`
Expected: PASS (3 suites).

- [ ] **Step 5: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/stores/store-onboarding.ts apps/api/src/stores/store-onboarding.spec.ts apps/api/src/stores/dto/store-onboarding.dto.ts apps/api/src/stores/stores.service.ts apps/api/src/stores/onboarding-state.spec.ts apps/api/src/stores/store-contact-lead.spec.ts
git commit -m "feat(api): setup keeps the sell answer and main action, the form choice turns contact on; contact leads pinned"
```

---
### Task 10: The setup form asks «¿Vas a vender en línea?» and what the main button does

**Files:**
- Modify: `apps/merchant-dashboard/src/onboarding-walkthrough.mjs`. That covers the steps (lines 4-12), `nextState` (16-26), `field` (`contact` case, line 50, plus a new `sell` case), the resumed values (line 112), `save` (141-184) and `advance` (186-200), and the `input` listener (line 202).
- Modify: `apps/merchant-dashboard/src/onboarding-walkthrough.css` (append)
- Test: `apps/merchant-dashboard/src/onboarding-walkthrough.test.mjs`

**Interfaces:**
- Consumes: the `PATCH /stores/:id/onboarding` fields `purpose` and `primaryAction` (Task 9); `sitePurpose: 'service'` on `POST /stores/:id/source-project/chat-jobs` (already accepted by `SendSourceMessageDto`).
- Produces:
  - `guessSitePurpose(what): 'shop' | 'showcase'`
  - `mainAction(values): { kind: 'whatsapp' | 'form' | 'booking' | 'phone', value?: string }`
  - `WALKTHROUGH_STEPS` now has eight steps; `sell` is at index 2.

- [ ] **Step 1: Update the existing tests for the new step and add the failing ones**

In `apps/merchant-dashboard/src/onboarding-walkthrough.test.mjs`:

Replace the import line with:

```js
import { WALKTHROUGH_STEPS, guessSitePurpose, isUnfinishedStore, mainAction, showWalkthroughChoice, walkthroughChoiceView, nextState, productDrafts, runWalkthrough, walkthroughEntry, walkthroughView } from './onboarding-walkthrough.mjs';
```

Replace the first test, `test('seven steps, only the first two required', () => {` through its closing `});`, with:

```js
test('eight steps; name, what and the sell question are required', () => {
  assert.deepEqual(WALKTHROUGH_STEPS.map(s => s.id), ['name', 'what', 'sell', 'logo', 'photos', 'products', 'story', 'contact']);
  assert.deepEqual(WALKTHROUGH_STEPS.filter(s => !s.optional).map(s => s.id), ['name', 'what', 'sell']);
  assert.equal(WALKTHROUGH_STEPS[2].title, '¿Vas a vender en línea?');
});
```

Make these exact one-line replacements **in the order listed**, top to bottom. Each old line occurs exactly once at the moment you replace it; applying them out of order can create a second copy of a later old line.
- `  assert.equal(nextState({ ...named, step: 2 }, { type: 'skip' }).step, 3);` → `  assert.equal(nextState({ ...named, step: 3 }, { type: 'skip' }).step, 4);`
- `  const html = walkthroughView({ ...start, step: 2, values: { name: 'Café Buna' } });` → `  const html = walkthroughView({ ...start, step: 3, values: { name: 'Café Buna' } });`
- `  assert.match(html, /aria-valuenow="3"/);` → `  assert.match(html, /aria-valuenow="4"/);`
- `  assert.match(walkthroughView({ ...start, step: 6 }), /Crear mi tienda/);` → `  assert.match(walkthroughView({ ...start, step: 7 }), /Crear mi tienda/);`
- `  const w = await drive(4);` → `  const w = await drive(5);`
- `  const f = await drive(4, { fail: c => failRow2 && c.body?.name === 'Taza' });` → `  const f = await drive(5, { fail: c => failRow2 && c.body?.name === 'Taza' });`
- `  const w = await drive(6, { fail: c => failJob && c.path.endsWith('/chat-jobs') });` → `  const w = await drive(7, { fail: c => failJob && c.path.endsWith('/chat-jobs') });`
- `  const w = await drive(6, { fail: c => failFinish && c.body?.finished });` → `  const w = await drive(7, { fail: c => failFinish && c.body?.finished });`
- `  const w = await drive(3, { uploadFail: () => (failOnce ? ((failOnce = false), true) : false) });` → `  const w = await drive(4, { uploadFail: () => (failOnce ? ((failOnce = false), true) : false) });`
- `  const w = await drive(3);` → `  const w = await drive(4);`
- `  const w = await drive(2);` → `  const w = await drive(3);`
- `  const s = await drive(5);` → `  const s = await drive(6);`
- `  const d = await drive(4);` → `  const d = await drive(5);`
- `  const d = await drive(3);` → `  const d = await drive(4);`

In the test `test('the chat job is posted before the store is finished, with one requestId across retries', async () => {`, add below `  assert.ok(job.requestId);`:

```js
  assert.equal('sitePurpose' in job, false);
```

Append at the end of the file:

```js
test('the sell screen arrives answered by a local guess on the description, and Siguiente keeps it (spec 2026-10-13)', () => {
  assert.equal(guessSitePurpose('Estudio de arquitectura y diseño de interiores'), 'showcase');
  for (const what of ['Consultora contable en La Paz', 'Clínica dental', 'Abogados laborales', 'Fotógrafa de bodas', 'Servicios profesionales de ingeniería']) assert.equal(guessSitePurpose(what), 'showcase', what);
  for (const what of ['Café de especialidad tostado en Sopocachi', 'Ropa de bebé', '', undefined]) assert.equal(guessSitePurpose(what), 'shop', String(what));
  const html = walkthroughView({ ...start, step: 2, values: { what: 'Clínica dental' } });
  assert.match(html, /Sí, quiero vender/);
  assert.match(html, /No, solo mostrar mi negocio/);
  assert.match(html, /value="showcase" checked/);
  assert.match(walkthroughView({ ...start, step: 2, values: { what: 'Clínica dental', sell: 'shop' } }), /value="shop" checked/);
  const moved = nextState({ ...start, step: 2, values: { what: 'Clínica dental' } }, { type: 'next' });
  assert.equal(moved.values.sell, 'showcase');
  assert.equal(moved.step, 3);
});

test('a showcase passes over «Agrega hasta 5 productos» both ways; a shop does not', () => {
  const showcase = { ...start, values: { sell: 'showcase' } };
  assert.equal(nextState({ ...showcase, step: 4 }, { type: 'next' }).step, 6);
  assert.equal(nextState({ ...showcase, step: 4 }, { type: 'skip' }).step, 6);
  assert.equal(nextState({ ...showcase, step: 6 }, { type: 'back' }).step, 4);
  assert.equal(nextState({ ...start, values: { sell: 'shop' }, step: 4 }, { type: 'next' }).step, 5);
});

test('a showcase chooses what its main button does: WhatsApp with a number, else the form; a booking link needs https', () => {
  const contact = { ...start, step: 7, values: { sell: 'showcase' } };
  assert.match(walkthroughView(contact), /¿Qué hace el botón principal\?/);
  for (const label of ['WhatsApp', 'Formulario de contacto', 'Enlace de reservas', 'Llamada']) assert.match(walkthroughView(contact), new RegExp(label));
  assert.match(walkthroughView(contact), /value="form" checked/);
  assert.match(walkthroughView({ ...contact, values: { sell: 'showcase', whatsapp: '+591 70000000' } }), /value="whatsapp" checked/);
  assert.match(walkthroughView({ ...contact, values: { sell: 'showcase', action: 'booking' } }), /name="booking"/);
  assert.doesNotMatch(walkthroughView({ ...contact, values: { sell: 'shop' } }), /botón principal/);
  assert.deepEqual(mainAction({ whatsapp: '+591 70000000' }), { kind: 'whatsapp', value: '+591 70000000' });
  assert.deepEqual(mainAction({}), { kind: 'form' });
  assert.match(nextState({ ...contact, values: { sell: 'showcase', action: 'booking', booking: 'http://cal.com/x' } }, { type: 'next' }).error, /https:\/\//);
  assert.match(nextState({ ...contact, values: { sell: 'showcase', action: 'phone', phone: '12' } }, { type: 'next' }).error, /número/);
  assert.equal(nextState({ ...contact, values: { sell: 'showcase', action: 'booking', booking: 'https://cal.com/deff' } }, { type: 'next' }).error, null);
});

test('a showcase skips products, saves its main action and builds as a service site', async () => {
  const w = await drive(2);
  await w.type('sell', 'showcase');
  await w.submit(); // sell → logo
  await w.submit(); // logo → photos
  await w.submit(); // photos → story (products passed over)
  await w.submit(); // story → contact
  await w.type('action', 'booking');
  await w.submit();
  assert.match(w.root.innerHTML, /Escribe el enlace de reservas completo/);
  await w.type('booking', 'https://cal.com/deff');
  await w.submit();
  const patches = w.calls.filter(c => c.method === 'PATCH' && c.path === '/stores/s1/onboarding').map(c => c.body);
  assert.deepEqual(patches[0], { step: 3, done: ['sell'], purpose: 'showcase' });
  assert.equal(patches.find(b => b.done?.includes('photos')).step, 6);
  assert.equal(posts(w.calls, '/payment_links').length, 0);
  assert.deepEqual(patches.find(b => b.brief).primaryAction, { kind: 'booking', value: 'https://cal.com/deff' });
  assert.equal(posts(w.calls, '/chat-jobs')[0].body.sitePurpose, 'service');
  assert.equal(w.done(), 's1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/merchant-dashboard && node --test src/onboarding-walkthrough.test.mjs`
Expected: FAIL. The suite reports `SyntaxError: The requested module './onboarding-walkthrough.mjs' does not provide an export named 'guessSitePurpose'`.

- [ ] **Step 3: Implement the step, the guess, the skip and the action choice**

In `apps/merchant-dashboard/src/onboarding-walkthrough.mjs`, replace

```js
  { id: 'what', title: '¿Qué vendes o a qué te dedicas?', optional: false },
```

with

```js
  { id: 'what', title: '¿Qué vendes o a qué te dedicas?', optional: false },
  { id: 'sell', title: '¿Vas a vender en línea?', optional: false },
```

Replace the whole function `nextState` (from `export function nextState(state, action) {` through its closing `}`) with:

```js
// A showcase (spec 2026-10-13) shows a business instead of selling online. These words in «¿Qué vendes o a qué te dedicas?»
// pre-select «No, solo mostrar mi negocio»: a local guess, never a model call, and the merchant confirms it on the next screen.
const SHOWCASE_WORDS = [/\barquitect/, /\bconsultor/, /\bclinica/, /\babogad/, /\bfotograf/, /\bestudio de\b/, /\bdiseno de interiores\b/, /\bservicios profesionales\b/, /\bodontolog/, /\bdentist/, /\bpsicolog/, /\bcontador/, /\bnotari/, /\basesor/, /\bagencia de\b/];
export function guessSitePurpose(what) {
  const text = String(what || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return SHOWCASE_WORDS.some(word => word.test(text)) ? 'showcase' : 'shop';
}

// What «¿Qué hace el botón principal?» saves. WhatsApp uses the number field above it; with nothing chosen, WhatsApp when a
// number is given, otherwise the contact form.
export function mainAction(values) {
  const digits = String(values.whatsapp || '').replace(/\D/g, '');
  const kind = values.action || (digits.length >= 7 ? 'whatsapp' : 'form');
  if (kind === 'whatsapp') return { kind, value: String(values.whatsapp || '').trim() };
  if (kind === 'booking') return { kind, value: String(values.booking || '').trim() };
  if (kind === 'phone') return { kind, value: String(values.phone || '').trim() };
  return { kind: 'form' };
}

function actionProblem(step, values) {
  if (step.id !== 'contact' || values.sell !== 'showcase') return null;
  const action = mainAction(values);
  const digits = String(action.value || '').replace(/\D/g, '').length;
  if (action.kind === 'whatsapp' && digits < 7) return 'Escribe tu número de WhatsApp o elige otro botón.';
  if (action.kind === 'phone' && digits < 7) return 'Escribe el número al que te llaman.';
  if (action.kind === 'booking' && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(action.value)) return 'Escribe el enlace de reservas completo, empezando con https://';
  return null;
}

// «Agrega hasta 5 productos» is passed over, both ways, once the merchant said they will not sell online.
const move = (from, by, values) => {
  let to = Math.min(LAST, Math.max(0, from + by));
  if (WALKTHROUGH_STEPS[to].id === 'products' && values.sell === 'showcase') to = Math.min(LAST, Math.max(0, to + by));
  return to;
};

export function nextState(state, action) {
  const step = WALKTHROUGH_STEPS[state.step];
  if (action.type === 'field') return { ...state, error: null, values: { ...state.values, [action.name]: action.value } };
  if (action.type === 'back') return { ...state, error: null, step: move(state.step, -1, state.values) };
  if (action.type === 'skip') return step.optional ? { ...state, error: null, step: move(state.step, 1, state.values) } : state;
  if (action.type === 'next') {
    // The sell screen arrives answered with the guess; Siguiente without touching it keeps the guess.
    const values = step.id === 'sell' && !state.values.sell ? { ...state.values, sell: guessSitePurpose(state.values.what) } : state.values;
    if (!step.optional && !String(values[step.id] || '').trim()) return { ...state, error: REQUIRED[step.id] };
    const problem = actionProblem(step, values);
    if (problem) return { ...state, error: problem };
    return { ...state, values, error: null, step: move(state.step, 1, values) };
  }
  return state;
}
```

In `field`, replace the whole `contact` case line

```js
    case 'contact': return `<input class="wt-input" name="whatsapp" inputmode="tel" placeholder="WhatsApp: +591 70000000" value="${v('whatsapp')}"><input class="wt-input" name="city" placeholder="Ciudad" value="${v('city')}">`;
```

with

```js
    case 'sell': {
      const chosen = values.sell || guessSitePurpose(values.what);
      const option = (value, label) => `<label class="wt-choice"><input type="radio" name="sell" value="${value}" ${chosen === value ? 'checked' : ''}> ${label}</label>`;
      return `<div class="wt-choices" role="radiogroup" aria-label="¿Vas a vender en línea?">${option('shop', 'Sí, quiero vender')}${option('showcase', 'No, solo mostrar mi negocio')}</div><p class="wt-aside">Sin ventas en línea tu sitio no tiene carrito ni productos: muestra tu negocio y lleva a tus clientes a contactarte.</p>`;
    }
    case 'contact': {
      const base = `<input class="wt-input" name="whatsapp" inputmode="tel" placeholder="WhatsApp: +591 70000000" value="${v('whatsapp')}"><input class="wt-input" name="city" placeholder="Ciudad" value="${v('city')}">`;
      if (values.sell !== 'showcase') return base;
      const chosen = mainAction(values).kind;
      const option = (kind, label) => `<label class="wt-choice"><input type="radio" name="action" value="${kind}" ${chosen === kind ? 'checked' : ''}> ${label}</label>`;
      return `${base}<fieldset class="wt-choices"><legend>¿Qué hace el botón principal?</legend>${option('whatsapp', 'WhatsApp')}${option('form', 'Formulario de contacto')}${option('booking', 'Enlace de reservas')}${option('phone', 'Llamada')}</fieldset>${chosen === 'booking' ? `<input class="wt-input" name="booking" inputmode="url" placeholder="https://tu-agenda.com/tu-negocio" value="${v('booking')}">` : ''}${chosen === 'phone' ? `<input class="wt-input" name="phone" inputmode="tel" placeholder="Teléfono: +591 2 2000000" value="${v('phone')}">` : ''}`;
    }
```

In `runWalkthrough`, replace

```js
whatsapp: saved?.contact?.whatsapp, city: saved?.contact?.city } } : {}) };
```

with

```js
whatsapp: saved?.contact?.whatsapp, city: saved?.contact?.city, sell: saved?.purpose, action: saved?.primaryAction?.kind, booking: saved?.primaryAction?.kind === 'booking' ? saved.primaryAction.value : undefined, phone: saved?.primaryAction?.kind === 'phone' ? saved.primaryAction.value : undefined } } : {}) };
```

Replace

```js
  async function save(skipped, picked) {
    const id = WALKTHROUGH_STEPS[state.step].id;
    const mark = { step: state.step + 1, ...(skipped ? { skipped: [id] } : { done: [id] }) };
```

with

```js
  // `next` is the step the merchant lands on, which passes over products for a showcase.
  async function save(skipped, picked, next) {
    const id = WALKTHROUGH_STEPS[state.step].id;
    const mark = { step: next, ...(skipped ? { skipped: [id] } : { done: [id] }) };
```

Replace

```js
    if (id === 'what') return patch({ ...mark, what: state.values.what });
```

with

```js
    if (id === 'what') return patch({ ...mark, what: state.values.what });
    if (id === 'sell') return patch({ ...mark, purpose: state.values.sell });
```

Replace these two lines inside `if (!jobPosted) {`

```js
        brief = (await patch({ ...mark, ...(touched.has('whatsapp') || touched.has('city') ? { contact: { whatsapp: state.values.whatsapp, city: state.values.city } } : {}), brief: true }))?.brief;
        await api(`/stores/${state.storeId}/source-project/chat-jobs`, { method: 'POST', body: JSON.stringify({ instruction: brief || `Mi negocio se llama ${state.values.name}.\nCrea mi tienda.`, assetUrls: state.values.photos || [], revision: 0, setupAction: 'generate', requestId }) });
```

with

```js
        // A showcase (spec 2026-10-13) saves its main action and builds as a service site: no products, no cart.
        const showcase = state.values.sell === 'showcase';
        brief = (await patch({ ...mark, ...(touched.has('whatsapp') || touched.has('city') ? { contact: { whatsapp: state.values.whatsapp, city: state.values.city } } : {}), ...(showcase ? { primaryAction: mainAction(state.values) } : {}), brief: true }))?.brief;
        await api(`/stores/${state.storeId}/source-project/chat-jobs`, { method: 'POST', body: JSON.stringify({ instruction: brief || `Mi negocio se llama ${state.values.name}.\nCrea mi tienda.`, assetUrls: state.values.photos || [], revision: 0, setupAction: 'generate', requestId, ...(showcase ? { sitePurpose: 'service' } : {}) }) });
```

Replace the whole function `advance` (from `  async function advance(skipped) {` through its closing `  }`, just above `  listen('input'`) with:

```js
  async function advance(skipped) {
    const moved = skipped ? nextState(state, { type: 'skip' }) : nextState(state, { type: 'next' });
    if (moved.error) { state = moved; return paint(); }
    const picked = { logo: state.pending.logo.map(p => p.file), photos: state.pending.photos.map(p => p.file) };
    // The sell screen's guess becomes the answer here, so the step saves what the merchant saw.
    state = { ...state, values: moved.values, busy: true, error: null }; paint();
    try {
      const last = state.step === LAST;
      await save(skipped, picked, moved.step);
      if (last) return onDone(state.storeId);
      state = { ...moved, storeId: state.storeId, values: state.values, pending: state.pending, busy: false };
    } catch (error) {
      state = { ...state, busy: false, error: `No pudimos guardar este paso (${error?.message || 'error'}). Inténtalo de nuevo${WALKTHROUGH_STEPS[state.step].optional ? ' o sáltalo' : ''}.` };
    }
    paint();
  }
```

Replace the `input` listener line

```js
  listen('input', event => { if (event.target.name && event.target.type !== 'file') { touched.add(event.target.name); state = nextState(state, { type: 'field', name: event.target.name, value: event.target.value }); } });
```

with

```js
  // Choosing the main button repaints, so the booking link or phone field it needs appears.
  listen('input', event => { if (event.target.name && event.target.type !== 'file') { touched.add(event.target.name); state = nextState(state, { type: 'field', name: event.target.name, value: event.target.value }); if (event.target.name === 'action') paint(); } });
```

- [ ] **Step 4: Style the choices**

Append to `apps/merchant-dashboard/src/onboarding-walkthrough.css`:

```css
.wt-choices { display: grid; gap: 10px; margin: 0; padding: 0; border: 0; } .wt-choices legend { font-weight: 600; margin-bottom: 6px; }
.wt-choice { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 12px 14px; border: 1px solid var(--line, #ddd); border-radius: 10px; font-size: 17px; cursor: pointer; }
.wt-choice:has(input:checked) { border-color: var(--ink, #111); box-shadow: inset 0 0 0 1px var(--ink, #111); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/merchant-dashboard && node --test src/onboarding-walkthrough.test.mjs`
Expected: PASS (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/merchant-dashboard/src/onboarding-walkthrough.mjs apps/merchant-dashboard/src/onboarding-walkthrough.css apps/merchant-dashboard/src/onboarding-walkthrough.test.mjs
git commit -m "feat(dashboard): setup asks whether to sell online, skips products for a showcase and picks its main button"
```

---
### Task 11: The «Elige tu estilo» cards preview the header that will be built

**Files:**
- Modify: `apps/api/src/storefront-source/source-header.ts` (append `swapPreviewHeader`)
- Modify: `apps/api/src/storefront-source/source-style-proposal.ts:1-8,33-47`
- Modify: `apps/api/src/storefront-source/source-chat.service.ts:250,254` (`styleProposal`)
- Test: `apps/api/src/storefront-source/source-style-proposal.spec.ts`, `apps/merchant-studio/src/source-style-pick.test.ts`

**Interfaces:**
- Consumes: `renderSourceHeader`, `HEADER_SHAPES`, `FALLBACK_HEADER_SHAPE`, `elementAt`, `decodeEntities`, `headerFact` (Tasks 1 and 3); `sourceSitePurpose` (`source-site-purpose.ts`); `slot.draw.header` (`StyleSlot`).
- Produces:
  - `swapPreviewHeader(html: string, header: string): string`
  - `styleProposalView(generationId: string, proposal: StyleProposal, storeName = '')`. Each card's `html` now has its first `<header>` replaced by the platform header in the slot's drawn shape (fallback `menu-button`), for the proposal's purpose (from `request.dto.brief`). The store name is `storeName`, or else the name in the hero's `[data-store-name]`. A showcase card shows «Pide una cotización».

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/source-style-proposal.spec.ts`:

```ts
describe('the cards preview the platform header that will be built (spec 2026-10-13)', () => {
  const withDraw = (header: string, purpose?: string) => {
    const value = proposal();
    value.slots = value.slots.map(slot => ({ ...slot, draw: { header } })) as any;
    value.heroes = [{ html: '<style>.th-bar{display:flex}</style><header class="th-bar"><span data-store-name>Buna &amp; Co</span><span>Carrito (0)</span></header><section><h1>Hola</h1></section>', source: 'model' }, null];
    if (purpose) value.request = { ...value.request, dto: { ...value.request.dto, brief: { sitePurpose: purpose } } as any };
    return value;
  };

  it('swaps the hero header for the platform header in the card shape, with the store name', () => {
    const html = styleProposalView('gen1', withDraw('side-rail'), 'Café Buna').cards[0].html!;
    expect(html).toContain('<header data-pagosya-header data-shape="side-rail" data-purpose="shop"');
    expect(html).toContain('<span data-store-name>Café Buna</span>');
    expect(html).toContain('data-cart-open');
    expect(html).not.toContain('Carrito (0)');
    expect(html).toContain('<section><h1>Hola</h1></section>');
    expect(html.match(/<header\b/g)).toHaveLength(1);
  });

  it('shows a showcase card with the main action and no cart, falls back to menu-button, and keeps the hero name without a store name', () => {
    const html = styleProposalView('gen1', withDraw('', 'service')).cards[0].html!;
    expect(html).toContain('data-shape="menu-button" data-purpose="showcase"');
    expect(html).toContain('Pide una cotización');
    expect(html).not.toContain('data-cart-open');
    expect(html).toContain('<span data-store-name>Buna &amp; Co</span>');
  });
});
```

Append inside the `describe('style picker', () => {` block of `apps/merchant-studio/src/source-style-pick.test.ts` (directly after its first `it(…)`):

```ts
  // Spec 2026-10-13: the API swaps the platform header into each card; the sandboxed card shows it as built, its menu closed.
  it('shows the platform header a card carries, inert in the sandboxed frame', () => {
    const header = '<header data-pagosya-header data-shape="side-rail" data-purpose="shop" class="pyh pyh--side-rail"><div class="pyh-menu" id="pyh-menu" data-pagosya-header-menu hidden></div></header>';
    const withHeader = { ...card(0, 'calm'), html: `${header}<section><h1>Hola</h1></section>` };
    const grid = renderStylePicker({ ...view, cards: [withHeader, card(1, 'bold')] }, state);
    expect(grid).toContain('sandbox=""');
    expect(grid).toContain(heroSrcdoc(withHeader.html));
    expect(heroSrcdoc(withHeader.html)).toContain('data-pagosya-header-menu hidden');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-style-proposal.spec.ts --maxWorkers=2`
Expected: FAIL on `expect(html).toContain('<header data-pagosya-header data-shape="side-rail" data-purpose="shop"')`.

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-style-pick.test.ts --maxWorkers=2`
Expected: PASS. The Studio already passes card HTML through unchanged; this test pins that the new header reaches the card inert, so it guards the mount rather than driving a change.

- [ ] **Step 3: Add `swapPreviewHeader`**

Append to `apps/api/src/storefront-source/source-header.ts`:

```ts
/** A style card's hero with the platform header in place of the one it was drawn with: the cards preview what will be built. */
export function swapPreviewHeader(html: string, header: string): string {
  return replaceElement(html, /<header\b[^>]*>/i, header) ?? header + html;
}
```

- [ ] **Step 4: Draw the header into each card**

In `apps/api/src/storefront-source/source-style-proposal.ts`, directly below the line `import { commerceSummary } from './design-engine/commerce-draw';` add:

```ts
import { decodeEntities, FALLBACK_HEADER_SHAPE, HEADER_SHAPES, headerFact, renderSourceHeader, swapPreviewHeader, type HeaderShape } from './source-header';
import { sourceSitePurpose } from './source-site-purpose';

/** Spec 2026-10-13: the menu a card shows before any section exists; the built store links its own marked sections. */
const PREVIEW_LINKS = { shop: ['Productos', 'Nosotros', 'Contacto'], showcase: ['Servicios', 'Nosotros', 'Contacto'] };
```

Replace

```ts
export function styleProposalView(generationId: string, proposal: StyleProposal) {
```

with

```ts
export function styleProposalView(generationId: string, proposal: StyleProposal, storeName = '') {
  const brief = (proposal.request.dto.brief ?? {}) as { sitePurpose?: unknown; businessInformation?: unknown };
  const purpose = sourceSitePurpose(brief);
  const previewHeader = (slot: number, heroHtml: string) => {
    const drawn = proposal.slots[slot]?.draw?.header ?? '';
    const shape = (HEADER_SHAPES as readonly string[]).includes(drawn) ? drawn as HeaderShape : FALLBACK_HEADER_SHAPE;
    const name = storeName || decodeEntities(heroHtml.match(/data-store-name[^>]*>([^<]{1,80})</)?.[1]?.trim() ?? '');
    const links = PREVIEW_LINKS[purpose === 'shop' ? 'shop' : 'showcase'].map(label => ({ href: '#', label }));
    return renderSourceHeader({ shape, purpose, storeName: name, links, fact: headerFact(brief.businessInformation), search: true });
  };
```

and replace

```ts
      html: hero ? cardHtmlForPreview(hero.html, proposal.assetMap) : null, source: hero?.source ?? null, pending: proposal.status === 'RUNNING' && proposal.heroPending?.[index] === true,
```

with

```ts
      html: hero ? cardHtmlForPreview(swapPreviewHeader(hero.html, previewHeader(slot, hero.html)), proposal.assetMap) : null, source: hero?.source ?? null, pending: proposal.status === 'RUNNING' && proposal.heroPending?.[index] === true,
```

In `apps/api/src/storefront-source/source-chat.service.ts`, replace the line

```ts
    const [, current] = await Promise.all([this.owner(merchantId, storeId), this.projects.current(merchantId, storeId)]);
```

with

```ts
    const [store, current] = await Promise.all([this.owner(merchantId, storeId), this.projects.current(merchantId, storeId)]);
```

and replace

```ts
    return { proposal: shown ? styleProposalView(row!.id, proposal) : null };
```

with

```ts
    return { proposal: shown ? styleProposalView(row!.id, proposal, store.name) : null };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-style-proposal.spec.ts src/storefront-source/source-chat-style.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: PASS (3 suites).

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-style-pick.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output, exit 0.

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-header.ts apps/api/src/storefront-source/source-style-proposal.ts apps/api/src/storefront-source/source-style-proposal.spec.ts apps/api/src/storefront-source/source-chat.service.ts apps/merchant-studio/src/source-style-pick.test.ts
git commit -m "feat(yapi): style cards preview the platform header in the shape that will be built"
```

---

## Self-review notes (for the executor)

- **Spec coverage:**
  - A1 setup form: Tasks 9 and 10.
  - A2 showcase author, calls to action, page set and contact form: Tasks 6, 7 and 8. Contact leads are verified in Task 9 (no new model, because they already reach the panel).
  - B1 library, token styling, phone layouts, menu behaviour: Tasks 1 and 2.
  - B2 slot and `data-nav-label`, the save step on every page, replacing the shared-header copy, re-rendering on every save, leaving older stores alone, the card preview: Tasks 3, 4, 5 and 11.
  - The header-clickable check keeps running unchanged. It now sees the platform header, because `acceptCandidate` draws it before the gate.
  - Error handling: shape fallback (Task 3); invalid action becomes the form (Tasks 1 and 8); missing slot logged once (Task 4); the guess never blocks the form (Task 10).
- **Dry run.** On 2026-10-13, every code block in Tasks 1–11 was applied to a scratch mirror of this branch, outside the repo, and the named tests were run there.
  - All passed: 125 fast specs, 185 integration and regression specs, the Chromium probes (40 shape × purpose × width runs plus the long-name runs), 25 dashboard tests and the Studio picker test.
  - `tsc --noEmit` was clean on the edited files.
  - Failures in the executor's run therefore most likely come from drift in the anchor text since then; re-read the named lines before editing.
- **Live check (out of plan, after the owner's ChatGPT plan is renewed):** one shop and one showcase through real generation, per the spec's Testing section.
