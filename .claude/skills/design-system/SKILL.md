---
name: design-system
description: Maintains UI consistency through reusable components, tokens, typography, spacing, color, motion, and interaction patterns. Use when adding components, changing styling foundations, refactoring duplicated UI, creating themes, or when multiple screens need to look and behave consistently.
---

# Design System Guardian

Treat the existing design system as product infrastructure. Improve it deliberately instead of creating local styling that drifts from the rest of the app.

## Inspect before creating

Before introducing a new visual primitive:
1. Search for an existing equivalent component.
2. Inspect shared styles, CSS variables, theme configuration, utility conventions, and component variants.
3. Inspect two or three existing screens that represent the intended product quality.
4. Reuse or extend the existing pattern when it can support the new requirement cleanly.

Do not introduce a second component library or styling paradigm merely because it is familiar.

## Tokens

Prefer semantic tokens over raw values for repeated design decisions.

Maintain coherent systems for:
- background / foreground / muted surfaces
- brand / primary actions
- secondary and quiet actions
- success, warning, destructive, and informational states
- borders and input borders
- focus rings
- typography sizes and weights
- spacing
- radii
- shadows/elevation
- motion duration/easing if the app has motion tokens

Avoid scattering raw hex values and arbitrary pixel values through feature components when a reusable token should exist.

## Typography

Use a small, predictable type scale.
- Page titles, section headings, body, supporting text, labels, and table text should have clear roles.
- Do not compensate for weak hierarchy by using bold everywhere.
- Preserve readable line lengths for long-form content.
- Use tabular numerals where appropriate for financial columns if supported by the stack.

## Component API rules

- Prefer composable components with explicit variants.
- Keep domain behavior separate from purely visual primitives when practical.
- Do not add props for one-off cosmetic exceptions if composition or a legitimate variant is clearer.
- Preserve accessibility semantics while styling.
- Keep forms visually and behaviorally consistent.
- Ensure destructive actions look distinct and require appropriate confirmation when the action is consequential.

## Ecommerce-specific consistency

Standardize shared patterns for:
- money display
- discount display
- status badges
- inventory state
- product thumbnails
- variant selectors
- order status
- payment status
- fulfillment status
- empty states
- tables
- filters
- pagination
- dialogs/drawers
- notifications/toasts

Avoid implementing money, status, or date formatting ad hoc inside individual pages.

## Adding new components

When a new reusable component is warranted:
- put it in the project's established shared-component location
- match existing naming/export conventions
- provide only variants that are actually needed
- make default behavior safe and sensible
- use semantic HTML
- include focus/disabled/error states where relevant

If shadcn/ui is already configured, prefer finding the correct supported component/pattern before hand-building a duplicate. Customize it to the project's design tokens rather than accepting a generic default appearance.

## Refactoring threshold

Do not over-abstract after seeing a pattern once. Extract or generalize when duplication is real or when a shared primitive clearly improves consistency across multiple screens.
