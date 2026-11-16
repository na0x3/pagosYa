# «La tienda que vende sola» + «Tareas de YAPI» — design

Date: 2026-11-16 · Owner decisions 2026-11-15: option A (small automatic changes, each kept only if it sells more, weekly summary +
undo); first version = changes 1, 2, 5, 7, 12, 14; a dashboard catalogue of one-click YAPI jobs like Amboras's card («Homepage design ·
56 min · 500 credits»). Status: APPROVED by the owner 2026-11-16 («yes» to all three open questions: ≥5% over 14 days/300 visits, «Mejora automática» on by default, the draft credit prices) — not built yet.

## Part 1 — La tienda que vende sola

### What the store measures (new + existing)
- Existing events (commerce-src/shared/analytics.js): page_view, product_view, product_card_impression/click, add_to_cart, cart_open,
  checkout_step, pay_click, cta_click, whatsapp_click, search, contact_submit.
- New: `section_view` (a home section ≥50% on screen for ≥1 s, once per visit, with its index and data-section id) and `section_click`
  (a click inside it). Visitors stay anonymous: a random visitor id in localStorage, no personal data, no age.

### The six changes (first version)
| # | Change | Signal | What changes | Kept when |
|---|---|---|---|---|
| 1 | Section order | section views → clicks per section | sections with the best click rate move up one place at a time; the hero and the product row never move | add-to-cart per visit doesn't drop |
| 2 | Best seller first | paid orders (14 days) | the top seller goes first in the product row with «Más vendido» and a feature card high on the home | add-to-cart per visit doesn't drop |
| 5 | Button wording | add_to_cart per product_view | «Agregar» vs «Comprar ahora» vs «Lo quiero» on cards and the product page | the variant gets more adds (A/B) |
| 7 | Sticky buy bar | product_view without add_to_cart after scrolling | the buy button follows the shopper down the product page | add-to-cart per product view rises (A/B) |
| 12 | «Seguir viendo» | returning visitor with product_views | a row of what they looked at last time, near the top | — (always on for returning visitors) |
| 14 | Weekly summary | the tests above | dashboard card: «Subimos el Lemon · Ginger arriba — ventas +12%», each with «Deshacer» | — |

### How a change is tried
- Built on the existing YAPI A/B tests (2026-11-09): one test at a time per store; 50/50 by visitor id; 14 days or 300 visits per
  side, whichever first; kept only if add-to-cart per visit is ≥ 5% better and orders don't drop; otherwise undone automatically.
- Changes 1, 2, 5, 7 are runtime switches in config.js (`config.data.selling = { order, best, buyWord, stickyBuy }`) read by the kit —
  no YAPI call, no rebuild, nothing the merchant's design must change.
- Safety rails: never prices, never offers or codes, never removes a section, never more than one live test; an automatic undo if
  orders drop 20% against the 4 weeks before; the merchant can switch «Mejora automática» off.

### Merchant side
- Dashboard «Inicio» card «Tu tienda esta semana»: the change being tried, the ones kept and undone, each with «Deshacer».
- Store settings: «Mejora automática» on/off (default on for new stores).

## Part 2 — Tareas de YAPI

A dashboard page «Tareas» with one card per job (Amboras's card: picture, name, one-sentence promise, minutes, credits, «Empezar»).
Running jobs show progress («YAPI trabaja · 12 min»); finished ones link to the result.

| Card | Job (exists?) | Minutes | Credits (draft) |
|---|---|---|---|
| Diseño de portada | V2 build: study library + hero brief + menu (yes) | 20–40 | 500 |
| Revisar y mejorar mi tienda | screenshot look + fix (yes) | 15–20 | 250 |
| Página de producto | long product page (yes) | 10 | 150 |
| Fotos sin fondo | product cut-outs (yes) | 2 | 30 |
| Correos de la tienda | store emails (yes) | 5 | 80 |
| Ventana y juego | popup look + Rasca y elige (yes) | 3 | 50 |
| Prueba A/B | design or popup test (yes) | 7 + 14 días | 100 |
| La tienda que vende sola | Part 1 (to build) | siempre | incluida en Pro |

Credits draft from real cost (a home build ≈ $1.8 on the plan) and the plans (Emprendedor 1.500/mes, Pro 5.000/mes); the owner sets
the final prices. Card pictures: one generated or drawn picture per job in the dashboard's style.

## Open questions for the owner
1. The keep-threshold (≥5% better) and test length (14 days / 300 visits) — fine?
2. «Mejora automática» on by default for new stores?
3. Credit prices per card.
