---
name: Thunder & Pulp — Star Wars
description: A tactile comic-shop storefront in paper, yellow, scarlet, and ink.
colors:
  paper: "#f5edd9"
  yellow: "#f6cc18"
  red: "#b52c21"
  ink: "#221f19"
  muted: "#625640"
  canvas: "#ded5be"
  focus: "#056b9b"
  field: "#fff8e8"
  checkout-note: "#403723"
typography:
  display: { fontFamily: "Bangers, Oswald, sans-serif", fontSize: "clamp(58px, 6.3vw, 87px)", fontWeight: 400, lineHeight: 0.99, letterSpacing: "0.015em" }
  headline: { fontFamily: "Oswald, sans-serif", fontSize: "clamp(35px, 4vw, 57px)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.025em" }
  title: { fontFamily: "Oswald, sans-serif", fontSize: "24px", fontWeight: 600, lineHeight: 1.15 }
  body: { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "12px", lineHeight: 1.55 }
  label: { fontFamily: "Oswald, sans-serif", fontSize: "14px", fontWeight: 600 }
  action: { fontFamily: "Bangers, Oswald, sans-serif", fontSize: "clamp(20px, 2.2vw, 30px)", fontWeight: 400, lineHeight: 1.1, letterSpacing: "0.025em" }
rounded:
  square: "0px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "18px"
  grid: "20px"
components:
  button-primary: { backgroundColor: "{colors.yellow}", textColor: "{colors.ink}", typography: "{typography.action}", rounded: "{rounded.square}", width: "100%" }
  button-primary-hover: { backgroundColor: "{colors.paper}", textColor: "{colors.ink}" }
  button-catalog: { backgroundColor: "{colors.yellow}", textColor: "{colors.ink}", rounded: "{rounded.square}", padding: "9px 10px" }
  button-editorial: { backgroundColor: "{colors.yellow}", textColor: "{colors.ink}", rounded: "{rounded.square}", padding: "12px 18px" }
  button-checkout: { backgroundColor: "{colors.yellow}", textColor: "{colors.ink}", rounded: "{rounded.square}" }
  filter: { backgroundColor: "transparent", textColor: "{colors.ink}", typography: "{typography.label}", padding: "8px 12px" }
  filter-selected: { backgroundColor: "{colors.ink}", textColor: "{colors.paper}" }
  search-field: { backgroundColor: "{colors.field}", textColor: "{colors.ink}", rounded: "{rounded.square}", padding: "10px 12px" }
---

# Design System: Thunder & Pulp — Star Wars
## Overview
**Creative North Star: "The Printed Comic Shop"**
A tactile storefront drawn from the user's Thunder & Pulp reference: warm paper, yellow title panels, scarlet strips, and heavy ink rules frame a real published comic cover against a generated bookstore photograph. The mood is energetic and collectible, with the buying action given the same visual confidence as the artwork.
This isolated demonstration uses Spanish copy and sample BOB prices. Prices, stock, and the three-comic collection are local demonstration data; checkout creates no order and charges nothing. Preserve that disclosure without repeated labels crowding the title.
**Key Characteristics:**

