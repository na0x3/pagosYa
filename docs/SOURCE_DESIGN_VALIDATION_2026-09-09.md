# Generated storefront design validation — September 9, 2026

**The new pipeline produces materially more distinct compositions in this sample. It does not yet produce uniformly polished, usable sites.** Nine saved variants now include compact ordering menus, editorial covers, a lateral café identity with ticket products, shelf-style ceramics and different uses of the supplied breakfast image. The earlier review found three closely related serif-introduction/catalog/closing pages.

[Open the desktop/mobile comparison](../tmp/source-design-planned-20260909/index.html). [Independent visual assessment](../tmp/source-design-planned-20260909/ASSESSMENT-A-FINAL.md). [Independent browser evidence](../tmp/source-design-planned-20260909/EVIDENCE.md). These local evaluation artifacts are ignored by Git; this report and the implementation documentation are durable repository files.

## What changed

- Creation and authorized redesign first plan three concepts without revealing the independently selected index. A separate implementation call receives the chosen concept. This prevents the same preferred layout from simply being described as whichever index was selected.
- Each concept commits to its main content blocks, catalog location and opening behavior. HTML parsing checks the implementation against that plan. Studio checks rendered promises, mobile basket access and typography. It now includes a 320px check to catch narrow layouts that fit at 390px.
- Bricolage Grotesque, Fraunces and Instrument Sans are available as local, licensed font assets. Only referenced fonts enter exports; confirmed merchant typography retains priority.
- Commerce supports different authored product arrangements without leaving blank image panels, empty status boxes or duplicate checkout forms. Empty drawer mounts stay hidden when an authored drawer trigger exists; older inline carts are preserved. All custom detail links bind to their product, and activation restores an ID stripped by presentation code.
- Planning and implementation share the existing cost allowance, timeout and one repair. An invalid completed plan can consume that repair; it does not create an additional source retry. Ordinary edits retain their saved direction and skip exploration.

[Implementation and contract details](source-design-generation.md).

## Final saved sample

Three synthetic briefs, three products each, one model (`gpt-5.6-terra`), unrestricted visual direction, all selected indexes covered. The breakfast case supplies the repository's existing AI illustration, explicitly identified as synthetic. The index is sampled independently in production and cycled only in the benchmark. Each row is a fresh exploration, not three implementations of one shared proposal set.

| Brief / selected index | Chosen concept | Distinguishing composition | Final commerce checks | Opening checks at 1280/390 |
|---|---|---|---|---|
| Café / 0 | Carta de vereda | Compact menu rows with a lateral illustrated panel | Pass | Pass |
| Café / 1 | La mesa del patio | Serif illustrated cover, then café catalog | Pass | Pass |
| Café / 2 | Altura, vapor, barrio | Navy identity panel and ticket-like products | Pass | Pass |
| Ceramics / 0 | Mesa de torno | Early catalog of illustrated ceramic forms | Pass | Pass |
| Ceramics / 1 | Altura / Agua | Editorial cover and workshop narrative before products | Pass | Pass |
| Ceramics / 2 | Alacena paceña | Domestic shelf motif and utilitarian product cards | **Fail after add** | **Misses compact opening** |
| Breakfast / 0 | La mesa está servida | Photo-led cover; photographed product and text alternatives | Pass | Pass |
| Breakfast / 1 | Pedido de primera hora | Immediate ordering with a featured image/product | Pass | Pass |
| Breakfast / 2 | Mantel compartido | Oval atmospheric image and staggered product presentation | Pass | Pass |

The three successful compact openings place their mobile catalogs around **182–217px** down the page. Narrative variants intentionally begin later and are assessed against that declared choice. Local font families and product arrangements vary; warm paper, terracotta and contrasting closing sections still recur.

## Remaining defects

1. **Ceramics / 2 freezes after adding a product.** Its generated script observes the catalog subtree and unconditionally rewrites text inside the observer callback, creating a feedback loop. The saved failure remains in the benchmark. The generation instructions now specify the runtime's ready event and idempotent decoration. This guidance is not a guarantee against future script defects.
2. **Ceramics / 0 needs mobile layout repair.** The bowl illustration overlaps its product name; at 320px, add controls extend to about x=323. The new narrow-screen check exposes the overflow. It does not reliably identify artwork/text overlap.
3. **Breakfast / 1 separates the desktop featured title from its purchase controls awkwardly. Breakfast / 2 still crowds display letters and places decoration across product information.** These are visual-review findings despite passing basic commerce and opening checks.
4. Narrative variants retain lengthy mobile introductions and similar closing sequences. The experiment demonstrates improvement, not a statistical diversity score or a blanket quality guarantee.

Assessment B also reproduced broken breakfast / 0 detail navigation before the last runtime correction. Its report is preserved as historical evidence. The final replay follows **all 27 rendered product links**, including those overwritten by that script, and all reach the correct product. A browser regression verifies the same behavior through Studio's sandbox navigation.

## Validation and experiment accounting

- **59 API tests passed** across design validation, planning, generation, fonts, estimates and shared budgets.
- **28 focused browser tests passed** across catalog/detail/checkout, cart behavior and Studio checks, including 320px overflow and corrupted product URLs.
- API and Studio production builds passed; `git diff --check` passed.
- Final replay: **8/9 saved variants complete commerce checks**, **9/9 pass actual detail-link navigation**, and **8/9 meet their declared opening checks at 1280/390**. These results do not override the visual defects above.
- Independent A reviewed all nine desktop/mobile pairs; B measured the original eight at desktop, 390px and 320px. The ninth was inspected by A after B's cutoff. No real merchant data, orders or payments were used.

The initial nine-request planned batch saved eight sites. The missing café index 0 failed planning validation. Its first targeted retry repaired the plan but failed source block validation and saved nothing. The second targeted confirmation succeeded. Both failed requests remain recorded with zero user credits; they are not hidden by the final nine-output table.

Eleven planned-pipeline requests cost an estimated **$1.089398** in provider usage, including failed attempts, and recorded 83 synthetic user credits across successful revisions. The intermediate nine-request batch cost **$0.627197**. Total implementation experiments: **20 requests, approximately $1.72 provider cost**. Replays made no generation calls. Saved sites used 8–10 credits each; observed generation-plus-check elapsed times varied around 90–141 seconds. The earlier review's generation costs are outside these totals.

Original benchmark failures included an incorrect checkout selector in the harness; final replays corrected that selector and used the current runtime. Source and generator digests, original attempts and latest verification are retained per business. Successful replay is explicitly separate from first-attempt generation success. The generated design files were not manually beautified to improve these results, and no site was deployed.
