# Business Playbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YAPI detects the kind of business, builds inside one of that kind's curated style families with a shop-led or story-led craft profile, keeps bold layouts for merchants who ask, and its self-review flags a missing contract section or out-of-profile type sizes.

**Architecture:** A new data module `design-engine/playbook.ts` holds 9 entries (8 kinds + general), keyword detection, family choice, the prompt paragraph and the contract/craft checks. `frameForRun` takes the family's allowed headers, palettes and buttons so the round-1/2 dice stay inside it. The generation service detects the kind before the draw, passes the playbook paragraph to the Sep-5 author, the agent and the planner, and turns the review capture's new `h1Size`/`bodySize`/`pageText` into facts.

**Tech Stack:** NestJS (apps/api), jest, Playwright review capture.

**Spec:** `docs/superpowers/specs/2026-10-11-business-playbook-design.md` (read its "Reference findings": two craft profiles). Research: `docs/superpowers/research/2026-10-11-playbook-references.md`.

## Global Constraints

- Kinds: `cafe-food`, `bakery-sweets`, `clothing`, `beauty`, `services`, `fitness-wellness`, `crafts-home`, `flowers-gifts`, plus `general`.
- Profiles: shop-led (cafe-food, bakery-sweets, clothing, beauty, crafts-home, flowers-gifts, general): h1 28-48 px, body 14-16 px; story-led (services, fitness-wellness): h1 56-96 px, body 16-20 px. Both: container 1140-1320 px, standard header, multi-column footer with legal row.
- Every family palette ink/paper ≥ 4.5:1; every font id exists in `SOURCE_FONT_IDS`; every button id is a kit form.
- Conventional headers only (`centered-split`, `menu-button`, `info-bar`, `stacked`, `shrinking`) unless the merchant asks for bold.
- Bold-by-default off: `sep5BoldDefault` is true only when the merchant's own words ask for bold.
- `YAPI_PLAYBOOK=off` → no kind, no playbook lines, dice unrestricted, `sep5BoldDefault` as before.
- Never run a generation, prisma, or `git stash/checkout/reset` from a subagent; the owner's `pnpm dev` reads the working tree.
- Run API tests from `apps/api` with `npx jest <path>`.

## Review Focus

1. A brief that mentions two kinds ("café y panadería") must pick one deterministically, never crash → test in Task 2.
2. A merchant who asks for bold ("hazla atrevida, estilo póster") must still get bold headers and the bold paragraph → tests in Tasks 1 and 3.
3. A store whose kind is `general` must still get a family, a profile and conventional headers → test in Task 2.
4. The contract check must not fire when the section exists under other words ("Abrimos 9 a 18 h" counts as hours) → test in Task 2.
5. With `YAPI_PLAYBOOK=off`, prompts, dice and facts are as before this plan → tests in Tasks 1-3.

## Planning rulings (also appended to the spec)

- Kind detection is keyword-based on the merchant's instruction, the brief and the catalogue names, run before the draw; the planner does not output `kind` (it runs after the draw and would need a schema change).
- The contract check reads the rendered page text with a per-section regex.
- The craft self-review measures h1 and body sizes against the profile; container width stays a prompt rule (too noisy to measure reliably on real pages).

---

