/** Spec 2026-11-11 store composer: which library sections fit inside which template, and each template's proposed signature.
 *   cd apps/api && npx ts-node --transpile-only -P tsconfig.json scripts/section-fit.ts [--only merienda,shrine] [--shots <dir>]
 *  One demo store per template, holding its cover, then every candidate section once. Each `[data-lb]` block is measured at
 *  1280 and 390. No database, no API. Keeps the owner's `vetoed` and approved `signature`; rewrites `fit` and `proposed`.
 *  `--propose-only` skips the render and recomputes `proposed` from the templates' homes and the Esencial globals.css. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { templateManifest, templateSourceFiles, templatesDir } from '@pagosya/store-templates';
import { LIBRARY_CATALOG, type LayoutBlock } from '../src/storefront-source/source-section-library';
import { resolvePresetTemplate, templateDemoRevision } from '../src/storefront-source/source-templates';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';

const OUT = join(templatesDir, 'esencial', 'section-fit.json');
const LOUD = new Set(['cover-poster', 'cover-ribbon', 'statement-sticker']);
const PLAYFUL = /burbuja|neon|merienda|mimo|gumdrop|pancita|crocante|amigos|energia/;
const arg = (name: string) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : undefined; };
const sectionOf = (type: string) => LIBRARY_CATALOG.find(section => section.id === type);

type Measure = { type: string; height: number; overflow: boolean; broken: number; photos: number; lowContrast: number };

/** In the page: each library block's height, sideways spill, broken and shown images, and text too faint on a solid ground. */
function measureBlocks(): Measure[] {
  const luminance = (rgb: number[]) => { const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  // rgb()/rgba() only; a colour Chrome reports another way (oklab, color()) is not judged.
  const rgba = (value: string): number[] | null => { const m = /^rgba?\(([^)]+)\)$/.exec(value.trim()); if (!m) return null; const n = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return n.length >= 3 && n.every(Number.isFinite) ? [n[0], n[1], n[2], n[3] ?? 1] : null; };
  // The ground under a text: semi-transparent layers blended over the first opaque one; a photo or gradient ground is not judged.
  const ground = (el: Element | null): number[] | null => {
    const layers: number[][] = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null;
      const colour = rgba(style.backgroundColor);
      if (!colour) { if (style.backgroundColor !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(style.backgroundColor)) return null; continue; }
      if (colour[3] === 0) continue;
      layers.push(colour);
      if (colour[3] >= 0.99) break;
    }
    let base = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    return base;
  };
  // Content past the screen's edge that no ancestor clips (a marquee's track is clipped by its band, so it does not count).
  const clipped = (el: Element, stop: Element) => { for (let node = el.parentElement; node && node !== stop.parentElement; node = node.parentElement) if (/hidden|clip|auto|scroll/.test(getComputedStyle(node).overflowX)) return true; return false; };
  return Array.from(document.querySelectorAll('main > [data-lb]')).map(block => {
    const box = block.getBoundingClientRect();
    let low = 0;
    // A text drawn over a photo (<img>/<video> under it) is the model review's to judge, like a background image.
    const pictures = Array.from(block.querySelectorAll('img,video')).map(media => media.getBoundingClientRect()).filter(r => r.width > 40 && r.height > 40);
    const overPicture = (el: Element) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return pictures.some(p => x >= p.left && x <= p.right && y >= p.top && y <= p.bottom); };
    for (const el of Array.from(block.querySelectorAll('h1,h2,h3,p,a,button,li'))) {
      if (!el.textContent?.trim() || el.children.length > 2 || overPicture(el)) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.5) continue;
      const fg = rgba(style.color); const bg = ground(el);
      if (!fg || !bg || fg[3] < 0.5) continue;
      const [l1, l2] = [luminance(fg.slice(0, 3)), luminance(bg)].sort((x, y) => y - x);
      if ((l1 + 0.05) / (l2 + 0.05) < (parseFloat(style.fontSize) >= 24 ? 3 : 4.5)) low++;
    }
    const spill = Array.from(block.querySelectorAll('*')).some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2) && !clipped(el, block); });
    const images = Array.from(block.querySelectorAll('img'));
    return { type: block.getAttribute('data-lb') ?? '', height: Math.round(box.height), overflow: spill,
      broken: images.filter(img => img.complete && img.naturalWidth === 0 && img.getBoundingClientRect().width > 0).length,
      photos: images.filter(img => img.getBoundingClientRect().width > 40).length, lowContrast: low };
  });
}

