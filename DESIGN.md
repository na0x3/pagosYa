---
name: pagosYa
description: Local-first Bolivian payment infrastructure with distinct checkout, merchant-ledger, and ops expressions.
colors:
  void: "#0a0a0a"
  panel: "#171717"
  border-quiet: "#404040"
  border-firm: "#525252"
  text-primary: "#f5f5f5"
  text-muted: "#a3a3a3"
  text-faint: "#8c8c8c"
  text-faint-light: "#666666"
  signal-amber: "#ffbd59"
  signal-amber-hover: "#ffab2e"
  signal-amber-text: "#241804"
  focus-indigo: "#818cf8"
  focus-indigo-soft: "#1e1b4b"
  focus-violet: "#c084fc"
  success: "#34d399"
  success-soft: "#052e1f"
  warning: "#fbbf24"
  warning-soft: "#2c1a04"
  error: "#f87171"
  error-soft: "#2c0b0b"
  merchant-graphite: "#050505"
  merchant-paper: "#f4f4f5"
  merchant-card: "#ffffff"
  merchant-dark-paper: "#09090b"
  merchant-dark-card: "#18181b"
  merchant-keyline-light: "#fafafa"
  ops-warm-paper: "#eee7dc"
  ops-surface: "#fffaf2"
  workspace-bento-red: "#f87171"
  workspace-bento-blue: "#60a5fa"
  workspace-bento-green: "#4ade80"
  workspace-bento-yellow: "#fbbf24"
  workspace-bento-violet: "#a78bfa"
typography:
  amount:
    fontFamily: "0xProto Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "0xProto Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "1.05rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "0xProto Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
  label:
    fontFamily: "0xProto Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.72rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  merchant-page-title:
    fontFamily: "0xProto Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "clamp(2.25rem, 5vw, 5.1rem)"
    fontWeight: 950
    lineHeight: 0.9
    letterSpacing: "-0.055em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
  merchant-sm: "1px"
  merchant-md: "2px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary-ops:
    backgroundColor: "{colors.signal-amber}"
    textColor: "{colors.signal-amber-text}"
    rounded: "{rounded.merchant-md}"
    padding: "9px 14px"
  button-primary-ops-hover:
    backgroundColor: "{colors.signal-amber-hover}"
  button-primary-merchant:
    backgroundColor: "{colors.signal-amber}"
    textColor: "{colors.signal-amber-text}"
    rounded: "{rounded.merchant-md}"
    padding: "9px 14px"
  merchant-card-light:
    backgroundColor: "{colors.merchant-card}"
    textColor: "{colors.merchant-graphite}"
    rounded: "{rounded.merchant-md}"
    padding: "20px"
  merchant-card-dark:
    backgroundColor: "{colors.merchant-dark-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.merchant-md}"
    padding: "20px"
  ops-workflow-panel:
    backgroundColor: "{colors.ops-surface}"
    textColor: "{colors.merchant-graphite}"
    rounded: "{rounded.merchant-md}"
    padding: "20px"
  ops-workflow-violet:
    backgroundColor: "{colors.workspace-bento-violet}"
    textColor: "{colors.merchant-graphite}"
    rounded: "{rounded.merchant-md}"
    padding: "20px"
  badge:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  merchant-badge:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.merchant-md}"
    padding: "3px 10px"
---

# Design System: pagosYa

## Overview

**Creative North Star: "The Terminal Ledger"**

pagosYa reads like a precise financial tool that happens to render in a developer's terminal, not a fintech marketing site that happens to show numbers. pagosYa-owned surfaces are set in the same monospace face — 0xProto Mono — for headings, labels, buttons, and body copy alike. Hosted storefronts belong to the merchant, so they may select one curated, store-wide type family while pagosYa's own dashboard and payment assurance remain typographically consistent. Numbers get tabular alignment and their own oversized weight so balances, payments, inventory, and settlement remain the most trustworthy objects on screen.

The system is explicitly **surface-aware**. Checkout remains restrained and merchant-deferential because it is frequently embedded inside somebody else's page. The merchant dashboard and Ops share a business-bento material family: warm paper or graphite grounds, pale surfaces, 3px graphite keylines, near-square geometry, hard block shadows, uppercase hierarchy, and purposeful workflow color. Ops applies that family to its compact anchor-led review console and split support desk; it does not inherit the merchant dashboard's page switching or finance composition. The hosted storefront remains a professional, merchant-first lookbook where merchant identity, authored imagery, and catalog content lead while pagosYa recedes to secure-payment assurance.

**Key Characteristics:**
- Monospace-only typography on pagosYa-owned surfaces; merchant storefronts may choose one curated store-wide family
- Business-bento admin family: graphite, warm paper, pale surfaces, workflow color, 3px keylines, 1–2px corners, and 8px hard block shadows
- Checkout remains dark-first with a merchant-compatible light variant; Ops uses Warm Paper (`#eee7dc`) and Pale Surface (`#fffaf2`) with Graphite (`#050505`) structure
- Amber remains pagosYa's brand signal for pagosYa-owned primary actions; workspace bento colors organize merchant-dashboard data and Ops workflow without changing that semantic role
- Hosted storefronts behave like authored merchant lookbooks, not a generic marketplace shell; merchant imagery and merchandising lead the composition
- Checkout retains soft continuous rounding; both admin workspaces use near-square 1–2px corners and square status badges
- The merchant-dashboard default is an agent cockpit: state the goal, follow evidence-backed work, inspect the canonical live storefront, then review or approve deliberately
- Authored merchant-dashboard motion is limited to page/view entrance and finance-chart reveals, and is removed under `prefers-reduced-motion: reduce`

## Colors

The shared semantic core still uses indigo for focus, amber for pagosYa brand actions, and green/yellow/red for status. The two admin workspaces share a five-color business-bento vocabulary over graphite and paper: merchant dashboard uses it for section identity and finance tiles, while Ops uses violet, yellow, red, and blue to distinguish workflow blocks. These fills organize work; they do not replace semantic action or status colors.

### Primary
- **Focus Indigo** (`#818cf8`, soft backdrop `#1e1b4b`): links, focus rings, selected/active states, and checkout's own storefront primary action (as a gradient with Focus Violet). It remains the shared interaction accent beneath each surface's distinct presentation.

