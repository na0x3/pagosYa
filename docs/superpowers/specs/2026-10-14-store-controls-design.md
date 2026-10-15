# Store controls: one button language per store, designed by YAPI (spec 2026-10-14)

## Why

The owner, after the one-look-per-store live check (2026-10-14): the login and cart buttons "always being the same, its like basic shapes, i want shapes to have something to do with the store, or like not always be the same also."

What the code does today (research 2026-10-14):
- The platform header (`renderSourceHeader`, `apps/api/src/storefront-source/source-header.ts:36-63`) writes the same controls into every Sep-5 store:
  - "Mi cuenta" as a plain text link;
  - "Carrito N" as an accent pill (`packages/storefront-kit/kit/headers/headers.css:15`);
  - no icons anywhere.
- The drawn `cart` style (`frame-draw.ts:31-38`) is removed before the header is built (`frame-draw.ts:112-116`).
- The business cart word (`CART_WORDS`, `commerce-draw.ts:50-55`) reaches only the drawer, the order panel and the kit links, never the header.
- The kit's own small controls (card "+", quantity steppers, drawer close, count badge) follow `dna.button`/`dna.radius`, not anything tied to the store.

Owner decisions (brainstorming 2026-10-14):
- **Tie-in:** both. The shape follows the store's look, and the icon and word come from the business.
- **Scope:** every small control. That means:
  - the header's account, cart, menu and search;
  - the card "+" add buttons;
  - quantity steppers;
  - the drawer close button;
  - the count badge.
- **Approach B (with guardrails):** YAPI designs each store's control language as constrained data, the kit renders it, a browser check guards it, and a designed library is the fallback. Approved over a library-only approach for the sake of uniqueness.

## Parts, in order

1. **Fix the background review stage.**
2. **The control language record** (`config.controls`).
3. **The kit draws it everywhere.**
4. **YAPI designs it** (review stage, chat requests, redesigns).
5. **Guards, library fallback, testing, live check.**

### 1. Fix the background review stage

Live check 2026-10-14: no `REVIEWING` row and no «Revisión de YAPI» revision has ever existed in the dev database. Three Sep-5 builds that night saved revision N only.

The code path looks correct when read:
- `sep5Review` is armed when `sep5SelfReview || kitTouchOn` (`source-generation.service.ts:1001`);
- it is started at `:1670`;
- `startSep5Review` creates the row at `:1716`.

