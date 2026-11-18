/** Spike 2026-11-12 (owner: «find how they operate and replicate it»): Lovable's way on our template stores, behind
 *  YAPI_STUDIO=1 — a design system first, the home painted only by it, real images and no stretched photos. Throwaway until the
 *  owner keeps it. */

export const STUDIO_RULES = `MODO ESTUDIO (como Lovable). Esta tienda tiene que verse como SU marca, no como la plantilla:
1. Antes de escribir, piensa qué evoca la marca (en una frase) y en qué tiendas hermosas reales te inspiras (dos o tres), y dilo en tu primer mensaje.
2. Primero el sistema de diseño: set_tokens con los 5 colores de la marca y DOS fuentes del catálogo que vayan con ella (puedes cambiar las de la plantilla). Después escribes la portada.
3. Variables del kit: var(--es-heading) es la fuente de los títulos y var(--es-body) la del texto (no hay otras de fuente). Cada título de sección (h2) con la fuente var(--es-heading) y tamaño de titular: 40 px o más en escritorio.
4. La portada se pinta solo con el sistema de diseño: var(--es-paper), var(--es-ink), var(--es-muted), var(--es-accent), var(--es-deep) y color-mix de ellos. Nunca un color escrito a mano (#…, rgb(…), hsl(…)); blanco y negro solo para texto sobre foto.
5. Fotos medianas (el dueño no quiere fotos enormes): ninguna foto a todo el ancho; en computadora cada foto ocupa como mucho el 60% del ancho y el 75% del alto de la pantalla, en celular como mucho el 75% del alto (max-h-[75vh], aspect-[4/5], una columna de grilla). Y nunca más ancha que su tamaño real. Ponlas en marcos, tarjetas o junto al titular.
6. Una portada con personalidad: una fuente de titular con carácter usada muy grande, una sola idea de marca, detalles propios (etiquetas, marcos, bandas del color de la marca, movimiento del kit). Nada genérico.
7. En escritorio el titular de la portada nunca va encima de la foto: al lado, debajo o sobre un fondo de color de la marca. En celular puede ir sobre la foto solo si se lee bien (texto claro sobre una zona oscura).
8. Los textos dicen cosas reales de esta tienda: nunca nombres de relleno («Sabor uno», «Producto 1», «Colección A»); los productos con su nombre de store-data. Y nada se sale de la pantalla: etiquetas y stickers dentro del borde, también en celular.
9. El encabezado, el menú, las tarjetas de producto, la ficha, el carrito y el checkout son de la plantilla; la portada usa sus secciones probadas cuando sirven. Las tarjetas de producto llevan su foto: nunca la ocultes ni la cambies con CSS.
10. Cada sección llena el ancho: foto mediana a un lado y texto al otro, o centrada; nunca todo apilado en un costado con medio ancho vacío. Ninguna sección de solo palabras, tampoco sobre un fondo de color: cada una lleva una foto real o productos.
11. Cada sección muestra lo que su título promete: opiniones solo con opiniones reales del comercio, cifras solo con datos suyos. Si no las tiene, esa sección no va.
12. Detalles de la marca (los del brief): adornos pequeños sacados de lo que vende — huellas en una tienda de perros, burbujas en una soda — dibujados por ti en SVG en línea (<svg aria-hidden="true">, fill="currentColor" o var(--es-accent)), de 16 a 120 px, en al menos 3 lugares: junto a títulos, como separadores o viñetas, en esquinas de fotos, en el encabezado o el pie. Decoran con mesura; nunca tapan texto ni fotos.`;

