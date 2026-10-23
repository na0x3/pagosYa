# YAPI pill in design mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the dashboard's design mode the store fills the screen and YAPI is a movable glass pill that says, in plain Spanish, what it is doing — no side panel, no file log.

**Architecture:** Four small pure modules in `apps/merchant-studio/src/` (plain step sentences, pill placement + spin state, toolbar fade, pill/cards/history markup) wired into `source-studio.ts` behind a layout switch; the existing narrator becomes the speech bubble that follows the pill; the dashboard gets a `design-focus` full-screen mode driven by one Studio message.

**Tech Stack:** TypeScript Studio (vitest, Playwright), plain-JS dashboard (node:test).

**Spec:** `docs/superpowers/specs/2026-10-22-yapi-floating-window-design.md` (v2)

## Global Constraints

- No file paths, file names or «Leyó / Editó / Escribió …» ever shown in pill mode.
- Model is not chosen in design mode; «¿Cómo se navegará tu sitio?» and the Crear producto / Rediseñar / Mejorar el móvil chips are not shown.
- The pill: star · input «¿Qué quieres crear o mejorar?» · ＋ (Agregar fotos, Crear producto) · Historial · yellow «Enviar ↗». Movable; place kept per browser; double-click on the star resets it; docked full width at the bottom on phones (≤ 600px).
- The star turns continuously (1.6 s a turn) while YAPI changes something; reduced motion → opacity pulse.
- Exit only through a semi-transparent round × top-left (40px, 60 % → 100 % on hover/focus, `aria-label="Salir del diseño"`).
- Tools bar top centre fades to 35 % after 3 s idle; Publicar alone top-right, never fades.
- `localStorage` reads/writes wrapped in try/catch.
- Store news shows in the bubble above the pill, never in the middle of the preview.
- Merchant-facing text in plain Spanish.
- Rebuild the Studio after Studio edits: `cd apps/merchant-dashboard && pnpm run build:studio`.

## Spec amendment (applied in Task 7)

