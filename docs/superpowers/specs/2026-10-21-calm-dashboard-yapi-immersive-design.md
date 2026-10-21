# Calm dashboard + YAPI immersive — design

Date: 2026-10-21 · Branch: feature/store-page-architecture · App: `apps/merchant-dashboard` (+ small Studio and API parts in C)

## Why

The merchant dashboard has grown to 24 sidebar entries in 5 groups, a 2,100px Resumen and several forms that ask the
merchant to type by hand what YAPI already writes (brand, policies, email copy). The owner wants a premium, calm place
in the spirit of granola.ai: few options — only what YAPI cannot do — soft rounded shapes, slow motion, and YAPI
presented as the way things get made, with an immersive move into the design tab and a glass window that writes to
the merchant.

## What the owner asked for (2026-10-21)

- Cleaner and more premium overall; find what is unnecessary and what YAPI already does that is also written by hand.
- As few options as possible, keeping what YAPI does not do. Reference: granola.ai.
- No sharp squares; cleaner options with motion and slowness; a calm place.
- Get rid of the Documentos page (Cobros, Propuestas, Contratos).
- Removed things are **hidden, not deleted** (code kept, switchable back on).
- YAPI gets a more premium look. When someone writes to YAPI, bring them immersively into the design tab. YAPI shows a
  semi-transparent glass window with a writing animation that explains things and gives summaries.
- Order agreed: A (declutter) → B (calm look) → C (YAPI immersive). One spec, three plans.

Out of scope: testing memberships with downloadable content (owner raised it the same day — separate test pass after
this programme).

## Audit (live, 2026-10-21, demo-aggregator seed account)

Current sidebar: Resumen · Crecimiento · Tu tienda (Mi tienda, Diseñar sitio, Plantillas, Productos, Medios) · Cobrar
(Link de cobro, Inbox, Pagos, Suscripciones, Desembolsos) · Documentos (Cobros, Propuestas, Contratos) · Crecer (Correos
y marketing, Carritos abandonados, Asistente, Pruebas A/B, Integraciones) · Negocio (Cumplimiento) · Conecta tu IA ·
Ajustes. Plus a «Configurar sitio con IA» button, a «Conecta tu IA» promo card and a footer tagline in the sidebar.

Manual work YAPI already does:

| Where | Today | YAPI equivalent |
|---|---|---|
| Ajustes › Marca (Studio `brand-profile.ts`) | 18 fields: positioning, audience, voice, typography, 5 colours, font files… | `set_account_theme`, brand read at build |
| Ajustes › General › Políticas | 4 textareas | `set_store_policy` |
| Crecimiento › «Escribe tus políticas» | Same policies as a to-do | `set_store_policy` |
| Ajustes › General › Descripción corta | Tagline input | YAPI writes the store copy |
| Correos › Contenido de tus correos | Per-email text editor for 12 emails + «Más llamativo · 25 créditos» | Store emails are AI-authored per store |
| Asistente › Apariencia, Trato | Look and tone settings | Should follow the store look and brand voice |

Duplicates and clutter: Crecimiento vs the Crecer group; «Qué hacer ahora» repeats «Primeros pasos»; Conecta tu IA ×3;
the store is picked in three places (top picker, Mi tienda list, «Administrar tienda» strip); Resumen's finance block
repeats Pagos/Desembolsos; «¿Quién está ingresando?» on every login; Pruebas A/B and Integraciones (4,000px embed) in
the main nav; inventory import always open on top of Productos; Correos y marketing has 8 tabs.

## Part A — Declutter

### A1. Navigation: seven flat items

No collapsible groups. Each item is one page; a page with several screens shows them as pill tabs under its title.

| Item | View ids it holds (existing `data-dashboard-view`) | Pill tabs |
|---|---|---|
| Inicio | `overview` (+ the useful parts of `growth`) | — |
| Tienda | `workspace`, `products`, `media`, `templates` (flag-gated as today), `stores` | Diseño · Productos · Medios · Plantillas · Tus tiendas |
| Pedidos | `payments`, `inbox` | Pedidos · Mensajes |
| Cobrar | `charge-links` | — |
| Dinero | `payouts` + the finance detail moved out of `overview` | — |
| Clientes | `marketing`, `abandoned-carts`, `subscriptions`, `assistant` | Correos · Campañas · Códigos · Clientes · Carritos · Suscripciones · Asistente |
| Ajustes | `store-settings`, `compliance`, `connect-ai`, `integrations`, `experiments` | General · Envíos · Dominio · Cuenta y facturación · Conecta tu IA · Integraciones · Pruebas A/B |

