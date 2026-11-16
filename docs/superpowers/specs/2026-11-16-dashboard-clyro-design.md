# Merchant dashboard in the new pagosYa site's look (Clyro) — design

Date: 2026-11-16 · Owner: «change the entirety of the dashboard to https://clyro.com like the new pagosya site», logo «YAPI star, like
the site», scope «Whole dashboard + login» (the Studio editor stays as it is for now).

## Source of the look

The new pagosYa site (`~/pagosYaWeb`, working copy, read only — never committed from there): `src/app/globals.css` `.cl` block and
`src/components/site/clyro/*`. Our own take on clyro.com, so the dashboard copies the site, not clyro.com's assets or text.

| Token | Value | Use |
|---|---|---|
| paper | `#fdfcf6` | page background (cream) |
| ink | `#17191c` | text, primary buttons, active nav pill |
| ink-soft | `#5d6066` | secondary text |
| line | `#e7e5dc` | hairlines, card borders, inputs |
| slate | `#233a4a` | one highlighted band/panel per screen (e.g. the account/balance card) |
| night | `#15191c` | dark surfaces (login side, footer-like strips) |
| yellow | `#ffd82f` | only YAPI's star |
| green / red | `#3f9d6b` / `#d9534f` | success / danger states |
| surface | `#ffffff` | cards on the cream page |

Type: **Bricolage Grotesque** 500 for titles (tracking −0.05em, line-height 1.02), **Onest** 400/500/600 for everything else
(Google Fonts). Buttons: pills (`border-radius: 9999px`), primary = ink with white text, secondary = white with a line border; press
scales to .97. Cards: white, 1px line border, radius 20px, a faint shadow. Big page headers sit on the site's pastel wash (three soft
radial gradients: mint, peach, apricot over the cream). Top bar: the site's frosted pill (white 72%, blur, hairline). Motion: the
site's ease `cubic-bezier(0.22, 1, 0.36, 1)`, 160–300 ms; reduced motion respected.

## What changes

1. **Tokens.** A new stylesheet `apps/merchant-dashboard/src/clyro.css`, loaded last, maps the dashboard's tokens (`--pg-*` in
   calm.css, `--pm-*` in premium.css, `--bento-*`, `--calm-*`) to the values above, so every panel that already reads tokens follows.
2. **Shell.** Sidebar on cream with the YAPI star + «pagosYa» wordmark, nav items as text with the active one an ink pill (white
   text); the top bar as the frosted pill; the floating «¿Qué quieres crear o mejorar?» YAPI bar as a white pill with the ink button.
3. **Components.** Buttons, tabs (segmented pill group), inputs/selects (white, line border, radius 12px, ink focus ring), tables
   (hairline rows, Onest 500 headers), badges/status pills (soft tints of green/red/ink), KPI tiles (Bricolage numbers), empty states,
   dialogs and popovers (white, radius 20px, the site's shadow), toasts.
4. **Screens.** Inicio, Tienda (Productos, Diseño, Tareas, Medios, Tus tiendas), Pedidos, Cobrar, Dinero, Clientes, Ajustes, and the
   panels they open — each checked on desktop (1440) and phone (390) after the tokens, and fixed where a hard-coded colour, font or
   radius ignores them.
5. **Login and YAPI welcome.** The dark ASCII koi/butterfly screens become the site's look: cream page with the pastel wash, the
   YAPI star, Bricolage title, the form in a white card with pill buttons. The ASCII animations (ascii-animals.mjs) stop being used
   on these two screens; the file stays.

## Not changing

The Studio editor (merchant-studio), storefronts, the API, any behaviour, copy or layout order of the panels; the dashboard keeps
its current structure — this is a visual restyle.

## Checks

- Screenshots of every screen above, desktop and phone, before and after (one contact sheet per state for the owner).
- No sideways scroll on the phone, text contrast ≥ 4.5:1 on cream, focus rings visible.
- The dashboard's own tests for the files touched (owner «light checks»: the touched files' tests, not the whole suite at once).
