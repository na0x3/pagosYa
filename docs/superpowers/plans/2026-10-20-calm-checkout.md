# One Calm Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store's order review, test payment, hosted payment page and confirmation draw one ayvilabs/Shopify-style shell — white form left, grey summary with the business photo right, payment logos — with only the store's logo, name, photo and a readable accent.

**Architecture:** One stylesheet and one logo/method JSON live in `packages/storefront-kit/checkout-shell/`. The storefront kit receives them as a generated part of `kit/commerce.js` (the builder turns the two files into JS constants); `apps/checkout` imports the same files. The kit keeps every field name, validator and submit path; only the review's markup is re-arranged into `.pya-co__main` and `.pya-co__summary`. YAPI checkout/review templates and authored checkout pages stop drawing the checkout.

**Tech Stack:** Plain browser JS (kit IIFE parts concatenated by `tools/build-commerce.mjs`), TypeScript + Vite + Vitest + jsdom (`apps/checkout`), NestJS + Jest (`apps/api`), Playwright (`apps/merchant-studio` e2e).

**Spec:** `docs/superpowers/specs/2026-10-20-calm-checkout-design.md`

## Global Constraints

- Palette fixed: left `#fff`, right `#f7f7f7`, divider `#ececec`, ink `#1a1a1a`, muted `#6b6b6b`, borders `#d9d9d9`, system UI font stack. The checkout never follows a store into dark.
- Store branding limited to: logo + name in the top bar, business photo at the top of the summary, accent on the primary button and the selected radio.
- Accent rule: used only if its text contrast is ≥ 4.5:1 **and** the button itself reaches 3:1 on the white page (the second check tightens the spec so a pale accent never draws an invisible button); otherwise `#1a1a1a` on white.
- Business photo: `Store.bannerUrl`, else the first cart line's photo, else no photo box. 16:9, 12px radius, `object-fit: cover`.
- Payment logos: Visa, Mastercard, American Express, QR, Tigo Money, bank transfer — inline SVG badges ~38×24, 4px radius, 1px border. Methods listed = `DOMESTIC_METHOD_TYPES` (CARD, TIGO_MONEY, BANK_TRANSFER, QR), shown in the order Tarjeta, QR, Tigo Money, Transferencia.
- Trust strip under the pay button: the logos + «Pago seguro procesado por pagosYa».
- Steps line `Carrito › Entrega › Pago`.
- Phone ≤ 760px: one column, summary collapses into `Ver resumen del pedido ▾ · {total}`; inputs 16px; targets ≥ 48px.
- Motion only on the summary disclosure and the opening payment row (200ms ease-out); none under `prefers-reduced-motion`.
- Every existing field `name`, element id read by submit code, and validation message stays as it is. Existing button labels stay («Pagar con pagosYa», «Continuar al pago de prueba», «Completar prueba», «Pedir por WhatsApp», «Continuar al contacto»); the shell adds the total after them in an `aria-hidden` span.
- The cart drawer, the added notice and the rest of the store keep the store's look.
- Copy is Spanish (Bolivia); money via the existing `money()` / `formatAmount()`.
- Never edit `packages/storefront-kit/kit/commerce.js` by hand: edit `commerce-src/` parts, then run `node packages/storefront-kit/tools/build-commerce.mjs`.
- Saving any file under `apps/api` restarts the owner's `nest --watch` and cuts a running YAPI request: Task 6 is one short burst, announced first.

## Review Focus

1. **A store stylesheet with bold element rules** (`h1{font-size:66px}`, `button{border-radius:999px;background:yellow}`, `input{background:#111}`, `[data-pagosya-cart] button{…}`) must not change the shell → Playwright test in Task 9.
2. **An authored `checkout.html`** (store header + photo aside around `[data-pagosya-checkout-page]`) must be fully covered by the shell, with its links unreachable by Tab → jsdom test in Task 3.
3. **A store with no logo, no banner and products without photos** → no empty boxes: no `<img>` in the bar, no `.pya-co__photo`, lines without thumbs → jsdom test in Task 4.
4. **Changing delivery method through the new radio cards** must drive the hidden `select[name=method]` exactly like before (address fieldset shows/hides, shipping quote runs, submit reads it) → jsdom test in Task 4.
5. **A long product name and a price on a 390px phone** wrap the name and never break the price; the summary toggle shows the live total after a shipping quote → Playwright test in Task 9 (phone) and jsdom test in Task 4 (total sync).

---

## File structure

| File | Responsibility |
|---|---|
| `packages/storefront-kit/checkout-shell/shell.css` (new) | The whole shell look, both surfaces. |
| `packages/storefront-kit/checkout-shell/logos.json` (new) | Logo SVG strings + the payment method list (type, label, logos, note). |
| `packages/storefront-kit/package.json` | Export `./checkout-shell/*`. |
| `packages/storefront-kit/tools/build-commerce.mjs` | Generated part `checkout/shell-assets.js` from the two files. |
| `packages/storefront-kit/commerce-src/checkout/shell.js` (new part) | Kit shell helpers: style injection, brand, steps, logos, accent, photo, review shaping, total sync. |
| `packages/storefront-kit/commerce-src/checkout/overlay.js` | `showCheckout(mode)` draws the shell frame; full page covered; obsolete checkout CSS removed. |
| `packages/storefront-kit/commerce-src/cart/render.js` | Review rows/button in shell form; templates skipped in review. |
| `packages/storefront-kit/commerce-src/shared/click-actions.js` | Demo finish → confirmation screen; close from it. |
| `packages/storefront-kit/commerce-src/look/contrast-guard.js` | Skip the shell. |
| `apps/api/src/storefront-source/source-store-config.ts` | `bannerUrl` (absolute) in config data. |
| `packages/shared-types/src/checkout-branding.ts` | `photoUrl` on `CheckoutBranding`. |
| `apps/api/src/payment-intents/payment-intents.service.ts` | `checkoutBranding` adds `photoUrl` from `bannerUrl`. |
| `apps/api/src/stores/store-checkout.service.ts` | Cart line snapshot gains `imageUrl`. |
| `apps/checkout/src/checkout/shell.ts` (new) | Hosted shell pieces: frame, summary, method rows, accent, toggle. |
| `apps/checkout/src/checkout/payment-form.ts` | Payment form in the shell. |
| `apps/checkout/src/checkout/payment-result.ts` | Success page in the shell. |
| `apps/checkout/src/checkout-branding.ts` | Stops applying store background/fonts/DNA. |

---

### Task 0: Pre-flight

**Files:** none changed.

- [ ] **Step 1: Check the uncommitted work already in the tree**

Run: `git -C /Users/saramia/pagosYa status --short`
Expected: the Esencial bands/motion edits (`commerce-src/catalog/cards.js`, `commerce-src/content/load.js`, `kit/commerce.js`, `store-templates/templates/esencial/*`, `apps/api/src/storefront-source/source-templates-qa.tool.spec.ts`). `kit/commerce.js` is rebuilt from all parts, so every commit in this plan would carry those edits. **Ask the owner** to let you commit them first as their own commit («feat(esencial): colour bands, bigger type, motion») or to say they should stay out; do not continue until answered.

- [ ] **Step 2: Green baseline**

Run:
```bash
cd /Users/saramia/pagosYa
node packages/storefront-kit/tools/build-commerce.mjs --check
pnpm --filter @pagosya/storefront-kit test
pnpm --filter @pagosya/checkout test
```
Expected: all pass. Record any failing test names; they are not ours and must not be "fixed" by this plan.

---

### Task 1: Shared shell assets

**Files:**
- Create: `packages/storefront-kit/checkout-shell/shell.css`
- Create: `packages/storefront-kit/checkout-shell/logos.json`
- Modify: `packages/storefront-kit/package.json` (exports)
- Test: `apps/checkout/test/checkout-shell-assets.test.ts`

**Interfaces:**
- Produces: `logos.json` = `{ logos: Record<'visa'|'mastercard'|'amex'|'qr'|'tigo'|'bank', string>, methods: { type: 'CARD'|'QR'|'TIGO_MONEY'|'BANK_TRANSFER', label: string, logos: string[], note: string }[] }`. Class contract used by every later task: `.pya-checkout`, `.pya-checkout--page`, `.pya-co__bar`, `.pya-co__back`, `.pya-co__brand`, `.pya-co__logo`, `.pya-co__name`, `.pya-co__secure`, `.pya-co__summary-toggle`, `.pya-co__frame`, `.pya-co__lead`, `.pya-co__steps`, `.pya-co__note`, `.pya-co__status`, `.pya-co__main`, `.pya-co__section`, `.pya-co__title`, `.pya-co__hint`, `.pya-co__field` (also `.order-field`, `.field`), `.pya-co__row`, `.pya-co__choices`, `.pya-co__choice`, `.pya-co__mirrored`, `.pya-co__methods`, `.pya-co__method`, `.pya-co__method-name`, `.pya-co__method-body`, `.pya-co__logos`, `.pya-co__logo-badge`, `.pya-co__pay`, `.pya-co__pay-total`, `.pya-co__trust`, `.pya-co__secondary`, `.pya-co__summary`, `.pya-co__summary-inner`, `.pya-co__photo`, `.pya-co__lines`, `.pya-co__line`, `.pya-co__thumb`, `.pya-co__qty`, `.pya-co__line-text`, `.pya-co__line-price`, `.pya-co__stepper`, `.pya-co__code`, `.pya-co__totals`, `.pya-co__grand`, `.pya-co__done`, `.pya-co__check`, `.pya-co__next`, `.pya-co__delivery-row`. Root attribute `data-summary-open` opens the phone summary.

- [ ] **Step 1: Write the failing test**

```ts
// apps/checkout/test/checkout-shell-assets.test.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { DOMESTIC_METHOD_TYPES } from "../src/checkout/payment-form";

const require = createRequire(import.meta.url);
const logos = require("@pagosya/storefront-kit/checkout-shell/logos.json");
const css = readFileSync(require.resolve("@pagosya/storefront-kit/checkout-shell/shell.css"), "utf8");
const body = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{[^{}]*\{[^{}]*\}[^{}]*\{[^{}]*\}\s*\}/g, "").replace(/@media[^{]+\{/g, "");
const selectors = body.match(/[^{}]+(?=\{)/g)!.map(s => s.trim()).filter(Boolean);

describe("checkout shell assets", () => {
  it("lists exactly the domestic methods the payment page offers", () => {
    expect(logos.methods.map((m: { type: string }) => m.type).sort()).toEqual([...DOMESTIC_METHOD_TYPES].sort());
    expect(logos.methods.map((m: { label: string }) => m.label)).toEqual(["Tarjeta", "QR", "Tigo Money", "Transferencia"]);
  });
  it("has an accessible SVG for every logo a method names", () => {
    for (const method of logos.methods) for (const name of method.logos) {
      expect(logos.logos[name], name).toMatch(/^<svg [^>]*role="img"[^>]*aria-label="[^"]+"/);
    }
  });
  it("scopes every rule under .pya-checkout and keeps the fixed palette", () => {
    for (const selector of selectors) for (const part of selector.split(",")) expect(part.trim(), selector).toMatch(/^\.pya-checkout/);
    for (const colour of ["#f7f7f7", "#ececec", "#1a1a1a", "#6b6b6b", "#d9d9d9"]) expect(css).toContain(colour);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa && pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-assets.test.ts`
Expected: FAIL — `Cannot find module '@pagosya/storefront-kit/checkout-shell/logos.json'`.

- [ ] **Step 3: Add the export**

In `packages/storefront-kit/package.json`, `exports` becomes:
```json
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "default": "./index.js"
    },
    "./kit/*": "./kit/*",
    "./checkout-shell/*": "./checkout-shell/*"
  },
```

- [ ] **Step 4: Write `logos.json`**

