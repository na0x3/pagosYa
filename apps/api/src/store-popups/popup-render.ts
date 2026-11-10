/// <reference lib="dom" />
/** The signup popup as shoppers get it (spec 2026-11-08 AI popups): the real retention.js in demo mode (never sends), in an offline
 *  Chromium whose only answered request is the popup photo, measured at desktop and phone width. */
import { chromium } from 'playwright';
import { readKitFileSync } from '@pagosya/storefront-kit';

export type PopupLook = { background?: string; foreground?: string; accent?: string; accentForeground?: string; radius?: string };
export type PopupBox = { x: number; y: number; width: number; height: number; visible: boolean };
export type PopupPart = 'dialog' | 'close' | 'photo' | 'title' | 'email' | 'consent' | 'submit';
export type PopupMeasure = { width: number; height: number; dialogOpen: boolean; scrollWidth: number; boxes: Record<PopupPart, PopupBox | null>;
  contrast: { title: number | null; emailLabel: number | null }; titleOverPhoto: boolean;
  /** The design's own root width over the popup's inner width (1 = fills it); null for the built-in layout. */ kitFill?: number | null;
  /** Owner 2026-11-09 (DooBoo «letters are not legible»): visible text under 12px, and the design's own words (outside the slots)
   *  not on a flat colour with contrast ≥ 4.5:1 — e.g. a white caption on the photo. */
  smallText?: string[]; unreadableWords?: string[];
  /** Spec 2026-11-09 popup looks: the look drawn (null = the built-in layout), whether a name field is shown, the photo's src. */
  look?: string | null; nameField?: boolean; photoSrc?: string | null;
  /** Spec 2026-11-09 popup games: the game's step, its play area and the corner tab. */
  game?: { step: string | null; play: PopupBox | null; tab: PopupBox | null; wonSize?: number | null } };
export type PopupRenderInput = { storeName: string; settings: Record<string, unknown>; look: PopupLook; photo?: { bytes: Buffer; contentType: string }; hosted?: boolean;
  /** The page's API base (default the check's own origin); an upload-path kit photo is fetched from it. */ apiBaseUrl?: string;
  /** Spec 2026-11-09 popup games: steps run after the popup opens, then measured. */ actions?: Array<'play' | 'claim' | 'close'> };

export const POPUP_PHOTO_URL = 'https://popup-check.invalid/photo';
export const POPUP_SIZES = [{ width: 1280, height: 800 }, { width: 390, height: 844 }] as const;
const HEX = /^#[\da-f]{6}$/i;

