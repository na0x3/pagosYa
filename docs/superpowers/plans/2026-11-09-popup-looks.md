# Popup looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store's signup popup wears one of six hand-built looks (Clásica, Portada, Cartel, Postal, Revista, Etiqueta) with a
short email form; YAPI and the Studio switch looks instantly; the AI popup designer is removed.

**Architecture:** The six looks are HTML + CSS tables inside `packages/storefront-kit/kit/retention.js`, drawn through the slot
machinery built 2026-11-08 (`pya-photo`, `pya-title`, `pya-text`, `pya-form`, `pya-code`). A store keeps only `settings.popupLook` (an
id), `popupLookPrevious` and `popupPhoto`; the API resolves a look for every store (saved, else a stable pick from its slug) and sends it
with the public popup settings. A new `PopupLookService` replaces `PopupKitService`.

**Tech Stack:** NestJS + Prisma (apps/api), plain JS kit (retention.js), Playwright render harness (`popup-render.ts`), Vite Studio.

**Spec:** `docs/superpowers/specs/2026-11-09-popup-looks-design.md`

## Global Constraints

- Look ids exactly: `clasica`, `portada`, `cartel`, `postal`, `revista`, `etiqueta`; names «Clásica», «Portada», «Cartel», «Postal»,
  «Revista», «Etiqueta».
- Short form in every popup: email + submit on one row (stacked under 480px), consent under it; no name, phone or interests fields.
- Type: titles ≥ 34px desktop, text 16px, kicker 12px; nothing under 12px; no own words on the photo; kicker and stamp text in
  `--signup-ink` (never the accent, which may be light).
- Storage: `StoreRetention.settings.popupLook | popupLookPrevious | popupPhoto` (JSON, no migration); never write `DEFAULT_RETENTION`
  defaults into a row (the raw-merge rule from the 2026-11-09 review).
- Ruling (deviation from spec §2 «lookFor(slug)» in retention.js): the API resolves the look (`pickPopupLook(slug)`) for public
  settings and the Studio preview; retention.js has no hash of its own, so a store's look never changes when the backfill writes it.
- Dev rules (owner): one spec file per jest run; Edit tool, never `sed -i` on apps/api files; saving apps/api restarts `nest --watch`;
  `pnpm dev:doctor --backup` before any write to the dev DB; commit only when the owner asks.

## Review Focus

1. **Light store colours.** A pale accent must not make the kicker, stamp or title unreadable. Test: every look with a light palette
   passes the render rules (Task 2).
2. **Dark store colours.** Revista's inverted band and the form stay readable on a dark store. Test: dark palette (Task 2).
3. **Published (hosted) stores.** The email field and consent leave the popup (secure form); the button and secure note must still lay
   out. Test: hosted render (Task 2).
4. **Ajustes saves.** Saving the Studio form keeps `popupLook` / `popupPhoto` / previous when it does not send them, and records the
   previous look when it does. Test (Task 3).