```json
{
  "logos": {
    "visa": "<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Visa\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><text x=\"19\" y=\"16.2\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"11\" font-weight=\"700\" font-style=\"italic\" letter-spacing=\".4\" fill=\"#1434CB\">VISA</text></svg>",
    "mastercard": "<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Mastercard\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><circle cx=\"15\" cy=\"12\" r=\"7\" fill=\"#EB001B\"/><circle cx=\"23\" cy=\"12\" r=\"7\" fill=\"#F79E1B\"/><path d=\"M19 6.1a7 7 0 0 1 0 11.8 7 7 0 0 1 0-11.8z\" fill=\"#FF5F00\"/></svg>",
    "amex": "<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"American Express\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#2E77BC\"/><text x=\"19\" y=\"15.3\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"8.5\" font-weight=\"700\" letter-spacing=\".4\" fill=\"#fff\">AMEX</text></svg>",
    "qr": "<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"QR\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><g fill=\"none\" stroke=\"#1a1a1a\" stroke-width=\"1.4\"><rect x=\"11.7\" y=\"4.7\" width=\"5\" height=\"5\"/><rect x=\"21.3\" y=\"4.7\" width=\"5\" height=\"5\"/><rect x=\"11.7\" y=\"14.3\" width=\"5\" height=\"5\"/></g><g fill=\"#1a1a1a\"><rect x=\"13.5\" y=\"6.5\" width=\"1.4\" height=\"1.4\"/><rect x=\"23.1\" y=\"6.5\" width=\"1.4\" height=\"1.4\"/><rect x=\"13.5\" y=\"16.1\" width=\"1.4\" height=\"1.4\"/><rect x=\"21\" y=\"14\" width=\"2\" height=\"2\"/><rect x=\"24.5\" y=\"16.4\" width=\"2\" height=\"2\"/><rect x=\"21\" y=\"18\" width=\"2\" height=\"1.6\"/></g></svg>",
    "tigo": "<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Tigo Money\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#00377B\"/><text x=\"19\" y=\"12.6\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"9\" font-weight=\"700\" fill=\"#fff\">tigo</text><text x=\"19\" y=\"19.2\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"5\" font-weight=\"700\" letter-spacing=\".6\" fill=\"#FFD100\">MONEY</text></svg>",
    "bank": "<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Transferencia bancaria\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><g fill=\"none\" stroke=\"#1a1a1a\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"><path d=\"M12 10l7-4 7 4z\"/><path d=\"M13.6 11v5.6M17.2 11v5.6M20.8 11v5.6M24.4 11v5.6\"/><path d=\"M12 18.4h14\"/></g></svg>"
  },
  "methods": [
    { "type": "CARD", "label": "Tarjeta", "logos": ["visa", "mastercard", "amex"], "note": "Paga con Visa, Mastercard o American Express." },
    { "type": "QR", "label": "QR", "logos": ["qr"], "note": "Escanea el código con la app de tu banco." },
    { "type": "TIGO_MONEY", "label": "Tigo Money", "logos": ["tigo"], "note": "Confirmas el pago desde tu billetera Tigo Money." },
    { "type": "BANK_TRANSFER", "label": "Transferencia", "logos": ["bank"], "note": "Transfiere desde tu banco; el comercio confirma al recibirla." }
  ]
}
```

- [ ] **Step 5: Write `shell.css`**

```css
/* One calm checkout (docs/superpowers/specs/2026-10-20-calm-checkout-design.md). The same shell in every store and on
   the hosted payment page. Unlayered and two classes deep, so a store's element and class rules never reach it. */
.pya-checkout{--pya-ink:#1a1a1a;--pya-muted:#6b6b6b;--pya-line:#d9d9d9;--pya-soft:#f7f7f7;--pya-divider:#ececec;--pya-accent:#1a1a1a;--pya-accent-ink:#ffffff;--pya-gutter:clamp(20px,4vw,56px);position:fixed;inset:0;z-index:2147483000;display:block;margin:0;padding:0;overflow:auto;overscroll-behavior:contain;background:#fff;color:var(--pya-ink);color-scheme:light;font:400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;letter-spacing:normal;text-align:left;text-transform:none;-webkit-font-smoothing:antialiased}
.pya-checkout[hidden]{display:none}
.pya-checkout.pya-checkout--page{position:static;inset:auto;z-index:auto;min-height:100dvh;overflow:visible}
.pya-checkout.pya-checkout :is(*,*::before,*::after){box-sizing:border-box}
.pya-checkout.pya-checkout :is(h1,h2,h3,p,ul,ol,li,dl,dt,dd,fieldset,legend,figure,small,strong,output){margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;letter-spacing:normal;text-transform:none;text-shadow:none;box-shadow:none;transform:none}
.pya-checkout.pya-checkout strong{font-weight:600}
.pya-checkout.pya-checkout :is(ul,ol){list-style:none}
.pya-checkout.pya-checkout :is(button,input,select,textarea){margin:0;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;text-shadow:none;box-shadow:none;transform:none;filter:none;-webkit-text-fill-color:currentColor}
.pya-checkout.pya-checkout a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.pya-checkout.pya-checkout img{display:block;max-width:100%;border:0;border-radius:0;filter:none}
.pya-checkout.pya-checkout :focus-visible{outline:2px solid var(--pya-ink);outline-offset:2px}
.pya-checkout.pya-checkout [hidden]{display:none!important}
.pya-checkout .pya-co__bar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;padding:10px var(--pya-gutter);border-bottom:1px solid var(--pya-divider);background:#fff}
.pya-checkout .pya-co__brand{display:flex;align-items:center;gap:10px;min-width:0;font-size:17px;font-weight:600}
.pya-checkout .pya-co__logo{width:auto;height:32px;max-width:120px;object-fit:contain}
.pya-checkout .pya-co__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pya-checkout .pya-co__back{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0;border:0;background:none;color:var(--pya-muted);font-size:14px;text-decoration:none;cursor:pointer}
.pya-checkout .pya-co__back:hover{color:var(--pya-ink)}
.pya-checkout .pya-co__secure{display:inline-flex;align-items:center;gap:6px;color:var(--pya-muted);font-size:13px;white-space:nowrap}
.pya-checkout .pya-co__summary-toggle{display:none}
.pya-checkout .pya-co__frame{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);grid-template-rows:auto 1fr;min-height:calc(100dvh - 65px)}
.pya-checkout [data-pagosya-cart][data-checkout-review]{display:contents!important}
.pya-checkout .pya-co__lead,.pya-checkout .pya-co__main{grid-column:1;justify-self:end;width:min(100% - 2 * var(--pya-gutter),580px);margin-right:var(--pya-gutter)}
.pya-checkout .pya-co__lead{grid-row:1;padding-top:32px}
.pya-checkout .pya-co__main{grid-row:2;display:grid;align-content:start;gap:0;padding:4px 0 56px}
.pya-checkout .pya-co__steps{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;font-size:13px;color:var(--pya-muted)}
.pya-checkout .pya-co__steps li{display:inline-flex;align-items:center;gap:6px}
.pya-checkout .pya-co__steps li+li::before{content:"›";color:var(--pya-line)}
.pya-checkout .pya-co__steps [aria-current=step]{color:var(--pya-ink);font-weight:600}
.pya-checkout .pya-co__steps button{min-height:32px;padding:0;border:0;background:none;color:var(--pya-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.pya-checkout .pya-co__lead h1{font-size:26px;line-height:1.2;font-weight:600}
.pya-checkout .pya-co__note{margin-top:4px;color:var(--pya-muted);font-size:13px}
.pya-checkout .pya-co__status{margin-top:14px;padding:12px 14px;border-radius:6px;background:var(--pya-soft);font-size:14px}
.pya-checkout .pya-co__status:empty{display:none}
.pya-checkout .pya-co__section{display:grid;gap:12px;padding:26px 0 0}
.pya-checkout .pya-co__title{font-size:17px;font-weight:600;line-height:1.3}
.pya-checkout .pya-co__hint{color:var(--pya-muted);font-size:13px}
.pya-checkout .pya-co__row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pya-checkout :is(.pya-co__field,.order-field,.field){position:relative;display:grid;gap:2px;padding:8px 14px 9px;border:1px solid var(--pya-line);border-radius:6px;background:#fff;color:var(--pya-muted);font-size:12px;line-height:1.3;cursor:text}
.pya-checkout :is(.pya-co__field,.order-field,.field):focus-within{border-color:var(--pya-ink);box-shadow:0 0 0 1px var(--pya-ink)}
.pya-checkout :is(.pya-co__field,.order-field,.field) :is(input,select,textarea){display:block;width:100%;min-height:26px;padding:0;border:0;border-radius:0;background:transparent;color:var(--pya-ink);font-size:16px;line-height:1.4;outline:none;appearance:none}
.pya-checkout :is(.pya-co__field,.order-field,.field) select{padding-right:28px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b6b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 0 center}
.pya-checkout :is(.pya-co__field,.order-field,.field) textarea{min-height:56px;resize:vertical}
.pya-checkout :is(.pya-co__field,.order-field,.field):has([aria-invalid=true]){border-color:#c0392b}
.pya-checkout .field>label{color:var(--pya-muted);font-size:12px}
.pya-checkout :is(.field-error,.field-hint,.hint){color:var(--pya-muted);font-size:12px}
.pya-checkout .field-error{color:#c0392b}
.pya-checkout .field-error:empty{display:none}
.pya-checkout :is(fieldset[data-shipping],fieldset[data-delivery-address],fieldset[data-shipping-destination]){display:grid;gap:12px}
.pya-checkout :is(fieldset[data-shipping],fieldset[data-delivery-address],fieldset[data-shipping-destination])>legend{margin-bottom:12px;font-size:15px;font-weight:600}
.pya-checkout .pya-co__mirrored{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important}
.pya-checkout .pya-co__choices,.pya-checkout .pya-co__methods{display:grid;border:1px solid var(--pya-line);border-radius:6px;overflow:hidden;background:#fff}
.pya-checkout :is(.pya-co__choice,.pya-co__method)+:is(.pya-co__choice,.pya-co__method){border-top:1px solid var(--pya-line)}
.pya-checkout .pya-co__choice,.pya-checkout .pya-co__method>label{display:flex;align-items:center;gap:12px;min-height:56px;padding:12px 16px;cursor:pointer}
.pya-checkout .pya-co__methods--preview .pya-co__method{display:flex;align-items:center;gap:12px;min-height:52px;padding:10px 16px}
.pya-checkout :is(.pya-co__choice,.pya-co__method) input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pya-accent)}
.pya-checkout .pya-co__choice:has(input:checked),.pya-checkout .pya-co__method:has(input:checked)>label{background:color-mix(in srgb,var(--pya-accent) 6%,#fff);box-shadow:inset 0 0 0 1px var(--pya-accent)}
.pya-checkout .pya-co__method-name{flex:1;min-width:0;font-size:15px}
.pya-checkout .pya-co__method-body{display:grid;gap:10px;padding:16px;border-top:1px solid var(--pya-line);background:var(--pya-soft);font-size:14px;color:var(--pya-muted)}
@media (prefers-reduced-motion:no-preference){.pya-checkout .pya-co__method-body{animation:pya-co-open .2s cubic-bezier(.23,1,.32,1)}}
@keyframes pya-co-open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.pya-checkout .pya-co__logos{display:inline-flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
.pya-checkout .pya-co__logo-badge{display:inline-flex;flex:none;width:38px;height:24px;border:1px solid var(--pya-line);border-radius:4px;overflow:hidden;background:#fff}
.pya-checkout .pya-co__logo-badge svg{display:block;width:100%;height:100%}
.pya-checkout .pya-co__pay{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:56px;margin-top:24px;padding:14px 20px;border:0;border-radius:6px;background:var(--pya-accent);color:var(--pya-accent-ink);font-size:17px;font-weight:600;cursor:pointer;transition:filter .15s ease}
.pya-checkout .pya-co__pay:hover:not(:disabled){filter:brightness(.92)}
.pya-checkout .pya-co__pay:disabled{background:#a6a6a6;color:#fff;cursor:default}
.pya-checkout .pya-co__pay-total{font-weight:400;opacity:.9}
.pya-checkout .pya-co__secondary{width:100%;min-height:48px;margin-top:10px;padding:10px 16px;border:1px solid var(--pya-line);border-radius:6px;background:#fff;cursor:pointer}
.pya-checkout .pya-co__trust{display:grid;justify-items:center;gap:8px;margin-top:16px;color:var(--pya-muted);font-size:12px;text-align:center}
.pya-checkout .pya-co__trust>span:last-child{display:inline-flex;align-items:center;gap:6px}
.pya-checkout .pya-co__summary{grid-column:2;grid-row:1 / -1;align-self:stretch;padding:32px var(--pya-gutter) 56px;background:var(--pya-soft);border-left:1px solid var(--pya-divider)}
.pya-checkout .pya-co__summary-inner{position:sticky;top:24px;display:grid;gap:18px;width:min(100%,440px)}
.pya-checkout .pya-co__photo{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;background:#ececec}
.pya-checkout .pya-co__count{color:var(--pya-muted);font-weight:400}
.pya-checkout .pya-co__lines{display:grid;gap:16px}
.pya-checkout .pya-co__line{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start}
.pya-checkout .pya-co__line:not(:has(.pya-co__thumb)){grid-template-columns:minmax(0,1fr) auto}
.pya-checkout .pya-co__thumb{position:relative;width:64px;height:64px;border:1px solid var(--pya-divider);border-radius:8px;background:#fff}
.pya-checkout .pya-co__thumb img{width:100%;height:100%;object-fit:cover;border-radius:7px}
.pya-checkout .pya-co__qty{position:absolute;top:-8px;right:-8px;display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#6b6b6b;color:#fff;font-size:12px;font-weight:600}
.pya-checkout .pya-co__line-text{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}
.pya-checkout .pya-co__line-text small{color:var(--pya-muted);font-size:13px}
.pya-checkout .pya-co__line-price{white-space:nowrap;font-variant-numeric:tabular-nums}
.pya-checkout .pya-co__stepper{display:inline-flex;align-items:center;gap:4px;margin-top:6px}
.pya-checkout .pya-co__stepper button{width:32px;min-height:32px;padding:0;border:1px solid var(--pya-line);border-radius:6px;background:#fff;cursor:pointer}
.pya-checkout .pya-co__stepper button:disabled{opacity:.4;cursor:default}
.pya-checkout .pya-co__stepper output{min-width:24px;text-align:center}
.pya-checkout .pya-co__code{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch}
.pya-checkout .pya-co__code>button{min-height:48px;padding:0 16px;border:1px solid var(--pya-line);border-radius:6px;background:#ececec;color:var(--pya-ink);cursor:pointer}
.pya-checkout .pya-co__code>p{grid-column:1 / -1;color:var(--pya-muted);font-size:13px}
.pya-checkout .pya-co__code>p:empty{display:none}
.pya-checkout .pya-co__totals{display:grid;gap:10px;padding-top:4px}
.pya-checkout .pya-co__totals :is(.order-savings,.order-total,dl>div){display:flex;justify-content:space-between;gap:16px}
.pya-checkout .pya-co__totals .order-total{align-items:baseline;padding-top:12px;border-top:1px solid var(--pya-divider);font-size:17px;font-weight:600}
.pya-checkout .pya-co__totals .order-total strong{font-size:24px;font-variant-numeric:tabular-nums;white-space:nowrap}
.pya-checkout .pya-co__totals :is(.order-note,[data-bundle-quote-status],.pagosya-secure-note){color:var(--pya-muted);font-size:13px}
.pya-checkout .pya-co__totals [data-bundle-quote-status]:empty{display:none}
.pya-checkout .pya-co__delivery-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 16px;border:1px solid var(--pya-line);border-radius:6px;font-size:14px}
.pya-checkout .pya-co__delivery-row button{min-height:40px;padding:0;border:0;background:none;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.pya-checkout .pya-co__done{display:grid;gap:16px;padding-top:12px}
.pya-checkout .pya-co__check{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--pya-accent);color:var(--pya-accent-ink)}
.pya-checkout .pya-co__next{display:grid;gap:8px;padding-left:20px;list-style:decimal}
.pya-checkout :is(.commerce-consent,.reminder-consent){display:flex;gap:10px;align-items:flex-start;font-size:14px}
@media (max-width:760px){
  .pya-checkout .pya-co__bar{padding:8px 16px}
  .pya-checkout .pya-co__secure{font-size:0}
  .pya-checkout .pya-co__summary-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:52px;padding:12px 16px;border:0;border-bottom:1px solid var(--pya-divider);background:var(--pya-soft);color:var(--pya-ink);cursor:pointer}
  .pya-checkout .pya-co__frame{grid-template-columns:minmax(0,1fr);grid-template-rows:none}
  .pya-checkout .pya-co__summary{grid-column:1;grid-row:auto;order:-1;display:none;padding:20px 16px;border-left:0;border-bottom:1px solid var(--pya-divider)}
  .pya-checkout[data-summary-open] .pya-co__summary{display:block}
  .pya-checkout .pya-co__summary-inner{position:static;width:100%}
  .pya-checkout .pya-co__lead,.pya-checkout .pya-co__main{grid-column:1;grid-row:auto;justify-self:stretch;width:auto;margin:0 16px}
  .pya-checkout .pya-co__lead{padding-top:20px}
  .pya-checkout .pya-co__row{grid-template-columns:1fr}
}
@media (max-width:760px) and (prefers-reduced-motion:no-preference){.pya-checkout[data-summary-open] .pya-co__summary{animation:pya-co-open .2s cubic-bezier(.23,1,.32,1)}}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-assets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/storefront-kit/checkout-shell packages/storefront-kit/package.json apps/checkout/test/checkout-shell-assets.test.ts
git commit -m "feat(checkout): one calm checkout — shared shell stylesheet, payment logos and method list"
```

