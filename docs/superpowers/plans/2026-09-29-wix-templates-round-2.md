# Wix-style Plantillas, Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 25 more Plantillas — 24 from the owner's Wix Harmony screenshots plus a constructora (`obra`) — and a `construccion` category.

**Architecture:** Identical to round 1: templates in `packages/store-templates/templates/<id>/`, applied through the existing API/Studio flow. The registry gains one category (`construccion`); everything else is new template folders. The registry's look-alike and commerce-slot tests (built in round 1) gate each template.

**Tech Stack:** React TSX compiled by the storefront kit, plain CSS, Node test runner (`node --test`), Jest + Playwright sandbox (`apps/api`), Higgsfield MCP for demo photos, macOS `sips`.

**Spec:** `docs/superpowers/specs/2026-09-29-wix-templates-round-2-design.md` (extends `docs/superpowers/specs/2026-09-28-wix-style-templates-design.md`).

**Round-1 plan is part of this plan.** Read `docs/superpowers/plans/2026-09-28-wix-style-templates.md` lines 57–303 (the *Template Recipe* R1–R10) before the first template task. Its recipe (`template.json`, `Shell.tsx`, `home.tsx`, `product.tsx`, `checkout.tsx`, `globals.css` rules, per-template gate, batch QA) applies **verbatim** to every task here; the tasks below give only each template's brief plus what differs (photo budget, orders). Batch 1 of round 1 (`bolso` … `enchufe`, already in `packages/store-templates/templates/`) is the working example of the finished result.

**Branch:** `feature/wix-templates` (this worktree). Do not push.

## Global Constraints

- Originality: each template takes the *feel* of its Wix reference only. Never download, trace or reuse a Wix image, text, logo or icon. Own Spanish name, own Spanish copy for a Bolivian store, prices in Bs.
- Fonts: only kit fonts (`packages/storefront-kit/kit/fonts/`: anton, bebas-neue, big-shoulders-display, bitter, bodoni-moda, bricolage, chivo, dm-serif-display, epilogue, familjen-grotesk, figtree, fraunces, instrument, instrument-serif, libre-caslon-text, lora, manrope, newsreader, nunito, oswald, outfit, playfair-display, rubik, shrikhand, sora, space-grotesk, space-mono, syne, unbounded, young-serif), declared as `dna.display` / `dna.text`.
- DNA values: only the values listed in round-1 R1 (`case`, `radius`, `border`, `button`, `hover`, `press`, `motion`, `cart`, `added`, `card`, `frame`); an unknown value fails `assembleTemplateRevision`.
- Demo photos: generated with Higgsfield, JPEG, each ≤ 600 KB (`DEMO_MAX_BYTES` = 614400); six per template (`p1`–`p4` products, two scene photos).
- Home: 6–9 top-level `<section id="…">` inside `<main id="contenido">`, exactly one `<h1>`, first section is the hero, and **no two templates share the same section-id sequence** (look-alike test).
- Motion: calm. `Reveal` entrances, CSS hover zoom, one `Parallax` (`mobileStrength` ≥ 20). No new kit primitives.
- Every template owns `CartTemplate`, `CartLineTemplate`, `AddedTemplate`, `ReviewTemplate`, `ProductPageTemplate` with all required slots.
- CSS: every class prefixed with the template's prefix; no rules aimed at `[data-pagosya-product…]` or `.product-detail__`.
- Manifest `order`: round 2 uses −300 … −276 (given per template) so it lists ahead of round 1's −240 … −190.
- Never run `prisma migrate`, `prisma db push`, `prisma migrate reset` or `prisma diff` against the dev database. This plan has no schema change.
- Do not touch `/Users/saramia/pagosYaWeb`. Do not push.

## Review Focus