function pageHtml(input: PopupRenderInput) {
  const look = input.look;
  const tokens = [['--store-background', look.background], ['--store-foreground', look.foreground], ['--store-accent', look.accent],
    ['--store-accent-foreground', look.accentForeground]].filter(([, value]) => value && HEX.test(value)).map(([name, value]) => `${name}:${value}`);
  if (look.radius && /^\d{1,2}px$/.test(look.radius)) tokens.push(`--store-radius:${look.radius}`);
  const retention = { ...input.settings, signupEnabled: true, popupTrigger: 'load',
    signupVisual: { brand: { name: input.storeName }, imageUrl: input.photo ? POPUP_PHOTO_URL : null, interests: [] } };
  const config = { slug: 'popup-check', demo: true, apiBaseUrl: input.apiBaseUrl ?? 'https://popup-check.invalid', data: { storeName: input.storeName, retention } };
  // JSON in a script: «<» escaped so no store word can close the tag.
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{${tokens.join(';')}}body{margin:0;min-height:100vh;background:var(--store-background,#fff)}</style></head>
<body><main><h1>${input.storeName.replace(/[<&]/g, '')}</h1></main><script>${input.hosted ? 'window.PAGOSYA_HOSTED=true;' : ''}window.PAGOSYA_CONFIG=${json};</script></body></html>`;
}

/** Runs in the page: boxes, visibility, contrast of the title and the email label against their nearest opaque background. */
function measureInPage(): Omit<PopupMeasure, 'width' | 'height'> {
  const box = (el: Element | null | undefined): PopupBox | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let visible = r.width > 0 && r.height > 0;
    for (let node: Element | null = el; node && visible; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) visible = false;
    }
    return { x: r.x, y: r.y, width: r.width, height: r.height, visible };
  };
  const rgb = (value: string) => { const n = (value.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number); return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const lum = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b].map(v => v / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  // The first ancestor painting a flat opaque colour; an image or gradient first means the text sits on a picture (null colour).
  const backdrop = (el: Element) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return { color: null, at: node };
      const colour = rgb(style.backgroundColor);
      if (colour.a >= 0.99) return { color: colour, at: node };
    }
    return { color: { r: 255, g: 255, b: 255, a: 1 }, at: null as Element | null };
  };
  const contrast = (el: Element | null | undefined) => {
    if (!el) return null;
    const bg = backdrop(el).color;
    if (!bg) return null;
    const [a, b] = [lum(rgb(getComputedStyle(el).color)) + 0.05, lum(bg) + 0.05];
    return Math.max(a, b) / Math.min(a, b);
  };
  const dialog = document.querySelector('dialog.pagosya-signup-dialog') as HTMLDialogElement | null;
  const photo = dialog?.querySelector('pya-photo img, .pagosya-signup-photo img') ?? null;
  const title = dialog?.querySelector('h2') ?? null;
  const email = dialog?.querySelector('input[type=email]') ?? null;
  const t = title?.getBoundingClientRect(), p = photo?.getBoundingClientRect();
  const overlaps = Boolean(t && p && t.left < p.right && t.right > p.left && t.top < p.bottom && t.bottom > p.top);
  const behindTitle = title ? backdrop(title).at : null;
  const kitRoot = dialog?.querySelector('[data-popup-kit] > *');
  const hasWords = (el: Element) => Array.from(el.childNodes).some(node => node.nodeType === 3 && (node.textContent ?? '').trim());
  const words = (el: Element) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const texts = dialog ? Array.from(dialog.querySelectorAll('*')).filter(el => hasWords(el) && box(el)?.visible) : [];
  const own = texts.filter(el => el.closest('[data-popup-kit]') && !el.closest('pya-photo,pya-title,pya-text,pya-form,pya-code'));
  const overPhoto = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (!p || !(r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top)) return false;
    const behind = backdrop(el).at;
    return !behind || Boolean(photo && behind.contains(photo));
  };
  return {
    look: dialog?.querySelector('[data-popup-look]')?.getAttribute('data-popup-look') ?? null,
    game: { step: document.querySelector('[data-game-step]')?.getAttribute('data-game-step') ?? null, play: box(document.querySelector('[data-game-play]')), tab: box(document.querySelector('.pagosya-game-tab')), wonSize: document.querySelector('.game-won') ? parseFloat(getComputedStyle(document.querySelector('.game-won')!).fontSize) : null },
    nameField: Boolean(dialog?.querySelector('input[name=name]')),
    photoSrc: photo?.getAttribute('src') ?? null,
    smallText: texts.filter(el => parseFloat(getComputedStyle(el).fontSize) < 12).map(el => `${words(el)} (${getComputedStyle(el).fontSize})`),
    // Words drawn over the photo read against the picture, whatever colour the frame behind it has (DooBoo live 2026-11-09).
    unreadableWords: own.filter(el => (contrast(el) ?? 0) < 4.5 || overPhoto(el)).map(words),
    kitFill: kitRoot && dialog ? kitRoot.getBoundingClientRect().width / dialog.clientWidth : null,
    dialogOpen: Boolean(dialog?.open), scrollWidth: document.documentElement.scrollWidth,
    boxes: { dialog: box(dialog), close: box(dialog?.querySelector('.signup-close')), photo: box(photo), title: box(title), email: box(email),
      consent: box(dialog?.querySelector('.signup-consent')), submit: box(dialog?.querySelector('.signup-submit')) },
    contrast: { title: contrast(title), emailLabel: contrast(email?.closest('label')) },
    titleOverPhoto: overlaps && (!behindTitle || Boolean(photo && behindTitle.contains(photo))),
  };
}

export async function measurePopup(input: PopupRenderInput, sizes: ReadonlyArray<{ width: number; height: number }> = POPUP_SIZES): Promise<PopupMeasure[] | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 10_000 });
  } catch { return null; }
  try {
    const script = readKitFileSync('retention.js');
    const measures: PopupMeasure[] = [];
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false, offline: true, locale: 'es-ES' });
      // Every image on the check's own origin is the photo (the kit's /v1/uploads/… path resolves there too).
      await context.route('**/*', route => (route.request().url().startsWith('https://popup-check.invalid/') && input.photo
        ? route.fulfill({ body: input.photo.bytes, contentType: input.photo.contentType })
        : route.abort()));
      const page = await context.newPage();
      await page.setContent(pageHtml(input), { waitUntil: 'domcontentloaded', timeout: 10_000 });
      await page.addScriptTag({ content: script });
      await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')), null, { timeout: 5_000 }).catch(() => undefined);
      await page.waitForFunction(() => { const img = document.querySelector('dialog[open] img') as HTMLImageElement | null; return !img || img.complete; }, null, { timeout: 3_000 }).catch(() => undefined);
      for (const action of input.actions ?? []) {
        if (action === 'play') { await page.click('[data-game-action=play]'); await page.waitForSelector('[data-game-step=reveal]', { timeout: 6_000 }).catch(() => undefined); }
        if (action === 'claim') await page.click('[data-game-action=claim]');
        // The dialog's close event fires after the click; the corner tab is added then.
        if (action === 'close') { await page.click('dialog[open] .signup-close'); await page.waitForSelector('.pagosya-game-tab', { timeout: 2_000 }).catch(() => undefined); }
      }
      measures.push({ ...size, ...(await page.evaluate(measureInPage)) });
      await context.close();
    }
    return measures;
  } finally { await browser.close().catch(() => undefined); }
}

const PART_NAMES: Record<PopupPart, string> = { dialog: 'popup', close: 'close button', photo: 'photo', title: 'title', email: 'email field', consent: 'consent line', submit: 'button' };

/** The spec's render rules; each problem names the width, so the repair call knows where to look. */
export function checkPopupRender(measures: PopupMeasure[]): string[] {
  const problems: string[] = [];
  for (const m of measures) {
    const at = `at ${m.width}px`;
    if (!m.dialogOpen) { problems.push(`${at} the popup did not open`); continue; }
    const inside = (b: PopupBox, vertical: boolean) => b.x >= -1 && b.x + b.width <= m.width + 1 && (!vertical || (b.y >= -1 && b.y + b.height <= m.height + 1));
    for (const part of ['close', 'title', 'email', 'consent', 'submit'] as const) {
      const b = m.boxes[part];
      // A published store's email is typed in the secure form, so a missing email field is not a fault there.
      if (!b) { if (part !== 'email') problems.push(`${at} the ${PART_NAMES[part]} is hidden`); continue; }
      if (!b.visible) problems.push(`${at} the ${PART_NAMES[part]} is hidden`);
      else if (!inside(b, part === 'close' || part === 'title' || part === 'email')) problems.push(`${at} the ${PART_NAMES[part]} is outside the screen`);
    }
    const photo = m.boxes.photo;
    if (!photo || !photo.visible || photo.height < 120) problems.push(`${at} the photo is missing or under 120px tall`);
    if (m.contrast.title === null) problems.push(`${at} the title has no flat background colour`);
    else if (m.contrast.title < 4.5) problems.push(`${at} the title contrast is under 4.5:1`);
    if (m.contrast.emailLabel !== null && m.contrast.emailLabel < 4.5) problems.push(`${at} the email label contrast is under 4.5:1`);
    if (m.titleOverPhoto) problems.push(`${at} the title sits on the photo without a panel`);
    if (m.scrollWidth > m.width + 1) problems.push(`${at} the page scrolls sideways`);
    if (m.smallText?.length) problems.push(`${at} text is under 12px: ${m.smallText.slice(0, 4).join(', ')}`);
    if (m.unreadableWords?.length) problems.push(`${at} these words are not on a flat readable colour: ${m.unreadableWords.slice(0, 4).join(', ')}`);
  }
  return problems;
}
