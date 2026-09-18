# Critique of the two proposed backend changes

## Change 1: The planner picks the best-fit concept

### Risks
1. **Self-selection undermines exploration.** The prompt currently says "The server will select AFTER this response; no concept is preferred" (`source-design-planner.ts:22`). That hidden choice is what makes the model develop all three concepts fully. Once the model knows it will choose, it will likely write one favourite and two weak alternatives. *(Inferred from model behaviour; not measured.)*
2. **This conflicts with the plan's own rule.** §6.4 says to avoid "using the generator's own enthusiastic description as evidence", and §3 keeps random selection as a benchmark. The rationale is the model's own report, not evidence of fit. Store and label it that way.
3. **Order bias.** LLMs tend to pick the first or middle option. Without a record of which index was chosen, nobody will notice.
4. **The rationale is lost when the design is read back.** `validateSourceDesign` returns only `{ concepts, selected }` (`source-design.ts:59`), and `savedSourceDesign` uses it. Any new field disappears on reload. `sourceDesignAfterSectionEdit` (not read) may also rebuild the object and drop it. *(Inferred.)*
5. **Forced indexes clash with the rationale.** `explore()` overwrites `selected` with `input.selected` before validating (`:45`). If a test forces index 2 while the planner picked 0, the saved rationale describes the wrong concept.
6. **Strict rationale checks waste the only repair.** An invalid plan uses the single repair allowance (`:48–53`). Semantic checks on the rationale (keyword matching, minimum detail) would burn that repair on a cosmetic problem.
7. **Redesigns.** `previousDirection` is sent to the planner. A best-fit choice may simply pick the concept closest to the old site.

### Smallest safe contract
- **Planner schema:** `{ concepts: <unchanged>, selection: { index: 0–2 integer, rationale: string 1–400 } }`. Put `concepts` **before** `selection` so the model writes all three concepts before choosing. With OpenAI strict JSON schema, output follows property order. *(Inferred for other providers, e.g. DeepSeek via `sourceProviderBody`.)*
- **Prompt:** replace "no concept is preferred" with: "Develop all three fully first. Then choose the concept that best fits explicit merchant choices, confirmed brand, the real catalog size and the available images. On a redesign, do not choose based on similarity to previousDirection. The rationale must cite brief or catalog facts, not praise."
- **`explore()` input:** change to `selected?: number`.
  - Forced index: use it, and record `selectionSource: 'forced'`. Set `rationale: null` unless `forced === planner index`.
  - Otherwise: validate the planner's `selection.index` and record `selectionSource: 'planner'`.
- **Server validation:** structure only (integer range, length bounds, trimmed, non-empty). A bad rationale should be dropped (set to `null`) rather than failing the plan. Only an invalid index should use the repair.
- **`SourceDesign` type:** add optional `selection?: { source: 'planner' | 'forced' | 'random'; rationale: string | null }`. `validateSourceDesign` must pass it through when valid and ignore it when missing. Historical `design-direction.json` files must still load.
- **`exploreDesign()`:** return `{ selected?: number }`, defaulting to `{}`. Keep `sourceDesignExploration(selected)` so existing callers and test subclasses work. Keep random selection behind a flag or benchmark option, recorded as `'random'`.
- **Telemetry:** add `selectedIndex` and `selectionSource` to the design attempt or receipt, so order bias shows up in the benchmark.
- **Budget:** no new call. The rationale adds roughly 150 output tokens, well inside the existing 3000 floor.

### Tests
- The planner returns `selection.index=2`, so the saved design has `selected=2` with source `planner`.
- Forced `selected=1` while the planner says 0: saved `selected=1`, source `forced`, rationale `null`.
- Invalid index (3, `-1`, or a string): the repair runs, and a second invalid response throws `BadGatewayException`.
- A rationale that is empty or too long is set to `null`; the plan still completes and no repair is used.
- A historical `design-direction.json` with no `selection` still loads through `savedSourceDesign`.
- A saved design with `selection` survives `savedSourceDesign`, and survives `sourceDesignAfterSectionEdit` if it should.
- The schema snapshot has `concepts` before `selection`, and the prompt no longer contains "no concept is preferred".
- The existing service tests that override `exploreDesign()` still pass unchanged.

## Change 2: Semantic tokens in the visual-system manifest

