# YAPI signature look — design

Date: 2026-10-09 · Branch: `feature/store-page-architecture` · Checkpoint before this work: tag `checkpoint/before-signature-design-2026-10-09` (commit `ccc0b748`)

## Why

The owner showed six sites from Boosterpack (Yoko, Bassie, Afsnis, WhyNot, Viggo's, P. Narayan) and asked for stores that **escape the vibecoded-app look**. Studying them:

- What makes them feel authored is a **concept that grows from the business itself**, used in words as much as visuals. Viggo's is a café that turns into a listening bar, so the menu is the "Tracklist" and sections are "Side A · The origin" / "Side B · Night mode", with a CSS record turning. The law firm speaks in "Ledger", "Directory", "Precedent". Bassie (a bar in a former circus building) uses bracketed programme labels; Afsnis is a punk cut-and-paste zine.
- The technology is modest: Tailwind plus one to three `@keyframes`. YAPI can already write all of it, so the gap is direction, not capability.
- Boosterpack still carries vibecoded tells: a marquee on all six sites, the same blur/fade-up reveal on every section, a small label above every heading, three review cards, Playfair/Inter on four of six. Copying Boosterpack would copy those.

In YAPI today, the design planner (`source-design-planner.ts`) returns three concepts and picks one; the builder receives the chosen concept as JSON (`source-generation.service.ts:684`). The planner prose already asks to "work from the merchant's products, people, place, materials, cultural references", but **nothing makes it commit to a concrete idea**. Also, the plan schema requires a `headline` on every story beat, so every section has a heading. That is the "label + heading on every section" tell, built into the format.

## Owner constraints

1. **No set rules for YAPI's design.** Add capability and direction, never a grammar or a ban list.
2. **Do not restrict YAPI and do not make anything it does today worse.**
3. Approach chosen: **concept + self-check** (the tells list is advice the builder weighs, never a ban), placed **in the existing planner concept** (no extra AI call).

## Success

- Looking at a new store, the owner cannot tell an AI made it.
- Two stores in the same category (two pilates studios) look **and read** clearly different.
- Nothing YAPI does today gets worse: same finish rate, no new failure paths, run time within ~15%, small edits unchanged.

## Design

### Part 1 — Planner: an optional `signature` on each concept

Each of the three concepts may carry:

```ts
type SourceSignature = {
  idea: string;        // the concept in one sentence, ≤ 200 chars
  source: string;      // the real fact from the brief/photos/reference it grows from, ≤ 200 chars
  vocabulary: string[];// 0–8 words/phrases for nav and section titles, each ≤ 40 chars
  device: string;      // one concrete visual idea in the planner's own words, ≤ 300 chars (free text, may be quiet)
  carries: string[];   // planned layout section IDs where it shows up
};
```

- **Free text, no catalogue.** `device` is the planner's invention. It may be quiet: a law firm's signature can be vocabulary only. Restraint stays valid.
- **Planner prompt:** one added paragraph. Before choosing a layout, find each concept's idea in this business's real story, place, craft, people or products (never in its category alone). Name the fact it grows from. The three concepts' ideas must differ from each other, not only their layouts. A signature can be loud or nearly invisible. Existing prose is unchanged.
- **Schema:** `signature` is added to the strict JSON schema for planned concepts (strict mode needs it listed). Its fields allow empty values, so the model is never forced to invent a device.
- **Validation never fails a plan because of the signature.** In `validateSourceDesign` the signature is normalised in code, the way DNA is (`normalizeDna`):
  - Over-long text is cut at a sentence/word (`fitProse`).
  - `vocabulary` is trimmed to 8 entries; empty or over-long entries are dropped.
  - `carries` keeps only IDs present in `layout.sections`.
  - A signature with no `idea` is dropped entirely.
  - Every repair is pushed to `dnaOptions.repairs`, so it shows in the run log.
  - No signature problem throws, costs the paid repair retry, or fails a run.
- **Saved revisions stay byte-identical.** A saved concept gets `signature` only when it already had one (same rule as `dna`).
- **Loosening:** `story.beats[].headline` becomes optional (empty string allowed, max 100 unchanged). A beat may open with its content or device instead of a heading. Existing plans with headlines are unaffected.

### Part 2 — Builder: carry the signature, then self-check

- **Handoff:** the signature already travels inside "Selected concept: …". One paragraph is added to the builder's creative direction (`storefrontDirection` in `agent/agent-prompt.ts`, and the equivalent single-call creative prompt):
  > The concept's signature is your through-line: build its device, use its vocabulary where it reads naturally in navigation and section titles, and let it reappear in the sections it names. It is direction, not a checklist. Adapt it when a section or the merchant's words call for something else.
- **Self-check (advisory):** in protocol step 5 (the 1280/390 screenshots the builder already takes), add the vibecoded-tells list to weigh:
  - the same fade/blur reveal on every section
  - a marquee added by reflex
  - a small label above every heading
  - three equal cards with icons in tinted circles
  - a centred hero with a "★ 5.0" pill badge
  - Inter or Playfair as the default instead of a choice
  - everything inside rounded cards with soft shadows
  - every section the same width and spacing
  - empty copy words (Discover, Elevate, Experience; Descubre, Eleva, Vive la experiencia)

  Instruction: "If one is there because it was the easy default rather than the concept's choice, change it; if the concept earned it, keep it."
- **Never a verify finding.** The tells list is not checked by `verify`, never blocks `finish`, and never starts a repair loop. It is the same soft category as the existing `sourceEyebrowNote` (`source-design.ts:368`).
- **No new tool calls.** It happens inside the existing screenshot step.
- **Scope:** only when `creative` is true (new stores and full redesigns). Local edits get neither paragraph and behave exactly as today.
- **Record for us:** `finish` accepts an optional `tellsKept: string[]` (≤ 6 entries × 120 chars, e.g. "marquee: it is the circus programme"). It is stored with the run attempt for evaluation, never required, never shown to merchants. The merchant summary is unchanged.

### Part 3 — Off switch

`YAPI_SIGNATURE=off` in `apps/api/.env` → `app.yapiSignature = false` (`config/configuration.ts`, same pattern as `yapiSketchFirst`). When off: no signature in the planner schema or prompt, no signature/tells paragraphs in the builder prompt, `tellsKept` ignored. Headline-optional stays (it only loosens). Default: on.

## Testing

Unit (no cost):
- A plan with a valid signature keeps it verbatim.
- A broken signature (over-long, >8 vocabulary, unknown `carries` IDs, missing idea) is repaired or dropped, with repairs reported, and the plan passes with no retry.
- A plan with no signature passes as today.
- A saved concept without a signature round-trips byte-identical.
- A beat with an empty headline is accepted.
- `finish` succeeds with and without `tellsKept`; `tellsKept` lands on the attempt record.
- Non-creative (edit) prompts contain neither the signature paragraph nor the tells list.
- `yapiSignature = false` removes all three additions.
- The existing suite stays green, except `source-generation.service.spec.ts`'s fingerprint test, which already failed before this work. It is reported as-is.

Live before/after (spends the owner's ChatGPT plan; **ask before running**):
- Three briefs, each on the checkpoint code and on the new code: two pilates studios with different owners and stories, and one café/bar.
- Not worse: completion status, wall time, call count, failures.
- Better:
  - Desktop + mobile screenshots side by side for the owner to judge.
  - A DOM tell count: eyebrows above headings, identical reveal classes, marquee present, font families.
  - Whether the signature vocabulary appears in the rendered page.
- Pass: finish rate and failures no worse, time within ~15%, and the owner judges the new stores less vibecoded. Otherwise the switch stays off and we adjust.

## Out of scope (later sub-projects, in the owner's agreed order)

Photo treatment (one look across all photos), photo cut-outs (background removal), and real business facts from Google/Instagram. Page-order variety already exists (page-grammar work).