5. **Unknown or stale look ids** (an old row, a chat typo): the built-in layout or a refusal naming the six looks, never a broken popup.
   Tests (Task 2, Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/store-popups/popup-looks.ts` (create) | ids, names, `pickPopupLook`, `nextPopupLook`, `readPopupLook`, `PopupLookSettings` |
| `packages/storefront-kit/kit/retention.js` (modify) | short form; `POPUP_LOOKS` table; draws `popupLook` + `popupPhoto`; drops `popupKit` |
| `apps/api/src/store-popups/popup-render.ts` (modify) | measures `look`, `nameField`, `photoSrc` |
| `apps/api/src/retention/retention.dto.ts`, `retention.service.ts`, `retention.controller.ts` (modify) | `popupLook` in Ajustes; kept keys; public settings resolve the look |
| `apps/api/src/store-popups/popup-look.service.ts` (create) | `designAfterBuild`, `setLook`, `setPhoto`, `undo`, `isFirstBuildStep` |
| `apps/api/src/store-popups/popup-kit*.ts`, `apps/api/scripts/design-popups.ts` (delete) | the AI designer |
| `source-store-edit.ts`, `source-chat.service.ts`, `source-chat-jobs.service.ts`, `store-popup.module.ts` (modify) | YAPI ops and wiring |
| `apps/merchant-studio/src/retention.ts` (modify) | «Estilo de la ventana» select |
| `apps/api/scripts/popup-looks-backfill.ts` (create) | one look for every store without one |

---

### Task 1: Look ids and picking (API)

**Files:** Create `apps/api/src/store-popups/popup-looks.ts`; Test `apps/api/src/store-popups/popup-looks.spec.ts`

**Interfaces:**
- Produces: `POPUP_LOOK_IDS`, `type PopupLookId`, `POPUP_LOOK_NAMES: Record<PopupLookId, string>`, `readPopupLook(value: unknown): PopupLookId | null`,
  `pickPopupLook(slug: string, avoid?: string): PopupLookId`, `nextPopupLook(current: string | null | undefined): PopupLookId`,
  `type PopupLookSettings = { popupLook?: string; popupLookPrevious?: string; popupPhoto?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { nextPopupLook, pickPopupLook, POPUP_LOOK_IDS, POPUP_LOOK_NAMES, readPopupLook } from './popup-looks';

describe('popup looks', () => {
  it('reads ids and names, with or without accents and case', () => {
    expect(readPopupLook('postal')).toBe('postal');
    expect(readPopupLook('Clásica')).toBe('clasica');
    expect(readPopupLook(' REVISTA ')).toBe('revista');
    expect(readPopupLook('ruleta')).toBeNull();
    expect(readPopupLook(42)).toBeNull();
    expect(POPUP_LOOK_NAMES.etiqueta).toBe('Etiqueta');
  });
  it('picks a stable look per slug, spread over all six, never the one to avoid', () => {
    expect(pickPopupLook('miga-dorada')).toBe(pickPopupLook('miga-dorada'));
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) { const look = pickPopupLook(`tienda-${i}`); counts.set(look, (counts.get(look) ?? 0) + 1); }
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBeGreaterThan(60);
    const usual = pickPopupLook('w9ykv26r');
    expect(pickPopupLook('w9ykv26r', usual)).not.toBe(usual);
  });
  it('steps to the next look and wraps, from any start', () => {
    expect(nextPopupLook('clasica')).toBe('portada');
    expect(nextPopupLook('etiqueta')).toBe('clasica');
    expect(POPUP_LOOK_IDS).toContain(nextPopupLook(undefined));
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/store-popups/popup-looks.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
/** The six built popup looks (spec 2026-11-09-popup-looks). retention.js holds their HTML and CSS; a store keeps only the id. */
export const POPUP_LOOK_IDS = ['clasica', 'portada', 'cartel', 'postal', 'revista', 'etiqueta'] as const;
export type PopupLookId = (typeof POPUP_LOOK_IDS)[number];
export const POPUP_LOOK_NAMES: Record<PopupLookId, string> = { clasica: 'Clásica', portada: 'Portada', cartel: 'Cartel', postal: 'Postal', revista: 'Revista', etiqueta: 'Etiqueta' };
export type PopupLookSettings = { popupLook?: string; popupLookPrevious?: string; popupPhoto?: string };

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function readPopupLook(value: unknown): PopupLookId | null {
  if (typeof value !== 'string') return null;
  const id = fold(value);
  return (POPUP_LOOK_IDS as readonly string[]).includes(id) ? id as PopupLookId : null;
}
/** FNV-1a: the same slug always gets the same look, and slugs spread evenly over the six. */
function hash(text: string) { let h = 0x811c9dc5; for (const c of text) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; } return h; }
export function pickPopupLook(slug: string, avoid?: string): PopupLookId {
  const at = hash(slug) % POPUP_LOOK_IDS.length;
  return POPUP_LOOK_IDS[POPUP_LOOK_IDS[at] === avoid ? (at + 1) % POPUP_LOOK_IDS.length : at];
}
export function nextPopupLook(current: string | null | undefined): PopupLookId {
  const at = POPUP_LOOK_IDS.indexOf(readPopupLook(current) ?? 'etiqueta');
  return POPUP_LOOK_IDS[(at + 1) % POPUP_LOOK_IDS.length];
}
```

- [ ] **Step 4: Run** → PASS (3 tests).

---

### Task 2: retention.js draws the looks + short form

**Files:**
- Modify: `packages/storefront-kit/kit/retention.js` (`mountSignup`: style block, `formHtml`, `kit*`; `POPUP_LOOKS` before `mountSignup`)
- Modify: `apps/api/src/store-popups/popup-render.ts` (measures `look`, `nameField`, `photoSrc`)
- Test: `apps/api/src/store-popups/popup-render.spec.ts` (replace the `popupKit` cases)

**Interfaces:**
- Consumes: `POPUP_LOOK_IDS` (Task 1), `measurePopup`, `checkPopupRender`.
- Produces: retention.js reads `settings.popupLook` (id) and `settings.popupPhoto` (upload path); `PopupMeasure.look?: string | null`,
  `nameField?: boolean`, `photoSrc?: string | null`.

- [ ] **Step 1: Rewrite the render spec** — keep the first test (built-in phone photo) adding `expect(phone.nameField).toBe(false)`;
  delete every test that uses `KIT` (the AI kit); add:

```ts
import { POPUP_LOOK_IDS } from './popup-looks';
import { checkPopupRender } from './popup-render';
const LIGHT = { background: '#f6efe3', foreground: '#2a2118', accent: '#f4c2cc', accentForeground: '#2a2118' };
const DARK = { background: '#14110f', foreground: '#f3ece2', accent: '#c8a04a', accentForeground: '#14110f' };

describe('popup looks render', () => {
  for (const look of POPUP_LOOK_IDS) for (const [palette, colours] of [['light', LIGHT], ['dark', DARK]] as const) {
    it(`${look} on a ${palette} store is legible at desktop and phone width`, async () => {
      const measures = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: look }, look: colours, photo: PHOTO }))!;
      expect(measures.map(m => m.look)).toEqual([look, look]);
      expect(checkPopupRender(measures)).toEqual([]);
      expect(measures.every(m => m.nameField === false)).toBe(true);
    });
  }
  it('keeps the button and photo on a published (hosted) store', async () => {
    const [phone] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'portada' }, look: LIGHT, photo: PHOTO, hosted: true }, [{ width: 390, height: 844 }]))!;
    expect(phone.boxes.email).toBeNull();
    expect(phone.boxes.submit?.visible).toBe(true);
    expect(phone.boxes.photo?.visible).toBe(true);
  });
  it('uses the chosen upload photo, from the API base', async () => {
    const [desktop] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'clasica', popupPhoto: '/v1/uploads/abc.jpg' }, look: LIGHT, photo: PHOTO, apiBaseUrl: 'https://popup-check.invalid/v1' }, [{ width: 1280, height: 800 }]))!;
    expect(desktop.photoSrc).toBe('https://popup-check.invalid/v1/uploads/abc.jpg');
  });
  it('draws the built-in layout for an unknown look', async () => {
    const [desktop] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'ruleta' }, look: LIGHT, photo: PHOTO }, [{ width: 1280, height: 800 }]))!;
    expect(desktop.look).toBeNull();
    expect(desktop.boxes.submit?.visible).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/store-popups/popup-render.spec.ts` → FAIL (compile: `look`, `nameField`, `photoSrc`).

- [ ] **Step 3: Harness measures** — in `PopupMeasure` add `look?: string | null; nameField?: boolean; photoSrc?: string | null;` and in
  `measureInPage`'s return:

```ts
    look: dialog?.querySelector('[data-popup-look]')?.getAttribute('data-popup-look') ?? null,
    nameField: Boolean(dialog?.querySelector('input[name=name]')),
    photoSrc: photo?.getAttribute('src') ?? null,