### Task 1: Bold only when asked

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts` (`sep5BoldDefault` ~line 106)
- Modify: `apps/api/src/storefront-source/design-engine/frame-draw.ts` (export `asksForBold`)
- Test: `sep5-author.spec.ts`, `frame-draw.spec.ts` (same folder)

**Interfaces:**
- Produces: `asksForBold(text: string): boolean`; `sep5BoldDefault(input & { playbook?: boolean })` — with `playbook: true` returns `asksForBold(request)`; otherwise unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `frame-draw.spec.ts` (add `asksForBold` to the import):
```ts
it('hears a merchant who asks for a bold store, and nobody else', () => {
  for (const text of ['hazla atrevida', 'quiero un estilo póster', 'algo muy llamativo', 'diseño bold']) expect([text, asksForBold(text)]).toEqual([text, true]);
  for (const text of ['Hazme la tienda de café', 'una tienda tranquila', 'ropa para niños']) expect([text, asksForBold(text)]).toEqual([text, false]);
});
```
Append to `sep5-author.spec.ts`:
```ts
it('keeps bold for merchants who ask when the playbook is on', () => {
  const base = { creative: true, motion: 'expressive' as never, brief: {} };
  expect(sep5BoldDefault({ ...base, instruction: 'Hazme la tienda', playbook: true })).toBe(false);
  expect(sep5BoldDefault({ ...base, instruction: 'Pedido actual del comercio:\nhazla atrevida', playbook: true })).toBe(true);
  expect(sep5BoldDefault({ ...base, instruction: 'Hazme la tienda' })).toBe(sep5BoldDefault({ ...base, instruction: 'Hazme la tienda', playbook: false }));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/frame-draw.spec.ts src/storefront-source/design-engine/sep5-author.spec.ts`
Expected: FAIL — `asksForBold` not exported; `playbook` not a known input.

- [ ] **Step 3: Implement**

`frame-draw.ts`, near `frameOverrides`:
```ts
const BOLD_WORDS = /(?<!\p{L})(atrevid[oa]s?|audaz|audaces|llamativ[oa]s?|p[oó]ster|bold|rompedor[a]?|experimental)(?!\p{L})/iu;
/** The merchant asked for a bold store: poster type and unconventional headers come back. */
export function asksForBold(text: string): boolean { return BOLD_WORDS.test(text); }
```
`sep5-author.ts` `sep5BoldDefault`: add `playbook?: boolean` to the input type; after the `creative/motion` guard and the existing `const request = …` line, add:
```ts
  // Professional by default (playbook spec 2026-10-11): bold only for a merchant who asks for it.
  if (input.playbook) return asksForBold(request);
```
(import `asksForBold` from `./frame-draw`; keep the restraint logic below for the off case).

- [ ] **Step 4: Run the tests** — same command. Expected: PASS (existing tests too).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/storefront-source/design-engine/frame-draw.ts apps/api/src/storefront-source/design-engine/frame-draw.spec.ts apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts
git commit -m "feat(yapi): bold layouts only for merchants who ask, when the playbook is on"
```

---

### Task 2: The playbook module

**Files:**
- Create: `apps/api/src/storefront-source/design-engine/playbook.ts`
- Test: `apps/api/src/storefront-source/design-engine/playbook.spec.ts`

**Interfaces:**
- Consumes: `type Palette`, `DESIGN_CATALOGUE`, `FRAME_CATALOGUE` from `./frame-draw`; `SOURCE_FONT_IDS` from `../source-font-catalog`.
- Produces: `PlaybookKind`, `CraftProfile`, `StyleFamily`, `PlaybookEntry`, `PLAYBOOK`, `CONVENTIONAL_HEADERS`, `detectKind(text)`, `pickFamily(entry, random, recentFamilies)`, `playbookDirection(entry, family)`, `contractMisses(entry, pageText)`, `craftFacts(profile, width, h1Size, bodySize)` — signatures as in the code below.

- [ ] **Step 1: Write the failing tests** — `playbook.spec.ts`:
```ts
import { contractMisses, craftFacts, detectKind, pickFamily, playbookDirection, PLAYBOOK, CONVENTIONAL_HEADERS } from './playbook';
import { SOURCE_FONT_IDS } from '../source-font-catalog';
import { DESIGN_CATALOGUE, FRAME_CATALOGUE } from './frame-draw';

const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

it('has nine entries with valid families, fonts, buttons and readable palettes', () => {
  expect(Object.keys(PLAYBOOK).sort()).toEqual(['bakery-sweets', 'beauty', 'cafe-food', 'clothing', 'crafts-home', 'fitness-wellness', 'flowers-gifts', 'general', 'services']);
  const buttons = DESIGN_CATALOGUE.button.map(entry => entry.id);
  for (const entry of Object.values(PLAYBOOK)) {
    expect(entry.families.length).toBeGreaterThanOrEqual(2);
    expect(entry.sections.length).toBeGreaterThanOrEqual(3);
    for (const family of entry.families) {
      for (const pair of family.fonts) { expect(SOURCE_FONT_IDS).toContain(pair.display); expect(SOURCE_FONT_IDS).toContain(pair.text); }
      for (const button of family.buttons) expect(buttons).toContain(button);
      for (const palette of family.palettes) expect([family.id, palette.id, contrast(palette.ink, palette.paper) >= 4.5]).toEqual([family.id, palette.id, true]);
    }
  }
  expect(PLAYBOOK.services.profile).toBe('story');
  expect(PLAYBOOK['cafe-food'].profile).toBe('shop');
  for (const id of CONVENTIONAL_HEADERS) expect(FRAME_CATALOGUE.header.map(entry => entry.id)).toContain(id);
});

it('detects the kind of business from the merchant words, deterministically', () => {
  expect(detectKind('Tostadero Yungas: tostamos café de especialidad')).toBe('cafe-food');
  expect(detectKind('Somos un estudio contable para pymes')).toBe('services');
  expect(detectKind('Florería en Sopocachi, arreglos y regalos')).toBe('flowers-gifts');
  expect(detectKind('Estudio de pilates reformer')).toBe('fitness-wellness');
  expect(detectKind('Vendemos poleras y vestidos')).toBe('clothing');
  expect(detectKind('Hacemos tortas y pan de masa madre')).toBe('bakery-sweets');
  expect(detectKind('Café y panadería del barrio')).toBe(detectKind('Café y panadería del barrio'));
  expect(detectKind('Vendemos repuestos de motos')).toBe('general');
});

it('picks a family, avoiding the ones recent stores of the same kind got', () => {
  const entry = PLAYBOOK['cafe-food'];
  for (let seed = 1; seed < 30; seed++) expect(pickFamily(entry, seeded(seed), [entry.families[0].id]).id).toBe(entry.families[1].id);
  expect(pickFamily(PLAYBOOK.general, seeded(3), []).id).toBeTruthy();
});

it('writes the playbook paragraph with the contract, the profile and the family values', () => {
  const entry = PLAYBOOK.services, family = entry.families[0];
  const text = playbookDirection(entry, family);
  expect(text.startsWith('PLAYBOOK:')).toBe(true);
  for (const section of entry.sections) expect(text).toContain(section.must);
  expect(text).toMatch(/h1 56-96px/);
  expect(text).toContain(family.palettes[0].paper);
  expect(text).toMatch(/legal row/i);
});

it('reports missing contract sections, counting other words for the same thing', () => {
  const cafe = PLAYBOOK['cafe-food'];
  expect(contractMisses(cafe, 'Nuestra historia: café de especialidad desde 2015. Abrimos de lunes a sábado 9:00 a 18:00. Calle Sagárnaga 215. Envíos y retiro.')).toEqual([]);
  expect(contractMisses(cafe, 'Nuestra historia. Calle Sagárnaga 215. Envíos.')).toContain('horario');
});

it('flags type sizes outside the profile, never a page inside it', () => {
  expect(craftFacts('shop', 1280, 140, 15).join(' ')).toMatch(/título principal/);
  expect(craftFacts('shop', 1280, 40, 15)).toEqual([]);
  expect(craftFacts('story', 1280, 80, 18)).toEqual([]);
  expect(craftFacts('story', 1280, 80, 11).join(' ')).toMatch(/texto/);
  expect(craftFacts('shop', 390, 44, 15)).toEqual([]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/playbook.spec.ts`
Expected: FAIL — `Cannot find module './playbook'`.

- [ ] **Step 3: Implement** — `playbook.ts`:
```ts
/**
 * The business playbook (spec docs/superpowers/specs/2026-10-11-business-playbook-design.md, references in
 * docs/superpowers/research/2026-10-11-playbook-references.md). What a real, professional site of each kind of
 * business always has, two style families it suits, and a shop-led or story-led craft profile.
 */
import type { Palette } from './frame-draw';

export type PlaybookKind = 'cafe-food' | 'bakery-sweets' | 'clothing' | 'beauty' | 'services' | 'fitness-wellness' | 'crafts-home' | 'flowers-gifts' | 'general';
export type CraftProfile = 'shop' | 'story';
export type StyleFamily = { id: string; name: string; palettes: Palette[]; fonts: Array<{ display: string; text: string }>; buttons: string[]; radius: string; photoShape: string };
export type PlaybookEntry = { kind: PlaybookKind; name: string; profile: CraftProfile; sections: Array<{ id: string; label: string; must: string; detect: RegExp }>; families: StyleFamily[]; tone: string; footer: string; references: string[] };

export const CONVENTIONAL_HEADERS = ['centered-split', 'menu-button', 'info-bar', 'stacked', 'shrinking'] as const;

const p = (id: string, name: string, paper: string, ink: string, accent: string, accent2: string): Palette => ({ id, name, paper, ink, accent, accent2, dark: false });
const HOURS = { id: 'hours', label: 'horario', must: 'opening hours from the brief', detect: /(horario|abrimos|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}:\d{2}|\d{1,2}\s*(a|-|–)\s*\d{1,2}\s*h)/i };
const LOCATION = { id: 'location', label: 'ubicación', must: 'where to find it: address and a map link', detect: /(calle|avenida|av\.|zona|barrio|direcci[oó]n|ubicaci[oó]n|mapa|c\/|esquina)/i };
const DELIVERY = { id: 'delivery', label: 'envío o retiro', must: 'how the shopper receives it: delivery area and pickup', detect: /(env[ií]os?|delivery|retiro|recojo|pickup|entrega)/i };
const ABOUT = { id: 'about', label: 'quiénes somos', must: 'a short real story: who makes it and since when', detect: /(nosotros|historia|qui[eé]nes somos|desde \d{4}|nuestro|nuestra|fundad)/i };
const FAQ = { id: 'faq', label: 'preguntas frecuentes', must: 'answers to the real questions a buyer asks', detect: /(preguntas|frecuentes|\?)/i };
const CONTACT = { id: 'contact', label: 'contacto', must: 'how to reach a person: phone, email or form', detect: /(contacto|cont[aá]ctanos|escr[ií]benos|whatsapp|tel[eé]fono|correo|@)/i };
const LEGAL = 'a multi-column footer (shop, information pages, contact and hours) with a legal row: store name, NIT when set, address, and the information pages';

export const PLAYBOOK: Record<PlaybookKind, PlaybookEntry> = {
  'cafe-food': { kind: 'cafe-food', name: 'café and food', profile: 'shop', references: ['buna.mx', 'pukupuku.pe'], sections: [ABOUT, HOURS, LOCATION, DELIVERY], footer: LEGAL,
    tone: 'warm and concrete: origin, process and taste in real words from the brief; no poetry about pauses or moments',
    families: [
      { id: 'cafe-shop', name: 'clean roaster shop', radius: 'square', photoShape: 'plain', buttons: ['block', 'outline', 'underline'], fonts: [{ display: 'outfit', text: 'outfit' }, { display: 'manrope', text: 'manrope' }, { display: 'familjen-grotesk', text: 'figtree' }],
        palettes: [p('cafe-white-red', 'white and deep red', '#ffffff', '#161616', '#8f1d14', '#f4efe9'), p('cafe-white-green', 'white and forest green', '#ffffff', '#141a17', '#1f5c4a', '#eef2ee')] },
      { id: 'cafe-editorial', name: 'editorial café', radius: 'soft', photoShape: 'rounded-corner', buttons: ['outline', 'split', 'pill'], fonts: [{ display: 'young-serif', text: 'instrument' }, { display: 'newsreader', text: 'manrope' }],
        palettes: [p('cafe-paper-blue', 'warm paper and ink blue', '#f7f4ef', '#1a1f2b', '#2f4bb8', '#ebe5db'), p('cafe-paper-olive', 'warm paper and olive', '#f6f4ee', '#1c1d17', '#56602a', '#e9e6db')] },
    ] },
  'bakery-sweets': { kind: 'bakery-sweets', name: 'bakery and sweets', profile: 'shop', references: ['panio.mx', 'rapanui.com.ar', 'pumpstreetchocolate.com'], sections: [ABOUT, HOURS, LOCATION, DELIVERY, FAQ], footer: LEGAL,
    tone: 'generous and specific: ingredients, baking times and real flavours; gifts and occasions when the brief has them',
    families: [
      { id: 'bakery-editorial', name: 'calm editorial bakery', radius: 'soft', photoShape: 'plain', buttons: ['pill', 'outline'], fonts: [{ display: 'libre-caslon-text', text: 'figtree' }, { display: 'dm-serif-display', text: 'manrope' }],
        palettes: [p('bakery-cream-rose', 'cream and rose', '#fbf7f2', '#221a17', '#b0475a', '#f1e6e1'), p('bakery-cream-plum', 'cream and plum', '#faf6f1', '#20161f', '#5b2a52', '#ece3e8')] },
      { id: 'bakery-shop', name: 'chocolate counter', radius: 'square', photoShape: 'plain', buttons: ['block', 'outline'], fonts: [{ display: 'epilogue', text: 'epilogue' }, { display: 'sora', text: 'manrope' }],
        palettes: [p('bakery-white-blush', 'white and blush', '#ffffff', '#1a1515', '#c1543f', '#f0d3c9'), p('bakery-white-navy', 'white and navy', '#ffffff', '#121826', '#23365f', '#e7ebf2')] },
    ] },
  clothing: { kind: 'clothing', name: 'clothing and accessories', profile: 'shop', references: ['carlafernandez.com', 'juanadearco.net', 'solalpaca.com', 'thinkingmu.com'], footer: LEGAL,
    sections: [ABOUT, DELIVERY, { id: 'sizes', label: 'tallas', must: 'sizes and how to choose them', detect: /(talla|tallas|medidas|size)/i }, { id: 'returns', label: 'cambios y devoluciones', must: 'exchanges and returns in one line', detect: /(cambio|devoluci[oó]n|devoluciones)/i }],
    tone: 'short and confident: collections, materials and fit; never hype',
    families: [
      { id: 'clothing-minimal', name: 'minimal boutique', radius: 'square', photoShape: 'plain', buttons: ['block', 'underline', 'outline'], fonts: [{ display: 'instrument', text: 'instrument' }, { display: 'manrope', text: 'manrope' }],
        palettes: [p('clothing-white-black', 'white and black', '#ffffff', '#111111', '#111111', '#efefef'), p('clothing-white-orange', 'white and burnt orange', '#ffffff', '#151515', '#c2410c', '#ecf0f1')] },
      { id: 'clothing-crafted', name: 'crafted label', radius: 'square', photoShape: 'tall', buttons: ['outline', 'pill'], fonts: [{ display: 'bodoni-moda', text: 'figtree' }, { display: 'instrument-serif', text: 'instrument' }],
        palettes: [p('clothing-sand-ink', 'sand and ink', '#f5f1ea', '#161616', '#7a3e1d', '#e8e1d5'), p('clothing-stone-teal', 'stone and teal', '#f2f2ee', '#141816', '#1d5b5b', '#e2e4df')] },
    ] },
  beauty: { kind: 'beauty', name: 'beauty and personal care', profile: 'shop', references: ['xinu.mx', 'matarrania.com'], footer: LEGAL,
    sections: [ABOUT, { id: 'ingredients', label: 'ingredientes o servicios', must: 'what is inside or what the service does, from the brief', detect: /(ingrediente|f[oó]rmula|natural|servicio|tratamiento|piel|cabello)/i }, DELIVERY, CONTACT],
    tone: 'calm and exact: ingredients, routines and results the brief supports; never medical claims',
    families: [
      { id: 'beauty-quiet', name: 'quiet luxury', radius: 'square', photoShape: 'plain', buttons: ['outline', 'block'], fonts: [{ display: 'newsreader', text: 'figtree' }, { display: 'libre-caslon-text', text: 'manrope' }],
        palettes: [p('beauty-ivory-taupe', 'ivory and taupe', '#f6f4ec', '#1b1a17', '#7d6a55', '#ebe7dc'), p('beauty-white-sage', 'white and sage', '#ffffff', '#16201b', '#4f6b5a', '#eef1ec')] },
      { id: 'beauty-fresh', name: 'fresh natural', radius: 'round', photoShape: 'rounded-corner', buttons: ['pill', 'outline'], fonts: [{ display: 'nunito', text: 'nunito' }, { display: 'sora', text: 'figtree' }],
        palettes: [p('beauty-white-leaf', 'white and leaf green', '#ffffff', '#132017', '#2e7d4f', '#e8f2ec'), p('beauty-white-coral', 'white and coral', '#ffffff', '#1e1716', '#c84d3f', '#f6e6e2')] },
    ] },
  services: { kind: 'services', name: 'professional services and finance', profile: 'story', references: ['kambista.com', 'p-narayan-and-associates-15999.boosterpack.xyz', 'pagosya.boosterpack.xyz'], footer: LEGAL,
    sections: [{ id: 'offer', label: 'qué ofrecemos', must: 'what is offered, in plain words', detect: /(servicio|ofrecemos|asesor|contab|legal|financ|cr[eé]dito|tr[aá]mite)/i }, { id: 'steps', label: 'cómo funciona', must: 'how it works in 3-4 numbered steps', detect: /(c[oó]mo funciona|paso|primero|1\.|01)/i }, { id: 'proof', label: 'confianza', must: 'proof: years, clients, registrations or reviews from the brief', detect: /(a[nñ]os|clientes|registr|rese[nñ]a|confian|certific)/i }, FAQ, CONTACT],
    tone: 'clear and trustworthy: what you get, what it costs and what happens next; no jargon',
    families: [
      { id: 'services-editorial', name: 'editorial trust', radius: 'square', photoShape: 'rounded-corner', buttons: ['outline', 'split', 'block'], fonts: [{ display: 'young-serif', text: 'instrument' }, { display: 'playfair-display', text: 'lora' }, { display: 'newsreader', text: 'manrope' }],
        palettes: [p('services-cream-terracotta', 'cream and terracotta', '#f8f5ef', '#262b24', '#9e4a3a', '#ede5d8'), p('services-stone-navy', 'stone and navy', '#f5f5f0', '#1c2133', '#4d5471', '#eaeae4')] },
      { id: 'services-clear', name: 'clear modern', radius: 'soft', photoShape: 'plain', buttons: ['block', 'pill'], fonts: [{ display: 'manrope', text: 'manrope' }, { display: 'sora', text: 'figtree' }],
        palettes: [p('services-white-blue', 'white and trust blue', '#ffffff', '#111827', '#1d4ed8', '#eef2fb'), p('services-white-teal', 'white and teal', '#ffffff', '#10201f', '#0f766e', '#e7f3f1')] },
    ] },
  'fitness-wellness': { kind: 'fitness-wellness', name: 'fitness and wellness', profile: 'story', references: ['yoko-studio-gent-19475.boosterpack.xyz', 'moonpilates.mx'], footer: LEGAL,
    sections: [{ id: 'classes', label: 'clases', must: 'the classes or services with level and length', detect: /(clase|clases|sesi[oó]n|nivel|minutos)/i }, { id: 'prices', label: 'precios', must: 'prices or memberships from the catalogue', detect: /(precio|plan|membres|paquete|Bs\.?|\$)/i }, HOURS, LOCATION, CONTACT],
    tone: 'encouraging and practical: who it is for, what a class feels like, how to start',
    families: [
      { id: 'fitness-studio', name: 'studio warm', radius: 'pill', photoShape: 'arch', buttons: ['pill', 'outline'], fonts: [{ display: 'outfit', text: 'figtree' }, { display: 'bricolage', text: 'manrope' }],
        palettes: [p('fitness-cream-forest', 'cream and forest', '#fdf8e8', '#13221a', '#024526', '#f3e5ab'), p('fitness-cream-clay', 'cream and clay', '#fbf6ee', '#211813', '#a4502f', '#efe1cf')] },
      { id: 'fitness-clean', name: 'clean performance', radius: 'soft', photoShape: 'plain', buttons: ['block', 'outline'], fonts: [{ display: 'sora', text: 'manrope' }, { display: 'epilogue', text: 'epilogue' }],
        palettes: [p('fitness-white-black', 'white and black', '#ffffff', '#0f0f0f', '#0f0f0f', '#f0f0f0'), p('fitness-white-violet', 'white and violet', '#ffffff', '#16131f', '#5b3fd1', '#efecfb')] },
    ] },
  'crafts-home': { kind: 'crafts-home', name: 'crafts and home', profile: 'shop', references: ['onoracasa.com', 'utilitariomexicano.com'], footer: LEGAL,
    sections: [ABOUT, { id: 'craft', label: 'cómo se hace', must: 'materials and how each piece is made', detect: /(hecho a mano|artesan|material|barro|cer[aá]mica|madera|tejid|proceso)/i }, LOCATION, DELIVERY],
    tone: 'honest and tactile: materials, makers and care; each piece is real',
    families: [
      { id: 'crafts-gallery', name: 'gallery shop', radius: 'square', photoShape: 'plain', buttons: ['outline', 'block', 'underline'], fonts: [{ display: 'dm-serif-display', text: 'manrope' }, { display: 'instrument-serif', text: 'instrument' }],
        palettes: [p('crafts-white-charcoal', 'white and charcoal', '#ffffff', '#1b1a19', '#393634', '#efede9'), p('crafts-white-clay', 'white and clay', '#ffffff', '#1d1714', '#a2512e', '#f2e8e1')] },
      { id: 'crafts-market', name: 'market catalogue', radius: 'soft', photoShape: 'plain', buttons: ['block', 'pill'], fonts: [{ display: 'figtree', text: 'figtree' }, { display: 'chivo', text: 'manrope' }],
        palettes: [p('crafts-bone-cobalt', 'bone and cobalt', '#f6f3ec', '#141823', '#2846a8', '#e9e5da'), p('crafts-bone-green', 'bone and green', '#f5f3ec', '#151c16', '#2f6b3a', '#e7e8de')] },
    ] },
  'flowers-gifts': { kind: 'flowers-gifts', name: 'flowers and gifts', profile: 'shop', references: ['margaritasellamamiamor.com'], footer: LEGAL,
    sections: [{ id: 'occasions', label: 'ocasiones', must: 'shop by occasion or category', detect: /(ocasi[oó]n|cumplea|aniversario|boda|regalo|ramo|arreglo)/i }, DELIVERY, ABOUT, CONTACT],
    tone: 'kind and helpful: occasions, delivery times and care, without clichés',
    families: [
      { id: 'flowers-classic', name: 'classic florist', radius: 'soft', photoShape: 'plain', buttons: ['outline', 'block'], fonts: [{ display: 'libre-caslon-text', text: 'figtree' }, { display: 'newsreader', text: 'manrope' }],
        palettes: [p('flowers-white-black', 'white and black', '#ffffff', '#111111', '#111111', '#f3f3f3'), p('flowers-white-rose', 'white and rose', '#ffffff', '#1f1416', '#b23a5b', '#f8e8ec')] },
      { id: 'flowers-garden', name: 'garden fresh', radius: 'round', photoShape: 'rounded-corner', buttons: ['pill', 'outline'], fonts: [{ display: 'fraunces', text: 'figtree' }, { display: 'dm-serif-display', text: 'nunito' }],
        palettes: [p('flowers-cream-green', 'cream and leaf green', '#fbf8f1', '#152017', '#2f6b3a', '#ebe9dc'), p('flowers-cream-coral', 'cream and coral', '#fbf7f2', '#1f1715', '#c4553d', '#efe2d9')] },
    ] },
  general: { kind: 'general', name: 'professional store', profile: 'shop', references: ['pagosya.boosterpack.xyz'], sections: [ABOUT, DELIVERY, CONTACT], footer: LEGAL,
    tone: 'plain and specific: what is sold, for whom and how to buy it',
    families: [
      { id: 'general-clean', name: 'clean shop', radius: 'soft', photoShape: 'plain', buttons: ['block', 'outline'], fonts: [{ display: 'manrope', text: 'manrope' }, { display: 'figtree', text: 'figtree' }],
        palettes: [p('general-white-blue', 'white and blue', '#ffffff', '#111827', '#1d4ed8', '#eef2fb'), p('general-white-green', 'white and green', '#ffffff', '#132017', '#2f6b3a', '#e8f2ec')] },
      { id: 'general-editorial', name: 'editorial shop', radius: 'square', photoShape: 'rounded-corner', buttons: ['outline', 'split'], fonts: [{ display: 'young-serif', text: 'instrument' }, { display: 'newsreader', text: 'figtree' }],
        palettes: [p('general-paper-terracotta', 'paper and terracotta', '#f8f5ef', '#262b24', '#9e4a3a', '#ede5d8'), p('general-paper-navy', 'paper and navy', '#f6f5f0', '#1c2133', '#3a4a8a', '#e9e8e1')] },
    ] },
};

/** Keyword lists in priority order: most hits wins, ties go to the earlier (more specific) kind. */
const KIND_WORDS: Array<[PlaybookKind, RegExp]> = [
  ['flowers-gifts', /(?<!\p{L})(flor(es|er[ií]a)?|ramos?|arreglos? florales?|regal(o|os|er[ií]a))(?!\p{L})/giu],
  ['bakery-sweets', /(?<!\p{L})(panader[ií]a|pasteler[ií]a|reposter[ií]a|tortas?|pan|masa madre|galletas?|chocolates?|dulces|helados?)(?!\p{L})/giu],
  ['cafe-food', /(?<!\p{L})(caf[eé]|cafeter[ií]a|tostader[oa]|tostadur[ií]a|barista|restaurante|comida|cocina|men[uú] del d[ií]a)(?!\p{L})/giu],
  ['fitness-wellness', /(?<!\p{L})(gimnasio|gym|yoga|pilates|crossfit|entrenamiento|fitness|bienestar|meditaci[oó]n)(?!\p{L})/giu],
  ['beauty', /(?<!\p{L})(belleza|sal[oó]n|peluquer[ií]a|barber[ií]a|u[nñ]as|maquillaje|cosm[eé]tica|skincare|spa|perfumes?)(?!\p{L})/giu],
  ['clothing', /(?<!\p{L})(ropa|moda|poleras?|vestidos?|camisas?|pantalones?|zapatos?|calzado|accesorios|boutique|joyer[ií]a|carteras?)(?!\p{L})/giu],
  ['crafts-home', /(?<!\p{L})(artesan[ií]as?|cer[aá]mica|alfarer[ií]a|muebles?|decoraci[oó]n|hogar|textiles?|tejidos?|velas)(?!\p{L})/giu],
  ['services', /(?<!\p{L})(contador|contable|contabilidad|abogad[oa]s?|legal|asesor[ií]a|consultor[ií]a|financier[oa]|cr[eé]ditos?|seguros?|estudio contable|tr[aá]mites)(?!\p{L})/giu],
];
export function detectKind(text: string): PlaybookKind {
  let best: PlaybookKind = 'general', bestHits = 0;
  for (const [kind, words] of KIND_WORDS) {
    const hits = (text.match(words) || []).length;
    if (hits > bestHits) { best = kind; bestHits = hits; }
  }
  return best;
}

export function pickFamily(entry: PlaybookEntry, random: () => number, recentFamilies: string[]): StyleFamily {
  const uses = entry.families.map(family => recentFamilies.filter(id => id === family.id).length);
  const fewest = Math.min(...uses);
  const options = entry.families.filter((_, i) => uses[i] === fewest);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

const PROFILE_LINE: Record<CraftProfile, string> = {
  shop: 'Craft profile shop-led: products lead early (the catalog within the first two screens), h1 28-48px, body 14-16px, a white or near-white page with one brand colour band, compact rhythm.',
  story: 'Craft profile story-led: h1 56-96px, body 16-20px, calm alternating tinted backgrounds with at most one dark band, 96-144px between sections.',
};
export function playbookDirection(entry: PlaybookEntry, family: StyleFamily): string {
  return [
    `PLAYBOOK: This is a ${entry.name} business. Make it read like a normal, professionally made website of that kind, like the best real ones, not an art experiment.`,
    `- It must show: ${entry.sections.map(section => section.must).join('; ')}.`,
    `- ${PROFILE_LINE[entry.profile]} One content container 1140-1320px wide with 64-80px side margins; standard header (logo, 3-5 links, one action, cart); ${entry.footer}.`,
    `- Style family "${family.name}": ${family.radius} corners, ${family.photoShape} photos, fonts ${family.fonts.map(f => `${f.display} + ${f.text}`).join(' or ')}, buttons ${family.buttons.join(' or ')}, colours ${family.palettes.map(pl => `${pl.name} (background ${pl.paper}, text ${pl.ink}, accent ${pl.accent}, panels ${pl.accent2})`).join(' or ')}.`,
    `- Voice: ${entry.tone}.`,
  ].join('\n');
}

export function contractMisses(entry: PlaybookEntry, pageText: string): string[] {
  return entry.sections.filter(section => !section.detect.test(pageText)).map(section => section.label);
}

const LIMITS: Record<CraftProfile, { h1: [number, number]; body: [number, number] }> = { shop: { h1: [22, 64], body: [13, 17] }, story: { h1: [44, 112], body: [15, 21] } };
/** Desktop type sizes against the profile; generous margins so a fact appears only when clearly out of range. */
export function craftFacts(profile: CraftProfile, width: number, h1Size: number, bodySize: number): string[] {
  if (width < 1000) return [];
  const limit = LIMITS[profile];
  return [
    ...(h1Size && (h1Size < limit.h1[0] || h1Size > limit.h1[1]) ? [`${width}px: el título principal mide ${h1Size}px; para este tipo de tienda va entre ${limit.h1[0]} y ${limit.h1[1]}px.`] : []),
    ...(bodySize && (bodySize < limit.body[0] || bodySize > limit.body[1]) ? [`${width}px: el texto de párrafo mide ${bodySize}px; va entre ${limit.body[0]} y ${limit.body[1]}px.`] : []),
  ];
}
```
Note: the regexes in `KIND_WORDS` carry the `g` flag and are only used with `String.match`, never `.test`, so `lastIndex` is not a concern.

- [ ] **Step 4: Run the tests** — `cd apps/api && npx jest src/storefront-source/design-engine/playbook.spec.ts`. Expected: PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/storefront-source/design-engine/playbook.ts apps/api/src/storefront-source/design-engine/playbook.spec.ts
git commit -m "feat(yapi): business playbook — eight kinds plus general, style families from the owner's references, shop-led and story-led craft"
```

---

### Task 3: Dice inside the family, and the wiring

**Files:**
- Modify: `design-engine/frame-draw.ts` (`drawFrame`, `drawDesign`, `frameForRun`, `parseFrameDraw`, `frameDirection` palette lookup)
- Modify: `design-engine/sep5-author.ts` (`playbook?: string` input after `frame`)
- Modify: `design-engine/sep5-review-capture.ts` (facts `h1Size`, `bodySize`, `pageText`)
- Modify: `apps/api/src/config/configuration.ts` (`yapiPlaybook`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`
- Test: `frame-draw.spec.ts`, `sep5-author.spec.ts`, `sep5-review-capture.spec.ts`

**Interfaces:**
- Consumes: Task 1 `asksForBold`; Task 2 `PLAYBOOK`, `detectKind`, `pickFamily`, `playbookDirection`, `contractMisses`, `craftFacts`, `CONVENTIONAL_HEADERS`, `StyleFamily`.
- Produces: `drawFrame(random, recent, available, allowed?: Partial<Record<FramePart, readonly string[]>>)`; `drawDesign(random, recent, available, category, allowed?: { palettes?: Palette[]; button?: readonly string[] })`; `frameForRun` input `playbook?: { kind: string; family: StyleFamily; bold: boolean }`, saved file gains `kind` and `family`; `sep5AuthorPrompt({ playbook?: string })`; `Sep5HeaderFacts` gains `h1Size?`, `bodySize?`, `pageText?`.

- [ ] **Step 1: Write the failing tests**

Append to `frame-draw.spec.ts` (import `PLAYBOOK` from `./playbook`):
```ts
describe('dice inside the playbook family', () => {
  const family = PLAYBOOK['cafe-food'].families[0];
  it('draws only conventional headers, family palettes and family buttons unless the merchant asked for bold', () => {
    for (let seed = 1; seed < 60; seed++) {
      const run = frameForRun({ enabled: true, designEnabled: true, fresh: true, previous: [], recent: [], available: rich, request: 'Hazme la tienda', random: seeded(seed), playbook: { kind: 'cafe-food', family, bold: false } });
      const saved = parseFrameDraw(run.file!.content) as Record<string, string>;
      expect(['centered-split', 'menu-button', 'info-bar', 'stacked', 'shrinking']).toContain(saved.header);
      expect(family.buttons).toContain(saved.button);
      expect(family.palettes.map(pl => pl.id)).toContain(run.palette?.id);
      expect(saved).toMatchObject({ kind: 'cafe-food', family: family.id });
    }
    const bold = frameForRun({ enabled: true, designEnabled: true, fresh: true, previous: [], recent: [], available: rich, request: 'hazla atrevida', random: seeded(9), playbook: { kind: 'cafe-food', family, bold: true } });
    expect(FRAME_CATALOGUE.header.map(entry => entry.id)).toContain(parseFrameDraw(bold.file!.content).header);
  });
  it('reads back kind and family from a saved draw', () => {
    expect(parseFrameDraw(JSON.stringify({ header: 'stacked', kind: 'cafe-food', family: 'cafe-shop' }))).toMatchObject({ kind: 'cafe-food', family: 'cafe-shop' });
  });
});
```
Append to `sep5-author.spec.ts`:
```ts
it('adds the playbook after the frame and stays byte-identical without it', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const text = sep5AuthorPrompt({ ...base, storeShell: true, frame: 'DESIGN DRAW: x', playbook: 'PLAYBOOK: y' });
  expect(text.indexOf('DESIGN DRAW: x')).toBeLessThan(text.indexOf('PLAYBOOK: y'));
  expect(sep5AuthorPrompt({ ...base, playbook: '  ' })).toBe(sep5AuthorPrompt(base));
});
```
Append to `sep5-review-capture.spec.ts`:
```ts
it('measures the h1 and body sizes and the page text for the playbook checks', async () => {
  const header = '<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const { facts } = await captureSep5Draft(await store(header, '', '<h1>Café de altura</h1><p>Abrimos de lunes a sábado de 9:00 a 18:00 en la calle Sagárnaga 215.</p>', 'h1{font-size:140px}p{font-size:15px}'));
  expect(facts[0].h1Size).toBe(140);
  expect(facts[0].bodySize).toBe(15);
  expect(facts[0].pageText).toMatch(/lunes a sábado/);
});
```

- [ ] **Step 2: Run them to see them fail** — `cd apps/api && npx jest src/storefront-source/design-engine`. Expected: FAIL — `playbook` not accepted; facts lack `h1Size`.

- [ ] **Step 3: Implement**

`frame-draw.ts`:
1. `drawFrame(random, recent, available, allowed: Partial<Record<FramePart, readonly string[]>> = {})`: `const fitting = FRAME_CATALOGUE[part].filter(entry => fits(entry, available)); const restricted = allowed[part] ? fitting.filter(entry => allowed[part]!.includes(entry.id)) : fitting; const options = restricted.length ? restricted : fitting;`.
2. `drawDesign(…, category, allowed: { palettes?: Palette[]; button?: readonly string[] } = {})`: `designOptions(part, available, allowed)` returns `allowed.palettes?.length ? allowed.palettes : PALETTES` for `palette`, and for `button` the catalogue filtered by `allowed.button` when that leaves any.
3. Import `PLAYBOOK, CONVENTIONAL_HEADERS, type StyleFamily` from `./playbook` and build `const ALL_PALETTES = [...PALETTES, ...Object.values(PLAYBOOK).flatMap(entry => entry.families.flatMap(family => family.palettes))];` (lazily inside functions if a circular-import TDZ appears: `playbook.ts` only imports the `Palette` type, so a type-only import keeps it safe). Use `ALL_PALETTES` in `frameDirection`, `parseFrameDraw` (palette ids) and the `frameForRun` palette lookups.
4. `parseFrameDraw`: also keep string `kind` and `family` (trimmed, ≤40 chars).
5. `frameForRun` input `playbook?: { kind: string; family: StyleFamily; bold: boolean }`. Fresh branch: `const headerAllowed = input.playbook && !input.playbook.bold ? { header: CONVENTIONAL_HEADERS } : {};` → `drawFrame(random, recent, available, headerAllowed)`; `drawDesign(random, recent, available, input.playbook?.kind ?? input.category ?? '', { palettes: input.playbook?.family.palettes, button: input.playbook?.family.buttons })`; the saved object (frame-only and design branches) gains `...(input.playbook ? { kind: input.playbook.kind, family: input.playbook.family.id } : {})`; the `category` field becomes `input.playbook?.kind ?? input.category ?? ''`.

`sep5-author.ts`: input `playbook?: string`; right after the `frame` line in the returned array: `...(input.playbook?.trim() ? [input.playbook.trim()] : []),`.

`sep5-review-capture.ts`: `Sep5HeaderFacts` gains `h1Size?: number; bodySize?: number; pageText?: string`; in the header `page.evaluate`:
```ts
          h1Size: Math.round(parseFloat(getComputedStyle(document.querySelector('h1') || document.body).fontSize)) || 0,
          bodySize: (() => { const el = Array.from(document.querySelectorAll('main p, p')).find(node => (node.textContent || '').trim().length > 40 && node.getBoundingClientRect().width > 0); return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : 0; })(),
          pageText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 20000),
```

`configuration.ts`: `yapiPlaybook: boolean;` (doc: "Business playbook (spec 2026-10-11): kind detection, style families, craft profiles, bold only when asked. Default on; YAPI_PLAYBOOK=off returns to the design draw without them.") and `yapiPlaybook: process.env.YAPI_PLAYBOOK !== 'off',`.

`source-generation.service.ts` (import `PLAYBOOK, detectKind, pickFamily, playbookDirection, contractMisses, craftFacts` from `./design-engine/playbook`; `asksForBold` from `./design-engine/frame-draw`):
1. Just before `const frame = frameForRun({`:
```ts
    // Playbook (spec 2026-10-11): the kind of business from the merchant's words, brief and catalogue, then one style family.
    const playbookOn = this.config.get<boolean>('app.yapiPlaybook') === true;
    const merchantWords = sourceRequestContext.getStore()?.request.instruction || dto.instruction;
    const kind = playbookOn ? detectKind(`${merchantWords}\n${JSON.stringify(dto.brief ?? {})}\n${data.items.map(item => item.name).join(', ')}`) : undefined;
    const recentDraws = frameEnabled && frameNow ? await Promise.resolve().then(() => this.projects.recentFrameDraws(storeId)).catch(() => []) : [];
    const playbookEntry = kind ? PLAYBOOK[kind] : undefined;
    const playbookFamily = playbookEntry ? pickFamily(playbookEntry, Math.random, recentDraws.filter(draw => (draw as { kind?: string }).kind === kind).map(draw => String((draw as { family?: string }).family ?? ''))) : undefined;
    const boldAsked = asksForBold(merchantWords);
```
   In the `frameForRun` call, replace `recent: frameEnabled && frameNow ? await … : [],` with `recent: recentDraws,` and add `...(playbookEntry && playbookFamily ? { playbook: { kind: playbookEntry.kind, family: playbookFamily, bold: boldAsked } } : {}),`.
2. After the call: `const playbookText = playbookEntry && playbookFamily && frameNow ? playbookDirection(playbookEntry, playbookFamily) : '';`.
3. `authorInput`: add `playbook: playbookText,` and pass `playbook: playbookOn` into the `sep5BoldDefault({ … })` call.
4. Agent: the 7th `agentInstructions` argument becomes `[frame.paragraph, playbookText].filter(Boolean).join('\n')`.
5. Planner `context: JSON.stringify({ …` add `playbook: playbookText || undefined,` next to `designDraw`.
6. Replace `const measured = sep5MeasuredFacts(facts);` with:
```ts
            const playbookFacts = playbookEntry ? facts.flatMap(fact => [...craftFacts(playbookEntry.profile, fact.width, fact.h1Size ?? 0, fact.bodySize ?? 0), ...(fact.width === 1280 && fact.pageText ? contractMisses(playbookEntry, fact.pageText).map(label => `Falta en la página: ${label}.`) : [])]) : [];
            const measured = [...sep5MeasuredFacts(facts), ...playbookFacts];
```

- [ ] **Step 4: Run the tests and type check**

Run: `cd apps/api && npx jest src/storefront-source/design-engine src/storefront-source/agent/agent-prompt.spec.ts src/storefront-source/source-projects.service.spec.ts --testTimeout=120000 && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, tsc exit 0. Then `npx jest src/storefront-source/source-generation-agent.spec.ts src/storefront-source/source-generation.service.spec.ts --testTimeout=120000 --maxWorkers=2` — only the known "steers planning away from recent fingerprints" failure.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/design-engine apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): YAPI builds each store inside its kind's style family — conventional headers, family colours and buttons, playbook contract checked in the self-review"
```

---

### Task 4: Live check (main session; owner asked to build and run)

- [ ] Confirm the API on :3001 started after the last commit.
- [ ] Generate five stores, one each: coffee roaster (round-1 brief + photos), clothing boutique, bakery, beauty salon, accountant. Short real-sounding briefs in the Studio chat; answer follow-up questions with simple facts.
- [ ] For each: read `frame-draw.json` (`kind`, `family`, header, button, palette); screenshot at 1280 and the phone view; read the self-review notes.
- [ ] Pass: each detected the right kind, reads as a real professional site of its kind, has its contract sections, uses conventional headers, keeps type within its profile.
- [ ] Record in `project_yapi_superbot_design.md`.
