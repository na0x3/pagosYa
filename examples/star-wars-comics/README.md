# Thunder & Pulp — Star Wars storefront demo

A standalone comic shop based on the user's Thunder & Pulp screenshot. Open http://127.0.0.1:4316 while the local server is running.

```sh
cd examples/star-wars-comics
npm run build
npm start
```

No package installation is required to serve or build it. The site uses HTML, CSS, vanilla JavaScript, and the portable pagosYa commerce runtime. Local catalog data in `config.js` drives product pages, cart quantities, totals, and a no-charge checkout. Cart state lasts for the current browser session. No API credentials, real orders, or payment details are used.

- `create-pages.mjs`: generates home, product, checkout, and art-credit pages; run `node create-pages.mjs` after editing the shared shell.
- `styles.css`: responsive print-inspired theme.
- `site.js`: cover selector, single/collection selection, catalog search, collection artwork.
- `commerce.js`: copy of the current source-kit runtime, with demo-specific checkout introductory copy and a redundant preview label removed.
- `assets/manifest.json`: cover sources and generated backdrop provenance/prompt.
- `assets/oswald-OFL.txt` and `assets/bangers-OFL.txt`: typeface licenses.

`npm run build` copies browser assets to `dist/` and checks JavaScript syntax. The server serves that build, or source files before a build exists.

To run the browser verification from the repository root with the repository's existing Playwright installation:

```sh
node examples/star-wars-comics/verify.cjs
```

Verification covers artwork loading, cover selection, collection selection, catalog search and zero results, product navigation, persistent cart totals, and desktop/mobile checkout completion. Screenshots are saved under `.screenshots/`. All catalog prices, stock levels, and the collection are demonstration data. Publisher artwork is credited on `credits.html`.