### Secondary
- **Signal Amber** (`#ffbd59`, hover `#ffab2e`, on-amber text `#241804`): pagosYa's brand color. Reserved for `merchant-dashboard` and `ops` primary actions — pagosYa's own internal tools are where pagosYa's own brand should show. Never used in checkout.
- **Focus Violet** (`#c084fc`): checkout-only, paired with Focus Indigo as a two-stop gradient for the storefront's "Ir a pagar" cart action.

### Tertiary
- **Workspace Bento Red** (`#f87171`), **Blue** (`#60a5fa`), **Green** (`#4ade80`), **Yellow** (`#fbbf24`), and **Violet** (`#a78bfa`): admin-workspace fills for section identity and work grouping. Merchant dashboard uses all five for navigation, KPI tiles, and real-data chart series; Ops uses violet, yellow, red, and blue as stable workflow identifiers. Contextual fills never replace semantic error, warning, or success treatment, and never carry into checkout.

### Neutral
- **Void** (`#0a0a0a`): the base checkout canvas. A hosted storefront may replace that base only with a merchant-selected solid color.
- **Panel** (`#171717`): checkout card/panel background, including the floating payment card over a merchant's page.
- **Border Quiet** (`#404040`) / **Border Firm** (`#525252`): default and hover/emphasis strokes for checkout and secondary admin controls; primary admin structures instead use a 3px Graphite keyline.
- **Text Primary** (`#f5f5f5`), **Text Muted** (`#a3a3a3`), **Text Faint** (dark `#8c8c8c`, light `#666666`): the shared three-step text hierarchy for checkout and dark merchant-dashboard contexts. Ops uses Graphite for primary text and `text-faint-light` for quiet metadata on paper.
- **Graphite** (`#050505`) and **Merchant Keyline Light** (`#fafafa`): admin-workspace ink and inverse keyline. Merchant-dashboard light mode pairs paper (`#f4f4f5`) with white cards; dark mode pairs near-black paper (`#09090b`) with graphite cards (`#18181b`). Ops pairs Warm Paper (`#eee7dc`) with Pale Surface (`#fffaf2`). Pastel and pale blocks keep Graphite internal keylines so they remain crisp.

### Named Rules

**The Whose-Page-Is-It Rule.** The primary action's color is not fixed — it depends on whose page is showing. pagosYa's own tools (`merchant-dashboard`, `ops`) put pagosYa's amber on the primary button, because it's pagosYa's own surface. Checkout's payment form is usually embedded inside a *merchant's* page (iframe), so its primary button stays neutral (`text-primary` on `panel`, no accent) rather than competing with whatever the host page already looks like. Checkout's own hosted storefront page defaults to the Focus Indigo → Focus Violet gradient as pagosYa's fallback identity, but yields immediately to a merchant's own `accentColor` the moment one is set (`body.has-custom-accent`) — on a merchant's storefront, the merchant's brand wins, not pagosYa's.

**The Merchant Accent Guardrail.** Honor the merchant's chosen hue, but never render the stored hex unchecked: storefront accents below the established lightness floor (HSL `0.35`) are lifted until they remain visible on the dark board, and accent-filled controls choose black or white text from relative luminance so the foreground maintains at least WCAG AA contrast. Derive soft backgrounds, focus rings, and glows from that effective accent rather than introducing additional merchant color fields. Outline and soft controls may retain the effective accent in their border or background, but their text stays on the theme-safe foreground (`text-primary`) — never put an arbitrary merchant accent directly on text.

**The Merchant Ground Rule.** Keep panels anchored to the shared neutral system, and let the hosted storefront's page ground express the merchant through one flat solid color. Never add gradients, stripes, textures, or full-page photography to merchant backgrounds; photography belongs only in authored hero, story, gallery, and product media.

**The Bento-Is-an-Admin-Workspace Rule.** Hard Graphite structure and purposeful bento color belong to merchant dashboard and Ops, expressed through each surface's own information architecture. Checkout continues to defer to merchant branding and never adopts this admin material family.

## Typography

**pagosYa Body/Label/Display Font:** "0xProto Mono" (bold weight only, loaded via `@font-face`), falling back to `ui-monospace, SF Mono, Menlo, monospace`.

**Merchant Storefront Fonts:** one store-wide selection from eight curated, local/system stacks: Moderna (Avenir / system UI), Editorial (Georgia), Cercana (Trebuchet MS / Avenir), Clásica (Palatino / Book Antiqua), Geométrica (Futura / Century Gothic), Artesanal humana (Gill Sans / Candara), Editorial condensada (Avenir Next Condensed / Liberation Sans Narrow), or Lujo clásico (Didot / Bodoni). Do not accept arbitrary font URLs, uploads, or CSS family values. The pagosYa Mono face is reserved for pagosYa-owned product surfaces and is not a storefront option.

**Character:** One face per surface. pagosYa-owned UI always uses 0xProto Mono. A merchant storefront uses exactly one selected family across navigation, story, catalog, prices, and calls to action; hierarchy still comes from size, weight, and spacing rather than mixing families.

### Hierarchy
- **Amount** (700, 30px, line-height 1, -0.02em, tabular numerals): the one true "display" role in the system — a Payment Intent's amount, an order total. Reserved for money; nothing else gets this treatment.
- **Merchant Dashboard Page Title** (950, `clamp(2.25rem, 5vw, 5.1rem)`, line-height 0.9, -0.055em, uppercase): names the currently selected workspace view with poster-scale urgency. On narrow screens it shifts to `clamp(2.2rem, 15vw, 4.15rem)` so the title remains forceful without clipping.
- **Merchant Dashboard Section Heading** (950, `clamp(1.55rem, 3vw, 2.7rem)`, line-height 1, -0.045em, uppercase): opens each operational block and makes the page legible at a glance.
- **Title** (700, ~1.05rem, -0.01em): page/section titles ("pagosYa", "Panel de Comercio", store name).
- **Body** (400, 0.85–0.88rem): default paragraph, table cell, and input text.
- **Label** (700, 0.72rem, +0.02em, uppercase on table headers and badges): field labels, table column headers, status badges.
- **Faint** (400, 0.78–0.8rem, `text-faint`): hints, secondary metadata, timestamps.
- **Ops Workflow Heading** (700–950, 0.72–1.25rem, uppercase): anchor labels, section titles, case state, and operational block names. Keep data and evidence in sentence case or tabular numerals so the uppercase hierarchy signals structure rather than shouting every value.

