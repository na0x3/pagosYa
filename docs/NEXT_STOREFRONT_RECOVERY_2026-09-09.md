# Next.js storefront recovery — September 9, 2026

Recovered the interrupted request to change YAPI-generated storefronts to Next.js, React, TypeScript and Tailwind CSS. The earlier location/reference-site work and other uncommitted changes remain in the workspace.

## Completed behavior

- New storefronts and explicit full redesigns select Next.js by default (`SOURCE_FRAMEWORK=next`). Ordinary edits preserve legacy static stores; React stores retain their framework on later edits.
- The model authors shared React components and global CSS. The API validates source imports and literal commerce/layout structure, checks TypeScript, and compiles React plus Tailwind without evaluating merchant modules. Existing generation budgets and bounded repairs remain in place.
- Saving React source rebuilds preview files atomically. Invalid source leaves the previous revision intact. Studio exposes editable components and CSS while keeping compiled files out of its source picker.
- Studio and hosted previews use isolated React bundles, including local assets and supported location iframes. Publishing recognizes React commerce mounts. Catalog, cart, checkout, privacy and motion retain the existing shared runtime.
- ZIP export assembles the Next.js Pages Router project with public assets, commerce configuration/runtime, fonts, brand rules and SEO metadata. The exported project supports `npm install`, `npm run dev`, `npm run typecheck`, `npm run build`, and `npm start`; production output is `out/`.

## Validation

- 63 API tests passed across React compilation, generation, revisions/export, commerce contracts and publishing.
- 31 browser tests passed across React shopping, existing location embeds, layout diagnostics and page/checkout flows; a further targeted React location test verifies map loading under the restricted preview policy.
- API, Studio, checkout and embedded dashboard Studio builds passed. `git diff --check` passed.
- A synthetic exported project installed its own dependencies, passed TypeScript checking, and completed a real Next.js 15.5.25 production build. Its built mobile website loaded Tailwind and local imagery, hydrated React interactions, preserved the cart through product/checkout navigation, and reached simulated payment with zero page errors.
- Local API health and merchant dashboard returned HTTP 200. The development database reported no pending migrations.

The local exported fixture and screenshot are in `tmp/next-storefront-recovery-20260909/` (ignored by Git). No paid generation, live order/payment, merchant redesign or production publication was performed. This validates the framework integration with deterministic source; it is not a new visual-quality benchmark of model-generated sites.

See [the implementation contract](source-design-generation.md#nextjs-source-and-previews) for scope and limitations.