- View ids and hashes stay as they are (`#dashboard-payments` still works); only the menu and page headers change. A
  view belongs to exactly one item, and that item is highlighted when the view shows.
- Correos y marketing's 8 tabs fold into the Clientes pills above. Equipo and Remitente move to Ajustes (Equipo under
  Cuenta y facturación, Remitente under Dominio); Comeback Card stays inside Correos; Registros is hidden.
- The account/profile panel stays behind the avatar in the top bar.

### A2. Hidden behind one switch

Hidden by default, code untouched, shown again when the dashboard runs with `DASHBOARD_FULL_NAV=1`:

- Documentos: `cobros`, `proposals`, `contracts` (menu entries and pages).
- Ajustes › Marca tab (`brand` in `settings-tabs.mjs`).
- Ajustes › General: the four policy textareas and the Descripción corta input.
- Correos: the per-email content editor and «Más llamativo» (the list of emails with on/off stays).
- Asistente: Apariencia and Trato sections.
- Sidebar: «Configurar sitio con IA» button, «Conecta tu IA» promo card, footer tagline, «Desliza para ver más» hint.
- The «Administrar tienda» store strip (`merchantStoreTabs`).
- Correos y marketing › Registros.

Mechanism: `server.mjs` already rewrites `index.html` before serving it (`injectLiveReload`); when
`DASHBOARD_FULL_NAV=1` it also adds `data-full-nav` to `<html>`. Hidden things carry one attribute
(`data-full-nav-only`); one CSS rule hides them unless `<html data-full-nav>`, and the view router checks the same
attribute. A hash that points at a hidden view lands on Inicio. Saving a settings form
with hidden fields keeps their stored values (hidden fields are not sent, or are sent unchanged — never blanked).

### A3. «Pídele a YAPI» replaces removed forms

