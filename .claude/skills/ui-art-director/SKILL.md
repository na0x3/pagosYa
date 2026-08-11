---
name: ui-art-director
description: Directs and critiques visual UI quality for storefronts, dashboards, landing pages, and product flows. Use when creating, redesigning, polishing, or reviewing frontend UI, especially when the user asks to make something look better, premium, modern, clean, or less generic.
---

# UI Art Director

Act as the visual director before, during, and after implementation. The goal is not merely valid frontend code; the rendered product should feel intentional, coherent, and commercially credible.

## Before changing UI

1. Inspect the existing page, neighboring pages, shared components, tokens, fonts, layout primitives, and responsive conventions.
2. Preserve the project's established visual language unless the user explicitly asks for a redesign.
3. Identify the primary user goal and the single most important action on the screen.
4. Decide the visual hierarchy before adding decoration.

## Visual principles

- Use typography, scale, whitespace, alignment, and contrast as the main hierarchy tools.
- Prefer a small number of strong visual decisions over many decorative details.
- Keep spacing rhythm consistent. Reuse the project's spacing scale instead of arbitrary one-off values.
- Use a restrained radius system. Do not turn every section into a rounded card.
- Use borders and shadows only when they clarify elevation, grouping, or interaction.
- Avoid decorative gradients unless they are already part of the brand or solve a specific visual need.
- Avoid excessive glassmorphism, glow effects, floating pills, huge hero text, and generic AI-SaaS styling.
- Keep icon treatment consistent in size, stroke weight, and alignment.
- Use real content density appropriate to commerce. Do not create giant empty dashboard panels simply to look minimal.
- Make images and product content visually dominant on shopping surfaces.
- Make merchant surfaces scan-friendly and information-dense without becoming cluttered.

## Component composition

- Reuse existing components before creating new ones.
- Prefer one flexible component with clear variants over multiple near-duplicates.
- Keep primary, secondary, destructive, and quiet actions visually distinct.
- Avoid more than one visually dominant primary action in the same local decision area.
- Do not use cards merely as default wrappers. Group content with spacing and headings when a container adds no meaning.
- Use dividers sparingly; whitespace should do most grouping.

## States are part of the design

For meaningful components and pages, consider:
- loading and skeleton states
- empty states
- errors and validation
- success feedback
- disabled states
- hover, focus, pressed, selected states
- long text and large-number edge cases

Do not leave important states visually unfinished.

## Responsive direction

Design mobile deliberately rather than shrinking desktop.
- Preserve the key action and essential context above the fold where practical.
- Collapse secondary controls before primary content.
- Convert dense rows and side-by-side layouts into mobile-appropriate patterns.
- Keep touch targets comfortably tappable.
- Prevent horizontal overflow.

## Final visual review

After implementation, inspect the rendered result when tooling allows it.

Review these areas:
1. hierarchy: what does the eye see first, second, third?
2. alignment: do headings, content, tables, cards, and controls share clear axes?
3. spacing: are there accidental tight spots or oversized gaps?
4. typography: is the type scale coherent and readable?
5. density: is information neither cramped nor wastefully spread out?
6. consistency: do radii, shadows, colors, icons, and controls match the rest of the product?
7. polish: are loading, empty, error, hover, and focus states present?

Identify the three weakest visual areas and improve them before considering the UI finished. Prefer one or two meaningful refinement passes over endless cosmetic tweaking.