/** Colours written by hand in the home: hex (other than white and black), rgb(), rgba(), hsl(), outside comments and links. */
export function rawColours(code: string): string[] {
  const text = code.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/href=["'][^"']*["']/g, ' ');
  const found = text.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g) ?? [];
  return [...new Set(found.filter(value => !/^#(?:fff|ffffff|000|000000)$/i.test(value)))];
}

/** Runs in the page (page.evaluate): no imports, no closures. A photo drawn wider than its own pixels looks blurry. */
export function evaluateSharpPhotos(): string[] {
  const out: string[] = [];
  for (const img of Array.from(document.querySelectorAll('main img'))) {
    const el = img as HTMLImageElement;
    const shown = el.getBoundingClientRect().width;
    if (!el.naturalWidth || shown < 240) continue;
    if (shown > el.naturalWidth * 1.15) out.push(`BLOQUEA: La foto ${(el.getAttribute('src') || '').split('/').pop()} mide ${el.naturalWidth} px y se muestra a ${Math.round(shown)} px: se ve borrosa. Muéstrala más chica (marco, tarjeta, collage) o usa una foto grande.`);
  }
  return out.slice(0, 4);
}

/** Two brand images for the cover and a mood band, from the merchant's own words (no products invented, no text). */
export function studioImagePrompts(storeName: string, words: string): Array<{ prompt: string; aspectRatio: 'landscape' | 'portrait' }> {
  const about = words.replace(/\s+/g, ' ').trim().slice(0, 500);
  return [
    { aspectRatio: 'landscape', prompt: `Foto de portada amplia para ${storeName}. Lo que vende y su marca, en palabras del comercio: ${about}. Una escena de ambiente con luz natural y mucho espacio libre a un lado para el titular.` },
    { aspectRatio: 'portrait', prompt: `Foto vertical de ambiente para ${storeName}, para una banda de la marca. En palabras del comercio: ${about}. Detalle cercano, textura y color de la marca, sin personas identificables.` },
  ];
}

/** The brand images, made before the writer runs so they reach it as store photos; one that fails is skipped, never the build. */
export type StudioImageMaker = { canGenerateStorefrontImages(): boolean;
  generateStorefrontImage(merchantId: string, storeId: string, storeName: string, request: { prompt: string; aspectRatio: 'landscape' | 'portrait' }): Promise<{ url: string }> };
export async function studioImages(visual: StudioImageMaker | undefined, merchantId: string, storeId: string, storeName: string, words: string): Promise<string[]> {
  if (!visual?.canGenerateStorefrontImages()) return [];
  const made = await Promise.all(studioImagePrompts(storeName, words).map(request =>
    visual.generateStorefrontImage(merchantId, storeId, storeName, request).then(asset => asset.url).catch(() => null)));
  return made.filter((url): url is string => Boolean(url));
}

/** Live 2026-11-12: on the ChatGPT plan the API blanks the OpenAI key (nothing metered by accident); studio images get their own. */
export function studioImageMaker(deps: { apiKey: string; model: string; fetch?: typeof fetch; save(bytes: Buffer): Promise<{ url: string }> }): StudioImageMaker {
  return {
    canGenerateStorefrontImages: () => Boolean(deps.apiKey && deps.model),
    async generateStorefrontImage(_merchantId, _storeId, _storeName, request) {
      const size = request.aspectRatio === 'portrait' ? '1024x1536' : '1536x1024';
      const response = await (deps.fetch ?? fetch)('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(150_000),
        body: JSON.stringify({ model: deps.model, n: 1, size, quality: 'medium', output_format: 'jpeg', output_compression: 86, moderation: 'auto',
          prompt: `${request.prompt}\nFotografía editorial original. Sin texto, sin logotipos, sin marcas de agua, sin precios.` }) });
      const body = await response.json().catch(() => null) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } } | null;
      const encoded = body?.data?.[0]?.b64_json;
      if (!response.ok || !encoded) throw new Error(body?.error?.message ?? 'el modelo de imágenes no devolvió una imagen');
      return deps.save(Buffer.from(encoded, 'base64'));
    },
  };
}

/** Kit variables the home names that neither the stylesheet nor the home itself defines (live 2026-11-12: NOA and Oh Belly wrote
 *  var(--es-font-heading) for --es-heading, so every title fell back to the text font). */