Where a hidden form used to be, one quiet line: «Tus políticas las escribe YAPI. **Pídele a YAPI** →». It opens YAPI
(Part C's move) with the request prefilled, e.g. «Escribe mi política de cambios y devoluciones». Used for: policies,
brand/colours (Ajustes › General, where Marca was), email copy (Correos), assistant look/tone (Asistente).

### A4. Inicio

One short page, top to bottom:

1. Greeting (serif) + the store picker is the top bar's, not repeated here.
2. Four numbers: Ventas este mes, Ventas totales, Pagos exitosos, Visitas.
3. One «Siguiente paso» card — the first unfinished item of today's Primeros pasos, else the top Crecimiento insight.
4. Saldo por desembolsar + KYC / Facturación status, link to Dinero.
5. One sales chart (7/30/90 days) from Crecimiento.

Moves to Dinero: Finanzas bento, Proyección mensual, Días con más ventas, Ingresos por medio de pago, CSV/PDF downloads.
Moves to Tienda › Productos: Productos más vendidos. Pagos internacionales stays on Inicio only while it needs action
(«Solicitar activación»), then on Dinero.

### A5. Smaller cuts

- «¿Quién está ingresando?» shows only when the account already has two or more session profiles; otherwise the session
  takes the account's name.
- Productos: the inventory import collapses into one «Importar inventario» button that opens it.
- Page header: title + one line of description; the «Panel de comercio» kicker goes.

## Part B — Calm look

Mostly a token change in `src/calm.css` plus the shared controls in `src/ui-kit.css`, so every remaining screen moves
together. Studio-embedded tabs (Diseño, Medios, Integraciones…) pick up the same tokens through the Studio's embedded
stylesheet where it already reads dashboard tokens; anything that doesn't is listed in the plan, not left to drift.

- **Surfaces:** page `#f7f5f0`-family warm off-white; cards solid white, borders at very low contrast, shadows barely
  there. No glass outside YAPI (Part C).
- **Type:** headings in Instrument Serif (OFL, self-hosted in `fonts/`, `font-display: swap`); body and numbers stay the
  system sans with tabular numbers.
- **Shapes:** no sharp corners — cards 20px, inputs/selects 14px, buttons, tabs and badges full pills. Sidebar items are
  pills; the active one is a soft filled pill, not a bar.
- **Colour:** one muted ink accent for actions; pagosYa yellow is reserved for YAPI (dock, star, «Pídele a YAPI»), so
  yellow always means YAPI. Success/warning/error stay but softened.
- **Space:** larger page padding and gaps; content max-width so lines stay readable on wide screens.
- **Motion:** pages fade + rise 8px over ~500ms (`cubic-bezier(.22,1,.36,1)`), cards stagger by 40ms, hover/press
  transitions ~200ms; nothing bounces or snaps. `prefers-reduced-motion: reduce` → no movement, instant or plain fade.

## Part C — YAPI immersive

### C1. The dock

The existing `aside.workspace-yapi` becomes a floating glass pill (blurred, semi-transparent, soft border, YAPI star)
centred at the bottom of dashboard pages. Same form, same `pendingStudioAction` → `compose` flow.

### C2. The move into Diseño

On submit:

1. The sidebar fades and slides left; the page content dissolves.
2. Tienda › Diseño (the Studio frame) fades in full screen.
3. The typed text travels from the dock into YAPI's glass window as its first line.

~700ms total, View Transitions API where supported; a plain cross-fade elsewhere (Firefox today) and under reduced
motion. Unsaved-work guard (`canLeaveMerchantStudio`) behaves as today. «Pídele a YAPI» links (A3) use the same move.

### C3. The glass window

A semi-transparent, blurred card floating over the live preview (bottom-left, out of the way of the page being
designed). It writes slowly — word by word with a soft fade-in, ~28 characters per second — and a click on it finishes
the current sentence at once.

What it says, all from text YAPI already produces:

- **Before:** «Esto es lo que voy a hacer:» + YAPI's plan, one line per requirement.
- **During:** one calm sentence per progress step (existing step labels, e.g. «Estoy eligiendo los colores…»).
- **After:** «Listo.» + YAPI's `finish` summary (1–3 sentences) + the sections it built. Partial/failed runs say so
  plainly with what is left (`remaining`).

When the run ends the window shrinks to a small glass pill («YAPI · Resumen») that reopens it. The detailed step list
(`source-build-progress.ts`) stays available behind «Ver detalles» inside the window.

Accessibility: an `aria-live="polite"` region receives each finished sentence once, never per word; the animation is
skipped under reduced motion; the window is keyboard reachable and dismissable with Escape.

### C4. API change

`plan_task` today reports only «Planificó N requisitos» (`agent-tools.ts:299`). Add each requirement's description as
a step detail so the window can write the plan. No new model calls; descriptions are merchant-language text YAPI
already writes. The `finish` summary and sections are stored on the run (`agent-tools.ts:461`); the window reads them
from the same job result the Studio already shows as YAPI's reply. If that result does not carry `sections`/`remaining`
to the Studio today, C4 adds them to it.

## Testing

- Unit (node:test, existing style): menu has seven items; every view id maps to exactly one item; hidden items carry
  `data-full-nav-only` and show with the switch on; hidden hash lands on Inicio; settings save keeps hidden fields'
  stored values; «Pídele a YAPI» builds the right prefilled request; typewriter splits and finishes on click; live
  region receives whole sentences; reduced motion skips the animation.
- API: `plan_task` step carries requirement descriptions (agent-tools spec).
- Live check in the browser on the seed account: walk all seven items, the switch on and off, a real YAPI request from
  the dock through the move, the window's three phases, and Firefox/reduced-motion fallbacks.
- Dashboard full test suite and the API agent specs stay green (API jest with limited workers).

## Risks

- Hiding fields must never blank stored data (A2) — covered by a test.
- Studio-embedded tabs may not read the new tokens and look out of place next to the calm shell; the plan lists each.
- Saving `apps/api` restarts the API and kills running YAPI jobs — check for RUNNING jobs before C4 edits.
- The Studio is pre-built into the dashboard; Studio changes need `build:studio` before a live check.

## Plans and planning-time corrections

- Part A plan: `docs/superpowers/plans/2026-10-21-calm-dashboard-a-declutter.md`. Parts B and C get their own plans after A ships.
- Corrections found in the code while planning Part A (they override A1, A3, A4, A5 above):
  - Crecimiento is a pill under Inicio («Resumen · Crecimiento») rather than merged into one page.
  - Equipo and Remitente are Ajustes pills; Comeback is a Clientes pill.
  - The inventory import is already a closed disclosure; no change.
  - «Pídele a YAPI» appears only for policies and colours/type. YAPI's design agent cannot edit store emails or the
    assistant's look, so those editors are hidden without a YAPI line.