/** Signature proposal: the cover (or, in a home with no cover and at least 4 sections, its opener — owner 2026-11-11), then up to 2
 *  own sections this template styles most in its own CSS (template-only ones count one more). Never a second cover, the main grid
 *  or a repeat. A short home with no cover (Foco) gets none and keeps fill mode. */
function proposeSignature(id: string, own: LayoutBlock[], css: string): string[] {
  const head = own.find(block => sectionOf(block.type)?.role === 'cover') ?? (own.length >= 4 ? own[0] : undefined);
  if (!head) return [];
  const themed = [...css.matchAll(new RegExp(`\\[data-es-theme="${id}"\\][^{]*`, 'g'))].map(match => match[0]).join(' ');
  const rest = own.filter(block => block.type !== head.type && !sectionOf(block.type)?.decor && sectionOf(block.type)?.role !== 'cover' && !['products-grid', 'products-tabs'].includes(block.type))
    .map(block => ({ type: block.type, score: (themed.match(new RegExp(`lb-${block.type.split('-')[0]}`, 'g')) ?? []).length + (sectionOf(block.type)?.templateOnly ? 1 : 0) }))
    .filter((entry, at, list) => list.findIndex(other => other.type === entry.type) === at).sort((a, b) => b.score - a.score);
  return [head.type, ...rest.slice(0, 2).filter(entry => entry.score > 0).map(entry => entry.type)];
}

