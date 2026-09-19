# YAPI stores — differentiation plan

Status: in progress, 2026-09-19 — see §9 for what has landed on `feature/yapi-differentiation`. Written unattended at the owner's request
("take decisions yourself"); every decision is listed in §7 so it can be overturned.

Evidence this plan is built on:

- `docs/research/CODEX_STOREFRONT_SECURITY_AUDIT.md` — Codex, read-only, at `548621b`. 2 High, 5 Medium, 0 Critical.
- `docs/research/CODEX_STOREFRONT_QUALITY_AUDIT.md` — Codex, read-only. Scores: performance 3/10, SEO 6, a11y 6, trust UX 6, reliability 7.
- `docs/STOREFRONT_DESIGN_LEVEL_UP.md` + `STOREFRONT_DESIGN_PHASE0_RESULT.md` — the design spec and what Phase 0 measured.
- Direct reading of `apps/api/src/storefront-source/source-chat.service.ts` (what YAPI knows) and `source-products.ts` (F2 confirmed by hand).

The screenshots referenced in the request (`~/Desktop/Screenshot 2026-09-16 …`, `~/Downloads/IMG_5126.jpg`) could not be read — macOS denied access. Nothing below depends on them; if they show something specific, add it to §3.

## 1. The thesis

"AI builds you a pretty store" is not a differentiator any more — Shopify, Wix, Tiendanube and amboras all sell it. What nobody sells in Bolivia is a store where all four of these are true **and provable**:

1. **Safe to buy from.** The shopper can see who they're paying and that the business is verified, and the merchant's generated code physically cannot touch customer data or payments.
2. **Fast on a Bolivian phone.** Mid-range Android, 4G, patchy signal. Measured, not claimed.
3. **Legally complete.** SIN e-invoice, BOB prices, local QR, local couriers, real policy pages — out of the box.
4. **Run by an assistant that knows the whole business.** YAPI knows the catalog, hours, shipping, policies, what sells and what doesn't, and says so before being asked.

Design polish (the amboras-level bar) is the entry ticket. It's already specced; this plan finishes it rather than re-specifying it.

The one-line pitch this plan makes true: **"Tu tienda, verificada, rápida y con factura — y YAPI la conoce mejor que nadie."**

## 2. Where we are (honest)

Strong already, don't redo: opaque-origin sandbox for generated code, origin+window checks on every bridge message, server-authoritative prices, immutable digest-checked revisions, SVG-free signature-checked uploads, consent-gated analytics with GPC, verified-purchase-only reviews, server-rendered SEO + JSON-LD, AI visual review, A/B testing with honest stats.

Weak, in order of what a shopper or attacker would hit first:

| # | Gap | Source | Why it matters |
|---|---|---|---|
| 1 | Generated script can navigate its own iframe to an attacker URL carrying typed customer input (address, credit codes) | Sec F1 High | Real exfiltration path around the sandbox |
| 2 | YAPI product edits aren't bound to the product the merchant named — can delete/zero-stock/reprice product B while asked about A; committed at generation time, not publish | Sec F2 High (confirmed at `source-products.ts:155-185`) | Live catalog damage from a model mistake or injected content |
| 3 | Hosted store waits for **every** catalog image to download and become a data URL before showing anything | Qual #1 | This is the performance 3/10. First paint scales with catalog size |
| 4 | Publish API doesn't require the browser checks — only the Studio button does | Qual #5 | Any direct API call publishes an unchecked revision |
| 5 | Never-published stores are publicly discoverable (catalog + SEO) | Sec F3 | Half-built stores indexed by Google |
| 6 | Cart lost on refresh in hosted source stores | Qual #2 | Directly loses sales |
| 7 | No responsive images, whole TTF fonts, uncacheable snapshot, 224 kB shared runtime + per-page React | Qual #3,4,10,11 | Mobile weight |
| 8 | No returns/terms/privacy/delivery-time pages in the baseline | Qual #9 | Trust, and legally expected |
| 9 | React homepage copy invisible to SEO; collections lose SEO; no `es-BO` | Qual #7,13 | Discoverability |
| 10 | YAPI sees only: store name, logo, ≤50 products **without descriptions, categories or collections**, site files, chat | `source-chat.service.ts:35` | YAPI can't "understand everything" — it barely sees the catalog |

