# Wix-style Plantillas, round 2 — design

Date: 2026-09-29. Status: roster chosen by the owner in conversation; this written spec awaits the owner's review.
Extends `2026-09-28-wix-style-templates-design.md` (same package format, originality rule, registry changes and quality
gate — read that first; nothing here changes them).

Owner's request: four screenshots of more Wix Harmony templates, "lets add all of these for now", and "i want for
construction also". Chosen in conversation: these come **before** the 18 templates still unbuilt from round 1, which stay
in the earlier spec and follow afterwards; the construction template is a **constructora (services)**.

## 1. The 25 templates

Feel is taken from the reference; name, copy, wordmark, palette and photos are original (round-1 spec §3). Ids avoid every
existing and round-1 id. "Feel" is what to carry over, not what to copy.

| # | Id | Category | Reference (Wix) | Store it demos | Feel to carry over |
|---|----|----------|-----------------|----------------|--------------------|
| 1 | obra | construccion (new) | none — owner request | A constructora selling service packages (visita técnica, planos, remodelación por m², obra gris) | Safety yellow on charcoal, condensed caps, concrete texture, project portfolio, "Cotizar" call to action |
| 2 | historieta | libros | Comics Store (Retro) "Ben's Comics" | Comic-book shop | Halftone dots, speech-bubble story panel, red-orange ground, yellow button |
| 3 | pulp | libros | Comics Store (Vintage) "Legends Live Forever" | Pulp and vintage comics | Yellow ground, giant red slab headline, zigzag bursts |
| 4 | tira | libros | Comics Store (Fun) "Kay's Comics" | Modern comics and manga | Blue/yellow collage, condensed headline over a photo, floating nav pills |
| 5 | plata | moda | Jewelry Store (Clean) "Velaura" | Silver and bead jewelry | Black-and-white editorial split, serif, small sale card overlaid |
| 6 | barrio | moda | Clothing Store (Young) "Solasta" | Streetwear drops | Bracketed mono wordmark, red accents, stacked boxed text, ticker bar |
| 7 | atelier | moda | Accessories Store (Elegant) | Leather goods | Dark mood-board photo, serif overlay copy, wine-coloured ticker |
| 8 | galeria | arte | Art Now "K. Fairchild" | A painter's original works | Full-bleed painting, boxed serif caption, tiny logo tab |
| 9 | afiche | arte | Poster Store (Retro) | Art prints and posters | Big grotesque headline, black ticker, poster collage below |
| 10 | alfar | arte | Pottery Store (Artsy) "J. Bellamy" | Handmade ceramics | Giant red blob shape with floating objects around it, thin rule header |
| 11 | acuarela | arte | Art Supply Store (Colorful) "Gamboge & Gesso" | Paints, brushes, paper | Oversized red condensed wordmark, colourful supplies photo, pill button |
| 12 | asana | deporte | Yoga wear "Kayla" | Yoga and activewear | Minimal split, tiny spaced wordmark, thin outlined button |
| 13 | sendero | deporte | Backpack Store (Rugged) "Iron Cliff" | Packs and trail gear | Misty forest photo, side product panel with price, dark ticker |
| 14 | arena | deporte | Sport Merchandise (Solid) "Volt Arena" | Team and sport merchandise | Purple gradient, athlete cut-out, dark category bar |
| 15 | visor | tecnologia | Camera store "Focus Standard" | Cameras | White, product hero on plinth, red pill nav |
| 16 | dron | tecnologia | Drone Store (Cutting-edge) "AeroPulse" | Drones | Landscape photo, HUD crosshair, mono type, product inset |
| 17 | arrullo | ninos | Baby Gift Store (Soft) "Luna & Cloud" | Baby gifts and nursery | Warm neutrals, two-photo split, tiny gift-wrap ticker |
| 18 | trompo | ninos | Toy Store (Retro) "Mochi&Oak" | Wooden toys by age | Giant black wordmark, colour-block age cards, cream ground |
| 19 | retono | ninos | Kids Clothing (Colorful) "Juniper Romp" | Kids' clothes | Three-photo strip, floating white caption card, script wordmark |
| 20 | savia | belleza | Wellness Shop (Organic) "Frais" | Natural soaps and candles | Warm stone photo, serif headline, boxed wordmark, ticker |
| 21 | petalo | belleza | Beauty Product Launch (Delicate) "Bell y Belle" | A skincare launch | White, left serif wordmark, two-model photo, product card overlay |
| 22 | longevo | belleza | Longevity Blog (Sleek) "E&C" | Supplements plus a health blog | Blurred lifestyle photo, pill nav, featured-post glass card |
| 23 | infusion | comida | Tea Shop (Inviting) "Bloom's Tea" | Loose-leaf tea | Navy ground, huge serif "Tea Time" split, hand-pouring photo |
| 24 | navidad | hogar | Christmas Store (Simple) "The Christmas Boutique" | Christmas decoration | Dark festive photo, script wordmark, product-card row rising over it |
| 25 | neutro | producto-unico | eCommerce Layout | A clean starter for any single brand | Soft gradient hero, big left title, boxed nav, "Shop now" |