### Named Rules
**The One Store, One Face Rule.** Never mix type families within a surface. pagosYa-owned UI stays on 0xProto Mono. A hosted storefront may use the merchant's single curated selection, applied consistently to the entire store.

**The Curated-Type Rule.** AI proposals choose one allow-listed storefront font style as part of their art direction and apply it consistently across the store. Merchants can override that choice later from advanced appearance settings; neither path accepts arbitrary font URLs, uploads, or CSS values.

**The Ledger Shouts, the Data Stays Exact Rule.** Merchant-dashboard page and section labels may be oversized, black-weight, and uppercase; transactional values remain tabular, unambiguous, and free of decorative letterforms.

## Layout

No CSS grid framework or shared breakpoint system exists. Responsive coverage is hand-written per surface: `merchant-dashboard` uses 1180px for its appearance studio, 900px for navigation, and 640px for the compact workspace; the checkout storefront uses 720px; ops uses a compact 760px collapse for its navigation, connection controls, and wide data tables. Treat this as an explicit surface contract, not a shared breakpoint scale.

The merchant dashboard is a view-switched workspace inside a canvas capped at 1580px. Its operational destinations use a sticky 250px side rail and a flexible content column separated by a 22–42px gap. The default **Crear** view deliberately compacts that rail to 88px and gives the remaining viewport to an agent cockpit: a 38/62 work-to-preview split, with a store-scoped persistent conversation, the next-instruction composer, and evidence timeline on the left and the existing storefront renderer on the right. Each navigation item reveals one dashboard page rather than returning the user to a single undifferentiated scroll. At 900px and narrower the general rail becomes a full-width horizontal, overflowable navigation strip; the agent cockpit stacks at 820px and narrower in task order—conversation, instruction, timeline, lifecycle, preview, decision—while its approval control becomes a sticky footer seam. At 640px and narrower bento/KPI grids become one column, cards shorten, hard shadows reduce from 8px to 5px, and wide finance comparisons remain explicitly horizontally scrollable. Ops shares this material family but keeps its compact anchor-navigation model and long operational document; do not infer the agent cockpit, merchant page switching, or finance layout for Ops.

Account Support extends Ops as a split case desk: search, case creation, and recent cases occupy a 250–320px rail while the protected dossier uses the flexible pane. At 680px and narrower the desk becomes one column, the rail moves above the dossier with a quiet divider, fact and compact-detail rows reduce to two columns, and action controls keep full-width, touch-safe targets. Keep identity and connection compact in the first viewport so Account Support remains the first operational destination.

The hosted storefront is a spacious merchant lookbook capped at 1360px, while its payment-form card remains capped at 400px. The storefront catalog uses an auto-filling grid above 720px and becomes a deliberate single column at 720px and narrower. Its authored hero holds a cinematic 16:7 ratio on desktop and becomes a portrait 4:5 composition on mobile so imagery and overlaid copy remain useful rather than merely shrinking.

**The Brand-First Storefront Rule.** Production storefronts keep merchant identity, real product data, contact capture, checkout behavior, and pagosYa security boundaries stable. AI proposals choose a complete macro topology rather than merely reordering middle sections: hero, story, catalog, or gallery may establish the opening visual hierarchy, and merchants may move those authored sections directly from the preview. PagosYa chrome never becomes the opening visual hierarchy.

**The Multi-Page Storefront Rule.** Inicio remains the implicit primary page; merchants may add up to six named pages and assign authored sections to each. Header links target stable page IDs while public URLs use a sanitized `?page=<slug>` address that can be copied, refreshed, and marked current. Page deletion returns its content to Inicio. Header structure—brand-left, centered-brand with links left, or split—remains one coherent site-wide choice across every page.

**The Editorial Duo Rule.** A hero or gallery may intentionally pair two images in equal side-by-side frames. Reveal each frame once with opposing clip directions and the shared strong ease; never auto-loop or turn the pair into a carousel. Preserve two columns on narrow screens when the images remain legible, and replace clipping with a short fade under reduced motion.

**The Store Newsletter Rule.** A newsletter belongs in the structured footer, with one large editorial invitation, one email field, one clear submit action, and explicit busy/success/error feedback. Merchant copy is bounded; the renderer and API own validation, throttling, normalization, deduplication, and accessibility.

**The Fulfillment Location Rule.** Keep public location content at the storefront bottom, after appointment booking and immediately before pagosYa's secure-payment assurance. Show one location directly; when there are multiple locations, collapse the full list behind a count-bearing **Ver ubicaciones** disclosure. At checkout, ask for pickup or delivery before the branch, and enable only locations that support the selected method and can fulfill the whole cart from that branch's stock. A closed but otherwise eligible location may still accept the order, but the interface must state that it is closed and show its next local opening or fulfillment time before confirmation.

**The Post-Catalog Experience Rule.** Visual AI assigns one distinct, bounded presentation to the merchant's real editorial media in each proposal: keyboard-controlled `coverflow`, motion-safe `diagonal-marquee`, or tabbed `story-scroller`. The experience always follows products, never invents media, persists as the `experienceStyle` enum, and remains manually editable after a proposal is applied.

The live finance workspace is the merchant dashboard's signature bento: unequal white and pastel blocks create hierarchy around total business revenue, scoped revenue, payment count, inventory value, store views, payment-method distribution, and top products. Every value, bar, donut segment, percentage, and legend amount is bound to the current merchant/store finance response; showcase figures or fabricated demo metrics never enter the production dashboard. The grid collapses without changing metric priority, and narrow views preserve readable comparisons through stacking or an explicitly labeled horizontal overflow region.

**The Goal-to-Evidence-to-Approval Rule.** An agent workspace begins with the merchant's stated outcome, converts real store, catalog, proposal, and publication state into a chronological action sequence, shows the result through the canonical live renderer, and ends at a separate human decision. Preparation never implies application, and application never implies publication.

**The Persistent Revision Rule.** Each storefront keeps one durable conversation owned by pagosYa. Every follow-up turn inherits a named private proposal, records what changed and what was preserved, and creates one new private variant. The thread may help interpret intent, but it never becomes authority to alter products, prices, inventory, checkout, payments, forms, KYC, or publication state.

## Elevation & Depth

Three elevation philosophies coexist, honestly, rather than one shared shadow scale:

- **Merchant dashboard:** panels and KPI cards are physical ledger blocks separated from the ground by an unblurred 8px × 8px shadow in the current keyline color. Active rows use a 4px block shadow, and primary buttons use 3px at rest. At 900px the horizontal navigation container tightens to a 6px shadow; at 640px major cards tighten to 5px so the effect remains deliberate rather than crowding the viewport.
- **Ops:** primary workflow panels use the same zero-blur 8px × 8px Graphite shadow as the merchant dashboard, tightening to 5px on mobile. Nested dossier facts and compact rows stay flat inside their parent so dense evidence does not become a stack of floating cards.
- **Checkout**: flat by default; shadow appears only as a *response* to state — hover lift on a store item card, the floating payment-card container over a merchant's page, or a colored glow under the accent-gradient CTA (`box-shadow` using `color-mix(in srgb, var(--pg-accent) 60%, transparent)`).

### Named Rules
**The Flat-Until-It-Moves Rule (checkout only).** Storefront surfaces stay flat at rest; a shadow only appears on hover, focus, or as the floating-card treatment for an embedded payment form. Don't add resting shadows to new checkout components.

**The Hard Ledger Rule (admin workspaces).** Major merchant-dashboard and Ops blocks use a zero-blur offset shadow and a 3px Graphite keyline. Never soften either admin surface into ambient cards, and never export the block shadow to checkout.

## Shapes

Checkout and storefront keep their soft continuous rounding: 8–9px on inputs/small controls, 10–14px on cards/panels, 16–20px on hero/gallery imagery, true pills (999px) for badges, chips, and filter buttons, and full circles (50%) for avatars/logo marks and stepper buttons. A merchant can opt a storefront into two alternate corner languages via `data-button-style`: `"pill"` (everything rounds to 999px) or `"square"` (radii collapse to 4–8px) — these are per-merchant storefront customization, not system-wide alternatives.

Both admin workspaces deliberately break from that softness: primary containers use 2px corners and 3px keylines; navigation and icon blocks use 1px corners; most inputs, selects, editors, and nested panels resolve to 2px. Circular chart geometry, focus markers, and genuinely round affordances remain circular. Checkout and storefront borders stay thin (1–1.5px) and low-contrast because those surfaces use lines to separate, not to frame.

**The Square-Is-Administrative Rule.** Near-square geometry is the operating character of merchant dashboard and Ops. It does not replace the softer checkout/storefront corner language.

## Components

### Buttons
- **Shape:** merchant-dashboard and Ops buttons use a near-square 2px radius; checkout controls retain the 8–9px control radius; storefronts may opt into their established `pill`/`square` theme variants.
- **Primary (merchant dashboard):** Signal Amber background, on-amber text, 2px graphite/inverse keyline, and a 3px hard block shadow. Fine-pointer hover moves the control up-left and grows the shadow; active press moves it down-right and compresses the shadow.
- **Primary (ops):** Signal Amber background, on-amber text, 2px Graphite keyline, near-square geometry, and a 3px hard block shadow. Fine-pointer hover and active press use the same restrained physical response as merchant-dashboard controls.
- **Primary (checkout payment form):** neutral — `text-primary` on `panel`, 1.5px `border-quiet`. See the Whose-Page-Is-It Rule.
- **Primary (checkout storefront cart CTA):** Focus Indigo → Focus Violet gradient by default, contrast-safe text, colored glow shadow, lifts 2px on hover; merchant-themed solid buttons use computed black/white text, while outline and soft variants use theme-safe text.
- **Secondary/Ghost:** transparent background, `border-firm` (secondary) or no border (ghost), text goes to `text-primary` on hover.
- **Destructive inline actions** (e.g. gallery-thumb remove): filled `error` circle, white icon, no separate "destructive button" variant exists yet — destructive *bulk* actions instead route through a native `confirm()` dialog with explicit "cannot be undone" copy.
- **Pointer cue:** Merchant-dashboard and storefront interactive controls use the 32px Icons8 SF Black hand cursor selected for pagosYa. Use its white rendering on dark surfaces and black rendering on light storefront themes; always retain the native `pointer` fallback. Disabled controls use `not-allowed` rather than implying they can be activated.

### Badges
- **Style:** uppercase semantic label with a 6px `currentColor` leading dot. Merchant-dashboard and Ops badges use 2px corners and a 2px current-color keyline; checkout retains pill badges.
- **State color:** success (green) / warning (amber) / error (red) soft-background pairs, selected by semantic status keyword (`ACTIVE`, `SUCCEEDED`, `REQUIRES_ACTION`, `FAILED`, etc.) via CSS class-per-status rather than inline color logic.

### Cards / Panels
- **Corner Style:** merchant dashboard and Ops 2px; checkout and storefront 10–18px depending on component (see Shapes).
- **Background:** merchant dashboard uses paper/card neutrals plus purposeful pastel section fills; Ops uses Warm Paper with Pale Surface and violet/yellow/red/blue workflow blocks; checkout uses `panel` on `void` or the merchant-selected storefront ground.
- **Border:** admin primary containers use a 3px Graphite keyline; checkout uses 1px `border-quiet`.
- **Shadow:** hard block on both admin workspaces, hover/state-only on checkout (see Elevation).
- **Internal Padding:** 14–20px.
- **Progressive disclosure (merchant dashboard):** Large stacked panels use a visible `Mostrar`/`Ocultar` button with `aria-expanded` and `aria-controls`, and remember each user's open/closed choice locally. Default **Tus Tiendas** and **Productos** open as the primary working set; default secondary panels closed to reduce scanning load.

### Charge Link Workspace (merchant dashboard)
- Keep **Link de cobro** as a dedicated destination under **Operaciones**, separate from **Tiendas**. It owns the selected store's two no-code collection routes: a quick fixed-amount QR for counter sales and a carnet-based debt portal for many payers.
- The debt-portal route accepts pasted rows or an adapted CSV, then keeps active and archived collections, payer lookup, and portal sharing in the same operational workspace. Do not move these tools back into store setup.