```

- [ ] **Step 4: Short form** — in retention.js replace `formHtml` with:

```js
    const formHtml = `<form><div class="signup-row"><label class="signup-field">Tu correo<input type="email" name="email" autocomplete="email" maxlength="254" required></label><button type="submit" class="signup-submit">${escape(settings.signupButton)}</button></div>
              <label class="signup-consent"><input type="checkbox" name="consent" required>Quiero recibir novedades y promociones de esta tienda por correo. Puedo darme de baja cuando quiera.</label>
            </form><p role="status" aria-live="polite"></p>`;
```

  delete `const interests = …`, and add to the signup style string (after the `.signup-submit` rule):

```css
.pagosya-signup-copy .signup-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.pagosya-signup-copy .signup-row .signup-submit{justify-self:stretch}.signup-row .pagosya-secure-note{grid-column:1/-1}@media(max-width:480px){.pagosya-signup-copy .signup-row{grid-template-columns:1fr}}
```

- [ ] **Step 5: The looks table** — before `function mountSignup`:

```js
  // Spec 2026-11-09 popup looks: six built looks; a store keeps only the id (the API picks one for every store). Colours come from the
  // signup host (--signup-paper/-ink/-accent, from the store's own tokens); text never sits on the photo and never under 12px.
  const K = '[data-popup-kit] ';
  const LOOK_TYPE = `${K}pya-title{font:400 clamp(34px,4vw,46px)/1.05 var(--signup-heading);letter-spacing:-.02em;margin:12px 0 10px}${K}pya-text{font-size:16px;line-height:1.55;margin:0 0 22px}${K}.kick{display:block;font:600 12px/1.4 var(--signup-body);letter-spacing:.18em;text-transform:uppercase;color:var(--signup-ink)}${K}pya-code{font-size:13px;margin-top:12px}`;
  const LOOK_WORDS = '<span class="kick">{name}</span><pya-title></pya-title><pya-text></pya-text><pya-form></pya-form><pya-code></pya-code>';
  const POPUP_LOOKS = {
    clasica: { html: `<div class="lk lk-clasica"><pya-photo></pya-photo><div class="p">${LOOK_WORDS}</div></div>`,
      css: `${K}.lk-clasica{display:grid;grid-template-columns:1fr 1fr;min-height:540px}${K}.lk-clasica .p{padding:56px 48px 44px;background:var(--signup-paper)}@media(max-width:700px){${K}.lk-clasica{grid-template-columns:1fr;min-height:0}${K}.lk-clasica pya-photo{height:190px}${K}.lk-clasica .p{padding:24px}}` },
    portada: { html: `<div class="lk lk-portada"><pya-photo></pya-photo><div class="p">${LOOK_WORDS}</div></div>`,
      css: `${K}.lk-portada pya-photo{height:300px}${K}.lk-portada .p{padding:40px 72px 44px;text-align:center;background:var(--signup-paper)}${K}.lk-portada pya-title{font-family:var(--signup-body);font-weight:800;text-transform:uppercase;letter-spacing:-.03em}${K}.lk-portada pya-text{max-width:520px;margin-left:auto;margin-right:auto}${K}.lk-portada pya-form{max-width:560px;margin:0 auto;text-align:left}@media(max-width:700px){${K}.lk-portada pya-photo{height:200px}${K}.lk-portada .p{padding:24px}}` },
    cartel: { html: `<div class="lk lk-cartel"><pya-photo></pya-photo><div class="card">${LOOK_WORDS}</div></div>`,
      css: `${K}.lk-cartel{position:relative;min-height:600px;display:flex;align-items:center;justify-content:flex-end;padding:40px}${K}.lk-cartel>pya-photo{position:absolute;inset:0}${K}.lk-cartel .card{position:relative;width:440px;max-width:100%;background:var(--signup-paper);padding:36px;box-shadow:0 20px 60px #0004}@media(max-width:700px){${K}.lk-cartel{display:block;padding:0;min-height:0}${K}.lk-cartel>pya-photo{position:relative;height:200px}${K}.lk-cartel .card{width:auto;box-shadow:none;padding:24px}}` },
    postal: { html: `<div class="lk lk-postal"><div class="frame"><div class="ph"><pya-photo></pya-photo><span class="stamp" aria-hidden="true">{initial}</span></div><div class="p"><span class="kick">Carta de {name}</span><pya-title></pya-title><pya-text></pya-text><pya-form></pya-form><pya-code></pya-code></div></div></div>`,
      css: `${K}.lk-postal{padding:16px;background:var(--signup-paper)}${K}.lk-postal .frame{border:2px solid var(--signup-accent);display:grid;grid-template-columns:1fr 1.15fr;min-height:520px}${K}.lk-postal .ph{position:relative;padding:16px;border-right:1px dashed var(--signup-accent)}${K}.lk-postal .ph pya-photo{height:100%;min-height:300px}${K}.lk-postal .stamp{position:absolute;top:28px;right:28px;width:64px;height:64px;border:3px double var(--signup-accent);background:var(--signup-paper);display:grid;place-items:center;font:700 28px/1 var(--signup-heading);color:var(--signup-ink)}${K}.lk-postal .p{padding:40px 40px 32px}${K}.lk-postal pya-title{font-style:italic}@media(max-width:700px){${K}.lk-postal{padding:10px}${K}.lk-postal .frame{grid-template-columns:1fr;min-height:0}${K}.lk-postal .ph{border-right:0;border-bottom:1px dashed var(--signup-accent)}${K}.lk-postal .ph pya-photo{min-height:170px;height:170px}${K}.lk-postal .p{padding:22px}}` },
    revista: { html: `<div class="lk lk-revista"><div class="top"><div><span class="kick">{name}</span><pya-title></pya-title></div><pya-photo></pya-photo></div><div class="p"><pya-text></pya-text><pya-form></pya-form><pya-code></pya-code></div></div>`,
      css: `${K}.lk-revista .top{display:grid;grid-template-columns:1.3fr 1fr;gap:32px;align-items:end;padding:48px 56px 0;background:var(--signup-ink);color:var(--signup-paper)}${K}.lk-revista .top .kick{color:inherit}${K}.lk-revista .top pya-title{font-size:clamp(40px,5.5vw,64px);margin:12px 0 40px;color:inherit}${K}.lk-revista .top pya-photo{height:300px;border-radius:200px 200px 0 0}${K}.lk-revista .p{padding:32px 56px 40px;background:var(--signup-paper)}@media(max-width:700px){${K}.lk-revista .top{grid-template-columns:1fr;padding:28px 22px 0;gap:0}${K}.lk-revista .top pya-title{margin:10px 0 18px}${K}.lk-revista .top pya-photo{height:180px}${K}.lk-revista .p{padding:22px}}` },
    etiqueta: { html: `<div class="lk lk-etiqueta"><pya-photo></pya-photo>${LOOK_WORDS}</div>`,
      css: `${K}.lk-etiqueta{padding:52px 80px 44px;text-align:center;background:var(--signup-paper)}${K}.lk-etiqueta>pya-photo{width:220px;height:220px;min-height:0;border-radius:50%;margin:0 auto 22px;box-shadow:0 0 0 6px var(--signup-paper),0 0 0 8px var(--signup-accent)}${K}.lk-etiqueta pya-text{max-width:520px;margin-left:auto;margin-right:auto}${K}.lk-etiqueta pya-form{max-width:540px;margin:0 auto;text-align:left}@media(max-width:700px){${K}.lk-etiqueta{padding:28px 22px}${K}.lk-etiqueta>pya-photo{width:160px;height:160px}}` },
  };
