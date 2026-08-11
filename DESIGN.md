---
name: pagosYa
description: Local-first Bolivian payment infrastructure, styled like a precise financial terminal.
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
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary-admin:
    backgroundColor: "{colors.signal-amber}"
    textColor: "{colors.signal-amber-text}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
  button-primary-admin-hover:
    backgroundColor: "{colors.signal-amber-hover}"
  badge:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
---

# Design System: pagosYa

## Overview

**Creative North Star: "The Terminal Ledger"**

pagosYa reads like a precise financial tool that happens to render in a developer's terminal, not a fintech marketing site that happens to show numbers. pagosYa-owned surfaces are set in the same monospace face — 0xProto Mono — for headings, labels, buttons, and body copy alike. Hosted storefronts belong to the merchant, so they may select one curated, store-wide type family while pagosYa's own dashboard and payment assurance remain typographically consistent. Dark is the resting state everywhere. Color is spent sparingly: a single indigo (`#818cf8`) carries focus rings and links, a single amber (`#ffbd59`) is pagosYa's own brand signal, and status colors (success/warning/error) are the only other saturation allowed in. Numbers get tabular alignment and their own oversized weight; everything else stays quiet so the numbers can be trusted.

The system is explicitly **context-aware about whose brand is on screen** — see the Whose-Page-Is-It Rule under Colors. This is not incidental restraint; it's load-bearing, since pagosYa's checkout is frequently embedded inside a merchant's own page. The hosted storefront extends this incumbent world into a professional, merchant-first lookbook: merchant identity, authored imagery, and catalog content lead, while pagosYa recedes to the secure-payment assurance.

**Key Characteristics:**
- Monospace-only typography on pagosYa-owned surfaces; merchant storefronts may choose one curated store-wide family
- Dark-first; checkout is the only surface with a light variant, and only for contrast over a merchant's own photo background
- Amber is pagosYa's brand signal, reserved for pagosYa's own tools — not used as checkout's default primary action color
- Hosted storefronts behave like authored merchant lookbooks, not a generic marketplace shell; merchant imagery and merchandising lead the composition
- Soft, continuous rounding (8–20px) plus true pills (999px) for chips/badges/status pills; no sharp corners except the opt-in "square" merchant theme variant
- Motion is fast and utilitarian (0.15s ease) for color/border state changes; a single signature overshoot-free ease (`cubic-bezier(0.22, 1, 0.36, 1)`) marks the larger, more expressive transitions (card hover lift, entrance stagger)

## Colors

Two-color-family system: one cool accent (indigo) for interactive/focus state, one warm accent (amber) reserved for pagosYa's own brand presence, plus a standard three-color status set.

### Primary
- **Focus Indigo** (`#818cf8`, soft backdrop `#1e1b4b`): links, focus rings, selected/active states, and checkout's own storefront primary action (as a gradient with Focus Violet). Used everywhere across all three surfaces — the one color truly shared identically by checkout, merchant-dashboard, and ops.

### Secondary
- **Signal Amber** (`#ffbd59`, hover `#ffab2e`, on-amber text `#241804`): pagosYa's brand color. Reserved for `merchant-dashboard` and `ops` primary actions — pagosYa's own internal tools are where pagosYa's own brand should show. Never used in checkout.
- **Focus Violet** (`#c084fc`): checkout-only, paired with Focus Indigo as a two-stop gradient for the storefront's "Ir a pagar" cart action.

### Neutral
- **Void** (`#0a0a0a`): page background on both admin surfaces and the base checkout canvas. Hosted storefronts may shift that canvas through the merchant-selected board material: chalkboard (`#11100f`), kraft (`#211c17`), or a restrained accent-tinted painted ground.
- **Panel** (`#171717`): card/panel background across the admin surfaces and checkout, including the floating payment card over a merchant's page.
- **Border Quiet** (`#404040`) / **Border Firm** (`#525252`): default and hover/emphasis border weight, identical across all three surfaces.
- **Text Primary** (`#f5f5f5`), **Text Muted** (`#a3a3a3`), **Text Faint** (dark `#8c8c8c`, light `#666666`): the three-step text hierarchy. The faint step is theme-specific so small metadata stays legible in both checkout themes; admin surfaces use the dark value.

### Named Rules

