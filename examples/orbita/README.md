# ÓRBITA — Equipo para otros mundos

Fictional outdoor concept store with a Mars expedition theme, created through the local pagosYa AI API.

Open the completed local store: http://localhost:5175/s/dl7xxazz

Final published revision: **3**. See `provenance.json` for the API generation records and `VERIFICATION.md` for browser checks.

## Authorship

- Store design and implementation: pagosYa source-project AI API, model `gpt-5.6-sol`.
- Creative brief, product catalog and feedback: supplied by Codex.
- Five original photographs: built-in imagegen, with prompts in `IMAGE-PROMPTS.json`.
- `PROMPT.md` is the submitted design brief, including feedback from the API's own validation.
- `REFINEMENT.md` and `COMMERCE-POLISH.md` are subsequent prompts sent to the same API after browser review.
- Generated source is exported unchanged into `site/` after generation. Codex does not hand-author storefront HTML, CSS or JSX.

## Catalog

| Product | Option groups | Combinations |
| --- | --- | ---: |
| Parka Cráter 01 | Color, talla, corte, complementos | 120 |
| Mochila Rover 02 | Color, capacidad, kit, complementos | 72 |
| Botella Órbita 03 | Color, capacidad, tapa, complementos | 72 |
| Kit de Misión 04 | Misión, presentación, estuche, complementos | 48 |

312 combinations total, including deliberately sold-out choices. Additions are included in variant prices, so the native grouped product selectors can keep customers in the generated storefront. Product photos show each featured color; alternative colors do not have separate photographs.

## Local files

- `assets/`: original PNG files and JPEG upload copies, compressed to meet the API's image size limit.
- `demo.json`: store identity, assets, catalog identifiers, generation and local publication information.
- `generation-response.json` and `revision-2.json` / `revision-3.json`: successful AI API responses.
- `snapshot.json` and `site/`: the exported final AI-generated store.

The local demo uses a separate test merchant. Its credentials remain in ignored `tmp/orbita/credentials.json` and are not part of this example. No real payment is required to inspect the store.
