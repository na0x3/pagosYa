---
name: Café Aroma
description: A warm editorial café storefront with a direct menu and order flow.
colors:
  paper: "#f5efe5"
  ink: "#30251c"
  muted: "#6c5a49"
  accent: "#a33f22"
  line: "#cab9a5"
  wash: "#eee4d6"
typography:
  display:
    fontFamily: "Instrument, Georgia, serif"
    fontSize: "clamp(64px,6.85vw,106px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM, Arial, sans-serif"
    fontSize: "15px"
    lineHeight: 1.75
  title:
    fontFamily: "DM, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 500
rounded:
  square: "0"
  circle: "50%"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
---

# Design System: Café Aroma

## Overview

**Creative North Star: "The café menu"**

This is the visual system of the independent Café Aroma demonstration. It does not prescribe the identity of other merchant websites or the pagosYa dashboard. Warm paper, editorial lettering and a real breakfast photograph introduce a straightforward menu and order flow.

**Key Characteristics:**

- Serif headlines paired with compact sans-serif controls.
- Photography supplies depth; surfaces remain flat.
- Menu rows, fine rules and open space carry the composition.

## Colors

Terracotta is the single accent. Paper and wash separate large sections, ink carries reading and primary actions, muted text supports descriptions, and warm lines separate menu entries.

**The Accent Rule.** Reserve terracotta for actions, selection, status and short rules; do not flood the reading surface with it.

## Typography

Instrument Serif is self-hosted as `Instrument`; DM Sans is self-hosted as `DM`. Editorial headlines use normal-weight serif letterforms. Product titles and controls use the sans-serif face so prices and actions are easy to scan.

The desktop menu heading is 58px; the secondary story heading is 62px. Mobile headings reduce to 52px while the hero remains 70px. Product titles reduce from 17px to 15px. The display rhythm stays distinct from the compact menu and order controls.

## Layout

The desktop hero divides text and photography at 46/54. The menu uses a flexible catalog column plus a 310px order panel; the panel narrows to 260px below 1000px. At 700px the page stacks into one column and the order panel follows the menu. Desktop outer gutters are 4.2%; mobile gutters are 6%.

Group category controls and menu rows tightly. Separate the hero, catalog and café story with larger section spacing. Headings precede their content without eyebrow labels.

## Elevation & Depth

There are no shadows. Depth comes from the photograph and the warmer story-section background. Order and menu structures use thin dividers rather than elevated cards.

## Shapes

Primary actions and fields are square. Simple product-add controls are circles with a terracotta outline; products requiring options use text links. Fine rules and aligned text establish the menu geometry.

## Components

Primary buttons use ink and paper, with terracotta hover. Category buttons use an underline and `aria-pressed` for selection. Menu rows align product information, price and the add action without enclosing cards.

Interactive controls have a minimum 44px height. Keyboard focus uses a visible 3px terracotta outline with a 5px offset. Disabled actions remain visibly inactive. Hover transitions last 150ms; reduced-motion preferences remove transitions and smooth scrolling. Decorative arrows and product-add icons use inline SVG with a 1.5px stroke.

The order panel distinguishes empty, populated, loading and error states. Status copy remains near the action. Demo mode labels the review action and states that it cannot generate a charge.

## Do's and Don'ts

- Do keep merchant photography prominent and unobscured.
- Do preserve the difference between expressive headlines and readable commerce controls.
- Do use the actual catalog and clearly label demonstration content.
- Don't impose this café identity on unrelated businesses.
- Don't add elevated product cards or decorative gradients to this flat menu world.
- Don't invent claims, testimonials or operational details.