1. **One product (or none) in a store applied to a new template** — rails, grids, before/after pairs and category tiles must not render broken empty boxes or sideways scroll. Pinned by the one-product check in every Batch QA task.
2. **Long Spanish names and four-digit Bs prices ("Bs 12.500,00") at 390 px** — titles clamp to two lines; prices stay on one line. Especially the ticker-heavy and giant-wordmark templates (`barrio`, `acuarela`, `trompo`, `pulp`). Pinned by the QA long-name check.
3. **Tall portrait merchant photos replacing demo photos** — every frame has a fixed `aspect-ratio` with `object-fit: cover`. Especially the blob/collage heroes (`alfar`, `historieta`, `retono`).
4. **`obra` with services that have no photo or a price of "Bs 0"** — service cards must still read (name + "Agregar"), and a store with no phone number must not render a dead WhatsApp button. Pinned by Task 2's task-specific tests.
5. **A new `construccion` category unknown to a consumer** (API label map, Studio label map, `index.d.ts`) — falling back to the raw id in the gallery chip. Pinned by Task 1's tests.

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/store-templates/index.js`, `index.d.ts` | `construccion` category (Task 1) |
| `packages/store-templates/test/registry.test.mjs` | Category test (Task 1) |
| `apps/api/src/storefront-source/source-templates.ts:76` | API business label for `construccion` |
| `apps/merchant-studio/src/source-templates.ts:11` | Studio gallery label; test in `source-templates.test.ts` |
| `packages/store-templates/templates/<id>/**` (25 new) | The templates |
| `apps/merchant-studio/public/plantillas/<id>.webp`, `<id>-mobile.webp` | Gallery previews (from the preview tool) |

---

## Round-2 differences to the recipe

- **R7 photo budget:** a batch is 5 templates × 6 = **30 images**. Balance on 2026-09-29: 329 credits. At the start of each batch call `mcp__claude_ai_higgsfield__balance`; **before the first batch** generate one test image and read the credit drop to get the per-image cost. If `30 × cost` exceeds the balance, stop and tell the owner (top-up or fewer images per template). Never generate past the balance.
- **R9 order:** the manifest `order` comes from the task's brief.
- **R10 hiding step:** ask the owner about hiding old templates only after batch A and after batch E; the middle batches skip that question.
- **Gallery previews** are made by the round-1 preview tool: `cd apps/api && CAPTURE_TEMPLATE_PREVIEWS=1 TEMPLATE_IDS=<id> npx jest source-templates-previews.tool`.

---

### Task 1: `construccion` category

**Files:**
- Modify: `packages/store-templates/index.js` (the `TEMPLATE_CATEGORIES` array, line 7)
- Modify: `packages/store-templates/index.d.ts` (line 1, `TemplateCategory`)
- Modify: `apps/api/src/storefront-source/source-templates.ts:76` (label map)
- Modify: `apps/merchant-studio/src/source-templates.ts:11` (label map)
- Test: `packages/store-templates/test/registry.test.mjs` (after the `motor` test, line 64), `apps/merchant-studio/src/source-templates.test.ts`

**Interfaces:**
- Produces: category id `construccion` accepted by the registry; label "Construcción" in the Studio gallery and "Construcción y obras" in the API business label.

- [ ] **Step 1: Write the failing tests**

In `packages/store-templates/test/registry.test.mjs`, directly after the `motor is a template category` test, add:

```js
test('construccion is a template category', () => {
  assert.ok(templates.TEMPLATE_CATEGORIES.includes('construccion'));
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'obras', { category: 'construccion' });
  assert.equal(templates.loadTemplates(root)[0].manifest.category, 'construccion');
});
```

This mirrors the `motor` test directly above it (same `mkdtempSync`/`tmpdir`/`writeTemplate` helpers already imported in that file).

In `apps/merchant-studio/src/source-templates.test.ts` add inside `describe('gallery look', …)`:

```ts
  it('labels the construction category', () => {
    const construction = [{ id: 'obra', name: 'Obra', category: 'construccion', description: 'Constructora.', tags: [], order: -300 }];
    const root = document.createElement('div');
    root.innerHTML = renderTemplateGallery(construction, { category: '', selected: '', busy: false, error: '', hasSite: true, previewBase: '/' });
    expect(root.querySelector('[data-template-category="construccion"]')!.textContent).toContain('Construcción');
  });
```

- [ ] **Step 2: Run to see them fail**

```bash
cd /Users/saramia/pagosYa/.claude/worktrees/wix-templates/packages/store-templates && node --test test/registry.test.mjs
cd /Users/saramia/pagosYa/.claude/worktrees/wix-templates/apps/merchant-studio && npx vitest run src/source-templates.test.ts
```
Expected: the registry test fails (`construccion` not included); the Studio test fails (chip text is the raw id `construccion`).

- [ ] **Step 3: Implement**

- `index.js` line 7: append `'construccion'` after `'motor'` in the frozen array.
- `index.d.ts` line 1: add `| 'construccion'` to the union.
- `apps/api/src/storefront-source/source-templates.ts:76`: add `construccion: 'Construcción y obras',` next to `motor:`.
- `apps/merchant-studio/src/source-templates.ts:11`: add `construccion: 'Construcción',` next to `motor: 'Motor'`.

- [ ] **Step 4: Run tests to see them pass**

```bash
cd /Users/saramia/pagosYa/.claude/worktrees/wix-templates/packages/store-templates && node --test test/*.test.mjs
cd /Users/saramia/pagosYa/.claude/worktrees/wix-templates/apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p .
cd /Users/saramia/pagosYa/.claude/worktrees/wix-templates/apps/api && npx jest src/storefront-source/source-templates
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/index.js packages/store-templates/index.d.ts packages/store-templates/test/registry.test.mjs apps/api/src/storefront-source/source-templates.ts apps/merchant-studio/src/source-templates.ts apps/merchant-studio/src/source-templates.test.ts
git commit -m "feat(templates): construccion category"
```

---

## Batch A — obra, historieta, plata, sendero, trompo

Before Task 2: R7 steps 1–2 (balance, model recommendation) and the one-image cost test.

### Task 2: Plantilla "Obra" (constructora, no Wix reference)

**Files:** Create `packages/store-templates/templates/obra/**`; previews `apps/merchant-studio/public/plantillas/obra{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Obra — constructora selling service packages, safety yellow on charcoal`

**Brief:**
- id `obra` · name "Obra" · category `construccion` · order −300 · prefix `ob`
- Description: "Constructora: paquetes de servicio con precio, proyectos con antes y después, y un botón para cotizar tu obra."
- Tags: construcción, remodelación, servicios, cotizar
- Fonts: display `oswald`, text `chivo`
- Palette: charcoal #1c1d1f, concrete #d9d8d4, paper #f3f2ee, safety yellow #f2c200, steel #5c6670
- DNA: case upper · radius none · border bold · button block · hover invert · press sink · motion snappy · cart drawer · added inline · card still · frame bleed
- Header: charcoal bar; store name in caps left with a small yellow square; nav Servicios, Proyectos, Proceso, Contacto; cart right; a yellow "Cotizar" button.
- Home sections (ids in order): `portada` (h1, project photo full-bleed under a charcoal gradient, huge caps headline "Construimos lo que imaginas", yellow "Cotizar mi obra" + outline "Ver servicios") · `servicios` (catalog as service cards: photo, name, price "desde Bs …", yellow "Agregar") · `cifras` (four numbers on concrete: años, obras, m² construidos, familias) · `proyectos` (three before/after pairs: `antes` and `despues` photos side by side with a caption) · `proceso` (four numbered steps: Visita, Presupuesto, Obra, Entrega) · `resenas` (three client quotes with first name and barrio) · `cotizar` (yellow band: "¿Listo para empezar?" + button).
- "Cotizar" behaviour: the header and hero buttons scroll to `#servicios`. Add a WhatsApp variant **only if the store config exposes a phone**: read how `packages/storefront-kit/kit/commerce.js` builds `checkoutMode === 'whatsapp'` links (around line 986) and `window.PAGOSYA_CONFIG.store`; if a phone/`whatsapp` field exists there, render `<a href="https://wa.me/<digits>">` in `cotizar`; if not, render only the scroll button. Never render a WhatsApp anchor with an empty number.
- Product page: service page — gallery left, right: category, name, price, buy, an "Incluye" list (from `info`), `delivery` note "Coordinamos la visita en 48 h"; related services below.
- Cart: right drawer on paper, yellow total bar, square thumbnails. Added: inline strip under the buy button.
- Photos (slots `p1, p2, p3, p4, antes, despues`; `p1`–`p4` 4:3 service photos, `antes`/`despues` 3:2 scenes): `p1` architect's hands over a house floor plan with a yellow pencil and tape measure on a desk · `p2` worker in yellow helmet and vest inspecting a concrete slab with a level · `p3` half-finished brick wall with mason's trowel on a sunny building site · `p4` freshly finished modern kitchen remodel, neutral tones, empty · `antes` unfinished grey living room with bare concrete walls and exposed wires · `despues` the same room finished: white walls, wooden floor, warm lamps.
- Task-specific tests (add to the task's gate): render `obra`'s home with a store that has **no phone** and assert the output contains no `wa.me`; render with a service priced 0 and confirm the card still shows the name and "Agregar".

### Task 3: Plantilla "Historieta" (ref. Wix "Comics Store (Retro)" — "Ben's Comics")

**Files:** Create `packages/store-templates/templates/historieta/**`; previews `…/plantillas/historieta{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Historieta — comic-book shop, halftone dots and a speech-bubble story panel`

**Brief:**
- id `historieta` · name "Historieta" · category `libros` · order −299 · prefix `hi`
- Description: "Tienda de cómics: puntos de semitono, un panel de historia con globo de texto y un naranja rojizo con botón amarillo."
- Tags: cómics, historietas, coleccionables, retro
- Fonts: display `anton`, text `nunito`
- Palette: brick orange #d9573f, cream #fbf1dc, ink #1a1614, yellow #f7d13a, dot tan #e8d4b0
- DNA: case upper · radius soft · border bold · button sticker · hover lift · press pop · motion playful · cart overlay · added stamp · card tilt · frame inset
- Header: cream bar with a thick ink bottom border; chunky comic-style store name in a bordered box left; nav pills "Tienda ▾ Nosotros Contacto"; cart in a black circle.
- Home sections: `portada` (h1; left `p1` cover art in a bordered panel, right a cream speech-bubble box with halftone-dot shading: "El hombre detrás de los cómics" and a short paragraph; yellow sticker button "Comprar ahora ↗") · `novedades` (catalog rail with tilted covers) · `historia` (three comic panels in a row with captions) · `series` (four category tiles: Superhéroes, Aventura, Humor, Clásicos) · `coleccion` (large featured product on a dot pattern with badge "Edición limitada") · `voces` (two speech-bubble quotes) · `suscripcion` (yellow band "Un cómic nuevo cada mes" + email).
- Product page: cover left in a thick-bordered frame with a corner "NUEVO" sticker; right: title in display, price in a burst shape, buy, `info` as a "Ficha" box, related as "Te puede gustar".
- Cart: overlay panel cream with comic-panel borders; lines with tilted cover; total in a yellow burst. Added: stamp "¡Al carrito!".
- Photos (slots `p1, p2, p3, p4, tienda, lectura`): `p1`–`p4` (3:4): original vintage-style comic book covers on a cream surface, painted illustration, no text, fictional heroes and robots, bold flat colours · `tienda` (4:3): smiling shopkeeper in a green apron holding a stack of comics inside a cosy comic shop · `lectura` (4:3): teenager sitting on a shop floor reading a comic, shelves behind.

### Task 4: Plantilla "Plata" (ref. Wix "Jewelry Store (Clean)" — "Velaura")

**Files:** Create `packages/store-templates/templates/plata/**`; previews `…/plantillas/plata{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Plata — silver and bead jewelry, black-and-white editorial split`

**Brief:**
- id `plata` · name "Plata" · category `moda` · order −298 · prefix `pl`
- Description: "Joyería de plata y cuentas: editorial en blanco y negro, serif ligera y una tarjetita de oferta sobre la foto."
- Tags: joyería, plata, minimalista, editorial
- Fonts: display `newsreader`, text `manrope`
- Palette: white #ffffff, ink #141414, stone #efeeec, garnet #7a2333, silver #b9bcc0
- DNA: case none · radius none · border hairline · button underline · hover underline-grow · press none · motion calm · cart drawer · added toast · card still · frame bleed
- Header: white; tiny serif wordmark left; small nav centre; account, cart right; hairline below.
- Home sections: `portada` (h1; left half: large black-and-white model portrait `p1` with "Hecho a la medida de ti" in light serif top-left; right half: a colour photo `p2` of beads with a small white card "Rebajas de media temporada" bottom-right) · `piezas` (catalog, 4 columns, quiet cards) · `coleccion` (full-width black-and-white `p3` with an overlaid serif line and text link) · `materiales` (three columns: Plata 925, Cuentas de vidrio, Empaque de regalo) · `lookbook` (asymmetric grid of `p4` and `estudio`) · `cuidado` (short care guide with an accordion of three items) · `boletin` (stone band, email + underline button).
- Product page: tall gallery left (thumbnails vertical), right: light serif title, small price, buy as an outlined button, `info` as an accordion (Detalles, Cuidado, Envío).
- Cart: right drawer white, hairline separators, tiny thumbnails; total serif. Added: toast top-right.
- Photos (slots `p1, p2, p3, p4, estudio, detalle`): `p1` (4:5) black-and-white portrait of a woman in profile wearing a sculptural silver earring, soft studio light · `p2` (4:5) macro of a handmade red bead bracelet and a silver ring on pale stone · `p3` (16:9) black-and-white hands holding a silver ring near a shoulder · `p4` (4:5) three silver rings on a plaster block · `estudio` (3:2) jeweller's bench with tools and silver wire, natural light · `detalle` (1:1) close-up of a silver chain on linen.

### Task 5: Plantilla "Sendero" (ref. Wix "Backpack Store (Rugged)" — "Iron Cliff")

**Files:** Create `packages/store-templates/templates/sendero/**`; previews `…/plantillas/sendero{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Sendero — packs and trail gear, misty forest photo with a product side panel`

**Brief:**
- id `sendero` · name "Sendero" · category `deporte` · order −297 · prefix `se`
- Description: "Mochilas y equipo de montaña: foto de bosque con niebla, panel lateral con el producto y precio, y una cinta oscura arriba."
- Tags: mochilas, montaña, trekking, resistente
- Fonts: display `bricolage`, text `chivo`
- Palette: bone #f2f0ec, ink #141513, moss #55603f, olive #2f3a2a, ember #c7642b
- DNA: case none · radius none · border hairline · button block · hover fill · press sink · motion snappy · cart sheet · added ribbon · card zoom · frame bleed
- Header: dark ticker on top ("Envío gratis desde Bs 500 · Garantía de por vida"); below, bone header with small caps store name left, nav centre, account/cart right.
- Home sections: `portada` (h1; left 65% misty forest photo `p1` with a person carrying a green pack, title "Hecha para lo salvaje" and a "Ver mochilas" button; right 35% panel: product `p2` on grey with name, tag NUEVO, price, two colour dots) · `equipo` (catalog, 3 columns with large photos) · `expedicion` (full-bleed `p3` with a parallax and three feature captions: Impermeable, Costuras selladas, Garantía) · `categorias` (Mochilas, Bolsos, Accesorios as three tall tiles) · `especificaciones` (a spec table for the featured pack) · `resenas` (two trail quotes with the route name) · `boletin` (dark band, email).
- Product page: large gallery left, right column: title, price, colour swatches (variants), buy, `info` as a spec list, `delivery`.
- Cart: bottom sheet, dark header strip, olive action. Added: ribbon across the top.
- Photos (slots `p1, p2, p3, p4, ruta, detalle`): `p1` (3:2) person from behind in a rain jacket wearing an olive roll-top backpack in a misty pine forest · `p2` (4:5) olive roll-top backpack on light grey studio background · `p3` (16:9) hiker resting on a rock ridge above clouds at dawn with a pack beside · `p4` (4:5) black hip belt bag on grey · `ruta` (3:2) two hikers on a trail in the Andes, dry grass and mountains · `detalle` (1:1) macro of a backpack buckle and webbing.

### Task 6: Plantilla "Trompo" (ref. Wix "Toy Store (Retro)" — "Mochi&Oak")

**Files:** Create `packages/store-templates/templates/trompo/**`; previews `…/plantillas/trompo{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Trompo — wooden toys by age, giant black wordmark and colour-block cards`

**Brief:**
- id `trompo` · name "Trompo" · category `ninos` · order −296 · prefix `tr`
- Description: "Juguetes de madera por edad: nombre gigante en negro, tarjetas de colores por edad y un fondo crema."
- Tags: juguetes, madera, niños, por edad
- Fonts: display `unbounded`, text `nunito`
- Palette: cream #fbf6e3, ink #111111, teal #2f9d78, cobalt #2e6fd8, tangerine #f08a24, blush #f6c9c0
- DNA: case none · radius round · border bold · button pill · hover lift · press squash · motion playful · cart drawer · added bubble · card tilt · frame rounded
- Header: cream; small round store mark and "Ver todo · Nosotros · Contacto · Preguntas" left; cart count and account right; "Comprar por edad" black pill.
- Home sections: `portada` (h1 is the giant black store name across the full width; below it three colour-block cards teal/cobalt/tangerine, each with a toy photo `p1`–`p3`, an age badge "1–2 años", the toy name and a round add button) · `edades` (four age tiles 0–1, 1–2, 3–5, 6+ in pastel colours) · `juguetes` (catalog grid, rounded cards) · `madera` (split: `taller` photo and "Madera de la Chiquitania, pintura sin tóxicos") · `seguridad` (three round badges: Sin tóxicos, Sin piezas pequeñas, Lijado a mano) · `regalos` (blush band with a gift idea by budget) · `resenas` (two parent quotes) · `boletin`.
- Product page: big rounded photo, age badge, name, price, buy in a pill, `info` as three icon rows, related as "Otros para su edad".
- Cart: drawer cream with rounded lines and coloured quantity chips. Added: bubble pop.
- Photos (slots `p1, p2, p3, p4, taller, juego`): `p1` (4:5) painted wooden bunny toy on a teal card background · `p2` (4:5) wooden nesting doll on cobalt · `p3` (4:5) wooden peg figure and a black block on tangerine · `p4` (4:5) wooden stacking rings on cream · `taller` (3:2) craftsperson sanding a wooden toy in a bright workshop · `juego` (3:2) toddler playing with wooden toys on a rug.

### Task 7: Batch A QA and owner review

**Steps:** R10 for `obra, historieta, plata, sendero, trompo`; because this is the first round-2 batch, also ask the owner (b) which old templates to hide. Also run the `obra` no-phone and price-0 checks in a browser at 390 px.

---

## Batch B — pulp, barrio, galeria, visor, savia

Before Task 8: R7 steps 1–2 for the batch.

### Task 8: Plantilla "Pulp" (ref. Wix "Comics Store (Vintage)" — "Legends Live Forever")

**Files:** Create `packages/store-templates/templates/pulp/**`; previews `…/plantillas/pulp{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Pulp — vintage comics on yellow with a giant red slab headline`

**Brief:**
- id `pulp` · name "Pulp" · category `libros` · order −295 · prefix `pu`
- Description: "Cómics de colección: fondo amarillo, titular rojo gigante con serifa gruesa y ráfagas en zigzag."
- Tags: cómics, vintage, colección, pulp
- Fonts: display `bitter`, text `space-mono`
- Palette: butter #fbe98a, red #d4271e, ink #23130f, paper #fff8de, teal #1f6f6a
- DNA: case upper · radius none · border bold · button brutal · hover invert · press sink · motion snappy · cart overlay · added stamp · card zoom · frame inset
- Header: butter; small red badge logo centred above a thin serif nav (Inicio, La bóveda, Novedades, Tienda); account and cart right; red ticker above.
- Home sections: `portada` (h1: two-line giant red headline "Las leyendas nunca mueren" over yellow with zigzag bursts; below it `p1` cover art cropped in a bordered frame; corner ribbon "Colección exclusiva") · `boveda` (catalog as a shelf of covers, 4 columns, price in a red circle) · `epocas` (three columns by era: Años 40, Años 70, Años 90) · `raros` (featured rare issue on paper with a "Estado" grading list) · `cuidado` (how we store and ship comics, 3 icons) · `voces` (typewriter quotes) · `boletin`.
- Product page: cover in a thick red frame, right side in mono type: title, issue, condition, price, buy, `info` as a "Ficha técnica" table.
- Cart: overlay in paper with red borders. Added: stamp "AGREGADO".
- Photos (slots `p1, p2, p3, p4, estante, lupa`): `p1`–`p4` (3:4) original pulp-style illustrated covers on aged paper, hand-drawn hands, robots and rockets, limited red-yellow-teal palette, no text · `estante` (3:2) longbox shelves of comics in a warm shop · `lupa` (1:1) gloved hands sliding a comic into a protective sleeve.

### Task 9: Plantilla "Barrio" (ref. Wix "Clothing Store (Young)" — "Solasta")

**Files:** Create `packages/store-templates/templates/barrio/**`; previews `…/plantillas/barrio{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Barrio — streetwear drops, bracketed wordmark and boxed stacked text`

**Brief:**
- id `barrio` · name "Barrio" · category `moda` · order −294 · prefix `ba`
- Description: "Ropa urbana por lanzamientos: nombre entre corchetes, texto en cajas apiladas y acentos rojos."
- Tags: streetwear, urbano, lanzamientos, joven
- Fonts: display `space-grotesk`, text `space-mono`
- Palette: off-white #f4f3ef, black #0d0d0d, signal red #d63a24, concrete #c9c8c3, sage #93a58a
- DNA: case upper · radius none · border hairline · button brutal · hover invert · press pop · motion cinematic · cart drawer · added ribbon · card zoom · frame bleed
- Header: black running ticker ("Drop 03 · Usa el código BARRIO10 · Envíos a todo el país"); off-white bar: mono links left, red account, black cart right; red "Nuevos drops" block.
- Home sections: `portada` (h1: the store name in brackets, huge, top; below, three columns: stacked white text boxes "Cortes frescos / y declaraciones / de calle" left, model `p1` centre on concrete, "DROP 03 // EDICIÓN LIMITADA" and a barcode line right; red block button) · `drop` (catalog 4 columns with "NUEVO" tags) · `looks` (three model photos with hotspot labels) · `codigo` (strip of four values in mono, red numbers) · `cuenta-atras` (next-drop block with a static date) · `comunidad` (photo grid `calle` + `p4`) · `boletin` (black band).
- Product page: photo stack on the left, right: mono title, price, size chips, buy in black, `info` as "Detalles" and "Cuidado" toggles.
- Cart: drawer off-white, mono lines, red total. Added: ribbon "EN LA BOLSA".
- Photos (slots `p1, p2, p3, p4, calle, detalle`): `p1` (3:4) young man in a striped tee and wide jeans against a grey studio wall · `p2` (3:4) oversized black hoodie on a model against sage · `p3` (3:4) cargo trousers close, model walking · `p4` (3:4) cap and tote accessories on concrete · `calle` (3:2) group of friends on a skate plaza at golden hour · `detalle` (1:1) macro of a woven label and stitching.

### Task 10: Plantilla "Galería" (ref. Wix "Art Now" — "K. Fairchild")

**Files:** Create `packages/store-templates/templates/galeria/**`; previews `…/plantillas/galeria{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Galería — a painter's original works, full-bleed painting with a boxed caption`

**Brief:**
- id `galeria` · name "Galería" · category `arte` · order −293 · prefix `ga`
- Description: "Obras originales de una pintora: cuadro a pantalla completa, leyenda en una caja serif y un logo pequeño."
- Tags: pintura, obra original, arte, galería
- Fonts: display `libre-caslon-text`, text `figtree`
- Palette: gallery white #f6f4f0, ink #1a1614, cadmium #d1441f, moss #3c5a3a, ochre #c89a3a
- DNA: case none · radius none · border none · button outline · hover fill · press none · motion calm · cart drawer · added toast · card still · frame bleed
- Header: transparent over the hero; tiny artist mark in a white tab left; nav "Tienda Sobre la artista Contacto Preguntas"; cart and account icons right.
- Home sections: `portada` (h1; full-bleed painting `p1` of tropical leaves and a sleeping woman; bottom-right a warm-grey box: "Arte ahora" in serif, "Obras contemporáneas 2026" and a "Ver obras ↗" link) · `obras` (catalog: wide frames with title, size, technique, price; 3 columns) · `artista` (portrait `estudio` and a first-person paragraph in serif) · `coleccionar` (three steps to buy an original: Elegir, Certificado, Envío enmarcado) · `serie` (horizontal scroll of four works of the newest series) · `exposiciones` (a list of three shows with dates) · `boletin` (invite to the next opening).
- Product page: large painting with a "ver en la pared" mock (a sofa-wall crop `pared`) below; right: title, technique, size, price, buy, `info` as certificate + framing options.
- Cart: drawer white with a thin frame around thumbnails. Added: toast.
- Photos (slots `p1, p2, p3, p4, estudio, pared`): `p1` (3:2) original expressive oil painting of a woman asleep among red-and-green spotted begonia leaves · `p2` (4:5) abstract landscape in ochre and moss · `p3` (4:5) still life with lemons in bold colour · `p4` (4:5) portrait study in blue tones (all paintings, no signatures) · `estudio` (4:5) painter at an easel in a sunny studio · `pared` (3:2) framed painting above a beige sofa in a bright living room.

### Task 11: Plantilla "Visor" (ref. Wix "Focus Standard" camera store)

**Files:** Create `packages/store-templates/templates/visor/**`; previews `…/plantillas/visor{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Visor — cameras on white, product hero on a plinth with a red pill nav`

**Brief:**
- id `visor` · name "Visor" · category `tecnologia` · order −292 · prefix `vi`
- Description: "Cámaras y lentes: fondo blanco, el producto sobre un pedestal y una barra de navegación roja en forma de píldora."
- Tags: cámaras, fotografía, lentes, precisión
- Fonts: display `familjen-grotesk`, text `manrope`
- Palette: white #ffffff, ink #101113, graphite #2a2c30, signal red #e2352b, mist #eef0f2
- DNA: case none · radius pill · border hairline · button pill · hover invert · press sink · motion cinematic · cart drawer · added toast · card zoom · frame rounded
- Header: small wordmark left at the top; a red pill bar floating right containing menu, account, cart and a one-line promo.
- Home sections: `portada` (h1: "La experiencia de cámara absoluta"; short line; left column text; right: the camera `p1` large on a white plinth with a small inset `p2` card at the bottom right showing name, lens and price) · `equipo` (catalog, 3 columns, mist cards) · `comparar` (table comparing three bodies: sensor, video, peso, precio) · `lentes` (four lens tiles by focal length) · `taller` (split: `taller` photo and "Servicio técnico y calibración en La Paz") · `guias` (three short guides as cards) · `resenas` · `boletin`.
- Product page: big product on mist with a thumbnail row, right: name, price, buy, `info` as a spec table, `delivery`.
- Cart: drawer white with pill quantity controls, red total. Added: toast.
- Photos (slots `p1, p2, p3, p4, taller, calle`): `p1` (3:2) black mirrorless camera with a large lens on a white plinth, studio light · `p2` (1:1) silver compact camera on light grey · `p3` (1:1) prime lens standing on white · `p4` (1:1) camera strap and battery pack on white · `taller` (3:2) technician cleaning a sensor at a bench · `calle` (3:2) photographer shooting in a market street.

### Task 12: Plantilla "Savia" (ref. Wix "Wellness Shop (Organic)" — "Frais")

**Files:** Create `packages/store-templates/templates/savia/**`; previews `…/plantillas/savia{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Savia — natural soaps and candles, warm stone photo and boxed wordmark`

**Brief:**
- id `savia` · name "Savia" · category `belleza` · order −291 · prefix `sv`
- Description: "Jabones y velas naturales: foto cálida de piedra, titular serif y el nombre en una caja."
- Tags: jabones, natural, velas, artesanal
- Fonts: display `lora`, text `figtree`
- Palette: linen #f3eee6, stone #d8cdbb, ink #26221d, forest #34503b, terracotta #b5643a
- DNA: case none · radius soft · border hairline · button pill · hover fill · press none · motion calm · cart drawer · added toast · card zoom · frame rounded
- Header: forest ticker "Envío gratis desde Bs 300 · Ingredientes de Bolivia"; linen header with a boxed serif wordmark centred, nav left and right, cart right.
- Home sections: `portada` (h1; full-bleed warm photo of stacked soap bars `p1` with a bowl of oats; left overlay serif headline "Tal como la naturaleza lo pensó" and "Comprar ahora" pill; right small line "Jabones y velas artesanales") · `productos` (catalog, 3 columns, generous spacing) · `ingredientes` (four circular ingredient photos with names: avena, miel, coca, lavanda) · `ritual` (split: `ritual` photo and a 3-step routine) · `historia` (family workshop story with `taller`) · `resenas` · `boletin`.
- Product page: photo left, right: serif title, ingredient chips, price, buy, `info` as Ingredientes / Modo de uso / Envío accordions.
- Cart: drawer linen, soft rounded lines, forest total. Added: toast.
- Photos (slots `p1, p2, p3, p4, ritual, taller`): `p1` (3:2) three handmade soap bars stacked on warm travertine with a wooden bowl of oats · `p2` (1:1) round oat soap on stone · `p3` (1:1) beeswax candle in a clay cup · `p4` (1:1) lavender soap and dried lavender · `ritual` (4:5) hands washing with lather over a ceramic basin · `taller` (3:2) soap maker cutting a soap loaf in a small workshop.

### Task 13: Batch B QA and owner review

**Steps:** R10 for `pulp, barrio, galeria, visor, savia`; skip the hide question.

---

## Batch C — tira, atelier, alfar, asana, petalo

Before Task 14: R7 steps 1–2 for the batch.

### Task 14: Plantilla "Tira" (ref. Wix "Comics Store (Fun)" — "Kay's Comics")

**Files:** Create `packages/store-templates/templates/tira/**`; previews `…/plantillas/tira{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Tira — modern comics and manga, blue and yellow collage with floating pill nav`

**Brief:**
- id `tira` · name "Tira" · category `libros` · order −290 · prefix `ti`
- Description: "Cómics modernos y manga: collage azul y amarillo, titular condensado sobre foto y navegación flotante en píldoras."
- Tags: cómics, manga, novela gráfica, colorido
- Fonts: display `big-shoulders-display`, text `rubik`
- Palette: cobalt #3a3aef, lemon #f3e94a, ink #101010, paper #fbfaf4, lime #b9e23a
- DNA: case upper · radius round · border bold · button sticker · hover lift · press pop · motion playful · cart sheet · added bubble · card tilt · frame blob
- Header: floating white pills over the hero (Inicio, Nosotros, Tienda, Contacto) with cart count; no bar.
- Home sections: `portada` (h1; left half photo `p1` of a girl reading a comic on a red bench; right half a yellow collage panel with a rotated wrapped object `p2`; across the bottom a full-width cobalt band with condensed headline "Cada página se convierte en algo" and "Ver todos los cómics" link) · `estantes` (catalog with rounded covers) · `generos` (four round genre badges: Manga, Superhéroes, Novela gráfica, Infantil) · `lectura` (split: `club` photo and a monthly reading club) · `recomendados` (staff picks with hand-written notes) · `resenas` · `boletin`.
- Product page: cover left on a lemon blob, right: title, author, price, buy sticker, `info` as chips (páginas, idioma, formato), related.
- Cart: bottom sheet paper with cobalt bar, rounded lines. Added: bubble.
- Photos (slots `p1, p2, p3, p4, club, tienda`): `p1` (3:2) young woman reading an illustrated comic on a red bench, colourful surroundings · `p2` (4:5) abstract rolled-up wrapped parcel in acid green and blue print · `p3` (3:4) illustrated manga-style cover, original art, no text · `p4` (3:4) illustrated graphic-novel cover, original art, no text · `club` (3:2) five friends around a table with comics and drinks · `tienda` (3:2) narrow comic shop aisle full of colourful spines.

### Task 15: Plantilla "Atelier" (ref. Wix "Accessories Store (Elegant)")

**Files:** Create `packages/store-templates/templates/atelier/**`; previews `…/plantillas/atelier{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Atelier — leather goods, dark mood-board photo with serif overlay copy`

**Brief:**
- id `atelier` · name "Atelier" · category `moda` · order −289 · prefix `at`
- Description: "Marroquinería fina: foto oscura de tablero de inspiración, texto serif encima y una cinta color vino."
- Tags: cuero, accesorios, elegante, hecho a mano
- Fonts: display `bodoni-moda`, text `instrument`
- Palette: cream #f6f1ea, ink #191514, wine #5a1e2c, tan #b98a5a, smoke #3b3735
- DNA: case none · radius none · border hairline · button outline · hover invert · press none · motion cinematic · cart drawer · added toast · card zoom · frame bleed
- Header: wine ticker "Empaque de regalo gratis en pedidos desde Bs 400"; cream header, small nav left, a monogram centre, account and cart right.
- Home sections: `portada` (h1; full-bleed dark photo `p1` of a designer at a mood board; overlay serif "Hecho con distinción" and a short line; "Explorar la colección" underline link right) · `piezas` (catalog, 4 columns, cream cards, gold hairline) · `oficio` (split: `taller` photo and a paragraph about hand-stitching) · `materiales` (three swatches: cuero vegetal curtido, latón, hilo encerado) · `regalos` (band with gifting guide) · `atelier` (large `p2` featured piece with three numbered notes) · `boletin`.
- Product page: gallery with thin vertical thumbnails, right: serif title, price, buy outline, `info` as accordion (Materiales, Medidas, Cuidado).
- Cart: drawer cream with gold hairlines. Added: toast.
- Photos (slots `p1, p2, p3, p4, taller, detalle`): `p1` (16:9) woman in white shirt in front of a wall of leather and fabric sample cut-outs, dim moody light · `p2` (4:5) tan leather handbag on a dark walnut surface · `p3` (1:1) leather wallet, open, on dark slate · `p4` (1:1) leather belt coiled with brass buckle · `taller` (3:2) hands hand-stitching leather with waxed thread · `detalle` (1:1) macro of brass clasp and leather grain.

### Task 16: Plantilla "Alfar" (ref. Wix "Pottery Store (Artsy)" — "J. Bellamy")

**Files:** Create `packages/store-templates/templates/alfar/**`; previews `…/plantillas/alfar{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Alfar — handmade ceramics, a giant red blob with floating pieces`

**Brief:**
- id `alfar` · name "Alfar" · category `arte` · order −288 · prefix `af`
- Description: "Cerámica hecha a mano: una gran mancha roja con piezas flotando alrededor y un encabezado con línea fina."
- Tags: cerámica, alfarería, hecho a mano, artesanal
- Fonts: display `dm-serif-display`, text `epilogue`
- Palette: bone #f1ede3, ink #1c1917, oxblood #9b1c1f, clay #b4744a, sand #dcd0ba
- DNA: case none · radius none · border hairline · button underline · hover underline-grow · press none · motion calm · cart overlay · added inline · card zoom · frame blob
- Header: bone; small serif wordmark left; nav "Tienda Sobre Preguntas" centre; account and cart right; a thin red rule under the bar.
- Home sections: `portada` (h1; a huge oxblood organic blob in the centre with "Hecha con cuidado" in large cream serif, a mono line "Explora un mundo de cerámica hecha a mano" and "Comprar ahora" underline; cut-out pieces `p1`–`p4` float around the blob at different sizes, with a small "Cada pieza es un testimonio del oficio" line at the bottom) · `piezas` (catalog, 3 columns, bone cards with clay names) · `proceso` (four steps with numbers: Barro, Torno, Esmalte, Horno) · `coleccion` (full-bleed `mesa` table setting photo with a caption) · `taller` (split with `taller`) · `pedidos` (custom orders block) · `boletin`.
- Product page: cut-out piece on a sand blob left, right: name, price, buy, `info` (medidas, uso, lavado).
- Cart: overlay bone with a red top rule. Added: inline strip.
- Photos (slots `p1, p2, p3, p4, mesa, taller`): `p1`–`p4` (1:1) single ceramic pieces on pure white for cut-outs — black clay vase, speckled mug, wide ochre bowl, small brown jug · `mesa` (3:2) set table with handmade plates and cups, linen, natural light · `taller` (3:2) potter shaping clay on a wheel, hands wet with slip.

### Task 17: Plantilla "Asana" (ref. Wix "Yoga wear" — "Kayla")

**Files:** Create `packages/store-templates/templates/asana/**`; previews `…/plantillas/asana{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Asana — yoga and activewear, minimal split with a spaced wordmark`

**Brief:**
- id `asana` · name "Asana" · category `deporte` · order −287 · prefix `as`
- Description: "Ropa de yoga y entrenamiento: composición dividida y mínima, nombre con letras espaciadas y botón de contorno fino."
- Tags: yoga, activewear, minimalista, bienestar
- Fonts: display `outfit`, text `manrope`
- Palette: white #ffffff, ink #1a1a1a, fog #ecebe8, clay #a8877a, sage #a7b5a3
- DNA: case none · radius none · border hairline · button outline · hover fill · press none · motion calm · cart drawer · added toast · card still · frame bleed
- Header: white; the store name in tiny letter-spaced capitals left; nav "Inicio Historia Tienda Contacto" centre; account and cart right.
- Home sections: `portada` (h1: "Muévete con intención"; left: small text, spec line and thin outlined "COMPRAR" button, with a small `p2` product tile bottom-left; right: tall black-and-white photo `p1` of a yoga backbend) · `prendas` (catalog, 4 columns, fog cards, tiny type) · `practica` (three columns: Yoga, Pilates, Caminar with photo) · `tejido` (split: fabric macro `detalle` and a paragraph on breathable cloth) · `clases` (a list of three weekly classes with time and a "Reservar" link to contact) · `resenas` · `boletin`.
- Product page: two tall photos side by side, right: title, price, size chips, buy outline, `info` accordion.
- Cart: drawer white, small text. Added: toast.
- Photos (slots `p1, p2, p3, p4, estudio, detalle`): `p1` (3:4) black-and-white woman in a deep yoga backbend, studio · `p2` (1:1) folded brown yoga set on white · `p3` (3:4) woman in sage leggings and top standing in a warrior pose · `p4` (3:4) hands adjusting a yoga mat, clay-toned · `estudio` (3:2) bright empty yoga studio with mats and plants · `detalle` (1:1) macro of stretch fabric weave.

### Task 18: Plantilla "Pétalo" (ref. Wix "Beauty Product Launch (Delicate)" — "Bell y Belle")

**Files:** Create `packages/store-templates/templates/petalo/**`; previews `…/plantillas/petalo{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Pétalo — a skincare launch, white with a left serif wordmark and a two-model photo`

**Brief:**
- id `petalo` · name "Pétalo" · category `belleza` · order −286 · prefix `pe`
- Description: "Lanzamiento de una crema: blanco delicado, nombre en serif a la izquierda, foto de dos modelos y una tarjeta de producto."
- Tags: cuidado de la piel, lanzamiento, delicado, crema
- Fonts: display `instrument-serif`, text `outfit`
- Palette: white #ffffff, ink #1b1b1b, powder #f1e4df, blush #d9a79b, gold #d8b04a
- DNA: case none · radius soft · border none · button block · hover fill · press none · motion calm · cart drawer · added toast · card zoom · frame rounded
- Header: white; three stacked small links left (Inicio, Tienda, Contacto); italic serif wordmark centre; account and cart right.
- Home sections: `portada` (h1; left: big serif "El secreto de belleza definitivo", a short line and a gold "Comprar ahora →" button; right: large photo `p1` of two models cheek to cheek with a white card overlay "Crema Renovación Radiante · Fórmula avanzada · Apta para todo tipo de piel" and a jar thumbnail) · `estrella` (featured product `p2` on powder with three benefits) · `productos` (catalog, 3 columns) · `ingredientes` (icon list of four actives) · `resultados` (two-column claim strip, no medical claims: "Piel más luminosa en 4 semanas de uso" as customer-reported) · `resenas` · `boletin`.
- Product page: jar photo on powder, right: italic name, price, buy, `info` (ingredientes, modo de uso).
- Cart: drawer white with blush accents. Added: toast.
- Photos (slots `p1, p2, p3, p4, textura, rutina`): `p1` (3:2) two women with radiant skin cheek to cheek, soft daylight, neutral top · `p2` (1:1) cream jar with gold lid on powder-pink plinth · `p3` (1:1) serum dropper bottle on white · `p4` (1:1) face mist bottle and flowers · `textura` (1:1) swirl of cream on a glass slide · `rutina` (4:5) woman applying cream at a mirror.

### Task 19: Batch C QA and owner review

**Steps:** R10 for `tira, atelier, alfar, asana, petalo`; skip the hide question.

---

## Batch D — afiche, acuarela, arena, dron, infusion

Before Task 20: R7 steps 1–2 for the batch.

### Task 20: Plantilla "Afiche" (ref. Wix "Poster Store (Retro)")

**Files:** Create `packages/store-templates/templates/afiche/**`; previews `…/plantillas/afiche{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Afiche — art prints and posters, big grotesque headline and a poster collage`

**Brief:**
- id `afiche` · name "Afiche" · category `arte` · order −285 · prefix `aa`
- Description: "Afiches y láminas: titular grande en grotesca, cinta negra arriba y un collage de pósters."
- Tags: afiches, láminas, decoración, retro
- Fonts: display `chivo`, text `space-mono`
- Palette: white #ffffff, ink #0e0e0e, sky #3f6fd8, cream #efe8d0, chartreuse #d5e64a
- DNA: case none · radius none · border hairline · button underline · hover invert · press sink · motion snappy · cart drawer · added stamp · card zoom · frame inset
- Header: black ticker ("Envío mundial desde Bs 800 · Papel de 250 g"); white bar: small menu icon and mono wordmark left, account and cart right.
- Home sections: `portada` (h1: "Arte audaz que habla fuerte"; mono line; "Ver todos los afiches ↗"; right: tall framed poster `p1` being hung by a person; below: two poster tiles `p2` sky and `p3` cream) · `afiches` (catalog, 4 columns, frames) · `tamanos` (three sizes shown as scaled frames A3 / A2 / 50×70) · `marcos` (frame options with finish swatches) · `artistas` (three illustrators with a poster each) · `pared` (`pared` photo with "Ideas para tu pared") · `boletin`.
- Product page: poster large with a frame mock, right: name, artist, size/frame selector (variants), price, buy, `info`.
- Cart: drawer white with mono lines. Added: stamp "AL CARRITO".
- Photos (slots `p1, p2, p3, p4, pared, taller`): `p1` (4:5) man hanging a framed pixel-style horse illustration on a pale wall · `p2` (3:4) blue poster with abstract dots and shapes · `p3` (3:4) cream poster with line-drawn flowers · `p4` (3:4) chartreuse poster with bold geometric shapes, no type · `pared` (3:2) gallery wall of five framed prints above a desk · `taller` (3:2) print studio, hands lifting a fresh print from a press.

### Task 21: Plantilla "Acuarela" (ref. Wix "Art Supply Store (Colorful)" — "Gamboge & Gesso")

**Files:** Create `packages/store-templates/templates/acuarela/**`; previews `…/plantillas/acuarela{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Acuarela — art supplies, oversized red condensed wordmark over a colourful shelf photo`

**Brief:**
- id `acuarela` · name "Acuarela" · category `arte` · order −284 · prefix `ac`
- Description: "Materiales de arte: nombre rojo gigante en letra condensada, foto colorida de pinturas y cajas, botón redondeado."
- Tags: pinturas, pinceles, papel, materiales
- Fonts: display `bebas-neue`, text `figtree`
- Palette: white #ffffff, ink #141414, vermilion #d8271c, ultramarine #2a49b8, ochre #e0b23a, lilac #d9d3ee
- DNA: case upper · radius pill · border none · button pill · hover lift · press pop · motion playful · cart drawer · added bubble · card zoom · frame rounded
- Header: lilac ticker "Hasta 25 % de descuento en sets · Envío rápido"; small header: "Tienda Nosotros Contacto Preguntas" and a "Carrito 0" pill.
- Home sections: `portada` (h1: the store name in enormous vermilion condensed capitals across the full width; small line "Materiales para pintores, ilustradores y creadores"; a vermilion "Comprar ahora" pill; below a wide photo `p1` of paint tubes, tins and paper on a wooden table) · `pinturas` (catalog, 4 columns) · `categorias` (Óleo, Acrílico, Acuarela, Papel, Pinceles as five coloured chips with counts) · `sets` (three set bundles with prices) · `consejos` (three how-to cards) · `estudio` (split with `estudio`) · `boletin`.
- Product page: photo left on a colour block chosen by category, right: name, price, buy pill, `info` (contenido, uso).
- Cart: drawer white with pill controls and a vermilion total. Added: bubble.
- Photos (slots `p1, p2, p3, p4, estudio, mesa`): `p1` (16:9) wooden table with tin boxes, tubes of paint and thread spools in yellow, blue and red · `p2` (1:1) set of twelve watercolour pans · `p3` (1:1) three brushes in a jar · `p4` (1:1) pad of thick cream paper with a pencil · `estudio` (3:2) artist's desk with a half-painted canvas · `mesa` (3:2) kids' art class table with paints.

### Task 22: Plantilla "Arena" (ref. Wix "Sport Merchandise Store (Solid)" — "Volt Arena")

**Files:** Create `packages/store-templates/templates/arena/**`; previews `…/plantillas/arena{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Arena — team and sport merchandise, purple gradient with an athlete cut-out`

**Brief:**
- id `arena` · name "Arena" · category `deporte` · order −283 · prefix `ar`
- Description: "Merchandising deportivo: degradado morado, atleta recortado y una barra oscura de categorías."
- Tags: deporte, camisetas, hinchas, entrenamiento
- Fonts: display `unbounded`, text `chivo`
- Palette: violet #4b1fb0, deep #1e0a4d, indigo #2a1c86, lime #c8f03a, white #ffffff
- DNA: case upper · radius soft · border none · button block · hover lift · press pop · motion cinematic · cart drawer · added ribbon · card zoom · frame bleed
- Header: dark deep bar, wordmark with a small lightning mark left; nav "Todo Hombre Mujer Equipo Nosotros"; account and cart right.
- Home sections: `portada` (h1: "Todo lo que necesitas"; violet-to-indigo gradient; left text and "Comprar" lime button; centre athlete cut-out `p1` running; right small inset cap photo `p2` in a rounded frame) · `categorias` (dark bar with tiles: Ropa de hombre, Ropa de mujer, Equipo, Fan shop) · `novedades` (catalog, 4 columns, dark cards) · `equipo` (team kit block with a colour picker preview) · `entrenamiento` (split: `cancha` photo, three training tips) · `ofertas` (lime band with discounts) · `boletin`.
- Product page: photo on gradient left, right: name, price, size chips, buy lime block, `info` accordions.
- Cart: dark drawer with lime total. Added: ribbon.
- Photos (slots `p1, p2, p3, p4, cancha, hinchada`): `p1` (3:4) female sprinter in tech jacket mid-stride, cut-out friendly plain purple backdrop · `p2` (1:1) green cap on a woman, head detail · `p3` (1:1) folded purple team jersey on white · `p4` (1:1) training shoes on white · `cancha` (3:2) outdoor pitch at dusk with floodlights · `hinchada` (3:2) crowd of fans in purple shirts cheering.

### Task 23: Plantilla "Dron" (ref. Wix "Drone Store (Cutting-edge)" — "AeroPulse")

**Files:** Create `packages/store-templates/templates/dron/**`; previews `…/plantillas/dron{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Dron — drones, mountain landscape with a HUD crosshair and a product inset`

**Brief:**
- id `dron` · name "Dron" · category `tecnologia` · order −282 · prefix `dr`
- Description: "Drones: paisaje de montaña con retícula tipo HUD, letra monoespaciada y el producto en un recuadro."
- Tags: drones, cámaras aéreas, tecnología, montaña
- Fonts: display `sora`, text `space-mono`
- Palette: cloud #eef1ee, ink #0f1210, alpine #6b7d5a, signal blue #2b6cf0, white #ffffff
- DNA: case none · radius none · border hairline · button block · hover invert · press sink · motion cinematic · cart sheet · added toast · card zoom · frame bleed
- Header: thin ticker "Envío al día siguiente en todos los sistemas"; boxed white wordmark top-left over the photo with a hamburger; account and cart top-right.
- Home sections: `portada` (h1: "Desafía el horizonte" in a white box; full-bleed alpine landscape `p1` with a faint crosshair overlay and small coordinates in mono; bottom-left text "Drones de grado aeroespacial, estabilidad y 8K" and a blue "Comprar ahora →" button; bottom-right inset `p2` of the drone on white) · `modelos` (catalog, 3 columns) · `vuelo` (full-bleed `p3` with three callouts: Autonomía, Alcance, Cámara) · `especificaciones` (comparison of two models) · `accesorios` (four tiles) · `licencia` (a short guide "Antes de volar" with three points) · `boletin`.
- Product page: drone photo on cloud with thin crosshair lines, right: name, price, buy, `info` spec grid (peso, autonomía, alcance, video).
- Cart: bottom sheet white with mono lines. Added: toast.
- Photos (slots `p1, p2, p3, p4, campo, control`): `p1` (16:9) green Andean hillside under soft cloud, wide, empty, distant peaks · `p2` (4:3) small grey folding drone on white · `p3` (16:9) drone hovering above a lake valley at sunrise · `p4` (1:1) drone battery and charger on white · `campo` (3:2) pilot with a controller on a hill · `control` (1:1) hands on a drone controller.

### Task 24: Plantilla "Infusión" (ref. Wix "Tea Shop (Inviting)" — "Bloom's Tea")

**Files:** Create `packages/store-templates/templates/infusion/**`; previews `…/plantillas/infusion{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Infusión — loose-leaf tea, navy ground and a huge serif split with a pouring photo`

**Brief:**
- id `infusion` · name "Infusión" · category `comida` · order −281 · prefix `in`
- Description: "Té en hojas: fondo azul marino, titular serif enorme y una foto de manos sirviendo el té."
- Tags: té, hierbas, infusiones, ceremonia
- Fonts: display `fraunces`, text `figtree`
- Palette: navy #12243a, paper #eef3f8, ink #121417, matcha #7f9a4a, clay #a26a45
- DNA: case none · radius soft · border hairline · button block · hover fill · press none · motion calm · cart drawer · added toast · card zoom · frame rounded
- Header: navy strip with social icons left; centre a flower mark and store name; right account and cart; below a second strip with links "Tés Extras Nosotros Blog Contacto".
- Home sections: `portada` (h1; left paper panel: small "Siempre es" over huge serif "Hora del té", a short line and a navy "Comprar" button; right: photo `p1` of hands pouring from a teapot next to a whisk) · `tes` (catalog, 4 columns, paper cards) · `familias` (four tea families with tasting notes: verde, negro, hierbas, coca) · `ceremonia` (split: `ceremonia` photo and a 3-step brew guide with temperature and time) · `regalo` (gift set band) · `suscripcion` (monthly tea box) · `resenas` · `boletin`.
- Product page: tin/packet photo left on paper, right: name, notes, price, weight variants, buy, `info` (Preparación, Origen).
- Cart: drawer paper with navy total. Added: toast.
- Photos (slots `p1, p2, p3, p4, ceremonia, hojas`): `p1` (4:5) hands pouring green tea from a ceramic teapot next to a bamboo whisk on a grey table · `p2` (1:1) navy tea tin on paper background · `p3` (1:1) loose green leaves in a wooden scoop · `p4` (1:1) glass cup of herbal infusion with dried flowers · `ceremonia` (3:2) tea tasting table with small bowls · `hojas` (3:2) tea terrace at a mountain farm.

### Task 25: Batch D QA and owner review

**Steps:** R10 for `afiche, acuarela, arena, dron, infusion`; skip the hide question.

---

## Batch E — arrullo, retono, longevo, navidad, neutro

Before Task 26: R7 steps 1–2 for the batch.

### Task 26: Plantilla "Arrullo" (ref. Wix "Baby Gift Store (Soft)" — "Luna & Cloud")

**Files:** Create `packages/store-templates/templates/arrullo/**`; previews `…/plantillas/arrullo{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Arrullo — baby gifts and nursery, warm neutrals with a two-photo split`

**Brief:**
- id `arrullo` · name "Arrullo" · category `ninos` · order −280 · prefix `au`
- Description: "Regalos para bebé y cuarto del bebé: neutros cálidos, dos fotos en mitades y una cinta pequeña de envoltura."
- Tags: bebé, regalos, cuarto, suave
- Fonts: display `lora`, text `nunito`
- Palette: oat #f6efe5, ink #2a2622, sand #e4d5bf, cloud #ffffff, dusty rose #d8b0a6
- DNA: case none · radius round · border none · button pill · hover fill · press none · motion calm · cart drawer · added toast · card zoom · frame rounded
- Header: dark neutral ticker "Envoltura de regalo gratis desde Bs 250"; oat header: small round logo left, nav centre "Tienda Nuestra filosofía Guía de regalos", account and cart right.
- Home sections: `portada` (h1; two equal photos side by side: `p1` a nursery with a canopy and mobile, `p2` soft felt clouds and moon; centre-bottom small serif caption "Suavidad para los primeros días"; pill "Ver regalos") · `regalos` (catalog, 3 columns, generous) · `guia` (gift guide by budget: Hasta Bs 150, 150–300, Más de 300) · `cuarto` (split with `cuarto` and a nursery checklist) · `filosofia` (three soft promises: Materiales seguros, Tejido a mano, Empaque reutilizable) · `resenas` · `boletin`.
- Product page: large soft photo, right: name, price, buy pill, `info` (materiales, cuidado, edad), "Añadir tarjeta de regalo" note.
- Cart: drawer oat with rounded lines. Added: toast.
- Photos (slots `p1, p2, p3, p4, cuarto, manos`): `p1` (3:4) cosy nursery corner with a linen canopy and a hanging felt mobile · `p2` (3:4) felt cloud and crescent moon toys on a neutral background · `p3` (1:1) knitted baby blanket folded on a cot · `p4` (1:1) small stuffed bunny on oat linen · `cuarto` (3:2) bright neutral nursery with a wooden cot · `manos` (1:1) parent's hands holding a baby's hand.

### Task 27: Plantilla "Retoño" (ref. Wix "Kids Clothing Store (Colorful)" — "Juniper Romp")

**Files:** Create `packages/store-templates/templates/retono/**`; previews `…/plantillas/retono{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Retoño — kids' clothes, three-photo strip with a floating caption card`

**Brief:**
- id `retono` · name "Retoño" · category `ninos` · order −279 · prefix `rt`
- Description: "Ropa infantil: tira de tres fotos, tarjeta blanca flotante y nombre en letra cursiva."
- Tags: ropa infantil, algodón, colorido, juego
- Fonts: display `bricolage`, text `nunito`
- Palette: white #ffffff, ink #1b2320, mint #cfe6d8, sunflower #f2c94c, coral #ef7f6a, sky #a9d1ea
- DNA: case none · radius round · border none · button pill · hover lift · press squash · motion playful · cart drawer · added bubble · card tilt · frame rounded
- Header: ticker "Envío gratis en pedidos desde Bs 350"; header with links left (Nosotros, Tienda, Bebé, Niños, Grandes) and a cursive wordmark centre; account and cart right.
- Home sections: `portada` (h1; full-width strip of three photos: `p1` child in a printed shirt from the back, `p2` curly-haired child seated, `p3` smiling child in yellow glasses; a white rounded card bottom-left "Hecho para jugar" with a short paragraph and outline "Ver ropa" pill) · `ropa` (catalog, 4 columns, tilted cards) · `edades` (Bebé, Niños, Grandes as three colour tiles) · `algodon` (split: `tela` photo and cotton facts) · `looks` (two outfit collages) · `resenas` · `boletin`.
- Product page: photo left with a thumbnail strip, right: name, price, size chips (variants), buy pill, `info` accordion (Tela, Tallas, Cuidado).
- Cart: drawer white, round thumbs, sunflower total. Added: bubble.
- Photos (slots `p1, p2, p3, p4, tela, parque`): `p1` (3:4) child seen from behind in a green shirt printed with small clouds · `p2` (3:4) curly-haired child on a stool in a matching green set · `p3` (3:4) smiling child with yellow round glasses and a green cap · `p4` (3:4) folded kids' clothes flat lay in bright colours · `tela` (1:1) macro of printed cotton fabric · `parque` (3:2) children playing at a sunny park.

### Task 28: Plantilla "Longevo" (ref. Wix "Longevity Blog (Sleek)" — "E&C")

**Files:** Create `packages/store-templates/templates/longevo/**`; previews `…/plantillas/longevo{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Longevo — supplements plus a health blog, blurred lifestyle photo and a featured-post card`

**Brief:**
- id `longevo` · name "Longevo" · category `belleza` · order −278 · prefix `lg`
- Description: "Suplementos y blog de salud: foto de estilo de vida desenfocada, navegación en píldoras y una tarjeta de artículo destacado."
- Tags: suplementos, bienestar, longevidad, blog
- Fonts: display `epilogue`, text `manrope`
- Palette: mist #eef0ee, ink #151817, slate #4a5560, teal #2f7f7a, white #ffffff
- DNA: case none · radius pill · border hairline · button pill · hover fill · press none · motion cinematic · cart drawer · added toast · card zoom · frame rounded
- Header: floating white pill top-centre with the wordmark, links (Inicio, Blog, Productos) and a dark "Suscribirse" pill; cart icon.
- Home sections: `portada` (h1: "Descubre los secretos de la longevidad"; full-bleed blurred photo `p1` of a man in his 50s in a bright room; left overlay text and "Empieza tu camino →"; bottom-right glass card with thumbnail and "Artículo destacado: qué dice el sueño sobre tu salud") · `productos` (catalog, 3 columns) · `pilares` (four pillars: Sueño, Movimiento, Nutrición, Estrés) · `blog` (three article cards with dates and read time) · `evidencia` (split: `laboratorio` photo and "Cómo elegimos cada ingrediente" — no medical claims, "consulta a tu médico") · `resenas` · `boletin`.
- Product page: bottle on mist left, right: name, dose, price, plan variants (30 / 60 días), buy, `info` (Ingredientes, Modo de uso, Advertencias).
- Cart: drawer white with pill controls. Added: toast.
- Photos (slots `p1, p2, p3, p4, laboratorio, articulo`): `p1` (16:9) man with grey stubble in soft window light, shallow depth of field, calm mood · `p2` (1:1) white supplement bottle on mist · `p3` (1:1) green capsule box on white · `p4` (1:1) powder sachets fanned out · `laboratorio` (3:2) clean lab bench with amber bottles · `articulo` (4:3) sleeping person's hand on white sheets, morning light.

### Task 29: Plantilla "Navidad" (ref. Wix "Christmas Store (Simple)" — "The Christmas Boutique")

**Files:** Create `packages/store-templates/templates/navidad/**`; previews `…/plantillas/navidad{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Navidad — Christmas decoration, dark festive photo with a product-card row rising over it`

**Brief:**
- id `navidad` · name "Navidad" · category `hogar` · order −277 · prefix `na`
- Description: "Decoración navideña: foto festiva oscura, nombre en letra cursiva y tarjetas de producto que suben sobre la imagen."
- Tags: navidad, decoración, adornos, temporada
- Fonts: display `shrikhand`, text `figtree`
- Palette: pine #16352b, cream #f7f0e3, berry #b3242f, gold #d1a640, night #1b1212
- DNA: case none · radius soft · border none · button pill · hover lift · press pop · motion cinematic · cart drawer · added ribbon · card zoom · frame rounded
- Header: cream ticker "Envío gratis desde Bs 300"; cream bar: nav left "Todo Adornos Árboles Luces", cursive wordmark centre in berry, account and cart right.
- Home sections: `portada` (h1: "Ofertas de temporada"; full-bleed dark photo `p1` of a woman decorating a tree; small gold caption "Tu tienda de todo lo navideño"; berry "Comprar ahora" pill; three white product cards `p2`–`p4` rising from the bottom edge over the photo) · `adornos` (catalog, 4 columns, cream) · `ambientes` (three rooms: Sala, Mesa, Puerta as photo tiles) · `regalos` (gift-set band with prices) · `envios` (three dated steps to arrive by 24 dic) · `resenas` · `boletin`.
- Product page: photo left on cream, right: cursive name, price, buy berry pill, `info` (medidas, material, cuidado).
- Cart: drawer cream with a berry total and a gold rule. Added: ribbon.
- Photos (slots `p1, p2, p3, p4, mesa, puerta`): `p1` (3:2) woman hanging a red ornament on a dark pine tree in a dim room with warm lights · `p2` (4:5) pink glass ornament on white · `p3` (4:5) miniature felt tree on white · `p4` (4:5) red beeswax taper candles on white · `mesa` (3:2) Christmas dinner table with pine and gold · `puerta` (4:5) wreath on a wooden door.

### Task 30: Plantilla "Neutro" (ref. Wix "eCommerce Layout")

**Files:** Create `packages/store-templates/templates/neutro/**`; previews `…/plantillas/neutro{,-mobile}.webp`. **Steps:** R9. **Commit message:** `feat(templates): Plantilla Neutro — a clean starter for any single brand, soft gradient hero and big left title`

**Brief:**
- id `neutro` · name "Neutro" · category `producto-unico` · order −276 · prefix `ne`
- Description: "Una base limpia para cualquier marca: degradado suave, título grande a la izquierda y una barra de navegación en caja."
- Tags: base, limpia, versátil, marca
- Fonts: display `outfit`, text `manrope`
- Palette: white #ffffff, ink #14171a, mist #e9eef2, sky #cfe0ec, accent #2b5fd9
- DNA: case none · radius soft · border hairline · button block · hover fill · press sink · motion calm · cart drawer · added toast · card zoom · frame rounded
- Header: thin dark promo strip; white bar with a boxed name left, nav centre "Todo Más vendidos Ofertas Nuevo Nosotros Preguntas", account and cart right.
- Home sections: `portada` (h1: large left-aligned title; a short line; dark "Comprar ahora" button; right/back a soft sky gradient with a folded-paper shape `p1`) · `vendidos` (catalog, 4 columns) · `beneficios` (four icon claims: Envío, Devolución, Pago seguro, Atención) · `destacado` (featured product `p2` with description) · `historia` (split with `equipo`) · `preguntas` (accordion of four) · `resenas` · `boletin`.
- Product page: standard two-column, gallery left, right: title, price, buy, `info`, `delivery`, related.
- Cart: drawer white. Added: toast.
- Photos (slots `p1, p2, p3, p4, equipo, empaque`): `p1` (16:9) soft blue-white gradient with a folded white paper wave, abstract, empty · `p2` (1:1) minimalist white bottle on mist · `p3` (1:1) grey canvas pouch on white · `p4` (1:1) ceramic mug on white · `equipo` (3:2) small team around a bright table · `empaque` (1:1) neat kraft parcel with a ribbon.

### Task 31: Batch E QA, owner review and wrap-up

**Steps:** R10 for `arrullo, retono, longevo, navidad, neutro`; then ask the owner (b) which old templates to hide; then:

- [ ] Run the whole gate once more: `cd packages/store-templates && node --test test/*.test.mjs`, `cd apps/api && npx jest src/storefront-source`, `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p .`. All PASS.
- [ ] Gallery check: start the dev stack (`run` skill), open Plantillas: the chip counts add up (36 + 25 = 61 minus any hidden), the `Construcción` chip is present, and searching "cómic" finds Historieta, Pulp and Tira.
- [ ] Update `HANDOFF.md` only if the owner asks (project rule: manual trigger).
