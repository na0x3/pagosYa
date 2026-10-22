# YAPI plan card: short requests, rich and unique stores

Date: 2026-10-22 · Branch: feature/store-page-architecture · Status: design approved in chat (flow + colour rule), awaiting spec review

## Why

Merchants write «hazme una tienda de proteínas», not the detailed briefs used for test stores. Today a short request becomes the
Plantillas preset closest to the business plus a dice roll that only avoids the hero, palette and fonts of the last six stores, so
stores share sections, and YAPI's own design additions invent colour and decoration (goodProtein #2–#7, all rejected).

Owner's reference set (2026-10-22): approved PEPPA please, Antojo Café, BOXY, NOA VARGAS and the hand-built goodProtein #1;
rejected YAPI's goodProtein #2–#7. Stores should be as rich as Remolino (menu with dropdowns, varied sections, many working
features) without copying it, every store unique, «no random circles drawn, everything makes sense», and not boring.

## Goals

1. A one-line request on any catalog produces a store the owner would put in the approved set.
2. Before anything is built, the merchant sees YAPI's plan in plain words and can build it or change it.
3. No two stores on the platform share their structure (sections, order, menu, card, type, accent).
4. Every visible choice has a reason taken from the store's own data; colour, shapes and motion come from the brand or product on
   screen, never invented.
5. The catalog switches features on by itself (colours → swatches + colour filter + sort, and so on).

Non-goals: new section types beyond what Esencial and the follow-up can already author; payments; the Studio layout (separate
project); the YAPI agents (separate project).

## Flow

```
merchant message
  └─ conversation step classifies it: clear | vague | first build
       clear  → today's path, unchanged
       vague / first build → PLAN (one model call, seconds)
                               → CHECKS (no model call; may re-plan once)
                               → PLAN CARD in the chat: 5–7 lines + Construir / Cambiar
                                    Construir → build from the plan
                                    Cambiar   → merchant writes; YAPI re-plans; card shown again
```

- **First build** of a new store always plans. A detailed first request still plans (for uniqueness and features) but builds at
  once without waiting for the tap; the card is shown as «Esto es lo que hice».
- **Vague edit** («ponlo más bonito», «hazla más moderna», «cambia el estilo», «no me gusta») plans changes against the current
  store; the card lists what will change and the button reads **Hacer cambios**.
- **Clear edit** («cambia el precio», «quita las reseñas») runs as today.

## The plan

A structured object (Zod schema), saved on the assistant message (`metadata.plan`) and on the build's brief so later edits and the
uniqueness check can read it.

```ts
type StorePlan = {
  version: 1;
  parts: Partial<Record<EsencialPart, { id: string; why: string }>>;   // header, announce, hero, grid, card, story, values,
                                                                         // closing, footer, pdp, pdpOrder, button, corners,
                                                                         // density, texture, photos, cards, offers, bands, menu,
                                                                         // filters, feature — ids from esencial/template.json
  sections: { id: EsencialSection | 'custom'; why: string; custom?: CustomSection }[];  // ordered home sections
  palette: { ground: string; ink: string; accent: string; from: string };              // from = where the accent comes from
  fonts: { id: string; why: string };
  features: { id: CatalogFeature; why: string }[];                     // swatches, colour-filter, size-filter, sort, brand-menu,
                                                                         // subscribe, bundles, newsletter, assistant, ticker…
  motif?: { what: string; from: string };                               // e.g. «espiral» from the logo
  card: string[];                                                       // the 5–7 lines shown to the merchant, Spanish
};
type CustomSection = { kind: 'per-brand' | 'per-category' | 'facts' | 'origin' | 'guide'; items: { name: string;
  layout: string; colourFrom?: string }[] };                            // written in the follow-up, like goodProtein #1's brands
```

