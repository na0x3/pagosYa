/// <reference lib="dom" />
import { sourceVisualState } from './source-visual-state';
import { chromium, type BrowserContext } from 'playwright';
import type { SourceProjectSnapshot } from './source-project';

export type VisualCapture = { viewport: 'desktop' | 'mobile'; width: number; height: number; y: number; pageHeight: number; productId?: string; state: 'initial'; readiness: { fontsLoaded: boolean; missingImages: number; scrollWidth: number }; image: string };
const origin = 'https://preview.invalid';
const mime: Record<string, string> = { mp4: 'video/mp4', html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', woff2: 'font/woff2', ttf: 'font/ttf' };

/** Shared offline renderer: only snapshot bytes, never external APIs or URLs. */
async function withVisualSandbox<T>(snapshot: SourceProjectSnapshot, query: string, signal: AbortSignal | undefined, probe: boolean, visit: (context: BrowserContext) => Promise<T>): Promise<T> {
  signal?.throwIfAborted();
  const files = new Map(snapshot.files.map(f => [f.path, f]));
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 15000 });
  const cancel = () => { void browser.close(); };
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => { void browser.close(); }, 45000);
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let path = ''; try { path = decodeURIComponent(url.pathname.slice(1)); } catch {}
      const productQuery = probe && request.resourceType() === 'document' && [...url.searchParams.keys()].every(key => key === 'id');
      const file = url.origin === origin && request.method() === 'GET' && (!url.search || productQuery) ? files.get(path) : undefined;
      if (!file || !['document', 'stylesheet', 'script', 'image', 'font', 'media'].includes(request.resourceType())) return route.abort();
      // Even local documents cannot escape to APIs, workers, frames, forms or sockets.
      const csp = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
      await route.fulfill({ body: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'), contentType: mime[path.split('.').at(-1)!] || 'application/octet-stream', headers: { 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' } });
    });
    await context.addInitScript(({ query, probe }) => {
      (window as any).PAGOSYA_PREVIEW_QUERY = query;
      (window as any).PAGOSYA_PREVIEW = probe !== true;
      (window as any).PAGOSYA_HOSTED = false;
      window.open = () => null;
    }, { query, probe });
    return await visit(context);
  } finally { clearTimeout(deadline); signal?.removeEventListener('abort', cancel); await browser.close(); }
}

/** Render the exact product identity and record initial, unselected visual states. */
export async function captureSourceVisuals(snapshot: SourceProjectSnapshot, entry: string, requestedProductId?: string, signal?: AbortSignal): Promise<VisualCapture[]> {
  if (!entry.endsWith('.html') || !snapshot.files.some(f => f.path === entry)) throw new Error('La página seleccionada no existe en esta revisión.');
  const state = sourceVisualState(snapshot, entry, requestedProductId);
  return withVisualSandbox(snapshot, state.query, signal, false, async context => {
    const captures: VisualCapture[] = [];
    for (const [viewport, width] of [['desktop', 1280], ['mobile', 390]] as const) {
      signal?.throwIfAborted();
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: 844 });
      page.setDefaultTimeout(7000);
      await page.goto(`${origin}/${entry}`, { waitUntil: 'load', timeout: 12000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      // Each screenshot remains readable; explicitly disclose gaps on long pages.
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const positions = [...new Set([0, Math.max(0, Math.round((pageHeight - 844) / 2)), Math.max(0, pageHeight - 844)])];
      for (const y of positions) {
        await page.evaluate(offset => window.scrollTo(0, offset), y);
        await page.evaluate(async () => { await Promise.all(Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map(i => i.decode().catch(() => {}))); });
        const image = await page.screenshot({ type: 'jpeg', quality: 75, animations: 'disabled', timeout: 7000 });
        const readiness = await page.evaluate(() => ({ fontsLoaded: document.fonts.status === 'loaded', scrollWidth: document.documentElement.scrollWidth, missingImages: Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && (!i.complete || !i.naturalWidth); }).length }));
        captures.push({ viewport, width, height: 844, y, pageHeight, ...(state.productId ? { productId: state.productId } : {}), state: 'initial', readiness, image: `data:image/jpeg;base64,${image.toString('base64')}` });
      }
      await page.close();
    }
    return captures;
  });
}