The cause is unknown. The API log line `sep5_review_not_started` (in the owner's `pnpm dev:chatgpt` terminal) is the first thing to read.

The work for this part:
- Diagnose it with the systematic-debugging skill and fix it.
- Add a regression test: a Sep-5 build that arms the review must create a `REVIEWING` row for revision N.

Everything below that runs in the review stage depends on this part.

### 2. The control language record

It is saved as `config.controls` in `config.js`, beside `config.look`. It is a pure, clamped record, and the module and pattern match `store-look.ts` / `sanitizeLook`. The new file is `apps/api/src/storefront-source/store-controls.ts`.

```ts
type StoreControls = {
  version: 1;
  shape: {
    outline: 'rounded' | 'pill' | 'square' | 'ticket' | 'tag' | 'sticker' | 'tab' | 'stamp' | 'bracket' | 'underline' | 'blob';
    corner: number;   // 0–24 px
    notch: number;    // 0–10 px (ticket notches, tag cut, stamp scallop depth)
    tilt: number;     // −6…6 degrees (drawn on an inner layer, never the hit box)
    border: 'none' | 'hairline' | 'solid' | 'double' | 'dashed' | 'offset';
    weight: number;   // 1–3 px
    fill: 'solid' | 'outline' | 'ghost' | 'inverted';
    colour: 'accent' | 'ink' | 'paper';   // store tokens only
  };
  layout: { cart: 'icon+word' | 'icon' | 'word'; account: 'icon' | 'word' | 'icon+word' };
  icons: Partial<Record<'cart' | 'account' | 'menu' | 'search' | 'plus' | 'minus' | 'close', string>>; // SVG path data
  words: { cart?: string; account?: string };
  badge: 'dot' | 'circle' | 'inline' | 'corner' | 'stamp';
  source: 'yapi' | 'library';
};
```

How the sanitizer treats each field:
- **Numbers** are clamped to the ranges above.
- **Enums** are matched against these lists. An unknown value means the record is dropped.
- **Icons:**
  - path data only, parsed by command;
  - every point inside a 24×24 box;
  - at most 1,500 characters each;
  - drawn with `currentColor`;
  - no other SVG elements, attributes, URLs, scripts or text.

  A bad icon is replaced by the library icon for that slot, and the rest of the record is kept.
- **Words:**
  - 1–14 characters;
  - no emoji or markup;
  - trimmed;
  - in the store's language.

  Screen-reader labels stay plain and are not taken from the words, for example «Carrito, 2 productos» and «Mi cuenta».
- **Colours** are absent by design. They come from the `--store-*` tokens.

### 3. The kit draws it everywhere

**Header (at save time).** `renderSourceHeader` takes `controls`. It writes:
- the cart, account, menu and search controls, with inline SVG icons and the record's words, following `layout`;
- `data-controls-*` attributes on the header.

The 10 header shapes (`packages/storefront-kit/kit/headers/*.html`) are unchanged; they still place `{{tools}}`, `{{cta}}` and `{{toggle}}`. Side-rail and bottom-pill keep deciding where the controls sit.

**Kit pages (at runtime).** `commerce.js` reads `config.controls` and draws the following from it:
- card "+" buttons;
- quantity steppers;
- the drawer close button;
- the count badge everywhere.

The store's cart word also reaches the header.

**Styling.** There is one stylesheet, `packages/storefront-kit/kit/controls.css`:
- One recipe per outline, keyed by `:root[data-controls-outline=…]`.
- Variables:
  - `--ctl-corner`
  - `--ctl-notch`
  - `--ctl-tilt`
  - `--ctl-weight`
  - `--ctl-fill`
  - `--ctl-ink`
- How the outlines are made:
  - ticket notches and the tag's hole are radial-gradient masks;
  - the stamp scallop is a mask;
  - the sticker's thick edge and tilt are on an inner layer.
- The hit box stays upright and at least 44 × 44 px.

**Locked: no record can change these.**
- `data-cart-open`, `data-cart-count`, `data-pagosya-account`;
- accessible names;
- focus rings;
- 44 px targets;
- the menu's open/close/Escape and focus-return behaviour.

These live in the kit's markup and in a CSS layer after the controls layer.

**No record** (existing stores, or everything dropped): the controls render exactly as today.

**Out of scope:**
- Next/TSX stores (`SiteHeader`, `source-ui.ts:11`).
- Showcase sites get account, menu and search only (no cart).

### 4. YAPI designs it

**Revision N** (the first save) gets a library language picked for the store. The pick is pure and uses:
- the business kind;
- calm or bold mode;
- the measured look;
- a seed, avoiding languages used by sibling stores.

**N+1 (background review)** gets YAPI's own design:
- **Timing.** A dedicated `controls` call starts in parallel with the review call, because the ChatGPT bridge serves about two calls at once. It has its own deadline of about 60 s (the same pattern as `touchBudgetMs`). It is billed only when kept.
- **Input:**
  - the business: name, kind, brief, products;
  - the `--store-*` palette tokens and `config.look`;
  - home page screenshots at 1440 and 390 with the header in view;
  - the control languages of the store's six most recent sibling and same-kind stores, as "do not repeat".
- **Output:** the record from part 2 as strict JSON (schema-bound like `KIT_TOUCH_SCHEMA`), plus one short Spanish note for the chat, e.g. «Diseñé los botones como boletos, con una taza para el carrito.».
- **Saving:** the result is saved in the same N+1 as the review's edits and the kit touch.

**Chat requests.** Requests about the controls ("haz el carrito como una taza", "botones más redondos") are recognised as control requests. The same call runs with the merchant's words, and the result is saved with that edit, the way the request touch is saved (`source-generation.service.ts:~1610-1625`).

**Redesigns** design a new language. The previous one is passed as something to move away from.

**Failure.** A timeout, an unusable answer, or a failing guard keeps revision N's library language. The edit and the review's other changes never fail because of the controls.

### 5. Guards, library, testing

**Library** (`store-controls-library.ts`):
- About 10 hand-designed languages, one per outline, each with tuned numbers and a badge style.
- Icons come in two drawing styles (line, solid). The cart icon is chosen by business kind:
  - cup
  - bag
  - basket
  - frame
  - scoop
  - briefcase
  - leaf
  - paw

  Account, menu, search, plus, minus and close are shared.
- The pick is a pure function of kind, mode, look and seed.

**Guards, in order:**
1. **Sanitizer** (part 2).
2. **Browser check** on the saved candidate, at 1440 and 390, on the shop and showcase headers. It reuses `design-engine/header-clickable.ts` and the shape checks from `source-header-browser.spec.ts`. Every control must:
   - be visible;
   - be at least 44 px;
   - not be covered by other content;
   - cause no horizontal overflow;
   - keep the menu's Escape and focus behaviour;
   - draw a visible, non-empty icon.

   Contrast: words need 4.5:1, icons and borders need 3:1, against the measured background.
3. **Failure handling.**
   - A failing icon falls back to the library icon for that slot.
   - A failing shape, layout or contrast drops the whole record to the library language.
   - The outcome is logged as `controls_saved` / `controls_dropped` with reasons.

**Tests:**
- Unit tests:
  - the sanitizer;
  - the icon path parser;
  - the library pick;
  - rendering the record into the header.
- A kit browser test covering every outline × fill × layout, at 1440 and 390:
  - header controls;
  - card "+";
  - steppers;
  - drawer close;
  - badge.
- Generation-service tests:
  - N gets the library language;
  - N+1 gets YAPI's design;
  - timeout, unusable answer and failed guard each fall back;
  - chat control requests save with the edit.
- Part 1's regression test.

**Live check** (ChatGPT plan, owner approval required, same method as 2026-10-14). It uses three new stores plus one chat request («haz el carrito como una taza»). Success criteria:
1. The review stage runs on every build and saves N+1.
2. No two of the stores share an outline plus cart icon.
3. Every control passes the guards at both widths.
4. The controls call adds no more than about 45 s to the review stage.
5. The owner gets side-by-side screenshots of the header, cards and cart.

## Not in this spec

- Store copy voice ("text that is not generic").
- Business-specific forms and tools (subscription forms, a per-litre price calculator).

The owner raised both on 2026-10-14. They are separate sub-projects with their own specs.