export function unknownKitVars(code: string, css: string): string[] {
  const defined = new Set([...`${css}\n${code}`.matchAll(/(--es-[\w-]+)\s*:/g)].map(match => match[1]));
  return [...new Set([...code.matchAll(/var\(\s*(--es-[\w-]+)/g)].map(match => match[1]).filter(name => !defined.has(name)))];
}

/** Runs in the page (page.evaluate): no imports, no closures. A section title at text size on a computer (NOA studio2 2026-11-12). */
export function evaluateTitleScale(): string[] {
  if (window.innerWidth < 900) return [];
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll('main h2'))) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || el.closest('[data-pagosya-catalog],.menu-item,[data-pagosya-spotlight]')) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 30) out.push(`BLOQUEA: El título de sección «${(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}» mide ${Math.round(size)} px, como el texto: dale tamaño de titular (40 px o más) y la fuente var(--es-heading).`);
  }
  return out.slice(0, 4);
}

/** CSS in the home that hides a part of the template's product cards (live 2026-11-12, NOA studio3: the writer hid every card
 *  photo with .es-catalog .es-card__media{display:none!important} to draw a list of names). */
export function hiddenCardParts(code: string): string[] {
  const found: string[] = [];
  // Oh Belly studio3: the same, under the writer's own name for the product grid ([data-belly=main] img).
  const grids = [...code.matchAll(/<[a-zA-Z][^<>]*\bdata-pagosya-catalog\b[^<>]*>/g)].flatMap(tag => [...tag[0].matchAll(/\b(data-[\w-]+)=["']([^"']+)["']/g)]
    .filter(attr => !attr[1].startsWith('data-pagosya') && !attr[1].startsWith('data-es-')).map(attr => `[${attr[1]}=${attr[2]}]`));
  for (const match of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])/.test(match[2])) continue;
    for (const selector of match[1].split(',').map(part => part.replace(/^[\s`'"]+|[\s`'"]+$/g, '').trim())) {
      const plain = selector.replace(/["']/g, '');
      if (/\.(?:es-card|lb-card|menu-item)\b[^,]*(?:\bimg\b|__media|__image)|__media\b|menu-item__image/.test(selector)
        || (/\b(?:img|picture)\b/.test(plain) && grids.some(grid => plain.includes(grid)))) found.push(selector);
    }
  }
  return [...new Set(found)];
}

/** Runs in the page (page.evaluate): no imports, no closures. Product cards drawn without their photo. */
export function evaluateCardPhotos(): string[] {
  let lost = 0;
  for (const card of Array.from(document.querySelectorAll('main .es-card, main .menu-item'))) {
    const r = card.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) continue;
    const img = card.querySelector('img[src]');
    if (img && img.getAttribute('src') && img.getBoundingClientRect().width < 20) lost++;
  }
  return lost ? [`BLOQUEA: ${lost} tarjetas de producto se ven sin su foto. La foto del producto se ve siempre: no ocultes <img data-product-field="image"> ni la cambies con CSS.`] : [];
}

/** Runs in the page (page.evaluate): no imports, no closures. On a computer, a section whose words and photos all sit on one side
 *  and leave half the width empty (live 2026-11-12, NOA studio3 «Esculpir antes que adornar»: a 154 px photo and a narrow column). */
export function evaluateLopsided(): string[] {
  const W = window.innerWidth;
  const main = document.querySelector('main');
  if (W < 900 || !main) return [];
  const out: string[] = [];
  for (const band of Array.from(main.querySelectorAll(':scope > section, :scope > div > section'))) {
    const r = band.getBoundingClientRect();
    if (r.height < 300 || r.width < W * 0.9) continue;
    let left = Infinity; let right = -Infinity;
    const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent || '').trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const b = range.getBoundingClientRect();
      if (b.width >= 1) { left = Math.min(left, b.left); right = Math.max(right, b.right); }
    }
    for (const el of Array.from(band.querySelectorAll('*'))) {
      const media = /^(?:img|video|picture|svg|canvas)$/i.test(el.tagName);
      // A photo still loading has no height yet: its frame stands in for it. A painted box counts (Pawby studio3: a full-width pill
      // button 40 px tall), unless it covers the band, which is the band's own background.
      const b = (media && el.getBoundingClientRect().height < 8 && el.parentElement ? el.parentElement : el).getBoundingClientRect();
      if (b.width < 8 || b.height < 8) continue;
      const style = getComputedStyle(el);
      const painted = b.width >= 120 && b.height >= 24 && !(b.width >= r.width * 0.95 && b.height >= r.height * 0.5) && (style.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor));
      if (media || painted) { left = Math.min(left, b.left); right = Math.max(right, b.right); }
    }
    if (!isFinite(left)) continue;
    const used = right - left;
    if (used < W * 0.5 && Math.abs((left + right) / 2 - W / 2) > W * 0.15) {
      const title = (band.querySelector('h2,h3')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      out.push(`BLOQUEA: La sección «${title}» se apila en un costado (usa ${Math.round(used)} de ${W} px) y deja medio ancho vacío: arregla su grilla para que llene el ancho, con la foto grande a un lado y el texto al otro.`);
    }
  }
  return out.slice(0, 3);
}