(async () => {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const only = arg('--only')?.split(',');
  const shots = arg('--shots');
  const all = readdirSync(templatesDir).filter(id => existsSync(join(templatesDir, id, 'template.json')));
  const ids = all.filter(id => (templateManifest(id) as any)?.preset?.variants?.theme && (!only || only.includes(id)));
  // A sample of every section: its first appearance in any template's home, with that template's words.
  const samples = new Map<string, LayoutBlock>();
  for (const id of all) for (const block of ((templateManifest(id) as any)?.preset?.layout ?? []) as LayoutBlock[]) if (!samples.has(block.type)) samples.set(block.type, block);
  const fit: Record<string, string[]> = { ...(previous.fit ?? {}) };
  const proposed: Record<string, string[]> = { ...(previous.proposed ?? {}) };
  if (process.argv.includes('--propose-only')) {
    const css = readFileSync(join(templatesDir, 'esencial', 'styles', 'globals.css'), 'utf8');
    for (const id of ids) proposed[id] = proposeSignature(id, ((resolvePresetTemplate(templateManifest(id)!, templateManifest).preset as any)?.layout ?? []) as LayoutBlock[], css);
    writeFileSync(OUT, `${JSON.stringify({ ...previous, proposed }, null, 1)}\n`);
    for (const id of ids) console.log(`${id}: ${proposed[id].join(' + ') || '(fill mode)'}`);
    return;
  }
  for (const id of ids) {
    const resolved = resolvePresetTemplate(templateManifest(id)!, templateManifest);
    const preset = resolved.preset as any;
    const own: LayoutBlock[] = preset.layout ?? [];
    const slots = resolved.manifest.photos.map(photo => photo.slot);
    let next = 0;
    const slot = () => `slot:${slots[next++ % Math.max(1, slots.length)]}`;
    const restyle = (block: LayoutBlock): LayoutBlock => ({ ...block, ...(block.photo ? { photo: slot() } : {}), ...(block.photo2 ? { photo2: slot() } : {}),
      ...(block.items ? { items: block.items.map(item => (item.photo ? { ...item, photo: slot() } : item)) } : {}) });
    const calm = !PLAYFUL.test(id);
    const candidates = LIBRARY_CATALOG.filter(section => !section.decor && section.role !== 'cover' && samples.has(section.id) && !own.some(block => block.type === section.id))
      .filter(section => !(calm && LOUD.has(section.id))).map(section => restyle(samples.get(section.id)!));
    const cover = own.find(block => sectionOf(block.type)?.role === 'cover') ?? own[0];
    // A demo's globals.css carries the CSS of every section it draws and is capped at 180 000 characters: 8 candidates per demo.
    let css = '';
    const measured: Record<number, Measure[]> = { 1280: [], 390: [] };
    for (let start = 0; start < candidates.length; start += 5) {
      const batch = candidates.slice(start, start + 5);
      const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0,
        ...(await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.sourceId), { ...preset, layout: [cover, ...batch] }, (resolved as any).demo)) } as any);
      css ||= ((snapshot as any).files.find((file: any) => file.path === 'styles/globals.css')?.content ?? '') as string;
      for (const width of [1280, 390]) await withVisualSandbox(snapshot as any, '', undefined, false, async (context: any) => {
        {
          const page = await context.newPage();
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
          await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 30_000 });
          await page.evaluate(async () => { await (document as any).fonts.ready; for (const img of Array.from(document.images)) img.loading = 'eager'; });
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          for (let y = 0; y < height; y += 500) { await page.evaluate((v: number) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
          await page.waitForTimeout(800);
          measured[width].push(...((await page.evaluate(measureBlocks)) as Measure[]).filter((entry: Measure) => start === 0 || entry.type !== cover.type));
          // Gallery shots are desktop only; one cut short by the sandbox's 45 s limit is skipped, the measures above are kept.
          if (shots && width === 1280) {
            try {
              mkdirSync(join(shots, id), { recursive: true });
              const blocks = page.locator('main > [data-lb]');
              const count = await blocks.count();
              for (let i = 0; i < count; i++) {
                const type = await blocks.nth(i).getAttribute('data-lb');
                if (start > 0 && type === cover.type) continue;
                await blocks.nth(i).screenshot({ path: join(shots, id, `d-${type}.jpg`), type: 'jpeg', quality: 60, animations: 'disabled', timeout: 5000 }).catch(() => {});
              }
            } catch { /* the sandbox closed: no more shots for this batch */ }
          }
          await page.close().catch(() => {});
        }
      });
    }
    const needsPhoto = (type: string) => (sectionOf(type)?.needs.photos ?? 0) >= 1;
    // Strips and bars are short by design; every other section is at least 120 px tall.
    const why = (type: string) => [1280, 390].flatMap(width => {
      const m = (measured[width] ?? []).find(entry => entry.type === type);
      if (!m) return [`${width}: not drawn`];
      const least = sectionOf(type)?.role === 'strip' || /marquee|bar-note|countdown/.test(type) ? 24 : 120;
      return [m.height < least || m.height > 3000 ? `${width}: height ${m.height}` : '', m.overflow ? `${width}: spills sideways` : '', m.broken ? `${width}: ${m.broken} broken images` : '',
        m.lowContrast ? `${width}: ${m.lowContrast} faint texts` : '', needsPhoto(type) && !m.photos ? `${width}: no photo` : ''].filter(Boolean);
    });
    const passes = (type: string) => !why(type).length;
    if (process.env.FIT_DEBUG) for (const block of candidates) if (!passes(block.type)) console.log(`  refused ${block.type}: ${why(block.type).join('; ')}`);
    fit[id] = [...new Set([...own.map(block => block.type), ...candidates.map(block => block.type).filter(passes)])];
    proposed[id] = proposeSignature(id, own, css);
    console.log(`${id}: ${fit[id].length} fit (${candidates.length} tried), signature ${proposed[id].join(' + ')}`);
  }
  writeFileSync(OUT, `${JSON.stringify({ fit, signature: previous.signature ?? {}, proposed, vetoed: previous.vetoed ?? {} }, null, 1)}\n`);
  console.log('wrote', OUT);
})().catch(error => { console.error(error); process.exitCode = 1; });
