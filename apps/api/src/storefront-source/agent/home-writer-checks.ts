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
  const photos = Array.from(main.querySelectorAll('img,video')).filter(el => visible(el) && !el.closest(productish) && !el.closest('header,footer'));

  // A band painted near-black (neutral and dark) that carries only words: owner rule 2026-10-22. Brand colours pass.
  for (const band of Array.from(main.children)) {
    if (!visible(band) || band.matches(productish)) continue;
    const bg = rgb(getComputedStyle(band).backgroundColor);
    if (bg.length < 3 || (bg.length > 3 && bg[3] < 0.5)) continue;
    const neutral = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) < 24;
    const words = (band.textContent || '').trim();
    if (neutral && lum(bg) < 0.05 && !band.querySelector('img,video,picture') && words) out.push(`BLOQUEA: Banda oscura solo con texto («${words.slice(0, 40)}»). Dale una foto real, un fondo claro o el color de la marca.`);
  }
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