/* Owner 2026-11-12, after the Howl & Honey and Oh Belly chassis builds: rules the writer kept breaking while they were advice.
 * They block (home-writer-tools caps each at two blocks, then it is advice again, so a run never loops on one). */

/** Runs in the page (page.evaluate): no imports, no closures. Owner 2026-11-12 («i dont [like] pictures too big»): on a computer a
 *  photo takes at most 60% of the width and 75% of the screen's height; on a phone at most 75% of its height (Howl & Honey: one
 *  1,300 px card per row, a full-bleed product photo). */
export function evaluateBigPhotos(): string[] {
  const W = window.innerWidth, H = window.innerHeight;
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll('main img, main video'))) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width < 120 || r.height < 120 || style.display === 'none' || style.visibility === 'hidden') continue;
    if (!(W >= 900 && r.width > W * 0.62) && !(r.height > H * 0.8)) continue;
    const src = el.getAttribute('src') || el.querySelector('source')?.getAttribute('src') || '';
    out.push(`BLOQUEA: Foto demasiado grande: ${src.split('/').pop()?.split('?')[0] || 'una foto'} se ve a ${Math.round(r.width)}×${Math.round(r.height)} px en una pantalla de ${W}×${H}. El dueño quiere fotos medianas: en computadora hasta 60% del ancho y 75% del alto (una columna de grilla, max-h-[75vh], aspect-[4/5]); en celular hasta 75% del alto; las tarjetas de producto de 3 o 4 por fila.`);
  }
  return [...new Set(out)].slice(0, 3);
}

/** Runs in the page (page.evaluate): no imports, no closures. On a phone the store's own header fits: no button or link word broken
 *  over several lines (Howl & Honey 2026-11-12: «BUSCAR» and «Bolsa 0» stacked one letter per line) and one short row. */
export function evaluateHeaderFit(): string[] {
  if (window.innerWidth > 600) return [];
  const header = document.querySelector('header') || document.querySelector('[data-cart-open]')?.closest('nav,div');
  if (!header) return [];
  const out: string[] = [];
  for (const el of Array.from(header.querySelectorAll('a,button'))) {
    const words = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const r = el.getBoundingClientRect();
    if (!words || words.split(' ').length > 3 || r.width < 2 || r.height < 2) continue;
    const range = document.createRange(); range.selectNodeContents(el);
    const lines = new Set(Array.from(range.getClientRects()).filter(box => box.width > 0).map(box => Math.round(box.top))).size;
    if (lines > words.split(' ').length) out.push(`BLOQUEA: En el celular, «${words}» del encabezado se parte en ${lines} líneas. En el celular el encabezado es una sola fila: logo, ícono de menú, ícono de búsqueda y carrito con su número; palabras con white-space:nowrap o íconos (hidden md:inline para las palabras).`);
  }
  const height = Math.round(header.getBoundingClientRect().height);
  if (height > 130) out.push(`BLOQUEA: En el celular el encabezado mide ${height} px de alto: déjalo en una fila de 80 px o menos (logo, menú, búsqueda y carrito).`);
  return [...new Set(out)].slice(0, 3);
}

/** Runs in the page (page.evaluate): no imports, no closures. Owner 2026-11-12 («one of them did not even have a menu»): the
 *  NavShell header, measured like Amboras's nav gate — logo and bag seen, a menu button on a phone, and on a computer the menu's
 *  links (or the merchant menu's ☰) unless the plan's structure is the drawer. A header without NavShell is chassis-parts' line. */