The layout switch is the URL, not an API flag: pill mode is on in the embedded Studio (the dashboard's design mode, `embedded=1`) unless `layout=classic`; the standalone Studio keeps today's layout unless `layout=pill`. Existing standalone Playwright suites keep the side panel without changes.

## Review Focus

1. A pill dragged near an edge, then the window shrinks (or the phone rotates) → the pill stays fully on screen. (Task 2 test)
2. A build that fails or is cancelled → the star stops and the bubble says it stopped. (Task 2 spin test; Task 6 e2e)
3. A step label the mapping does not know (a new agent tool) → a neutral sentence, never the raw label with a path. (Task 1 test)
4. `localStorage` blocked (private window) → the pill works at its default place; nothing throws. (Task 2 test)
5. A plan card or a question arrives → the cards stack above the pill shows it until answered. (Task 4 test)

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/merchant-studio/src/source-step-words.ts` (create) | Build progress → plain step sentences (no paths, repeats collapsed) |
| `apps/merchant-studio/src/source-narration.ts` (modify) | `narrationFromProgress(progress, plain)` uses the plain sentences |
| `apps/merchant-studio/src/source-yapi-pill.ts` (create) | Pill placement (load/save/clamp/keys/dock/reset) and spin state |
| `apps/merchant-studio/src/source-toolbar-fade.ts` (create) | The tools bar's idle fade |
| `apps/merchant-studio/src/source-yapi-pill-view.ts` (create) | Markup: pill, exit ×, history sheet; which messages need an answer |
| `apps/merchant-studio/src/source-yapi-pill.css` (create) | Pill-mode styles |
| `apps/merchant-studio/src/source-narrator.ts` + `.css` (modify) | `anchor()` so the bubble follows the pill; `spinning()` |
| `apps/merchant-studio/src/source-studio.ts` (modify) | Layout switch, pill-mode render/bind, narrator as bubble, design-focus message |
| `apps/merchant-dashboard/src/design-focus.mjs` (create) + `dashboard.js`, `dashboard.css`, `server.mjs` (modify) | Full-screen design mode |
| `apps/merchant-studio/tests/yapi-pill.spec.ts` (create) | End-to-end pill mode |

---

### Task 1: Plain step sentences

**Files:**
- Create: `apps/merchant-studio/src/source-step-words.ts`
- Modify: `apps/merchant-studio/src/source-narration.ts` (`narrationFromProgress`)
- Test: `apps/merchant-studio/src/source-step-words.test.ts`

**Interfaces:**
- Consumes: `BuildProgress` (`source-build-progress.ts`).
- Produces:
  - `function stepSentence(label: string): string | null` — null for plan lines («Voy a: …», «Planificó …») and «Terminó».
  - `function stepLines(progress: BuildProgress | null, max?: number): string[]` — plain lines, repeats collapsed, newest last, at most `max` (default 3).
  - `narrationFromProgress(progress, plain = false)` — with `plain`, the current-step line is the newest plain sentence.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { stepLines, stepSentence } from './source-step-words';
import { narrationFromProgress } from './source-narration';

const progress = (labels: string[]) => ({ status: 'running', startedAt: 0, updatedAt: 0,
  steps: [{ stage: 'building', label: 'Construyendo los cambios', startedAt: 0, status: 'running', details: labels.map(label => ({ label })) }] }) as any;

describe('plain step sentences', () => {
  it('turns every agent step into a sentence without a path', () => {
    const cases: Record<string, string> = {
      'Leyó components/store-data.tsx': 'Estoy mirando cómo está hecha tu tienda',
      'Editó styles/globals.css': 'Estoy cambiando los colores y las letras',
      'Escribió components/brands.tsx': 'Estoy armando una sección nueva',
      'Editó components/home.tsx': 'Estoy ajustando la portada',
      'Editó components/product.tsx': 'Estoy ajustando la página de producto',
      'Editó components/checkout.tsx': 'Estoy ajustando el pago',
      'Editó components/story.tsx': 'Estoy ajustando una sección',
      'Creó la página nosotros.html': 'Estoy creando una página nueva',
      'Borró components/old.tsx': 'Estoy quitando lo que ya no se usa',
      'Buscó productos: proteína': 'Estoy buscando tus productos',
      'Inspeccionó assets/image-1.jpg': 'Estoy mirando tus fotos',
      'Capturó index.html (móvil)': 'Estoy revisando que se vea bien en el celular',
      'Capturó index.html (escritorio)': 'Estoy revisando cómo se ve en la computadora',
      'Buscó ilustraciones: hojas': 'Estoy eligiendo ilustraciones',
      'Eligió la identidad de la ficha de producto': 'Estoy dándole estilo a las fichas de producto',
      'Actualizó la política de envíos': 'Estoy escribiendo tus políticas',
      'Diseñó las páginas de cuenta': 'Estoy diseñando las páginas de cuenta',
    };
    for (const [label, sentence] of Object.entries(cases)) expect([label, stepSentence(label)]).toEqual([label, sentence]);
  });
  it('plan lines and the finish say nothing here; an unknown step is neutral', () => {
    expect(stepSentence('Voy a: poner una sección por marca')).toBeNull();
    expect(stepSentence('Planificó 4 requisitos')).toBeNull();
    expect(stepSentence('Terminó')).toBeNull();
    expect(stepSentence('Compiló components/x.tsx con 3 avisos')).toBe('Estoy trabajando en tu tienda');
  });
  it('collapses repeats and keeps the newest few', () => {
    expect(stepLines(progress(['Leyó a.tsx', 'Leyó b.tsx', 'Editó styles/globals.css', 'Editó styles/x.css', 'Capturó index.html (móvil)'])))
      .toEqual(['Estoy mirando cómo está hecha tu tienda', 'Estoy cambiando los colores y las letras', 'Estoy revisando que se vea bien en el celular']);
    expect(stepLines(progress(['Leyó a', 'Editó styles/a.css', 'Capturó i (móvil)', 'Editó components/home.tsx']), 2)).toHaveLength(2);
    expect(stepLines(null)).toEqual([]);
  });
  it('the narration\'s current line is plain in pill mode and never carries a path', () => {
    const n = narrationFromProgress(progress(['Leyó components/store-data.tsx']), true);
    expect(n.lines.at(-1)).toBe('Estoy mirando cómo está hecha tu tienda…');
    expect(JSON.stringify(n)).not.toMatch(/\.tsx|\.css|Leyó/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx vitest run src/source-step-words.test.ts`
Expected: FAIL — cannot find module './source-step-words'

- [ ] **Step 3: Implement**

```ts
import type { BuildProgress } from './source-build-progress';

/** YAPI in design mode (spec 2026-10-22 v2 §3): what YAPI is doing, in the merchant's words — never a file name. */
const RULES: Array<[RegExp, string]> = [
  [/^(?:Voy a:|Planificó)/, ''],
  [/^Terminó/, ''],
  [/^Leyó/, 'Estoy mirando cómo está hecha tu tienda'],
  [/^(?:Editó|Escribió) \S*\.css\b/, 'Estoy cambiando los colores y las letras'],
  [/^(?:Editó|Escribió) \S*\/home\.tsx\b/, 'Estoy ajustando la portada'],
  [/^(?:Editó|Escribió) \S*\/product[^/\s]*\.tsx\b/, 'Estoy ajustando la página de producto'],
  [/^(?:Editó|Escribió) \S*\/checkout[^/\s]*\.tsx\b/, 'Estoy ajustando el pago'],
  [/^Escribió/, 'Estoy armando una sección nueva'],
  [/^Editó/, 'Estoy ajustando una sección'],
  [/^Creó la página/, 'Estoy creando una página nueva'],
  [/^Borró/, 'Estoy quitando lo que ya no se usa'],
  [/^Buscó productos/, 'Estoy buscando tus productos'],
  [/^Buscó ilustraciones/, 'Estoy eligiendo ilustraciones'],
  [/^Inspeccionó/, 'Estoy mirando tus fotos'],
  [/^Capturó .*\(móvil\)/, 'Estoy revisando que se vea bien en el celular'],
  [/^Capturó/, 'Estoy revisando cómo se ve en la computadora'],
  [/^Eligió la identidad de la ficha/, 'Estoy dándole estilo a las fichas de producto'],
  [/^(?:Actualizó|Quitó) la política/, 'Estoy escribiendo tus políticas'],
  [/^Diseñó las páginas de cuenta/, 'Estoy diseñando las páginas de cuenta'],
];
const NEUTRAL = 'Estoy trabajando en tu tienda';

export function stepSentence(label: string): string | null {
  const text = label.trim();
  if (!text) return null;
  const rule = RULES.find(([pattern]) => pattern.test(text));
  return rule ? rule[1] || null : NEUTRAL;
}

export function stepLines(progress: BuildProgress | null, max = 3): string[] {
  if (!progress) return [];
  const lines: string[] = [];
  for (const step of progress.steps) for (const detail of step.details ?? []) {
    const sentence = stepSentence(String(detail?.label ?? ''));
    if (sentence && lines.at(-1) !== sentence) lines.push(sentence);
  }
  return lines.slice(-max);
}
```

In `source-narration.ts`: `import { stepLines } from './source-step-words';`, change the signature to `export function narrationFromProgress(progress: BuildProgress | null, plain = false): Narration` and the running branch's return to:

```ts
    const now = plain ? stepLines(progress, 1)[0] : undefined;
    return { phase: 'work', lines: [...lines, now ? `${now}…` : `Ahora: ${lowerFirst(shorten(running.label.replace(/[.…]+$/, ''), LINE_CHARS))}…`] };
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-step-words.test.ts src/source-narration.test.ts`
Expected: PASS (new + existing narration tests)

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-step-words.ts apps/merchant-studio/src/source-step-words.test.ts apps/merchant-studio/src/source-narration.ts
git commit -m "feat(studio): YAPI says what it is doing in plain words, never a file name"
```

---

### Task 2: Pill placement and the spinning star

**Files:**
- Create: `apps/merchant-studio/src/source-yapi-pill.ts`
- Test: `apps/merchant-studio/src/source-yapi-pill.test.ts`

**Interfaces:**
- Produces:
  - `type PillPlace = { x: number; y: number } | null` (null = default bottom centre); `type Box = { width: number; height: number }`
  - `loadPlace(storage: Pick<Storage, 'getItem'> | null): PillPlace`; `savePlace(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, place: PillPlace): void` — key `pagosya_yapi_pill`, never throw
  - `placePill(place: PillPlace, pill: Box, viewport: Box): { left: number; top: number; docked: boolean }`
  - `nudge(place: PillPlace, key: string, pill: Box, viewport: Box): PillPlace` — arrows move 10px
  - `spinState(input: { building: boolean; followingOwnRequest: boolean; reducedMotion: boolean }): 'spin' | 'pulse' | 'idle'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadPlace, nudge, placePill, savePlace, spinState } from './source-yapi-pill';

