# Wix-style Plantillas — design

Date: 2026-09-28. Status: design approved by the owner in conversation (2026-09-28); this written spec awaits the
owner's review.

Owner's request: "i dont like some of the templates lets build other templates", "i want them more like modern they
look like the same", then, after browsing Wix's eCommerce gallery together (wix.com/website/templates/html/online-store,
pages 1–2, the "Wix Harmony" set): "i want exactly like those in wix look" and "i like almost all of them i want that
type of design, i want like 20 or more of those designs".

## 1. Why today's 30 look alike (from the code, 2026-09-28)

- Every template is four files (`Shell`, `home`, `product`, `checkout`); home pages average ~66 lines (1,977 in total).
- Every home runs the same recipe: hero (kicker, display title, lead, button) → product grid with a head → one or two
  extra sections. Only colors, fonts and photos change.
- 29 of 30 use the same two motions (`Parallax`, `Reveal`).
- The kit supports template-owned cart, "added" notice and checkout review (`CartTemplate`, `AddedTemplate`,
  `ReviewTemplate` in `packages/storefront-kit/kit/ui.tsx`); 0 of 30 use them, so every store has the same cart.

There is no cap on the number of templates. The "40" limits in `packages/store-templates/index.js:10,20` are the
maximum length of a template id and name.

## 2. Goal and success criteria

24 new Plantillas with the look and polish of Wix's Harmony eCommerce templates: real-brand wordmarks, large
professional photography, confident headlines, varied hero compositions (split, type-over-photo, product card
collage, oversized wordmark), category tiles, colored announcement bars, full footers.

Success:
1. Side by side with its Wix reference, each template reads as the same level of polish.
2. No two new templates share a home section sequence, header style, product page layout or cart.
3. Applying any new template to a store with real products yields a working store end to end (browse → product →
   cart → checkout) on phone and desktop.
4. The owner can hide old templates from the gallery without breaking stores built from them.

## 3. Originality rule (not copies)

Wix templates, their text and their photos are Wix's copyrighted work, licensed only for use on Wix. Each new
template takes the **feel** of one reference — its hero composition, typographic mood, palette temperature, section
rhythm — and is otherwise original:

- Own name (Spanish), own wordmark treatment, own Spanish copy written for a Bolivian store, prices in Bs.
- Own photography generated with Higgsfield. No Wix image, text, logo or icon is downloaded, traced or reused.
- Fonts only from the kit's bundled OFL fonts. Colors chosen per template, never sampled wholesale from a reference.
- Generic layout patterns (split hero, big wordmark, category tiles, announcement bar) are fair to use.

## 4. The 24 templates

| # | Id | Category | Reference (Wix) | Store it demos |
|---|---|---|---|---|
| 1 | bolso | moda | Accessories Store (Colorful) "Tote" | Printed tote bags |
| 2 | sastre | moda | Fashion Store (Clean) | Tailored womenswear |
| 3 | lente | moda | Eyewear Store (Trendy) "Zilo Optics" | Sunglasses and frames |
| 4 | suela | moda | Shoe Store (Urban) "Concrete Pulse" | Sneakers and casual shoes |
| 5 | perla | moda | Jewelry Store (Luxurious) "Érice" | Pearl and gold jewelry |
| 6 | hora | moda | Watch Store (Solid) "Vesper Caliber" | Watches |
| 7 | estampa | moda | T-Shirt Store (Urban) | Graphic tees / streetwear |
| 8 | brote | hogar | Home Goods Store (Organic) "Re.vert" | Sustainable home essentials |
| 9 | regalo | hogar | Gift Shop (Pastel) "JSY" | Gifts and candles |
| 10 | manta | hogar | Home Goods Store (Cosy) "Umbui" | Home textiles |
| 11 | maceta | hogar | Plant Store (Green) "Sprout" | Plants and pots |
| 12 | telar | hogar | Home Goods Store (Cosy) "Warmthwoven" | Handmade slow-living objects |
| 13 | granja | comida | Farm (Rustic) "Lewis Chicken Farm" | Farm eggs and produce |
| 14 | voltio | comida | Energy Drinks Store (Gradient) "Zelcon" | Canned drinks |
| 15 | helado | comida | Ice Cream Shop (Pastel) "Gelato" | Ice cream parlour |
| 16 | rubor | belleza | Beauty Store (Bold) "dreama." | Skincare |
| 17 | rocio | belleza | Beauty Shop (Radiant) "Noelle" | Makeup |
| 18 | tinta | libros | Writer (Creative) "Malen Vosse" | An author selling her books |
| 19 | vinilo | libros | Secondhand Book and Record Store (Cosy) | Used books and records |
| 20 | colita | mascotas | Pet Supply Store (Welcoming) "Magora" | Pet supplies |
| 21 | blandito | ninos | Toy Store (Playful) "Squishy Sandbox" | Soft toys |
| 22 | papel | arte | Stationery Store (Colorful) "Lou Paperi" | Stationery and wrapping paper |
| 23 | enchufe | tecnologia | Electronics Store (Business) "Jauter" | Gadgets and accessories |
| 24 | motor | motor (new) | Auto Parts Store (Dark) | Auto parts |

