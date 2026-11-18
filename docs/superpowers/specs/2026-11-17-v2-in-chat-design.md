# V2 in YAPI's chat — design

Date: 2026-11-17 · Status: decided (owner: «the one you recommend») · part 1 built · Owner request (2026-11-16): «set the Nov 14 rules as default… I just want stores
like Clyro generates» → «write the spec to connect V2 to YAPI's chat».

## 1. Why

Every store the owner liked since 2026-11-14 (Gramiyaa r3, Miga Dorada r2, Meat House r9, Bake Lab r3, and on 2026-11-16 Taller
Lienzo r2, Meat House n16 r3, Remolino r2) was made by the V2 engine. But a real merchant never reaches V2: the chat's first build
applies a template and queues a follow-up that fills its home (section library or home writer). V2 only runs through
`POST /v1/stores/:id/source-project/v2-prototype`, which is dev-only (`YAPI_V2_PROTO=1`, 404 in production).

Goal: a new store's first design, and «rediseña mi tienda», come from V2 with the default rule set (`YAPI_V2_RULES=nov14`: free mode,
basic breakage + empty-section + pinned-column checks, the model's own menu, rotating showcases), inside the normal chat.

Non-goals: quick edits (texts, colours, a section) stay on today's paths; checkout, account and policies stay frozen; no new design
mechanisms (owner rule «one plan, stop churn»).

## 2. Today's flow (what stays)

1. The merchant's first message → intake questions (`AWAITING_INPUT`) → `generate`.
2. A template is applied (`applyPlantilla`) and saved as rev 1 «Plantilla: X». This keeps the platform pages, config.js, the store's
   data and photos — V2 already builds on top of exactly this («templateBase»).
3. A follow-up job (`SourceMessageInput` with `firstDesign: true`, `sectionLibrary` or `homeWriter`) writes the home; the Studio shows
   «YAPI está diseñando tu tienda» until it saves.

## 3. Proposed flow

Step 3 gains a third kind of follow-up: `v2Design: true`. When `YAPI_V2_CHAT=1`:

- After the template is saved, the follow-up is `{ v2Design: true, firstDesign: true, revision, requestId, model }` instead of
  `sectionLibrary` / `homeWriter`.
- The chat-jobs worker runs it by calling the V2 service's run (the same code the prototype route calls) with the store's base
  revision, the merchant's messages as the request, and the default rules. Progress stages (direction, writing, checks, attempts) are
  reported to the job like today's workflows, so the Studio keeps its «diseñando» state and progress text.
- On DONE the job posts YAPI's message («Tu tienda está lista…») with the new revision; on FAILED it keeps the template revision and
  says so plainly («No pude terminar el diseño; tu tienda quedó con la plantilla X. Reintentar»).
- «Rediseña mi tienda» (already detected by `sourceRedesignRequested`) queues the same `v2Design` job on the store's latest
  template revision.

The prototype route stays for testing (dev only).

## 4. Model and money

- The model comes from `app.yapiV2Model` (today `gpt-5.6-sol` on the ChatGPT plan in dev). Claude is per-run (`model`), capped by
  `maxUsd`.
- In production the build is metered like every YAPI call (`metering.record`) and charged in credits. A V2 design costs about
  $2–2.60 on Claude Opus 5.5, ~$1.40 on Sonnet 5.5, ~$1–1.30 at OpenAI prices on GPT-5.6 Sol. Proposal: the first design is part of
  the plan's free first build (`freeFirst`), later redesigns cost credits like today's redesign.
- A spent quota stops the run and keeps the template revision (today's `spent()` behaviour).

## 5. Risks and how they are handled

| Risk | Handling |
|---|---|
| A V2 run takes 8–15 min; an API restart kills it | The job is marked interrupted like today; «Reintentar» re-queues it from the template revision. |
| Two builds at once on one store | The V2 service already refuses a second run per store; the job waits for the first. |
| The sandbox build (sandbox-exec, macOS) is dev-only | Production needs the same isolated build on Linux — **blocker to check before turning this on in production** (see §7). |
| Third-party / merchant photos | Unchanged: the store's own uploads only; the stock top-up stays off in the default rules. |
| Quality varies by model | The default model is a config value; the owner picks it after the Sol vs Opus comparison. |

## 6. Rollout

1. Dev: `YAPI_V2_CHAT=1` in apps/api/.env; three new test stores through the real chat (first message → questions → design).
2. Compare with the same stores built through the prototype route (same rules) — they should match.
3. Production only after §7 is answered.

Flag off = today's behaviour exactly.

## 7. Open questions for the owner

1. **Model for real merchants:** GPT-5.6 Sol (cheapest, needs OpenAI API credits in production) or Claude (Sonnet 5.5 ~$1.40 /
   Opus 5.5 ~$2.60 per design)?
2. **First design free?** Count it in the plan's free first build, or charge credits?
3. **Production build sandbox:** the V2 sandbox uses macOS `sandbox-exec`; production needs a Linux equivalent (container or
   bubblewrap). Build that now, or keep V2 dev-only until then?
4. **Redesign:** should «rediseña mi tienda» also go to V2 from day one, or only new stores first?

## 8. Tests

- Chat flow: a first build with `YAPI_V2_CHAT=1` queues a `v2Design` follow-up (not section library); with the flag off it does not.
- Jobs: a `v2Design` job calls the V2 run with the base revision and the merchant's words, reports stages, posts the result message;
  a failed run leaves the template revision and a retry message.
- Redesign detection queues `v2Design` on the latest template revision.
- Live: three stores through the real chat (dev), checked against the prototype route.

## 9. Decisions (owner 2026-11-17: «the one you recommend»)

1. Model: **Claude Opus 5.5** for the first design (`YAPI_V2_CHAT_MODEL`, cap `YAPI_V2_CHAT_MAX_USD=10`); Sonnet 5.5 to be tested as
   the cheaper option.
2. The first design is **free** (part of the plan's free first build); later redesigns cost credits.
3. The chat connection is built now, **dev only**; the Linux build sandbox is the next task and a blocker for production.
4. **New stores first**; «rediseña mi tienda» moves to V2 once first designs prove themselves.

Built 2026-11-17: `v2Design` on SourceMessageInput; the new-store first build queues it when `YAPI_V2_CHAT=1`
(source-chat.service `v2FollowUp`); the job worker awaits `SourceV2PrototypeService.designForChat` (posts YAPI's result or failure
message); specs: source-chat-jobs (32) and v2 (96). Live check waits for the ChatGPT plan (intake and template pick run on it).

## 10. Linux build sandbox (built 2026-11-17)

`v2-sandbox.ts` now picks its sandbox by platform (`sandboxCommand`): macOS `sandbox-exec` as before; Linux **bubblewrap** with
`--unshare-all` (no network, own namespaces), a read-only `/`, `/tmp` as tmpfs, the build's work directory as the only writable bind,
every existing `.env` masked by `/dev/null`, `~/.ssh` and `~/pagosya-benchmarks` hidden by tmpfs, an empty environment, a heap cap
and a wall clock. No unsandboxed fallback on any platform.

**Production host requirements (not testable on the Mac):** install bubblewrap (`apt-get install bubblewrap`, path overridable with
`YAPI_SANDBOX_BWRAP`) and allow unprivileged user namespaces (`kernel.unprivileged_userns_clone=1`; on Ubuntu 24.04 also the
AppArmor `userns` allowance for bwrap). First production check: one V2 build on the host before turning `YAPI_V2_CHAT` on there.