```

- [ ] **Step 6: Draw a look instead of a kit** — in `mountSignup` replace the `kit`, `kitPhoto`, `kitImage` and `kitLayout` code with
  the block below (keep the single existing `monogram` const), and in the `kitStyle` text use `${LOOK_TYPE}${POPUP_LOOKS[lookId].css}`
  where it used `${kit.css}` (the base slot rules, the width rule and the reduced-motion rule stay):

```js
    const lookId = typeof settings.popupLook === 'string' && Object.hasOwn(POPUP_LOOKS, settings.popupLook) ? settings.popupLook : '';
    // The chosen photo is an upload path on the API (the Studio proxies the API under its own base); else the built-in photo.
    const uploadPhoto = value => /^\/v1\/uploads\//.test(String(value || '')) && config.apiBaseUrl ? `${String(config.apiBaseUrl).replace(/\/v1\/?$/, '')}${value}` : value;
    const lookImage = lookId ? safeImage(uploadPhoto(settings.popupPhoto), location.href) || image : '';
    const kitLayout = (() => {
      if (!lookId || !lookImage) return '';
      const template = document.createElement('template');
      template.innerHTML = POPUP_LOOKS[lookId].html.replaceAll('{name}', escape(name)).replaceAll('{initial}', escape(name.slice(0, 1).toUpperCase()));
      const fill = { photo: `<img src="${escape(lookImage)}" alt="${escape(name)}" referrerpolicy="no-referrer">`, title: `<h2 tabindex="-1">${escape(settings.signupTitle)}</h2>`,
        text: `<p class="signup-description">${escape(settings.signupBody)}</p>`, form: `<div class="pagosya-signup-copy pagosya-signup-copy--kit">${formHtml}</div>`,
        code: settings.popupHasCode ? '<p class="signup-code-note">Al suscribirte te llega tu código de bienvenida.</p>' : '' };
      for (const [slot, inner] of Object.entries(fill)) template.content.querySelectorAll(`pya-${slot}`).forEach(el => { el.innerHTML = inner; });
      const box = document.createElement('div'); box.className = 'pagosya-signup-kit'; box.setAttribute('data-popup-kit', ''); box.setAttribute('data-popup-look', lookId); box.append(template.content);
      return box.outerHTML;
    })();