No id collides with the existing 30. Sports and services are not covered in this set; the owner may swap any row
before its batch starts.

### Batches (6 each, mixed categories so each batch is reviewable on its own)

1. bolso, brote, granja, rubor, colita, enchufe
2. sastre, regalo, voltio, rocio, vinilo, papel
3. lente, suela, manta, helado, tinta, blandito
4. perla, hora, estampa, maceta, telar, motor

## 5. What each template contains

Same package format as today (`packages/store-templates/templates/<id>/`: `template.json`, `components/**/*.tsx`,
`styles/globals.css`, `demo/*.jpg`), so the API apply flow, the Studio gallery and YAPI keep working unchanged.

Per template:
- **Shell:** announcement bar, header in the style of its reference (centered wordmark, left logo + center nav,
  boxed/floating nav bar, etc.), full footer (link columns, newsletter, payment note).
- **Home:** 6–9 sections in a sequence unique to the template, drawn from: hero (type per reference), category tiles,
  best sellers / product grid or rail, featured product, brand story, lookbook / gallery, reviews, FAQ, newsletter,
  trust strip. Expected size roughly 3–4× today's homes.
- **Product page:** its own `ProductPageTemplate` layout (gallery style, info column, accordions or tabs).
- **Cart, "added" notice, checkout review:** its own `CartTemplate`, `CartLineTemplate`, `AddedTemplate`,
  `ReviewTemplate`, styled to match. Kit logic (prices, quantities, payment) stays in the kit.
- **Checkout page:** styled to the template, same kit checkout.
- **Motion:** calm, Wix-like: `Reveal` fades, hover zoom on cards, one optional `Parallax`. No new kit effects.
- **Photos:** ~6 demo photos (hero, products, lifestyle, detail) generated with Higgsfield in the reference's
  photographic mood, each ≤ 600 KB (existing validator rule). When a merchant applies the template, their own photos,
  logo and store name replace them, as today.
- **Mobile:** every section designed for phone width first; the reference's desktop composition adapts rather than
  shrinks.

## 6. Registry changes

1. **`motor` category.** Add to `TEMPLATE_CATEGORIES` (`packages/store-templates/index.js`), the `TemplateCategory`
   type (`index.d.ts`), the API label map (`apps/api/src/storefront-source/source-templates.ts:76`, "Autopartes y
   motor") and the Studio label map (`apps/merchant-studio/src/source-templates.ts:11`, "Motor").
2. **`hidden` flag.** Optional boolean in `template.json`. Hidden templates stay loadable by id (so nothing that
   references one breaks) but are left out of `listTemplates()` consumers that face merchants: the Studio gallery,
   YAPI template ranking (`source-template-ranking.ts`) and the agent's template tools. The owner decides which old
   templates to hide after each batch; hiding is a one-line manifest change.
3. **Look-alike test.** A registry test that fails when two templates share the same home section sequence (the
   ordered list of top-level `<section id>` / section component names in `home.tsx`), or when a new template has no
   template-owned cart. Existing 30 are exempt from the cart rule.

## 7. Quality gate (per batch)

1. `node --test packages/store-templates/test/*.test.mjs` passes (validator, look-alike test).
2. API template specs pass (`source-templates*.spec.ts`).
3. Browser QA: each template applied to a dev store and viewed at 390 px and 1440 px next to its Wix reference;
   buy flow run through product → cart → checkout; no console errors.
4. Higgsfield credit balance checked before generating the batch's photos.
5. Owner reviews the batch and names any old templates to hide.

## 8. Out of scope

- New kit motion primitives (dropped with the move from "bold/experimental" to the Wix look).
- PedidosYa Envíos as a courier: a separate project with its own spec. Note for that spec: the 2026-09-17 shipping
  carriers design excluded PedidosYa Envíos by product decision, so it starts by confirming that reversal.
- Retiring or deleting the old 30 templates' files.
