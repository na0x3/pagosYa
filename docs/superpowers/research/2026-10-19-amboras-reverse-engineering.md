# Amboras, reverse engineered (2026-10-19)

Source: the public GitHub org https://github.com/Amboras — 458 repos, one per merchant store
(`store-my-store-xxxx`), plus `amboras-template-bold`. Every store repo is a fork of
`Ecomcoder/store-my-store-yphh` (the starter). **No licence on any repo** — read and learn, do not copy code into pagosYa.

Cloned for this note (job scratch, not kept): the template + the 10 most recently pushed stores
(vez1, mdbw, ygd1, p52m, 7sr1, eqyq, t1x4, j9ey, wx2r, kiud).

## How a store is built

- Each store is a **complete Next.js 15 + React 19 + Tailwind + Medusa v2 storefront** (~40 routes: home, products,
  product detail, collections, search, cart drawer, 3-step checkout with Stripe Connect/PayPal, account, auth,
  about/contact/faq/privacy/terms/shipping/refund/cookie pages). Multi-tenant via an `X-Store-Environment-ID` header to a shared
  Medusa backend. Hosted on Fly.io, run under PM2.
- The AI is a **Claude Code agent working inside the repo** (`storefront/CLAUDE.md` + `.claude/*.md` per admin area +
  `.claude/skills/`). Commits are authored "Amboras AI" as `step N: edit_file|write_file` — one commit per tool call.
- The agent verifies by **tailing PM2 logs** for "✓ Compiled" and no `GET / 500`. No screenshot or visual-review step
  appears anywhere in the repos.
- Its design skill, `.claude/skills/frontend-design/SKILL.md`, is **Anthropic's public frontend-design skill, verbatim**
  (the same one installed here as `frontend-design:frontend-design`). The other skill is `plugin-safety`.
- CLAUDE.md rules that shape the output: "Always use Tailwind", "**Prefer editing existing components over creating new
  ones**", "**Keep changes minimal and focused**", "Read a file before editing it".
- Plugins (reviews, etc.) are inserted by a codemod at named `<PluginSlot name="pdpAfterTitle">` anchors, tracked by
  `AMBORAS:X:START/END` comment locks.

## What the AI actually changes

Measured as diff from the first AI commit to HEAD (platform upgrades included, so these are upper bounds):
1–25 AI commits per store. A typical design session (store eqyq, 2026-05-02, ~25 steps) touched:
`globals.css` (palette, 45 lines), `layout.tsx` (font swap, 6 lines), header/footer (small), `page.tsx` (23 lines), and
**added commerce components**: bundle-offer, product-reviews, related-products, trust-badges, care-image-gallery
(≈900 lines on the product page). The merchant drives it toward conversion, not art.

Across the 10 stores:

| store | fonts | home | background / accent |
|---|---|---|---|
| 7sr1 | Bitter + Figtree | 217 lines | cream / terracotta |
| eqyq | Lato + Inter | 199 | soft peach / red-orange |
| j9ey | Marcellus + Jost | 304 | near-black / gold (only dark store) |
| kiud | Lato + Inter | 7 (stub) | template default |
| mdbw | Playfair + Inter | 348 | cream / rust |
| p52m | Lato + Inter | 195 | cream / olive |
| t1x4 | Cormorant + DM Sans | 177 | template default |
| vez1 | Lato + Inter | 363 | cream / coral |
| wx2r | Cormorant + DM Sans | 324 | cream / tan |
| ygd1 | Lato + Inter | 142 | cream / rust |

**Despite a design skill that bans Inter and demands that "no design should be the same", 5 of 10 stores ship Lato + Inter
and 8 of 10 are a cream background with one warm accent.** The template defaults win.

Home pages share one grammar: hero (image-led, bottom gradient, headline + pill CTA) → collection/product grid →
editorial/brand story (image + text split) → values/feature triplet or stats → reviews/FAQ → dark band or newsletter →
4-column footer. Sections are `py-24 lg:py-32`-ish; headings come from a fixed scale.

## The template's craft numbers (amboras-template-bold)

- Type scale: display 4.5rem/1.1 −0.02em, h1 3rem/1.15, h2 2.25rem/1.2, h3 1.5rem, h4 1.25rem.
- `container-custom` max 1280px with responsive padding; `py-section` 6rem, `py-section-sm` 3rem.
- Motion: only `fade-in`, `fade-in-up` (0.5–0.6s ease-out) and drawer slides — no scroll scenes.
- Hero: one photo in a rounded frame with aspect 4/5 → 16/9 → 2.1/1, bottom gradient, white pill CTA + circular arrow
  button, headline `clamp(1.1rem,3.5vw,3rem)` with `text-balance`. The code comments record hand-fixed overflow bugs
  ("min-w-0 prevents flex children from blowing out the column", "Removed all min-h-* — they fight aspect-ratio").

## What this means for YAPI

1. **Amboras's quality is a hand-built, hand-debugged template, not a smarter generator.** Their AI starts from a
   finished, professionally laid-out store and edits it a little, so a store can never be worse than the
   template. YAPI writes most of the store fresh on every build, so every build re-rolls layout bugs.
2. **Their stores are not varied.** Same grammar, same fonts in half of them, cream + warm accent in most. What the owner
   admires as "Amboras style" is calm consistency plus polish, which matches the 2026-10-11 Boosterpack finding
   (professional-by-default, bold only when asked).
3. **Their prompts are not the secret.** The design skill is public and generic; the CLAUDE.md rules push toward
   minimal edits of what exists.
4. **They have no visual verification.** The agent checks compiler logs only. Screenshot review is where YAPI can
   already beat them, provided that stage actually runs on builds (see project memory: the Sep-5 review was never
   seen running on builds as of 2026-10-14).
5. Worth borrowing as ideas (not code): named plugin slots on every page for commerce add-ons; per-admin-area context
   files for the agent; product-page conversion blocks (bundle offer, trust badges, related products, reviews) as
   first-class components the agent adds on request.