- Bold comic display type, condensed navigation, and compact monospaced descriptions.
- Square panels separated by printed ink rules.
- Warm photographic depth and restrained raster print grain.
- A large yellow buying action inside an ink purchase panel.
## Colors
Comic Yellow is primary: title, ticker, actions, and selection emphasis. Scarlet Ink is secondary: thumbnail strip, editorial section, and count badge. Warm Paper supports the page; Printed Ink supplies text, borders, selection fills, and the purchase panel. Paper Surround frames desktop. Light Field supports search. Muted Caption supports secondary copy; checkout uses darker, fully opaque `checkout-note`. Focus blue is an interaction signal.
**The Legible Ink Rule.** Keep purchase text in paper against ink and the main action in ink against yellow. Keep checkout explanatory copy dark and fully opaque.
## Typography
Locally hosted Bangers supplies masthead, featured heading, and hero action; Oswald supplies section/product headings, navigation, prices, and labels; system mono supplies descriptions and practical copy. Use natural Bangers slant without synthetic bold or italic. The frontmatter owns the main desktop role values.
The masthead steps from (38px) through (32px), (30px), and (26px). Mobile hero type uses `clamp(42px, 13vw, 62px)`, with its secondary line at (0.8em). Mobile catalog titles use (22px). Descriptions use (11–13px), small print (8–10px), and checkout notes (13px) at full opacity. Keep tiny captions brief.
**The Three Voices Rule.** Reserve Bangers for the masthead, featured heading, and hero action; keep Oswald for hierarchy and mono for reading detail.
## Layout
The desktop framed sheet has a maximum width (1344px), vertical margin (24px), and ink border (3px). The current hero uses a (1.08fr / 1fr) grid with a (7px) gutter: photograph beside title, choices, and purchase stack. This is the current storefront composition, not a requirement for every future surface.
Catalog artwork uses a (3:4) frame within four columns and (20px) gaps. At (1100px), spacing tightens. At (760px), the shell fills the viewport, navigation becomes an equal three-column row, the hero stacks image first, the catalog becomes two columns, and editorial/footer sections stack. The mobile photograph uses (4:3); the hero action may wrap. At (360px), type and actions compact further. Above (1450px), outer margins and photo height increase.
Preserve product-to-choice-to-buy reading order and vertical scrolling on narrow screens.
## Elevation & Depth
Ink borders provide structure. Only the sheet and physical cover composite need depth: sheet shadow (`0 12px 32px #32220f21`), featured-cover shadow (`9px 14px 12px #1009028c`), slight brightness reduction, and cover rotation (-5deg). Catalog cards are unshadowed; the collection overlaps three published covers.
Multiply-blend `assets/print-grain.jpg` at (500px) background size into the yellow title panel and scarlet thumbnail strip. Keep it beneath readable type. Art sources, font licenses, and generated imagery prompts are recorded in `assets/manifest.json` and `assets/print-grain-prompt.txt`.
## Shapes
Square panels, actions, fields, and artwork use (3px) structural rules and (1–2px) control borders. Circles are reserved for cart count, cover swatches, and radio indicators. The lightning bolt recurs; the tilted print stamp and covers supply controlled irregularity.
## Components
**Buttons:** the yellow hero action is full width, at least (61px) tall on desktop or (63px) on mobile; hover becomes paper. Catalog actions use Oswald and a (44px) minimum, editorial links (52px), checkout actions (54px). Disabled buttons use (0.5) opacity. Storefront keyboard focus uses a blue outline (3px) with (4px) offset.
**Choices:** cover and catalog filters invert to ink/paper when selected with `aria-pressed`; selected thumbnails gain yellow outlines. Purchase radio rows gain a yellow border and faint yellow fill. Comic selection synchronizes artwork, text, price, state, and product link.
**Cards and cart:** keep catalog copy unboxed beneath bordered complete covers (`object-fit: contain`) and above a ruled price/action row. Editorial artwork may crop. The cart drawer repeats paper, yellow header, square controls, and strong ink rules.
**Fields:** search has a visible label, light field, attached yellow icon button, and (44px) entry height; filtering updates the count and empty state. Checkout fields remain square and ink-bordered. Shipping/contact forms are disabled in this demo configuration.
**Navigation:** outlined Oswald links turn yellow on hover. Mobile retains all three links beneath the masthead and hides only the duplicate header search icon. Keep cart count and keyboard-visible skip navigation.
**Motion:** catalog cover hover scales to (1.035) over (0.2s ease-out). Selections update directly. Reduced-motion preference removes transitions and animations and keeps scrolling automatic.
## Do's and Don'ts
### Do:

- **Do** keep the buying action visually dominant and its current sample price visible.
- **Do** preserve published cover proportions and maintain the existing art credits.
- **Do** use heavy ink rules and square controls to hold the printed composition together.
- **Do** retain selection semantics, keyboard focus, result feedback, and readable checkout notes.
- **Do** make the no-charge demo status clear in practical copy.
### Don't:

- **Don't** replace the three type roles with one condensed font everywhere.
- **Don't** turn catalog items into rounded, shadowed cards or nest unnecessary panels around their copy.
- **Don't** repeat the same product label above and inside the featured title.
- **Don't** treat generated shop imagery, sample stock, or local checkout as a real shop or completed sale.
- **Don't** place print grain over form entry surfaces or reduce the checkout note's contrast.
