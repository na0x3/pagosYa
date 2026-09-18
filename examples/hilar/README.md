# Hilar sweater store

Open the local store at http://localhost:5175/s/v0ybuup8 with the pagosYa development services running (`pnpm dev` from the repository root).

Hilar is a fictional knitwear shop with three garment styles, five sizes (XS–XL), three colors (Avena, Vino, Oliva), and two fits (Clásico and Relajado). Each garment has 30 variants with independent stock; Relajado adds Bs 30. Vino / XL / Relajado demonstrates an unavailable combination. A Bs 25 gift box is an optional separate item. The store includes color-specific photography, a size guide, care information, a cart, and the existing pagosYa test checkout.

The visual design uses ivory, burgundy, Instrument typography, editorial photography, and responsive layouts with light and dark themes. Product composition, measurements, inventory, and prices are demonstration data. Payments remain in test mode.

## Files and reproduction

- `site/`: complete source project, including bundled assets and shared commerce runtime. Run `npm run build` there to create the standalone build.
- `PROMPT.md`: full store brief.
- `assets/`: ten optimized generated photographs; `manifest.json` records the original generation files.
- `demo.json`: local merchant, store, product, upload, and revision identifiers.
- `../../apps/api/scripts/create-hilar-demo.ts`: local-only setup and source synchronization script. From `apps/api`, run `pnpm exec node --env-file=.env -r ts-node/register scripts/create-hilar-demo.ts --sync --publish` to save the authored HTML, CSS, and JavaScript as a new local store revision. The script refuses nonlocal databases and active merchants.

The configured source generator was attempted but stopped because its OpenAI account had no remaining credit. The storefront was then authored directly and saved through the existing source-project service. Image generation succeeded through the built-in image tool.

## Image prompt set

Hero: photorealistic fashion editorial of an adult woman wearing an oatmeal cable-knit sweater and an adult man wearing a burgundy rib-knit sweater beside a warm stone wall; soft morning light, natural styling, no branding or text.

Product bases: photorealistic portrait 4:5 flat lay showing the entire garment on warm ivory limestone, natural light and visible wool texture. Create an oatmeal cable-knit crewneck, a burgundy rib-knit crewneck, and an olive buttoned cardigan.

Color variants: edit only the yarn color to oatmeal, burgundy, or olive as needed, preserving garment shape, knitting pattern, framing, background, and shadows. Each garment has its own three-color image set.

## Verification

- Source build and JavaScript syntax checks.
- Merchant Studio TypeScript check and three regression tests covering embedded variant photos, upload reuse, and compact image data in preview configuration.
- Browser review on desktop and mobile, including both themes, product selection, matching images, unavailable variants, fit pricing, quantity changes, and gift boxes.
- Test checkout handoff verified for Suéter Ocho / Vino / M / Relajado plus one gift box: Bs 375. The resulting payment form explicitly shows test mode. No payment was submitted.

The preview pipeline was updated to embed variant image URLs and deduplicate repeated image data, so variants retain their photographs without oversized preview scripts.

Theme choices now travel with page navigation and are remembered by the host for this store's browser session, including refreshes. Section links scroll without navigating the sandbox document. Seven targeted theme and product-route tests pass; both light and dark choices were verified in the browser, including the “Tallas y cuidados” link.
