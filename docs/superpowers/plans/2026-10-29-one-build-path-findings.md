# One build path — live check findings (2026-10-29)

Code: oct24-clean `e5830b21..dc7d66e5`. Stack on `pnpm dev:chatgpt`, Studio rebuilt. Five catalog clones built through the real
chat-jobs API with the merchant's first message; each saved revision 1 «Plantilla: Esencial» and revision 2 «Pulido de YAPI»,
no failed step, ≈1 min each, no agent. Screenshots on the comparison page, section «One build path»:
https://claude.ai/artifact/5v5TAbCg1Y4tpyegmJFEsF

| Store | Slug | Asked with | Result |
|---|---|---|---|
| NOA VARGAS Atelier | `6ltl3mat` | Amboras NOA prompt + 9 moodboard photos | calm, arch cover, «Colecciones» dropdown; product cards grey (catalog files lost 2026-10-24) |
| Gramiyaa | `gr3dqrxw` | original Gramiyaa message + 15 attachments | clean, brand yellow; plainer than asked |
| PEPPA please | `dy0tps07` | original PEPPA message | strong |
| DooBoo Gelato | `42wg7d9z` | original DooBoo message | good |
| Remolino | `5prinxhl` | short message | clean |
| NOA (no photos) | `cl0k2cx2` | Amboras NOA prompt, no photos | type hero on black — not a fair test |

## Defects (template or polish, for the owner to rank)

1. **One photo twice** on 4 of 5 home pages: the «pick» section and the origin/manifesto band take the same photo (NOA: story +
   origin). Template (`components/features.tsx` / `home.tsx` photo choice).
2. **Every product on the home grid** (NOA 11, Andes had 12): the Esencial home grid has no cap. Correction to the earlier claim
   that this was only the sol redesign. Template (`home.tsx` catalog) or kit.
3. **Every card «Nuevo»** on clones (products created the same day). Kit badge rule.
4. **Attached photos mostly unused**: NOA used 2 of 9 moodboard photos, Gramiyaa none of its explainer cards; no two-photo «duo»
   band appeared on any store (owner likes it). Polish/fill photo choice + feature roll.
5. **Asked-for features not built**: Gramiyaa's video cover, cold-pressed vs refined comparison with the explainer photo; NOA's size
   guide (a two-row text table only) and shipping/exchange policies. The next small plan (size guide + policies) covers part of it.
6. **Plainer than the merchant asked** when the message wants personality («nada de una plantilla sobria», Gramiyaa). This is the
   trade the one path makes; Amboras's Gramiyaa is bolder (see below).
7. Data, not code: NOA's catalog photo files were lost on 2026-10-24, so its product cards are empty.

Not defects: «secciones sin foto» from `check-store-quality.ts` are the Oct 22 text sections (process, visit, materials); the
≥7000 px bar belongs to the Oct 28 long-page programme.

## Amboras — Gramiyaa (owner's recording, 22 s)

Default Theme, GPT-5.6 Terra Thinking, 4 min 47 s. Heavy display serif headlines, brand green + mustard colour bands, numbered
«El método Gramiyaa», a cold-pressed vs refined table from the merchant's explainer card, recipes + newsletter band, FAQ.
Weak spots seen: the search page renders unstyled, one blank loading screen, the cookie popup covers the hero.

## Open owner questions

- Plan card default (promises sections the polish never builds).
- «rediséñala» still runs the full sol redesign.
- Which defects above to fix first.
