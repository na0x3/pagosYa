/* Template stores' check (owner 2026-11-02: «check and log»): the page rules the section-library live checks used since 2026-10-31,
 * run on each new template home after it is saved and only written to the product log — never sent to YAPI as a task.
 * Copied from .superpowers/sdd/2026-10-31-section-library/qa-checks.ts (the home writer keeps its own, gentler, rules). */

/** Runs in the page (page.evaluate): no imports, no closures. Lines start with BLOQUEA: or CONSEJO:. */
export function evaluateTemplateRules(): string[] {
  const out: string[] = [];
  const main = document.querySelector('main') || document.body;
  const productish = '[data-product-id],[data-pagosya-product],[data-pagosya-catalog],[data-pagosya-spotlight],.menu-item,[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel';
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
    if (neutral && lum(bg) < 0.05 && !band.querySelector('img,video,picture') && words) out.push(`BLOQUEA: Banda oscura solo con texto («${words.slice(0, 40)}»). Dale una foto real, un fondo claro o el color de la marca.`);
    // Owner 2026-10-31 (rhode «Elige por sabor», closing band): a dark brand colour carrying only words is the same wall of text.
    // An FAQ, a form or a table is not words alone, nor the template's closing call: one short line and its button.
    else if (lum(bg) < 0.1 && words && !band.querySelector(`img,video,picture,details,table,form,${productish}`)
      && !(band.querySelector('a,button') && words.length - Array.from(band.querySelectorAll('a,button')).reduce((sum, el) => sum + (el.textContent || '').trim().length, 0) <= 90)) out.push(`BLOQUEA: Banda de color oscuro solo con texto («${words.slice(0, 40)}»). Ponle una foto real o productos al lado, o pásala a un fondo claro con una foto.`);
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
    if (words && blank) out.push(`BLOQUEA: Sección de solo texto sobre fondo liso («${words.slice(0, 40)}»). Dale una foto real a su lado o muestra los productos (data-pagosya-catalog data-products="Nombre|Nombre"); si no queda una foto libre, quítala.`);
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
    if (colour.length >= 3 && ratio(colour, behind(el)) < 2.2) out.push(`BLOQUEA: Texto que no se lee sobre su fondo («${words.slice(0, 40)}»): dale un color de texto que contraste (var(--es-ink) sobre fondo claro) o pon un fondo de marca detrás.`);
  }
  // Live check 2026-10-30 (Oh Belly hnqosmrt: «BURBUJA / S PARA», «Prebiót / icos»): a big title in a narrow box wraps inside a word.
  // Rhode 2026-10-31: the phone's cover button read «VER LA COLECCIÓ / N» — buttons, links and list items count too.
  const broken = new Set<string>();
  for (const el of Array.from(document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main a, main button, main li, main label, footer h2, footer h3, footer p, footer a, footer li'))) {
    if (el.closest(productish)) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && broken.size < 3; node = walker.nextNode()) {
      const text = node.textContent || '';
      for (const match of text.matchAll(/[\p{L}\p{N}]{4,}/gu)) {
        const range = document.createRange();
        range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
        const tops = new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top)));
        if (tops.size > 1) broken.add(match[0]);
      }
    }
  }
  if (broken.size) out.push(`BLOQUEA: Palabras cortadas a la mitad (${[...broken].map(word => `«${word}»`).join(', ')}): el texto es más ancho que su caja. Baja el tamaño o dale más ancho.`);
  // Owner 2026-10-24 («a blank screen»): a store with photos never opens on words alone (live check 2026-10-30, Oh Belly ujy3rqxr).
  const cover = bands[0];
  const pictured = (el: Element) => Boolean(el.querySelector(`img,video,picture,[data-pagosya-catalog],[data-pagosya-spotlight]`)) || [el, ...Array.from(el.querySelectorAll('*'))].some(node => getComputedStyle(node).backgroundImage.includes('url('));
  if (cover && photos.length && !pictured(cover)) out.push('BLOQUEA: La portada es solo texto y la tienda tiene fotos. Pon una foto o un producto en la portada, junto al titular o detrás de él.');
  // Live check 2026-10-30 (Oh Belly ujy3rqxr): the cover's video sat in a column below the fold, so the first screen showed words only.
  const media = Array.from(main.querySelectorAll('img,video,picture'));
  const seenFirst = media.some(el => { const r = el.getBoundingClientRect(); return r.width > 80 && r.height > 80 && r.top < window.innerHeight && r.bottom > 0; })
    || [cover, ...Array.from(cover?.querySelectorAll('*') ?? [])].some(node => node && getComputedStyle(node).backgroundImage.includes('url(') && node.getBoundingClientRect().top < window.innerHeight);
  if (cover && media.length && pictured(cover) && !seenFirst) out.push('BLOQUEA: En la primera pantalla no se ve ninguna foto ni video: la foto de la portada quedó más abajo. Ponla al lado del titular o detrás, visible sin bajar.');
  // Each photo once.
  const seen = new Map<string, number>();
  for (const el of photos) { const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || ''; if (src) seen.set(src, (seen.get(src) || 0) + 1); }
  for (const [src, count] of seen) if (count > 1) out.push(`BLOQUEA: La misma foto aparece dos veces: ${(src.split('/').pop() || src).slice(0, 60)}. Usa cada foto una sola vez.`);
  // Three or more photos side by side in one container: owner rule 2026-10-15.
  const counts = new Map<Element, number>();
  for (const el of photos) { const parent = (el.closest('figure') ?? el).parentElement; if (parent) counts.set(parent, (counts.get(parent) || 0) + 1); }
  if ([...counts.values()].some(count => count >= 3)) out.push('BLOQUEA: Hay un grupo de 3 fotos o más juntas. Deja como máximo dos fotos juntas.');
  // The home shows products.
  if (!main.querySelector('[data-pagosya-catalog],[data-product-id],[data-pagosya-product],[data-pagosya-spotlight],a[href*="product.html"]')) out.push('BLOQUEA: La portada no muestra ningún producto. Incluye la grilla de productos (data-pagosya-catalog).');

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
  for (let i = 0; i < lines.length && crossed.size < 3; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (a.owner === b.owner || a.owner.contains(b.owner) || b.owner.contains(a.owner)) continue;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 12 && h > 2) { crossed.add(`${quote(a.owner)} con ${quote(b.owner)}`); break; }
  }
  if (crossed.size) out.push(`BLOQUEA: Textos encimados (${[...crossed].join('; ')}): un texto pisa al otro. Dale al titular un interlineado de 0.95 o más y margen debajo (marginBottom), o sepáralos.`);
  // On the phone a title squeezed into a column beside a photo (rhode: «Un / toque / jugoso.» in 147 px next to the photo).
  if (window.innerWidth < 600) {
    const squeezed = Array.from(main.querySelectorAll('h1, h2')).filter(h => {
      if (h.closest(productish) || parseFloat(getComputedStyle(h).fontSize) < 28 || !sized(h)) return false;
      const r = h.getBoundingClientRect(), section = h.closest('section') ?? main;
      return Array.from(section.querySelectorAll('img,video,picture')).some(media => { const m = media.getBoundingClientRect();
        return m.width > 80 && Math.min(m.bottom, r.bottom) - Math.max(m.top, r.top) > 0.4 * r.height && (m.left >= r.right - 4 || m.right <= r.left + 4); });
    });
    if (squeezed.length) out.push(`BLOQUEA: En el celular el título ${quote(squeezed[0])} queda apretado en una columna junto a una foto. Usa gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' para que en el teléfono la foto quede arriba o abajo del texto.`);
  }
  // A sticker that sits on nothing (rhode: «limón» hung under the photo in its own row). It belongs on a photo or by the title.
  for (const sticker of Array.from(main.querySelectorAll('.ui-sticker')).filter(visible)) {
    const s = sticker.getBoundingClientRect();
    const touches = Array.from(main.querySelectorAll('img,video,picture,h1,h2')).some(el => { const r = el.getBoundingClientRect();
      const w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top); return w > 0 && h > 0 && w * h >= 0.25 * s.width * s.height; });
    if (!touches) { out.push(`BLOQUEA: El Sticker ${quote(sticker)} quedó suelto, sin tocar una foto ni el titular. Ponlo encima de la foto: <Sticker style={{ position: 'absolute', top: '1rem', right: '1rem' }}> dentro de un contenedor con position: 'relative'.`); break; }
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
    if (b.top - a.bottom < 0.6 * size && across > 0.5 * Math.min(a.width, b.width)) { out.push(`BLOQUEA: Dos títulos grandes seguidos (${quote(titles[i - 1])} y ${quote(titles[i])}). Deja uno solo por sección; el otro pásalo a texto normal o quítalo.`); break; }
  }
  // A paragraph given its own box of colour (rhode: a cream box on the pink band). FAQ answers keep their cards.
  const boxed = Array.from(main.querySelectorAll('p')).find(p => {
    if (p.closest(`${productish},details,a,button,label`) || !sized(p) || p.getBoundingClientRect().width < 200) return false;
    const own = paint(p); if (own.length < 3) return false;
    const under = p.parentElement ? behind(p.parentElement) : [255, 255, 255];
    return [0, 1, 2].some(i => Math.abs(own[i] - under[i]) > 10);
  });
  if (boxed) out.push(`BLOQUEA: El párrafo ${quote(boxed)} tiene su propia caja de color. Quítale el background; si no se lee, dale color: 'var(--es-ink)'.`);
  // Words that dodge what they promise (rhode: «Peptide aparece en el nombre… Revisa cada ficha»).
  const dodge = /\b(?:revisa|consulta|mira) (?:cada|la|las|su|sus) fichas?\b|\baparece en el nombre\b|\bconocer sus detalles\b/i;
  const dodged = Array.from(main.querySelectorAll('p, li, h2, h3')).find(el => !el.closest(productish) && dodge.test(el.textContent || ''));
  if (dodged) out.push(`BLOQUEA: El texto ${quote(dodged)} esquiva la pregunta y manda al comprador a otra parte. Responde con lo que se sabe en general de ese tipo de producto (sin inventar datos, precios ni promesas de la tienda) o quita la pregunta.`);
  // Titles in another letter than the store's titles (rhode: the footer's «Dulce. Jugosa. Tuya.» in the body sans, heavy).
  const family = (el: Element) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const lead = main.querySelector('h1');
  if (lead) {
    const odd = Array.from(document.querySelectorAll('main h2, main h3, footer h2, footer h3')).find(el => !el.closest(productish) && sized(el) && parseFloat(getComputedStyle(el).fontSize) >= 28 && family(el) !== family(lead));
    if (odd) out.push(`BLOQUEA: El título ${quote(odd)} usa otra letra (${getComputedStyle(odd).fontFamily.split(',')[0]}) que el titular (${getComputedStyle(lead).fontFamily.split(',')[0]}). Todos los títulos grandes van en la letra de los titulares: quita su fontFamily y su fontWeight.`);
  }
  // A product's photo used again outside the grid while the store still has photos nobody sees (rhode: the cover = the first card).
  const assets = (() => { try { const req = new XMLHttpRequest(); req.open('GET', 'visual-assets.json', false); req.send(); return req.status === 200 ? (JSON.parse(req.responseText).assets || []).map((asset: { path: string }) => asset.path) as string[] : []; } catch { return [] as string[]; } })();
  const path = (el: Element) => { try { return new URL((el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || '').pathname.replace(/^\//, ''); } catch { return ''; } };
  const everyImage = Array.from(document.querySelectorAll('main img, main video, footer img, footer video'));
  const inGrid = new Set(everyImage.filter(el => el.closest(productish)).map(path).filter(Boolean));
  const used = new Set(everyImage.map(path).filter(Boolean));
  const free = assets.filter(asset => /\.(?:jpe?g|png|webp|avif|mp4|webm)$/i.test(asset) && !used.has(asset));
  const again = everyImage.filter(el => !el.closest(productish) && visible(el) && inGrid.has(path(el)));
  if (again.length && free.length) out.push(`BLOQUEA: La foto ${path(again[0]).split('/').pop()} ya sale en la grilla de productos. Fuera de la grilla usa fotos que no salen en ella: ${free.slice(0, 4).join(', ')}.`);

  if (window.innerWidth >= 1000) {
    const sizes = Array.from(main.querySelectorAll('h1,h2')).filter(visible).map(h => parseFloat(getComputedStyle(h).fontSize));
    if (!sizes.length || Math.max(...sizes) < 72) out.push('CONSEJO: El titular más grande mide menos de 72 px en escritorio; Amboras usa titulares de 72 px o más.');
    const sections = Array.from(main.children).filter(visible).length;
    if (sections < 6) out.push(`CONSEJO: La portada tiene ${sections} secciones; usa 6 secciones o más para que la página tenga recorrido.`);
    const h1 = main.querySelector('h1');
    const cover = h1?.closest('section') ?? null;
    const box = h1?.parentElement ?? null;
    if (cover && box && box !== cover && box.getBoundingClientRect().width < 0.4 * cover.getBoundingClientRect().width) out.push('CONSEJO: El texto de la portada ocupa menos del 40 % del ancho; dale más espacio.');
  }
  return out;
}
