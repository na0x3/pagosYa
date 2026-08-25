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

**Merchant Storefront Fonts:** one store-wide selection from four curated, local/system stacks: PagosYa Mono (`0xProto Mono`), Moderna (Avenir / system UI), Editorial (Georgia), or Cercana (Trebuchet MS / Avenir). Do not accept arbitrary font URLs, uploads, or CSS family values.

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

**The Font-Is-Fixed Rule.** The AI appearance chooser renders each option in the exact family stack it will publish. Once the merchant chooses a font, that choice is fixed across all generated proposals, their previews, and the resulting storefront; the AI may vary composition, color, and copy, but never the selected family.

**The Ledger Shouts, the Data Stays Exact Rule.** Merchant-dashboard page and section labels may be oversized, black-weight, and uppercase; transactional values remain tabular, unambiguous, and free of decorative letterforms.

## Layout

No CSS grid framework or shared breakpoint system exists. Responsive coverage is hand-written per surface: `merchant-dashboard` uses 1180px for its appearance studio, 900px for navigation, and 640px for the compact workspace; the checkout storefront uses 720px; ops uses a compact 760px collapse for its navigation, connection controls, and wide data tables. Treat this as an explicit surface contract, not a shared breakpoint scale.

The merchant dashboard is a view-switched workspace inside a canvas capped at 1580px. Above 900px it uses a sticky 250px side rail and a flexible content column separated by a 22–42px gap. Each navigation item reveals one dashboard page rather than returning the user to a single undifferentiated scroll. At 900px and narrower the rail becomes a full-width horizontal, overflowable navigation strip; at 640px and narrower bento/KPI grids become one column, cards shorten, hard shadows reduce from 8px to 5px, and wide finance comparisons remain explicitly horizontally scrollable. Ops shares this material family but keeps its compact anchor-navigation model and long operational document; do not infer merchant page switching or finance layout for Ops.

Account Support extends Ops as a split case desk: search, case creation, and recent cases occupy a 250–320px rail while the protected dossier uses the flexible pane. At 680px and narrower the desk becomes one column, the rail moves above the dossier with a quiet divider, fact and compact-detail rows reduce to two columns, and action controls keep full-width, touch-safe targets. Keep identity and connection compact in the first viewport so Account Support remains the first operational destination.

The hosted storefront is a spacious merchant lookbook capped at 1360px, while its payment-form card remains capped at 400px. The storefront catalog uses an auto-filling grid above 720px and becomes a deliberate single column at 720px and narrower. Its authored hero holds a cinematic 16:7 ratio on desktop and becomes a portrait 4:5 composition on mobile so imagery and overlaid copy remain useful rather than merely shrinking.

**The Brand-First Storefront Rule.** Production storefronts keep one fixed narrative order: merchant identity, hero, and about/story before products; editorial gallery and merchant links after products. Appearance proposals may vary the composition inside those sections, but neither the AI nor the merchant editor may reorder them, and pagosYa chrome never becomes the opening visual hierarchy.

**The Fulfillment Location Rule.** Keep public location content at the storefront bottom, after appointment booking and immediately before pagosYa's secure-payment assurance. Show one location directly; when there are multiple locations, collapse the full list behind a count-bearing **Ver ubicaciones** disclosure. At checkout, ask for pickup or delivery before the branch, and enable only locations that support the selected method and can fulfill the whole cart from that branch's stock. A closed but otherwise eligible location may still accept the order, but the interface must state that it is closed and show its next local opening or fulfillment time before confirmation.

**The Post-Catalog Experience Rule.** Visual AI assigns one distinct, bounded presentation to the merchant's real editorial media in each proposal: keyboard-controlled `coverflow`, motion-safe `diagonal-marquee`, or tabbed `story-scroller`. The experience always follows products, never invents media, persists as the `experienceStyle` enum, and remains manually editable after a proposal is applied.

