# Faster generation: see the store sooner

Date: 2026-10-12 · Branch: feature/store-page-architecture · Part 2 of the store-quality programme (1 bugs → **2 speed** → 3 showcase stores + headers → 4 structure)

## Why

The owner: "the generation of stores takes too much time, it should take less." Asked what faster means, the owner chose
**"see the store sooner"**: show a working store as early as possible, even if YAPI keeps polishing it afterwards and the
polish lands as a second version.

Measured on the newest store ('deff', 2026-10-13 00:20, ChatGPT-plan bridge) and confirmed on the last 8 new stores:

| Stage | Seconds | Code |
|---|---|---|
| Reading the request (luna) | ~39 | source-chat.service.ts:371 → source-conversation.service.ts |
| Style cards: plan per lane, then model hero per lane | 226–263 | source-generation.service.ts `proposeStyles` (~1672–1787) |
| Merchant picks | ~9 | |
| Store writing (terra, ~10k tokens out) | 211–347 | source-generation.service.ts ~983 |
| Capture + self-review | 47–186 | ~1012–1048 |
| Standard pages + save | <1 | |

Time is roughly proportional to output tokens (~25 s per 1,000 through the bridge), and the bridge serves about two calls
at once. The store becomes visible only after the self-review, ~10 minutes after the request.

## Goal

The store is visible about **3–4 minutes sooner** (≈ 6–6½ min instead of ≈ 10), with the self-review's improvements
arriving 1–2 minutes later as a second version. Nothing the merchant does is ever overwritten by that late version.

## Part 1 — Pick a style as soon as the cards appear (~90 s)

Today: each lane plans its concept, shows its card with a template hero (`source: 'template'`, `heroPending: true`), then
draws a model hero (~90 s, `writeStyleHero`). The row becomes `AWAITING_STYLE` only after `await Promise.all(lanes)`, and
`buildFromStyle` (source-chat.service.ts ~506) refuses any proposal not `AWAITING_STYLE`/`PICKED`.

Change:
- **Pickable while heroes draw.** Once every lane has planned and two or more cards remain (the existing `await save()`
  before `await Promise.all(lanes)`), the proposal is marked pickable: a new `pickable: true` on the proposal (status stays
  `RUNNING` so pending heroes keep saving). The Studio enables «Usar este estilo» on `pickable || status === 'AWAITING_STYLE'`.
  `buildFromStyle` accepts a `RUNNING` proposal that is `pickable`.
- **One run at a time.** The style run still holds the store lease while heroes draw. A pick on a `RUNNING` proposal
  signals the style run (the pick writes `proposal.status = 'PICKED'`; the lane loop checks it) to abort the non-picked
  lanes at once, stop saving, and finish its row without waiting for those lanes. The pick's build waits for that release
  (bounded, ≤ 20 s) before taking the lease, exactly as a pick does today after the row completes.
- **The picked card's hero.** If its model hero is done, the build keeps it (`SEP5_KEEP_HERO`, unchanged). If it is still
  drawing, the build waits for it at most **15 s**. Past that, the build starts **without** `SEP5_KEEP_HERO` and instead
  passes the card's design (fonts, palette, header and hero draw from `slot.draw`, the concept's story/headline) so the
  author draws a hero in the card's look. The template hero is never forced on the store: it is a placeholder, not a
  design. The store then matches the card's look, not its exact first screen; this is the accepted trade.
- Credits for the style run count only completed calls, as today; an aborted hero call is not charged.

Not changed: two cards, one calm + one bold; dedup of openings and bold fonts; one-card and no-card fallbacks.

## Part 2 — Show the store first, review in the background (70–170 s off the wait)

Today (Sep-5 path): author → `acceptCandidate()` → capture + self-review → accept review edits or keep the draft →
standard pages → save → the chat job completes and the Studio shows the store.

Change:
- **Save the draft immediately.** After the author's draft passes `acceptCandidate()`, the run continues straight to
  standard pages and save, producing revision N. `generate()` returns it, the chat job completes, and the Studio shows the
  store as today.
- **Review afterwards.** The self-review (capture → review prompt → edits → `acceptCandidate()`) runs after the save, in
  the background of the same API process, on revision N's files. If it produces accepted edits, it saves revision N+1
  labelled «Revisión de YAPI» through the same save path (standard pages, and the header-clickable gate's "introduced
  problems only" rule against N).
- **Never overwrite the merchant.** The review saves only if the store's current revision is still N when it finishes
  (optimistic revision check on save). Any merchant action that moves the revision (an edit, a template, a restore) makes
  the review discard its result silently; publishing N does not move the revision. A new chat request while the review
  runs cancels the review (its AbortController) before the new run takes the lease.
- **Studio note.** While a review is pending, the Studio shows «YAPI está puliendo tu tienda…» beside the preview and polls
  the store's source state every 4 s (the existing state endpoint, with a new `reviewPending` flag). When the revision
  becomes N+1 it reloads the preview and posts the chat line «Pulí tu tienda: …» (the review's summary). When the review
  is discarded or finds nothing, the note disappears without a message.
- **Metering and credits.** The review call is metered as today; its credits are charged when it finishes; a cancelled
  review is not charged.
- **Process restarts.** A review lost to an API restart is simply gone (revision N stays). `reviewPending` carries a
  heartbeat; a stale flag (> 5 min) is treated as false.
- Applies to new stores and redesigns on the Sep-5 path, where the self-review exists today. Edits (no self-review today)
  are unchanged.

## Dropped from the first proposal

- **Skipping the "reading the request" step for setup-form stores.** Not redundant: `dialogue.decide` classifies each photo
  (product / business / reference), chooses a template, and writes the generation instruction. It writes ~1.8k tokens, so
  slimming it saves little. Left as is.

## Deferred (not in this spec)

- Splicing the picked hero in code instead of asking the author to retype it (~50 s; riskier, and after Part 1 the author
  often receives no finished hero).
- "Incomplete response" runs that throw away 4–5 minutes (reliability work).
- The Studio's after-save checks that load every page at four widths (owner: "the program feels slow").
- StoreAiUsage rows for author/review calls recorded as FAILED even when they succeed (record written before the status).

## Error handling

- Pick on a proposal whose run died or expired: refused as today («Ese estilo ya no está disponible…»).
- Hero wait times out: build without the hero (Part 1), logged as `style_hero_skipped` with the elapsed time.
- Review fails, times out, or produces unusable edits: revision N stays; logged as today; the note disappears.
- Review edits introduce header covers or fail acceptance: discarded (same rule as today's in-run review).

## Testing

- Service tests (`source-generation.service.spec.ts`, targeted runs, `--maxWorkers=2`):
  - a proposal becomes pickable before its heroes finish; a pick aborts the other lane and releases the run;
  - picked hero done → `SEP5_KEEP_HERO` present; still drawing past 15 s → absent, card design passed instead;
  - draft saved as revision N before the review runs; accepted review saves N+1 «Revisión de YAPI»;
  - merchant edit during the review → review result discarded; new request → review cancelled;
  - stale `reviewPending` treated as false.
- Chat service test (`source-chat.service.spec.ts`): `buildFromStyle` accepts a pickable `RUNNING` proposal.
- Studio unit test: pick button enabled on `pickable`; polishing note shown/hidden from `reviewPending`.
- Live: one real new-store generation through the ChatGPT bridge, timing each stage against the table above.