**The Whose-Page-Is-It Rule.** The primary action's color is not fixed — it depends on whose page is showing. pagosYa's own tools (`merchant-dashboard`, `ops`) put pagosYa's amber on the primary button, because it's pagosYa's own surface. Checkout's payment form is usually embedded inside a *merchant's* page (iframe), so its primary button stays neutral (`text-primary` on `panel`, no accent) rather than competing with whatever the host page already looks like. Checkout's own hosted storefront page defaults to the Focus Indigo → Focus Violet gradient as pagosYa's fallback identity, but yields immediately to a merchant's own `accentColor` the moment one is set (`body.has-custom-accent`) — on a merchant's storefront, the merchant's brand wins, not pagosYa's.

**The Merchant Accent Guardrail.** Honor the merchant's chosen hue, but never render the stored hex unchecked: storefront accents below the established lightness floor (HSL `0.35`) are lifted until they remain visible on the dark board, and accent-filled controls choose black or white text from relative luminance so the foreground maintains at least WCAG AA contrast. Derive soft backgrounds, focus rings, and glows from that effective accent rather than introducing additional merchant color fields. Outline and soft controls may retain the effective accent in their border or background, but their text stays on the theme-safe foreground (`text-primary`) — never put an arbitrary merchant accent directly on text.

**The Merchant Ground Rule.** Keep panels anchored to the shared neutral system, but let the hosted storefront's page ground express the merchant's selected board material. Texture may warm or tint the canvas; it must not compete with product imagery, copy, or the merchant accent.

## Typography

**pagosYa Body/Label/Display Font:** "0xProto Mono" (bold weight only, loaded via `@font-face`), falling back to `ui-monospace, SF Mono, Menlo, monospace`.

**Merchant Storefront Fonts:** one store-wide selection from four curated, local/system stacks: PagosYa Mono (`0xProto Mono`), Moderna (Avenir / system UI), Editorial (Georgia), or Cercana (Trebuchet MS / Avenir). Do not accept arbitrary font URLs, uploads, or CSS family values.

**Character:** One face per surface. pagosYa-owned UI always uses 0xProto Mono. A merchant storefront uses exactly one selected family across navigation, story, catalog, prices, and calls to action; hierarchy still comes from size, weight, and spacing rather than mixing families.

### Hierarchy
- **Amount** (700, 30px, line-height 1, -0.02em, tabular numerals): the one true "display" role in the system — a Payment Intent's amount, an order total. Reserved for money; nothing else gets this treatment.
- **Title** (700, ~1.05rem, -0.01em): page/section titles ("pagosYa", "Panel de Comercio", store name).
- **Body** (400, 0.85–0.88rem): default paragraph, table cell, and input text.
- **Label** (700, 0.72rem, +0.02em, uppercase on table headers and badges): field labels, table column headers, status badges.
- **Faint** (400, 0.78–0.8rem, `text-faint`): hints, secondary metadata, timestamps.

### Named Rules
**The One Store, One Face Rule.** Never mix type families within a surface. pagosYa-owned UI stays on 0xProto Mono. A hosted storefront may use the merchant's single curated selection, applied consistently to the entire store.

## Layout

No CSS grid framework or shared breakpoint system exists. Responsive coverage is hand-written per surface: `merchant-dashboard` uses 900px, 640px, and 480px breakpoints; the checkout storefront uses 720px; ops still has no media queries. Treat this as an explicit surface contract, not a shared breakpoint scale.

Where structure does exist: `merchant-dashboard`/`ops` cap content at `max-width: 1040–1080px`, centered, with generous top padding (28px) under a `.topbar`. The hosted storefront is a wider merchant lookbook capped at 1120px, while its payment-form card remains capped at 400px. The storefront catalog uses an auto-filling grid above 720px and becomes a deliberate single column at 720px and narrower. Its authored hero holds a cinematic 16:7 ratio on desktop and becomes a portrait 4:5 composition on mobile so imagery and overlaid copy remain useful rather than merely shrinking.

The dashboard finance-detail area pairs a payment-method donut with top products in two columns on wide screens, stacks those blocks below 900px, reduces the donut from 156px to 128px below 640px, and places the donut above its full-width legend below 480px.

## Elevation & Depth

Two different elevation philosophies coexist, honestly, rather than one shared shadow scale:

- **Admin tools** (`merchant-dashboard`, `ops`): every panel and card carries the same soft ambient shadow at rest (`0 1px 2px rgba(0,0,0,.3), 0 1px 8px -2px rgba(0,0,0,.4)`) — a constant, gentle lift, not a state response.
- **Checkout**: flat by default; shadow appears only as a *response* to state — hover lift on a store item card, the floating payment-card container over a merchant's page, or a colored glow under the accent-gradient CTA (`box-shadow` using `color-mix(in srgb, var(--pg-accent) 60%, transparent)`).

### Named Rules
**The Flat-Until-It-Moves Rule (checkout only).** Storefront surfaces stay flat at rest; a shadow only appears on hover, focus, or as the floating-card treatment for an embedded payment form. Don't add resting shadows to new checkout components.

## Shapes

Soft, continuous rounding: 8–9px on inputs/small controls, 10–14px on cards/panels, 16–20px on hero/gallery imagery, true pills (999px) for badges, chips, and filter buttons, and full circles (50%) for avatars/logo marks and stepper buttons. A merchant can opt a storefront into two alternate corner languages via `data-button-style`: `"pill"` (everything rounds to 999px) or `"square"` (radii collapse to 4–8px) — these are per-merchant customization, not system-wide alternatives.

Borders are thin (1–1.5px) and low-contrast (`border-quiet`/`border-firm`), never used decoratively — they exist to separate, not to frame.

## Components

### Buttons
- **Shape:** 9px radius (`sm`–`md`), or `pill`/`square` on a themed storefront.
- **Primary (admin):** Signal Amber background, on-amber text, 1.5px amber border.
- **Primary (checkout payment form):** neutral — `text-primary` on `panel`, 1.5px `border-quiet`. See the Whose-Page-Is-It Rule.
- **Primary (checkout storefront cart CTA):** Focus Indigo → Focus Violet gradient by default, contrast-safe text, colored glow shadow, lifts 2px on hover; merchant-themed solid buttons use computed black/white text, while outline and soft variants use theme-safe text.
- **Secondary/Ghost:** transparent background, `border-firm` (secondary) or no border (ghost), text goes to `text-primary` on hover.
- **Destructive inline actions** (e.g. gallery-thumb remove): filled `error` circle, white icon, no separate "destructive button" variant exists yet — destructive *bulk* actions instead route through a native `confirm()` dialog with explicit "cannot be undone" copy.
- **Pointer cue:** Merchant-dashboard and storefront interactive controls use the 32px Icons8 SF Black hand cursor selected for pagosYa. Use its white rendering on dark surfaces and black rendering on light storefront themes; always retain the native `pointer` fallback. Disabled controls use `not-allowed` rather than implying they can be activated.

### Badges
- **Style:** pill radius, small leading dot (`::before`, 6px circle, `currentColor`) + uppercase label, 0.72rem/700.
- **State color:** success (green) / warning (amber) / error (red) soft-background pairs, selected by semantic status keyword (`ACTIVE`, `SUCCEEDED`, `REQUIRES_ACTION`, `FAILED`, etc.) via CSS class-per-status rather than inline color logic.

### Cards / Panels
- **Corner Style:** 10–18px depending on surface (see Shapes).
- **Background:** `panel` (`#171717`) on `void`/page background.
- **Border:** 1px `border-quiet`.
- **Shadow:** ambient on admin tools; hover-only on checkout (see Elevation).
- **Internal Padding:** 14–20px.
- **Progressive disclosure (merchant dashboard):** Large stacked panels use a visible `Mostrar`/`Ocultar` button with `aria-expanded` and `aria-controls`, and remember each user's open/closed choice locally. Default **Tus Tiendas** and **Productos** open as the primary working set; default secondary panels closed to reduce scanning load.

### Store Appearance Studio (merchant dashboard)
- Pair the appearance editor with a sticky, sandboxed live storefront preview on wide screens; stack the preview below the editor at 900px and narrower.
- Let merchants compare explicit **Escritorio** and **Móvil** preview widths before saving. The device buttons expose pressed state, and unsaved edits update the preview immediately while a separate status communicates whether changes are saved.
- Offer the four named storefront font styles as a curated selector. Apply the unsaved choice to the whole preview immediately and persist only the enum value, never free-form CSS.