```

- [ ] **Step 7: Run** the render spec → PASS (1 + 12 + 3 = 16 tests). Then `cd packages/storefront-kit && node kit/check-runtimes.mjs` → parsed cleanly.

---

### Task 3: Retention settings carry the look

**Files:** Modify `apps/api/src/retention/retention.dto.ts`, `retention.service.ts`, `retention.controller.ts`; Test `apps/api/src/retention/retention-popup.spec.ts`
(replace the «store popup design (spec 2026-11-08)» block)

**Interfaces:**
- Consumes: `POPUP_LOOK_IDS`, `pickPopupLook`, `readPopupLook`, `PopupLookSettings` (Task 1).
- Produces: `publicRetentionSettings(s, slug?)` adds `popupLook` (saved, else `pickPopupLook(slug)`) and `popupPhoto`; Ajustes accepts `popupLook`.

- [ ] **Step 1: Tests** — replace the 2026-11-08 block with:

```ts
describe('popup looks (spec 2026-11-09)', () => {
  it('keeps the look, photo and previous look when Ajustes saves without them', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupLook: 'postal', popupLookPrevious: 'cartel', popupPhoto: '/v1/uploads/a.jpg' }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3 }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupLook: 'postal', popupLookPrevious: 'cartel', popupPhoto: '/v1/uploads/a.jpg' });
  });
  it('records the previous look when Ajustes changes it', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupLook: 'postal' }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3, popupLook: 'revista' }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupLook: 'revista', popupLookPrevious: 'postal' });
  });
  it('gives the store page a look for every store, and the chosen photo, never the previous look', () => {
    const saved = publicRetentionSettings({ ...DEFAULT_RETENTION, popupLook: 'etiqueta', popupLookPrevious: 'postal', popupPhoto: '/v1/uploads/a.jpg' } as never, 'miga') as Record<string, unknown>;
    expect(saved).toMatchObject({ popupLook: 'etiqueta', popupPhoto: '/v1/uploads/a.jpg' });
    expect(saved).not.toHaveProperty('popupLookPrevious');
    expect(publicRetentionSettings(DEFAULT_RETENTION as never, 'miga')).toMatchObject({ popupLook: pickPopupLook('miga') });
    expect(publicRetentionSettings({ ...DEFAULT_RETENTION, popupLook: 'ruleta' } as never, 'miga')).toMatchObject({ popupLook: pickPopupLook('miga') });
  });
});
```

  (import `pickPopupLook` from `../store-popups/popup-looks`). Run `npx jest src/retention/retention-popup.spec.ts` → FAIL.

- [ ] **Step 2: Implement**
  - DTO: `@IsOptional() @IsIn(POPUP_LOOK_IDS) popupLook?: string;` (import from `../store-popups/popup-looks`).
  - Service: replace the `PopupKitSettings` import with `import { pickPopupLook, readPopupLook, type PopupLookSettings } from '../store-popups/popup-looks';` and:

```ts
export function publicRetentionSettings(s: RetentionSettings & PopupLookSettings, slug?: string) {
  const look = readPopupLook(s.popupLook) ?? (slug ? pickPopupLook(slug) : null);
  return { comebackEnabled: s.comebackEnabled, visitsRequired: s.visitsRequired, rewardLabel: s.rewardLabel, signupEnabled: s.signupEnabled, signupTitle: s.signupTitle, signupBody: s.signupBody, signupButton: s.signupButton, recoveryEnabled: s.recoveryEnabled, popupTrigger: s.popupTrigger, popupDelaySeconds: s.popupDelaySeconds, popupHasCode: Boolean(s.popupPromoCodeId),
    ...(look ? { popupLook: look } : {}), ...(s.popupPhoto ? { popupPhoto: s.popupPhoto } : {}) };
}
const KEPT_SETTINGS = ['emailWorkspace', 'suggestionsDismissedAt', 'popupLook', 'popupLookPrevious', 'popupPhoto'] as const;
```

    In `save`, before the `updateMany`: `const priorLook = (prior as PopupLookSettings).popupLook; const changedLook = Boolean(settings.popupLook && priorLook && settings.popupLook !== priorLook);`
    and the data becomes `settings: { ...kept, ...settings, ...(changedLook ? { popupLookPrevious: priorLook } : {}) } as Prisma.InputJsonValue`
    (kept first: a value Ajustes sends wins).
  - `popupPreview`: `publicRetentionSettings(settings, store.slug)`. Controller public GET: `publicRetentionSettings(s, store.slug)`.
- [ ] **Step 3: Run** → PASS (9 tests).

---

### Task 4: PopupLookService, YAPI ops, wiring; the AI designer removed

**Files:**
- Create: `apps/api/src/store-popups/popup-look.service.ts`, `popup-look.service.spec.ts`
- Delete: `apps/api/src/store-popups/popup-kit.service.ts`, `popup-kit.service.spec.ts`, `popup-kit-designer.ts`, `popup-kit-designer.spec.ts`,
  `popup-kit-validate.ts`, `popup-kit-validate.spec.ts`, `popup-kit-contract.ts`; `apps/api/scripts/design-popups.ts`
- Modify: `store-popup.module.ts`, `source-chat-jobs.service.ts`, `source-chat.service.ts`, `source-store-edit.ts`, `source-store-edit.spec.ts`

**Interfaces:**
- Produces: `PopupLookService.designAfterBuild(storeId)`, `setLook(storeId, look: PopupLookId)`, `setPhoto(storeId, photo)`,
  `undo(storeId): Promise<boolean>`; `POPUP_LOOK_CHOSEN(look)`; `isFirstBuildStep(input)` (moved here unchanged);
  `StoreChange.popupLook?: { action: 'look'; look: PopupLookId } | { action: 'photo'; photo: string } | { action: 'undo' }`;
  `StoreEditState.popup.look?: PopupLookId; previous?: boolean`.

- [ ] **Step 1: Service tests** (`popup-look.service.spec.ts`):

```ts
import { isFirstBuildStep, PopupLookService, POPUP_LOOK_CHOSEN } from './popup-look.service';
import { pickPopupLook } from './popup-looks';