const pill = { width: 560, height: 64 };
const desk = { width: 1440, height: 900 };

describe('pill placement', () => {
  it('sits bottom centre by default and docks full width on a phone', () => {
    expect(placePill(null, pill, desk)).toEqual({ left: 440, top: 812, docked: false });
    expect(placePill({ x: 300, y: 200 }, pill, { width: 390, height: 800 })).toMatchObject({ left: 0, docked: true });
  });
  it('stays fully on screen when the window shrinks', () => {
    expect(placePill({ x: 1300, y: 880 }, pill, { width: 1000, height: 600 })).toEqual({ left: 432, top: 528, docked: false });
  });
  it('arrow keys move it 10px from where it is', () => {
    expect(nudge(null, 'ArrowUp', pill, desk)).toEqual({ x: 440, y: 802 });
    expect(nudge({ x: 100, y: 100 }, 'ArrowRight', pill, desk)).toEqual({ x: 110, y: 100 });
    expect(nudge({ x: 100, y: 100 }, 'Enter', pill, desk)).toEqual({ x: 100, y: 100 });
  });
  it('saved places survive a reload and blocked storage never throws', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    savePlace(storage, { x: 12, y: 34 });
    expect(loadPlace(storage)).toEqual({ x: 12, y: 34 });
    savePlace(storage, null);
    expect(loadPlace(storage)).toBeNull();
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(loadPlace(blocked)).toBeNull();
    expect(() => savePlace(blocked, { x: 1, y: 2 })).not.toThrow();
    map.set('pagosya_yapi_pill', 'not json');
    expect(loadPlace(storage)).toBeNull();
  });
});

