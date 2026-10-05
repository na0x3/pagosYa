# Yapi structured composition demos

Build AFTER HOURS from one fixed merchant/catalog/media dataset in three directions:

```sh
pnpm --filter @pagosya/shared-types build
pnpm --filter @pagosya/api exec ts-node scripts/generate-design-demos.ts --capture --after-hours
node examples/yapi-design-engine/server.mjs
```

Open http://127.0.0.1:4336:

- `/after-hours-magazine/`: cover hero, product rail, manifesto, mosaic, giant footer.
- `/after-hours-records/`: poster, giant categories, numbered product index, photo strip, editorial footer.
- `/after-hours-cafe/`: editorial split, full-bleed media, spotlight, narrative split, minimal footer.

To inspect all 28 principal compositions:

```sh
pnpm --filter @pagosya/api exec ts-node scripts/generate-design-demos.ts --capture --variants
```

Open `/variants/`. Without flags the builder generates the earlier coffee, botanical and home demonstrations. Inputs and deterministic authored plans are in `design-fixtures.ts`; these are capability benchmarks, not paid model evaluations.

`dist/` contains runnable previews, editable `sketch.json`, projected `website-design.json`, screenshots at 1440/820/390 and `evidence.json`. Browser checks cover overflow, media, one h1, live catalog, keyboard navigation, cart and quantity changes. Geometry evidence excludes colors and variant names. Production-validator and export coverage uses the actual shared UI library.

All photos come from existing repository examples. Products, merchant facts and prices are synthetic demo content; no record photograph is invented. No reference-site assets, text or code are copied. No real order or charge is created. Generation output is ignored by Git.