### Promo Code Manager (merchant dashboard)
- Keep promo codes scoped to the selected store and inside one business-bento panel: a pastel keylined header, a compact creation row, then one flat list row per code. Each row keeps code, discount value, creation context, and availability legible without opening a detail view.
- Keep disabled codes visible in a subdued state and offer an explicit **Activar** / **Desactivar** action rather than deleting historical context. Copy and share actions stay adjacent to that availability control, use the code itself in their accessible names, and keep at least a 44px target.
- Report create, copy, share, and availability outcomes through a persistent `role="status"` live region. Success and error color may reinforce the message, but the Spanish text remains authoritative; restore focus after a row re-render so the action never strands keyboard users.

### Store Appearance Studio (merchant dashboard)
- Pair the appearance editor with a sticky, sandboxed live storefront preview on wide screens; stack the preview below the editor at 1180px and narrower so the dashboard sidebar never squeezes either workspace.
- Let merchants compare explicit **Escritorio** and **Móvil** preview widths before saving. The device buttons expose pressed state, and unsaved edits update the preview immediately while a separate status communicates whether changes are saved.
- Ask for the desired visual world in plain language and let each AI proposal choose from the curated font and motion enums. Keep technical selectors out of the primary creation flow; expose the persisted enum values only in advanced appearance settings for precise overrides.
- Keep the AI flow inside **Tu tienda**. Entering AI mode replaces the left-hand element inspector with the creative brief and three proposal controls while preserving the storefront preview beside it. Show the first result automatically, switch every option in that same iframe, and label the selected proposal. **Usar y editar** applies the proposal, versions the previous storefront, exits AI mode, and returns the merchant to direct preview editing.
- Group message controls by intent—announcement, promotion, support, store copy, and links—with visible subtitles and explanatory copy. Use 20–26px between groups and 12–18px within a group so proximity communicates structure.

### Agent Action Cockpit (merchant dashboard)
- Make the merchant's outcome the largest input in the work column. Keep a real label, concise suggestion shortcuts, persistent draft text, and explicit copy that no public change occurs without a separate action.
- Keep the persistent conversation and chronological plan distinct. The conversation records merchant intent and proposal lineage; the timeline names the current operational state from live store/catalog/proposal data. Neither may be replaced by a synthetic percentage.
- A first instruction may prepare several directions; once a private proposal exists, a follow-up instruction produces one inherited variant. Show changed and preserved areas in the conversation and let the merchant reopen the linked variant when it still exists.
- Mount the existing storefront preview rather than drawing a decorative duplicate. Keep private preview, applied draft, and public availability as separate lifecycle states; state text is authoritative and pastel color only reinforces it.
- Put the review boundary directly between work and result. Signal Amber marks this human-controlled seam, and its action remains disabled until a real proposal exists. Reviewing may open a private proposal; applying or publishing stays an explicit follow-on decision in the editor.
- Keep the advanced appearance editor as the escape hatch for direct manipulation. The agent organizes the next safe step; it does not silently change prices, inventory, money movement, KYC, bank information, or public availability.

**The Canonical Preview Rule.** Agent work is credible only when the result pane uses the same storefront renderer and real merchant data as the rest of the product. Never substitute a polished mock, invented completion state, or decorative progress metric.

#### AI Storefront Design Contract
- **Atmosphere:** target density 4/10, variance 8/10, and motion 6/10. Select a context-specific combination of editorial luxury, soft structuralism, or restrained technology with an asymmetric split, bento, or clean spatial cascade. Never repeat the same composition across all three options.
- **Narrative topology:** every generated storefront includes a purposeful hero, one bounded two-to-three-chapter Story Scroll, the real product catalog, and a complete contact path, but those sections do not have a fixed sequence. A topology may open with hero, story, catalog, or gallery and must coordinate section order, composition family, width, alignment, media placement, and rhythm as one authored decision. Pair each hero or story scene with one image and meaningful merchant or product copy; never turn the unused asset library into a long image pile or collage. The generated document owns the composition: its hero never inherits compact sizing, insets, or split-media rules from a legacy store layout. Any additional signature experience belongs after the catalog and may not repeat earlier media without a clear editorial reason.
- **Semantic media:** generation and saved recipes request media by purpose, never by copied URL. Resolve featured products, product details, campaign imagery, brand texture, process/story imagery, collection covers, lifestyle imagery, editorial imagery, and logos from the destination merchant's own assets. Never use a logo as the fallback for a photographic role.
- **Originality:** compare content-free structural signatures against the current batch, the merchant's proposal and rollback history, non-selected saved recipes, and recent global signatures. Reject candidates at or above 0.66 similarity and retry through bounded weighted choices; copy, product IDs, and image URLs never count as originality.
- **Color:** use one neutral family and at most one accent below 80% saturation. Never emit pure black (`#000000`), neon purple/blue, outer glows, gradient headline text, or mixed warm/cool gray systems.
- **Typography:** generated storefronts resolve the curated roles to Geist/Satoshi/Cabinet Grotesk-style sans families or a distinctive modern editorial serif such as Instrument Serif/Fraunces. Inter, Roboto, Arial, Helvetica, Times, Georgia, Garamond, and Palatino are not valid creative direction. Body copy stays at least 16px with relaxed leading and a 65ch measure.
- **Hero and layout:** every hero is left-aligned, split, full-bleed, or otherwise asymmetric; centered heroes and edge-to-edge sticky navigation are forbidden. Permit at most one primary hero CTA. Use at least four composition families on a long page, keep content in clean spatial zones, and never fall back to three equal feature cards.
- **Components:** use elevation only when it communicates hierarchy. Elevated elements use concentric shell/core geometry, tint shadows to the page hue, keep labels above form fields, and preserve visible inline loading, empty, and error states. All interactive targets are at least 44px.
- **Motion:** limit each site to two to four coordinated moments using reveal, clip, drift, scale, parallax, story-scroll, or coverflow. Animate transforms and opacity only, use custom weighted easing, never add a continuous marquee by default, and provide a complete reduced-motion result.
- **Responsive:** collapse every multicolumn composition to one column below 768px, keep text and images in normal flow, and prohibit horizontal page scrolling. Mobile must preserve the full catalog, contact path, and checkout behavior.
- **Copy bans:** no emojis, generic placeholder people or companies, fake round-number proof, scroll instructions, or AI clichés such as “Elevate,” “Seamless,” “Unleash,” “Next-Gen,” “Eleva,” “Revoluciona,” or “Sin límites.” Never invent claims, discounts, materials, origin, testimonials, shipping promises, or certifications.