### Risks
1. **The tokens don't exist yet when the manifest is built.** The manifest is built from concept text before any source exists (`source-generation.service.ts:245, 347`), and the concept schema has no colour or radius fields. Since the concept schema stays the same, the token values must come from the **authored CSS after validation**. They should be resolved around line 492, before saving.
2. **CSS load order breaks brand precedence.** `brand.css` is linked straight after `<head>` (`brand-profile.ts:56`, service `:507`), so it loads **before** `styles.css`. If the generator writes `--brand-accent` itself, that silently overrides the merchant's confirmed brand. Canonical authored variables therefore need a separate namespace.
3. **Version reads break.** `savedSourceVisualSystem` rejects any `version !== 2` (`source-visual-system.ts:60`). Bumping to 3 without accepting 2 breaks historical reads.
4. **The server can't truly resolve values.** Values such as `var()` chains, `color-mix()`, `oklch()` or a Tailwind `@theme` block (Next projects, *inferred*) cannot be computed without a browser. Claiming "resolved" for those is dishonest.
5. **Falling back to `currentColor` can make selected states unreadable.** If accent falls back to `currentColor` and accent-foreground does too, a selected tab gets text the same colour as its fill.
6. **Existing stores could change silently.** `commerce.js` is copied into each saved revision (`:507`), so old snapshots should keep the plum colour. It is unverified whether the hosted or published route serves the snapshot copy or a live runtime. *(Inferred.)* If it serves a live copy, changing the fallback restyles existing stores, which violates §11's "no silent migration".
7. **Local edits could fail on legacy projects.** A requirement like "must author canonical variables" would fail a price-only edit on an old project and use up its repair.
8. **Prompts contradict each other.** `sourceVisualSystemContext` says to define variables "when useful". That must change, or the model gets two different instructions.

### Smallest safe contract
- **Authored names:** `--store-background`, `--store-foreground`, `--store-accent`, `--store-accent-foreground`, `--store-surface`, `--store-border` (a colour), `--store-radius` (a length), `--store-body-font`, `--store-heading-font`. They go in the `:root` of `styles.css` or `styles/globals.css`. The values are the generator's choice; only the names are fixed.
- **Confirmed brand precedence:** where a confirmed fact exists, the authored value must be `var(--brand-<field>)` or `var(--brand-<field>, …)`. The same applies to fonts when `bodyFontUrl` or `headingFontUrl` is confirmed.
  - On creative runs, the validator rejects a literal that contradicts a confirmed fact, and the error goes into the normal repair.
  - Manifest resolution also enforces it: confirmed fact → authored literal → `null`.
- **Manifest:** bump to `version: 3` and add `tokens: Record<name, { authored: string; resolved: string | null; source: 'confirmed' | 'authored' | 'unresolved' }>`.
  - `resolved` is filled only for hex, `rgb()`, lengths, font stacks, or a single `var(--brand-*)` that points at a confirmed value.
  - The reader accepts versions 2 and 3; a v2 manifest simply has `tokens: undefined`.
  - Tokens are **re-extracted from the final files on every save**. A saved manifest never overrides an explicit request.
- **When the tokens are required:** on first creation, redesign and migration (the same gate as `validateSourceVisualSystem`, `:441`).
  - On edits, only fail if the previous revision had the tokens and the changed stylesheet removed them. Unchanged stylesheets are skipped, as in `validateSourcePresentation`.
- **Runtime fallback:** `var(--store-accent, var(--brand-accent, var(--accent, currentColor)))`.
  - Selected and filled states without a token use a border or underline in `currentColor` instead of a fill.
  - Accent-foreground falls back to `var(--store-background, Canvas)`.
  - Keep this inside `@layer pagosya-commerce`.
- **Prompts:** name the canonical variables in `sourceVisualSystemContext` and in the confirmed-brand paragraph (`:293`). Keep "no preset palettes".
- **Contrast:** no server contrast gate. Where both accent values parse as literals, at most log a warning. Computed-style checks stay in Studio.
- **Hosted checkout:** the manifest `tokens` object should be plain serialisable data so checkout can read it later. Wiring that up is out of scope.

### Tests
- **Extraction:**
  - Literal hex, `var(--brand-accent)` with a confirmed fact, and `color-mix()` resolve to `resolved` of hex, the confirmed hex, and `null` (unresolved).
  - Tokens are also found in `styles/globals.css`, and inside `@media`-free `:root` blocks only.
- **Precedence:**
  - A confirmed accent `#112233` with authored `--store-accent: #ff00aa` fails validation on a creative run.
  - `var(--brand-accent, #ff00aa)` passes, and the manifest resolves to `#112233`.
  - Authored `--brand-accent` in `styles.css` is rejected or flagged.
- **Versions:** a v2 fixture still loads through `savedSourceVisualSystem`, a v3 manifest round-trips, and unknown versions return `null`.
- **Edit gating:**
  - A legacy project without tokens plus a price-only edit makes no token-validation call and saves.
  - A project with tokens whose edit deletes `--store-accent` fails.
- **Runtime (Studio or Playwright, computed styles):**
  - No tokens: the product eyebrow and selected tab compute to the body foreground, not `rgb(129, 61, 85)`, and selected-tab text contrasts with its background.
  - With `--store-accent`: the product page, cart line and checkout button all compute that same accent.
- **Snapshot isolation:** after the runtime change, an old revision's saved `commerce.js` is unchanged. Also check which `commerce.js` the hosted route serves.

## Across both changes
- The rationale and the tokens are **records**, not quality signals. Name the fields that way and don't show them to merchants as proof of good design.
- Neither change adds a provider call, and only change 1's rationale adds output tokens (about 150), so both fit the existing 4-minute run and budget.
- Implement change 1 first. It is isolated and testable in the planner and design modules alone. Change 2 touches generation, runtime and prompts, so it needs the rendered checks.