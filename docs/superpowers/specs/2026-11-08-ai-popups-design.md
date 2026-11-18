# AI-designed popups — design

Owner 2026-11-08: «make better the … popups design because sometimes the popups are all the same and dont have pictures in it».
Sub-project 2 of the 2026-11-08 programme (1 WhatsApp + chatbot — built; 2 popups; 3 email design; 4 copy a website onto a template).

## Decisions (owner)

- **Variety:** YAPI designs each store's popup (not a fixed set of layouts).
- **Freedom:** the AI writes its own HTML + CSS around fixed platform slots (like the email kits), cleaned and checked before it goes live.
- **When:** automatically after a new store's first build; the merchant can ask for a redesign at any time.
- Architecture: approach A — a *popup kit* modelled on `EmailKitService`, kept in the store's retention settings, independent of
  publishing. (B, a file in the store's source, was rejected: it ties popup edits to publishing and the guarded template-edit path.)

## Today (what goes wrong)

- `packages/storefront-kit/kit/retention.js` `mountSignup` draws one layout for every store: photo left, form right.
- The photo is `signupVisual.imageUrl` = the first product's first image, else the banner; with neither, a monogram letter.
- **Bug:** at ≤ 700px the first media rule sets `.pagosya-signup-photo{display:none}` and the later phone rule never turns it back on,
  so on phones the popup never has a photo.
- Neither the merchant nor YAPI can choose the popup's photo or look. All 270 stores with retention settings have the popup on.

## 1. Phone-photo fix (independent, ships first)

Drop the `display:none` on `.pagosya-signup-photo` in the first ≤ 700px rule; the second rule's 150px photo band then applies.
The built-in layout stays the fallback for every store without a kit, so this fix matters on its own.

## 2. The popup kit

### Storage

`StoreRetention.settings.popupKit` (JSON, no migration):

```ts
type PopupKit = {
  html: string;          // validated fragment with platform slots (below)
  css: string;           // validated, every rule scoped under [data-popup-kit]
  photo: string;         // the chosen photo's stored URL (one of the store's own uploads)
  seed: number;          // varies a redesign
  createdAt: string;     // ISO 8601
  model: string;
};
```

`settings.popupKitPrevious` keeps the last kit for one step of undo. `publicRetentionSettings` adds `popupKit` (html, css, photo) so the store page receives it with the other popup settings; `retention.js`
fills every slot (words escaped, the photo resolved against the API like `signupVisual.imageUrl`); the welcome code stays private.

### Slots (platform-owned)

| Slot | Filled by the platform with |
|---|---|
| `<pya-photo></pya-photo>` | `<img>` of `kit.photo` (alt from the store name), `referrerpolicy="no-referrer"` |
| `<pya-title></pya-title>` | `settings.signupTitle` as the dialog heading (`h2`, `tabindex=-1`) |
| `<pya-text></pya-text>` | `settings.signupBody` |
| `<pya-form></pya-form>` | today's form: interests, name, email, WhatsApp/phone, consent line, submit button, status line |
| `<pya-code></pya-code>` | optional: «Tu código» note when the store has a welcome code; empty otherwise |

The close button is not a slot: the platform always adds it, top-right of the dialog, outside the AI's HTML. The `<dialog>`, backdrop,
phone sheet behaviour, focus trap, 30-day memory, timing (`popupTrigger`, `popupDelaySeconds`), demo and preview rules are unchanged.

### Validation (`popup-kit-validate.ts`, parse5 like `email-kit-validate.ts`)

HTML:
- allowed tags: `div section header footer figure figcaption span p strong em small br hr ul li svg path circle rect g` and the slots;
  allowed attributes: `class`, `aria-hidden`, `role="presentation"`, and on SVG `viewBox d fill stroke stroke-width cx cy r x y width height
  rx transform`.
- no `script style link iframe img form input button a object embed`, no `on*` attributes, no `style` attributes, no URLs anywhere.
- `pya-title`, `pya-text`, `pya-form`, `pya-photo` exactly once; `pya-code` at most once. Words outside the slots ≤ 80 characters in all
  (decoration such as «Nuevo», never prices, dates or invented offers — same checks as the email kit's amount and date patterns).
- size ≤ 12 KB.

CSS:
- parsed with postcss (8.5, already a direct dependency of apps/api) and every selector rewritten to start with `[data-popup-kit]`.
- banned: `position:fixed`, `@import`, `url(` (the photo comes from the slot, never CSS), `expression(`, `behavior`, `-moz-binding`,
  `content:` with more than 20 characters, `z-index` above 10, `display:none` / `visibility:hidden` / `opacity:0` on a slot or its
  ancestors. `@media` and `@keyframes` allowed; animations wrapped by the platform in `prefers-reduced-motion:no-preference`.
- size ≤ 16 KB.

A failing kit gets one repair call with the validator's messages; failing again, nothing is saved (fallback layout).

### Render check

Playwright (as `guarded-browser.ts` uses) loads the real `retention.js` in demo mode with the kit, the store's colours and fonts, and
the photo served from the store's uploads, and opens the popup at 1280×800 and 390×844:
- form, email field, consent line, submit button and close button visible and inside the viewport;
- the photo visible and at least 120px tall at both sizes;
- the title and the email field's label: contrast ≥ 4.5:1 against their nearest opaque background, and never laid over the photo
  without a panel of their own;
- no horizontal overflow.
A failure counts as a validation failure (one repair, then fallback).

### Designer (`popup-kit-designer.ts`)

- Model: the email kit's (`EMAIL_KIT_MODEL`, `gpt-5.6-terra`); usage stage `popup-kit`; through `sourceProvider`, so the ChatGPT plan is
  unmetered in dev.
- Input: store name and voice line (`emailVoiceLine`), template name, the store's look (DNA: display/text fonts, case, radius, border,
  colours as the published config carries them), the popup words, whether a welcome code exists, and up to 12 store photos as refs
  `f0…f11` (banner first, then the store's own uploads, then product photos), each with its role (portada, tienda, producto). The model answers
  `{ html, css, photo: "f3" }`.
- Brief: «a small editorial moment of the store, not a form with a picture»; use the store's fonts and colours; photo large on desktop
  and on phones; a different composition from the previous kit when redesigning (the previous kit's outline is passed with the seed).

### When it runs

- **First build:** when a new store's first build finishes (after «Revisión del pedido» when the checklist runs, else after the
  section-library fill), `PopupKitService.designAfterBuild(storeId)` runs in the background (same pattern as
  `emailKits.designAfterSite`). On success YAPI adds a chat message: «Diseñé tu ventana de suscripción. Mírala con «Ver ventana».»
  A failure is silent to the merchant (fallback popup) and logged with the validator's reasons.
- **Credits:** about 6 credits; checked with `PlansService.assertCredits` first. With no credits the step is skipped; the build is
  unaffected.
- **Existing stores:** unchanged until redesigned. A one-time batch script (`scripts/design-popups.ts <storeId…>`) runs only when the
  owner names the stores.

## 3. YAPI quick edits (`source-store-edit.ts`, part `popup`)

- `field redesign` — «rediseña la ventana»: queues a new design (new seed), keeps the current kit as `popupKitPrevious`.
- `field photo`, value a photo ref (`f…` from the message or the store) — «cambia la foto de la ventana»: swaps `kit.photo`, no AI call.
- `field undo` — «vuelve a la ventana anterior»: swaps kit and previous.
- `on/off/title/text/button/discount` unchanged; they fill slots, so the design survives text changes.
- Replies say what happened; a redesign answers «Estoy diseñando tu ventana nueva; aparece en un minuto.» and posts again when saved.

## 4. Studio

«Ver ventana de suscripción» in «Mi tienda › Marketing» opens the popup over the editor at once, drawn by the same `retention.js`
(no timer, never sends).

## Error handling

Model error, timeout, invalid kit twice, render check failing twice, no credits: no kit saved, fallback popup, a log line with the
reason; a merchant-asked redesign answers «No pude diseñar una ventana nueva esta vez; dejé la que tenías.»

## Testing

- `popup-kit-validate.spec.ts`: slot counts, banned tags/attributes/URLs, CSS scoping and bans, words-outside-slots limit, size limits.
- `source-store-edit.spec.ts`: redesign / photo / undo ops.
- Live: 3 new stores on different templates — screenshots at 1280 and 390 of each popup; the three must differ in composition and all
  show a photo; signup still submits in a demo-free store (form posts to `subscribe`).

## Out of scope

Popup timing and triggers, A/B tests of popups, rich animation beyond an entrance, popups other than the signup one.