### Yapi Workspace Assistant (merchant dashboard)
- Yapi is a small orange pixel-art bird with dark square glasses. Keep the bird identity, palette, and silhouette consistent across idle, wave, and flying frames. While idle he makes one restrained shake every seven seconds; while dragged or keyboard-moved he switches to the flying pose and faces the current horizontal direction, mirroring cleanly between left and right. Reduced-motion mode removes the ambient shake while preserving the directional pose.
- Treat Yapi as a stationary shopkeeper's desk, anchored to a document position rather than following every scroll. Hiding, closing, or restoring it must preserve the merchant's scroll position.
- Put actionable store signals first: warn when active products or options have 0–5 units and when the selected store has fewer than six unique images across its identity, authored sections, and products.
- Keep **Avisos**, locally persisted **Notas**, and the guided **Agente** as separate tabs. The agent must state that it is automated, must not execute payments or change merchant data, and must preserve a clear human-support handoff.
- Keep **Reportar un problema** as the strategic footer CTA: it opens the in-panel **Soporte** view rather than leaving Yapi or starting an untracked email. The form collects a bounded category and a concise incident summary, disables submission in flight, and reports pending, success, or failure inline.
- Show every merchant support request as a four-step progression — **Pendiente**, **Enviado**, **Revisado**, **Resuelto** — with text labels and an explicit current step. Refresh the list every 30 seconds only while the authenticated page is visible, and refresh again when visibility returns; polling must not move focus or interrupt form entry.
- Use the vibrant business-bento colors as workflow reinforcement: yellow for Pendiente/Enviado and the current step, blue for Revisado, green for Resuelto, and violet for completed prior steps, all with Graphite keylines. Status text remains authoritative; color never carries the progression alone.

**The Visible Handoff Rule.** Human support begins inside Yapi, stays traceable after submission, and keeps its real progress visible until resolution; never replace this path with a dead-end email link or an unlabelled color change.

### Earned Companion Unlock Dialog (merchant dashboard)
- Reserve the large companion reveal for a genuinely earned new level. Use the native modal dialog, show the actual unlocked bird asset at meaningful scale, and let that character speak in warm Spanish copy personalized with the merchant's level and store name.
- Serialize unlocks and wait until onboarding or any other modal closes before presenting the next one; celebrations never stack. Keep each store's unseen unlock pending until the dialog has successfully opened so closing the tab or switching stores cannot silently consume it.
- Use one restrained 250ms opacity-and-scale entrance with the established UI ease. Under `prefers-reduced-motion: reduce`, remove the spatial transform and retain only a brief opacity transition; never loop, bounce, or turn the earned moment into ambient dashboard motion.

**The Earned, Never Stacked Rule.** A companion reveal is a rare acknowledgement of real store progress, not a generic toast or decorative interruption. Present one at a time, after operational dialogs, with a clear **Seguir creciendo** exit.

### Account Support Case Desk (ops)
- Treat support as a traceable case file, never a hidden merchant login. Search may identify a merchant, but no dossier data appears until the reviewer creates or selects a reasoned case.
- Mask sensitive facts in both backend responses and frontend rendering; the interface must not receive or expose passwords, tokens, full tax identifiers, or full bank-account values.
- Put account status, settlement mode, case reason, and masked facts before actions. Use `text-faint` (`#8c8c8c`) only for supporting metadata such as fact labels, case IDs, counts, and timestamps; primary evidence remains brighter.
- Require a written reason before recovery-link or session-revocation actions, confirm disruptive actions, disable controls while requests run, and append each action, note, and resolution to the audit record.
- Keep the split desk within Ops' Warm Paper and Pale Surface world, using 3px Graphite keylines, 8px hard shadows, near-square geometry, Signal Amber primary actions, Focus Indigo focus treatment, and violet/yellow/red/blue workflow coding. Share the business-bento material language without importing merchant page switching or finance composition.

**The Case-Before-Dossier Rule.** Merchant identification is not authorization to inspect the account. A created or selected support case is the gate to masked dossier access, safe actions, notes, and resolution history.

**The Reason-Before-Action Rule.** Every support action that changes account access requires a human-readable reason and a durable audit record; closing sessions additionally requires explicit confirmation.

### Authored Hero Carousel (storefront)
- Merchants may author up to five ordered slides in the appearance studio. Every slide requires imagery and may add a title, short body, and CTA; when no slides exist, fall back to the legacy banner rather than synthesizing promotional content.
- With multiple slides, autoplay advances every 6 seconds, pauses while pointer or keyboard focus is inside the carousel, remains stopped for reduced-motion users, and exposes a persistent **Pausar** / **Reanudar** control for explicit user choice. Previous, next, and direct slide controls remain available independently of autoplay.
- Inactive slides carry `aria-hidden="true"` and every interactive descendant is removed from sequential keyboard navigation (`tabindex="-1"`); restore descendants to the tab order only on the active slide.
- Carousel pagination dots may look visually smaller, but each button keeps a minimum 24px × 24px hit target. Use 16:7 imagery on desktop and recompose to 4:5 at 720px and narrower.

### Category Entry Banners (storefront)
- After a shopper enters a product category, its banner is always the first element in that section, before search, sorting, or products. Keep the **Ver secciones** back action visibly available over the banner.
- Resolve banner media in this order: the category's merchant-uploaded banner, the section's first available product image, the store banner, then the store logo; when none exists, use the guarded merchant accent as the fallback ground.
- Render banner copy in opaque white over a 68% black scrim. Do not reduce text opacity or rely on the source image for contrast.
- A category may show up to four merchant-authored informational labels below its product count. Present them as static high-contrast chips, never interactive buttons, because they communicate claims rather than trigger actions. Do not generate, preselect, or imply delivery, security, warranty, or availability claims on the merchant's behalf.

### AI Post-Catalog Experiences (storefront)
- **Coverflow:** use perspective and explicit previous/next plus arrow-key controls. Keep only the centered card exposed as current to assistive technology and announce the selected position.
- **Diagonal marquee:** duplicate the merchant's existing editorial sequence only for the seamless visual loop. Pause on hover/focus; under reduced motion, remove the duplicate and expose the original sequence as a horizontal snap gallery.
- **Story scroller:** use a roving-tab chapter list paired with one visible panel. Reuse merchant hero MP4/WEBM clips when available and fall back to editorial photography; arrow keys move between chapters, inactive panels stay `aria-hidden`, and the layout stacks below 720px. Autoplay remains muted and stops under reduced motion.
- **Scroll Expansion:** author exactly two ordered images because the effect has two roles: image 1 is the foreground that expands and image 2 is the initial full-canvas background. Never offer six unused slots that the storefront cannot render.
- Keep all three variants flat at rest, inherit the selected storefront font and palette, and render only after the product catalog.

