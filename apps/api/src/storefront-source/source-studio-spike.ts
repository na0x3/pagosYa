/** Spike 2026-11-12 (owner: «find how they operate and replicate it»): Lovable's way on our template stores, behind
 *  YAPI_STUDIO=1 — a design system first, the home painted only by it, real images and no stretched photos. Throwaway until the
 *  owner keeps it. */

export const STUDIO_RULES = `MODO ESTUDIO (como Lovable). Esta tienda tiene que verse como SU marca, no como la plantilla:
1. Antes de escribir, piensa qué evoca la marca (en una frase) y en qué tiendas hermosas reales te inspiras (dos o tres), y dilo en tu primer mensaje.
2. Primero el sistema de diseño: set_tokens con los 5 colores de la marca y DOS fuentes del catálogo que vayan con ella (puedes cambiar las de la plantilla). Después escribes la portada.
3. La portada se pinta solo con el sistema de diseño: var(--es-paper), var(--es-ink), var(--es-muted), var(--es-accent), var(--es-deep) y color-mix de ellos. Nunca un color escrito a mano (#…, rgb(…), hsl(…)); blanco y negro solo para texto sobre foto.
4. Cada foto se muestra a lo sumo a su tamaño real: nunca más ancha que su tamaño real. Las fotos del comercio suelen ser pequeñas (unos 700 px): ponlas en marcos, tarjetas, collages o junto al titular; a todo el ancho solo una foto grande (las fotos de marca generadas para esta tienda lo son).
5. Una portada con personalidad: una fuente de titular con carácter usada muy grande, una sola idea de marca, detalles propios (etiquetas, marcos, bandas del color de la marca, movimiento del kit). Nada genérico.
6. En escritorio el titular de la portada nunca va encima de la foto: al lado, debajo o sobre un fondo de color de la marca. En celular puede ir sobre la foto solo si se lee bien (texto claro sobre una zona oscura).
7. Los textos dicen cosas reales de esta tienda: nunca nombres de relleno («Sabor uno», «Producto 1», «Colección A»); los productos con su nombre de store-data. Y nada se sale de la pantalla: etiquetas y stickers dentro del borde, también en celular.
8. El encabezado, el menú, las tarjetas de producto, la ficha, el carrito y el checkout son de la plantilla; la portada usa sus secciones probadas cuando sirven.`;

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
