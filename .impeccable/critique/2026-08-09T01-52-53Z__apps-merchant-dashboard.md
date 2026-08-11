---
target: apps/merchant-dashboard
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
timestamp: 2026-08-09T01-52-53Z
slug: apps-merchant-dashboard
---
Method: dual-agent (Assessment A: design review · Assessment B: detector + browser evidence, isolated sub-agents)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | 4 of 5 mutating forms give zero success confirmation — only the password-reset flow populates `#info` |
| 2 | Match System / Real World | 2 | Strong local vocabulary, but raw API enums leak into badges untranslated (`REQUIRES_PAYMENT_METHOD`) |
| 3 | User Control and Freedom | 2 | Consequence-specific confirm() on deletes, but deletes are immediately irreversible, no draft-save |
| 4 | Consistency and Standards | 3 | Matches DESIGN.md tokens closely; buttons get native outline instead of the mandated indigo focus ring |
| 5 | Error Prevention | 3 | Required fields, typed inputs, confirm() gates; no format validation on NIT/CI |
| 6 | Recognition Rather Than Recall | 2 | Current-store banner helps; payment/payout rows keyed by opaque backend IDs force cross-referencing |
| 7 | Flexibility and Efficiency | 1 | Zero keyboard shortcuts, zero bulk actions, zero sort/filter/export on any table |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained; undercut by unfiltered noise in the payments table |
| 9 | Error Recovery | 2 | Global `#error` banner exists but sits at the top of a long page, far from where it fires |
| 10 | Help and Documentation | 1 | No tooltips, no help affordances beyond scattered inline microcopy |
| **Total** | | **21/40** | **Acceptable (52.5%, low end)** |

## Design Specificity Verdict

**LLM assessment**: Not generic — NIT/CI legal-identity fields, SIN electronic invoicing (CUIS/Sucursal/Punto de venta), BOB currency throughout, masked Bolivian bank accounts, a WhatsApp-support field baked into store branding, and fully Spanish copy with local idiom. This is authored for the actual Bolivian merchant-onboarding workflow, not reskinned SaaS boilerplate.

**Deterministic scan**: `detect.mjs` returned 5 findings on `apps/merchant-dashboard/index.html` — 4 "broken-image" warnings, 1 em-dash-overuse advisory. **All 4 broken-image hits are confirmed false positives**: 3 are deliberately hidden preview `<img>` tags (`.image-preview { display: none }` until a file is picked, confirmed in CSS), 1 is a JS comment containing the literal text `<img src>`, not markup. The em-dash advisory (15 em-dashes in body text) is real but stylistic, not a defect.

**Visual overlays**: Skipped per this run's fallback signal (same concurrent-session constraint as checkout). Desktop screenshots and a login-flow walkthrough were captured directly instead; genuine mobile-viewport evidence could not be obtained in Assessment B (resize tool didn't take effect), so Assessment A's live mobile screenshot (see P0 below) is the only confirmed mobile evidence across both assessments.

## Overall Impression

This is a genuinely useful, Bolivia-specific merchant tool undercut by real, fixable gaps: a mobile layout that hides the single most important number on the page, an unpaginated payments table that buries real signal under abandoned-checkout noise, and silence on save where every destructive action gets careful confirmation copy but every successful save gets nothing. The single biggest opportunity: the mobile balance-card overflow, since it directly breaks the "merchant checks payout between customers" use case this tool exists for.

## What's Working

- **Real `<label for>` on every field, zero placeholder-as-label anti-pattern**, confirmed across ~9 forms — directly benefits screen-reader users even where the rest of the accessibility story is thin.
- **Consequence-specific delete confirmations** — not generic "are you sure?": category delete explicitly says products keep existing without a category; store delete explicitly says "cannot be undone." Real micro-copy discipline.
- **Bank account masking on payouts** (`•••••5678`) — a security-conscious default nobody had to ask for.

## Priority Issues

