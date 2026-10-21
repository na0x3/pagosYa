# Colour picker with colour photos — design

2026-10-21 · approved in chat 2026-10-21 (owner: «a color picker, and when touching a color it changes to a version of
that color of the user provided pictures»; source: both the merchant's own per-colour photos and AI versions).

## What the shopper gets

On every product page with a colour option, the colour row (bars on the fashion page, round swatches elsewhere, with the
colour's name) switches the gallery to that colour's photos. Cards with colour bars (fashion card) preview the colour's
first photo on hover. This switching exists today when a variant carries its own photos (`variant.imageUrls`); the work
here is giving every colour photos and a swatch.

## Where the photos come from (merchant side)

1. **The merchant's own photos, matched by YAPI.** In the Studio product editor, «Fotos por color»: the merchant drops in
   several photos at once; one vision call matches each photo to a colour value of that product (by the garment's colour);
   the editor shows the proposed grouping, the merchant can drag a photo to another colour or leave it unassigned, then
   saves. Saved photos land on every variant of that colour (`imageUrls`), as today's per-variant photos do.
2. **AI colour versions for colours without a photo.** Beside each colour with no photo: «Crear fotos en este color». YAPI
   takes up to 3 of the product's own photos and asks the image model (the existing product-scenes images/edits path,
   `app.openAi.imageModel`) for the same garment, pose, background and light in the new colour. Before generating, the
   editor states how many images it will make and what they cost (the usage meter's credits). Results arrive as drafts
   marked «Creada con IA»; nothing reaches the store until the merchant approves each one (approve, regenerate, discard).
   Approved images are saved like the merchant's own photos.
3. **In chat.** «Crea las fotos en azul y verde del Vestido Cala» starts the same AI flow; «estas fotos son del color
   negro» with attachments runs the matching. YAPI replies with the drafts to approve in the editor.

## Swatches for every colour

The kit's `swatchColor` knows a fixed table of names. A colour value it does not know («Marfil», «Champán», «Arena»)
gets a hex: YAPI suggests one when the colour value is created (from the name, or from the matched photo's dominant
colour), the merchant can change it in the editor, and it is stored with the option value (`options[].hex`, read by the
kit before the name table). Bars and swatches then show for every colour.

## Rules

- AI images are never published without the merchant's approval, never replace a merchant photo, and are labelled in the
  editor; a failed or refused generation leaves the colour as it was.
- Credits: one confirm per batch, showing the count; the AI-usage meter records each image.
- A garment whose colour the model changes badly (texture, print) can be regenerated or discarded; prints and patterns
  are offered with a warning («los estampados pueden cambiar»).
- Accessibility: swatches keep their colour name for screen readers; the chosen one is `aria-pressed`.

## Where it lives

- API: a colour-photo service beside `product-content/product-scenes.service.ts` (match: vision call; recolour:
  images/edits), endpoints under the product-content controller, drafts stored as media assets with a pending flag,
  approve endpoint writing variant `imageUrls`; option `hex` accepted by the product DTO.
- Studio: product editor «Fotos por color» panel (match + per-colour AI button + approval).
- Kit: `swatchColor` reads `option.hex` first; the existing colour → gallery switch is reused.
- YAPI chat: two intents routed to the same service.

## Testing

- API: matching assigns photos to colour values (mocked vision answer), never to a value the product lacks; recolour
  creates drafts only, approval writes `imageUrls`, discard deletes the draft; cost shown equals images requested; hex
  stored and read.
- Kit jsdom: `option.hex` gives a swatch and a bar for an unknown name; colour click swaps the gallery to that colour's
  photos.
- Browser: NOA VARGAS with one product recoloured (two colours, approved drafts) — tap a colour on the page and on the
  card bars.

## Out of scope

Recolouring videos, 3D/AR try-on, generating new angles that the merchant never photographed, automatic recolouring
without approval.