function setup(stored: Record<string, unknown> | null = {}) {
  let row = stored;
  const prisma: any = {
    store: { findUnique: jest.fn(async () => ({ slug: 'miga' })) },
    storeRetention: { findUnique: jest.fn(async () => (row ? { settings: row } : null)), upsert: jest.fn(async ({ update }: any) => { row = update.settings; }) },
    storeAgentThread: { upsert: jest.fn(async () => ({ id: 't1' })) }, storeAgentMessage: { create: jest.fn(async () => ({})) },
  };
  return { service: new PopupLookService(prisma), prisma, read: () => row };
}
describe('PopupLookService', () => {
  it('gives a new store its look after the first build, says so, and never writes the defaults', async () => {
    const { service, prisma, read } = setup(null);
    await service.designAfterBuild('s1');
    expect(read()).toEqual({ popupLook: pickPopupLook('miga') });
    expect(prisma.storeAgentMessage.create.mock.calls[0][0].data.content).toBe(POPUP_LOOK_CHOSEN(pickPopupLook('miga')));
  });
  it('never replaces a look the store already has', async () => {
    const { service, prisma } = setup({ popupLook: 'postal' });
    await service.designAfterBuild('s1');
    expect(prisma.storeRetention.upsert).not.toHaveBeenCalled();
  });
  it('sets a look keeping the old one for undo, sets the photo, and undoes one step', async () => {
    const { service, read } = setup({ popupLook: 'postal', signupTitle: 'Únete' });
    await service.setLook('s1', 'revista');
    expect(read()).toMatchObject({ popupLook: 'revista', popupLookPrevious: 'postal', signupTitle: 'Únete' });
    await service.setPhoto('s1', '/v1/uploads/b.jpg');
    expect(read()).toMatchObject({ popupPhoto: '/v1/uploads/b.jpg' });
    await expect(service.undo('s1')).resolves.toBe(true);
    expect(read()).toMatchObject({ popupLook: 'postal', popupLookPrevious: 'revista' });
    await expect(setup({}).service.undo('s1')).resolves.toBe(false);
  });
  it('knows the first-build chain', () => {
    expect(isFirstBuildStep({ briefCheck: 1 })).toBe(true);
    expect(isFirstBuildStep({ instruction: 'x' })).toBe(false);
  });
});
```

  Run `npx jest src/store-popups/popup-look.service.spec.ts` → FAIL.

- [ ] **Step 2: Implement** `popup-look.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickPopupLook, POPUP_LOOK_NAMES, readPopupLook, type PopupLookId, type PopupLookSettings } from './popup-looks';

export const POPUP_LOOK_CHOSEN = (look: PopupLookId) => `Elegí un estilo para tu ventana de suscripción: ${POPUP_LOOK_NAMES[look]}. Mírala en Mi tienda › Marketing con «Ver ventana de suscripción».`;

/** A job of the new store's first-build chain (template build, section fill, polish, «Revisión del pedido»). */
export function isFirstBuildStep(input: unknown): boolean {
  const flags = (input ?? {}) as { firstDesign?: boolean; briefCheck?: number; sectionLibrary?: boolean; polish?: boolean };
  return Boolean(flags.firstDesign || flags.briefCheck || flags.sectionLibrary || flags.polish);
}

@Injectable()
export class PopupLookService {
  private readonly logger = new Logger(PopupLookService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Only the popup keys are added to the stored row; the defaults are never written (review 2026-11-09). */
  private async write(storeId: string, patch: (stored: PopupLookSettings) => Partial<PopupLookSettings> | null): Promise<boolean> {
    const stored = ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings as Record<string, unknown> | undefined) ?? {};
    const change = patch(stored as PopupLookSettings);
    if (!change) return false;
    const next = { ...stored, ...change };
    await this.prisma.storeRetention.upsert({ where: { storeId }, create: { storeId, settings: next as never }, update: { settings: next as never } });
    return true;
  }