---

### Task 2: Generated kit part for the shell assets

**Files:**
- Modify: `packages/storefront-kit/tools/build-commerce.mjs`
- Create: `packages/storefront-kit/commerce-src/checkout/shell.js` (placeholder line, filled in Task 3)
- Test: `packages/storefront-kit/tools/build-commerce.test.mjs`

**Interfaces:**
- Produces (inside the commerce IIFE, before `checkout/overlay.js`): `const CHECKOUT_SHELL_CSS` (string), `const PAYMENT_LOGOS` (the parsed `logos.json`).

- [ ] **Step 1: Write the failing test** (append to `build-commerce.test.mjs`, which already imports `node:test` and `assert`)

```js
test('the checkout shell assets reach the runtime as a generated part before the overlay', async () => {
  const { buildCommerce, PARTS, GENERATED } = await import('./build-commerce.mjs');
  assert.ok(GENERATED['checkout/shell-assets.js'], 'generated part is declared');
  assert.ok(PARTS.indexOf('checkout/shell-assets.js') < PARTS.indexOf('checkout/shell.js'));
  assert.ok(PARTS.indexOf('checkout/shell.js') < PARTS.indexOf('checkout/overlay.js'));
  const built = buildCommerce();
  assert.match(built, /\n  const CHECKOUT_SHELL_CSS = ".*pya-checkout/);
  assert.match(built, /\n  const PAYMENT_LOGOS = \{"logos":/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs`
Expected: FAIL — `GENERATED` is undefined.

- [ ] **Step 3: Implement**

In `build-commerce.mjs`:
- Insert `'checkout/shell-assets.js',` and `'checkout/shell.js',` into `PARTS` directly before `'checkout/overlay.js'`.
- Add after `PARTS`:
```js
/** Parts written from data files rather than by hand: the one calm checkout's stylesheet and logos, which
 *  apps/checkout imports directly, so both surfaces read the same bytes. */
export const GENERATED = {
  'checkout/shell-assets.js': () => {
    const css = readFileSync(join(root, 'checkout-shell', 'shell.css'), 'utf8');
    const logos = JSON.parse(readFileSync(join(root, 'checkout-shell', 'logos.json'), 'utf8'));
    return `  // Generated by tools/build-commerce.mjs from checkout-shell/shell.css and checkout-shell/logos.json.\n  const CHECKOUT_SHELL_CSS = ${JSON.stringify(css)};\n  const PAYMENT_LOGOS = ${JSON.stringify(logos)};\n`;
  },
};
```
- In `buildCommerce()`: compute `missing` as `PARTS.filter(part => !files.includes(part) && !GENERATED[part])`, and at the top of the `PARTS.map(part => { … })` callback add `if (GENERATED[part]) return GENERATED[part]();`.

- [ ] **Step 4: Create `commerce-src/checkout/shell.js`** with one line (ends with a newline):
```js
  // One calm checkout (spec 2026-10-20): shell pieces shared by the order review, the test payment and its confirmation.
```

- [ ] **Step 5: Run tests and rebuild**

Run:
```bash
node --test packages/storefront-kit/tools/build-commerce.test.mjs
node packages/storefront-kit/tools/build-commerce.mjs
node packages/storefront-kit/kit/check-runtimes.mjs
```
Expected: PASS; «Wrote kit/commerce.js from 39 commerce-src parts.»; runtimes parse.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/tools packages/storefront-kit/commerce-src/checkout/shell.js packages/storefront-kit/kit/commerce.js
git commit -m "feat(kit): the checkout shell's stylesheet and logos reach commerce.js as a generated part"
```

---

### Task 3: Kit shell frame — top bar, steps, full-page cover, templates off

**Files:**
- Modify: `packages/storefront-kit/commerce-src/checkout/shell.js`
- Modify: `packages/storefront-kit/commerce-src/checkout/overlay.js` (`showCheckout`, `closeCheckout`, hashchange handler, the two style blocks)
- Modify: `packages/storefront-kit/commerce-src/checkout/submit.js:19`, `packages/storefront-kit/commerce-src/catalog/render.js:153`
- Modify: `packages/storefront-kit/commerce-src/look/contrast-guard.js:66`
- Test: `apps/checkout/test/checkout-shell-review.test.ts` (new)

**Interfaces:**
- Consumes: `CHECKOUT_SHELL_CSS`, `PAYMENT_LOGOS` (Task 2); kit scope `store`, `config`, `escape`, `safeUrl`, `money`, `preview`, `fullCheckoutPage`, `CART_WORD`, `checkoutAnswers`, `renderCart`.
- Produces (kit scope): `storeAssetUrl(value): string`, `shellBrand(): string`, `shellSteps(current: 'review'|'payment'|'done'): string`, `logoBadges(names: string[]): string`, `paymentMethodsList(selectable: boolean, selected?: string): string`, `trustStrip(): string`, `shellAccent(root: HTMLElement): void`, `inertAround(node: Element, saved: Map): void`, `LOCK_ICON`, `CHECK_ICON`, `BACK_ICON`. `showCheckout(mode: 'review'|'payment'|'done')` replaces `showCheckout(payment: boolean)`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/checkout/test/checkout-shell-review.test.ts
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

const commerce = readFileSync(kitPath("commerce.js"), "utf8");
const windows: JSDOM[] = [];
const product = (over: Record<string, unknown> = {}) => ({ id: "honey", name: "Irupana Honey", amount: 14400, currency: "BOB", stock: 9, imageUrls: ["https://cdn.test/honey.jpg"], variants: [], extras: [], ...over });
const baseStore = (over: Record<string, unknown> = {}) => ({ storeName: "Tostadero Yungas", logoUrl: "/v1/uploads/logo.png", bannerUrl: "/v1/uploads/banner.jpg", checkoutMode: "payment", locations: [], categories: [], items: [product()], ...over });

function runtime(store = baseStore(), body = '<header><a href="index.html">Inicio</a></header><main><section data-pagosya-catalog></section></main>') {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body>${body}</body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/" });
  windows.push(dom);
  const w = dom.window as any;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [{ id: "honey", quantity: 1 }];
  w.PAGOSYA_CONFIG = { slug: "tostadero", data: store, apiBaseUrl: "https://api.test/v1" };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.eval(commerce);
  return w;
}
function openReview(w: any) { w.location.hash = "checkout"; w.dispatchEvent(new w.HashChangeEvent("hashchange")); return w.document.querySelector(".pya-checkout"); }
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