The live finance workspace is the merchant dashboard's signature bento: unequal white and pastel blocks create hierarchy around total business revenue, scoped revenue, payment count, inventory value, store views, payment-method distribution, and top products. Every value, bar, donut segment, percentage, and legend amount is bound to the current merchant/store finance response; showcase figures or fabricated demo metrics never enter the production dashboard. The grid collapses without changing metric priority, and narrow views preserve readable comparisons through stacking or an explicitly labeled horizontal overflow region.

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
- Offer the four named storefront font styles as a curated selector, with every option rendered in its exact publication family. Apply the unsaved choice to the whole preview immediately, lock it across every AI proposal, and persist only the enum value, never free-form CSS.
- Group message controls by intent—announcement, promotion, support, store copy, and links—with visible subtitles and explanatory copy. Use 20–26px between groups and 12–18px within a group so proximity communicates structure.

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
- Resolve banner media in this order: the section's first available product image, then the store banner, then the store logo; when none exists, use the guarded merchant accent as the fallback ground.
- Render banner copy in opaque white over a 68% black scrim. Do not reduce text opacity or rely on the source image for contrast.

### AI Post-Catalog Experiences (storefront)
- **Coverflow:** use perspective and explicit previous/next plus arrow-key controls. Keep only the centered card exposed as current to assistive technology and announce the selected position.
- **Diagonal marquee:** duplicate the merchant's existing editorial sequence only for the seamless visual loop. Pause on hover/focus; under reduced motion, remove the duplicate and expose the original sequence as a horizontal snap gallery.
- **Story scroller:** use a roving-tab chapter list paired with one visible panel. Reuse merchant hero MP4/WEBM clips when available and fall back to editorial photography; arrow keys move between chapters, inactive panels stay `aria-hidden`, and the layout stacks below 720px. Autoplay remains muted and stops under reduced motion.
- Keep all three variants flat at rest, inherit the selected storefront font and palette, and render only after the product catalog.

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
- **Announcement marquee:** Duplicate copy only to create the seamless visual loop. Under `prefers-reduced-motion: reduce`, stop the animation and hide the duplicate so one readable announcement remains.
- **Promotion dialog:** Use a true modal (`role="dialog"`, `aria-modal="true"`) with initial focus and a focus trap. Close it through the close button, CTA, backdrop, or Escape; dismissal must not depend on pointer input alone. Merchants may add one optional image, shown full-width above the copy without making the dialog depend on imagery.

### Branded Entry Loader
- On every full dashboard or storefront navigation, show the pagosYa mark and name over a dark full-viewport surface with a slim Signal Amber progress bar while session/store data settles.
- Treat the bar as indeterminate unless real progress exists, provide a timeout escape so it cannot trap the user, and replace movement with a complete static bar under `prefers-reduced-motion: reduce`.
- **Merchant motion duo:** Story Scroll and Zoom Parallax are an opt-in pair for post-catalog brand storytelling. They must use merchant-owned media, animate transforms only, appear in the live/proposal preview before save or apply, and collapse into a readable static grid under `prefers-reduced-motion: reduce`.

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
- **Merchant dashboard:** a sticky, hard-shadowed side rail switches among Resumen, Tiendas, Categorías, Productos, Apariencia, Pagos, Desembolsos, and Cumplimiento. The active destination uses a section-specific pastel fill, dark ink, 2px keyline, and 4px block shadow. At 900px and narrower the rail becomes a horizontally scrollable full-width strip with a visible swipe hint; it does not collapse into a hidden hamburger menu.
- **Ops:** retains its compact sticky anchor rail for reviews, incidents, and audit history; it does not inherit the merchant dashboard's pastel page-switching treatment.
- **Checkout/storefront:** no global pagosYa navigation; the storefront uses its sticky search/filter toolbar and sticky cart bar.
- **Public storefront return:** every customer-facing store begins with a visible **Volver a Mi Tienda** link to `/stores/`, before announcements and merchant identity, so shoppers can resume browsing the marketplace immediately. Keep it out of merchant preview and owner-device views. Treat it as a flat, merchant-deferential text control with a quiet 1px divider, no resting shadow, and the guarded store accent reserved for hover and the visible 3px focus ring.

