/** Spike 2026-11-12 (owner: «find how they operate and replicate it»): Lovable's way on our template stores, behind
 *  YAPI_STUDIO=1 — a design system first, the home painted only by it, real images and no stretched photos. Throwaway until the
 *  owner keeps it. */

export const STUDIO_RULES = `MODO ESTUDIO (como Lovable). Esta tienda tiene que verse como SU marca, no como la plantilla:
1. Antes de escribir, piensa qué evoca la marca (en una frase) y en qué tiendas hermosas reales te inspiras (dos o tres), y dilo en tu primer mensaje.
2. Primero el sistema de diseño: set_tokens con los 5 colores de la marca y DOS fuentes del catálogo que vayan con ella (puedes cambiar las de la plantilla). Después escribes la portada.
3. Variables del kit: var(--es-heading) es la fuente de los títulos y var(--es-body) la del texto (no hay otras de fuente). Cada título de sección (h2) con la fuente var(--es-heading) y tamaño de titular: 40 px o más en escritorio.
4. La portada se pinta solo con el sistema de diseño: var(--es-paper), var(--es-ink), var(--es-muted), var(--es-accent), var(--es-deep) y color-mix de ellos. Nunca un color escrito a mano (#…, rgb(…), hsl(…)); blanco y negro solo para texto sobre foto.
5. Cada foto se muestra a lo sumo a su tamaño real: nunca más ancha que su tamaño real. Las fotos del comercio suelen ser pequeñas (unos 700 px): ponlas en marcos, tarjetas, collages o junto al titular; a todo el ancho solo una foto grande (las fotos de marca generadas para esta tienda lo son).
6. Una portada con personalidad: una fuente de titular con carácter usada muy grande, una sola idea de marca, detalles propios (etiquetas, marcos, bandas del color de la marca, movimiento del kit). Nada genérico.
7. En escritorio el titular de la portada nunca va encima de la foto: al lado, debajo o sobre un fondo de color de la marca. En celular puede ir sobre la foto solo si se lee bien (texto claro sobre una zona oscura).
8. Los textos dicen cosas reales de esta tienda: nunca nombres de relleno («Sabor uno», «Producto 1», «Colección A»); los productos con su nombre de store-data. Y nada se sale de la pantalla: etiquetas y stickers dentro del borde, también en celular.
9. El encabezado, el menú, las tarjetas de producto, la ficha, el carrito y el checkout son de la plantilla; la portada usa sus secciones probadas cuando sirven. Las tarjetas de producto llevan su foto: nunca la ocultes ni la cambies con CSS.
10. Cada sección llena el ancho: foto grande a un lado y texto al otro, o centrada; nunca todo apilado en un costado con medio ancho vacío.
11. Cada sección muestra lo que su título promete: opiniones solo con opiniones reales del comercio, cifras solo con datos suyos. Si no las tiene, esa sección no va.`;

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
  return lost ? [`BLOQUEA: ${lost} tarjetas de producto se ven sin su foto. Las tarjetas son de la plantilla: no ocultes ni cambies su foto.`] : [];
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
      // A photo still loading has no height yet: its frame stands in for it.
      const b = (media && el.getBoundingClientRect().height < 8 && el.parentElement ? el.parentElement : el).getBoundingClientRect();
      if (b.width < 8 || b.height < 8) continue;
      const style = getComputedStyle(el);
      const painted = b.width >= 120 && b.height >= 120 && (style.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor));
      if (media || painted) { left = Math.min(left, b.left); right = Math.max(right, b.right); }
    }
    if (!isFinite(left)) continue;
    const used = right - left;
    if (used < W * 0.55 && Math.abs((left + right) / 2 - W / 2) > W * 0.15) {
      const title = (band.querySelector('h2,h3')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      out.push(`BLOQUEA: La sección «${title}» se apila en un costado (usa ${Math.round(used)} de ${W} px) y deja medio ancho vacío: arregla su grilla para que llene el ancho, con la foto grande a un lado y el texto al otro.`);
    }
  }
  return out.slice(0, 3);
}
