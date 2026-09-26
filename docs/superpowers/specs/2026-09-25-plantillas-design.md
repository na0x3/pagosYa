# Plantillas — design

Date: 2026-09-25. Status: approved by the owner in conversation ("make many modern plantillas … and execute the
plan"); the owner supplies the photo folders and the reference websites each template is styled on.
Research: `docs/research/2026-09-25-competitor-stores.md`. Umbrella: `2026-09-25-store-themes-design.md` (this is
its T3 + T5, scaled up and made concrete).

## 1. What the merchant gets

A **Plantillas** gallery in the Studio, like Clyro's "Choose a template": cards with a full-page preview, name and
kind of business, filterable by category. "Usar esta plantilla" turns it into the store's next revision at once
and for free: the template fills with the store's name, its products (the kit's live catalog, cart, product page
and checkout) and its product photos; photo slots the store can't fill keep the template's demo photos. The
previous revision stays in the history (restore works as today). The merchant then changes photos and text with
the existing editors or YAPI.

Also offered in the empty state (no site yet): "Elegir una plantilla" beside "Cuéntale a YAPI".

## 2. What a template is

`packages/store-templates/templates/<id>/`:

- `template.json` — `{ id, name, category, description, tags[], sitePurpose: "shop", photos: [{ slot, role, demo? }],
  order }`. `category` ∈ `comida`, `moda`, `belleza`, `hogar`, `arte`, `tecnologia`, `mascotas`, `ninos`,
  `deporte`, `servicios`, `producto-unico`. `role` ∈ `hero`, `product`, `lifestyle`, `detail`.
- `components/*.tsx` + `styles/globals.css` — a complete React store in exactly the format YAPI produces
  (`source-next.ts`: home, product, checkout, shared components; Tailwind + CSS; `@pagosya/ui`; the kit's commerce
  mounts and T1 kit templates). Hand-designed, one per reference site.
- `demo/<slot>.(webp|jpg|png)` — demo photos from the owner's folders, at most 600 KB each.

Every template imports `./store-data`, a file the platform writes at apply time (never authored):

```ts
export const store = { name: "…", tagline: "…", city: "…" } as const;
export const photos: Record<string, string> = { hero: "…", … };   // every declared slot, always a string
```

Values are JSON-encoded (no string pasting into JSX), so a store name like `Café "El <Alto>"` is inert.

## 3. Filling photo slots

Slots are filled in `template.json` order: `hero`/`product` slots take the store's product photos (first photo of
each product, in catalog order), `lifestyle`/`detail` slots take further product photos, and any slot still empty
uses the template's demo photo (bundled into the revision as `assets/template-<id>-<slot>.<ext>`). A published
store still showing demo photos gets a publication warning ("La plantilla todavía muestra fotos de ejemplo"),
never a block.

## 4. Apply

`POST /v1/stores/:storeId/source-project/templates/:templateId { revision }` → a new revision labelled
`Plantilla: <name>`. Same pipeline as a YAPI generation's save: template files + `store-data.tsx` → sanitize →
compile (esbuild) → Next scaffold → kit runtime files → `config.js` (routes, DNA seeded by store id, catalog data,
API and checkout origins) → fonts and assets → `projects.save`. First revision also switches the store to payment
checkout, as the first generation does. No AI call, no credits. Revision conflicts return 409 like every other
save. `GET /v1/store-templates` lists metadata; previews are static images in the Studio (`public/plantillas/<id>.webp`),
captured by a script from the template rendered with its demo photos and a demo catalog.

## 5. Quality bar (automated, per template)

A contract test runs over every template: manifest valid; `validateNextSources` passes; compiles; applied to a demo
store it passes `assertSourceCommerceContract`; rendered in Chromium at 390 and 1280: exactly one h1, the catalog
shows products, add-to-cart opens the cart, product page and checkout render, no horizontal overflow, no console
errors. The visual bar (the research note's list) is reviewed by eye on the preview captures before a template ships.

## 6. Order

A. Engine (package, store-data, apply API, gallery, contract harness, preview capture) with one seed template.
B. Templates in batches from the owner's folders and reference sites — many, across every category.
C. Photo studio on the existing product-scene generator. D. Producto único templates and flow. E. YAPI starts from
the best-matching template.

## 7. Out of scope

Shopify themes (decided 2026-09-25: not now), marketplace/paid templates, merchant-authored templates.
