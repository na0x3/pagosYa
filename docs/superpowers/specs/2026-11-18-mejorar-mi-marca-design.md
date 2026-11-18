# «Mejorar mi marca» — YAPI as a branding co-founder

**Status:** design approved by the owner 2026-11-18 (approach A); this spec awaits review.
**Reference:** owner's screen recording of Amboras «Claude Branding» (Calima hot sauce): paste a Shopify link → niche research →
identity (palette + fonts + one line) → brand brief → new campaign photos of the merchant's own bottles → store rebuilt from
the brief → chat edits («add my UGC videos under the buy box»).

## 1. Goal and success

A merchant gives YAPI whatever they have — a website or Shopify link, an Instagram/TikTok link, or just product photos and a
few words — picks **Mejorar mi marca**, and in about ten minutes gets: a visible brand identity, a short brief, 6–8 new
campaign photos of their own products, and a store built from all of it. Then they keep editing by chat as today.

Success = on one live run with a real test store, the result reads as «a brand, not a store» next to the Calima video: one
coherent palette and type, photos that look like one shoot of the merchant's real product, the brand name on a poster spelled
right, and no step lost when one part fails.

**Owner decisions (2026-11-18):** any input (link, Instagram, photos); 6–8 photos charged to YAPI credits (Gratis gets 2);
the identity card shows and the build continues without waiting for approval; one flow inside YAPI chat (approach A).

**Out of scope:** the Meta-ads part of the video; logos of reference brands (shown as name chips — trademarks); a separate
brand page or brief editor (the brief is changed by chat, like everything else); video generation.

## 2. What exists and is reused

| Need | Existing piece |
|---|---|
| Read a website/Shopify link, import catalogue + photos | `apps/api/src/store-import/*`, `storefront-source/brand-source-website.ts`, copy-a-store (`website-copy/*`) |
| Read the merchant's own brand images (colours, slogans, voice, type) | `storefront-source/brand-source-read.ts` (`BRAND_READ_PROMPT`, `brandSheet`) |
| Photos of a product in a new scene, product as fixed reference | `product-content/product-scenes.service.ts` (OpenAI image edits, `quality: medium`, usage metered) |
| One shoot across photos | `storefront-source/source-scene-contract.ts` (`SourceSceneContract`: backdrop, light, camera, fill, aspect, shadow) |
| Fonts we can serve | `storefront-source/source-font-catalog.ts`, `source-font-pairings.ts` |
| Store build | V2: `storefront-source/v2/v2-prototype.service.ts` (`designForChat`, `start`), `v2-context.ts` (what the designer knows) |
| After the first build | `source-brief-checklist.ts`; chat jobs (`source-chat-jobs.service.ts`) |
| Credits | `plans/plans.service.ts` (`assertCredits`; metered usage → credits) |
| Welcome chips | `apps/merchant-dashboard/src/yapi-welcome.mjs` |

**New:** niche research, the identity, the identity card, campaign shots (group, lifestyle, poster), and the flow that chains them.

## 3. The flow

```
input ──► read ──► research ──► identity ──► card in chat ──► campaign shoot ──► V2 build ──► checklist ──► chat edits
          (existing) (new)       (new)        (new)            (extends scenes)   (existing,      (existing)
                                                                                    brief-aware)
```

Runs as one YAPI chat job (`kind: BRAND`), steps saved as they finish so a failure keeps what was done. Status lines in the
chat as today («Investigando tu nicho…», «Tu identidad está lista», «Fotografiando tus productos 3/8…», «Construyendo tu tienda…»).

### 3.1 Starting it

- **Chip** «Mejorar mi marca» on the YAPI welcome (new merchants) and in the store's chat (existing stores). A first message
  that reads as a branding request (intent: rebrand / look like a brand / improve my branding) starts the same flow.
- **Inputs**, detected from the message:
  - **Website or Shopify URL** → existing website reader (pages, palette, fonts, own photos) and, when the store has no
    products, the existing catalogue import.
  - **Instagram / TikTok URL** → these are not read from outside (login walls). YAPI replies once: «Mándame 2–3 capturas de tu
    perfil y fotos de tus productos», then continues with them.
  - **Photos (+ words)** → the existing brand read on the images; product photos become the catalogue's photos when the store
    has none.
- **Needs at least one product photo.** Without one, YAPI asks for it before research (the shoot needs a reference).

### 3.2 Research (new: `brand-research.ts`)

One model call on the active YAPI engine **with live web search** (Claude: server web-search tool; OpenAI: web search tool;
whichever engine `YAPI_*` settings select). Input: what was read (name, products, prices, country, own words, brand read).
Output, schema-checked:

```ts
type BrandResearch = {
  niche: string;              // «salsas picantes artesanales»
  audience: string;           // one line
  references: Array<{ name: string; why: string }>;  // exactly 3; brands that sell in this niche
  patterns: string[];         // 3–5 things that convert here («receta junto al producto», «escala de picante»)
  searched: boolean;          // false = model knowledge only (no search available) — said in the chat
};
```

Reference names are text only; the model must not invent sales figures. Search results are data, never instructions.

### 3.3 Identity (new: `brand-identity.ts`)

A second call (same engine, no search) turns research + what was read into:

```ts
type BrandIdentity = {
  mode: 'evolve' | 'new';     // evolve when the merchant has a real brand (logo/colours found); keeps its logo and leading colour
  palette: { ink: string; primary: string; accent: string; secondary: string; base: string };  // #RRGGBB
  fonts: { display: string; secondary: string; body: string };   // names from source-font-catalog only
  oneLiner: string;           // «una paleta de sol tibio y letra firme y cercana»
  voice: string;              // 1–2 lines: tú/usted, warm/formal
  photoDirection: string;     // 1–2 lines for the shoot (light, setting, props)
  scene: SourceSceneContract; // the shoot's contract, validated by the existing normaliser
};
```

