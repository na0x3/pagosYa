# YAPI floating window: the Studio without a side panel

Date: 2026-10-22 · Branch: feature/store-page-architecture · Programme: YAPI crew, project 2 of 4 · Status: awaiting owner review

## Why

Owner 2026-10-22: «eliminate yapi at the side and just put this minimalistic yapi»: the pill «¿Qué quieres crear o mejorar?».
The merchant writes, adds pictures and talks with YAPI in a see-through window they can move, resize, collapse and open to read the
history. The only way out of the page is a semi-transparent X at the top left. «When yapi is changing something make him spin.»
This window is also where the agent crew (project 3) will appear, so it has to hold cards, previews and progress, not only text.

## What exists today (build on it)

- `source-studio.ts` renders the whole Studio with `app.innerHTML` on every change: a top bar, a left `.agent-panel` (chat history,
  setup prompts, plan/style/suggestion cards, build progress, errors, selection, composer) and the preview `main.canvas-panel`
  with its toolbar (Vista previa / Código / Seleccionar, page picker, device, Publicar).
- `source-narrator.ts`: a glass window on `document.body` (so re-renders never touch it), draggable by its header, three sizes,
  close, a «YAPI · Resumen» pill, a star that spins now and then, typed narration, and store-news notices (`notice()`).
- The dashboard opens the Studio in an iframe; `immersive.mjs` flies the merchant's words into the design room.

## Design

### 1. The window is the chat panel, floating

The existing `.agent-panel` becomes the window: same parts, same handlers, so every card, the plan card, the selection editor, the
product form and the build progress keep working. What changes is where it sits and how it looks:

- `position: fixed` over a full-bleed preview; light glass (`backdrop-filter`, ~78 % white, hairline border, soft shadow); 16px
  radius; never covers the floating toolbar.
- **Move:** drag by its header. **Resize:** a corner grip, plus the three narrator sizes (small 320×360, normal 380×520,
  large 480×min(720, 85vh)). **Collapse:** a «–» in the header turns it into the pill.
- Position, size and collapsed state are kept per browser (`localStorage`, try/catch) and re-applied after every render by a
  small controller (`source-yapi-window.ts`) that owns the geometry; `render()` only marks the element.
- **History:** by default the window shows the latest exchange (the last merchant message and what followed). «Ver historial»
  in the header expands the full conversation; it scrolls inside the window.
- **Phone (≤ 600px):** the window is a bottom sheet (drag handle, two heights); the pill sits at the bottom.

### 2. The pill

Collapsed, YAPI is the pill from the owner's screenshot: the star, an input «¿Qué quieres crear o mejorar?», a photo button and a
yellow send button. Sending from the pill sends the message and opens the window on its reply. Dragging the pill moves it (saved).
Store news (`notice()`) appears as a small bubble above the pill, typed, then fades, as today.

### 3. The star spins while YAPI changes something

While a request is building (`building()` true, or a followed job of the merchant's own request is running), the star in the window
header and in the pill turns continuously (1.6 s per turn, linear). It stops, with a short settle, when the job finishes or fails.
With reduced motion it pulses its opacity instead of turning. The narrator's «now and then» spin stays only while idle.

### 4. One window, not two

The narrator's typed narration (plan steps, «Voy a…», summaries) moves into the window's latest-exchange area; the separate
narrator element is not mounted in this layout. Its screen-reader live region stays.

### 5. The page around it

- **Full screen.** The Studio fills the viewport; the dashboard hides its sidebar and top bar while Diseño is open (the iframe
  covers the page). The Studio's own top bar is removed.
- **Exit.** A semi-transparent round X at the top left (40px, 60 % opacity, full on hover/focus, `aria-label="Salir del diseño"`)
  goes back to the dashboard (the same message «← Mis tiendas» sends today). It is the only way out.
- **Floating toolbar.** The preview toolbar becomes a glass bar at the top centre: Vista previa / Código / Seleccionar, the page
  picker, phone/desktop and the store menu. **Publicar** sits on its own at the top right and never fades. The bar fades to 35 %
  after 3 s without the pointer near it and returns on hover, focus or any key.
- The canvas status line («Vista previa · sin cobros») moves into the toolbar as a small label.

### 6. Accessibility

The window is a non-modal `role="dialog"` with `aria-label="YAPI"`; the pill is a form. `Esc` collapses the window to the pill and
focuses the pill input; `/` focuses the YAPI input from anywhere outside a field. The drag header and the grip also move with arrow
keys (10px per press). All controls ≥ 32px; text contrast unchanged.

## Flag

`STUDIO_FLOATING_YAPI`, default on. Off restores today's layout exactly (side panel, top bar, narrator). The Studio reads it from the
config the API already sends it; Playwright suites that depend on the side panel pin it off until they are updated.

## Out of scope

The agent crew (project 3) and its characters; what YAPI says; the dashboard outside the Diseño view.

## Testing

- Unit (vitest): the window controller (saved geometry, clamping inside the viewport after a resize, collapse/expand, keyboard
  moves), the latest-exchange selection, the spin state from build status, the toolbar fade timer, flag off = no controller.
- Playwright (Studio): open a store → window and pill, no side panel; drag and resize persist across a reload; send from the pill →
  window opens with the reply; during a build the star has the spinning class until done; X → back to the dashboard; phone width →
  bottom sheet; reduced motion → pulse, no turn.
- Live: the owner opens goodProtein in the dashboard and works only through the window.