### Storefront Section Composer (merchant dashboard)
- Keep ordinary sections, visual animations, and text animations in visibly separate option groups. Text-only effects never inherit photo requirements from visual effects.
- Expose insertion points at the start, between every pair of sections, and at the end. A merchant chooses the content type from the insertion point itself; do not make them add at a default position and repair the order afterward.
- Place those insertion points directly on the storefront canvas as restrained centered plus controls at each section boundary. The side panel may explain the gesture, but must not duplicate the full list of gaps or compete with the page.
- Ordered animation thumbnails support direct pointer dragging with a visible before/after marker plus Arrow, Home, and End keyboard movement. Reordering moves the whole scene, including its authored copy and layout.
- While preview editing is active, animation CTAs are editor controls rather than live navigation. The whole button is a drag target, a visible grip communicates movement, and selecting it exposes its editable label without following its storefront link.

### Finance Donut (merchant dashboard)
- Treat the donut as one high-signal tile inside the live finance bento: visualize successful-payment revenue by payment method, show the total in the center, and pair colored segments with a textual percentage-and-amount legend; the chart's accessible label must communicate the same real distribution and total.
- Keep the chart and legend side by side, reducing the donut from 156px to 128px at 640px. The surrounding finance bento stacks as space closes; its fixed-width product-bar comparison becomes an explicitly labeled horizontal scroll region rather than compressing labels into illegibility. When revenue is zero, show the neutral ring and explicit empty-state copy instead of an unexplained blank chart.
- Render the donut, revenue bars, KPI tiles, and legend from the same live finance response. The pastel series may repeat cyclically only after the five canonical bento colors are exhausted; never substitute showcase or randomly generated values.
- The donut rotates/scales in and product bars grow from their baseline only when the finance view renders. Remove both reveals under reduced motion.

### MATCHO Hosted Showcase
- `apps/matcho-showcase` is the expressive proof of the hosted-storefront system: retain its tactile coverflow, diagonal image marquee, locally sourced photo-derived video scroller, and bold bento dashboard as four distinct signature moments rather than flattening them into ordinary grids.
- Use only repository-local MATCHO photos and derived video assets for its moving media. Preserve keyboard controls, readable labels, touch interaction, and reduced-motion fallbacks while keeping the merchant story ahead of the product and analytics demonstrations.
- Keep the flavor rail static and directly navigable; it is orientation and wayfinding, not a decorative ticker. Let the featured product span the catalog width on larger screens, then collapse every product to the same readable single-column sequence on small screens.

### Announcements & Promotions (storefront)
- **Announcement marquee:** Keep the band permanently compact (34–37px) and directly below the storefront header on store, category, and product pages. White with graphite text is the default; an explicitly selected merchant color may override it. Duplicate copy only to create the seamless visual loop. Under `prefers-reduced-motion: reduce`, stop the animation and hide the duplicate so one readable announcement remains.
- **Promotion dialog:** Use a true modal (`role="dialog"`, `aria-modal="true"`) with initial focus and a focus trap. Close it through the close button, CTA, backdrop, or Escape; dismissal must not depend on pointer input alone. Merchants may add one optional image, shown full-width above the copy without making the dialog depend on imagery.

### Branded Entry Loader
- On every full dashboard or storefront navigation, show the pagosYa mark and name over a dark full-viewport surface with a slim Signal Amber progress bar while session/store data settles.
- Treat the bar as indeterminate unless real progress exists, provide a timeout escape so it cannot trap the user, and replace movement with a complete static bar under `prefers-reduced-motion: reduce`.
- **Merchant-authored motion:** Every AI-generated signature moment is promoted into the same named, editable animation model as merchant-authored motion, including copy, media, layout, order, type changes, and deletion. Zoom Parallax and the retired depth-gallery effects must not be offered or rendered. An AI-generated page treats the sliding hero, Story Scroll, section motions, its signature experience, and named animations as one inventory: every non-static animation type may appear at most once. A generated duplicate is removed or neutralized to `none`. This generation constraint does not prevent the merchant from adding another animation of the same type manually after applying the proposal.
- **Fresh AI canvas:** A full AI generation never layers the merchant's previous presentation onto the new direction. Proposal preview and apply explicitly reset old banners, decorative backgrounds, promotion presentation, galleries, and animation blocks while preserving store identity, products, prices, inventory, links, locations, and checkout routing. Existing presentation-only imagery enters the generation only when the merchant selects it as input.

### Card Stack Processing Loader
- Use the cycling card stack for bounded, multi-step creative processing such as visual-proposal generation or as an expressive merchant-showcase entry; it does not replace the standard pagosYa navigation loader. Adapt its cards to the active surface palette and label the current operation; under reduced motion, present the stacked state without cycling, pulsing, or spinning.

### Debt Collection State Tabs
- Present active and archived debt collections as two tabs in one stateful view, never as competing stacked sections. Name the consequences directly: **En el portal** means visible and payable; **Archivados** means hidden and restorable.
- Keep the entire collection-status region pastel: pale blue for the shared portal, pale green for active, pale amber for archived/reserved, and pale violet for the tab rail. Graphite text and keylines preserve the business-bento structure and contrast.
- State text remains authoritative. Counts accompany both tabs, and switching tabs preserves each status' independent pagination.

### Product Options (storefront)
- Mark unavailable options disabled and label them **Agotado**. Select the first purchasable option by default, and replace a remembered selection if it becomes unavailable; never make the customer discover availability only after pressing `+` or checkout.

### Product Galleries
- Allow up to ten ordered photos per product. The first remains the cover; merchants can move every photo earlier or later without re-uploading it, and image focus stays paired with the photo while reordering.
- Multi-photo product cards and detail pages expose previous/next buttons in addition to dots or thumbnails. Keep arrows visible on touch devices and reveal them on hover or focus for pointer devices.