export type ShoppingProbe = { width: number; productId: string; variantId?: string; status: 'passed' | 'failed' | 'unsupported' | 'unavailable'; error?: string };
/** Functional evidence, separate from screenshot preference. Uses simulated checkout only. */
export async function probeSourceShopping(snapshot: SourceProjectSnapshot, signal?: AbortSignal): Promise<ShoppingProbe[]> {
  const configFile = snapshot.files.find(f => f.path === 'config.js');
  const config = JSON.parse(configFile?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] || '{}');
  if (!config.productPage || !config.checkoutPage) return [{ width: 390, productId: '', status: 'unsupported', error: 'Faltan rutas de producto o checkout.' }];
  const products = (config.data?.items || []).slice(0, 3);
  if (!products.length) return [{ width: 390, productId: '', status: 'unsupported', error: 'No hay productos para verificar.' }];
  const demo = { ...snapshot, files: snapshot.files.map(f => f.path === 'config.js' ? { ...f, content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...config, demo: true }) + ';' } : f) };
  return withVisualSandbox(demo, '', signal, true, async context => {
    const results: ShoppingProbe[] = [];
    for (const width of [1280, 390]) for (const product of products) {
      signal?.throwIfAborted();
      const row: ShoppingProbe = { width, productId: product.id, status: 'failed' };
      if (product.extras?.length) { results.push({ ...row, status: 'unsupported' }); continue; }
      if (product.stock === 0 || product.variants?.length && product.variants.every((v: any) => v.stock === 0 || v.purchaseLimit === 0)) { results.push({ ...row, status: 'unavailable' }); continue; }
      const page = await context.newPage();
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(4000); await page.setViewportSize({ width, height: 844 });
      try {
        await page.goto(`${origin}/${config.productPage}?id=${encodeURIComponent(product.id)}`, { waitUntil: 'load', timeout: 10000 });
        await page.getByRole('heading', { name: product.name, exact: true }).first().waitFor();
        const groups = await page.locator('.product-detail__options fieldset').count();
        if (product.variants?.length && !groups) throw new Error('Las opciones del producto no están disponibles.');
        for (let group = 0; group < groups; group++) await page.locator(`[data-product-option="${group}"]:not([disabled])`).first().click();
        const values = await page.locator('[data-product-selection]').allTextContents();
        const variant = product.variants?.find((v: any) => (v.options?.length ? v.options.map((o: any) => o.value) : [v.name]).every((value: string, i: number) => value === values[i].trim()));
        row.variantId = variant?.id;
        if (groups && !variant) throw new Error('La selección no corresponde a una variante del catálogo.');
        const buy = page.locator(groups ? '[data-variant-add]' : '.product-detail__buy[data-add]').first();
        await buy.click();
        const lines = await page.evaluate(() => { const detail: any = {}; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail })); return detail.items; });
        if (!lines?.some((line: any) => line.id === product.id && line.variantId === variant?.id && line.quantity >= 1)) throw new Error('El carrito no conserva la variante elegida.');
        await page.goto(`${origin}/${config.checkoutPage}`, { waitUntil: 'load' });
        await page.getByRole('button', { name: 'Continuar al pago de prueba', exact: true }).click();
        await page.getByRole('button', { name: 'Completar prueba', exact: true }).click();
        await page.getByText('Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.', { exact: true }).first().waitFor();
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('El checkout se sale del ancho de pantalla.');
        if (errors.length) throw new Error('Hay errores de ejecución en la página.');
        row.status = 'passed';
      } catch (error) { row.error = [errors.join('; '), error instanceof Error ? error.message : 'La compra simulada falló.'].filter(Boolean).join(' · ').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 700); }
      finally { await page.close(); }
      results.push(row);
    }
    return results;
  });
}
