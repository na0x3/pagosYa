/* Template stores' check (owner 2026-11-02: «check and log»): the page rules the section-library live checks used since 2026-10-31,
 * run on each new template home after it is saved and only written to the product log — never sent to YAPI as a task.
 * Copied from .superpowers/sdd/2026-10-31-section-library/qa-checks.ts (the home writer keeps its own, gentler, rules). */

/** One finding: a stable rule id, the home section it sits in (the library's data-lb-at, null when it is the page's), and the line
 *  the log has always carried (it starts with BLOQUEA: or CONSEJO:). Spec 2026-11-13 fill review: the section is what a correction
 *  aims at. */
/** `part` (owner 2026-11-14, faster V2 fixes): the finding's top-level block of <main> by its order (0 = first), so a fix can rewrite
 *  only that section of a written home; null for a finding of the whole page or the footer. */
export type TemplateRuleFinding = { rule: string; at: number | null; severity: 'block' | 'advice'; line: string; part?: number | null };

/** Runs in the page (page.evaluate): no imports, no closures. */
export function evaluateTemplateRules(): TemplateRuleFinding[] {
  const out: TemplateRuleFinding[] = [];
  const sectionOf = (el: Element | null | undefined) => { const at = el?.closest('[data-lb-at]')?.getAttribute('data-lb-at'); return at && /^\d+$/.test(at) ? Number(at) : null; };
  const main = document.querySelector('main') || document.body;
  const partOf = (el: Element | null | undefined) => { let node: Element | null = el ?? null; while (node && node.parentElement !== main) node = node.parentElement; return node ? Array.from(main.children).indexOf(node) : null; };
  const push = (rule: string, el: Element | null | undefined, line: string) => { out.push({ rule, at: sectionOf(el), part: partOf(el), severity: line.startsWith('BLOQUEA:') ? 'block' : 'advice', line }); };
  const productish = '[data-product-id],[data-pagosya-product],[data-pagosya-catalog],[data-pagosya-spotlight],.menu-item,[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel,.lb-names';
  const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 40 && r.height > 40 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
  // color-mix() computes to «color(srgb r g b / a)» with 0–1 channels: scale them like rgb() (rhode live 2026-10-31 false alarms).
  const rgb = (value: string) => { const n = (value.match(/[\d.]+/g) || []).map(Number); return /^color\(srgb/.test(value) ? n.map((v, i) => i < 3 ? v * 255 : v) : n; };
  const lum = (c: number[]) => [c[0], c[1], c[2]].map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  // A band's colour: its background, or the colour of a full-bleed border-image gradient (how Esencial paints its bands).
  const paint = (el: Element): number[] => {
    const style = getComputedStyle(el);
    const bg = rgb(style.backgroundColor);
    if (bg.length >= 3 && !(bg.length > 3 && bg[3] < 0.5)) return bg;
    const image = /rgba?\([^)]*\)/.exec(style.borderImageSource || '');
    const fill = image ? rgb(image[0]) : [];
    return fill.length >= 3 && !(fill.length > 3 && fill[3] < 0.5) ? fill : [];
  };
  const photos = Array.from(main.querySelectorAll('img,video')).filter(el => visible(el) && !el.closest(productish) && !el.closest('header,footer'));

  // A band painted near-black (neutral and dark) that carries only words: owner rule 2026-10-22. Brand colours pass.
  for (const band of Array.from(main.children)) {
    if (!visible(band) || band.matches(productish)) continue;
    const bg = paint(band);
    if (bg.length < 3) continue;
    const neutral = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) < 24;
    const words = (band.textContent || '').trim();
    if (neutral && lum(bg) < 0.05 && !band.querySelector('img,video,picture') && words) push('dark-text-band', band, `BLOQUEA: Banda oscura solo con texto («${words.slice(0, 40)}»). Dale una foto real, un fondo claro o el color de la marca.`);
    // Owner 2026-10-31 (rhode «Elige por sabor», closing band): a dark brand colour carrying only words is the same wall of text.
    // An FAQ, a form or a table is not words alone, nor the template's closing call: one short line and its button.
    else if (lum(bg) < 0.1 && words && !band.querySelector(`img,video,picture,details,table,form,${productish}`)
      && !(band.querySelector('a,button') && words.length - Array.from(band.querySelectorAll('a,button')).reduce((sum, el) => sum + (el.textContent || '').trim().length, 0) <= 90)) push('dark-colour-text-band', band, `BLOQUEA: Banda de color oscuro solo con texto («${words.slice(0, 40)}»). Ponle una foto real o productos al lado, o pásala a un fondo claro con una foto.`);
  }
  // Owner 2026-10-29 (DooBoo «Sabores para descubrir»): no section of only words on a light background either. The cover, FAQ
  // accordions, tables, forms, the store's articles and anything with products or photos are not that.
  const bands = Array.from(main.children).filter(visible);
  for (const band of bands.slice(1)) {
    if (band.matches(productish) || band.querySelector(`img,video,picture,details,table,form,[data-pagosya-blog],${productish}`)) continue;
    const words = (band.textContent || '').trim();
    // «Blank»: the band shows the page's own background (transparent, or painted the same colour as the page).
    const bg = paint(band);
    const page = rgb(getComputedStyle(document.body).backgroundColor);
    const blank = bg.length < 3 || (page.length >= 3 && [0, 1, 2].every(i => Math.abs(bg[i] - page[i]) < 6));
    if (words && blank) push('text-only-band', band, `BLOQUEA: Sección de solo texto sobre fondo liso («${words.slice(0, 40)}»). Dale una foto real a su lado o muestra los productos (data-pagosya-catalog data-products="Nombre|Nombre"); si no queda una foto libre, quítala.`);
  }
  // Owner 2026-11-14 («no sections like these also with just picture», V2 NOA: a band that was one huge photo on a dark ground): a
  // section after the cover that is a photo and nothing to read. Products, carousels and marquees are not that.
  for (const band of bands.slice(1)) {
    if (band.matches(productish) || band.querySelector(productish)) continue;
    const media = Array.from(band.querySelectorAll('img,video,picture')).filter(visible);
    const words = (band.textContent || '').replace(/\s+/g, ' ').trim();
    if (media.length && words.length < 12 && (band as HTMLElement).getBoundingClientRect().height > 280) push('photo-only-band', band, `BLOQUEA: Sección de solo foto${words ? ` («${words}»)` : ''}: una foto sola no dice nada. Dale un título y una línea de texto al lado o encima, o quítala.`);
  }
  // Live check 2026-10-30 (BOXY eajm1flt): a template class painted the cover title white on the light paper and nothing caught
  // it. Words must read on what is really behind them; words over a photo are left to the eye.
  // Nothing painted up to the root: the browser's white canvas.
  const behind = (el: Element): number[] => { for (let node: Element | null = el; node; node = node.parentElement) { const fill = paint(node); if (fill.length >= 3) return fill; } return [255, 255, 255]; };
  const overPhoto = (el: Element) => { const r = el.getBoundingClientRect(); const section = el.closest('section') ?? main;
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) if (getComputedStyle(node).backgroundImage !== 'none') return true;
    return Array.from(section.querySelectorAll('img,video,picture')).some(media => { const m = media.getBoundingClientRect(); return m.width > 40 && m.left < r.right && m.right > r.left && m.top < r.bottom && m.bottom > r.top; }); };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const el of Array.from(document.querySelectorAll('main h1, main h2, main p, footer h2, footer p'))) {
    const words = (el.textContent || '').trim();
    const r = el.getBoundingClientRect();
    if (!words || r.width < 20 || r.height < 8 || el.closest(productish) || getComputedStyle(el).visibility === 'hidden' || overPhoto(el)) continue;
    const colour = rgb(getComputedStyle(el).color);
    if (colour.length >= 3 && ratio(colour, behind(el)) < 2.2) push('low-contrast', el, `BLOQUEA: Texto que no se lee sobre su fondo («${words.slice(0, 40)}»): dale un color de texto que contraste (var(--es-ink) sobre fondo claro) o pon un fondo de marca detrás.`);
  }
  // Live check 2026-10-30 (Oh Belly hnqosmrt: «BURBUJA / S PARA», «Prebiót / icos»): a big title in a narrow box wraps inside a word.
  // Rhode 2026-10-31: the phone's cover button read «VER LA COLECCIÓ / N» — buttons, links and list items count too.
  const broken = new Set<string>();
  let brokenAt: Element | null = null;
  // Owner 2026-11-14 (Meat House V2 r5: «HOR/AS», «SOPO/CACH/I» in a facts band of <strong> and <span>): every text on the page counts.
  for (const el of Array.from(document.querySelectorAll('main, footer'))) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: node => (node.parentElement?.closest(productish) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let node = walker.nextNode(); node && broken.size < 3; node = walker.nextNode()) {
      const text = node.textContent || '';
      for (const match of text.matchAll(/[\p{L}\p{N}]{4,}/gu)) {
        const range = document.createRange();
        range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
        const tops = new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top)));
        if (tops.size > 1) { broken.add(match[0]); brokenAt = brokenAt ?? node.parentElement ?? el; }
      }
    }
  }
  if (broken.size) push('broken-words', brokenAt, `BLOQUEA: Palabras cortadas a la mitad (${[...broken].map(word => `«${word}»`).join(', ')}): el texto es más ancho que su caja. Baja el tamaño o dale más ancho.`);
  // Owner 2026-10-24 («a blank screen»): a store with photos never opens on words alone (live check 2026-10-30, Oh Belly ujy3rqxr).
  const cover = bands[0];
  const pictured = (el: Element) => Boolean(el.querySelector(`img,video,picture,[data-pagosya-catalog],[data-pagosya-spotlight]`)) || [el, ...Array.from(el.querySelectorAll('*'))].some(node => getComputedStyle(node).backgroundImage.includes('url('));
  if (cover && photos.length && !pictured(cover)) push('text-only-cover', cover, 'BLOQUEA: La portada es solo texto y la tienda tiene fotos. Pon una foto o un producto en la portada, junto al titular o detrás de él.');
  // Live check 2026-10-30 (Oh Belly ujy3rqxr): the cover's video sat in a column below the fold, so the first screen showed words only.
  const media = Array.from(main.querySelectorAll('img,video,picture'));
  const seenFirst = media.some(el => { const r = el.getBoundingClientRect(); return r.width > 80 && r.height > 80 && r.top < window.innerHeight && r.bottom > 0; })
    || [cover, ...Array.from(cover?.querySelectorAll('*') ?? [])].some(node => node && getComputedStyle(node).backgroundImage.includes('url(') && node.getBoundingClientRect().top < window.innerHeight);
  if (cover && media.length && pictured(cover) && !seenFirst) push('no-photo-first-screen', cover, 'BLOQUEA: En la primera pantalla no se ve ninguna foto ni video: la foto de la portada quedó más abajo. Ponla al lado del titular o detrás, visible sin bajar.');
  // Each photo once.
  const seen = new Map<string, number>();
  const second = new Map<string, Element>();
  for (const el of photos) { const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || ''; if (!src) continue; const n = (seen.get(src) || 0) + 1; seen.set(src, n); if (n === 2) second.set(src, el); }
  for (const [src, count] of seen) if (count > 1) push('repeated-photo', second.get(src), `BLOQUEA: La misma foto aparece dos veces: ${(src.split('/').pop() || src).slice(0, 60)}. Usa cada foto una sola vez.`);
  // Three or more photos side by side in one container: owner rule 2026-10-15.
  const counts = new Map<Element, number>();
  for (const el of photos) { const parent = (el.closest('figure') ?? el).parentElement; if (parent) counts.set(parent, (counts.get(parent) || 0) + 1); }
  const group = [...counts].find(([, count]) => count >= 3)?.[0];
  if (group) push('photo-group', group, 'BLOQUEA: Hay un grupo de 3 fotos o más juntas. Deja como máximo dos fotos juntas.');
  // The home shows products.
  if (!main.querySelector('[data-pagosya-catalog],[data-product-id],[data-pagosya-product],[data-pagosya-spotlight],a[href*="product.html"]')) push('no-products', null, 'BLOQUEA: La portada no muestra ningún producto. Incluye la grilla de productos (data-pagosya-catalog).');

  // Owner 2026-10-31, rhode bqgpx4jx rev 3 («there should be no errors»): what the checks above let through.
  const scope = Array.from(document.querySelectorAll('main, footer'));
  const shown = (el: Element) => { for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) { const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05 || s.position === 'fixed') return false; } return true; };
  const sized = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && shown(el); };
  const quote = (el: Element) => `«${(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}»`;
  // Words laid over other words (rhode: «jugoso.» ran into the line under it). A text box is the font's whole height, so a small
  // label above a tight title would always «touch» it: the letters' own ink (canvas measureText) is compared instead.
  // The capture can land mid-entrance (rhode's subtitle was still 8 px low and faded): words are measured where they come to rest.
  for (const animation of document.getAnimations()) { try { if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish(); } catch { /* still playing */ } }
  const pen = document.createElement('canvas').getContext('2d');
  const lines: Array<{ owner: Element; left: number; right: number; top: number; bottom: number }> = [];
  for (const root of pen ? scope : []) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const owner = node.parentElement, text = (node.textContent || '').trim();
      if (!owner || !text || owner.closest(`${productish},details:not([open]),[aria-hidden="true"],.ui-sr,.lb-visually-hidden`) || !shown(owner)) continue;
      const s = getComputedStyle(owner);
      pen!.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const ink = pen!.measureText(text);
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 4 || r.height < 4) continue;
        // The box's top is the font's ascent above the baseline; the ink reaches the letters' own ascent and descent.
        const baseline = r.top + ink.fontBoundingBoxAscent * r.height / (ink.fontBoundingBoxAscent + ink.fontBoundingBoxDescent || r.height);
        lines.push({ owner, left: r.left, right: r.right, top: baseline - ink.actualBoundingBoxAscent, bottom: baseline + ink.actualBoundingBoxDescent });
      }
    }
  }
  const crossed = new Set<string>();
  let crossedAt: Element | null = null;
  for (let i = 0; i < lines.length && crossed.size < 3; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (a.owner === b.owner || a.owner.contains(b.owner) || b.owner.contains(a.owner)) continue;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 12 && h > 2) { crossed.add(`${quote(a.owner)} con ${quote(b.owner)}`); crossedAt = crossedAt ?? b.owner; break; }
  }
  if (crossed.size) push('overlapping-text', crossedAt, `BLOQUEA: Textos encimados (${[...crossed].join('; ')}): un texto pisa al otro. Dale al titular un interlineado de 0.95 o más y margen debajo (marginBottom), o sepáralos.`);
  // Owner 2026-11-14 («meathouse is all messed up»): a giant decorative word (aria-hidden) laid over the real title; big words a photo
  // covers («HOUS»); words cut off by their own box («ASADO1»). Advice for templates (a ghost word behind text can be drawn on purpose
  // there); V2 free mode blocks on them (v2-run FREE_BLOCKERS).
  const decor: typeof lines = [];
  const covered = new Set<string>(); let coveredAt: Element | null = null;
  const cut = new Set<string>(); let cutAt: Element | null = null;
  const big: Array<{ owner: Element; node: Node }> = [];
  const moving = '[class*="marquee" i],[class*="ticker" i],[class*="velocity" i],[class*="carousel" i],[class*="slider" i],[class*="rail" i]';
  for (const root of scope) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const owner = node.parentElement, text = (node.textContent || '').trim();
      if (!owner || !text || owner.closest(`${productish},${moving},details:not([open]),.ui-sr,.lb-visually-hidden`) || !shown(owner)) continue;
      const style = getComputedStyle(owner), size = parseFloat(style.fontSize);
      const range = document.createRange(); range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter(r => r.width >= 4 && r.height >= 4);
      if (owner.closest('[aria-hidden="true"]') && size >= 48) for (const r of rects) decor.push({ owner, left: r.left, right: r.right, top: r.top + r.height * .2, bottom: r.bottom - r.height * .2 });
      if (size >= 40) big.push({ owner, node });
      // Words cut off sideways by a box that hides what overflows (line clamps and ellipses are meant to cut).
      if (cut.size >= 3 || style.textOverflow === 'ellipsis' || !['none', ''].includes((style as unknown as Record<string, string>).webkitLineClamp ?? 'none')) continue;
      let boxEl: Element | null = owner.parentElement;
      for (; boxEl && boxEl !== document.body; boxEl = boxEl.parentElement) { const o = getComputedStyle(boxEl); if (/hidden|clip/.test(o.overflowX)) break; }
      const ownOverflow = /hidden|clip/.test(style.overflowX) ? owner : null;
      const clipper = ownOverflow ?? (boxEl && boxEl !== document.body ? boxEl : null);
      if (!clipper) continue;
      const edge = clipper.getBoundingClientRect();
      // A label hidden for screen readers (1 px clipped box) and a strip that moves on its own (a running animation between the words
      // and their box) cut on purpose.
      if (edge.width < 4 || edge.height < 4) continue;
      let animated = false;
      for (let el: Element | null = owner; el && !animated; el = el === clipper ? null : el.parentElement) animated = el.getAnimations().some(animation => animation.playState === 'running');
      if (animated) continue;
      if (ownOverflow ? owner.scrollWidth > owner.clientWidth + 8 : rects.some(r => r.right > edge.right + 8 || r.left < edge.left - 8)) { cut.add(quote(owner)); cutAt = cutAt ?? owner; }
    }
  }
  // Overlaps are measured first, at the scroll the other lines were measured at; then each big line is brought on screen and a photo
  // drawn over it is sampled across the line.
  const real = lines.filter(line => line.bottom - line.top > 4);
  const over = decor.find(d => real.some(line => !d.owner.contains(line.owner) && Math.min(d.right, line.right) - Math.max(d.left, line.left) > 12 && Math.min(d.bottom, line.bottom) - Math.max(d.top, line.top) > 4));
  const start = window.scrollY;
  for (const { owner, node } of big) {
    if (covered.size >= 3) break;
    const range = document.createRange(); range.selectNodeContents(node);
    for (const first of Array.from(range.getClientRects()).filter(r => r.width >= 4 && r.height >= 4)) {
      window.scrollTo(0, Math.max(0, window.scrollY + first.top - 100));
      const r = Array.from(range.getClientRects()).find(rect => Math.abs(rect.left - first.left) < 1 && Math.abs(rect.width - first.width) < 1) ?? first;
      const y = r.top + r.height / 2;
      const hits = [.15, .35, .5, .65, .85].map(f => document.elementFromPoint(r.left + r.width * f, y)).filter((hit): hit is Element => Boolean(hit));
      if (hits.filter(hit => !owner.contains(hit) && !hit.contains(owner) && hit.closest('img,picture,video,figure')).length >= 2) { covered.add(quote(owner)); coveredAt = coveredAt ?? owner; break; }
    }
  }
  window.scrollTo(0, start);
  if (over) push('decor-over-text', over.owner, `CONSEJO: La palabra decorativa ${quote(over.owner)} queda encima de textos de verdad: muévela a su propio espacio o deja el texto fuera de ella.`);
  if (covered.size) push('covered-text', coveredAt, `CONSEJO: Una foto tapa letras grandes (${[...covered].join('; ')}): el texto tiene que verse entero; dale su propio espacio o ponlo encima de la foto.`);
  // Owner 2026-11-14 («sections still look empty»): a section with a big empty block — at least 30% of its width, 300 px tall and 22% of
  // its area — or mostly blank paper (under 27% drawn on with a 28% hole). Measured on desktop on what is drawn: photos, videos, words,
  // buttons and the commerce parts, on a 24-column grid. Calibrated 2026-11-14: V2 Gramiyaa (owner «i like a lot») passes; the
  // sections the owner called empty on NOA and Meat House r4 do not.
  const thin: string[] = []; let thinAt: Element | null = null;
  for (const section of window.innerWidth >= 1000 ? Array.from(main.children) : []) {
    const box = section.getBoundingClientRect();
    if (box.height < 320 || box.width < 300 || thin.length >= 3) continue;
    const parts: DOMRect[] = [];
    for (const el of Array.from(section.querySelectorAll('img,video,picture,svg,canvas,button,input,[data-pagosya-catalog] > *,[data-pagosya-spotlight] > *'))) {
      const r = el.getBoundingClientRect();
      if (r.width >= 24 && r.height >= 16 && shown(el)) parts.push(r);
    }
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent || '').trim() || !node.parentElement || !shown(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) if (r.width >= 4 && r.height >= 4) parts.push(r);
    }
    if (!parts.length) continue;
    const cols = 24, rows = Math.max(6, Math.round(24 * box.height / box.width)), cellW = box.width / cols, cellH = box.height / rows;
    const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (const r of parts) for (let x = Math.max(0, Math.floor((r.left - box.left) / cellW)); x <= Math.min(cols - 1, Math.floor((r.right - box.left - 1) / cellW)); x++)
      for (let y = Math.max(0, Math.floor((r.top - box.top) / cellH)); y <= Math.min(rows - 1, Math.floor((r.bottom - box.top - 1) / cellH)); y++) grid[y][x] = 1;
    const used = grid.flat().filter(Boolean).length / (cols * rows);
    // The largest empty rectangle (row by row, the empty run above each column as a histogram).
    const run = new Array<number>(cols).fill(0); let hole = 0, holeW = 0, holeH = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) run[x] = grid[y][x] ? 0 : run[x] + 1;
      const stack: number[] = [];
      for (let x = 0; x <= cols; x++) {
        const height = x < cols ? run[x] : 0;
        while (stack.length && run[stack[stack.length - 1]] >= height) {
          const top = stack.pop()!, width = stack.length ? x - stack[stack.length - 1] - 1 : x;
          if (run[top] * width > hole) { hole = run[top] * width; holeW = width; holeH = run[top]; }
        }
        stack.push(x);
      }
    }
    const share = hole / (cols * rows);
    if ((holeW / cols >= .3 && holeH * cellH >= 300 && share >= .22) || (used < .27 && share >= .28)) {
      thin.push(`${quote(section.querySelector('h1,h2,h3') ?? section)}: un hueco vacío de ${Math.round(holeW / cols * 100)}% del ancho y ${Math.round(holeH * cellH)} px de alto`);
      thinAt = thinAt ?? section;
    }
  }
  // Owner 2026-11-14 («hero from both are not good»; the bar is V2 Gramiyaa and the structured heroes of 2026-11-14): on a desktop
  // the first screen holds the page's promise — a big headline, a button and a big real photo, whole — and nothing else competes with
  // it (no product card laid over it, no headline split around the photo).
  if (window.innerWidth >= 1000) {
    const hero = Array.from(main.children).find(child => child.getBoundingClientRect().height > 40);
    const fold = window.innerHeight, weak: string[] = [];
    if (hero) {
      const title = hero.querySelector('h1');
      const t = title?.getBoundingClientRect();
      if (!title || !t || t.bottom > fold || parseFloat(getComputedStyle(title).fontSize) < 40) weak.push('el titular grande no está entero en la primera pantalla');
      const button = Array.from(hero.querySelectorAll('a,button')).find(el => { const r = el.getBoundingClientRect(); return r.width >= 80 && r.height >= 32 && r.bottom <= fold && shown(el); });
      if (!button) weak.push('no hay un botón visible en la primera pantalla');
      const photos = Array.from(hero.querySelectorAll('img,video')).map(el => el.getBoundingClientRect()).filter(r => r.width > 0);
      const big = photos.find(r => r.width >= window.innerWidth * .35 && Math.min(r.bottom, fold) - Math.max(r.top, 0) >= fold * .45);
      if (!big) weak.push('falta una foto grande y entera en la primera pantalla');
      else if (big.top < -2 || big.bottom > fold + 200) weak.push('la foto principal queda cortada por arriba o se va muy abajo');
      if (hero.querySelector('[data-pagosya-spotlight],[data-pagosya-catalog],.menu-item')) weak.push('hay una tarjeta de producto dentro de la portada');
      if (t && big && t.width < window.innerWidth * .2 && Math.min(t.bottom, big.bottom) - Math.max(t.top, big.top) > 0) weak.push('el titular queda partido o aplastado junto a la foto');
      // NOA V2 r5: «NOA» left of the photo, «VARGAS» right of it — a name split around the photo (a decorative copy counts too).
      const split = Array.from(hero.querySelectorAll('h1,[aria-hidden="true"]')).map(el => el.getBoundingClientRect()).find(r => big && r.left < big.left - 8 && r.right > big.right + 8 && Math.min(r.bottom, big.bottom) - Math.max(r.top, big.top) > 20 && r.height < big.height);
      if (split) weak.push('el nombre o el titular queda partido a los dos lados de la foto');
    }
    if (weak.length) push('weak-hero', hero ?? null, `CONSEJO: La portada no se arma bien (${weak.join('; ')}). Úsala como en las tiendas buenas: foto a todo el ancho con el titular y los botones encima, o titular grande a un lado y una foto grande y entera al otro; uno o dos botones; nada más compitiendo.`);
  }
  // Owner 2026-11-12 + 2026-11-14 («it still displays huge pictures and that's something i do not want»): on a desktop a photo stays
  // medium — at most ~820 px tall, ~760 px wide unless it is a band of 520 px or less, and under 500 000 px². Calibrated on V2 Gramiyaa
  // (largest 685×685 and 439×780: passes); NOA r5 (1198×1597) and Meat House r5 (736×920) do not. Product cards are the platform's.
  if (window.innerWidth >= 1000) {
    const huge = Array.from(main.querySelectorAll('img,video')).filter(el => !el.closest(productish) && shown(el)).map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 820 || (r.width > 760 && r.height > 520) || (r.width <= 760 && r.width * r.height > 500_000));
    if (huge.length) push('huge-photo', huge[0].el, `CONSEJO: Fotos demasiado grandes (${huge.slice(0, 3).map(({ r }) => `${Math.round(r.width)}×${Math.round(r.height)} px`).join(', ')}): en escritorio una foto mide como mucho unos 720 px de ancho y 780 de alto, y una banda a todo el ancho 480 px de alto. Achícala y deja que la letra y la composición hagan el trabajo.`);
  }
  // Owner 2026-11-15 (DooBoo r10): a photo with words (marked data-pagosya-words by the V2 repairs) is never cropped; the arithmetic
  // is v2-words.ts cropShare, repeated here because rules run inside the page.
  const croppedWords = Array.from(document.querySelectorAll('main img[data-pagosya-words]')).map(el => {
    const img = el as HTMLImageElement, r = img.getBoundingClientRect(), fit = getComputedStyle(img).objectFit;
    const scale = Math.max(r.width / (img.naturalWidth || 1), r.height / (img.naturalHeight || 1));
    const share = fit === 'cover' && img.naturalWidth && img.naturalHeight ? 1 - (r.width * r.height) / (img.naturalWidth * scale * img.naturalHeight * scale) : 0;
    return { img, share };
  }).filter(({ share }) => share > 0.06);
  if (croppedWords.length) push('cropped-words', croppedWords[0].img, `BLOQUEA: Una foto con letras quedó cortada (${(croppedWords[0].img.getAttribute('src') || '').split('/').pop()}): muéstrala entera — en su propio formato (aspect-ratio de la foto) o con objectFit: 'contain' sobre un fondo de la paleta.`);
  // Owner 2026-11-14 («sometimes it's too white»): a home that is mostly pale paper — five light sections in a row, or more than 70% of
  // them light. Calibrated: V2 Gramiyaa r3 (liked; longest light run 4, 64% light) passes; Gramiyaa r5 (10 light in a row) and NOA r6
  // (77% light) do not; Meat House r7 (dark, red and light bands) passes.
  if (window.innerWidth >= 1000) {
    const ground = (el: Element) => { for (let node: Element | null = el; node; node = node.parentElement) { const c = rgb(getComputedStyle(node).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > .5)) return c; } return [255, 255, 255]; };
    const blocks = Array.from(main.children).filter(child => child.getBoundingClientRect().height > 200);
    const light = blocks.map(block => { const [r, g, b] = ground(block); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > .82; });
    let run = 0, longest = 0, end = -1;
    light.forEach((pale, at) => { run = pale ? run + 1 : 0; if (run > longest) { longest = run; end = at; } });
    const share = light.filter(Boolean).length / Math.max(1, blocks.length);
    if (blocks.length >= 5 && (longest >= 5 || share > .7)) push('pale-page', blocks[Math.max(0, end - Math.floor(longest / 2))], `CONSEJO: La portada se ve demasiado blanca (${longest} secciones claras seguidas, ${Math.round(share * 100)}% claras): pon varias secciones sobre los colores de la paleta — un tinte de la marca, su color fuerte, una banda oscura — y nunca más de 4 claras seguidas.`);
  }
  if (thin.length) push('empty-section', thinAt, `CONSEJO: Secciones que se ven vacías (${thin.join('; ')}): llena ese hueco — una foto grande, la retícula a todo el ancho, o el contenido centrado y más grande; nunca una tarjeta sola o tres tarjetas chicas en medio ancho.`);
  if (cut.size) push('clipped-text', cutAt, `CONSEJO: Texto cortado por su caja (${[...cut].join('; ')}): baja su tamaño con clamp() o dale el ancho que necesita.`);
  // On the phone a title squeezed into a column beside a photo (rhode: «Un / toque / jugoso.» in 147 px next to the photo).
  if (window.innerWidth < 600) {
    const squeezed = Array.from(main.querySelectorAll('h1, h2')).filter(h => {
      if (h.closest(productish) || parseFloat(getComputedStyle(h).fontSize) < 28 || !sized(h)) return false;
      const r = h.getBoundingClientRect(), section = h.closest('section') ?? main;
      return Array.from(section.querySelectorAll('img,video,picture')).some(media => { const m = media.getBoundingClientRect();
        return m.width > 80 && Math.min(m.bottom, r.bottom) - Math.max(m.top, r.top) > 0.4 * r.height && (m.left >= r.right - 4 || m.right <= r.left + 4); });
    });
    if (squeezed.length) push('phone-squeezed-title', squeezed[0], `BLOQUEA: En el celular el título ${quote(squeezed[0])} queda apretado en una columna junto a una foto. Usa gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' para que en el teléfono la foto quede arriba o abajo del texto.`);
  }
  // A sticker that sits on nothing (rhode: «limón» hung under the photo in its own row). It belongs on a photo or by the title.
  for (const sticker of Array.from(main.querySelectorAll('.ui-sticker')).filter(visible)) {
    const s = sticker.getBoundingClientRect();
    const touches = Array.from(main.querySelectorAll('img,video,picture,h1,h2')).some(el => { const r = el.getBoundingClientRect();
      const w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top); return w > 0 && h > 0 && w * h >= 0.25 * s.width * s.height; });
    if (!touches) { push('loose-sticker', sticker, `BLOQUEA: El Sticker ${quote(sticker)} quedó suelto, sin tocar una foto ni el titular. Ponlo encima de la foto: <Sticker style={{ position: 'absolute', top: '1rem', right: '1rem' }}> dentro de un contenedor con position: 'relative'.`); break; }
  }
  // Two big titles one right under the other (rhode: a <Statement> line and then «¿Qué son los péptidos?»).
  const titles = Array.from(main.querySelectorAll('*')).filter(el => {
    if (el.closest(productish) || !sized(el) || !(el.textContent || '').trim() || /^(inline|contents)$/.test(getComputedStyle(el).display)) return false;
    if (parseFloat(getComputedStyle(el).fontSize) < 30) return false;
    const parent = el.parentElement;
    return !parent || parent === main || parseFloat(getComputedStyle(parent).fontSize) < 30;
  }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  for (let i = 1; i < titles.length; i++) {
    const a = titles[i - 1].getBoundingClientRect(), b = titles[i].getBoundingClientRect();
    const size = Math.min(parseFloat(getComputedStyle(titles[i - 1]).fontSize), parseFloat(getComputedStyle(titles[i]).fontSize));
    const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (b.top - a.bottom < 0.6 * size && across > 0.5 * Math.min(a.width, b.width)) { push('stacked-titles', titles[i], `BLOQUEA: Dos títulos grandes seguidos (${quote(titles[i - 1])} y ${quote(titles[i])}). Deja uno solo por sección; el otro pásalo a texto normal o quítalo.`); break; }
  }
  // A paragraph given its own box of colour (rhode: a cream box on the pink band). FAQ answers keep their cards.
  const boxed = Array.from(main.querySelectorAll('p')).find(p => {
    if (p.closest(`${productish},details,a,button,label`) || !sized(p) || p.getBoundingClientRect().width < 200) return false;
    const own = paint(p); if (own.length < 3) return false;
    const under = p.parentElement ? behind(p.parentElement) : [255, 255, 255];
    return [0, 1, 2].some(i => Math.abs(own[i] - under[i]) > 10);
  });
  if (boxed) push('boxed-paragraph', boxed, `BLOQUEA: El párrafo ${quote(boxed)} tiene su propia caja de color. Quítale el background; si no se lee, dale color: 'var(--es-ink)'.`);
  // Words that dodge what they promise (rhode: «Peptide aparece en el nombre… Revisa cada ficha»).
  const dodge = /\b(?:revisa|consulta|mira) (?:cada|la|las|su|sus) fichas?\b|\baparece en el nombre\b|\bconocer sus detalles\b/i;
  const dodged = Array.from(main.querySelectorAll('p, li, h2, h3')).find(el => !el.closest(productish) && dodge.test(el.textContent || ''));
  if (dodged) push('dodging-words', dodged, `BLOQUEA: El texto ${quote(dodged)} esquiva la pregunta y manda al comprador a otra parte. Responde con lo que se sabe en general de ese tipo de producto (sin inventar datos, precios ni promesas de la tienda) o quita la pregunta.`);
  // Titles in another letter than the store's titles (rhode: the footer's «Dulce. Jugosa. Tuya.» in the body sans, heavy).
  const family = (el: Element) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const lead = main.querySelector('h1');
  if (lead) {
    const odd = Array.from(document.querySelectorAll('main h2, main h3, footer h2, footer h3')).find(el => !el.closest(productish) && sized(el) && parseFloat(getComputedStyle(el).fontSize) >= 28 && family(el) !== family(lead));
    if (odd) push('off-font-title', odd, `BLOQUEA: El título ${quote(odd)} usa otra letra (${getComputedStyle(odd).fontFamily.split(',')[0]}) que el titular (${getComputedStyle(lead).fontFamily.split(',')[0]}). Todos los títulos grandes van en la letra de los titulares: quita su fontFamily y su fontWeight.`);
  }
  // A product's photo used again outside the grid while the store still has photos nobody sees (rhode: the cover = the first card).
  const assets = (() => { try { const req = new XMLHttpRequest(); req.open('GET', 'visual-assets.json', false); req.send(); return req.status === 200 ? (JSON.parse(req.responseText).assets || []).map((asset: { path: string }) => asset.path) as string[] : []; } catch { return [] as string[]; } })();
  const path = (el: Element) => { try { return new URL((el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || '').pathname.replace(/^\//, ''); } catch { return ''; } };
  const everyImage = Array.from(document.querySelectorAll('main img, main video, footer img, footer video'));
  const inGrid = new Set(everyImage.filter(el => el.closest(productish)).map(path).filter(Boolean));
  const used = new Set(everyImage.map(path).filter(Boolean));
  const free = assets.filter(asset => /\.(?:jpe?g|png|webp|avif|mp4|webm)$/i.test(asset) && !used.has(asset));
  const again = everyImage.filter(el => !el.closest(productish) && visible(el) && inGrid.has(path(el)));
  if (again.length && free.length) push('grid-photo-reused', again[0], `BLOQUEA: La foto ${path(again[0]).split('/').pop()} ya sale en la grilla de productos. Fuera de la grilla usa fotos que no salen en ella: ${free.slice(0, 4).join(', ')}.`);

  if (window.innerWidth >= 1000) {
    const sizes = Array.from(main.querySelectorAll('h1,h2')).filter(visible).map(h => parseFloat(getComputedStyle(h).fontSize));
    if (!sizes.length || Math.max(...sizes) < 72) push('small-headline', null, 'CONSEJO: El titular más grande mide menos de 72 px en escritorio; Amboras usa titulares de 72 px o más.');
    const sections = Array.from(main.children).filter(visible).length;
    if (sections < 6) push('short-home', null, `CONSEJO: La portada tiene ${sections} secciones; usa 6 secciones o más para que la página tenga recorrido.`);
    const h1 = main.querySelector('h1');
    const cover = h1?.closest('section') ?? null;
    const box = h1?.parentElement ?? null;
    if (cover && box && box !== cover && box.getBoundingClientRect().width < 0.4 * cover.getBoundingClientRect().width) push('narrow-cover-text', cover, 'CONSEJO: El texto de la portada ocupa menos del 40 % del ancho; dale más espacio.');
  }
  // Spec 2026-11-13 fill review («the phone first»): nothing makes the page scroll sideways. The first element past the window's
  // right edge that no box clips or scrolls (marquees and rails do) is reported on its section.
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    const held = (el: Element) => { for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) if (/hidden|clip|auto|scroll/.test(getComputedStyle(node).overflowX)) return true; return false; };
    const wide = Array.from(document.querySelectorAll('main *, footer *')).find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !held(el); });
    push('h-overflow', wide, `BLOQUEA: La página se mueve de lado (${document.documentElement.scrollWidth} px en una pantalla de ${window.innerWidth} px)${wide ? `: ${(wide.textContent || '').trim() ? quote(wide) : `<${wide.tagName.toLowerCase()}>`} sale del ancho` : ''}. Nada puede pasar del ancho de la pantalla.`);
  }
  return out;
}
