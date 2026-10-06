# Porting the September 5 generation engine into today's program

Decision of 2026-10-06. The owner wants stores generated the way they were on
2026-09-05, without checking out that commit and losing eight months of platform
work. This spec covers what gets carried across, what stays as it is today, and
what deliberately does not come with it.

## The evidence

A screen recording made 2026-09-05 at 21:12 shows the `Mantecate` store from that
day: an oversized two-tone display headline split across two lines, a rotated
circular sticker badge, numbered section labels (`02 — TU FORMA DE COMERLA`),
serif italic accents, a split hero with a full-bleed photograph, and authored
navigation labels (`LA IDEA`, `CÓMO DISFRUTARLA`, `OFERTA`).

Until 2026-10-06 the live agent prompt read:

> no mandatory comparison table, statistics band, giant two-tone headline,
> numbered archive, chips, dark footer or animation

Three of the devices in the recording appear in that sentence. The sentence was
written to stop the model repeating a default stack and was read as a ban list.

## What the Sep-5 engine is

`apps/api/src/stores/source-generation.service.ts` at commit 26f889c8 is a single
114-line method. Today's `apps/api/src/storefront-source/source-generation.service.ts`
is 1,331 lines. The old method loads store data, bundles uploads, builds an
eight-paragraph prompt, makes one request, validates the returned files and saves
them beside three kit files. There is no plan stage, no schema beyond
`{ label, files[] }`, no critic, no repair pass and no section registry.

Measured instruction volume sent to the model:

| | characters | approx tokens |
|---|---|---|
| Sep-5 prompt | 3,127 | 780 |
| today's contracts (11 of them) | 30,752 | 7,688 |

`SOURCE_NEXT_INSTRUCTIONS` alone is 6,931 characters, more than twice the entire
Sep-5 prompt.

## What carries across

Of the four artefacts that describe the generation, three are already in the tree
from the 2026-10-06 translation work:

| artefact at 26f889c8 | status |
|---|---|
| the eight-paragraph prompt | in `design-engine/sep5-author.ts`, pinned as `sep5-author/26f889c8` |
| `outputSchema` | ported as `SEP5_RESPONSE_SCHEMA` |
| `validateGeneratedSource` | today's is a strict superset; Sep-5 output passes it unchanged (tested) |
| the kit runtime contract | unchanged — see below |

The missing piece is not code. It is that the live engine never sends that
prompt.

### The runtime contract did not break

The Sep-5 prompt names 16 runtime classes for the model to style. Every one is
still present in today's `packages/storefront-kit/kit/commerce.js`, and more
heavily used than in the Sep-5 kit (`menu-item` 1 → 57 occurrences,
`menu-item__image` 1 → 22, `order-items` 1 → 11, `checkout-button` 1 → 15).
Markup authored against the Sep-5 prompt is still rendered correctly by today's
runtime. This was the one condition that could have made a verbatim port
impossible.

## What stays today's

The authored files are the store; everything around them stays current.

- **The kit.** `product.html`, `checkout.html`, `productos.html`, `coleccion.html`,
  `commerce-pages.css`, `commerce.js`, `motion.js`, `privacy.js`, `retention.js`
  and `video.js` were all added after 2026-09-05 and are appended at save time
  (`source-generation.service.ts:1190`), never written by the model. Porting the
  prompt does not give them up.
- Asset bundling and the 6 MB project budget.
- `withSourceFonts`, which installs local font files the Sep-5 stores never had.
- Publishing, metering, and the generation record.

## The defect this fixes

`design-engine/sep5-author.ts` sends `Previous authored source: []` as a
hard-coded empty array. The Sep-5 engine sent the merchant's actual previous
files. Without them every edit re-authors the store from nothing instead of
preserving unrelated copy, navigation and design decisions — which the prompt's
final paragraph explicitly asks it to do.

## Deliberately not in scope

The Sep-5 prompt describes 5 runtime mounts. Today's runtime renders about 32,
including `data-pagosya-account` (customer login), `data-pagosya-reviews`,
`data-pagosya-policies` and `data-pagosya-subscribe`. A store authored from the
ported prompt will not draw those surfaces on its home page. The kit still serves
the pages and the runtime still works; the home page simply will not link them.

Re-adding them means adding prompt text, and prompt volume is the measured
suspect for the flatness this work exists to undo. The sequence is: ship the
faithful port, look at a real store, then decide surface by surface what is worth
the words. The owner asked for all of them; this orders that work rather than
refusing it.

## Model

Not pinned. The owner stated the model is not the variable of interest, so the
run uses whichever model today's plan selects.

## Acceptance

Not a unit test. Regenerate a store from the Mantecate brief with the flag on and
compare it against the 2026-09-05 recording for authored navigation labels, a
display headline that is not a restated tagline, and at least one composed device
(badge, numbered section, split hero). The nine-store measurements in
`docs/SEP5_AUTHORED_PLAN.md` are the quantitative baseline: 7.1 non-neutral
colours and 1,923 characters of body copy per store.

Unit coverage guards drift only: the prompt text stays byte-identical to the
pinned version, previous authored source reaches the prompt on an edit, and a
Sep-5-shaped project still passes the static project contract.
