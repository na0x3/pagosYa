/* Spec 2026-10-29 home page writer §3: few checks block, the rest is advice. Header and menu lines are dropped: the writer
 * cannot touch the Shell, and Test B (2026-10-29) spent its steps on them. */

/** Runs in the page (page.evaluate): no imports, no closures. Lines start with BLOQUEA: or CONSEJO:. */
export function evaluateHomeWriterRules(): string[] {
  const out: string[] = [];
  const main = document.querySelector('main') || document.body;
  const productish = '[data-product-id],[data-pagosya-product],[data-pagosya-catalog],[data-pagosya-spotlight],.menu-item,[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel';
  const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 40 && r.height > 40 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
  const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
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
  const broken = new Set<string>();
  for (const el of Array.from(document.querySelectorAll('main h1, main h2, main h3, main p, footer h2, footer h3, footer p'))) {
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

/** Owner 2026-10-30 (BOXY «too shouty»): a calm brand's titles never show in capitals — written so, or by a template rule. Runs in the page. */
export function evaluateCalmTitles(): string[] {
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll('main h1, main h2, footer h2'))) {
    const words = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const letters = words.replace(/[^\p{L}]/gu, '');
    const r = el.getBoundingClientRect();
    if (letters.length < 8 || words.split(' ').length < 2 || r.width < 20) continue;
    if (getComputedStyle(el).textTransform === 'uppercase' || (letters === letters.toUpperCase() && letters !== letters.toLowerCase())) out.push(`BLOQUEA: Marca tranquila: el título «${words.slice(0, 40)}» se ve en mayúsculas. Escríbelo con mayúscula inicial y ponle style={{ textTransform: 'none' }}.`);
  }
  return out;
}

/** Owner 2026-10-30 («oh belly … plain still»): a fun store keeps something moving on the first screen — a floating or turning
 *  piece, not only letters that bounce once. Runs in the page. */
export function evaluatePlayfulCover(): string[] {
  const moving = Array.from(document.querySelectorAll('main .ui-float, main .ui-sticker')).some(el => { const r = el.getBoundingClientRect(); return r.width > 20 && r.top < window.innerHeight && r.bottom > 0; });
  return moving ? [] : ['BLOQUEA: Tienda divertida: en la primera pantalla nada se mueve sin parar. Pon un <Float> o un <Sticker> dentro de la portada (junto al titular o sobre la foto), visible sin bajar.'];
}

const HEADER = /^Encabezado/;
const ADVICE = /^CONSEJO: /;
/** Lines from captureAgentDraft that break the page; everything else it reports is ignored in this mode. */
const BLOCKING = [/^BLOQUEA: /, /^Imagen no disponible/, /^Enlace a sección inexistente/, /desborda horizontalmente/, /^Texto casi invisible/, /^Variables de color sin valor/, /^El catálogo está oculto/];
/** The capture's own soft lines (composition review, sticky, text over a button, process or catalog copy, illustrations): dropped here. */
const KNOWN_SOFT = /^(?:\[composition:|«|Texto encima|Texto del proceso|Texto permanente|Ilustración|Foto ampliada|Recorte excesivo|Inicio sin)/;

/** Capture errors (any width) → what must be fixed and what is only advice. Page script errors (pageerror) block. */
export function homeWriterVerdict(captures: Array<{ width: number; errors: string[] }>): { blocking: string[]; advice: string[] } {
  const blocking: string[] = [], advice: string[] = [];
  for (const { width, errors } of captures) for (const line of errors) {
    if (HEADER.test(line)) continue;
    if (ADVICE.test(line)) { const text = line.replace(ADVICE, ''); if (!advice.includes(text)) advice.push(text); continue; }
    if (BLOCKING.some(rule => rule.test(line)) || (!KNOWN_SOFT.test(line) && /Error\b|is not|undefined|null/.test(line))) blocking.push(`(${width}) ${line.replace(/^BLOQUEA: /, '')}`);
  }
  return { blocking, advice };
}
