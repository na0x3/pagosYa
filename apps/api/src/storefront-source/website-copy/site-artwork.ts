/// <reference lib="dom" />
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Page } from 'playwright';
import { GUARDED_USER_AGENT, withGuardedPage } from '../guarded-browser';
import { readSourceReferenceResource } from '../source-website-fetch';
import { isGenericFamily } from '../brand-source-fonts';

/** A picture from the merchant's own site: a photo (fetched as published) or a drawing (an inline SVG or .svg, drawn by the
 *  browser into a transparent PNG). */
export type SiteArtwork = { body: Buffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; kind: 'photo' | 'drawing'; alt: string; source: string; width: number; height: number; inHeader: boolean };
export type SiteArtworkResult = { artwork: SiteArtwork[]; fonts: { display?: string; text?: string } };
type Candidate = { id: number; kind: 'img' | 'bg' | 'svg'; src: string; alt: string; width: number; height: number; inHeader: boolean };

const MAX_BYTES = 8_000_000;

/** The page's pictures in reading order, each marked for an element screenshot: photos at least 160 px across on screen,
 *  backgrounds 200 × 120, drawings at least 56 px (smaller ones are icons). Pictures inside buttons and menus, and hidden
 *  ones, are left out. */
function listCandidates(): Candidate[] {
  const shown = (element: Element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const found: Candidate[] = [];
  const seen = new Set<string>();
  let id = 0;
  const add = (element: Element, kind: Candidate['kind'], src: string, alt: string) => {
    const box = element.getBoundingClientRect();
    // One drawing drawn twice (Graza's wordmark at two sizes) is one picture.
    const key = kind === 'svg' && !src ? `svg:${element.outerHTML.length}:${element.outerHTML.slice(0, 300)}` : src;
    if (seen.has(key)) return;
    seen.add(key);
    element.setAttribute('data-pagosya-art', String(id));
    found.push({ id: id++, kind, src, alt: alt.trim().slice(0, 120), width: Math.round(box.width), height: Math.round(box.height), inHeader: Boolean(element.closest('header')) });
  };
  for (const element of Array.from(document.querySelectorAll('body *'))) {
    if (found.length >= 80 || !shown(element)) continue;
    const box = element.getBoundingClientRect();
    if (element instanceof HTMLImageElement) {
      const src = element.currentSrc || element.src;
      if (!src || src.startsWith('data:') || !element.naturalWidth) continue;
      const drawing = /\.svg(?:$|\?)/i.test(src);
      if (drawing ? box.width < 56 || box.height < 56 : box.width < 160 || box.height < 120) continue;
      add(element, drawing ? 'svg' : 'img', src, element.alt || '');
    } else if (element instanceof SVGSVGElement) {
      if (box.width < 56 || box.height < 56 || element.parentElement?.closest('svg') || element.closest('button, nav, [role="button"]')) continue;
      add(element, 'svg', '', element.getAttribute('aria-label') || element.querySelector('title')?.textContent || '');
    } else if (element instanceof HTMLElement && box.width >= 200 && box.height >= 120) {
      const url = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(element).backgroundImage)?.[1];
      if (url && !url.startsWith('data:')) add(element, /\.svg(?:$|\?)/i.test(url) ? 'svg' : 'bg', new URL(url, location.href).href, element.getAttribute('aria-label') || '');
    }
  }
  return found;
}

function pageFonts() {
  const first = (element: Element | null) => element ? getComputedStyle(element).fontFamily.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''))[0] : undefined;
  return { display: first(document.querySelector('h1, h2')), text: first(document.querySelector('main p, p') ?? document.body) };
}

async function scrollThrough(page: Page) {
  for (let step = 0; step < 30; step++) {
    const done = await page.evaluate(() => { window.scrollBy(0, innerHeight * 0.8); return innerHeight + scrollY >= document.documentElement.scrollHeight - 4; });
    await page.waitForTimeout(250);
    if (done) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

/** Copy a store (owner 2026-11-17: «graza is still way better with way much more artwork»): the drawings, badges and section
 *  photos of the merchant's OWN site beyond its product photos, so the copy can use their artwork. `skip` names sources
 *  already imported (the catalog's photos). The page only runs inside the guarded browser, and drawings come out as pixels,
 *  never as SVG code. */
export async function collectSiteArtwork(url: string, skip: (source: string) => boolean = () => false, max = 16): Promise<SiteArtworkResult> {
  const result = await withGuardedPage(url, { width: 1280, height: 900, timeMs: 60_000, requests: 400, bytes: 40_000_000, deviceScaleFactor: 2 }, async ({ page, refused }) => {
    if (refused) return null;
    await page.waitForTimeout(1500);
    await scrollThrough(page);
    const candidates = (await page.evaluate(listCandidates)).filter(candidate => !candidate.src || !skip(candidate.src));
    const fonts = await page.evaluate(pageFonts);
    const artwork: SiteArtwork[] = [];
    const hashes = new Set<string>();
    let alone = false;
    for (const candidate of candidates) {
      if (artwork.length >= max) break;
      try {
        let body: Buffer, mimeType: SiteArtwork['mimeType'];
        const kind: SiteArtwork['kind'] = candidate.kind === 'svg' ? 'drawing' : 'photo';
        if (kind === 'drawing') {
          // Drawn alone on a transparent ground: everything else hidden and unpainted, so no page colour or text comes along.
          if (!alone) { await page.addStyleTag({ content: 'body *{visibility:hidden!important}html,body,body *:not([data-pagosya-show]){background:transparent!important;box-shadow:none!important}[data-pagosya-show],[data-pagosya-show] *{visibility:visible!important}' }); alone = true; }
          const target = page.locator(`[data-pagosya-art="${candidate.id}"]`);
          await target.evaluate(element => element.setAttribute('data-pagosya-show', ''));
          body = await target.screenshot({ type: 'png', omitBackground: true, timeout: 4000 }).finally(() => target.evaluate(element => element.removeAttribute('data-pagosya-show')).catch(() => undefined));
          mimeType = 'image/png';
        } else {
          const fetched = await readSourceReferenceResource(candidate.src, 'image', AbortSignal.timeout(8000), undefined, MAX_BYTES, GUARDED_USER_AGENT);
          const format = (await sharp(fetched.body).metadata()).format;
          body = format === 'png' || format === 'jpeg' || format === 'webp' ? fetched.body : await sharp(fetched.body).webp({ quality: 88 }).toBuffer();
          mimeType = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
        }
        const meta = await sharp(body).metadata();
        if (!meta.width || !meta.height || Math.max(meta.width, meta.height) < (kind === 'drawing' ? 112 : 400) || body.length > MAX_BYTES) continue;
        const hash = createHash('sha256').update(body).digest('hex');
        if (hashes.has(hash)) continue;
        hashes.add(hash);
        artwork.push({ body, mimeType, kind, alt: candidate.alt, source: candidate.src || `${url}#dibujo-${candidate.id}`, width: meta.width, height: meta.height, inHeader: candidate.inHeader });
      } catch { /* A picture that does not come through is skipped. */ }
    }
    const named = (name?: string) => name && !isGenericFamily(name) && !/^var\(|icons?/i.test(name) ? name : undefined;
    return { artwork, fonts: { display: named(fonts.display), text: named(fonts.text) } };
  });
  return result ?? { artwork: [], fonts: {} };
}