### Inputs / Fields
- **Style:** merchant-dashboard and Ops fields use Pale Surface, 2px corners, and a 1.5px Graphite field stroke; checkout uses `panel`, a 1.5px `border-quiet`, and 9px radius. Every surface keeps a real `<label for>` above the field (never a placeholder standing in for a label).
- **Focus:** border shifts to the active accent, plus a visible 3px soft focus ring. Focus Indigo is the default; a merchant-themed storefront derives the ring from its guarded effective accent.
- **Error:** inline text below the field in `error` color, tied to the field, not color-only.

### Tables (admin tools)
- Uppercase 0.72rem `text-faint` column headers, 1.5px bottom border under the header row.
- Rows separated by 1px `border-quiet`, no zebra striping; row hover tints toward `void`.
- Status columns render as Badges, never raw enum text alone.

### Navigation
- **Merchant dashboard:** the primary rail groups **Crear**, **Vender**, **Cobrar**, and **Cumplir** as the recurring merchant journey; progress, store setup, categories, the advanced editor, operations, events, payments, and payouts remain in **Todas las herramientas**. The active destination uses a section-specific pastel fill, dark ink, 2px keyline, and 4px block shadow. The default Crear cockpit uses the compact 88px rail; other views retain the full sticky rail. At 900px and narrower navigation becomes a horizontally scrollable full-width strip rather than a hidden hamburger menu.
- **Ops:** retains its compact sticky anchor rail for reviews, incidents, and audit history; it does not inherit the merchant dashboard's pastel page-switching treatment.
- **Checkout/storefront:** every hosted merchant site shares a white retail header with a 4px black top rule, merchant identity at left, Inicio/Catálogo plus available store sections in the middle, and search/marketplace/cart utilities at right. The header remains merchant-owned—never add global pagosYa product navigation—and becomes a two-row, horizontally scrollable composition on small screens.
- **Public storefront return:** expose **Volver a Mi Tienda** as the labeled person/marketplace utility linking to `/stores/`; keep its accessible name even though the desktop reference uses icon-only utilities. Keep it out of merchant preview and owner-device views, and retain the guarded store accent for hover and the visible 3px focus ring.
- **Image stream:** preserve saved image-stream content as a static, responsive image grid with its authored title and subtitle. Do not animate, duplicate, orbit, or auto-scroll these images.

### Merchant Dashboard View & Chart Motion
- Page changes use one 220ms opacity-and-10px vertical entrance with the overshoot-free UI ease (`cubic-bezier(.23, 1, .32, 1)`).
- Finance bars reveal from `scaleY(.1)` over 520ms with a 55ms per-bar stagger; the donut reveals over 480ms from a subtle counter-rotation and 0.95 scale.
- Under `prefers-reduced-motion: reduce`, page entrance, bar reveal, and donut reveal are all removed. Do not add scroll choreography, looping decoration, or motion to ordinary dashboard data blocks.

## Do's and Don'ts

### Do:
- **Do** set every pagosYa-owned UI element in 0xProto Mono and apply each proposal's curated font style consistently across the entire hosted storefront, including after a merchant overrides it in advanced settings.
- **Do** reserve Signal Amber for pagosYa-owned primary actions; use workspace bento fills for merchant-dashboard data and Ops workflow grouping, never as a replacement for checkout's merchant-deferential action rules.
- **Do** give every status a Badge (dot + semantic color), using square keylined badges in merchant dashboard and Ops and pills in checkout; never expose raw enum text or color-only signaling.
- **Do** use real `<label for>` elements on every form field; placeholders are never a substitute for a label.
- **Do** preserve the authored hero's visible pause/resume control, reduced-motion behavior, inactive-slide tab-order exclusion, and 24px minimum dot targets.
- **Do** keep identity, real product data, contact capture, checkout behavior, and security boundaries stable while allowing the AI and merchant to choose or reorder the full authored section topology, including hero, story, catalog, and gallery openings; keep live finance bento tiles bound to real merchant data.
- **Do** make every AI proposal expose its selected post-catalog experience by name and let the merchant change it without regenerating the site.
- **Do** keep merchant-dashboard authored motion to view entrances and chart reveals, with a complete reduced-motion removal; use plain 0.14–0.15s state transitions only for immediate hover, focus, and press feedback.
- **Do** ground every agent timeline state and evidence disclosure in live merchant data, keep the existing storefront renderer in the result pane, and require a distinct human action before application or publication.
- **Do** preserve the merchant dashboard's 3px keylines, 1–2px corners, and 8px hard block shadow as a coordinated set; they are its primary material signature.
- **Do** preserve Ops' Warm Paper, Pale Surface, Graphite keylines, near-square geometry, and 8px hard shadow as one coordinated visual contract; reduce the shadow to 5px on mobile.
- **Do** gate Account Support dossiers behind a reasoned case, mask sensitive facts at both API and rendering boundaries, and record every access action with its reviewer-supplied reason.
- **Do** keep Yapi support requests in-panel, label all four progress states, and poll for updates every 30 seconds only while the authenticated page is visible.

### Don't:
- **Don't** add a resting (non-hover) shadow to a checkout storefront component — checkout is flat until it moves.
- **Don't** mix font families within one storefront or accept arbitrary font URLs, uploads, or CSS values; use the curated font-style enum.
- **Don't** let a proposal preview use typography that differs from its persisted curated font style, or accept arbitrary font code from either the model or merchant.
- **Don't** use gradients, stripes, textures, or photography as merchant page or section backgrounds; merchant grounds are flat solid colors.
- **Don't** treat workspace bento colors as global action semantics or bring them into checkout; in Ops, violet/yellow/red/blue identify workflow blocks while semantic states still use their named status colors.
- **Don't** ship a new interactive control without a visible 3px focus ring — default to Focus Indigo, or derive it from the guarded effective accent on a merchant-themed storefront. Never remove the native outline without replacing it.
- **Don't** copy the merchant dashboard's page-switching sidebar into ops or checkout without a separate IA decision; each surface keeps its own navigation contract.
- **Don't** let dashboard metrics displace the goal-to-evidence-to-preview sequence in the merchant default, or let a prepared proposal read as applied or published.
- **Don't** add looping, scroll-driven, or decorative animation to merchant-dashboard operations; data should move only when a view enters or a chart resolves, and reduced-motion users get the static final state.
- **Don't** add merchant impersonation, hidden login, unmasked secrets, or an unaudited shortcut to Account Support; recovery and session controls are the bounded safe actions.
