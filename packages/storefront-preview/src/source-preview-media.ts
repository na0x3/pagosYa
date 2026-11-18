import type { SourceSnapshot } from './source-preview';

/** Repeated size/fit variants share one image literal in the sandbox script. */
export function compactPreviewImageData(content: string): string {
  // Only the platform's JSON assignment may be rewritten as an expression.
  const match = content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) return content;
  let config: unknown;
  try { config = JSON.parse(match[1]); } catch { return content; }
  const images: string[] = [], indexes = new Map<string, number>();
  const compact = JSON.stringify(config).replace(/"data:image\/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=]+"/g, literal => {
    let index = indexes.get(literal);
    if (index === undefined) { index = images.length; indexes.set(literal, index); images.push(literal); }
    return `__pagosyaImages[${index}]`;
  });
  return images.length ? `(function(){const __pagosyaImages=[${images.join(',')}];window.PAGOSYA_CONFIG=${compact};})();` : content;
}

/** Photos the Studio embeds into one preview before the rest stay upload links. */
export const PREVIEW_EMBED_BYTES = 6 * 1024 * 1024;

/** Fetch only platform uploads in Studio, never give generated code network access. */
export function createPreviewImageLoader(apiBaseUrl: string) {
  const cache = new Map<string, Promise<string>>();
  // Copy a store (2026-11-17): Graza's 81 products and 225 photos, each embedded once per place it shows, made a page
  // bigger than the browser can hold («Invalid string length»), and 24 MB still froze the editor ~20 s (a 47 MB srcdoc).
  // Past this much, a photo stays a link to the upload
  // folder, which the preview's rules allow, as on a published store.
  let room = PREVIEW_EMBED_BYTES;
  async function image(value: unknown): Promise<unknown> {
    if (typeof value !== 'string') return value;
    let filename: string | undefined;
    try {
      const url = new URL(value, new URL(apiBaseUrl, location.href));
      filename = url.pathname.match(/^\/(?:api\/)?v1\/uploads\/([a-f0-9-]+\.(?:png|jpe?g|webp|avif|gif))$/i)?.[1];
    } catch { return value; }
    if (!filename) return value;
    const url = `${apiBaseUrl.replace(/\/$/, '')}/uploads/${filename}`;
    if (!cache.has(url)) {
      const pending = (async () => {
        // The API restarts on every save and stalls during long builds: a refused or failed request is tried again
        // over ~10 s, or the logo stays a blocked upload URL and shows as a broken image (owner 2026-10-24).
        let response: Response | undefined;
        for (const wait of [0, 1_500, 3_000, 5_000]) {
          if (wait) await new Promise(resolve => setTimeout(resolve, wait));
          try { response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
          catch (error) { if (error instanceof DOMException && error.name === 'TimeoutError') throw error; continue; }
          if (response.status < 500) break;
        }
        if (!response) throw new Error('Imagen no disponible');
        if (!response.ok || !/^image\/(png|jpeg|webp|avif|gif)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Imagen no disponible');
        const blob = await response.blob();
        if (blob.size > 10 * 1024 * 1024) throw new Error('Imagen demasiado grande');
        if (blob.size > room) return url;
        room -= blob.size;
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      })();
      cache.set(url, pending);
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
    }
    try { return await cache.get(url)!; }
    catch { cache.delete(url); return ''; }
  }
  /** Upload URLs quoted in authored pages, scripts and styles: a template's photo slots live in its compiled
   *  components, not in the catalog, and the sandbox cannot fetch them. Only quoted literals are touched. */
  const UPLOAD_LITERAL = /(["'(])((?:https?:\/\/[^"'()\s]+)?\/(?:api\/)?v1\/uploads\/[a-f0-9-]+\.(?:png|jpe?g|webp|avif|gif))(["')])/gi;
  async function inlineUploads(snapshot: SourceSnapshot): Promise<SourceSnapshot> {
    const files = await Promise.all(snapshot.files.map(async entry => {
      if (entry.path === 'config.js' || (entry.encoding && entry.encoding !== 'utf8') || !/\.(?:js|html|css)$/.test(entry.path) || !entry.content.includes('/uploads/')) return entry;
      const urls = [...new Set([...entry.content.matchAll(UPLOAD_LITERAL)].map(match => match[2]))];
      if (!urls.length) return entry;
      const inlined = new Map(await Promise.all(urls.map(async url => [url, await image(url)] as const)));
      const content = entry.content.replace(UPLOAD_LITERAL, (whole, open, url, close) => { const data = inlined.get(url); return typeof data === 'string' && data ? `${open}${data}${close}` : whole; });
      return content === entry.content ? entry : { ...entry, content };
    }));
    return files.some((entry, index) => entry !== snapshot.files[index]) ? { ...snapshot, files } : snapshot;
  }
  return async (input: SourceSnapshot): Promise<SourceSnapshot> => {
    const snapshot = await inlineUploads(input);
    const file = snapshot.files.find(file => file.path === 'config.js');
    if (!file) return snapshot;
    let config;
    try {
      const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) return snapshot;
      config = JSON.parse(match[1]);
      if (!Array.isArray(config?.data?.items)) return snapshot;
    } catch { return snapshot; }
    const tasks: Array<() => Promise<void>> = [];
    // Every product's cover first, so the embedded room goes to the photos its cards show.
    for (const item of config.data.items) if (item && Array.isArray(item.imageUrls) && item.imageUrls.length) tasks.push(async () => { item.imageUrls[0] = await image(item.imageUrls[0]); });
    for (const item of config.data.items) {
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item.imageUrls)) item.imageUrls.forEach((value: unknown, index: number) => index && tasks.push(async () => { item.imageUrls[index] = await image(value); }));
      // Normalize both galleries and color photos through the same cache. Mixing
      // embedded gallery images with upload URLs duplicates thumbnails and leaves
      // color selection dependent on network access inside the sandboxed frame.
      if (Array.isArray(item.variants)) for (const variant of item.variants) {
        if (variant && typeof variant.imageUrl === 'string') tasks.push(async () => { variant.imageUrl = await image(variant.imageUrl); });
        if (variant && Array.isArray(variant.imageUrls)) variant.imageUrls.forEach((value: unknown, index: number) => tasks.push(async () => { variant.imageUrls[index] = await image(value); }));
      }
      // Box choices show the photo of the product they stand for.
      if (Array.isArray(item.contentBlocks)) for (const block of item.contentBlocks) {
        if (!block || typeof block !== 'object') continue;
        // YAPI's details block keeps its photos one level down, in items.
        for (const holder of [block, ...(Array.isArray(block.items) ? block.items : [])]) if (holder && typeof holder === 'object') {
          for (const key of ['imageUrl', 'beforeUrl', 'afterUrl']) if (typeof holder[key] === 'string') tasks.push(async () => { holder[key] = await image(holder[key]); });
        }
      }
      if (Array.isArray(item.extras)) for (const extra of item.extras) {
        if (extra && typeof extra.imageUrl === 'string') tasks.push(async () => { extra.imageUrl = await image(extra.imageUrl); });
      }
    }
    // The calm checkout draws the store's logo from config data, which the file pass above leaves alone (Remolino 2026-10-21).
    if (typeof config.data.logoUrl === 'string') tasks.push(async () => { config.data.logoUrl = await image(config.data.logoUrl); });
    // Upload photos elsewhere in config.js (the menu's tiles in header.menu) go through the same loader (owner 2026-10-25:
    // Remolino's «Más para explorar» tiles were blank in the editor).
    const UPLOAD_URL = /^(?:https?:\/\/[^"'()\s]+)?\/(?:api\/)?v1\/uploads\/[a-f0-9-]+\.(?:png|jpe?g|webp|avif|gif)$/i;
    const visit = (node: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(node)) {
        if (node === config && key === 'data') continue;
        if (typeof value === 'string' && UPLOAD_URL.test(value)) tasks.push(async () => { const inlined = await image(value); if (inlined) node[key] = inlined; });
        else if (value && typeof value === 'object') visit(value as Record<string, unknown>);
      }
    };
    visit(config);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }));
    return { ...snapshot, files: snapshot.files.map(entry => entry === file ? { ...entry, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` } : entry) };
  };
}

/** Published stores: point catalog images at the platform's upload directory instead of embedding them,
 * so the page renders immediately and the browser loads each photo lazily from cache/CDN. Anything that
 * is not a platform upload is dropped, exactly as the embedding loader would. */
export function hostedCatalogImages(apiBaseUrl: string) {
  const base = `${apiBaseUrl.replace(/\/$/, '')}/uploads/`;
  const image = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    try {
      const url = new URL(value, new URL(apiBaseUrl, location.href));
      const filename = url.pathname.match(/^\/(?:api\/)?v1\/uploads\/([a-f0-9-]+\.(?:png|jpe?g|webp|avif|gif))$/i)?.[1];
      return filename ? base + filename : '';
    } catch { return ''; }
  };
  const rewrite = <T,>(data: T): T => {
    const copy = structuredClone(data) as any;
    for (const item of Array.isArray(copy?.items) ? copy.items : []) {
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item.imageUrls)) item.imageUrls = item.imageUrls.map(image);
      for (const variant of Array.isArray(item.variants) ? item.variants : []) if (variant) {
        if (typeof variant.imageUrl === 'string') variant.imageUrl = image(variant.imageUrl);
        if (Array.isArray(variant.imageUrls)) variant.imageUrls = variant.imageUrls.map(image);
      }
      for (const block of Array.isArray(item.contentBlocks) ? item.contentBlocks : []) if (block && typeof block === 'object') {
        for (const holder of [block, ...(Array.isArray(block.items) ? block.items : [])]) if (holder && typeof holder === 'object') {
          for (const key of ['imageUrl', 'beforeUrl', 'afterUrl']) if (typeof holder[key] === 'string') holder[key] = image(holder[key]);
        }
      }
      for (const extra of Array.isArray(item.extras) ? item.extras : []) if (extra && typeof extra.imageUrl === 'string') extra.imageUrl = image(extra.imageUrl);
    }
    return copy;
  };
  return { imageSource: base, rewrite };
}

export function hostedImageUrls(apiBaseUrl: string) {
  const { imageSource, rewrite } = hostedCatalogImages(apiBaseUrl);
  return (snapshot: SourceSnapshot): { snapshot: SourceSnapshot; imageSource: string } => {
    const file = snapshot.files.find(entry => entry.path === 'config.js');
    const match = file?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    let config;
    try { config = match && JSON.parse(match[1]); } catch { config = null; }
    if (!file || !config || !Array.isArray(config.data?.items)) return { snapshot, imageSource };
    config.data = rewrite(config.data);
    return { snapshot: { ...snapshot, files: snapshot.files.map(entry => entry === file ? { ...entry, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` } : entry) }, imageSource };
  };
}
