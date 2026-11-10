# YAPI store tour — design

Owner 2026-11-09: «quisiera hacer que yapi le dé al cliente un tour por su tienda y preguntándole qué le gusta y qué no … sección por
sección y si el cliente le pide cambiar algo lo cambia». Order of work: game prizes by chat (done) → **this** → A/B tests → Merman
cart/checkout → catalogue looks.

## Decisions (owner)
- **Start:** offered when a new store's first build ends («¿Te muestro tu tienda sección por sección?» · Empezar / Ahora no), and on
  request («muéstrame mi tienda», «hazme un tour», or the Studio's «Recorrer mi tienda» button).
- **Each step:** the Studio preview scrolls to the section and highlights it; YAPI writes one line about it and asks «¿Te gusta así o
  cambio algo?» with «Me gusta», «Cámbiala», «Saltar».
- **Route:** header, every home section in order, footer, the first product's page, the subscription popup, the cart (≈ 8–14 steps).
- **«Cámbiala»:** YAPI asks «¿Qué le cambio? Por ejemplo: otra foto, otro texto, más corta, otro color o quitarla.»; the reply runs
  through the existing quick edit focused on that section; YAPI shows the result and asks «¿Así está bien?» (Sí, sigue / Cámbiala otra vez).
- **End:** a summary («Te gustaron 7 secciones, cambiamos 3») and a note of what the merchant disliked, kept on the store.
- **Cost:** touring uses no model call and no credits; only edits cost, as any edit.

## 1. Steps (API, pure: `source-tour.ts`)
`tourSteps(files, popupLook)` → `Array<{ id, kind: 'part' | 'section' | 'product' | 'popup' | 'cart', page: 'home' | 'product', at?: number, part?: 'header' | 'footer', label }>`
from the saved store (master layout via `readMasterState`): header; each home layout block with its library label («Portada», «Productos
destacados», «Opiniones»…); footer; the product page (first active product); the popup («Tu ventana de suscripción — estilo {Nombre}»);
the cart. A store without a readable layout gets header, footer, product, popup, cart.

## 2. State and flow (API: `SourceTourService`)
- Kept as a chat message metadata chain: `tour: { id, steps, at, liked: string[], changed: string[], disliked: string[], done?: true }`
  on YAPI's latest tour message (no table, no migration). The newest unfinished tour is the active one; it resumes where it stopped.
- `offer(storeId)` after the first build (called from the same jobs hook as the popup look; never twice; skipped for stores older than
  3 days). `start(storeId)` on request. `answer(storeId, tourId, 'like' | 'change' | 'skip' | 'ok' | 'again')` from the buttons;
  a merchant message while a step waits for «¿Qué le cambio?» is sent as a normal chat request carrying
  `selection: { area: { sections: [{ page, at }] } }` (or the part / popup / cart focus), so the quick edit changes that section only.
- Each step message: `content` = the line + question; `metadata.tourStep = { id, kind, page, at?, part? }`; buttons as the chat's
  existing answer chips.
- Detection of «muéstrame mi tienda»/«hazme un tour»/«recorre mi tienda» in the chat before the quick edit (a small pattern, Spanish).

## 3. Studio
- On a message with `metadata.tourStep`: scroll the preview to the section (`[data-pagosya-section-index]` / header / footer by part;
  product page navigates to the first product; popup opens «Ver ventana»; cart opens the cart drawer) and outline it (2 px accent ring,
  3 s pulse, reduced motion → still ring). Buttons call `POST /stores/:id/source-project/tour/answer`.
- «Recorrer mi tienda» button in the YAPI panel header → `POST …/tour/start`.

## Error handling
- A step whose section no longer exists (the merchant removed it) is skipped. A failed edit says so and keeps the step («No pude
  cambiarla; ¿probamos otra cosa o seguimos?»). Starting a tour while one is open resumes it. «Ahora no» never re-offers on its own.

## Testing
- `source-tour.spec.ts`: steps from a master layout (order, labels, product, popup with look name, cart); store without layout.
- `source-tour.service.spec.ts`: offer once; start/resume; like/skip advance; change → waiting → edit → ok/again; end summary counts.
- Studio test: a tour step message scrolls/highlights and the buttons post the answer.
- Live: a new test store — first build ends with the offer; walk all steps; change one section by chat; summary.

## Out of scope
Tours of menu pages and the catalogue, voice, tours for shoppers, A/B tests (next project).