## 3. The six differentiators (what we'll be able to say)

**D1. Sello "Comercio verificado por pagosYa".** Rendered by the trusted checkout shell *outside* the generated iframe, so no generated site can forge or hide it. Links to a pagosYa-hosted page: KYC approved (date), NIT, issues SIN e-invoices, payment methods active, verified-review count, time on platform. The generator prompt forbids drawing verification/security badges of its own. No competitor in Bolivia has a shopper-verifiable merchant identity.

**D2. Datos del cliente fuera del alcance del diseño.** Address, phone, credit codes, review tokens move into platform-owned UI (the trusted shell / checkout), never inside authored code. Combined with the frame navigation policy this is a clean, explainable claim: *el diseño de tu tienda nunca ve los datos de tus clientes.*

**D3. Puntaje de calidad por revisión, y no se publica si falla.** Every revision gets a server-computed score — Velocidad, Accesibilidad, SEO, Seguridad, Diseño — bound to the exact snapshot + runtime digest. Publishing below threshold is refused by the API, not just the button. The merchant sees *why* and can ask YAPI to fix it. Design score reuses the Phase 0 metrics (display:body, line-height, measure, gap contrast, card aspect spread) as an automated check.

**D4. Rápida en 4G.** Targets on a throttled mid-range Android profile (Lighthouse mobile, 4G): LCP ≤ 2.5 s, CLS ≤ 0.05, INP ≤ 200 ms, total JS ≤ 150 kB gzip on the home page. Published per store in the quality score.

**D5. Tienda legalmente completa desde el día uno.** Returns, delivery times, privacy, terms — merchant-authored with YAPI drafting from real settings (never inventing), linked from footer and purchase area; factura SIN stated at purchase; `es-BO` metadata; collections and React homepages fully indexable.

**D6. YAPI conoce tu negocio (Store Brain).** One typed, bounded snapshot of the whole business that YAPI reads for every chat, generation and edit — and that powers proactive weekly suggestions ("*Chompa Alpaca: 310 visitas, 0 ventas; es la única foto con fondo gris*"). Every factual claim YAPI puts on a site must trace to a fact in the snapshot; anything else is refused. Still ask-before-apply, as the owner already ruled.

## 4. Phases

Each phase ends with a gate. Nothing moves to the next phase with a High finding open.

### Phase 1 — Close the holes (week 1)

| Task | Size | Lane | Done when |
|---|---|---|---|
| 1.1 Parent `frame-src` policy on `/s/:slug` shells + custom domains, allowing only the srcdoc frame and approved map endpoints; regression test that self-navigation to an external URL is blocked | M | Codex | Browser test proves `location.href = 'https://evil…'` from generated code is blocked; maps still work |
| 1.2 Bind YAPI catalog mutations to an explicit diff: model proposes `{productId, field, from, to}`, reply shows it, merchant confirms, server executes only that diff; product ops removed from source-revision save | M | Claude (touches YAPI prompts/flow) | The three Codex repro cases are unit tests and fail closed |
| 1.3 Explicit `publicVisibility` (default off for new stores), one shared predicate for discovery, SEO, catalog, checkout, domain resolution; migration keeps every currently-served store public | M | Codex | New store invisible in `/v1/store-discovery` and sitemap until first publish |
| 1.4 Domain reconciliation ordered by oldest `lastCheckedAt`, paginated | S | Codex | Test with 450 domains checks all within N runs |
| 1.5 Server-side publish gate: publish requires a stored check result matching snapshot + runtime digest | M | Codex | Direct API publish without checks → 409 with Spanish reason |

Gate: re-run the Codex security audit prompt (appendix A); zero High.

### Phase 2 — Speed (weeks 2–3)

