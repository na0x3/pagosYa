/// <reference lib="dom" />
/** Popups 2.0 (spec 2026-11-18 §6): every step of a YAPI design played by the real retention.js (its Studio preview hook, demo mode —
 *  nothing is sent) in an offline Chromium whose only answered requests are the check page and the store's own images. Measured at
 *  desktop and phone width with reduced motion; a JPEG of each step is kept for the Popups page. */
import { chromium } from 'playwright';
import { readKitFileSync } from '@pagosya/storefront-kit';
import { POPUP_SIZES, type PopupBox } from './popup-render';

const ORIGIN = 'https://popup-check.invalid';
export type FlowStepMeasure = { stepId: string; size: { width: number; height: number }; close: PopupBox | null; closeHit: boolean; scrollWidth: number; dialog: PopupBox | null;
  /** The popup's own content edges: a modal sits in the top layer, so an overflowing card never widens the page's scroll. */
  contentLeft: number; contentRight: number;
  contentTop: number; contentBottom: number;
  contrastFails: string[]; /** Words squeezed into a sliver (one syllable per line). */ squashed: string[]; /** Words another part of the popup sits on. */ covered: string[]; /** Words drawn over a cut-out or drawing. */ overArt: string[]; /** The close sits in a top corner of the popup. */ closeInCorner: boolean; fieldsTypeable: boolean | null; tiles: number | null; tileImages: number | null; screenshot: Buffer };
export type FlowRenderInput = { storeName: string; design: { id: string; flow: unknown; steps: Record<string, string>; css: string; capture: string; percent: number };
  items: unknown[]; photos: Record<string, { bytes: Buffer; contentType: string }> };