Custom sections exist so a plan can ask for what goodProtein #1 had: one block per brand or category, each with its own layout
that fits what it says (stats, numbered list, photo with stamp) and its colour taken from its own photos. They are authored by the
existing follow-up step (which now fails out loud and resumes on «sigue», 2026-10-22).

## Checks (deterministic, after the plan call)

1. **Valid parts:** every id exists in Esencial; unknown ids are replaced by the closest valid one.
2. **Reasons:** a part, section, feature or motif with an empty or generic `why` is dropped. Colour: `palette.accent` and any
   custom-section colour need a `from` that names a photo, the logo or a merchant-confirmed brand colour; otherwise the accent comes
   from the logo palette (today's brand-first order) and custom sections stay on the ground colour.
3. **Taste rules:** light ground + ink; one accent for the page chrome; product cards 3–4 per row (`grid` not `feature` unless ≤ 4
   products); no dark text-only band (`closing: dark` needs a photo); no photo groups of 3+ unless asked.
4. **Catalog features**, added when missing:
   - a colour option on 2+ products → card swatches (`swatch-swap`), colour filter, sort;
   - a size option → size filter (+ `sizes` section when sizes vary by product);
   - 3+ brands → brand menu group (`menu: dropdowns`) and a brand section or per-brand custom section;
   - 2+ categories with 3+ products each → `menu: dropdowns`, `filters: sidebar` from 12 products;
   - subscription / bundles / memberships present → their surfaces;
   - more than 8 products → sort.
5. **Uniqueness** (below). One re-plan with the clash named; if it still clashes, the clashing parts are swapped for the nearest
   unused variant.

## Uniqueness

Fingerprint of a plan: ordered section list, each part's variant, menu, card, fonts, accent hue (30° buckets), motif. Compared
against the latest plan (or the one reconstructed from `config.js` master state) of **every other store on the platform**.

- Distance = share of differing fields, sections weighted ×3 (order counts).
- Too close (< 0.35 to any store) → clash; the re-plan prompt names the matching fields («mismo orden de secciones y mismo
  encabezado que otra tienda»), never the other store's name.
- Two stores never get the same section sequence, whatever the distance.
- Index: a small table `StorePlanFingerprint(storeId, fingerprint json, updatedAt)` updated on every saved build; backfilled once
  from existing master stores' config.

## Plan card (Studio)

- One assistant message with `metadata.plan`; the Studio renders the 5–7 `card` lines and the two buttons, reusing the
  «Elige tu estilo» card styles.
- **Construir / Hacer cambios** sends a chat request carrying `planId`; the server builds from the saved plan (no new plan call).
- **Cambiar** focuses the composer; the next message re-plans with the merchant's words plus the previous plan.
- A plan expires when the store gets a newer revision; the buttons then say the plan is outdated.

## Building from the plan

- Esencial parts, palette, fonts, sections and features are applied by the existing master apply/refill (data only, seconds),
  replacing the dice draw.
- Custom sections and the motif go to the follow-up (`ownRequest`), with the plan's lines as its brief.
- The fingerprint row is written when the build saves.

## Failure handling

- Plan call fails → the message says so and keeps the request (`pendingRequest`); «sigue» retries. No silent fallback to the dice.
- No unique plan after the swap step (not expected with 22 parts × variants and 12 sections) → build anyway and log
  `plan_uniqueness_exhausted`.
- Follow-up fails or is cut off → existing unfinished-request note.

## Testing

- Unit: schema parsing, every check (reasons, colour `from`, taste rules, catalog features table), fingerprint distance, clash
  naming, swap step, plan expiry.
- Replay (YAPI record/replay): plan calls for six fixture catalogs: the approved five stores' catalogs and goodProtein's.
- Live eval on the ChatGPT plan, owner-gated: one-line requests on the goodProtein catalog and two new businesses; the owner judges
  against the approved set; the three fingerprints must clash with nothing.

## Open for the plan stage

- Classifier wording for «vague» and its test phrases.
- Exact distance threshold, tuned on the existing dev stores.
