# Personalizador — design (2026-11-09)

**Owner:** «ese product card me gustaba mucho, como se pudiera replicar en algunas tiendas» → chose «Personalizador para todos» →
approved the examples page («i like it like that what you have put in the browser … do those changes»):
https://claude.ai/artifact/6DBZT2AALGgWK1JY8jRMFU (saved in `examples/personalizador-2026-11-09/`).

## What it is

The Oct-27 «Marco» module look (packages/store-templates/templates/mesa/components/modules.tsx `FramePicker`) as a section of
today's section library: a big panel in the store's colours with the product photo on a stage, and beside it the product's own
choices — colour circles, pills for sizes/flavours —, the price, a quantity stepper and one big pill button.

## Rules (the four boxes on the examples page)

1. **When:** YAPI adds it only when a product has real options (≥ 2 variants in valid option groups, the kit's `optionGroups`).
   Once per store. The product chosen is the one with the most photographed variants (ties: the first).
2. **What:** only the product's real data — options, a photo per option when the variant has one, price (with its discount),
   stock («¡Quedan N!» at 5 or fewer, a sold-out choice disabled). Nothing invented. No options → no section (the kit hides it).
3. **Frame:** the framed look (wood/black/white/gold border on a wall, the photo matted) only in art stores (láminas, cuadros,
   arte, prints, pósters, ilustraciones). In an art store the frame colour follows a «Marco» option when the product has one;
   otherwise natural wood. Size choices widen the frame as in the original. Other stores show the photo alone on the stage.
4. **Button:** «Añadir al carrito» through the kit's own add path (stock, cart, added notice, analytics). A WhatsApp store
   (`checkoutMode: 'whatsapp'`) shows «Pedir por WhatsApp», opening wa.me with the message written from the choices.

## Parts

- **Kit** `commerce-src/product/personalizer.js` draws into `[data-pagosya-personalizer][data-product-id]` (+ `data-look`),
  with its own injected style in the store's tokens; hides the host's section when the product has no options.
- **Template** Esencial `library.tsx`: `ProductPersonalizer` renders the band, an optional eyebrow/title and the host.
- **API** section library: catalogue entry `product-personalizer` (role products, needs `options`), facts gain `optioned`
  (id, name, groups) and `art`; validation forces the product to `optioned` and the look to frame/stage by `art`; a blocker says
  «ninguno de tus productos tiene opciones (colores, tallas o sabores)». `withPersonalizer(layout, facts)` adds it after the main
  product grid (else before the closing section) on every library build of an eligible store.
- **Existing stores:** their `library.tsx` is a copy from their build. A refill whose layout has the section brings the renderer
  into a copy that lacks it (inserted before `const SECTIONS`, entry added to the map); a copy without that anchor is left alone.

## Out of scope

Prices per frame/size that the product does not carry; a new option editor; the product page buy box (unchanged).