const escape = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pageHtml = (storeName: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff"><main><h1>${escape(storeName)}</h1></main></body></html>`;

function measureInPage(): Omit<FlowStepMeasure, 'stepId' | 'size' | 'fieldsTypeable' | 'screenshot'> {
  const root = document.querySelector('[data-pagosya-popup-preview] [data-pya-popup]') as HTMLElement | null;
  const dialog = document.querySelector('[data-pagosya-popup-preview] dialog') as HTMLElement | null;
  const box = (el: Element | null | undefined): PopupBox | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect(), style = getComputedStyle(el as HTMLElement);
    return { x: r.x, y: r.y, width: r.width, height: r.height, visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 };
  };
  const close = root?.querySelector('[data-close]') ?? null;
  // Opacity is not inherited: a parent at 0 (or filter: opacity(0)) hides the close though its own opacity reads 1 (final review I6).
  const faded = (el: Element | null) => {
    let shown = 1;
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      shown *= Number(style.opacity);
      if (/opacity\(\s*0(?:\.0+)?%?\s*\)/.test(style.filter)) shown = 0;
    }
    return shown < 0.2;
  };
  const closeBox = box(close);
  if (closeBox && faded(close)) closeBox.visible = false;
  const hit = closeBox && closeBox.visible ? document.elementFromPoint(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2) : null;
  const rgb = (value: string) => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean); return { r: +r, g: +g, b: +b, a: +a }; };
  const lum = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = (el: Element | null): { r: number; g: number; b: number } | null => {
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const c = rgb(style.backgroundColor);
      if (c && c.a > 0.9) return c;
      if (node === root) break;
    }
    return null;
  };
  const contrastFails: string[] = [];
  const squashed: string[] = [];
  const covered: string[] = [];
  const overArt: string[] = [];
  const nearArt: Element[] = [];
  const artBoxes = Array.from(root?.querySelectorAll('[data-art]') ?? []).map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
  // Decoration (data-art) may burst past the edges and is not text: it is left out of the text and edge checks.
  const isArt = (el: Element) => Boolean(el.closest('[data-art]'));
  for (const el of Array.from(root?.querySelectorAll('*') ?? []).filter(el => !isArt(el))) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent ?? '').trim());
    const b = box(el);
    if (!own || !b?.visible) continue;
    const words = (el.textContent ?? '').trim();
    if (words.replace(/\s/g, '').length >= 4 && b.width < parseFloat(getComputedStyle(el).fontSize) * 2.2) squashed.push(words.slice(0, 40));
    const cx = b.x + Math.min(b.width, 24) / 2, cy = b.y + b.height / 2;
    const top = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
    if (top && top !== el && !el.contains(top) && !top.contains(el)) covered.push(words.slice(0, 40));
    const textArea = b.width * b.height;
    if (textArea > 0 && !el.closest('[data-close]') && words.replace(/\s/g, '').length >= 3 && artBoxes.some(a => Math.max(0, Math.min(a.right, b.x + b.width) - Math.max(a.left, b.x)) * Math.max(0, Math.min(a.bottom, b.y + b.height) - Math.max(a.top, b.y)) > textArea * 0.25)) nearArt.push(el);
    const fg = rgb(getComputedStyle(el).color), bg = background(el);
    if (!fg || !bg) continue;
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    if ((hi + 0.05) / (lo + 0.05) < 4.5) contrastFails.push((el.textContent ?? '').trim().slice(0, 40));
  }
  // Words near a cut-out are a problem only when the art is drawn over them, or they sit straight on it with no solid surface
  // between (live 2026-11-18: words on a card or button above the art read fine).
  const arts = Array.from(root?.querySelectorAll('[data-art]') ?? []) as HTMLElement[];
  arts.forEach(art => art.style.setProperty('pointer-events', 'auto', 'important'));
  for (const el of nearArt) {
    const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const stack = document.elementsFromPoint(x, y);
    const atText = stack.findIndex(node => node === el || el.contains(node)), atArt = stack.findIndex(node => Boolean(node.closest('[data-art]')));
    if (atArt < 0) continue;
    let bare = atText < 0 || atArt < atText;
    if (!bare) {
      bare = true;
      for (const node of stack.slice(atText, atArt)) {
        const style = getComputedStyle(node), c = rgb(style.backgroundColor);
        if ((c && c.a > 0.9) || style.backgroundImage !== 'none') { bare = false; break; }
      }
    }
    if (bare) overArt.push((el.textContent ?? '').trim().slice(0, 40));
  }
  arts.forEach(art => art.style.removeProperty('pointer-events'));
  const tiles = root?.querySelectorAll('[data-tile]') ?? null;
  const edges = Array.from(root?.querySelectorAll('*') ?? []).filter(el => !el.closest('[data-art]')).map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
  // The close belongs in a top corner of the popup (live 2026-11-18: Fishwife's floated mid-left over the art).
  const contentTop = edges.length ? Math.min(...edges.map(r => r.top)) : 0, contentBottom = edges.length ? Math.max(...edges.map(r => r.bottom)) : 0;
  const leftEdge = edges.length ? Math.min(...edges.map(r => r.left)) : 0, rightEdge = edges.length ? Math.max(...edges.map(r => r.right)) : 0;
  const closeInCorner = !closeBox || (closeBox.y + closeBox.height / 2 - contentTop <= Math.max(96, (contentBottom - contentTop) * 0.18)
    && (closeBox.x + closeBox.width / 2 - leftEdge <= 120 || rightEdge - (closeBox.x + closeBox.width / 2) <= 120));
  return { contentLeft: edges.length ? Math.min(...edges.map(r => r.left)) : 0, contentRight: edges.length ? Math.max(...edges.map(r => r.right)) : 0, contentTop, contentBottom, close: closeBox, closeHit: Boolean(close && hit && (close === hit || close.contains(hit))), scrollWidth: document.documentElement.scrollWidth, dialog: box(dialog),
    contrastFails, squashed, covered, overArt, closeInCorner, tiles: tiles && tiles.length ? tiles.length : null,
    tileImages: tiles && tiles.length ? Array.from(tiles).filter(t => ((t.querySelector('img') as HTMLImageElement | null)?.naturalWidth ?? 0) > 0).length : null };
}