describe('the star', () => {
  it('turns while YAPI changes something, pulses with reduced motion, rests otherwise', () => {
    expect(spinState({ building: true, followingOwnRequest: false, reducedMotion: false })).toBe('spin');
    expect(spinState({ building: false, followingOwnRequest: true, reducedMotion: false })).toBe('spin');
    expect(spinState({ building: true, followingOwnRequest: false, reducedMotion: true })).toBe('pulse');
    expect(spinState({ building: false, followingOwnRequest: false, reducedMotion: false })).toBe('idle');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx vitest run src/source-yapi-pill.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```ts
/** YAPI in design mode (spec 2026-10-22 v2 §2, §5): where the pill sits and whether its star turns. */
export type PillPlace = { x: number; y: number } | null;
export type Box = { width: number; height: number };
const KEY = 'pagosya_yapi_pill';
const EDGE = 8;
const BOTTOM = 24;
const PHONE = 600;
const STEP = 10;

export function loadPlace(storage: Pick<Storage, 'getItem'> | null): PillPlace {
  try {
    const raw = storage?.getItem(KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}

export function savePlace(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, place: PillPlace) {
  try { if (place) storage?.setItem(KEY, JSON.stringify(place)); else storage?.removeItem(KEY); } catch { /* private window: kept until reload */ }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function placePill(place: PillPlace, pill: Box, viewport: Box) {
  if (viewport.width <= PHONE) return { left: 0, top: viewport.height - pill.height, docked: true };
  const x = place?.x ?? (viewport.width - pill.width) / 2;
  const y = place?.y ?? viewport.height - pill.height - BOTTOM;
  return { left: Math.round(clamp(x, EDGE, viewport.width - pill.width - EDGE)), top: Math.round(clamp(y, EDGE, viewport.height - pill.height - EDGE)), docked: false };
}

export function nudge(place: PillPlace, key: string, pill: Box, viewport: Box): PillPlace {
  const move: Record<string, [number, number]> = { ArrowUp: [0, -STEP], ArrowDown: [0, STEP], ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0] };
  if (!move[key]) return place;
  const at = placePill(place, pill, viewport);
  return { x: at.left + move[key][0], y: at.top + move[key][1] };
}

export function spinState(input: { building: boolean; followingOwnRequest: boolean; reducedMotion: boolean }): 'spin' | 'pulse' | 'idle' {
  if (!input.building && !input.followingOwnRequest) return 'idle';
  return input.reducedMotion ? 'pulse' : 'spin';
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-yapi-pill.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-yapi-pill.ts apps/merchant-studio/src/source-yapi-pill.test.ts
git commit -m "feat(studio): the YAPI pill's place and its spinning star"
```

---

### Task 3: The tools bar fades when idle

**Files:**
- Create: `apps/merchant-studio/src/source-toolbar-fade.ts`
- Test: `apps/merchant-studio/src/source-toolbar-fade.test.ts`

**Interfaces:**
- Produces: `function fadeWhenIdle(bar: HTMLElement, opts?: { delay?: number; doc?: Document }): () => void` — `is-idle` after `delay` (3000) ms without pointer on the bar, focus inside it or a key; removed on any of those; returns a disposer.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fadeWhenIdle } from './source-toolbar-fade';

afterEach(() => vi.useRealTimers());
describe('tools bar fade', () => {
  it('fades after 3 s idle and comes back on pointer, focus or a key', () => {
    vi.useFakeTimers();
    const bar = document.createElement('div'); bar.innerHTML = '<button>Código</button>'; document.body.append(bar);
    const stop = fadeWhenIdle(bar);
    vi.advanceTimersByTime(2999); expect(bar.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(1); expect(bar.classList.contains('is-idle')).toBe(true);
    bar.dispatchEvent(new Event('pointerenter')); expect(bar.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(3000); expect(bar.classList.contains('is-idle')).toBe(true);
    bar.querySelector('button')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); expect(bar.classList.contains('is-idle')).toBe(false);
    vi.advanceTimersByTime(3000);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); expect(bar.classList.contains('is-idle')).toBe(false);
    stop(); vi.advanceTimersByTime(5000); expect(bar.classList.contains('is-idle')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx vitest run src/source-toolbar-fade.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```ts
/** YAPI in design mode (spec 2026-10-22 v2 §6): the tools bar steps back while the merchant looks at the store. */
export function fadeWhenIdle(bar: HTMLElement, opts: { delay?: number; doc?: Document } = {}): () => void {
  const doc = opts.doc ?? bar.ownerDocument;
  const delay = opts.delay ?? 3000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => { bar.classList.remove('is-idle'); clearTimeout(timer); timer = setTimeout(() => bar.classList.add('is-idle'), delay); };
  const events: Array<[EventTarget, string]> = [[bar, 'pointerenter'], [bar, 'pointermove'], [bar, 'focusin'], [doc, 'keydown']];
  for (const [target, name] of events) target.addEventListener(name, wake);
  wake();
  return () => { clearTimeout(timer); bar.classList.remove('is-idle'); for (const [target, name] of events) target.removeEventListener(name, wake); };
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-toolbar-fade.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-toolbar-fade.ts apps/merchant-studio/src/source-toolbar-fade.test.ts
git commit -m "feat(studio): the design tools bar fades when idle"
```

---

### Task 4: The pill, the exit and the history sheet (markup)

**Files:**
- Create: `apps/merchant-studio/src/source-yapi-pill-view.ts`
- Test: `apps/merchant-studio/src/source-yapi-pill-view.test.ts`

**Interfaces:**
- Consumes: `planCardOf` (`source-plan-card.ts`), `suggestionCards` (`source-suggestions.ts`).
- Produces:
  - `renderPill(o: { busy: boolean; spin: 'spin' | 'pulse' | 'idle'; selectionLabel?: string; attachments: string; menuOpen: boolean; logo: string }): string` — `form[data-composer][data-yapi-pill].yapi-pill` with `textarea#agent-command`, `[data-yapi-plus]`, a menu with `[data-action="open-upload"]` and `[data-composer-action="create-product"]`, `[data-yapi-history-open]`, submit «Enviar ↗», star `[data-yapi-star]` with `is-spin|is-pulse`, hidden `input[data-image-input]`.
  - `needsAnswer(message: { id: string; role: string; metadata?: Record<string, unknown> | null }, currentRevision: number): boolean`
  - `renderExit(): string`; `renderHistory(open: boolean, inner: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { needsAnswer, renderExit, renderHistory, renderPill } from './source-yapi-pill-view';

describe('pill markup', () => {
  it('is the composer the Studio already binds, with the plus menu, history and the spinning star', () => {
    const html = renderPill({ busy: false, spin: 'spin', attachments: '', menuOpen: true, logo: '/logo.png', selectionLabel: 'Sección de marcas' });
    expect(html).toContain('data-composer');
    expect(html).toContain('id="agent-command"');
    expect(html).toContain('placeholder="¿Qué quieres crear o mejorar?"');
    expect(html).toContain('data-action="open-upload"');
    expect(html).toContain('data-composer-action="create-product"');
    expect(html).toContain('data-yapi-history-open');
    expect(html).toContain('Enviar');
    expect(html).toContain('is-spin');
    expect(html).toContain('Sobre: Sección de marcas');
    expect(html).not.toMatch(/Modelo|navegará|Rediseñar sitio|Mejorar el móvil/);
  });
  it('escapes the selection label and disables while busy', () => {
    const html = renderPill({ busy: true, spin: 'idle', attachments: '', menuOpen: false, logo: '/l.png', selectionLabel: '<b>x</b>' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
  it('exit and history', () => {
    expect(renderExit()).toContain('aria-label="Salir del diseño"');
    expect(renderHistory(false, '<p>hola</p>')).toMatch(/hidden/);
    expect(renderHistory(true, '<p>hola</p>')).toContain('<p>hola</p>');
  });
});

describe('which YAPI messages need an answer', () => {
  const m = (metadata: Record<string, unknown>) => ({ id: 'x', role: 'ASSISTANT', metadata });
  it('cards, questions and kept requests stay; plain replies do not', () => {
    expect(needsAnswer(m({ plan: { revision: 2, card: ['a'] }, planKind: 'new' }), 2)).toBe(true);
    expect(needsAnswer(m({ plan: { revision: 1, card: ['a'] }, planKind: 'new' }), 2)).toBe(false);
    expect(needsAnswer(m({ clarification: { options: [{ label: 'Sí', value: 'sí' }] } }), 2)).toBe(true);
    expect(needsAnswer(m({ failed: true, pendingRequest: { instruction: 'x' } }), 2)).toBe(true);
    expect(needsAnswer(m({ suggestions: [{ id: 's', title: 'T', instruction: 'i', kind: 'design' }] }), 2)).toBe(true);
    expect(needsAnswer(m({ styleProposal: { generationId: 'g' } }), 2)).toBe(true);
    expect(needsAnswer(m({ sourceRevision: 3 }), 2)).toBe(false);
    expect(needsAnswer({ id: 'u', role: 'USER', metadata: {} }, 2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx vitest run src/source-yapi-pill-view.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```ts
import { planCardOf } from './source-plan-card';
import { suggestionCards } from './source-suggestions';

/** YAPI in design mode (spec 2026-10-22 v2): the pill, the exit and the conversation sheet. */
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderPill(o: { busy: boolean; spin: 'spin' | 'pulse' | 'idle'; selectionLabel?: string; attachments: string; menuOpen: boolean; logo: string }): string {
  const off = o.busy ? ' disabled' : '';
  return `<form class="yapi-pill" data-composer data-yapi-pill aria-label="Habla con YAPI">
    ${o.attachments ? `<div class="yapi-pill__files">${o.attachments}</div>` : ''}
    <div class="yapi-pill__row">
      <img class="yapi-pill__star ${o.spin === 'spin' ? 'is-spin' : o.spin === 'pulse' ? 'is-pulse' : ''}" data-yapi-star tabindex="0" src="${esc(o.logo)}" alt="Mover a YAPI" width="32" height="32" draggable="false" title="Arrastra para mover · doble clic para volver al centro">
      ${o.selectionLabel ? `<span class="yapi-pill__chip">Sobre: ${esc(o.selectionLabel)}</span>` : ''}
      <label for="agent-command" class="sr-only">Indicación para YAPI</label>
      <textarea id="agent-command" name="command" rows="1" maxlength="12000" placeholder="¿Qué quieres crear o mejorar?"${off}></textarea>
      <div class="yapi-pill__plus">
        <button type="button" class="yapi-pill__icon" data-yapi-plus aria-expanded="${o.menuOpen}" aria-label="Más opciones"${off}>＋</button>
        <div class="yapi-pill__menu" role="menu" ${o.menuOpen ? '' : 'hidden'}>
          <button type="button" role="menuitem" data-action="open-upload">Agregar fotos</button>
          <button type="button" role="menuitem" data-composer-action="create-product">Crear producto</button>
        </div>
      </div>
      <button type="button" class="yapi-pill__icon" data-yapi-history-open aria-label="Ver la conversación">☰</button>
      <button type="submit" class="yapi-pill__send"${off}>Enviar ↗</button>
    </div>
    <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,.mp4" multiple data-image-input aria-label="Seleccionar hasta 24 imágenes o videos MP4">
  </form>`;
}

export function needsAnswer(message: { id: string; role: string; metadata?: Record<string, unknown> | null }, currentRevision: number): boolean {
  if (message.role !== 'ASSISTANT') return false;
  const meta = message.metadata ?? {};
  const card = planCardOf(message, currentRevision);
  if (card) return !card.outdated;
  if (meta.plan) return false;
  const clarification = meta.clarification as { options?: unknown[] } | undefined;
  return Boolean(clarification?.options?.length || (meta.failed && meta.pendingRequest) || suggestionCards(meta).length || meta.styleProposal || meta.startChoices || Array.isArray(meta.templateChoices));
}

export const renderExit = () => '<button type="button" class="yapi-exit" data-yapi-exit aria-label="Salir del diseño">×</button>';

export function renderHistory(open: boolean, inner: string): string {
  return `<section class="yapi-history" role="dialog" aria-label="Conversación con YAPI" ${open ? '' : 'hidden'}>
    <header><strong>Conversación</strong><button type="button" data-yapi-history-close aria-label="Cerrar la conversación">×</button></header>
    <div class="yapi-history__list">${inner}</div>
  </section>`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-yapi-pill-view.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-yapi-pill-view.ts apps/merchant-studio/src/source-yapi-pill-view.test.ts
git commit -m "feat(studio): the YAPI pill, exit and conversation sheet markup"
```

---

### Task 5: The narrator becomes the bubble that follows the pill

**Files:**
- Modify: `apps/merchant-studio/src/source-narrator.ts`, `apps/merchant-studio/src/source-narrator.css`
- Test: `apps/merchant-studio/src/source-narrator.test.ts` (append)

**Interfaces:**
- Produces on `Narrator`: `anchor(rect: { left: number; top: number; width: number } | null): void` — bubble mode: just above `rect` (12px gap, same left, `min(rect.width, 440)` wide), its own pill hidden, header drag off; `null` returns to its saved place. `spinning(state: 'spin' | 'pulse' | 'idle'): void` — `is-spin` / `is-pulse` on its star. Store news (`notice`) uses the same anchored place.

- [ ] **Step 1: Write the failing test** (append to `source-narrator.test.ts`, reusing its jsdom setup and `mountNarrator` import)

```ts
it('as the pill\'s bubble it sits just above the pill and its star follows the build', () => {
  const narrator = mountNarrator(document, { reducedMotion: () => true });
  narrator.anchor({ left: 200, top: 700, width: 560 });
  narrator.open('Hazme una tienda');
  const el = narrator.element;
  expect(el.classList.contains('yapi-narrator--bubble')).toBe(true);
  expect(el.style.left).toBe('200px');
  expect(el.style.width).toBe('440px');
  expect(parseFloat(el.style.top) + el.offsetHeight).toBeLessThanOrEqual(688);
  narrator.spinning('spin');
  expect(el.querySelector('[data-narrator-logo]')!.classList.contains('is-spin')).toBe(true);
  narrator.spinning('idle');
  expect(el.querySelector('[data-narrator-logo]')!.classList.contains('is-spin')).toBe(false);
  narrator.notice('Por reponer', 'Protein Pulver Vegano está agotado.');
  expect(el.style.left).toBe('200px');
  narrator.anchor(null);
  expect(el.classList.contains('yapi-narrator--bubble')).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx vitest run src/source-narrator.test.ts`
Expected: FAIL — `narrator.anchor is not a function`

- [ ] **Step 3: Implement**

In `mountNarrator` add `let anchored: { left: number; top: number; width: number } | null = null;` and:

```ts
  function placeAnchored() {
    if (!anchored) return;
    element.style.width = `${Math.min(anchored.width, 440)}px`;
    element.style.left = `${anchored.left}px`;
    element.style.top = `${Math.max(EDGE, anchored.top - 12 - element.offsetHeight)}px`;
  }
  function anchor(rect: { left: number; top: number; width: number } | null) {
    anchored = rect;
    element.classList.toggle('yapi-narrator--bubble', Boolean(rect));
    if (rect) { pill.hidden = true; placeAnchored(); } else { element.style.width = ''; placeSaved(); }
  }
  function spinning(state: 'spin' | 'pulse' | 'idle') {
    const mark = element.querySelector('[data-narrator-logo]');
    mark?.classList.toggle('is-spin', state === 'spin');
    mark?.classList.toggle('is-pulse', state === 'pulse');
  }
```

Wherever the narrator positions itself (`placeSaved()` calls after showing text, `open`, `show`, `notice`, and the window `resize` handler), call `placeAnchored()` instead when `anchored` is set; the header `pointerdown` drag handler returns early when `anchored`; where the narrator would show its «YAPI · Resumen» pill, skip it when `anchored`. Add `anchor` and `spinning` to the `Narrator` type and the returned object.

Append to `source-narrator.css`:

```css
/* YAPI in design mode (spec 2026-10-22 v2 §3): the bubble above the pill; the star turns while YAPI works. */
.yapi-narrator--bubble { position: fixed; right: auto; bottom: auto; max-height: 40vh; border-radius: 18px; }
.yapi-narrator--bubble [data-narrator-drag] { cursor: default; }
[data-narrator-logo].is-spin, .yapi-pill__star.is-spin { animation: yapi-star-spin 1.6s linear infinite; }
[data-narrator-logo].is-pulse, .yapi-pill__star.is-pulse { animation: yapi-star-pulse 1.6s ease-in-out infinite; }
@keyframes yapi-star-spin { to { transform: rotate(360deg); } }
@keyframes yapi-star-pulse { 50% { opacity: .45; } }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-narrator.test.ts`
Expected: PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-narrator.test.ts
git commit -m "test(studio): the narrator as the bubble above the YAPI pill"
```

(`source-narrator.ts`/`.css` carry earlier uncommitted work — leave them uncommitted and ledger it.)

---

### Task 6: Design mode in the Studio

**Files:**
- Create: `apps/merchant-studio/src/source-yapi-pill.css`, `apps/merchant-studio/tests/yapi-pill.spec.ts`
- Modify: `apps/merchant-studio/src/source-studio.ts` (layout switch ~line 67; `chatMessage` ~line 870; `render` ~line 946; `bind` ~line 1150; narrator mount; boot ~line 497)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `const pillMode = embedded ? params.get('layout') !== 'classic' : params.get('layout') === 'pill';` and the parent message `{ type: 'pagosya:design-focus', open: boolean }`.

- [ ] **Step 1: Write the failing e2e test**

Copy into `tests/yapi-pill.spec.ts` the API-mocking setup of the test in `tests/merchant-studio.spec.ts` that signs in and opens a store with a saved design (it routes `**/api/v1/**` and fulfils `http://localhost:5175/**`). Make the mocked conversation contain one assistant message with `metadata.progress.steps[0].details = [{ label: 'Leyó components/home.tsx' }]`, and make `POST …/chat-jobs` answer a RUNNING job whose `progress.steps[0].details = [{ label: 'Voy a: poner una sección por marca' }, { label: 'Leyó components/store-data.tsx' }]`, then COMPLETED with a reply on the next poll. Then:

```ts
test('design mode: store full width, the pill, plain words, the spinning star', async ({ page }) => {
  await page.goto('/?embedded=1&store=s1&layout=pill');
  await expect(page.locator('.agent-panel')).toHaveCount(0);
  await expect(page.locator('[data-yapi-pill]')).toBeVisible();
  await expect(page.locator('.yapi-exit')).toHaveAttribute('aria-label', 'Salir del diseño');
  const canvas = await page.locator('.source-canvas').boundingBox();
  expect(canvas!.width).toBeGreaterThan(page.viewportSize()!.width * 0.95);
  await expect(page.getByText(/^Modelo$|¿Cómo se navegará tu sitio\?/)).toHaveCount(0);
  await page.locator('#agent-command').fill('Pon una sección por marca');
  await page.getByRole('button', { name: 'Enviar ↗' }).click();
  await expect(page.locator('.yapi-pill__star')).toHaveClass(/is-spin/);
  await expect(page.locator('.yapi-narrator')).toContainText('Estoy mirando cómo está hecha tu tienda');
  await expect(page.locator('body')).not.toContainText('Leyó');
  await expect(page.locator('.yapi-pill__star')).not.toHaveClass(/is-spin/, { timeout: 10_000 });
});

test('the pill moves and stays where it was left', async ({ page }) => {
  await page.goto('/?embedded=1&store=s1&layout=pill');
  const before = await page.locator('[data-yapi-pill]').boundingBox();
  await page.locator('[data-yapi-star]').hover();
  await page.mouse.down(); await page.mouse.move(before!.x + 60, before!.y - 200, { steps: 5 }); await page.mouse.up();
  const after = await page.locator('[data-yapi-pill]').boundingBox();
  expect(after!.y).toBeLessThan(before!.y - 150);
  await page.reload();
  const reloaded = await page.locator('[data-yapi-pill]').boundingBox();
  expect(Math.abs(reloaded!.y - after!.y)).toBeLessThan(2);
});

test('Historial shows the conversation without the file log', async ({ page }) => {
  await page.goto('/?embedded=1&store=s1&layout=pill');
  await page.locator('[data-yapi-history-open]').click();
  await expect(page.locator('.yapi-history')).toBeVisible();
  await expect(page.locator('.yapi-history')).not.toContainText('Leyó');
  await page.keyboard.press('Escape');
  await expect(page.locator('.yapi-history')).toBeHidden();
});

test('classic layout stays available', async ({ page }) => {
  await page.goto('/?embedded=1&store=s1&layout=classic');
  await expect(page.locator('.agent-panel')).toBeVisible();
  await expect(page.locator('[data-yapi-pill]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx playwright test tests/yapi-pill.spec.ts`
Expected: FAIL — `[data-yapi-pill]` not found

- [ ] **Step 3: Implement in `source-studio.ts`**

1. Next to `embedded` (~line 67):

```ts
  // YAPI in design mode (spec 2026-10-22 v2): the dashboard's design mode shows the store full screen and YAPI as a pill.
  const pillMode = embedded ? params.get('layout') !== 'classic' : params.get('layout') === 'pill';
  const safeStorage = () => { try { return window.localStorage; } catch { return null; } };
  let historyOpen = false, plusOpen = false, pillPlace = loadPlace(safeStorage()), followingOwnRequest = false, stopFade: (() => void) | undefined;
```

2. `chatMessage`: the `renderBuildProgress(...)` line becomes `${!user && !pillMode ? renderBuildProgress(metadata.progress, false, metadata.sourceRevision ? 'saved' : 'reply') : ''}`.

3. `render()`: extract the classic branch's preview inner markup (the `source-canvas-notice` div through the preview frame / photo preview, before `<footer class="canvas-status">`) into `function canvasInner(): string`, and everything from `const pageMenu = …` to the end of `render` into `function afterRender()`; the classic branch calls both and is otherwise unchanged. At the top of `render()`:

```ts
    if (pillMode) {
      const latest = [...messages].reverse().find(m => m.role === 'ASSISTANT');
      const waiting = latest && needsAnswer(latest, state.revision) ? chatMessage(latest) : '';
      const spin = spinState({ building: building(), followingOwnRequest, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
      app.innerHTML = `<div class="studio-shell source-mode source-embedded is-yapi-pill">
        ${renderExit()}
        <div class="yapi-tools" data-yapi-tools>${storeTools(locked)}</div>
        <main class="canvas-panel connected-canvas source-canvas" aria-label="Sitio a medida">${canvasInner()}</main>
        ${waiting || error ? `<div class="yapi-cards" data-yapi-cards>${waiting}${error ? `<p class="auth-error" role="alert">${escape(merchantSafeText(error))}</p>` : ''}</div>` : ''}
        ${renderHistory(historyOpen, messages.map(chatMessage).join(''))}
        <div data-selection-host hidden>${selectionMarkup()}</div>
        ${renderPill({ busy: locked || historical() || !storeId, spin, selectionLabel: selection.get()?.label, attachments: productPhoto ? '' : attachmentBatch(), menuOpen: plusOpen, logo: `${import.meta.env.BASE_URL}logo-mark.png` })}
      </div>${visualEditing && version ? '<div data-source-direct-edit></div>' : ''}${bocetoOpen && version && mode === 'preview' ? '<div data-source-boceto></div>' : ''}${toast ? `<div class="toast" role="status">${escape(toast)}</div>` : ''}`;
      afterRender();
      placeYapi(spin);
      return;
    }
```

(If `selection.get()` has no `label`, use the section label the selection editor already shows — `selectionMarkup()` reads it; reuse that same expression.)

4. Add:

```ts
  /** The pill, the cards above it and YAPI's bubble, placed together after every render and resize. */
  function placeYapi(spin: 'spin' | 'pulse' | 'idle') {
    const box = app.querySelector<HTMLElement>('[data-yapi-pill]');
    if (!box) return;
    const at = placePill(pillPlace, { width: box.offsetWidth, height: box.offsetHeight }, { width: innerWidth, height: innerHeight });
    Object.assign(box.style, at.docked ? { left: '0px', top: `${at.top}px`, width: '100%' } : { left: `${at.left}px`, top: `${at.top}px`, width: '' });
    const cards = app.querySelector<HTMLElement>('[data-yapi-cards]');
    let top = at.top;
    if (cards) { cards.style.left = `${at.left + box.offsetWidth / 2}px`; cards.style.top = `${Math.max(8, at.top - 12 - cards.offsetHeight)}px`; top = parseFloat(cards.style.top); }
    narrator.anchor({ left: at.left, top, width: box.offsetWidth });
    narrator.spinning(spin);
    stopFade?.();
    const tools = app.querySelector<HTMLElement>('[data-yapi-tools]');
    stopFade = tools ? fadeWhenIdle(tools) : undefined;
  }
```

and a `resize` listener (once) that calls `placeYapi(...)` when `pillMode`.

5. `bind()` in pill mode:

```ts
    if (pillMode) {
      const star = app.querySelector<HTMLElement>('[data-yapi-star]');
      const box = app.querySelector<HTMLElement>('[data-yapi-pill]');
      let drag: { id: number; dx: number; dy: number } | null = null;
      star?.addEventListener('pointerdown', event => { if (!box) return; const r = box.getBoundingClientRect(); drag = { id: event.pointerId, dx: event.clientX - r.left, dy: event.clientY - r.top }; star.setPointerCapture(event.pointerId); });
      star?.addEventListener('pointermove', event => { if (drag?.id !== event.pointerId || !box) return; pillPlace = { x: event.clientX - drag.dx, y: event.clientY - drag.dy }; placeYapi(spinState({ building: building(), followingOwnRequest, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })); });
      star?.addEventListener('pointerup', event => { if (drag?.id !== event.pointerId) return; drag = null; savePlace(safeStorage(), pillPlace); });
      star?.addEventListener('dblclick', () => { pillPlace = null; savePlace(safeStorage(), null); render(); });
      star?.addEventListener('keydown', event => { if (!box) return; const next = nudge(pillPlace, event.key, { width: box.offsetWidth, height: box.offsetHeight }, { width: innerWidth, height: innerHeight }); if (next !== pillPlace) { event.preventDefault(); pillPlace = next; savePlace(safeStorage(), pillPlace); render(); } });
      app.querySelector('[data-yapi-plus]')?.addEventListener('click', () => { plusOpen = !plusOpen; render(); });
      app.querySelector('[data-yapi-history-open]')?.addEventListener('click', () => { historyOpen = true; render(); });
      app.querySelector('[data-yapi-history-close]')?.addEventListener('click', () => { historyOpen = false; render(); });
      app.querySelector('[data-yapi-exit]')?.addEventListener('click', () => { notifyParent({ type: 'pagosya:design-focus', open: false }); notifyParent({ type: 'pagosya:workspace', view: 'stores' }); });
      app.querySelector<HTMLTextAreaElement>('#agent-command')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); app.querySelector<HTMLFormElement>('[data-yapi-pill]')?.requestSubmit(); } });
    }
```

and, once at setup, a `document` `keydown` listener: `Escape` closes history (`historyOpen = false`) and the plus menu, then `render()`; `/` outside an input/textarea focuses `#agent-command`.

6. `followingOwnRequest`: set `true` at the start of `followRunningJob`'s action and in `followBackgroundJob` before waiting; `false` in their `finally`; call `render()` after changing it.

7. Narrator text in pill mode: where the Studio calls `narrator.progress(buildProgress)` / builds narration from progress, pass `narrationFromProgress(progress, pillMode)`.

8. Boot: after `load()`, `if (pillMode && embedded) notifyParent({ type: 'pagosya:design-focus', open: true });`

9. `import './source-yapi-pill.css';` plus imports of `loadPlace, savePlace, placePill, nudge, spinState`, `fadeWhenIdle`, `renderPill, renderExit, renderHistory, needsAnswer`.

`source-yapi-pill.css`:

```css
/* YAPI in design mode (spec 2026-10-22 v2). Yellow = YAPI; glass only on floating layers. */
.is-yapi-pill { position: fixed; inset: 0; display: block; }
.is-yapi-pill .source-canvas { position: absolute; inset: 0; margin: 0; border: 0; border-radius: 0; }
.is-yapi-pill .source-canvas .preview-frame, .is-yapi-pill .source-canvas iframe { width: 100%; height: 100%; border: 0; border-radius: 0; }
.yapi-exit { position: fixed; top: 16px; left: 16px; z-index: 30; width: 40px; height: 40px; border: 1px solid rgb(255 255 255 / .5); border-radius: 50%; background: rgb(24 24 27 / .35); color: #fff; font-size: 22px; line-height: 1; opacity: .6; backdrop-filter: blur(12px); cursor: pointer; transition: opacity .2s ease; }
.yapi-exit:hover, .yapi-exit:focus-visible { opacity: 1; }
.yapi-tools { position: fixed; top: 16px; left: 50%; z-index: 25; transform: translateX(-50%); padding: 6px; border: 1px solid rgb(255 255 255 / .6); border-radius: 999px; background: rgb(255 255 255 / .72); backdrop-filter: blur(16px); box-shadow: 0 8px 30px rgb(24 24 27 / .12); transition: opacity .3s ease; }
.yapi-tools.is-idle { opacity: .35; }
.yapi-tools .button--publish, .yapi-tools [id$="export"] { position: fixed; top: 16px; right: 16px; opacity: 1; }
.yapi-pill { position: fixed; z-index: 40; width: min(640px, calc(100vw - 32px)); padding: 8px 8px 8px 12px; border: 1px solid rgb(255 255 255 / .7); border-radius: 999px; background: linear-gradient(110deg, rgb(255 255 255 / .82), rgb(240 238 245 / .72)); backdrop-filter: blur(22px) saturate(1.2); box-shadow: 0 18px 50px rgb(24 24 27 / .18); }
.yapi-pill__row { display: flex; align-items: center; gap: 8px; }
.yapi-pill__star { flex: 0 0 auto; cursor: grab; touch-action: none; border-radius: 50%; }
.yapi-pill textarea { flex: 1; min-width: 0; height: 40px; padding: 10px 4px; border: 0; background: none; font: inherit; font-size: 16px; resize: none; outline: none; }
.yapi-pill__icon { width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgb(24 24 27 / .06); font-size: 18px; cursor: pointer; }
.yapi-pill__send { height: 44px; padding: 0 20px; border: 0; border-radius: 999px; background: #f3d34a; color: #18181b; font-weight: 650; cursor: pointer; }
.yapi-pill__chip { padding: 4px 10px; border-radius: 999px; background: rgb(24 24 27 / .08); font-size: 12.5px; white-space: nowrap; }
.yapi-pill__plus { position: relative; }
.yapi-pill__menu { position: absolute; bottom: calc(100% + 10px); right: 0; display: grid; min-width: 170px; padding: 6px; border-radius: 14px; background: #fff; box-shadow: 0 12px 40px rgb(24 24 27 / .18); }
.yapi-pill__menu button { padding: 9px 12px; border: 0; border-radius: 10px; background: none; text-align: left; font: inherit; cursor: pointer; }
.yapi-pill__menu button:hover { background: #f4f4f5; }
.yapi-pill__files { padding: 4px 4px 8px; }
.yapi-cards { position: fixed; z-index: 35; transform: translateX(-50%); width: min(560px, calc(100vw - 32px)); max-height: 46vh; overflow: auto; padding: 14px 16px; border-radius: 18px; background: rgb(255 255 255 / .86); backdrop-filter: blur(18px); box-shadow: 0 14px 40px rgb(24 24 27 / .16); }
.yapi-history { position: fixed; z-index: 45; right: 16px; bottom: 100px; width: min(440px, calc(100vw - 32px)); max-height: 70vh; display: flex; flex-direction: column; border-radius: 18px; background: rgb(255 255 255 / .9); backdrop-filter: blur(18px); box-shadow: 0 18px 50px rgb(24 24 27 / .2); }
.yapi-history[hidden] { display: none; }
.yapi-history header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgb(24 24 27 / .08); }
.yapi-history__list { overflow: auto; padding: 12px 16px; }
@media (max-width: 600px) { .yapi-pill { border-radius: 22px 22px 0 0; } .yapi-tools { max-width: calc(100vw - 80px); overflow-x: auto; } }
@media (prefers-reduced-motion: reduce) { .yapi-tools, .yapi-exit { transition: none; } }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx playwright test tests/yapi-pill.spec.ts tests/merchant-studio.spec.ts && npx vitest run src && npx tsc --noEmit -p .`
Expected: yapi-pill 4/4 PASS; merchant-studio unchanged; vitest only the known `source-business-workspace` failure; tsc clean

- [ ] **Step 5: Rebuild the Studio and commit**

Run: `cd apps/merchant-dashboard && pnpm run build:studio`

```bash
git add apps/merchant-studio/src/source-yapi-pill.css apps/merchant-studio/tests/yapi-pill.spec.ts
git commit -m "feat(studio): design mode — the store full screen and YAPI as a movable pill (wiring in source-studio.ts, uncommitted with earlier work)"
```

---

### Task 7: The dashboard's full-screen design mode

**Files:**
- Create: `apps/merchant-dashboard/src/design-focus.mjs`, `apps/merchant-dashboard/src/design-focus.test.mjs`
- Modify: `apps/merchant-dashboard/src/dashboard.js` (frame message handler beside `template-focus` ~line 495; `syncMerchantStoreWorkspace` ~line 507), `apps/merchant-dashboard/src/dashboard.css`, `apps/merchant-dashboard/server.mjs` (static list), `docs/superpowers/specs/2026-10-22-yapi-floating-window-design.md`

**Interfaces:**
- Produces: `export function designFocus(event, frameId)` → `true | false | null` (null = not a design-focus message from the Studio frame).

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { designFocus } from "./design-focus.mjs";

test("only the Studio frame's design-focus message switches full screen", () => {
  assert.equal(designFocus({ data: { type: "pagosya:design-focus", open: true } }, "merchantStudioFrame"), true);
  assert.equal(designFocus({ data: { type: "pagosya:design-focus", open: false } }, "merchantStudioFrame"), false);
  assert.equal(designFocus({ data: { type: "pagosya:design-focus", open: true } }, "storeTemplatesFrame"), null);
  assert.equal(designFocus({ data: { type: "pagosya:workspace" } }, "merchantStudioFrame"), null);
  assert.equal(designFocus({ data: null }, "merchantStudioFrame"), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/design-focus.test.mjs`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement**

```js
/** YAPI in design mode (spec 2026-10-22 v2 §6): the Studio asks for the whole screen while the merchant designs. */
export function designFocus(event, frameId) {
  if (frameId !== "merchantStudioFrame" || event?.data?.type !== "pagosya:design-focus") return null;
  return Boolean(event.data.open);
}
```

`dashboard.js`: import it; in the frame message handler, beside the `template-focus` line:

```js
    const focus = designFocus(event, frame.id);
    if (focus !== null) { document.body.classList.toggle("design-focus", focus); return; }
```

and in `syncMerchantStoreWorkspace`: `if (view !== "workspace") document.body.classList.remove("design-focus");`

`server.mjs`: add `"/src/design-focus.mjs"` to the list of served `src` files.

`dashboard.css`, beside the `template-focus` rules:

```css
/* YAPI in design mode (spec 2026-10-22 v2 §6): the Studio covers the dashboard; its × is the way out. */
html:has(body.design-focus) { overflow: hidden; }
body.design-focus #merchantStudioFrame { position: fixed; inset: 0; width: 100vw; height: 100dvh !important; z-index: 4020; border: 0; border-radius: 0; }
body.design-focus .ask-yapi, body.design-focus [data-ask-yapi] { display: none; }
```

Spec: append «Amendment (plan, 2026-10-22): the layout switch is the URL — pill mode in the embedded Studio unless `layout=classic`; the standalone Studio keeps today's layout unless `layout=pill`.»

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/design-focus.mjs apps/merchant-dashboard/src/design-focus.test.mjs apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/server.mjs docs/superpowers/specs/2026-10-22-yapi-floating-window-design.md
git commit -m "feat(dashboard): full-screen design mode for the YAPI pill"
```

- [ ] **Step 6: Live check** — dashboard → Tienda › Diseño on goodProtein: the store fills the screen, the pill sits bottom centre, × returns to the dashboard; send «Ponlo más bonito» (ChatGPT plan quota): the bubble says what YAPI does in plain words, the star spins until done, the plan card appears above the pill.