### Authored Hero Carousel (storefront)
- Merchants may author up to five ordered slides in the appearance studio. Every slide requires imagery and may add a title, short body, and CTA; when no slides exist, fall back to the legacy banner rather than synthesizing promotional content.
- With multiple slides, autoplay advances every 6 seconds, pauses while pointer or keyboard focus is inside the carousel, remains stopped for reduced-motion users, and exposes a persistent **Pausar** / **Reanudar** control for explicit user choice. Previous, next, and direct slide controls remain available independently of autoplay.
- Inactive slides carry `aria-hidden="true"` and every interactive descendant is removed from sequential keyboard navigation (`tabindex="-1"`); restore descendants to the tab order only on the active slide.
- Carousel pagination dots may look visually smaller, but each button keeps a minimum 24px × 24px hit target. Use 16:7 imagery on desktop and recompose to 4:5 at 720px and narrower.

### Finance Donut (merchant dashboard)
- Visualize successful-payment revenue by payment method, show the total in the donut center, and pair colored segments with a textual percentage-and-amount legend; the chart's accessible label must communicate the same distribution and total.
- Keep the chart and legend side by side when space allows, shrink the donut at 640px, and stack it above a full-width legend at 480px. When revenue is zero, show the neutral ring and explicit empty-state copy instead of an unexplained blank chart.

### Announcements & Promotions (storefront)
- **Announcement marquee:** Duplicate copy only to create the seamless visual loop. Under `prefers-reduced-motion: reduce`, stop the animation and hide the duplicate so one readable announcement remains.
- **Promotion dialog:** Use a true modal (`role="dialog"`, `aria-modal="true"`) with initial focus and a focus trap. Close it through the close button, CTA, backdrop, or Escape; dismissal must not depend on pointer input alone.

### Product Options (storefront)
- Mark unavailable options disabled and label them **Agotado**. Select the first purchasable option by default, and replace a remembered selection if it becomes unavailable; never make the customer discover availability only after pressing `+` or checkout.

### Inputs / Fields
- **Style:** `panel` background, 1.5px `border-quiet`, 9px radius, label always a real `<label for>` above the field (never a placeholder standing in for a label).
- **Focus:** border shifts to the active accent, plus a visible 3px soft focus ring. Focus Indigo is the default; a merchant-themed storefront derives the ring from its guarded effective accent.
- **Error:** inline text below the field in `error` color, tied to the field, not color-only.

### Tables (admin tools)
- Uppercase 0.72rem `text-faint` column headers, 1.5px bottom border under the header row.
- Rows separated by 1px `border-quiet`, no zebra striping; row hover tints toward `void`.
- Status columns render as Badges, never raw enum text alone.

### Navigation
No persistent nav/sidebar exists on any surface today — each admin app is a single scrolling page (`.topbar` + stacked `section.block`s); checkout has no navigation, only a sticky search/filter toolbar at the top of the storefront and a sticky cart bar at the bottom. Documented as current structure, not prescribed as the target IA — see PRODUCT.md's known-gaps note.

## Do's and Don'ts

### Do:
- **Do** set every pagosYa-owned UI element in 0xProto Mono and apply a merchant's selected family consistently across their entire hosted storefront.
- **Do** reserve Signal Amber for pagosYa's own tools (`merchant-dashboard`, `ops`); keep checkout's default primary action neutral or Focus Indigo, per the Whose-Page-Is-It Rule.
- **Do** give every status a Badge (pill + dot + semantic color), never raw enum text or color-only signaling.
- **Do** use real `<label for>` elements on every form field; placeholders are never a substitute for a label.
- **Do** preserve the authored hero's visible pause/resume control, reduced-motion behavior, inactive-slide tab-order exclusion, and 24px minimum dot targets.
- **Do** use the `cubic-bezier(0.22, 1, 0.36, 1)` ease for any new transform-based (lift/scale/entrance) transition, and plain `ease` at 0.15s for color/border state changes.

### Don't:
- **Don't** add a resting (non-hover) shadow to a checkout storefront component — checkout is flat until it moves.
- **Don't** mix font families within one storefront or accept arbitrary font URLs, uploads, or CSS values; use the curated font-style enum.
- **Don't** invent a new accent color; the system has exactly two (Focus Indigo, Signal Amber) plus the three status colors and checkout's Focus Violet gradient partner.
- **Don't** ship a new interactive control without a visible 3px focus ring — default to Focus Indigo, or derive it from the guarded effective accent on a merchant-themed storefront. Never remove the native outline without replacing it.
- **Don't** treat the current single-page, no-navigation admin layout as a new-work exemplar to copy forward without checking PRODUCT.md's known-gaps note — it's documented as a limitation, not a pattern.