Category coverage after this round: adds **deporte** (3), **libros** (3), **arte** (4), **construccion** (1) as strong
groups; `servicios` stays for the older generic service templates.

### Batches (5 each, mixed so each is reviewable on its own; `obra` first because the owner asked for it explicitly)

- **A:** obra, historieta, plata, sendero, trompo
- **B:** pulp, barrio, galeria, visor, savia
- **C:** tira, atelier, alfar, asana, petalo
- **D:** afiche, acuarela, arena, dron, infusion
- **E:** arrullo, retono, longevo, navidad, neutro

Round-1's batches 2–4 (sastre … motor) come after E.

## 2. `obra`, the constructora

No Wix reference, so it gets its own brief:

- **What is sold:** service packages priced in Bs through the normal store/checkout — Visita técnica, Planos y
  presupuesto, Remodelación (por m²), Obra gris, Acabados — each with a photo, a description and "Incluye" list. A
  merchant adds their own services in Productos and the template shows them.
- **Home (7 sections):** photo hero with a headline and "Cotizar" button; services grid; featured projects
  (before/after photo pairs); how we work in four steps; numbers (years, projects, m² built); client reviews;
  closing "Cotizar tu obra" band.
- **Look:** safety yellow on charcoal (exact values chosen in the template), condensed caps headline face from the
  kit's bundled fonts, concrete-texture panels, hard square corners.
- **"Cotizar":** links to the store's WhatsApp/contact if the kit exposes one; otherwise it scrolls to the services
  grid. The plan phase checks what the kit offers; **no new kit primitive** (round-1 §8). A quote form is out of scope.
- **Registry:** new `construccion` category ("Construcción") added in the same four places as `motor`.

## 3. Per-template content, gate, photos

Unchanged from round 1 §5 and §7 (own shell, 6–9 unique home sections, own product page, cart, added notice, review and
checkout; ~6 photos ≤ 600 KB; look-alike test; browser QA at 390 and 1440 px with the offline QA tool; owner reviews
each batch). Two additions:

1. **Duplicated genres need distinct compositions.** Three comics templates, three toy/kids ones and four art ones
   exist. The look-alike test (unique home section sequence) must pass, and each has a different header style and hero
   composition, taken from its own reference row above.
2. **Photo budget.** About 150 photos (25 × 6). The Higgsfield balance on 2026-09-29 is **329 credits**. Before each
   batch the plan generates one test image to learn the per-image cost, then stops and tells the owner if the batch
   would not fit. Batches may be topped up between rounds; nothing is generated silently past the balance.

## 4. Out of scope

Everything in round 1 §8, plus a construction quote form, ferretería (materials retail) as a second construction
template (offered, not chosen), and hiding old templates (the owner decides after each batch).
