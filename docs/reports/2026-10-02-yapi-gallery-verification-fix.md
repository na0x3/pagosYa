# YAPI gallery verification and retry repair

The failed salv redesign (465 seconds) repeated a composition error stating that galeria.html lacked gallery-intro and gallery-sequence. Both sections were present in the retained React source. `validateNextDesign` supplied only index.html to the new multi-page composition validator, so no gallery edit could satisfy it.

The adapter now supplies markup for every registered route using `nextContentPages` and `nextPageMarkup`. Regression tests fail on the old adapter and pass on the fix, covering both page-* files and marked standard page files. Missing or malformed gallery sections still fail validation.

A monitored retry exposed another problem: changing the preview from Inicio to Galería changed currentPage on resubmission and invalidated the original request key. The unnecessary run was cancelled. Studio now keeps the failed submission's page, section selection, template and direction on Retry. A UI regression reproduces navigating the preview between failure and retry.

Validation: 29 composition/design tests, 71 Next source tests, 16 Studio tests, API/Studio TypeScript checks and Studio production build passed. The original retained draft also passed offline browser checks on index.html, galeria.html, product.html and checkout.html at 1280px and 390px without AI calls. This proves the technical blocker is fixed, not visual quality or conversion rates. The saved catalog has no products, so populated purchase states still require actual product data.

Local diagnostic artifacts are in tmp/yapi-failure (ignored, not published). No saved storefront revision was altered directly in the database.

## Shared baseline and navigation follow-up

The visual review subsequently stopped the live retry as PARTIAL after its two-call budget. It found the stock catalog dominated by an empty inline cart, and misclassified checkout simulation safety labels as production defects. The reviewer now receives explicit simulation/catalog context. No further model generations were performed for this follow-up.

`SourceProjectsService.prepare` now applies the installed trusted runtime after compilation and canonicalizes the resulting snapshot. Both agent draft previews and final saves use this path. This fixes the stale catalog presentation in draft captures; canonicalization preserves export integrity. The complete commerce/consent/retention/motion bundle exceeds the former 400,000-character limit, so only the platform commerce-file allowance is now 600,000; authored-file and total-project limits remain in place.

The runtime adds a working account link when a custom shell omits account access, retaining existing account links and platform information navigation. Consent controls continue to use the platform privacy implementation; simulation intentionally suppresses them.

Studio asks how the site should be navigated: a store dropdown or separate pages in the same browser tab. An explicit selection is appended to the submitted instruction, retained verbatim on retry and cleared after success. Keeping the existing navigation remains available. This communicates the choice to generation; it is not a claim that a new model run has been visually certified.

Validation: 18 Studio tests; 17 focused account/cookies/commerce/scratch tests; 43 information-page, analytics and cart-layout tests; 3 privacy tests; generation-agent and runtime suites passed. After the runtime size/canonicalization fixes, all 24 project-service, prepared-artifact and scratch-preview tests passed. The project-file suite also passed. API type checking and Studio standalone/embedded builds passed. Offline browser screenshots of the retained catalog passed at 1280 and 390px and were visually inspected; the mobile cart opens and closes. No real orders, authentication submissions, publications or additional AI calls were made. The original store remains without products and the prior generation remains PARTIAL.