  async designAfterBuild(storeId: string): Promise<void> {
    try {
      const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
      if (!store) return;
      const look = pickPopupLook(store.slug);
      const wrote = await this.write(storeId, stored => (readPopupLook(stored.popupLook) ? null : { popupLook: look }));
      if (!wrote) return;
      const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
      await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: POPUP_LOOK_CHOSEN(look), metadata: { popupLook: look } } });
    } catch (error) {
      this.logger.warn(`popup look after build skipped for ${storeId}: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
    }
  }
  async setLook(storeId: string, look: PopupLookId): Promise<void> {
    await this.write(storeId, stored => ({ popupLook: look, ...(readPopupLook(stored.popupLook) && stored.popupLook !== look ? { popupLookPrevious: stored.popupLook } : {}) }));
  }
  async setPhoto(storeId: string, photo: string): Promise<void> { await this.write(storeId, () => ({ popupPhoto: photo })); }
  undo(storeId: string): Promise<boolean> {
    return this.write(storeId, stored => (readPopupLook(stored.popupLook) && readPopupLook(stored.popupLookPrevious) ? { popupLook: stored.popupLookPrevious, popupLookPrevious: stored.popupLook } : null));
  }
}
```

  Module: `imports: [PrismaModule], providers: [PopupLookService], exports: [PopupLookService]`. Delete the files listed above.
  Run the service spec → PASS (4 tests).

- [ ] **Step 3: YAPI ops tests** — in `source-store-edit.spec.ts` replace the 2026-11-08 popupKit tests (redesign/photo/undo, «designs
  with the photo…», «keeps the popup redesign and undo ops…») with:

```ts
  it('switches the popup look: next, by name, photo and back', () => {
    const photos = [{ url: '/v1/uploads/a1b2.jpg', from: 'mensaje' as const }];
    const styled = state({ popup: { on: true, title: 'Únete', text: '', button: 'Quiero', discount: 0, look: 'postal', previous: true } });
    const next = applyStoreOps(styled, [op('popup', 'redesign')]);
    expect(next.change.popupLook).toEqual({ action: 'look', look: 'revista' });
    expect(next.done).toEqual(['tu ventana de suscripción ahora tiene el estilo Revista']);
    expect(applyStoreOps(styled, [op('popup', 'style', 'Clásica')]).change.popupLook).toEqual({ action: 'look', look: 'clasica' });
    expect(applyStoreOps(styled, [op('popup', 'style', 'postal')]).done).toEqual(['tu ventana de suscripción ya tiene el estilo Postal']);
    expect(applyStoreOps(styled, [op('popup', 'style', 'ruleta')]).refused).toEqual(['Los estilos de la ventana son: Clásica, Portada, Cartel, Postal, Revista y Etiqueta.']);
    expect(applyStoreOps(styled, [op('popup', 'photo', 'f0')], photos).change.popupLook).toEqual({ action: 'photo', photo: '/v1/uploads/a1b2.jpg' });
    expect(applyStoreOps(styled, [op('popup', 'undo')]).change.popupLook).toEqual({ action: 'undo' });
    expect(applyStoreOps(state(), [op('popup', 'undo')]).refused).toEqual(['Tu ventana de suscripción no tiene un estilo anterior al que volver.']);
    expect(storeChangeEmpty(next.change)).toBe(false);
    expect(readStoreOps([op('popup', 'redesign'), op('popup', 'undo'), op('popup', 'style', 'postal'), op('popup', 'photo', 'f0')])).toHaveLength(4);
  });
```

  Run `npx jest src/storefront-source/source-store-edit.spec.ts` → FAIL.

- [ ] **Step 4: Implement in `source-store-edit.ts`** (import `nextPopupLook, POPUP_LOOK_NAMES, readPopupLook, type PopupLookId` from `../store-popups/popup-looks`):
  - `StoreEditState.popup`: replace `designed?`/`previous?` with `look?: PopupLookId; previous?: boolean`.
  - `StoreChange`: replace `popupKit?` with `popupLook?: { action: 'look'; look: PopupLookId } | { action: 'photo'; photo: string } | { action: 'undo' };`
  - digest: replace `diseno_propio` with `...(state.popup.look ? { estilo: POPUP_LOOK_NAMES[state.popup.look] } : {})`.
  - prompt rule: the three 2026-11-08 popup lines become
    `  field redesign = otro estilo de ventana («rediseña la ventana», «cambia el estilo de la ventana»). field style = un estilo por`
    `  nombre (value = clasica, portada, cartel, postal, revista o etiqueta; «ventana tipo postal»). field photo = «cambia la foto de la`
    `  ventana» (value = una foto de «fotos», f0, f1…). field undo = «vuelve a la ventana anterior».`
  - the popup branches (replacing the 2026-11-08 redesign/photo/undo branches):

```ts
        } else if (op.field === 'redesign' || op.field === 'style') {
          const look = op.field === 'redesign' ? nextPopupLook(state.popup.look) : readPopupLook(op.value);
          if (!look) { refused.push('Los estilos de la ventana son: Clásica, Portada, Cartel, Postal, Revista y Etiqueta.'); break; }
          if (look === state.popup.look) { done.push(`tu ventana de suscripción ya tiene el estilo ${POPUP_LOOK_NAMES[look]}`); break; }
          change.popupLook = { action: 'look', look };
          done.push(`tu ventana de suscripción ahora tiene el estilo ${POPUP_LOOK_NAMES[look]}`);
        } else if (op.field === 'photo') {
          const url = photoRef(op.value, photos);
          if (!url) { refused.push('No encontré esa foto para la ventana de suscripción. Mándamela o dime cuál de tus fotos uso.'); break; }
          change.popupLook = { action: 'photo', photo: url };
          done.push('cambié la foto de tu ventana de suscripción');
        } else if (op.field === 'undo') {
          if (!state.popup.previous) { refused.push('Tu ventana de suscripción no tiene un estilo anterior al que volver.'); break; }
          change.popupLook = { action: 'undo' };
          done.push('volví al estilo anterior de tu ventana de suscripción');
        }
```

  - `storeChangeEmpty`: `!change.popupLook` instead of `!change.popupKit`.
  Run → PASS.

- [ ] **Step 5: Wiring**
  - `source-chat.service.ts`: import `PopupLookService` from `../store-popups/popup-look.service` (instead of `PopupKitService`) and
    `pickPopupLook, readPopupLook` from `../store-popups/popup-looks`; constructor `@Optional() private readonly popupLooks?: PopupLookService`;
    `storeEditState`'s `store.findFirst` select adds `slug: true`; in the popup state replace `designed`/`previous` with
    `look: readPopupLook((settings as Record<string, unknown>).popupLook) ?? pickPopupLook(record.slug), previous: Boolean(readPopupLook((settings as Record<string, unknown>).popupLookPrevious)),`
    (read the method first: `record` is the store row of that select; keep its null handling). `writeStoreChange`, replacing the 2026-11-08 lines:

```ts
    if (change.popupLook?.action === 'look') await this.popupLooks?.setLook(storeId, change.popupLook.look);
    if (change.popupLook?.action === 'photo') await this.popupLooks?.setPhoto(storeId, change.popupLook.photo);
    if (change.popupLook?.action === 'undo') await this.popupLooks?.undo(storeId);
```

  - `source-chat-jobs.service.ts`: import `isFirstBuildStep, PopupLookService` from `../store-popups/popup-look.service`; constructor
    `@Optional() private readonly popupLooks?: PopupLookService`; the hook calls `this.popupLooks?.designAfterBuild(job.storeId)`.
- [ ] **Step 6: Run** each, one at a time: `source-store-edit.spec.ts`, `source-chat-store-edit.spec.ts`, `source-chat-jobs.service.spec.ts`,
  `popup-look.service.spec.ts`, `popup-render-rules.spec.ts` → all PASS; `grep -rn "popup-kit\|PopupKit" apps/api/src apps/api/scripts` → nothing.

---

### Task 5: Studio «Estilo de la ventana»

**Files:** Modify `apps/merchant-studio/src/retention.ts`.

- [ ] **Step 1:** In section «02 / Tu comunidad», after the «Ver ventana de suscripción» paragraph:

```ts
        <label>Estilo de la ventana<select name="popupLook"><option value=""${s.popupLook ? '' : ' selected'}>Elegido por YAPI</option>${[['clasica', 'Clásica'], ['portada', 'Portada'], ['cartel', 'Cartel'], ['postal', 'Postal'], ['revista', 'Revista'], ['etiqueta', 'Etiqueta']].map(([value, label]) => `<option value="${value}"${s.popupLook === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
```

- [ ] **Step 2:** In the settings submit handler: `const look = String(form.get('popupLook') || ''); if (look) data.popupLook = look;`
- [ ] **Step 3:** In the preview handler, add the draft look into `words`: `...(draft?.get('popupLook') ? { popupLook: String(draft.get('popupLook')) } : {})`.
- [ ] **Step 4:** `cd apps/merchant-studio && npx tsc -p tsconfig.json --noEmit --incremental false && npx vite build --mode embedded` → both succeed.

---

### Task 6: Backfill every store

**Files:** Create `apps/api/scripts/popup-looks-backfill.ts`.

- [ ] **Step 1:** The script (dry run unless `--apply`):

```ts
// Spec 2026-11-09 popup looks: one look for every store whose popup settings have none (owner: «Yes, all stores now»).
// Usage: cd apps/api && npx ts-node --transpile-only scripts/popup-looks-backfill.ts [--apply]   (take pnpm dev:doctor --backup first)
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { pickPopupLook, readPopupLook } from '../src/store-popups/popup-looks';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const rows = await prisma.storeRetention.findMany({ select: { storeId: true, settings: true, store: { select: { slug: true } } } });
  const counts: Record<string, number> = {};
  let changed = 0;
  for (const row of rows) {
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    if (readPopupLook(settings.popupLook)) continue;
    const look = pickPopupLook(row.store.slug);
    counts[look] = (counts[look] ?? 0) + 1; changed++;
    if (apply) await prisma.storeRetention.update({ where: { storeId: row.storeId }, data: { settings: { ...settings, popupLook: look } as never } });
  }
  console.log(`${apply ? 'Wrote' : 'Would write'} a look for ${changed} of ${rows.length} stores`, counts);
  await prisma.$disconnect();
}
void main();
```

- [ ] **Step 2:** `pnpm dev:doctor --backup`, then the dry run; read the counts (all six used, about even). Then `--apply`; rerun the dry
  run → «Would write a look for 0».

---

### Task 7: Live check

- [ ] The three test stores (miga-pop1, noa-pop2, dooboo-pop3): screenshot each popup at 1280 and 390 (scratch `shots.cjs` adapted to
  `popupLook`), confirm different looks, legible, photo shown; open them on the Desktop.
- [ ] YAPI chat on one store: «ventana tipo cartel» → reply names Cartel; «rediseña la ventana» → the next look; «vuelve a la ventana
  anterior» → back.
- [ ] Studio: Mi tienda › Marketing → pick «Revista» → «Ver ventana de suscripción» shows Revista before saving; save; reopen → kept.