describe("kit order review — shell frame", () => {
  it("draws the shell with the store's logo and name, the steps and the review heading", () => {
    const root = openReview(runtime());
    expect(root).toBeTruthy();
    expect(root.querySelector(".pya-co__bar .pya-co__name").textContent).toBe("Tostadero Yungas");
    expect(root.querySelector(".pya-co__bar .pya-co__logo").getAttribute("src")).toBe("https://api.test/v1/uploads/logo.png");
    expect([...root.querySelectorAll(".pya-co__steps li")].map((li: any) => li.textContent)).toEqual(["Carrito", "Entrega", "Pago"]);
    expect(root.querySelector('.pya-co__steps [aria-current="step"]').textContent).toBe("Entrega");
    expect(root.querySelector(".pya-co__lead h1").textContent).toBe("Revisa tu pedido");
    expect(root.querySelector(".pya-co__lead [data-pagosya-status]")).toBeTruthy();
  });
  it("leaves out the logo image when the store has none", () => {
    expect(openReview(runtime(baseStore({ logoUrl: null }))).querySelector(".pya-co__bar img")).toBeNull();
  });
  it("ignores a store's checkout and review templates", () => {
    const templates = '<template data-pagosya-checkout-template><div class="caja"><div data-checkout-slot="heading"></div><div data-checkout-slot="review"></div></div></template><template data-pagosya-review-template><div class="revision"><div data-review-slot="summary"></div><section data-review-slot="fields"></section></div></template>';
    const root = openReview(runtime(baseStore(), `<main><section data-pagosya-catalog></section></main>${templates}`));
    expect(root.querySelector(".caja, .revision, [data-review-root]")).toBeNull();
    expect(root.querySelector(".pya-co__lead h1").textContent).toBe("Revisa tu pedido");
  });
  it("covers an authored checkout page and takes its surroundings out of the tab order", () => {
    const w = runtime(baseStore(), '<header><a href="index.html" id="authored">Tostadero</a></header><main><aside id="aside"><img src="x.jpg"><h2>Tu pedido en Tostadero Yungas</h2></aside><section data-pagosya-checkout-page></section></main>');
    const root = w.document.querySelector("[data-pagosya-checkout-page]");
    expect(root.hidden).toBe(false);
    expect(root.classList.contains("pya-checkout")).toBe(true);
    expect(w.document.querySelector("header").inert).toBe(true);
    expect(w.document.querySelector("#aside").inert).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-review.test.ts`
Expected: FAIL — `.pya-checkout` not found.

- [ ] **Step 3: Fill `commerce-src/checkout/shell.js`**

```js
  // One calm checkout (spec 2026-10-20): shell pieces shared by the order review, the test payment and its confirmation.
  // The look is checkout-shell/shell.css, the same file the hosted payment page imports; stores only lend their logo,
  // name, photo and a readable accent.
  const shellStyle = document.createElement('style');
  shellStyle.setAttribute('data-pagosya-checkout-shell', '');
  shellStyle.textContent = CHECKOUT_SHELL_CSS;
  document.head.append(shellStyle);
  const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const CHECK_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const BACK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  // A store upload path ("/v1/uploads/…") lives on the API, not on the store's own origin.
  function storeAssetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { return safeUrl(/^\/v1\//.test(value.trim()) && config.apiBaseUrl ? new URL(value.trim(), config.apiBaseUrl).href : value); } catch { return ''; }
  }
  function shellBrand() {
    const logo = storeAssetUrl(store.logoUrl);
    return `<span class="pya-co__brand">${logo ? `<img class="pya-co__logo" src="${escape(logo)}" alt="">` : ''}<strong class="pya-co__name">${escape(store.storeName || '')}</strong></span>`;
  }
  // Carrito › Entrega › Pago: the step just before the current one goes back to it.
  function shellSteps(current) {
    const steps = ['Carrito', 'Entrega', 'Pago'];
    const at = current === 'done' ? steps.length : current === 'payment' ? 2 : 1;
    return `<ol class="pya-co__steps">${steps.map((label, index) => `<li${index === at ? ' aria-current="step"' : ''}>${index === at - 1 && current !== 'done' ? `<button type="button" data-checkout-back>${label}</button>` : label}</li>`).join('')}</ol>`;
  }
  function logoBadges(names) {
    return names.map(name => PAYMENT_LOGOS.logos[name] ? `<span class="pya-co__logo-badge">${PAYMENT_LOGOS.logos[name]}</span>` : '').join('');
  }
  // The review previews how the shopper will pay; the test payment lets them pick one (nothing is charged).
  function paymentMethodsList(selectable, selected = PAYMENT_LOGOS.methods[0].type) {
    if (!selectable) return `<ul class="pya-co__methods pya-co__methods--preview">${PAYMENT_LOGOS.methods.map(method => `<li class="pya-co__method"><span class="pya-co__method-name">${escape(method.label)}</span><span class="pya-co__logos">${logoBadges(method.logos)}</span></li>`).join('')}</ul>`;
    return `<div class="pya-co__methods" role="radiogroup" aria-label="Método de pago">${PAYMENT_LOGOS.methods.map(method => `<div class="pya-co__method"><label><input type="radio" name="demoPaymentMethod" value="${method.type}"${method.type === selected ? ' checked' : ''}><span class="pya-co__method-name">${escape(method.label)}</span><span class="pya-co__logos">${logoBadges(method.logos)}</span></label>${method.type === selected ? `<div class="pya-co__method-body"><p>${escape(method.note)}</p><p>Es una prueba: no se cobra nada.</p></div>` : ''}</div>`).join('')}</div>`;
  }
  function trustStrip() {
    const names = [...new Set(PAYMENT_LOGOS.methods.flatMap(method => method.logos))];
    return `<div class="pya-co__trust"><span class="pya-co__logos">${logoBadges(names)}</span><span>${LOCK_ICON} Pago seguro procesado por pagosYa</span></div>`;
  }
  const parseRgb = text => { const value = String(text), n = value.match(/[\d.]+/g); return /^rgba?\(/.test(value) && n && n.length >= 3 && (n[3] === undefined || Number(n[3]) === 1) ? n.slice(0, 3).map(Number) : null; };
  function contrastRatio(a, b) {
    const lum = c => { const [r, g, bl] = c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * bl; };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + .05) / (y + .05);
  }
  // The store's accent paints the pay button and the chosen radio only when it reads: its text at 4.5:1 and the button
  // at 3:1 on the white page. Otherwise ink. The browser resolves whatever colour syntax the store used.
  function shellAccent(root) {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--store-accent,var(--brand-accent,var(--accent,#1a1a1a)))';
    document.body.append(probe);
    const accent = parseRgb(getComputedStyle(probe).color);
    probe.style.color = 'var(--store-accent-foreground,var(--brand-accent-foreground,#ffffff))';
    const ink = parseRgb(getComputedStyle(probe).color);
    probe.remove();
    const readable = accent && ink && contrastRatio(accent, ink) >= 4.5 && contrastRatio(accent, [255, 255, 255]) >= 3;
    root.style.setProperty('--pya-accent', readable ? `rgb(${accent.join(',')})` : '#1a1a1a');
    root.style.setProperty('--pya-accent-ink', readable ? `rgb(${ink.join(',')})` : '#ffffff');
  }
  // Everything around the open checkout leaves the tab order: its own siblings and those of every ancestor.
  function inertAround(node, saved) {
    for (let child = node; child && child !== document.body && child.parentElement; child = child.parentElement) {
      for (const sibling of child.parentElement.children) if (sibling !== child && !saved.has(sibling) && !sibling.matches('script,style,template')) { saved.set(sibling, sibling.inert); sibling.inert = true; }
    }
  }
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-shell-summary]');
    if (!toggle) return;
    const root = toggle.closest('.pya-checkout');
    const open = !root.hasAttribute('data-summary-open');
    root.toggleAttribute('data-summary-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-shell-summary-label]').textContent = open ? 'Ocultar resumen del pedido' : 'Ver resumen del pedido';
  });
```

- [ ] **Step 4: Rewrite `showCheckout` / `closeCheckout` in `overlay.js`**

Replace the whole `function showCheckout(payment = false) { … }` with:
```js
  function showCheckout(mode = 'review') {
    // Opening the review also changes the hash; preserve fields on that second notification.
    if (!checkoutPage.hidden && checkoutPage.dataset.mode === mode) return;
    checkoutPage.dataset.mode = mode;
    if (checkoutPage.hidden) { checkoutOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; inertAround(checkoutPage, inertBeforeCheckout); }
    checkoutPage.hidden = false;
    checkoutPage.classList.add('pya-checkout');
    const back = fullCheckoutPage && mode === 'review' ? `<a class="pya-co__back" href="index.html">${BACK_ICON} Seguir comprando</a>` : `<button class="pya-co__back" type="button" ${mode === 'done' ? 'data-shell-close' : 'data-checkout-back'}>${BACK_ICON} ${mode === 'payment' ? 'Volver a la entrega' : 'Seguir comprando'}</button>`;
    const heading = mode === 'payment' ? 'Pago de prueba' : mode === 'done' ? '¡Gracias por tu compra!' : 'Revisa tu pedido';
    const note = mode === 'payment' ? 'Puedes completar el recorrido de prueba. No se realizará ningún cobro ni se creará un pedido real.' : preview || config.demo ? 'Vista previa · Sin cobros' : '';
    checkoutPage.innerHTML = `<header class="pya-co__bar">${back}${shellBrand()}<span class="pya-co__secure">${LOCK_ICON} Pago seguro</span></header><button type="button" class="pya-co__summary-toggle" aria-expanded="false" aria-controls="pya-co-summary" data-shell-summary><span data-shell-summary-label>Ver resumen del pedido</span><strong data-shell-total></strong></button><div class="pya-co__frame"><div class="pya-co__lead">${shellSteps(mode)}<h1 tabindex="-1">${heading}</h1>${note ? `<p class="pya-co__note order-note">${note}</p>` : ''}<p class="pya-co__status" data-pagosya-status role="status" aria-live="polite"></p></div><div data-pagosya-cart data-checkout-review="${mode}"></div></div>`;
    shellAccent(checkoutPage);
    renderCart();
    // Moving focus is for the overlay, which opens over the page. A full checkout page is simply loaded, and
    // scripted focus there paints a keyboard ring around the title for mouse and touch users.
    if (checkoutPage !== fullCheckoutPage || mode !== 'review') checkoutPage.querySelector("h1")?.focus({ preventScroll: true });
    checkoutPage.scrollTop = 0;
  }
```
In `closeCheckout()`: after `checkoutPage.hidden = true; checkoutPage.innerHTML = "";` add `checkoutPage.classList.remove('pya-checkout'); delete checkoutPage.dataset.mode;`.

Hashchange handler becomes:
```js
  window.addEventListener("hashchange", () => {
    if (location.hash === "#checkout") showCheckout();
    else if (location.hash === "#pago-de-prueba" && (preview || config.demo)) showCheckout('payment');
    else if (location.hash === "#pedido-de-prueba" && (preview || config.demo)) showCheckout('done');
    else if (fullCheckoutPage) showCheckout();
    else closeCheckout();
  });
```
`checkout/submit.js:19`: `showCheckout(true)` → `showCheckout('payment')`. `catalog/render.js:153`: read the line; it passes a boolean expression to `showCheckout(...)` — wrap it as `showCheckout(<that expression> ? 'payment' : 'review')`.

Delete the obsolete layered rules that drew the old review: in `shoppingStyle`'s second `textContent +=` block remove every rule **except** `[data-pagosya-checkout] [data-pagosya-cart][data-checkout-review]{…}`; in `checkoutStyle` keep only `[data-pagosya-checkout][hidden]{display:none!important}` and `[data-pagosya-redundant-review]{display:none!important}` (delete the `@layer pagosya-commerce { … }` body and the `:where([data-pagosya-checkout-page])` rule). The `[data-pagosya-checkout] [hidden]` behaviour is covered by the shell's `.pya-checkout.pya-checkout [hidden]`.

- [ ] **Step 5: Skip the shell in the contrast guard**

`look/contrast-guard.js:66`: `const targets = document.querySelectorAll(CONTRAST_GUARDED);` becomes
```js
    // The checkout shell picks its own readable accent (checkout/shell.js shellAccent); the guard leaves it alone.
    const targets = [...document.querySelectorAll(CONTRAST_GUARDED)].filter(el => !el.closest('.pya-checkout'));
```

- [ ] **Step 6: Rebuild and run**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && node packages/storefront-kit/kit/check-runtimes.mjs && pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-review.test.ts`
Expected: the four frame tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/storefront-kit/commerce-src packages/storefront-kit/kit/commerce.js apps/checkout/test/checkout-shell-review.test.ts
git commit -m "feat(kit): the order review opens in the calm checkout shell — store logo and name, steps, authored checkout pages covered, templates off"
```

---

### Task 4: Kit review content — summary with photo, delivery choices, payment preview

**Files:**
- Modify: `packages/storefront-kit/commerce-src/checkout/shell.js` (add `checkoutPhoto`, `shellLineMarkup`, `shapeShellReview`, `mirrorChoices`, `syncShellTotals`, demo-method listener)
- Modify: `packages/storefront-kit/commerce-src/cart/render.js`
- Modify: `packages/storefront-kit/commerce-src/shared/click-actions.js:90-97`
- Test: `apps/checkout/test/checkout-shell-review.test.ts`

**Interfaces:**
- Consumes: Task 3 helpers; render.js loop locals `id`, `p`, `variant`, `name`, `amount`, `quantity`, `image`, `option`, `line`, and `lineViews`.
- Produces: `checkoutPhoto(firstLineImage?: string): string`, `shellLineMarkup(view): string`, `shapeShellReview(el, { mode, count, photo }): void`, `mirrorChoices(el): void`, `syncShellTotals(el): void`.

- [ ] **Step 1: Write the failing tests** (append to `checkout-shell-review.test.ts`)

```ts
describe("kit order review — content", () => {
  it("puts the business photo, the lines with a quantity badge and the totals in the summary", () => {
    const summary = openReview(runtime()).querySelector(".pya-co__summary");
    expect(summary.querySelector(".pya-co__photo").getAttribute("src")).toBe("https://api.test/v1/uploads/banner.jpg");
    const line = summary.querySelector(".pya-co__line");
    expect(line.querySelector(".pya-co__qty").textContent).toBe("1");
    expect(line.querySelector(".pya-co__line-text strong").textContent).toBe("Irupana Honey");
    expect(line.querySelector("[data-add]")).toBeTruthy();
    expect(summary.querySelector(".order-total strong").textContent).toContain("144");
  });
  it("falls back to the first line photo, and shows no photo box without either", () => {
    expect(openReview(runtime(baseStore({ bannerUrl: null }))).querySelector(".pya-co__photo").getAttribute("src")).toBe("https://cdn.test/honey.jpg");
    const bare = openReview(runtime(baseStore({ bannerUrl: null, logoUrl: null, items: [product({ imageUrls: [] })] })));
    expect(bare.querySelector(".pya-co__photo")).toBeNull();
    expect(bare.querySelector(".pya-co__thumb")).toBeNull();
  });
  it("previews the payment methods with their logos and adds the total to the pay button", () => {
    const root = openReview(runtime());
    expect([...root.querySelectorAll(".pya-co__methods--preview .pya-co__method-name")].map((n: any) => n.textContent)).toEqual(["Tarjeta", "QR", "Tigo Money", "Transferencia"]);
    expect(root.querySelector('.pya-co__logos [aria-label="Visa"]')).toBeTruthy();
    const pay = root.querySelector(".pya-co__main [data-pay]");
    expect(pay.classList.contains("pya-co__pay")).toBe(true);
    expect(pay.querySelector(".pya-co__pay-total").getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector(".pya-co__main .pya-co__trust")).toBeTruthy();
  });
  it("hides the payment preview for WhatsApp stores", () => {
    expect(openReview(runtime(baseStore({ checkoutMode: "whatsapp" }))).querySelector(".pya-co__methods--preview")).toBeNull();
  });
  it("drives the hidden delivery select from the radio cards", () => {
    const root = openReview(runtime(baseStore({ shippingEnabled: true, shippingPickupEnabled: true })));
    const select = root.querySelector("select[name=method]");
    expect(select.closest(".pya-co__mirrored")).toBeTruthy();
    const radios = [...root.querySelectorAll('.pya-co__choices input[type=radio]')] as any[];
    expect(radios.map(r => r.value)).toEqual([...select.options].map((o: any) => o.value));
    radios.find(r => r.value === "delivery").click();
    expect(select.value).toBe("delivery");
    expect(root.querySelector("[data-shipping]").hidden).toBe(false);
  });
  it("mirrors the live total into the pay button and the phone summary bar", async () => {
    const root = openReview(runtime());
    root.querySelector(".order-total strong").textContent = "Bs 159,00";
    await new Promise(r => setTimeout(r, 0));
    expect(root.querySelector("[data-shell-total]").textContent).toBe("Bs 159,00");
    expect(root.querySelector(".pya-co__pay-total").textContent).toBe("· Bs 159,00");
  });
});
```
(Read `checkout/shipping.js` `updateShipping` before relying on the `[data-shipping]` hidden assertion: if the fieldset is shown for both methods, assert on the element `updateShipping` actually toggles for `delivery`.)

- [ ] **Step 2: Run to verify they fail**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-review.test.ts`
Expected: the new tests FAIL — `.pya-co__photo` / `.pya-co__line` not found.

- [ ] **Step 3: Add the review helpers to `checkout/shell.js`** (append)

```js
  function checkoutPhoto(firstLineImage) { return storeAssetUrl(store.bannerUrl) || firstLineImage || ''; }
  function shellLineMarkup({ id, p, name, amount, quantity, image, option, unit, stock, canAdd }) {
    return `<li class="pya-co__line" data-part="cart-line">${image ? `<span class="pya-co__thumb"><img src="${escape(image)}" alt="" loading="lazy"><b class="pya-co__qty" aria-label="Cantidad ${quantity}">${quantity}</b></span>` : ''}<span class="pya-co__line-text"><strong>${escape(p.name)}</strong>${option ? `<small>${escape(option)}</small>` : ''}${unit ? `<small>${escape(unit)}</small>` : ''}${stock ? `<small class="order-item__stock">${escape(stock)}</small>` : ''}<span class="pya-co__stepper"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}"${canAdd ? '' : ' disabled'}>+</button></span></span><span class="pya-co__line-price">${money(amount * quantity, p.currency)}</span></li>`;
  }
  // The review's controls keep their names and listeners; this only moves them into the shell's two columns.
  function shapeShellReview(el, { mode, count, photo }) {
    const take = selector => [...el.children].filter(child => child.matches(selector));
    const aside = document.createElement('aside');
    aside.className = 'pya-co__summary'; aside.id = 'pya-co-summary'; aside.setAttribute('aria-label', 'Resumen del pedido');
    const inner = document.createElement('div'); inner.className = 'pya-co__summary-inner';
    inner.innerHTML = `${photo ? `<img class="pya-co__photo" src="${escape(photo)}" alt="">` : ''}<h2 class="pya-co__title">${escape(CART_WORD || 'Tu pedido')}${count ? ` <span class="pya-co__count">· ${count} ${count === 1 ? 'producto' : 'productos'}</span>` : ''}</h2>`;
    inner.append(...take('.pya-co__lines,.order-recommendations'));
    const credit = el.querySelector('[name=creditCode]')?.closest('label');
    if (credit) { const code = document.createElement('div'); code.className = 'pya-co__code'; code.append(credit, ...[el.querySelector('[data-credit-apply]'), el.querySelector('[data-credit-status]')].filter(Boolean)); inner.append(code); }
    const totals = document.createElement('div'); totals.className = 'pya-co__totals';
    totals.append(...take('.pagosya-secure-note,.order-savings,.order-total,.order-note,[data-bundle-quote-status]'));
    inner.append(totals); aside.append(inner);
    const main = document.createElement('div'); main.className = 'pya-co__main';
    const delivery = take('label.order-field,fieldset[data-delivery-address],fieldset[data-shipping]');
    if (delivery.length) {
      const section = document.createElement('section'); section.className = 'pya-co__section'; section.setAttribute('aria-labelledby', 'pya-co-delivery');
      section.innerHTML = '<h2 class="pya-co__title" id="pya-co-delivery">Entrega</h2>';
      section.append(...delivery);
      main.append(section);
      if (mode !== 'review') {
        section.hidden = true;
        const chosen = checkoutAnswers.get('method') === 'delivery' ? 'Envío a domicilio' : checkoutAnswers.get('method') === 'pickup' ? 'Recoger en tienda' : '';
        if (chosen && mode === 'payment') main.insertAdjacentHTML('beforeend', `<section class="pya-co__section"><h2 class="pya-co__title">Entrega</h2><div class="pya-co__delivery-row"><span>${escape(chosen)}</span><button type="button" data-checkout-back>Cambiar</button></div></section>`);
      }
    }
    const paying = store.checkoutMode !== 'whatsapp' && store.checkoutMode !== 'external';
    if (mode === 'review' && paying) main.insertAdjacentHTML('beforeend', `<section class="pya-co__section" data-pya-pay-preview><h2 class="pya-co__title">Pago</h2><p class="pya-co__hint">Eliges cómo pagar en el siguiente paso.</p>${paymentMethodsList(false)}</section>`);
    if (mode === 'payment') main.insertAdjacentHTML('beforeend', `<section class="pya-co__section"><h2 class="pya-co__title">Pago</h2>${paymentMethodsList(true, checkoutAnswers.get('demoPaymentMethod') || undefined)}</section>`);
    if (mode === 'done') main.insertAdjacentHTML('beforeend', `<div class="pya-co__done"><span class="pya-co__check">${CHECK_ICON}</span><p><strong>Pedido de prueba</strong></p><ol class="pya-co__next"><li>El comercio confirma tu pago.</li><li>Prepara tu pedido.</li><li>Te avisa cuando sale o está listo para recoger.</li></ol></div>`);
    const button = take('.pya-co__pay')[0];
    main.append(...take('.commerce-consent'));
    if (button) { main.append(button); if (mode !== 'done' && paying) main.insertAdjacentHTML('beforeend', trustStrip()); }
    const feedback = document.createElement('p'); feedback.setAttribute('data-pagosya-checkout-status', ''); feedback.hidden = true;
    main.append(feedback, ...[...el.children].filter(child => child !== aside && child !== main));
    el.replaceChildren(main, aside);
    el.classList.add('checkout-review');
  }
  // Delivery reads as radio cards; the select stays the one source the shipping and submit code read.
  function mirrorChoices(el) {
    const select = el.querySelector('select[name=method]');
    const label = select?.closest('label');
    el.querySelector('.pya-co__choices')?.remove();
    if (!select || !label) return;
    label.classList.add('pya-co__mirrored'); label.setAttribute('aria-hidden', 'true'); select.tabIndex = -1;
    const group = document.createElement('div');
    group.className = 'pya-co__choices'; group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Entrega');
    group.innerHTML = [...select.options].map(option => `<label class="pya-co__choice"><input type="radio" name="pyaDeliveryChoice" value="${escape(option.value)}"${option.value === select.value ? ' checked' : ''}><span class="pya-co__method-name">${escape(option.textContent)}</span></label>`).join('');
    group.addEventListener('change', event => { select.value = event.target.value; select.dispatchEvent(new Event('change', { bubbles: true })); });
    label.after(group);
  }
  // Shipping and pack quotes rewrite .order-total; the pay button and the phone bar repeat whatever it says.
  function syncShellTotals(el) {
    const root = el.closest('.pya-checkout');
    const total = el.querySelector('.order-total strong');
    if (!root || !total) return;
    const copy = () => { const text = total.textContent.trim(); const bar = root.querySelector('[data-shell-total]'); if (bar) bar.textContent = text; const pay = el.querySelector('.pya-co__pay-total'); if (pay) pay.textContent = text ? `· ${text}` : ''; };
    el._shellTotals?.disconnect();
    if (typeof MutationObserver === 'function') { el._shellTotals = new MutationObserver(copy); el._shellTotals.observe(total, { childList: true, characterData: true, subtree: true }); }
    copy();
  }
  document.addEventListener('change', event => { if (event.target.name === 'demoPaymentMethod') { checkoutAnswers.set('demoPaymentMethod', event.target.value); renderCart(); } });
```

- [ ] **Step 4: Wire it into `cart/render.js`**

1. Next to `const rows = [];` declare `const shellRows = [];`. In the line loop, right after `lineViews.push({ … });`, add:
```js
      const view = lineViews[lineViews.length - 1];
      shellRows.push(shellLineMarkup({ id, p, name, amount, quantity, image, option, unit: view.unit, stock: view.stock, canAdd: !checkingOut && remaining(p, variant, line.picks) > 0 }));
```
2. In the `document.querySelectorAll("[data-pagosya-cart]").forEach` body, replace `const payment = el.dataset.checkoutReview === "payment";` and the `action`/`actionLabel` lines with:
```js
      const mode = review ? (['payment', 'done'].includes(el.dataset.checkoutReview) ? el.dataset.checkoutReview : 'review') : null;
      const payment = mode === 'payment', done = mode === 'done';
      const action = review ? done ? "data-shell-close" : payment ? "data-finish-demo" : "data-pay" : "data-checkout";
      const actionLabel = review ? done ? "Volver a la tienda" : payment ? "Completar prueba" : preview || config.demo ? "Continuar al pago de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : store.checkoutMode === "external" ? "Continuar al contacto" : "Pagar con pagosYa" : "Continuar con mi pedido";
```
3. In the big `el.innerHTML = \`…\`` template, replace the leading `<ul class="order-items">${rows.join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>` with
```js
<ul class="${review ? 'pya-co__lines order-items' : 'order-items'}">${(review ? shellRows : rows).join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>
```
and the trailing `<button class="checkout-button" ${action} type="button" ${…}>${actionLabel}<svg …><path d="M6 18 18 6M6 6h12v12"/></svg></button>` with
```js
${review ? `<button class="pya-co__pay" ${action} type="button" ${!done && (!ready || !count || checkingOut || previewOptions) ? "disabled" : ""}>${actionLabel}${done ? '' : '<span class="pya-co__pay-total" aria-hidden="true"></span>'}</button>` : `<button class="checkout-button" ${action} type="button" ${!ready || !count || checkingOut || previewOptions ? "disabled" : ""}>${actionLabel}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`}
```
4. Drawer-only decorations: `if (lineTemplate) applyLineTemplate(el, lineViews, lineTemplate);` → `if (lineTemplate && !review) …`; `if (!count && PACK_MOTIFS.length) placeEmptyMotif(el);` → `if (!count && PACK_MOTIFS.length && !review) placeEmptyMotif(el);`.
5. Replace the whole `const reviewLayout = review ? reviewTemplate() : null; if (reviewLayout) { … } else if (review) { … }` block with:
```js
      if (review) shapeShellReview(el, { mode, count, photo: checkoutPhoto(lineViews.find(view => view.image)?.image) });
```
6. After `updateMethods(el, previousMethod);` add `if (review) mirrorChoices(el);`. Change the location listener to `select?.addEventListener("change", () => { updateMethods(el); if (review) mirrorChoices(el); updateShipping(el); });`. After `if (review && ready && count && store.bundlesEnabled) void bundleQuote(el);` add `if (review) syncShellTotals(el);`.
7. `shared/click-actions.js`: replace the `data-finish-demo` block (lines 91-97) with:
```js
    if (button.hasAttribute("data-finish-demo") && (preview || config.demo)) {
      showCheckout('done'); location.hash = "pedido-de-prueba";
      message("Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.");
      return;
    }
    if (button.hasAttribute("data-shell-close")) {
      if (fullCheckoutPage) { location.href = 'index.html'; return; }
      closeCheckout(); location.hash = checkoutPreviousHash;
      message("Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.");
      return;
    }
```
Read line 90 (`data-checkout-back`): it maps `#pago-de-prueba` back to `#checkout` and otherwise leaves the checkout. That is still right for `review` and `payment`; `done` uses `data-shell-close` (Task 3's top bar and the action button), so no change there.

- [ ] **Step 5: Rebuild and run**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && node packages/storefront-kit/kit/check-runtimes.mjs && pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-review.test.ts test/source-storefront-subscription.test.ts test/source-cart.test.ts test/shipping-destination-parity.test.ts`
Expected: all PASS. If a subscription/cart test reads `.checkout-review__summary` or `.checkout-review__fields`, change that selector to `.pya-co__summary` / `.pya-co__main` (same contents); no behaviour change.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/commerce-src packages/storefront-kit/kit/commerce.js apps/checkout/test
git commit -m "feat(kit): the review's summary shows the business photo, lines with a quantity badge and live totals; delivery as radio cards; payment methods with their logos"
```

---

### Task 5: Kit test payment and confirmation

**Files:**
- Test: `apps/checkout/test/checkout-shell-review.test.ts` (code landed in Tasks 3–4; this task pins the flow)

- [ ] **Step 1: Write the tests** (append)

```ts
describe("kit test payment and confirmation", () => {
  it("lets the shopper pick a method on the test payment", () => {
    const w = runtime();
    openReview(w);
    w.document.querySelector("[data-pay]").click();
    const root = w.document.querySelector(".pya-checkout");
    expect(root.querySelector(".pya-co__lead h1").textContent).toBe("Pago de prueba");
    root.querySelector('input[name=demoPaymentMethod][value="QR"]').click();
    expect(w.document.querySelector('input[name=demoPaymentMethod]:checked').value).toBe("QR");
    expect(w.document.querySelector(".pya-co__method-body").textContent).toContain("Escanea");
    expect(w.document.querySelector("[data-finish-demo]").textContent).toContain("Completar prueba");
  });
  it("finishes on a confirmation screen in the same shell, then returns to the store", () => {
    const w = runtime();
    openReview(w);
    w.document.querySelector("[data-pay]").click();
    w.document.querySelector("[data-finish-demo]").click();
    const root = w.document.querySelector(".pya-checkout");
    expect(root.querySelector(".pya-co__lead h1").textContent).toBe("¡Gracias por tu compra!");
    expect(root.querySelector("[data-pagosya-status]").textContent).toContain("Prueba completada");
    expect(root.querySelector(".pya-co__summary .pya-co__line")).toBeTruthy();
    root.querySelector(".pya-co__main [data-shell-close]").click();
    expect(w.document.querySelector(".pya-checkout")).toBeNull();
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @pagosya/checkout exec vitest run test/checkout-shell-review.test.ts`
Expected: PASS. If the last assertion fails, check Task 3 Step 4's `classList.remove('pya-checkout')` in `closeCheckout`.

- [ ] **Step 3: Commit**

```bash
git add apps/checkout/test/checkout-shell-review.test.ts
git commit -m "test(kit): the test payment and its confirmation stay in the calm checkout shell"
```

---

### Task 6: API data — banner in config, photo on the payment branding, line photos

**Announce first** to the owner: «Voy a guardar 4 archivos del API seguidos; si YAPI está trabajando, ese pedido se corta.» Check jobs: `psql "$(grep ^DATABASE_URL apps/api/.env | cut -d= -f2- | tr -d '"')" -c "select id,status from \"StoreSourceChatJob\" where status in ('RUNNING','QUEUED')"`. Wait while any row is RUNNING. Save all four source files and both specs in one burst.

**Files:**
- Modify: `apps/api/src/storefront-source/source-store-config.ts` (`sourceStoreConfigData`)
- Modify: `packages/shared-types/src/checkout-branding.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts:128-143`
- Modify: `apps/api/src/stores/store-checkout.service.ts:125-186`
- Test: `apps/api/src/storefront-source/source-store-config.spec.ts`, `apps/api/src/payment-intents/checkout-branding.spec.ts`

**Interfaces:**
- Produces: config `data.bannerUrl: string | null` (absolute); `CheckoutBranding.photoUrl?: string | null`; cart line `imageUrl?: string`.

- [ ] **Step 1: Write the failing tests**

In `source-store-config.spec.ts`, using the file's existing `publicStore` fixture:
```ts
it('carries the banner as an absolute URL for the checkout photo', () => {
  const apiUrl = new URL('https://api.test/v1');
  expect(sourceStoreConfigData({ ...publicStore, bannerUrl: '/v1/uploads/banner.jpg' }, apiUrl, false).bannerUrl).toBe('https://api.test/v1/uploads/banner.jpg');
  expect(sourceStoreConfigData({ ...publicStore, bannerUrl: null }, apiUrl, false).bannerUrl).toBeNull();
});
```
In `checkout-branding.spec.ts`, using its existing service + prisma mock (make `store.findMany` resolve one store that includes `bannerUrl: '/v1/uploads/banner.jpg'`):
```ts
it('hands the store banner to the payment page as its photo', async () => {
  const branding = await service.checkoutBranding({ merchantId: 'm1', metadata: { storeId: 's1' } });
  expect(branding?.photoUrl).toBe('/v1/uploads/banner.jpg');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-store-config.spec.ts src/payment-intents/checkout-branding.spec.ts`
Expected: FAIL — `bannerUrl` / `photoUrl` undefined.

- [ ] **Step 3: Implement**

`source-store-config.ts`, in the returned object after `logoUrl: publicStore.logoUrl,`:
```ts
    // The calm checkout's business photo (spec 2026-10-20); absolute, since the store is served from another origin.
    bannerUrl: publicStore.bannerUrl ? new URL(publicStore.bannerUrl, apiUrl).href : null,
```
`checkout-branding.ts`: add `photoUrl?: string | null;` to `CheckoutBranding`, and in `normalizeCheckoutBranding`'s return add `photoUrl: logo(v.photoUrl),` after `logoUrl: logo(v.logoUrl),`.
`payment-intents.service.ts` `checkoutBranding`: add `bannerUrl: true,` to the `select`, and replace the final `return sourceCheckoutBranding(…)` with
```ts
    return { ...sourceCheckoutBranding(store, version?.snapshot as Parameters<typeof sourceCheckoutBranding>[1]), photoUrl: store.bannerUrl ?? null };
```
`store-checkout.service.ts`: add `imageUrl?: string;` to the `selectedLines` value type; in `selectedLines.set(lineKey, { … })` add after the `variant &&` spreads:
```ts
          ...((variant?.imageUrl || link.imageUrls?.[0]) ? { imageUrl: variant?.imageUrl || link.imageUrls[0] } : {}),
```
(If `variant`'s type has no `imageUrl`, TypeScript says so: then use `...(link.imageUrls?.[0] ? { imageUrl: link.imageUrls[0] } : {}),` and make sure `imageUrls` is in the `links` query's `select`.)

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/storefront-source/source-store-config.spec.ts src/payment-intents/checkout-branding.spec.ts src/stores --maxWorkers=4 && cd ../.. && pnpm --filter @pagosya/shared-types build`
Expected: PASS; shared-types builds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-store-config.ts apps/api/src/storefront-source/source-store-config.spec.ts packages/shared-types/src/checkout-branding.ts apps/api/src/payment-intents/payment-intents.service.ts apps/api/src/payment-intents/checkout-branding.spec.ts apps/api/src/stores/store-checkout.service.ts
git commit -m "feat(api): the checkout gets the store banner as its photo and each cart line its product photo"
```

---

### Task 7: Hosted payment page in the shell

**Files:**
- Create: `apps/checkout/src/checkout/shell.ts`
- Modify: `apps/checkout/src/checkout/payment-form.ts` (`renderForm` markup + the tab listener)
- Modify: `apps/checkout/src/checkout-branding.ts`, `apps/checkout/src/checkout-branding.test.ts`
- Test: `apps/checkout/test/payment-form.test.ts`, `apps/checkout/test/source-payment-preview.test.ts`

**Interfaces:**
- Consumes: `logos.json`, `shell.css` (Task 1); `CheckoutBranding.photoUrl` (Task 6); `metadata.cart[].imageUrl`.
- Produces: `mountShellStyle(): void`, `shellAccent(accent: string, accentForeground: string): { accent: string; ink: string }`, `logoBadges(names: string[]): string`, `trustStripHtml(): string`, `methodRows(selected: DomesticMethodType, allowed: DomesticMethodType[], bodyHtml: string): string`, `shellSummary(session: CheckoutSession, photoUrl: string | null): string`, `shellFrame(o: { brandHtml: string; step: 'payment'|'done'; heading: string; note?: string; main: string; summary: string; total: string; backHtml?: string }): string`, `wireSummaryToggle(root: HTMLElement): void`.

- [ ] **Step 1: Write the failing tests** (add to `payment-form.test.ts`; `mockSession` and `loadCheckout` already exist there)

```ts
describe("payment form in the calm checkout shell", () => {
  beforeEach(() => vi.restoreAllMocks());
  const branding = { name: "Tostadero Yungas", logoUrl: "/v1/uploads/logo.png", photoUrl: "/v1/uploads/banner.jpg", background: "#e9d38a", surface: "#f2e3a6", foreground: "#171717", accent: "#171717", accentForeground: "#ffffff", bodyFont: "Inter", headingFont: "Archivo Black", radius: "8px", fonts: [] };
  const cartSession = { amount: 14400, branding, metadata: { storeId: "s1", subtotal: 14400, cart: [{ paymentLinkId: "p1", name: "Irupana Honey", variantName: "500 g", quantity: 2, unitAmount: 7200, imageUrl: "/v1/uploads/honey.jpg" }] } };

  it("draws the summary from the cart lines with the business photo", async () => {
    mockSession(cartSession as never);
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    const summary = document.querySelector(".pya-checkout .pya-co__summary")!;
    expect(summary.querySelector(".pya-co__photo")?.getAttribute("src")).toBe("/v1/uploads/banner.jpg");
    expect(summary.querySelector(".pya-co__qty")?.textContent).toBe("2");
    expect(summary.querySelector(".pya-co__line-text")?.textContent).toContain("500 g");
    expect(summary.querySelector(".pya-co__grand")?.textContent).toMatch(/BOB[\s\S]*144/);
  });
  it("lists the methods as radio rows with logos, the selected one open", async () => {
    mockSession(cartSession as never);
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    const rows = [...document.querySelectorAll<HTMLElement>(".pya-co__methods .tab")];
    expect(rows.map(r => r.dataset.type)).toEqual(["CARD", "QR", "TIGO_MONEY", "BANK_TRANSFER"]);
    expect(rows[0].querySelector('[aria-label="Visa"]')).toBeTruthy();
    expect(rows[0].closest(".pya-co__method")?.querySelector(".pya-co__method-body")).toBeTruthy();
    expect(document.querySelector("#pay.pya-co__pay")).toBeTruthy();
    expect(document.querySelector(".pya-co__trust")).toBeTruthy();
  });
  it("no longer paints the store background or fonts onto the payment page", async () => {
    mockSession(cartSession as never);
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    const app = document.getElementById("app")!;
    expect(app.style.getPropertyValue("--checkout-background")).toBe("");
    expect(app.style.getPropertyValue("--checkout-heading-font")).toBe("");
  });
  it("falls back to ink when the accent is too pale to read as a button", async () => {
    mockSession({ ...cartSession, branding: { ...branding, accent: "#f6e7a0", accentForeground: "#171717" } } as never);
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    expect(document.querySelector<HTMLElement>(".pya-checkout")!.style.getPropertyValue("--pya-accent")).toBe("#1a1a1a");
  });
  it("keeps a plain payment link's description and amount without lines", async () => {
    mockSession({ description: "Corte de cabello" });
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    expect(document.querySelector(".pya-co__summary .pya-co__line")).toBeNull();
    expect(document.querySelector(".pya-co__summary")?.textContent).toContain("Corte de cabello");
  });
});
```
The existing tests that click `.tab[data-type="QR"]` keep working: each row is a `<label class="tab …" data-type>`, and clicking a label checks its radio.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @pagosya/checkout exec vitest run test/payment-form.test.ts`
Expected: the five new tests FAIL (`.pya-checkout` not found).

- [ ] **Step 3: Write `apps/checkout/src/checkout/shell.ts`**

```ts
/** The calm checkout shell on the hosted payment page — the same stylesheet and logos as the store's review
 * (packages/storefront-kit/checkout-shell). Spec: docs/superpowers/specs/2026-10-20-calm-checkout-design.md */
import shellCss from "@pagosya/storefront-kit/checkout-shell/shell.css?raw";
import logos from "@pagosya/storefront-kit/checkout-shell/logos.json";
import { assetUrl, type CheckoutSession } from "../api";
import type { DomesticMethodType } from "../state";
import { escapeHtml, formatAmount } from "../ui/html";
import { ICON_LOCK } from "../ui/icons";

type Method = { type: DomesticMethodType; label: string; logos: string[]; note: string };
const METHODS = logos.methods as Method[];
const LOGOS = logos.logos as Record<string, string>;
type Line = { name: string; variantName?: string; quantity: number; unitAmount: number; imageUrl?: string };

export function mountShellStyle() {
  if (document.querySelector("style[data-pagosya-checkout-shell]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-pagosya-checkout-shell", "");
  style.textContent = shellCss;
  document.head.append(style);
}
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => { const [r, g, b] = c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
/** The store accent only when it reads: text at 4.5:1 and the button at 3:1 on white; otherwise ink. */
export function shellAccent(accent: string, accentForeground: string) {
  const ok = /^#[\da-f]{6}$/i.test(accent) && /^#[\da-f]{6}$/i.test(accentForeground) && ratio(rgb(accent), rgb(accentForeground)) >= 4.5 && ratio(rgb(accent), [255, 255, 255]) >= 3;
  return ok ? { accent, ink: accentForeground } : { accent: "#1a1a1a", ink: "#ffffff" };
}
export const logoBadges = (names: string[]) => names.map(name => LOGOS[name] ? `<span class="pya-co__logo-badge">${LOGOS[name]}</span>` : "").join("");
export function trustStripHtml() {
  const names = [...new Set(METHODS.flatMap(m => m.logos))];
  return `<div class="pya-co__trust"><span class="pya-co__logos">${logoBadges(names)}</span><span>${ICON_LOCK} Pago seguro procesado por pagosYa</span></div>`;
}
/** Radio rows in the Tarjeta, QR, Tigo Money, Transferencia order; `.tab[data-type]` stays for the click wiring and tests. */
export function methodRows(selected: DomesticMethodType, allowed: DomesticMethodType[], bodyHtml: string) {
  return `<div class="pya-co__methods" role="radiogroup" aria-label="Método de pago">${METHODS.filter(m => allowed.includes(m.type)).map(m => {
    const on = m.type === selected;
    return `<div class="pya-co__method"><label class="tab${on ? " active" : ""}" data-type="${m.type}"><input type="radio" name="payMethod" value="${m.type}"${on ? " checked" : ""}><span class="pya-co__method-name">${escapeHtml(m.label)}</span><span class="pya-co__logos">${logoBadges(m.logos)}</span></label>${on ? `<div class="pya-co__method-body"><p>${escapeHtml(m.note)}</p>${bodyHtml}</div>` : ""}</div>`;
  }).join("")}</div>`;
}
export function shellSummary(session: CheckoutSession, photoUrl: string | null) {
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(meta.cart) ? meta.cart as Line[] : [];
  const firstPhoto = lines.find(l => l.imageUrl)?.imageUrl;
  const photo = photoUrl ? assetUrl(photoUrl) : firstPhoto ? assetUrl(firstPhoto) : null;
  const money = (n: number) => formatAmount(n, session.currency);
  const linesHtml = lines.length
    ? `<ul class="pya-co__lines">${lines.map(l => `<li class="pya-co__line">${l.imageUrl ? `<span class="pya-co__thumb"><img src="${escapeHtml(assetUrl(l.imageUrl) ?? "")}" alt="" loading="lazy"><b class="pya-co__qty">${l.quantity}</b></span>` : ""}<span class="pya-co__line-text"><strong>${escapeHtml(l.name)}</strong>${l.variantName ? `<small>${escapeHtml(l.variantName)}</small>` : ""}${l.imageUrl ? "" : `<small>× ${l.quantity}</small>`}</span><span class="pya-co__line-price">${money(l.unitAmount * l.quantity)}</span></li>`).join("")}</ul>`
    : `<p class="pya-co__hint">${escapeHtml(session.description || "Pago a " + session.merchantName)}</p>`;
  const subtotal = typeof meta.subtotal === "number" ? meta.subtotal : null;
  const bundle = meta.bundle as { discountAmount?: number } | undefined;
  const discount = typeof meta.promoDiscountAmount === "number" ? meta.promoDiscountAmount : typeof bundle?.discountAmount === "number" ? bundle.discountAmount : 0;
  const shippingMeta = meta.shipping as { amount?: number } | undefined;
  const shipping = typeof shippingMeta?.amount === "number" ? shippingMeta.amount : null;
  const rows = [
    subtotal !== null ? `<div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div>` : "",
    discount ? `<div><dt>Descuento</dt><dd>−${money(discount)}</dd></div>` : "",
    shipping !== null ? `<div><dt>Envío</dt><dd>${shipping ? money(shipping) : "Gratis"}</dd></div>` : "",
  ].join("");
  return `<aside class="pya-co__summary" id="pya-co-summary" aria-label="Resumen del pedido"><div class="pya-co__summary-inner">${photo ? `<img class="pya-co__photo" src="${escapeHtml(photo)}" alt="">` : ""}<h2 class="pya-co__title">Tu pedido</h2>${linesHtml}<dl class="pya-co__totals">${rows}<div class="pya-co__grand order-total"><dt>Total</dt><dd><small>${escapeHtml(session.currency)}</small> <strong>${money(session.amount)}</strong></dd></div></dl></div></aside>`;
}
export function shellFrame(o: { brandHtml: string; step: "payment" | "done"; heading: string; note?: string; main: string; summary: string; total: string; backHtml?: string }) {
  const steps = ["Carrito", "Entrega", "Pago"].map((label, i) => `<li${o.step === "payment" && i === 2 ? ' aria-current="step"' : ""}>${label}</li>`).join("");
  return `<div class="pya-checkout pya-checkout--page"><header class="pya-co__bar">${o.backHtml ?? "<span></span>"}${o.brandHtml}<span class="pya-co__secure">${ICON_LOCK} Pago seguro</span></header><button type="button" class="pya-co__summary-toggle" aria-expanded="false" aria-controls="pya-co-summary" data-shell-summary><span data-shell-summary-label>Ver resumen del pedido</span><strong>${escapeHtml(o.total)}</strong></button><div class="pya-co__frame"><div class="pya-co__lead"><ol class="pya-co__steps">${steps}</ol><h1 class="payment-page-title" tabindex="-1">${escapeHtml(o.heading)}</h1>${o.note ? `<p class="pya-co__note">${escapeHtml(o.note)}</p>` : ""}</div><div class="pya-co__main">${o.main}</div>${o.summary}</div></div>`;
}
export function wireSummaryToggle(root: HTMLElement) {
  root.querySelector<HTMLButtonElement>("[data-shell-summary]")?.addEventListener("click", event => {
    const toggle = event.currentTarget as HTMLButtonElement;
    const shell = toggle.closest<HTMLElement>(".pya-checkout")!;
    const open = !shell.hasAttribute("data-summary-open");
    shell.toggleAttribute("data-summary-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("[data-shell-summary-label]")!.textContent = open ? "Ocultar resumen del pedido" : "Ver resumen del pedido";
  });
}
```
If `apps/checkout/src/vite-env.d.ts` exists, add `declare module "*.css?raw" { const css: string; export default css; }`; if it does not, create it with `/// <reference types="vite/client" />` (which already declares `?raw`). Make sure `apps/checkout/tsconfig.json` has `"resolveJsonModule": true`.

- [ ] **Step 4: Rewrite `renderForm`'s markup in `payment-form.ts`**

Keep every id and listener. Just before the current `const headerHtml = …`, lift three existing template expressions verbatim into constants:
- `const CONTACT_FIELDS_HTML = <the storeCheckout ? \`…name/email/phone/delivery…\` : \`<div class="direct-charge-context">…</div>\` expression that opens the current <form>>;` — while moving it, change each `<div class="field"><label for="x">Text</label><input id="x" …/>…</div>` into `<label class="field" for="x">Text<input id="x" …/></label>` followed by that field's `${fieldError(...)}` and hint (the label box wraps the control).
- `const INTL_HTML = <the ${session.international?.available && !domainPurchase && !sourcePaymentPreview ? \`<div class="intl-entry">…</div>\` : ""} expression>;`
- `const PAY_AMOUNT_HTML = <the expression inside the current #pay button after 'Simular pago de'/'Pagar'>;`

Then replace the `const headerHtml = …` block and the whole `app.innerHTML = \`…\`` assignment with:
```ts
  mountShellStyle();
  const storeName = brand?.name || state.linkHeader?.storeName || session.merchantName;
  const brandHtml = brand
    ? `<span class="pya-co__brand merchant-row">${brand.logoUrl ? `<img class="pya-co__logo checkout-store-logo" src="${escapeHtml(brand.logoUrl)}" alt="" referrerpolicy="no-referrer">` : ""}<strong class="pya-co__name merchant-name">${escapeHtml(storeName)}</strong></span>`
    : `<span class="pya-co__brand merchant-row"><span class="merchant-avatar">${escapeHtml(initials(storeName))}</span><strong class="pya-co__name merchant-name">${escapeHtml(storeName)}</strong></span>`;
  const accent = brand ? shellAccent(brand.accent, brand.accentForeground) : { accent: "#1a1a1a", ink: "#ffffff" };
  const allowed = DOMESTIC_METHOD_TYPES.filter(type => !domainPurchase || type === PaymentMethodType.QR);
  const methodBody = import.meta.env.DEV && !sourcePaymentPreview
    ? `<label class="field" for="token">Token de prueba (modo test)<select id="token">${tokens.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}</select></label><div class="hint">En producción este campo lo reemplaza el rail real (tokenización de tarjeta, deep link Tigo Money, etc).</div>`
    : "";
  const payHtml = state.internationalMode ? "" : `<section class="pya-co__section"><h2 class="pya-co__title">Pago</h2>${methodRows(state.selectedType, allowed, methodBody)}</section>`;
  const main = `${sourcePaymentPreview ? '<p class="checkout-preview-notice" role="status">Vista previa · Sin cobros ni pedidos reales</p>' : ""}<form id="payment-form" novalidate><section class="pya-co__section"><h2 class="pya-co__title">${storeCheckout ? "Contacto" : "Datos del cobro"}</h2>${CONTACT_FIELDS_HTML}</section>${INTL_HTML}${payHtml}<button class="primary pya-co__pay" type="submit" id="pay"${state.internationalMode && state.internationalMethods && state.internationalMethods.methods.length === 0 ? " disabled" : ""}>${sourcePaymentPreview ? "Simular pago de" : "Pagar"} ${PAY_AMOUNT_HTML}</button>${trustStripHtml()}<div id="legalNoticeSlot">${legalNoticeHtml(buyerLegal)}</div><button class="secondary pya-co__secondary" type="button" id="cancel">Cancelar pago</button></form>`;
  app.innerHTML = shellFrame({ brandHtml, step: "payment", heading: "Completa tu pedido", main, summary: shellSummary(session, brand?.photoUrl ?? null), total: formatAmount(session.amount, session.currency) });
  const shellRoot = app.querySelector<HTMLElement>(".pya-checkout")!;
  shellRoot.style.setProperty("--pya-accent", accent.accent);
  shellRoot.style.setProperty("--pya-accent-ink", accent.ink);
  wireSummaryToggle(shellRoot);
```
This drops the old `.payment-summary-panel`, the `.tabs` strip and the `secure-note payment-secure-note` div (replaced by the summary and trust strip). Replace the `.tab` click listener with:
```ts
  app.querySelectorAll<HTMLInputElement>('input[name="payMethod"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.selectedType = radio.value as DomesticMethodType;
      renderForm(session, clientSecret);
    });
  });
```
Add `import { methodRows, mountShellStyle, shellAccent, shellFrame, shellSummary, trustStripHtml, wireSummaryToggle } from "./shell";`. Remove `TAB_LABELS`/`TAB_ICONS` only if `grep -rn "TAB_LABELS\|TAB_ICONS" apps/checkout/src apps/checkout/test` shows no other user.

- [ ] **Step 5: Stop applying store paint in `checkout-branding.ts`**

In `applyCheckoutBranding`, delete the `DNA_FIELDS` loop, the `FontFace` loop, the `for (const key of ['background', …])` loop, the `app.style.colorScheme` line and the `document.body.style.setProperty('--checkout-background', …)` line. Keep `document.body.classList.toggle('store-branded-checkout', !!value)`, `normalizeCheckoutBranding`, the title, and return `{ ...brand, logoUrl: brand.logoUrl ? assetUrl(brand.logoUrl) : null }` (`photoUrl` comes through `brand`). Delete `DNA_FIELDS`, `loaded` and `storeDna`; keep `rememberStoreDna` as an exported no-op only if `grep -rn rememberStoreDna apps/checkout/src` finds callers (comment: «Kept for callers; the calm checkout no longer takes the store's DNA.»), else delete it. In `checkout-branding.test.ts`, remove the expectations that colours, fonts or DNA are applied, keep the name/logo/title ones, and add `expect(app.style.getPropertyValue('--checkout-background')).toBe('')`.

- [ ] **Step 6: Run**

Run: `pnpm --filter @pagosya/checkout exec vitest run test/payment-form.test.ts test/source-payment-preview.test.ts src/checkout-branding.test.ts && pnpm --filter @pagosya/checkout exec tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors. Old tests asserting `.merchant-row` / `.merchant-name` / `.merchant-avatar` still pass (the classes stay on the brand).

- [ ] **Step 7: Commit**

```bash
git add apps/checkout/src apps/checkout/test apps/checkout/tsconfig.json
git commit -m "feat(checkout): the hosted payment page draws the calm checkout — cart lines with photos, method rows with logos, readable accent only"
```

---

### Task 8: Hosted confirmation in the shell

**Files:**
- Modify: `apps/checkout/src/checkout/payment-result.ts` (`renderSuccess`, `CartLine`)
- Test: `apps/checkout/test/payment-result-shell.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

describe("confirmation in the calm checkout shell", () => {
  it("shows the check, the order and its lines in the shell", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    const { renderSuccess } = await import("../src/checkout/payment-result");
    renderSuccess({ id: "pi_9", amount: 14400, currency: "BOB", status: "SUCCEEDED", description: null, merchantName: "Tostadero", metadata: { cart: [{ paymentLinkId: "p1", name: "Irupana Honey", quantity: 1, unitAmount: 14400 }] }, recipient: null, trackingToken: null, branding: { name: "Tostadero Yungas", logoUrl: null, photoUrl: null, accent: "#171717", accentForeground: "#ffffff" } } as never, true);
    const root = document.querySelector(".pya-checkout")!;
    expect(root.querySelector(".pya-co__lead h1")?.textContent).toBe("¡Gracias por tu compra!");
    expect(root.querySelector(".pya-co__check")).toBeTruthy();
    expect(root.querySelector(".pya-co__summary .pya-co__line-text")?.textContent).toContain("Irupana Honey");
    expect(root.querySelector(".payment-success-panel .receipt")).toBeTruthy();
  });
});
```
(If `renderSuccess` pulls modules that need mocks in jsdom — analytics, printer animation — copy the `vi.mock` lines `payment-form.test.ts` uses for the same modules.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @pagosya/checkout exec vitest run test/payment-result-shell.test.ts`
Expected: FAIL — `.pya-checkout` not found.

- [ ] **Step 3: Implement**

Add `imageUrl?: string;` to `CartLine`. In `renderSuccess`, replace the `app.innerHTML = \`<div class="payment-success-panel">…</div>\`` assignment with:
```ts
  mountShellStyle();
  const brand = (order as CheckoutSession).branding;
  const storeName = brand?.name || state.linkHeader?.storeName || "pagosYa";
  const brandHtml = `<span class="pya-co__brand">${brand?.logoUrl ? `<img class="pya-co__logo" src="${escapeHtml(assetUrl(brand.logoUrl) ?? "")}" alt="">` : ""}<strong class="pya-co__name">${escapeHtml(storeName)}</strong></span>`;
  const panel = `<div class="payment-success-panel pya-co__done"><span class="pya-co__check">${ICON_CHECK}</span><div class="status success"><span>${preview ? "Prueba completada" : storeCheckout ? "Pedido recibido" : "Pago confirmado"}</span></div><article class="receipt">${receiptContentHtml}</article><div class="payment-success-actions">${trackingActionHtml}${printActionHtml}</div>${preview ? '<p>No se realizó ningún cobro ni se creó un pedido real.</p><button class="secondary pya-co__secondary" id="preview-back" type="button">Volver al pedido</button>' : backToStoreHtml()}</div>`;
  const summarySession = { ...(order as CheckoutSession), description: (order as CheckoutSession).description ?? null, merchantName: (order as CheckoutSession).merchantName ?? storeName } as CheckoutSession;
  app.innerHTML = shellFrame({ brandHtml, step: "done", heading: storeCheckout ? "¡Gracias por tu compra!" : "Pago confirmado", main: panel, summary: shellSummary(summarySession, brand?.photoUrl ?? null), total: formatAmount(order.amount, order.currency) });
  const shellRoot = app.querySelector<HTMLElement>(".pya-checkout")!;
  const accent = brand?.accent && brand?.accentForeground ? shellAccent(brand.accent, brand.accentForeground) : { accent: "#1a1a1a", ink: "#ffffff" };
  shellRoot.style.setProperty("--pya-accent", accent.accent);
  shellRoot.style.setProperty("--pya-accent-ink", accent.ink);
  wireSummaryToggle(shellRoot);
```
Keep every line after it (motif, preview back, downloads, comeback, print, printer, report). Import `mountShellStyle, shellAccent, shellFrame, shellSummary, wireSummaryToggle` from `./shell` and `assetUrl` from `../api` (add to the existing import).

- [ ] **Step 4: Run the whole checkout suite**

Run: `pnpm --filter @pagosya/checkout test`
Expected: PASS, or only the failures recorded in Task 0.

- [ ] **Step 5: Commit**

```bash
git add apps/checkout/src/checkout/payment-result.ts apps/checkout/test/payment-result-shell.test.ts
git commit -m "feat(checkout): the order confirmation sits in the calm checkout shell with the order's lines beside it"
```

---

### Task 9: Studio e2e, store-CSS isolation, phone layout, rebuild and live check

**Files:**
- Modify: `apps/merchant-studio/tests/kit-templates.spec.ts` (review/checkout template tests), `apps/merchant-studio/tests/source-catalog.spec.ts:147-149`
- Create: `apps/merchant-studio/tests/calm-checkout.spec.ts`

- [ ] **Step 1: Update tests that expected store templates or a closing overlay**

In `kit-templates.spec.ts`, the tests that mount `data-pagosya-review-template` / `data-pagosya-checkout-template` (around lines 151-176) now assert the shell: replace their template-slot expectations with
```ts
  await expect(shop.locator('.pya-checkout .pya-co__summary')).toBeVisible();
  await expect(shop.locator('.caja, .revision, [data-checkout-root]')).toHaveCount(0);
  await expect(shop.locator('.pya-checkout .pya-co__lead h1')).toHaveText('Revisa tu pedido');
```
and, for the payment step, `toHaveText('Pago de prueba')`. Lines 63-65 keep their expectations («Prueba completada» still appears in a status).
In `source-catalog.spec.ts`, replace lines 147-149 with:
```ts
  await checkout.getByRole('button', { name: 'Completar prueba' }).click();
  await expect(checkout.getByRole('heading', { name: '¡Gracias por tu compra!' })).toBeVisible();
  await expect(checkout.locator('[data-pagosya-status]')).toHaveText('Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.');
  await checkout.getByRole('button', { name: 'Volver a la tienda' }).click();
  await expect(checkout).not.toBeVisible();
```

- [ ] **Step 2: Write `calm-checkout.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LOUD = `h1{font-size:66px;letter-spacing:-.04em;text-transform:uppercase}button{border-radius:999px;background:yellow;color:#000;font-family:Georgia}input,select{background:#111;color:#eee}[data-pagosya-cart] button{border:4px solid hotpink}body{background:#e9d38a}`;
const CONFIG = 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'tostadero', demo: true, data: { storeName: 'Tostadero Yungas', checkoutMode: 'payment', locations: [], categories: [], items: [{ id: 'honey', name: 'Irupana Honey de altura con un nombre muy largo para el teléfono', amount: 14400, currency: 'BOB', stock: 9, imageUrls: [], variants: [], extras: [] }] } }) + ';';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${LOUD}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><main><section data-pagosya-catalog></section></main><p data-pagosya-status></p></body></html>`;

async function open(browserPage: any) {
  await browserPage.goto('/?demo=1');
  await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts');
    const snapshot = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Tienda'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { cart: [{ id: 'honey', quantity: 1 }] }); document.body.append(frame);
  }, { commerce, html, config: CONFIG });
  const shop = browserPage.frameLocator('iframe');
  await shop.locator('body').evaluate(() => { location.hash = 'checkout'; });
  return shop;
}

for (const width of [1440, 390]) test(`the calm checkout ignores a loud store stylesheet at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const shop = await open(page);
  const root = shop.locator('.pya-checkout');
  await expect(root).toBeVisible();
  const h1 = await root.locator('.pya-co__lead h1').evaluate((el: HTMLElement) => ({ size: getComputedStyle(el).fontSize, transform: getComputedStyle(el).textTransform }));
  expect(h1).toEqual({ size: '26px', transform: 'none' });
  const pay = await root.locator('.pya-co__pay').evaluate((el: HTMLElement) => ({ radius: getComputedStyle(el).borderRadius, bg: getComputedStyle(el).backgroundColor }));
  expect(pay.radius).toBe('6px');
  expect(pay.bg).toBe('rgb(26, 26, 26)');
  expect(await root.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  if (width === 390) { await expect(root.locator('.pya-co__summary')).toBeHidden(); await root.locator('[data-shell-summary]').click(); }
  const price = root.locator('.pya-co__line-price').first();
  await expect(price).toBeVisible();
  expect(await price.evaluate((el: HTMLElement) => el.getClientRects().length)).toBe(1);
  expect(await root.evaluate((el: HTMLElement) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `../../tmp/calm-checkout-${width}.png` });
});
```

- [ ] **Step 3: Run the Studio e2e**

Run: `cd apps/merchant-studio && npx playwright test tests/calm-checkout.spec.ts tests/kit-templates.spec.ts tests/source-catalog.spec.ts tests/source-pages.spec.ts tests/source-studio.spec.ts tests/source-publication.spec.ts`
Expected: PASS. Open `tmp/calm-checkout-1440.png` and `tmp/calm-checkout-390.png` with the Read tool and compare against ayvilabs (white left, grey right, boxed fields, logos under the button).

- [ ] **Step 4: Full suites**

Run:
```bash
cd /Users/saramia/pagosYa
node packages/storefront-kit/tools/build-commerce.mjs --check
pnpm --filter @pagosya/storefront-kit test
pnpm --filter @pagosya/checkout test
cd apps/api && npx jest src/storefront-source src/payment-intents src/stores --maxWorkers=4
```
Expected: PASS, or only the failures recorded in Task 0. (Never run the full API jest with default workers.)

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/tests
git commit -m "test(studio): the calm checkout shell wins over loud store CSS and store checkout templates, on desktop and phone"
```

- [ ] **Step 6: Rebuild the Studio and live-check on dev**

Run: `cd apps/merchant-dashboard && pnpm run build:studio`. With the owner's stack running (`pnpm dev:chatgpt` if it is not), open Tostadero Yungas' published store in Chrome at 1440 and 390 (hard reload ⌘⇧R): add Irupana Honey → Finalizar compra → review (photo, lines, delivery radios, logos) → «Continuar al pago de prueba» → pick QR → «Completar prueba» → confirmation → «Volver a la tienda». Then one live-mode store through the hosted page with the dev token. Save screenshots to `tmp/` and show them to the owner; report anything that looks off plainly.

---

## Self-review notes

- Spec coverage: shell look (T1), shared code (T1–T2), pre-checkout review (T3–T4), demo payment + confirmation (T4–T5), data (T6), hosted page (T7), hosted confirmation (T8), templates/authored pages stop (T3), branding reduced (T7), phone + motion (T1 CSS, T9), edge cases — empty cart (`.order-empty` stays inside `.pya-co__lines`), long names (T9), no logo/photo (T3/T4), WhatsApp/external (T4), international (T7 keeps `intl-entry` in the form). Testing section → T3–T9.
- Deliberate deviations from the spec: existing button labels stay (tests and merchants know them) with the total appended; the accent must also reach 3:1 on white.
