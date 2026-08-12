---
name: visual-qa
description: Runs the application and visually verifies frontend work in a real browser, then fixes layout, responsiveness, state, console, and visual-quality issues. Use after substantial UI implementation, when asked to review/polish a page, or when a visual bug cannot be understood from source alone.
---

# Visual QA

Do not assume frontend code looks correct because it compiles. Verify meaningful UI changes against the running application whenever the environment permits.

## Preferred workflow

1. Determine the repository's documented way to install dependencies and run the app.
2. Reuse an existing dev server when possible rather than starting duplicates.
3. Open the affected route in a real browser using available browser tooling.
4. Exercise the main interaction path, not just the initial screenshot.
5. Inspect at representative desktop and mobile sizes.
6. Check browser console/runtime errors.
7. Fix issues found.
8. Re-run the affected flow after fixes.

Use the project's available Claude `/run` or `/verify` workflow when suitable. If Playwright CLI/skills are installed, use them for browser inspection, interactions, screenshots, and repeatable checks.

## Visual checkpoints

Inspect:
- page hierarchy
- container width
- alignment and consistent edges
- spacing rhythm
- typography
- image crop/aspect ratio
- button/input dimensions
- table alignment
- clipped content
- horizontal overflow
- sticky/fixed elements
- menus/popovers/dialog positioning
- skeleton/loading transitions
- empty and error states
- long text and large values

## Suggested viewport passes

Use comparable sizes when exact sizes are unavailable:
- mobile: approximately 390x844
- tablet: approximately 768x1024 when the UI meaningfully changes there
- desktop: approximately 1440x900

Do not treat screenshots alone as sufficient for interactive work. Click and type through the main path.

## Ecommerce journey checks

For storefront changes, test the affected sequence such as:
product list -> product -> variant -> add to cart -> cart -> checkout entry

For merchant changes, test the affected sequence such as:
list -> filter/search -> detail -> edit/action -> resulting status/feedback

Only test flows relevant to the change; do not run a full application audit for a small isolated edit.

## Quality review

After functional verification, name internally the three weakest visible areas and improve them when the fixes are within scope. Look especially for:
- generic component defaults that clash with the product
- inconsistent spacing/radius/type
- excessive cards or borders
- poor information density
- awkward mobile stacking
- missing interaction feedback

Limit normal polish to one or two refinement passes unless the user asks for a deeper redesign.

## Do not mask problems

- Do not silence console errors just to make the run look clean.
- Do not disable failing UI behavior to pass a screenshot check.
- Do not replace real user-facing states with hard-coded demo data unless explicitly building a mock/prototype.
