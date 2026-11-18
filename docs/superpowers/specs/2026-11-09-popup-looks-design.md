# Popup looks — design

Owner 2026-11-09, after the AI-designed popups went live on three test stores: the AI popups still looked alike (two of three were
photo-left splits), DooBoo's had unreadable 9–11px text, and the catalogue toolbar looks the same in every store. Decision («a»): a set
of hand-built looks, one picked per store by YAPI, for the popup first and the catalogue toolbar next (its own spec).

## Decisions (owner)

- **Six looks**, all built: Clásica, Portada, Cartel, Postal, Revista, Etiqueta (mockups: ~/Desktop/popup-looks, drawn 2026-11-09 with
  the real retention.js and the test stores' photos).
- **Short form in every look:** email + button on one line, consent under it; name and phone leave the popup.
- **Replace the AI-designed popups:** the model step is switched off; its slots, render check, Studio preview and YAPI edits are reused.
- **Every store now:** all stores with the popup on get a look at once (spread evenly); new stores get one after their first build.

## 1. The looks

Each look is an HTML fragment with the platform slots (`pya-photo`, `pya-title`, `pya-text`, `pya-form`, `pya-code`) and CSS under
`[data-popup-kit]`, using the store's tokens (`--store-background`, `--store-foreground`, `--store-accent`, `--store-accent-foreground`,
`--store-heading-font`, `--store-body-font`, `--store-radius`) with fallbacks. Type: title ≥ 34px desktop, text 16px, labels 12–13px,
nothing under 12px; no words on the photo.

| id | Desktop | Phone (≤ 700px) |
|---|---|---|
| `clasica` | photo one half, words + form on a flat panel | photo band 190px, panel below |
| `portada` | photo band 300px on top, centred bold uppercase title | band 200px |
| `cartel` | photo fills the popup, a solid card holds words + form on the right | photo 200px, card below |
| `postal` | thin border, dashed divider, photo framed with a «stamp» (store initial), words beside | photo 170px on top |
| `revista` | big title on the store accent colour beside an arch-cropped photo; text + form below | title, then photo 180px |
| `etiqueta` | centred: round photo 220px, kicker, title, text, form | round photo 160px |

The kicker (small line over the title) is the store name; Postal says «Carta de {store}». The looks live in the kit
(`packages/storefront-kit/kit/retention.js`, a `POPUP_LOOKS` table), so improving a look improves every store wearing it.

## 2. Storage and drawing

- `StoreRetention.settings.popupLook`: one of the six ids. `settings.popupPhoto`: optional upload path (`/v1/uploads/…`).
  `settings.popupLookPrevious`: the look before the last change (one step of undo). JSON keys, no migration; kept by Ajustes saves
  (added to `KEPT_SETTINGS`).
- `publicRetentionSettings` returns `popupLook` and `popupPhoto` (no longer `popupKit`).
- `retention.js`: a store with a known `popupLook` draws that look; the photo is `popupPhoto`, else `signupVisual.imageUrl` (banner,
  then first product photo); upload paths resolve against `config.apiBaseUrl` (as the kit photo does today). Unknown id or no photo →
  today's built-in layout (with the short form). Hosted stores: `secureFields` still removes the email/consent fields; the button stays.
- Short form: the platform form drops the name and phone fields; email + submit share one row (stacked under 480px), consent below.
  The subscribe request is unchanged (name/phone were optional).
- A store without `popupLook` (before the backfill reaches it) gets `lookFor(slug)`: a stable pick from the slug's hash, so it never
  shows the old layout in between.

## 3. Picking

- `pickPopupLook(storeId, avoid?)` (API, pure): stable hash of the store id over the six ids, skipping `avoid`. No model call.
- **New stores:** `designAfterBuild` (the existing first-build hook) sets `popupLook` and posts «Elegí un estilo para tu ventana de
  suscripción: {Nombre}. Mírala en Mi tienda › Marketing con «Ver ventana de suscripción».»
- **Existing stores:** a one-time backfill (`scripts/popup-looks-backfill.ts`) sets `popupLook` for every store whose settings have
  none; it never touches a store that already has one. Dry run by default; `--apply` writes. Backs up first per the dev-DB rule.

## 4. YAPI chat (`source-store-edit.ts`, part `popup`)

- `redesign` («rediseña la ventana», «cambia el estilo de la ventana»): the next look for this store (never the current one).
- `style` with value a look id («ventana tipo postal», «estilo revista»): that look.
- `photo` (f0…): sets `popupPhoto`. `undo`: swaps `popupLook` with `popupLookPrevious`.
- Replies name the look: «tu ventana de suscripción ahora tiene el estilo Postal». Instant (no background job, no credits).

## 5. Studio

«Mi tienda › Marketing» gets «Estilo de la ventana»: six choices with their names, saved with the other popup settings, beside
«Ver ventana de suscripción» (which draws the chosen look, unsaved choice included).

## 6. Removed / switched off

- The AI designer path: `PopupKitService.design` and the redesign job no longer call the model; `designPopupKit`, the kit validator
  and `popupKit` rendering in retention.js are deleted (git keeps them). The render harness and `checkPopupRender` stay — they now test
  the looks.
- Saved `popupKit`/`popupKitPrevious` rows are ignored (left in place; harmless).

## Testing

- `popup-looks.spec.ts`: each of the six looks rendered by the real retention.js at 1280×800 and 390×844 with a test photo passes
  `checkPopupRender` (form visible, photo ≥ 120px, no text under 12px, no words on the photo, title contrast, no sideways scroll),
  also on a hosted store and with a dark and a light store palette.
- `pickPopupLook`: stable, evenly spread over 600 ids, never returns `avoid`.
- Quick-edit spec: redesign / style / photo / undo ops.
- `retention-popup.spec.ts`: Ajustes keeps the new keys; public settings carry `popupLook` / `popupPhoto`.
- Live: the three test stores get three different looks; screenshots at 1280 and 390; a chat «ventana tipo cartel»; the backfill dry
  run counts the stores it would change.

## Out of scope

The catalogue toolbar looks (next spec), popup timing, more than six looks, per-store colour overrides for the popup.
