# YAPI in design mode: the store full screen, YAPI as a pill

Date: 2026-10-22 · Branch: feature/store-page-architecture · Programme: YAPI crew, project 2 of 4 · Status: awaiting owner review (v2)

## Why

Owner 2026-10-22, with two screenshots: the Studio's side panel (← Mis tiendas, a log of «Leyó components/store-data.tsx», «Editó 2
archivos», Modelo, «¿Cómo se navegará tu sitio?», chips, a big composer) — «i want that part gone» — and instead YAPI as the glass
pill «¿Qué quieres crear o mejorar?» inside design mode, «the website full screen to the sides», the pill movable, and «the ai talks
to me on what he's doing». Earlier the same day: the only way out is a semi-transparent X top-left; «when yapi is changing something
make him spin».

## What the merchant sees

```
 (×)                [ Vista previa · Código · Seleccionar · Inicio ▾ · 📱 ]            [ Publicar ]
 ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                                │
 │                         the store, full width, edge to edge                                    │
 │                                                                                                │
 │                    ╭──────────────────────────────────────────╮                                │
 │                    │ ⭐ Estoy poniendo una sección por marca…  │   ← YAPI talks (typed, plain)  │
 │                    ╰──────────────────────────────────────────╯                                │
 │        ╭──────────────────────────────────────────────────────────────────────╮                │
 │        │ ⭐  ¿Qué quieres crear o mejorar?                     ＋   [ Enviar ↗ ] │  ← the pill     │
 │        ╰──────────────────────────────────────────────────────────────────────╯                │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. The side panel is gone

No `.agent-panel`, no Studio top bar. The preview fills the viewport. Removed from view:
- the technical log («Leyó …», «Editó N archivos», file paths) — never shown to a merchant again;
- **Modelo** — always «Auto» (the plan the account has); the choice moves to Ajustes › Conecta tu IA, where it already belongs;
- **«¿Cómo se navegará tu sitio?»** — YAPI keeps the current navigation and asks only when a request changes it;
- the chips (Crear producto / Rediseñar sitio / Mejorar el móvil) — «Crear producto» moves into the pill's ＋ menu; the other two
  are things the merchant can simply say.

### 2. The pill

The glass pill from the dashboard (same look: blurred, light, rounded, the star at the left, yellow button at the right):
- input «¿Qué quieres crear o mejorar?»; Enter or the yellow **Enviar ↗** sends;
- **＋** opens a small menu: *Agregar fotos* (the existing upload, thumbnails appear inside the pill), *Crear producto* (the existing
  product form, opened as a sheet above the pill);
- **movable**: drag it anywhere (pointer or arrow keys); its place is kept per browser; double-click the star returns it to the
  bottom centre. On a phone it stays docked at the bottom, full width.
- a small **Historial** icon in the pill opens the conversation (see 4).

### 3. YAPI talks about what he is doing

Above the pill, a see-through speech bubble (the existing narrator, moved and restyled) shows YAPI in plain Spanish, typed word by
word:
- when a request starts: what he understood («Voy a poner una sección por marca, con los colores de cada empaque.»);
- while he works: one short line per real step, never a file name: reading the store → «Estoy mirando cómo está hecha tu tienda»;
  editing styles → «Estoy cambiando los colores y las letras»; editing a section → «Estoy armando la sección de marcas»; product
  pages → «Estoy ajustando la página de producto»; checks → «Estoy revisando que se vea bien en el celular». Repeated steps collapse
  into one line; at most one new line every ~2 s;
- at the end: the summary («Listo: tu tienda tiene una sección por marca…») and, when there are any, the cards (plan card with
  Construir / Cambiar, style cards, suggestions, «sigue» notes) inside the bubble;
- questions YAPI asks (a new store's setup, a clarification) appear in the bubble with their answer buttons; the merchant answers in
  the pill.

The bubble follows the pill wherever it is moved, hides itself a few seconds after YAPI finishes (cards keep it open until answered
or dismissed), and can be closed with its ×.

### 4. The conversation, when wanted

**Historial** opens a see-through sheet above the pill with the whole conversation (merchant messages, YAPI's replies, cards; no
logs), scrollable, closed with × or Esc. It is the existing chat history rendering, minus the technical log.

### 5. The star spins while YAPI changes something

While a request is building (or a followed job carrying the merchant's own request runs), the star in the pill and in the bubble
turns continuously (1.6 s a turn). It stops with a short settle when the job ends. Reduced motion: a gentle opacity pulse instead.

### 6. The page around it

- **Full screen:** the dashboard hides its sidebar and top bar while design mode is open.
- **Exit:** a semi-transparent round × at the top left (40px, 60 % opacity, full on hover/focus, «Salir del diseño»). The only exit.
- **Tools:** a slim glass bar at the top centre (Vista previa / Código / Seleccionar, page picker, phone/desktop) that fades to 35 %
  after 3 s idle and returns on hover, focus or a key. **Publicar** sits alone at the top right and never fades.
- Selecting a section (Seleccionar) shows «Sobre: <sección>» as a chip inside the pill, so «mejóralo» goes to that section.
- The selection editor, the Boceto board and the code view keep their current screens; only the YAPI parts move into the pill.

### 7. Accessibility

The pill is a `form` with a labelled input; the bubble is a polite live region (finished sentences only); Historial is a non-modal
dialog. `/` focuses the pill from anywhere outside a field; `Esc` closes the bubble or the sheet. Controls ≥ 32px.

## Flag

`STUDIO_YAPI_PILL`, default on. Off restores today's layout exactly. Playwright suites that depend on the side panel pin it off until
they are updated.

## Out of scope

The agent crew (project 3); changes to what YAPI decides; the dashboard outside design mode.

## Testing

- Unit (vitest): plain-language step lines from build progress (every tool kind maps to a sentence; no file path ever appears;
  repeats collapse; rate limit), pill geometry (saved place, clamped after a resize, arrow keys, phone dock), spin state from build
  status, toolbar fade timer, the ＋ menu actions, the selection chip.
- Playwright (Studio): open a store → preview full width, no side panel, pill visible; send from the pill → bubble shows the typed
  plan and step lines with no «Leyó»/file names; star spins until done; a plan card in the bubble builds on Construir; Historial
  shows the conversation; drag the pill → bubble follows, place kept after reload; × → dashboard; phone width → docked pill;
  reduced motion → pulse.
- Live: the owner opens goodProtein and works only through the pill.

## Amendment (plan, 2026-10-22)

The layout switch is the URL, not an API flag: pill mode is on in the embedded Studio (the dashboard's design mode) unless `layout=classic`; the standalone Studio keeps today's layout unless `layout=pill`.
