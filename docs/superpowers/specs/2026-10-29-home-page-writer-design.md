# Home page writer (the Amboras recipe on our chassis) — design

Date: 2026-10-29 · Status: approved in brainstorming, awaiting spec review · Branch: oct24-clean

## Why

The owner compared our one-build-path stores (Esencial + data-only polish, spec 2026-10-29-one-build-path) with a store
Amboras built from the same Gramiyaa prompt (`~/Desktop/Screen Recording 2026-10-29 at 2.53.54 PM.mov`). Ours had smaller
type, a cramped text box over the cover photo and a shorter page.

The Amboras-recipe test on 2026-10-29 night (Gramiyaa template + terra first design, 24 steps):
- **A** (low reasoning, store iknxp8xc) completed: $2.97, 11 min, 37 calls. It had more personality than ours but smaller
  type than Amboras.
- **B** (high reasoning) failed at $3.53. It ran out of steps fighting the «menú no se ve» header check.

Amboras: 24 actions, under 5 minutes, one `page.tsx` write on a fixed Next.js chassis, 8 colour tokens, a build check with
a «design plan» advisory, and responsive screenshots.

Measured on their public chassis (Amboras/store-my-store-vez1, read to learn, never copied):
- **Header and type scale:** 64 px header, 28 px wordmark, uppercase nav. Their type scale is display 72 / h1 48 / h2 36.
  Ours is already the same or larger: display up to 96, h2 up to 60.
- **Product page:** two columns, 3:4 photos, sticky info column, a row of 3 trust icons. It matches ours.
- **Where the gap is:** **only in the home page their AI writes**, with very large serif headlines, framed cover,
  «01 / 04» eyebrows, brand-colour bands and a big FAQ.

Owner decisions (2026-10-29):
- Their method and their look, on our platform.
- No separate restyle of the fixed parts: go straight to the writer.
- If the check fails 3 times, the store gets the Esencial template home.
- Approved this design as written, with the 2026-10-22 «no dark text-only bands» rule kept.

## What it is

A lean mode of today's first-design agent stage (`source-agent-stage.ts`, `runAgent` in `agent/agent-loop.ts`) that
writes one file, the home page, on top of the locked Esencial chassis.

### 1. Scope: what the writer may touch

- `components/home.tsx` (whole file) and the store's colour and font tokens. Nothing else.
- Header, footer, Shell, product page, catalog pages, cart, checkout and account stay exactly as the template made them.
  The workspace runs with `lockedShell` and rejects writes to any other path with a one-line reason.
- The header and menu checks (`agent-checks` header/menu rules, kit surface check) do not run in this mode. The shell is
  untouched, so they cannot fail, and they cost Test B its run.
- Products, prices, photos and the logo come from `store-data` as today. The AI writes headlines and body copy straight
  into `home.tsx`, as Amboras does in `page.tsx`.

### 2. Tools (five, plus finish)

| Tool | Returns / does |
|---|---|
| `read_chassis` | One compact brief: the kit components the home may use, with their props (Reveal, Parallax, product grid, FeatureSlot sections, FAQ, newsletter, marquee); the `store-data` exports; the store's products, photos (with sizes and which are still unused) and brand profile; the font list (`SOURCE_FONT_CATALOG`); the current `home.tsx` from the template. |
| `write_home` | Replaces `home.tsx` with the full new file. Compiles at once and returns the errors, if any. |
| `set_tokens` | Sets the Esencial colour tokens (`--es-paper`, `--es-ink`, `--es-accent`, `--es-on-accent`, `--es-deep`, `--es-on-deep`, `--es-muted`, `--es-band-bg`) and the heading and body fonts from the catalog. Validated for contrast; a bad pair is refused with the reason. |
| `check` | Runs the hard checks (§3) plus the advice list. |
| `screenshot` | Phone (390) and desktop (1280) captures of the home, at most 4 captures per run. |
| `finish` | Ends the run with a one-line summary for the merchant. |

These are new tool definitions passed to `runAgent`; `AGENT_TOOLS` stays as it is for chat edits. `runAgent` gains a
`tools` input (default `AGENT_TOOLS`) so the loop itself is reused unchanged.

### 3. Checks: few that block, the rest advice

**Block** (the writer must fix them):
- compile or render errors
- a dead internal link or a missing image
- a product that cannot be reached from the home
- a photo used twice
- a group of 3 or more photos (owner rule 2026-10-15)
- a black or near-black text-only band (owner rule 2026-10-22)

Brand-tinted colour bands (Amboras's green and ochre) are allowed.

**Advice** (shown once; the writer may ship anyway; the loop already ships after one soft round via `reason: 'soft'`):
- display headline at least ~72 px on desktop
- at least 6 sections
- body text contrast
- the cover text box not narrower than ~40 % of the cover
- every unused brand photo considered

This is the Amboras «design plan» equivalent.

### 4. Cheap history

Each `write_home` call carries the whole file. When a newer `write_home` exists, earlier `write_home` arguments in the
transcript are replaced by a fixed one-line stub («versión anterior de home.tsx reemplazada»), using the same rule as
today's compactor: same replacement for the same item, so cached prefixes stay stable. Older screenshots are evicted as
today. The aim is that a step resends the brief, the latest file and the latest shots, not the ~60k tokens a step sends
now.

### 5. Limits and fallback

- Model: terra at the current `YAPI_FIRST_DESIGN_EFFORT` (default low); 24 tool calls; 6-minute wall clock; 4
  screenshots.
- The run fails the hard checks 3 times, hits a limit with an unclean draft, or the provider fails → the store keeps the
  Esencial template home with the data-only polish (today's path). The merchant never sees a broken or empty home. The
  run's attempts are logged as today.
- Quota waits keep today's first-design retry (`FIRST_DESIGN_MAX_ATTEMPTS`).

### 6. Where it runs and rollout

- New store creation, after the Esencial template and the data-only polish. The writer replaces the home only.
- Switch `YAPI_HOME_WRITER`, default off. With it off, nothing changes.
- Live check on 4 cloned catalogs (NOA, Gramiyaa, PEPPA, DooBoo), side by side with the Amboras Gramiyaa frames. For each
  store, record cost, minutes and calls, plus phone and desktop screenshots. The owner judges the result; if approved,
  the switch becomes the default and this replaces the data-only polish as the one build path.
- Later chat edits stay small edits on the existing agent (owner 2026-10-28). «Rediséñala» is out of scope here.

## Targets (to measure, not promised)

Under 5 minutes and about $0.50–1 per store on the API plan. The live check reports the real numbers.

## Open item for the plan

Confirm Studio inline text editing (double-click) still saves when the words live as literals in `home.tsx` rather than in
`store-data`. If it does not, the writer puts its copy into a `copy` object at the top of `home.tsx` that the save path can
find.

## Out of scope

- Restyling the header, footer, product page, cart or checkout.
- A conversion component library (bundles, countdowns, upsells) — a later spec if the owner wants Amboras's set.
- Switching backends (Medusa) — advised against 2026-10-29.
