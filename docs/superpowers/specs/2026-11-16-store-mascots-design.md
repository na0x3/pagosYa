# Store mascots — design

Date: 2026-11-16 · Owner: «create little mascots to give a resume of the store», answers: where «Both» (Inicio + YAPI's welcome),
content «Real numbers, friendly words», mascots «YAPI's star family». Design approved in chat («yes»).

## The mascots

Four small siblings of YAPI's star, drawn as inline SVG (the same five-point star with two eyes), each in a colour from the Clyro wash
and owning one topic:

| Kind | Colour | Topic |
|---|---|---|
| `sales` | mint `#bfe5cf` | sales this month |
| `orders` | peach `#f6c9ae` | successful payments |
| `visits` | lilac `#cfd3f2` | store visits |
| `stock` | apricot `#f3d9a6` | low stock, else the next setup step |

Each has a mood that follows its news: `happy` (good news: open eyes, smile), `sleepy` (nothing yet: closed eyes), `worried` (needs
you: open eyes, small wavy mouth). Ink `#17191c` faces; no new image files.

## The summary

Built in the browser from data Inicio already loads — `lastFinances` (`monthlyProjection.monthToDateRevenue`, `paymentCount`,
`totalStoreViews`), `lowStock(links)` (src/restock.mjs) and `setupSteps(...)` (src/overview.mjs). No API change, no AI, no credits.
Amounts go through the panel's `money()`, so «Ocultar montos» hides them here too. Sentences (Spanish, singular/plural right):

- sales — happy «Este mes vendiste {money}.» · sleepy «Aún no hay ventas este mes. Comparte tu tienda para recibir la primera.»
- orders — happy «{n} pago(s) exitoso(s) desde que empezaste.» · sleepy «Tu primer pago aparecerá aquí.»
- visits — happy «{n} visita(s) a tu tienda.» · sleepy «Nadie visitó tu tienda todavía.»
- stock — worried «{n} producto(s) casi agotado(s): {first}.» · else worried «Te falta: {next setup step}.» · else happy «Todo al día: nada por reponer.»

Each item links to the screen that acts on it (Dinero, Pedidos, Clientes, Tienda › Productos, or the setup step's own screen).

## Where it shows

1. **Inicio** — a row of four glass cards under the greeting, each: mascot, sentence, link. The key figures stay below as they are.
   Two columns on a phone.
2. **YAPI's welcome** — a short version under the greeting: up to three mascots (worried first, then happy, then sleepy) with a
   one-line speech bubble each, popping in with a small hop. Hidden until the finances arrive; nothing shows when there is no store.

Motion respects `prefers-reduced-motion`. Text contrast ≥ 4.5:1 (ink on the glass cards / white bubbles).

## Not changing

The API, the existing KPI strip, setup checklist and «Por reponer» card, the welcome's composer and behaviour.

## Checks

Unit tests for the summary in every state (no sales, sales, hidden amounts, low stock, a pending step, all done) and for the SVG moods;
the served-modules test; desktop + phone screenshots of Inicio and the welcome.