export function evaluateNavShell(): string[] {
  const nav = document.querySelector('header[data-nav-shell]');
  if (!nav) return [];
  const shown = (el: Element | null) => {
    if (!el) return false;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
  };
  const out: string[] = [];
  const toggle = Array.from(nav.querySelectorAll('[data-nav-toggle], .pym-toggle')).some(shown);
  if (!shown(nav.querySelector('[data-nav-logo]'))) out.push('BLOQUEA: En el encabezado no se ve el logo ni el nombre de la tienda: no lo escondas con clases.');
  if (!shown(nav.querySelector('[data-nav-action="bag"]'))) out.push('BLOQUEA: En el encabezado no se ve el carrito: no escondas las acciones de NavShell con clases.');
  if (window.innerWidth < 768) {
    if (!toggle) out.push('BLOQUEA: En el celular el encabezado no muestra el botón del menú: no lo escondas con toggleClassName ni className.');
  } else if (nav.getAttribute('data-structure') !== 'drawer') {
    const links = Array.from(nav.querySelectorAll('[data-nav-links] a, [data-nav-links] button, .pym-top')).filter(shown);
    if (links.length < 2 && !toggle) out.push(`BLOQUEA: En la computadora el encabezado no muestra el menú (${links.length} enlaces a la vista): pasa 3 a 5 links a NavShell y no los escondas con linksClassName.`);
  }
  return out;
}

/** Runs in the page (page.evaluate): no imports, no closures. On a computer the product page's buy button is on the first screen
 *  (Oh Belly 2026-11-12: a photo alone filled it; title, price and button only after scrolling). */
export function evaluateBuyInView(): string[] {
  if (window.innerWidth < 900) return [];
  const buy = document.querySelector('main .product-detail__buy, [data-pagosya-product-page] button[data-add], main button[data-add]');
  if (!buy) return [];
  const bottom = Math.round(buy.getBoundingClientRect().bottom + window.scrollY);
  return bottom > window.innerHeight ? [`BLOQUEA: En la ficha el botón de compra queda a ${bottom} px, fuera de la primera pantalla (${window.innerHeight} px). Pon la foto (mediana) y la compra lado a lado (grid md:grid-cols-2): título, precio y botón visibles sin bajar.`] : [];
}

/** Runs in the page (page.evaluate): no imports, no closures. Owner 2026-11-12 («more details, for example footprints»): small
 *  drawn marks of what the store sells (inline SVG, not icons in links or buttons) in at least three places. */
export function evaluateDetails(): string[] {
  if (window.innerWidth < 900) return [];
  const places = new Set<Element>();
  let marks = 0;
  for (const svg of Array.from(document.querySelectorAll('header svg, main svg, footer svg'))) {
    const r = svg.getBoundingClientRect();
    if (r.width < 10 || r.width > 200 || r.height < 10 || svg.closest('a,button,[data-pagosya-catalog],[data-product-id],template')) continue;
    if (getComputedStyle(svg).visibility === 'hidden') continue;
    marks++;
    const main = document.querySelector('main');
    let place: Element = svg;
    while (place.parentElement && place.parentElement !== main && place.parentElement !== document.body) place = place.parentElement;
    places.add(place);
  }
  return marks < 4 || places.size < 3 ? [`BLOQUEA: Faltan los detalles de la marca: ${marks} adornos en ${places.size} lugares. Dibuja en SVG en línea (aria-hidden, color var(--es-accent) o currentColor, 16 a 120 px) los detalles del brief — huellas para una tienda de perros, burbujas para una soda — y ponlos en al menos 3 lugares: junto a títulos, separadores, esquinas de fotos, el pie.`] : [];
}

/** Runs in the page (page.evaluate): no imports, no closures. Owner 2026-11-12 («i dont like these little boxes», the round dashed
 *  «Patas felices» / «Sin azúcar» badges): no round badge with words, the kit's Sticker or one drawn by hand. Buttons are not badges. */