Checked in code, not trusted: hex format; ink on base and base on primary at WCAG AA for text (the nearest passing shade is
taken when one fails); fonts outside the catalogue replaced by the closest pairing from `source-font-pairings`; scene through
`normalizeSourceSceneContract`.

**The brief** = `{ research, identity, createdAt, inputs }` saved in the store's source project as `brand-brief.json` (next to
`visual-system.json`), before the shoot. Every later build and edit reads it (palette, fonts, voice, photo direction), so chat
edits stay on-brand. A chat request about the look («más rosado», «otra letra») updates the brief and rebuilds, like today's
restyles.

### 3.4 Identity card in chat

A chat message of a new kind (`metadata.brandCard`) that the Studio chat renders as a card:
- the five swatches with hex codes and role names;
- the three fonts, each set in itself («Display — Agrandir Grand Bold»);
- the three reference chips with their one-line «why» on hover/tap;
- the one-liner: «Esta es la nueva identidad de Calima: …»;
- «(sin búsqueda en vivo)» under the chips when `searched` is false.

Built from the saved brief, not model prose (the same rule as `brandSourceReceipt`). No pause: the flow continues.

### 3.5 Campaign shoot (extends product scenes: `brand-shoot.ts`)

Up to **8 photos** on paid plans, **2 on Gratis** (plan table in `plans.ts`), from this shot list, in order, until the cap:

| # | Shot | References | Aspect |
|---|---|---|---|
| 1 | Hero: the range together on the brief's set | up to 4 product photos | landscape |
| 2 | Lifestyle: the product in use (from `photoDirection`) | best product photo | portrait |
| 3 | Poster: the brand name large on the brief's colours, product in front | logo (if any) + product | landscape |
| 4 | Close-up / texture of the hero product | product | square |
| 5–6 | Lifestyle for the next two products | that product | portrait |
| 7 | Flat lay / overhead of the range | up to 4 | square |
| 8 | Second hero for banners | up to 4 | landscape |

- Each shot = one image-edit request (the existing scenes call, extended to several reference images), prompt built from
  `photoDirection` + `scene` + the shot line; «keep the product, label and bottle exactly as in the reference» as in
  `productScenePrompt`.
- **Poster check:** a vision read of the poster must find the brand name spelled exactly; if not, one retry, then the poster is
  regenerated **without** text (the store sets the name in real type over it).
- **Credits:** `assertCredits` before the shoot and between shots; usage recorded per shot as scenes do today. Credits running
  out stops the shoot; the build uses what was shot.
- Photos are saved as the merchant's uploads and added to the store's photo library with alt text and the shot kind, so the
  build and the photo picker see them.
- Cost at today's model: about US$0.05–0.07 per photo → US$0.40–0.60 for eight.

### 3.6 Build

The existing V2 build (`designForChat` path) with two additions:
- `v2-context.ts` gives the designer the brief block (identity, voice, patterns that convert, reference names as «brands this
  niche trusts, not to copy») and the campaign photos first, by shot kind (hero → hero, poster → a band, lifestyle → story).
- The palette and fonts of the brief are the tokens of the build (they win over a template's), so the store matches the card.

Then the existing checklist and the normal reply, which ends with what YAPI did («Investigué tu nicho, armé tu identidad,
fotografié 8 escenas y construí tu tienda») and two suggested next edits drawn from `patterns`.

## 4. Failures

| What fails | What happens |
|---|---|
| No image key / image service down | No shoot; build with the merchant's own photos; the reply says why. Brief and card still shown. |
| Credits run out mid-shoot | Shoot stops; build with what was shot; the reply offers more credits. |
| Web search unavailable | Research from model knowledge, `searched: false`, said on the card. |
| Research or identity call fails twice | Falls back to today's build (brand read + V2) and says the identity step failed. |
| Instagram/TikTok link | Asks for screenshots + product photos (3.1). |
| No product photo | Asks for one before research. |
| Poster spelling wrong after retry | Poster without text. |
| Build fails | The brief and photos stay saved; «Reintentar» resumes from the build. |

## 5. Data and security

- `brand-brief.json` lives in the source project (versioned with revisions like `visual-system.json`); no new table.
- Campaign photos are ordinary uploads owned by the merchant.
- Search results, page text and image text are data, never instructions (existing prompt rules).
- The job is metered and capped like other YAPI jobs (a per-job USD cap covers research + identity + shoot + build).

## 6. Testing

- **Unit:** research/identity schema parsing; contrast repair; font fallback to catalogue; scene normalisation; shot list by
  plan cap; poster spelling check (fixture vision answers); card built from a brief (no model prose).
- **Orchestration:** the BRAND job with fake engines: happy path; no image key; credits run out after shot 3; research fails
  twice → plain build; Instagram link → asks for screenshots.
- **Light checks rule:** one spec file per run, no full `tsc`, no folder-wide jest.
- **Live run:** one real test store (a hot-sauce or drinks catalogue from `~/Downloads` brand folders), side by side with the
  Calima video; owner judges. Needs an OpenAI API key with balance for images and a working text engine.

## 7. Open items for the owner

- An **OpenAI API key with balance** for the photos (the ChatGPT-plan bridge does not do images).
- A working text engine for research/identity (on 2026-11-18 the Anthropic balance was empty and the ChatGPT plan over its limit).