| Task | Size | Lane |
|---|---|---|
| 2.1 Mount the store immediately; images load on demand through a constrained, store-scoped asset path instead of pre-converting the whole catalog to data URLs | L | Codex (design reviewed by Claude first — it's the sandbox boundary) |
| 2.2 Content-addressed immutable revision assets, separate from the no-store visitor/assignment payload | L | Codex |
| 2.3 Upload pipeline: width variants (400/800/1200/1600) in WebP + AVIF, dimensions stored and carried through the catalog; stop stripping `srcset` | L | Codex |
| 2.4 Fonts: Spanish-subset WOFF2 at build, enforce `font-display: swap`, keep validated preloads | M | Codex |
| 2.5 Cart persistence: cart-change events to parent, per-store `localStorage` in the shell | M | Codex |
| 2.6 Split optional runtime (reviews, retention) to lazy chunks; share one React chunk across pages | M | Codex |
| 2.7 Stream `/v1/uploads/*`, bound concurrency, CDN in front (F5); cache/coalesce SEO + domain lookups with a separate internal quota (F4) | M | Codex |

Gate: Lighthouse mobile ≥ 90 performance on the four benchmark stores (`examples/premium-benchmark-photos`), measured before and after, numbers recorded in `docs/research/`.

### Phase 3 — Store Brain: YAPI understands everything (weeks 2–4, parallel to Phase 2)

Claude's lane, because it is prompt + product design + LLM evaluation.

1. **`StoreKnowledge` builder** (`apps/api/src/store-knowledge/`). One pure function from the database to a versioned, typed snapshot:
   identity & verification (KYC state, NIT, SIN active) · full catalog (descriptions, categories, collections, variants, stock, highlights, fiscal class, image count/quality flags) · policies · locations & hours · shipping zones/carriers/times · payment methods live vs test · conversion mode · reviews summary · 30-day funnel per product (views → add-to-cart → paid) · running A/B test · SEO health · latest quality score.
2. **Budget.** Phase 0 already raised the credit floor (~2,300 tokens). The snapshot gets a hard **3,000-token summary**; details (a product's full description, all reviews) are fetched by the planner through a bounded `lookup(factKey)` step, not pasted every time.
3. **Wire it in** to the source chat decider, generation, edits, and the website-channel agent — replacing the ad-hoc `store.paymentLinks take 50` select.
4. **Provenance rule.** Generated copy that states a fact (hours, delivery time, "hecho a mano", price, return window) must carry a fact key; the validator rejects unsupported factual claims. Extends the existing "never invent reviews/claims" rule from prompt-only to enforced.
5. **Insights mode.** Weekly (and on demand: "¿cómo va mi tienda?") YAPI produces ≤ 3 findings from the funnel + quality score + catalog flags, each with a one-click proposed fix that goes through the normal ask-before-apply flow. No auto-apply.
6. **Eval set.** 40 golden merchant questions/instructions over two fixture stores (answers must cite facts; out-of-scope must refuse; product edits must produce the right diff). Runs in CI against recorded fixtures; a live-model run before each release.

Gate: eval ≥ 95% pass, zero invented facts.

### Phase 4 — Views: finish the design level-up (weeks 3–5)

Continue `STOREFRONT_DESIGN_LEVEL_UP.md` from Phase 1 (scene contract) on. Additions from the audits:

- 4.1 Photographic scene contract (spec §5) — highest-impact visual item left. Claude.
- 4.2 Merchant-photo surface sampling (spec §13 open item) so existing catalogs stop looking grey-on-cream without regenerating. Claude.
- 4.3 Design metrics become an automated check inside the quality score (D3), using the Phase 0 measurement script and its bands. Codex builds the harness, Claude sets thresholds.
- 4.4 Contrast enforcement on all token pairs and rendered states, both themes (Qual #8). Codex.
- 4.5 Real keyboard/focus probe (stop no-op'ing `focus` in the shopping probe) + JSX alt coverage (Qual #14). Codex.
- 4.6 External links that work: validated categories for social / `tel:` / `mailto:` / policy links through the bridge (Qual #12). Codex.

Gate: all four benchmark stores inside every Phase 0 band; captures committed under `tmp/design-audit-<date>/`.

### Phase 5 — Trust layer & completeness (weeks 4–6)

- 5.1 D1 verified seal in the trusted shell + public verification page on the pagosYa domain; generator forbidden from drawing badges. Claude (copy/UX) + Codex (shell + endpoint).
- 5.2 D2 move shipping/contact/credit-code/review-token inputs into platform UI (Sec F1 part 2). Codex, L.
- 5.3 D5 policy pages: returns, delivery, privacy, terms — structured fields, YAPI drafts from settings only, footer + purchase-area links. Claude.
- 5.4 SEO completeness: React homepage metadata/prerendered blocks, collection SEO + sitemap, `es-BO`. Codex.
- 5.5 Export parity + hardened hosting wrapper for ZIP exports (Sec F7, Qual #15). Codex, L.
- 5.6 Versioned commerce runtime pinned per publication so rollback really rolls back (Qual #6). Codex.

Gate: re-run both Codex audits → zero High, no Medium without an owner, every quality area ≥ 8/10.

## 5. How the work is divided

**Claude** owns anything where the judgment is product, language or model behaviour: YAPI prompts and flows, Store Brain, provenance rules, eval set, design thresholds, the seal's copy/UX, policy-page drafting — plus **reviewing and merging every Codex branch**.

**Codex** owns well-specified engineering with a crisp done-condition: headers/CSP, visibility predicate, domain reconciliation, publish gate, asset/image/font pipeline, cart persistence, bundle splitting, contrast/a11y probes, SEO plumbing, export wrapper, runtime versioning.

Rules that keep two agents from colliding:

1. **One task = one branch = one git worktree** under `.claude/worktrees/<task-id>`. Codex runs with `-s workspace-write -C <worktree>`; it never touches the main checkout.
2. **Contended files are serialized**, never parallel: `packages/storefront-kit/kit/commerce.js`, `commerce-pages.css`, `apps/checkout/src/source-storefront.ts`, `packages/storefront-preview/src/source-preview.ts`, `apps/api/prisma/schema.prisma`. A task touching one of these holds a lock line in `.superpowers/sdd/DIFFERENTIATION/locks.md` until merged.
3. **Every Codex task spec** states: files it may touch, the failing test to write first, the done-condition from §4, and "do not change unrelated behaviour". Specs live in `.superpowers/sdd/DIFFERENTIATION/tasks/<id>.md`.
4. **Review before merge**: Claude runs the code-review pass on each Codex diff, runs the relevant suites (`api --runInBand` for the flaky source specs, checkout, studio Playwright), and only then merges into an integration branch `feature/yapi-differentiation`. Nothing goes to `main` without the owner.
5. **Ledger**: `.superpowers/sdd/DIFFERENTIATION/progress.md` — one line per task: status, branch, commit, suites run, open follow-ups. Same pattern as the catalog-arrangement ledger.

Safe parallelism on day one: 1.3 (Codex, schema first), then 1.1 and 1.4 (Codex, separate worktrees, no shared files) alongside 1.2 (Claude).

## 6. Measures of "very professional"

| Area | Target | Measured by |
|---|---|---|
| Security | 0 High, 0 unowned Medium | Re-run Appendix A audit + regression tests from 1.1/1.2/1.3 |
| Speed | Lighthouse mobile ≥ 90; LCP ≤ 2.5 s; CLS ≤ 0.05; home JS ≤ 150 kB gz | Lighthouse on 4 benchmark stores, throttled |
| Accessibility | Lighthouse a11y ≥ 95; keyboard purchase path passes; AA contrast on all states | axe + keyboard probe |
| SEO | Lighthouse SEO 100; collections + React homes indexable; valid Product JSON-LD | Rich Results test on a deployed store |
| Design | All Phase 0 bands on 4 benchmark stores | Phase 0 metrics script |
| YAPI | ≥ 95% eval pass, 0 invented facts | Store Brain eval set |

## 7. Decisions taken without asking (overturn any of them)

1. **Security before looks.** F1 and F2 are real exploit paths; Phase 1 goes before any design work.
2. **New stores are private until first publish.** Every store currently served publicly stays public via migration — no existing merchant disappears.
3. **Product changes from YAPI require an explicit diff the merchant confirms.** Consistent with the earlier ask-before-applying ruling; costs one extra tap.
4. **The verified seal lives in the trusted shell, never in generated code**, and the generator may not draw its own trust badges.
5. **Publish gate is enforced in the API**, not only the Studio button.
6. **Store Brain summary capped at 3,000 tokens** with lookups for detail, because Phase 0 already raised the per-attempt credit floor.
7. **No new frameworks** for dashboards/ops (PRODUCT.md constraint stands). The storefront kit stays vanilla.
8. **Codex does engineering, Claude does judgment + review + merge.** All work lands on `feature/yapi-differentiation`, never directly on `main`.

## 8. Owner-only items (cannot be done by either agent)

- Independent penetration test of the deployed edge (SECURITY_HARDENING.md item 1) — required before advertising D1/D2 publicly.
- CDN/object-storage account for 2.2/2.3/2.7.
- Name.com + Cloudflare for SaaS credentials (domain shop, unchanged from HANDOFF §4).
- Real payment rails — HANDOFF §6 still says do not deploy for real money.

## Appendix A — re-running the audits

```sh
codex exec -s read-only -o docs/research/CODEX_STOREFRONT_SECURITY_AUDIT.md - < .superpowers/sdd/DIFFERENTIATION/audit-security.prompt.md
codex exec -s read-only -o docs/research/CODEX_STOREFRONT_QUALITY_AUDIT.md  - < .superpowers/sdd/DIFFERENTIATION/audit-quality.prompt.md
```

## Appendix B — dispatching a Codex task

```sh
git worktree add .claude/worktrees/1.1-frame-src -b diff/1.1-frame-src feature/yapi-differentiation
codex exec -s workspace-write -C .claude/worktrees/1.1-frame-src - \
  < .superpowers/sdd/DIFFERENTIATION/tasks/1.1-frame-src.md
```

## 9. Status (2026-09-19)

Landed and verified on `feature/yapi-differentiation` (not merged to `main`):

- **Security:** F1 frame navigation policy (browser-verified), F2 product-edit binding, F3 private-until-published, F4/F5 origin load, F6 domain reconciliation, API-enforced publish gate. Both Highs from the audit are closed.
- **Design framework `@pagosya/ui`** (`packages/storefront-kit/kit/ui.tsx`): tokens, 4 headers, 4 heroes, 5 catalog layouts × 5 card styles, scroll effects including the product-grows-on-scroll `ProductShowcase`, story chapters, statement, marquee, trust strip, FAQ, footer. YAPI is taught the framework, receives a seeded starting combination per fresh design, and must author one bespoke signature component per store.
- **Store Brain** (`apps/api/src/store-knowledge`): YAPI now sees verification, invoicing, contact, fulfillment and hours, the full catalog with 30-day sales and reviews, funnel and concrete gaps, with rules against stating unsupported facts.
- **Quality:** cart persistence, WCAG AA contrast guard, React alt-text validation, React-homepage and collection SEO, es-BO, runtime history with opt-in rollback.

Decisions changed during implementation:
- Runtime pinning (5.6) records every publication's runtime but stores **follow the latest kit by default**; pinning happens only on an explicit rollback. Always-pin would have frozen platform fixes out of published stores.
- The in-page keyboard probe (4.5) was withdrawn: it removed the guard that stops the hidden check from stealing the merchant's focus, and it flagged good stores. A real keyboard check belongs in the server's Chromium capture with trusted key events.
- Codex was stopped after wave 2 at the owner's request (token cost); remaining work is done directly.

Remaining work is listed in `.superpowers/sdd/DIFFERENTIATION/progress.md`.
