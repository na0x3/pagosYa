# Copy a website's structure and look in the merchant's brand (sub-project B) — design

Date: 2026-10-18 · Owner approval: «yes» (2026-10-18), after the design in chat

## Goal

The merchant sends a link with «copia esta estructura», «hazme la web como esta», «igual a esta» or «clona esta página», and
YAPI rebuilds that page's structure and look section by section with the merchant's own brand and content.

## Why today's reference is not enough

- `inspectSourceWebsite` sees the first 45 HTML tags, a CSS slice and at most 4 screenshots (top two screens, desktop and phone).
- `SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS` only allows «design characteristics».
- On a new store the style cards run first and the picked card locks the header and first screen (`SEP5_KEEP_HERO`).

## Decisions

1. **Copy wording** (`websiteCopyAsked`): copia/copiar/clona/clonar, «igual a/que», «idéntic», «misma estructura», «como esta
   (página|web|tienda|sitio)», «hazme la web como», «like this» with a link. «inspírate», «parecido», «estilo de» stay inspiration.
2. **Blueprint** (`captureWebsiteBlueprint`): the guarded browser (every request through the DNS-pinned fetcher, no cookies, no
   writes) renders the whole page at 1280 px, scrolls it to load lazy content, and splits it into sections (top-level blocks at
   least 80 px tall and 70% wide, descending through a single wrapper). Per section: order, role (header/hero/footer/section),
   height, background colour, columns, image count and placement, heading size/weight/case/font, button count, text density.
   Page look: palette by area, body and heading fonts, corner radius, content width, button style. One JPEG crop per section
   (up to 8, each at most 250 KB) and a 390 px pass for the phone column count.
3. **Build**: no style cards, no frame draw, no playbook for that run. The author gets a COPY BLUEPRINT block and the section
   crops as read-only reference screenshots (up to 8): reproduce the section order, each section's layout, proportions,
   spacing, type treatment and header/footer arrangement, filled with the merchant's content.
4. **Brand**: the merchant's confirmed logo, colours and fonts win. Without them, the reference's palette and the nearest
   self-hosted font are used.
5. **Never copied**: the other company's text, logo, photos, product names, claims or code; nothing is loaded from its site.
   Their images become the merchant's photos or YAPI drawings.
6. **Check**: the saved home page is rendered offline from its own files and measured like the reference; each section is
   compared in order (columns, images, heading size). The reply says how close it came and names the sections that differ:
   «Copié la estructura de midominio.com: 4 de 5 secciones con el mismo diseño; la sección 3 quedó distinta.» Without a render
   it only claims the count. *Amended 2026-10-18 (live, Mezcla Ya):* no automatic repair run — on the ChatGPT plan it timed out
   as a single-call edit and cut off the background polish; the merchant asks for the named sections instead.
7. **Scope**: the linked page becomes the home page, on a new store or as a redesign. Other pages stay standard in the same look.
   A product-link store (A) with a copy link uses both.

## Units

`website-copy/copy-intent.ts`, `copy-blueprint.ts` (pure: normalise, prompt, check, reply), `copy-capture.ts` (browser),
`guarded-browser.ts` (shared with the product renderer), wiring in `source-chat.service.ts` and `source-generation.service.ts`.