### Merchant Dashboard View & Chart Motion
- Page changes use one 220ms opacity-and-10px vertical entrance with the overshoot-free UI ease (`cubic-bezier(.23, 1, .32, 1)`).
- Finance bars reveal from `scaleY(.1)` over 520ms with a 55ms per-bar stagger; the donut reveals over 480ms from a subtle counter-rotation and 0.95 scale.
- Under `prefers-reduced-motion: reduce`, page entrance, bar reveal, and donut reveal are all removed. Do not add scroll choreography, looping decoration, or motion to ordinary dashboard data blocks.

## Do's and Don'ts

### Do:
- **Do** set every pagosYa-owned UI element in 0xProto Mono and apply a merchant's selected family consistently across their entire hosted storefront.
- **Do** reserve Signal Amber for pagosYa-owned primary actions; use workspace bento fills for merchant-dashboard data and Ops workflow grouping, never as a replacement for checkout's merchant-deferential action rules.
- **Do** give every status a Badge (dot + semantic color), using square keylined badges in merchant dashboard and Ops and pills in checkout; never expose raw enum text or color-only signaling.
- **Do** use real `<label for>` elements on every form field; placeholders are never a substitute for a label.
- **Do** preserve the authored hero's visible pause/resume control, reduced-motion behavior, inactive-slide tab-order exclusion, and 24px minimum dot targets.
- **Do** keep production storefronts ordered hero/about, then products, then gallery/links, and keep live finance bento tiles bound to real merchant data.
- **Do** make every AI proposal expose its selected post-catalog experience by name and let the merchant change it without regenerating the site.
- **Do** keep merchant-dashboard authored motion to view entrances and chart reveals, with a complete reduced-motion removal; use plain 0.14–0.15s state transitions only for immediate hover, focus, and press feedback.
- **Do** preserve the merchant dashboard's 3px keylines, 1–2px corners, and 8px hard block shadow as a coordinated set; they are its primary material signature.
- **Do** preserve Ops' Warm Paper, Pale Surface, Graphite keylines, near-square geometry, and 8px hard shadow as one coordinated visual contract; reduce the shadow to 5px on mobile.
- **Do** gate Account Support dossiers behind a reasoned case, mask sensitive facts at both API and rendering boundaries, and record every access action with its reviewer-supplied reason.
- **Do** keep Yapi support requests in-panel, label all four progress states, and poll for updates every 30 seconds only while the authenticated page is visible.

### Don't:
- **Don't** add a resting (non-hover) shadow to a checkout storefront component — checkout is flat until it moves.
- **Don't** mix font families within one storefront or accept arbitrary font URLs, uploads, or CSS values; use the curated font-style enum.
- **Don't** let AI proposals override the merchant's chosen font or show a font sample that differs from the exact family that will be published.
- **Don't** use gradients, stripes, textures, or photography as merchant page or section backgrounds; merchant grounds are flat solid colors.
- **Don't** treat workspace bento colors as global action semantics or bring them into checkout; in Ops, violet/yellow/red/blue identify workflow blocks while semantic states still use their named status colors.
- **Don't** ship a new interactive control without a visible 3px focus ring — default to Focus Indigo, or derive it from the guarded effective accent on a merchant-themed storefront. Never remove the native outline without replacing it.
- **Don't** copy the merchant dashboard's page-switching sidebar into ops or checkout without a separate IA decision; each surface keeps its own navigation contract.
- **Don't** add looping, scroll-driven, or decorative animation to merchant-dashboard operations; data should move only when a view enters or a chart resolves, and reduced-motion users get the static final state.
- **Don't** add merchant impersonation, hidden login, unmasked secrets, or an unaudited shortcut to Account Support; recovery and session controls are the bounded safe actions.