**[P0] Mobile layout hides the balance card entirely at true phone width.**
Why it matters: live-confirmed at 390×844 — the `.cards` grid and `.topbar` overflow the viewport horizontally, and on load, `Saldo por pagar` (the single most important number on the page) is scrolled off-screen to the left with no horizontal-scroll affordance. Directly breaks the "merchant checks payout on phone between customers" use case.
Fix: one minimal `@media (max-width: 640px)` block stacking `.cards` to 1 column and wrapping `.topbar` — plain CSS, doesn't violate the no-build constraint.
Suggested command: `/impeccable adapt apps/merchant-dashboard`

**[P1] "Pagos recientes" buries real signal under abandoned-checkout noise, unpaginated.**
Why it matters: live data showed dozens of consecutive `REQUIRES_PAYMENT_METHOD` rows interleaved 1:1 with real payments in one unfiltered, unpaginated table — this is PRODUCT.md's own recorded known-gap made concrete.
Fix: default-filter out incomplete states (or collapse them), add a status filter, paginate at ~20 rows.
Suggested command: `/impeccable distill apps/merchant-dashboard` or a targeted redesign of the payments table

**[P2] Silent success on 4 of 5 mutating forms.**
Why it matters: store settings, KYC, invoicing profile, and category-create all populate `#error` on failure but never populate `#info` on success — for a merchant who just filled a 14-field form, "nothing happened" reads as broken, not saved.
Fix: reuse the existing `#info` banner pattern for every successful mutation.
Suggested command: `/impeccable polish apps/merchant-dashboard`

**[P3] Unexplained 0.00 BOB balance sits next to real revenue elsewhere on the page.**
Why it matters: `Saldo por pagar` shows `0.00 BOB` with no caption, while `Total recaudado` (1531.00 BOB) two sections down has its own explanatory caption. First read of the dashboard can look like an error, not a state.
Fix: add the same caption pattern already used in the Finanzas cards.
Suggested command: `/impeccable clarify apps/merchant-dashboard`

## Persona Red Flags

**Alex (power user)**: no keyboard shortcuts anywhere; every product-row action (Editar/Archivar/Eliminar) is strictly one-at-a-time, zero multi-select; zero sort/filter/export on any of the three tables.

**Sam (screen reader + keyboard-only)**: zero `aria-*`, zero `role`, zero `tabindex` across the whole file (confirmed by grep). Tables have no `scope="col"`, and `#error`/`#info` aren't `aria-live`, so errors go unannounced. Buttons keep native focus outline (not stripped) but it's visually inconsistent with the custom indigo ring on inputs — two different focus treatments on one page. No skip-link past the 9-section page.

**Bolivian merchant checking payouts on a phone between customers**: not realistically supportable as shipped — see P0. Even setting mobile aside, the page's information order puts an unexplained zero-balance card before the reassuring revenue number, the wrong order for a two-second phone check.

## Minor Observations

- Section-head pattern (`h2` + description in one flex row) visually crowds title against paragraph in several sections.
- Login screen surfaces a raw "URL base de la API" input and `POST /v1/dashboard/signup` instructions — likely intentional per the security stance on key issuance, but reads like an unfinished dev tool as presented.
- Payment/payout table primary identifiers are raw backend IDs with no copy affordance, inconsistent with the polished "Copiar" button already used for the store link.
- No `<caption>` on tables for assistive tech; password field has no show/hide toggle.

## Questions to Consider

- If one demo merchant already has 20+ abandoned-checkout rows cluttering the payments table after a few days of seed data, what does this look like for a real merchant six months in?
- PRODUCT.md records zero ARIA as "not yet a decided requirement" — but this surface shows a small-business owner their bank payouts and tax status. At what point does "deliberately lightweight" stop being a valid reason to defer accessibility on something tied to someone's livelihood?
- Every destructive action gets thoughtful confirm() copy, but every successful save gets total silence — was that a deliberate minimalism choice, or did error-handling just get built first and success-feedback never circled back?
