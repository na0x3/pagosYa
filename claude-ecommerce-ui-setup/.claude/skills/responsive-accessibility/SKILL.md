---
name: responsive-accessibility
description: Reviews and implements responsive behavior and accessibility for web UI, including keyboard navigation, focus, semantics, forms, contrast, touch targets, screen sizes, reduced motion, and overflow. Use whenever building or changing interactive frontend surfaces.
---

# Responsive & Accessibility

Accessibility and responsive behavior are acceptance criteria, not a cleanup step.

## Semantic structure

- Use native semantic elements when they provide the required behavior.
- Preserve logical heading order.
- Use buttons for actions and links for navigation.
- Associate form labels with controls.
- Use fieldsets/legends or equivalent semantics for grouped choices when appropriate.
- Do not add ARIA where native HTML already expresses the correct semantics.

## Keyboard and focus

Interactive workflows must be operable by keyboard.
- Keep focus order aligned with visual/logical order.
- Provide visible focus indication.
- Do not trap focus except intentionally inside modal interactions.
- Return focus appropriately when dialogs/popovers close when the component system supports it.
- Make custom interactive components support expected keyboard behavior.

## Forms

- Use meaningful labels; placeholders are not labels.
- Set suitable input types and autocomplete attributes for customer information when appropriate.
- Connect validation messages to their fields.
- Do not communicate errors by color alone.
- Preserve user input after validation errors.
- Make required/optional expectations understandable.

## Visual accessibility

- Ensure text and important controls have sufficient contrast.
- Do not rely on color as the only status signal.
- Support zoom and text enlargement without breaking essential flows.
- Respect reduced-motion preferences for non-essential animation.
- Provide meaningful alt text for informative images and empty alt text for purely decorative images.

## Touch

- Make frequent actions easy to tap.
- Keep enough separation between destructive and common actions.
- Avoid interaction that requires hover.
- Do not use tiny icon-only actions without an accessible name and adequate target size.

## Responsive checkpoints

At minimum, reason through:
- compact mobile around 360-390px wide
- tablet / small desktop around 768-1024px
- desktop around 1280-1440px and wider

Do not optimize only for these exact widths; layouts should behave continuously between them.

## Responsive transformation rules

- Do not simply stack every desktop element vertically.
- Prioritize primary content/actions and progressively hide, collapse, or move secondary controls.
- Replace wide data tables with an intentional mobile strategy: horizontal scroll with sticky identifiers, condensed rows, cards, or drill-in views depending on task needs.
- Make dialogs/drawers usable on small screens.
- Avoid fixed widths that cause overflow.
- Check long translations, long product names, large currency values, and empty/null values.

## Commerce-specific checks

Customer storefront:
- product gallery remains usable on touch
- price and purchase action remain obvious
- variant selectors remain operable
- cart drawer/page is not clipped
- checkout does not require horizontal scrolling

Merchant admin:
- tables preserve critical identifiers and actions
- filters remain reachable
- bulk actions have a mobile strategy
- side navigation has a clear compact behavior
- charts never push the entire page horizontally

## Completion check

Before finishing an interactive UI change, verify:
- keyboard path
- visible focus
- labels and error states
- mobile layout
- no unintended horizontal overflow
- meaningful loading/empty/error states