export async function measureFlow(input: FlowRenderInput, sizes: ReadonlyArray<{ width: number; height: number }> = POPUP_SIZES): Promise<FlowStepMeasure[] | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try { browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 10_000 }); } catch { return null; }
  try {
    const script = readKitFileSync('retention.js');
    const steps = (Array.isArray(input.design.flow) ? input.design.flow as Array<{ id: string; kind: string }> : []).filter(step => step.kind !== 'land' && typeof input.design.steps[step.id] === 'string');
    const measures: FlowStepMeasure[] = [];
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false, locale: 'es-ES' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) return route.abort();
        if (url.pathname === '/') return route.fulfill({ body: pageHtml(input.storeName), contentType: 'text/html' });
        const photo = input.photos[url.pathname];
        return photo ? route.fulfill({ body: photo.bytes, contentType: photo.contentType }) : route.fulfill({ status: 404, body: '' });
      });
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      await page.addScriptTag({ content: script });
      for (const step of steps) {
        await page.evaluate(([design, items, stepId]) => {
          (window as unknown as { PAGOSYA_POPUP_PREVIEW: (s: unknown, c: unknown, id: string) => void }).PAGOSYA_POPUP_PREVIEW({ signupEnabled: true, popupDesign: design }, { slug: 'popup-check', apiBaseUrl: `${location.origin}/v1`, data: { items } }, stepId);
        }, [input.design, input.items, step.id] as const);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-pagosya-popup-preview] img')).every(img => (img as HTMLImageElement).complete), null, { timeout: 3_000 }).catch(() => undefined);
        const measured = await page.evaluate(measureInPage);
        let fieldsTypeable: boolean | null = null;
        if (step.kind === 'capture') {
          const field = page.locator('[data-pagosya-popup-preview] [data-field]').first();
          fieldsTypeable = await field.fill('71234567', { timeout: 2_000 }).then(async () => (await field.inputValue()) === '71234567').catch(() => false);
        }
        const screenshot = await page.locator('[data-pagosya-popup-preview] dialog').screenshot({ type: 'jpeg', quality: 70, timeout: 5_000 }).catch(() => Buffer.alloc(0));
        measures.push({ stepId: step.id, size, ...measured, fieldsTypeable, screenshot });
      }
      await context.close();
    }
    return measures;
  } finally { await browser.close().catch(() => undefined); }
}

/** The spec's rules, in the words YAPI gets back on a retry; each names the step and the width. */
export function checkFlowRender(measures: FlowStepMeasure[]): string[] {
  const problems: string[] = [];
  for (const m of measures) {
    const where = `paso ${m.stepId} a ${m.size.width}px`;
    const c = m.close;
    if (!c || !c.visible || !m.closeHit) problems.push(`${where}: no se ve o no se puede tocar el botón para cerrar.`);
    else {
      if (c.width < 40 || c.height < 40) problems.push(`${where}: el botón para cerrar mide menos de 40×40.`);
      if (c.x < 0 || c.y < 0 || c.x + c.width > m.size.width || c.y + c.height > m.size.height) problems.push(`${where}: el botón para cerrar queda fuera de la pantalla.`);
    }
    if (m.scrollWidth > m.size.width + 1 || (m.dialog && m.dialog.width > m.size.width + 1) || m.contentRight > m.size.width + 1 || m.contentLeft < -1) problems.push(`${where}: el popup se sale a lo ancho.`);
    if (m.contrastFails.length) problems.push(`${where}: poco contraste en «${m.contrastFails[0]}».`);
    if (m.closeInCorner === false) problems.push(`${where}: el botón para cerrar va en una esquina de arriba del popup.`);
    if (m.overArt?.length) problems.push(`${where}: texto encima de un recorte o dibujo en «${m.overArt[0]}»; mueve el recorte o el texto.`);
    if (m.covered?.length) problems.push(`${where}: texto tapado por otra parte del popup en «${m.covered[0]}».`);
    if (m.squashed?.length) problems.push(`${where}: texto aplastado en «${m.squashed[0]}» (una o dos letras por línea).`);
    if (Math.abs((m.contentLeft + m.contentRight) / 2 - m.size.width / 2) > 40 && m.contentRight - m.contentLeft < m.size.width - 40) problems.push(`${where}: el popup no queda centrado.`);
    if (m.fieldsTypeable === false) problems.push(`${where}: no se puede escribir en el campo.`);
    if (m.tiles !== null && (m.tiles < 2 || (m.tileImages ?? 0) < m.tiles)) problems.push(`${where}: las fichas de productos no muestran sus fotos.`);
  }
  return problems;
}
