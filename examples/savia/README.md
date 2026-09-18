# Savia demonstration store

A fictional Spanish-language juice, granola and reusable-bottle brand, generated through pagosYa's production `SourceGenerationService` using the configured OpenAI API key. The supplied catalog contains example prices in BOB and 14 genuine variant combinations. The demo is isolated from existing merchant stores.

The generation brief is in [PROMPT.md](PROMPT.md). Local store identifiers, source revision and provider usage receipts are recorded in `demo.json`; no credentials are exported. The generated source is persisted in the development database and exported to `site/`. Only the exported demo enables simulated checkout. It does not create orders or charge money.

To create or resume the demo from the repository root:

```sh
pnpm --filter @pagosya/api exec ts-node scripts/create-savia-demo.ts
PORT=4326 node examples/savia/site/server.mjs
```

The script calls GPT only while the demo has no saved source revision. Existing generated revisions are exported without another generation request. Open <http://localhost:4326>.

Assets:

- `juice.jpg`, `granola.jpg`, `bottles.jpg`: original AI-generated Savia product imagery created for this demonstration, optimized as JPEG files.
- `juice-preparation.mp4`: KATRIN BOLOVTSOVA, [Man Making an Orange Juice Using a Squeezer](https://www.pexels.com/video/man-making-an-orange-juice-using-a-squeezer-7117860/), downloaded from Pexels under the [Pexels license](https://www.pexels.com/license/). Editorial stock footage, not footage of an actual Savia business.
- `reference.jpg`: the user's Amboras screenshot, supplied only to guide composition. It is not storefront content.
- Local interface icons and fonts are bundled by pagosYa with their license files.

The reusable generation prompt was refined in `apps/api/src/stores/source-design.ts` and applied to both static and React generation. It instructs the bot to adapt product presentation to real variant data, use labeled swatches and size choices, and preserve live cart behavior. It also calls for consistent icons, media controls, accessibility and evidenced product details.

Generation completed with `gpt-5.6-sol`: 33,599 input tokens and 9,350 output tokens across design and source calls. The application's provider-cost estimate is USD 0.342713 (35 platform credits); this excludes the separately generated images. Revision 1 is GPT's validated output. Revision 2 saved the initial browser refinements: stronger selected states, tighter product spacing, mobile rules, corrected catalog breadcrumb and more natural catalog copy.

The subsequent premium pass selects candidate A after independent Claude critique, adds eight coordinated photographs, and saves the complete design in the development database. Current revision and local publication are recorded in `demo.json`. See [implementation evidence](review/implementation-report.md), [image prompts](review/image-prompts.json), and the [six-generation pilot](pilot/README.md).

Open the complete offline-safe demonstration at [localhost:4326](http://localhost:4326). The authored customer route is also published **only on the local development installation**, with test payments, at [localhost:5175/s/xlixm44n](http://localhost:5175/s/xlixm44n). This does not deploy anything to a remote production host.

Verification: 129 relevant API tests passed (including the additional payment-error regression); all 208 checkout tests passed. API, checkout and standalone builds passed. The final Chrome mixed-order test kept exact variants and quantities through a simulated Bs 379 checkout. Desktop, tablet and narrow mobile views were checked. See `review/` for screenshots and measured viewport records.

To persist later authorized local Savia refinements, run `scripts/save-savia-premium.ts` through the API workspace, then export with `create-savia-demo.ts`, build with `node examples/savia/site/build.mjs`, and use `publish-savia-local.ts` to update the guarded local customer route. The publication script refuses remote databases and live-payment merchants.