export function evaluateBadges(): string[] {
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll('header *, main *, footer *'))) {
    if (el.closest('a,button,[data-pagosya-catalog],[data-product-id],template')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.width > 260 || Math.abs(r.width - r.height) > r.width * 0.2) continue;
    const style = getComputedStyle(el);
    const radius = parseFloat(style.borderTopLeftRadius);
    const round = style.borderTopLeftRadius.endsWith('%') ? radius >= 40 : radius >= r.width * 0.4;
    const words = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!(el.classList.contains('ui-sticker') || round) || !words || words.split(' ').length > 5 || el.querySelector('img,video')) continue;
    out.push(`BLOQUEA: Insignia redonda con palabras («${words.slice(0, 30)}»). Al dueño no le gustan (ni <Sticker> ni círculos con texto): quítala; si quieres algo que se mueva, haz flotar un producto o un detalle de la marca dibujado en SVG, sin palabras.`);
  }
  return [...new Set(out)].slice(0, 3);
}

/** Runs in the page (page.evaluate): no imports, no closures. Owner 2026-11-12 («i think drawing should be off»): no drawn
 *  decoration — inline SVG drawings outside links, buttons and inputs, and empty outlined circles (Oh Belly's bubble rings). */
export function evaluateNoDrawings(): string[] {
  let drawings = 0;
  for (const svg of Array.from(document.querySelectorAll('main svg, footer svg'))) {
    const r = svg.getBoundingClientRect();
    if (r.width < 28 || r.height < 28 || svg.closest('a,button,label,input,[data-pagosya-catalog],[data-product-id],template,[role="img"][aria-label]')) continue;
    if (getComputedStyle(svg).visibility !== 'hidden') drawings++;
  }
  for (const el of Array.from(document.querySelectorAll('main *, footer *'))) {
    if (el.children.length || (el.textContent || '').trim() || el.closest('a,button,label,input')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.width > 600 || Math.abs(r.width - r.height) > r.width * 0.15) continue;
    const s = getComputedStyle(el);
    const radius = parseFloat(s.borderTopLeftRadius);
    const round = s.borderTopLeftRadius.endsWith('%') ? radius >= 40 : radius >= r.width * 0.4;
    if (round && (parseFloat(s.borderTopWidth) > 0 || s.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor))) drawings++;
  }
  return drawings ? [`BLOQUEA: Hay ${drawings} dibujos o adornos (SVG decorativos, círculos o burbujas). El dueño no quiere dibujos: quítalos; la tienda se luce con tipografía, color, fotos y las partes del kit.`] : [];
}

/** Runs in the page (page.evaluate): no imports, no closures. Owner rule (2026-10-29, again 2026-11-12 on Oh Belly's chassis
 *  build): no section of only words — on a brand colour either (the light-background case is evaluateHomeWriterRules'). */
export function evaluateWordsOnlyBands(): string[] {
  const main = document.querySelector('main');
  if (!main) return [];
  const productish = '[data-product-id],[data-pagosya-product],[data-pagosya-catalog],[data-pagosya-spotlight],.menu-item,[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel';
  const bands = Array.from(main.children.length === 1 ? main.children[0].children : main.children).filter(el => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 40 && r.height > 120 && s.display !== 'none' && s.visibility !== 'hidden';
  });
  const out: string[] = [];
  for (const band of bands.slice(1)) {
    if (band.matches(productish) || band.querySelector(`img,video,picture,details,table,form,[data-pagosya-blog],${productish}`)) continue;
    const bg = (getComputedStyle(band).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    const page = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    const words = (band.textContent || '').replace(/\s+/g, ' ').trim();
    const painted = bg.length >= 3 && !(bg.length > 3 && bg[3] < 0.5) && !(page.length >= 3 && [0, 1, 2].every(i => Math.abs(bg[i] - page[i]) < 6));
    if (words && painted) out.push(`BLOQUEA: Sección de solo palabras sobre color («${words.slice(0, 40)}»). El dueño no quiere secciones solo de texto: dale una foto real a su lado o muestra productos; si no queda una foto libre, quítala.`);
  }
  return out.slice(0, 3);
}
