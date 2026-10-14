// apps/api/src/storefront-source/store-look-measure.ts
/// <reference lib="dom" />
/** Layer A of one look per store (spec 2026-10-14): render the store's own home page once, offline, and read what it
 * actually does (headline type, corners, edges, photo look, section rhythm). Never calls a model; never fails a save. */
import { withVisualSandbox } from './source-visual-capture';
import { lookFromReading, patchConfigFile, sanitizeLook, type LookReading, type StoreLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

const origin = 'https://preview.invalid';

/** Runs inside the page (serialized by page.evaluate): no outer references. Kit-owned parts, the header, the nav and the
 * footer are skipped, so the kit never measures itself and the logo never counts as a photo. */
export function readLookInPage(): LookReading {
  const px = (value: string) => parseFloat(value) || 0;
  const kitOwned = (el: Element) => Boolean(el.closest('.menu-item:not([data-custom-product]),[data-pagosya-cart],.cart-drawer,[data-pagosya-product],header,footer,nav'));
  const shown = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const alpha = (value: string) => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const parts = m[1].split(/[\s,/]+/).filter(Boolean); return parts.length > 3 ? parseFloat(parts[3]) : 1; };
  const luminance = (value: string) => {
    const channels = (value.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const shadows = (value: string) => value === 'none' ? [] : value.split(/,(?![^(]*\))/).map(part => { const n = (part.match(/-?\d*\.?\d+px/g) ?? []).map(px); return { x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0, spread: n[3] ?? 0, inset: /\binset\b/.test(part) }; });
  const corner = (value: string, size: number) => { const first = value.split(' ')[0]; return first.endsWith('%') ? parseFloat(first) / 100 * size : px(first); };
  const box = (el: Element) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { width: r.width, height: r.height, radii: [corner(s.borderTopLeftRadius, r.width), corner(s.borderTopRightRadius, r.width), corner(s.borderBottomRightRadius, r.width), corner(s.borderBottomLeftRadius, r.width)] as [number, number, number, number], borderWidth: Math.max(px(s.borderTopWidth), px(s.borderLeftWidth)), shadows: shadows(s.boxShadow) };
  };
  const angle = (s: CSSStyleDeclaration) => {
    const own = s.rotate && s.rotate !== 'none' ? parseFloat(s.rotate) : 0;
    const m = s.transform.match(/^matrix\(([^)]+)\)$/);
    const fromMatrix = m ? (() => { const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; })() : 0;
    return own || fromMatrix;
  };
  const amount = (filter: string, name: string) => { const m = filter.match(new RegExp(`${name}\\(([\\d.]+)(%?)\\)`)); return m ? Number(m[1]) / (m[2] ? 100 : 1) : 0; };
  const upperText = (text: string) => /\p{L}{2}/u.test(text) && text === text.toLocaleUpperCase('es');

  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).filter(el => shown(el) && !kitOwned(el));
  const top = headings.find(el => el.tagName === 'H1') ?? headings.sort((a, b) => px(getComputedStyle(b).fontSize) - px(getComputedStyle(a).fontSize))[0];
  const hs = top ? getComputedStyle(top) : null;
  const heading = top && hs ? {
    families: hs.fontFamily.split(',').map(f => f.trim().replace(/^["']|["']$/g, '')),
    weight: Number(hs.fontWeight) || 400, transform: hs.textTransform, literalUpper: upperText(top.textContent?.trim() ?? ''),
    letterSpacing: hs.letterSpacing === 'normal' ? 0 : px(hs.letterSpacing), fontSize: px(hs.fontSize), italic: hs.fontStyle === 'italic',
  } : null;
  const loadedFamilies = Array.from(document.fonts as unknown as Iterable<FontFace>).filter(font => font.status === 'loaded').map(font => font.family.replace(/^["']|["']$/g, ''));

  const everything = Array.from(document.querySelectorAll('body *'));
  const labels = everything.filter(el => el.children.length === 0 && !kitOwned(el) && shown(el)).flatMap(el => {
    const s = getComputedStyle(el), text = el.textContent?.trim() ?? '';
    return text.length >= 3 && text.length <= 40 && px(s.fontSize) <= 14 && (s.textTransform === 'uppercase' || upperText(text))
      ? [{ letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing), fontSize: px(s.fontSize), weight: Number(s.fontWeight) || 400 }] : [];
  }).slice(0, 20);

  const photos = Array.from(document.images).filter(img => shown(img) && !kitOwned(img))
    .map(img => ({ img, rect: img.getBoundingClientRect() })).filter(({ rect }) => rect.width >= 120 && rect.height >= 120)
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height).slice(0, 8)
    .map(({ img, rect }) => {
      const parent = img.parentElement, ps = parent ? getComputedStyle(parent) : null, pr = parent?.getBoundingClientRect();
      // A wrapper that hugs the photo (clips it, pads it like a print, shadows or rounds it) is the photo's frame.
      const hugs = Boolean(parent && ps && pr && pr.width <= rect.width + 80 && (ps.overflow !== 'visible' || px(ps.paddingTop) >= 6 || ps.boxShadow !== 'none' || px(ps.borderTopLeftRadius) > 0));
      const frame = hugs ? parent! : img;
      const s = getComputedStyle(img), fs = getComputedStyle(frame);
      const after = parent ? getComputedStyle(parent, '::after') : null;
      const overlay = Boolean(after && after.content !== 'none' && after.backgroundImage !== 'none');
      const blend = s.mixBlendMode !== 'normal' ? s.mixBlendMode : overlay && after!.mixBlendMode !== 'normal' ? after!.mixBlendMode : 'normal';
      const filter = `${s.filter} ${fs.filter}`;
      return { ...box(frame), width: rect.width, height: rect.height, grayscale: amount(filter, 'grayscale'), sepia: amount(filter, 'sepia'), blend, overlay,
        padding: hugs ? px(fs.paddingTop) : 0, lightBacking: hugs && alpha(fs.backgroundColor) > 0.9 && luminance(fs.backgroundColor) > 0.8, rotate: angle(s) || angle(fs) };
    });

  const groups = new Map<Element, Element[]>();
  for (const el of everything) {
    const parent = el.parentElement;
    if (!parent || kitOwned(el) || !shown(el) || !el.querySelector('img') || (el.textContent?.trim().length ?? 0) < 3) continue;
    groups.set(parent, [...(groups.get(parent) ?? []), el]);
  }
  const cardGroup = Array.from(groups.values()).filter(list => list.length >= 3 && new Set(list.map(el => `${el.tagName}.${el.className}`)).size === 1).sort((a, b) => b.length - a.length)[0] ?? [];
  const cards = cardGroup.slice(0, 6).map(box);

  const buttons = Array.from(document.querySelectorAll('a, button')).filter(el => shown(el) && !kitOwned(el)).filter(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return r.height >= 32 && r.height <= 80 && px(s.paddingLeft) >= 10 && (alpha(s.backgroundColor) > 0.5 || px(s.borderTopWidth) >= 1);
  }).slice(0, 8).map(box);

  const pageBg = [document.body, document.documentElement].map(el => getComputedStyle(el).backgroundColor).find(c => alpha(c) > 0.5) ?? 'rgb(255, 255, 255)';
  let container: Element = document.querySelector('main') ?? document.body;
  while (container.children.length === 1) container = container.children[0];
  const sections = Array.from(container.children).filter(el => shown(el) && el.getBoundingClientRect().height >= 200 && el.getBoundingClientRect().width >= innerWidth * 0.9)
    .map(el => { const c = getComputedStyle(el).backgroundColor, background = alpha(c) > 0.9 ? c : pageBg; return { luminance: luminance(background), background }; });

  return { heading, loadedFamilies, labels, photos, cards, buttons, sections, pageLuminance: luminance(pageBg) };
}

/** One render of index.html at 1280×800 with reduced motion. Null when the snapshot has no home page. */
export async function measureStoreLook(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal; deadlineMs?: number } = {}): Promise<LookReading | null> {
  if (!snapshot.files.some(file => file.path === 'index.html')) return null;
  const deadline = AbortSignal.timeout(options.deadlineMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  return withVisualSandbox(snapshot, '', signal, false, async context => {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/index.html`, { waitUntil: 'load', timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.evaluate(readLookInPage);
  });
}

export type LookOutcome = 'measured' | 'kept' | 'off' | 'none';
/** The save with config.look written: freshly measured, else the store's previous look, else unchanged. Never throws for
 * a failed measurement; rethrows only when the caller's own signal was aborted. */
export async function withMeasuredLook<T extends { files: SourceProjectFileDto[] }>(input: T, options: { enabled: boolean; declaredTreatment?: string; previousLook?: unknown; brief?: unknown; signal?: AbortSignal; measure?: typeof measureStoreLook }): Promise<{ input: T; look?: StoreLook; outcome: LookOutcome; reason?: string }> {
  const kept = sanitizeLook(options.previousLook);
  let look: StoreLook | undefined = kept;
  let outcome: LookOutcome = !options.enabled ? (kept ? 'kept' : 'off') : kept ? 'kept' : 'none';
  let reason: string | undefined;
  if (options.enabled) {
    try {
      const reading = await (options.measure ?? measureStoreLook)({ brief: options.brief, files: input.files } as unknown as SourceProjectSnapshot, { signal: options.signal });
      // Sanitized like any stored look: a reading's NaN or float noise never reaches config.js.
      const measured = reading ? sanitizeLook(lookFromReading(reading, { treatment: options.declaredTreatment })) : undefined;
      if (measured) { look = measured; outcome = 'measured'; }
    } catch (error) {
      options.signal?.throwIfAborted();
      reason = ((error as Error)?.message || 'sin respuesta').slice(0, 200);
    }
  }
  if (!look) return { input, outcome, reason };
  return { input: { ...input, files: patchConfigFile(input.files, config => ({ ...config, look })) }, look, outcome, reason };
}
