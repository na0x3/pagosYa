import type { BrowserContext, Page } from 'playwright';
import type { SourceProjectSnapshot } from '../source-project';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';

/** Owner 2026-11-15 («build it, in amboras you can see in the chat their bot screenshoting the page to see if they like it»): YAPI
 *  looks at what it built. The page rules measure breakage; they cannot see a form squeezed into a narrow column, an empty box, a
 *  section that is mostly air or a product page that fell back to the plain one (DooBoo animated r3 shipped all four). After a
 *  build the home is captured section by section (desktop), the phone in screens with each section's number drawn on it, and the
 *  product page; the writer's model looks at them and names what a shopper would see as wrong, by section, so the fix round
 *  rewrites only those sections. */

export type V2LookShot = { page: 'home' | 'phone' | 'product'; label: string; section: number | null; jpeg: Buffer };
export type V2LookCapture = { shots: V2LookShot[]; sections: number[]; productTemplateInvalid: boolean };
/** Reads one of the store's uploaded files (the catalogue photos), by its file name. */
export type V2LookUploads = (filename: string) => Promise<Buffer | null>;
export type V2LookProblem = { page: 'home' | 'phone' | 'product'; section: number | null; see: string; fix: string };

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
/** A desktop section taller than this is shown from its top; product page screens are this tall too. */
const MAX_SHOT = 1500;
const MAX_SECTIONS = 16;
const PHONE_STRIPS = 6;
const PRODUCT_STRIPS = 4;

/** Every part scrolled into view once (lazy photos, entrances), then back to the top — as the page checks read it. The page's query
 *  (the product id) reaches it through the sandbox (PAGOSYA_PREVIEW_QUERY), never in the address: the sandbox refuses one. */
async function settle(page: Page, path: string) {
  await page.goto(`https://preview.invalid/${path}`, { waitUntil: 'load', timeout: 30_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) { await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(50); }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
}

/** The catalogue photos are the API's uploads, which the sandbox refuses (another origin, and its CSP allows only its own): for a
 *  look, config.js points them at https://preview.invalid/__uploads/ (a full address: the runtime resolves a bare path against the API), served from the uploads store — images only. */
async function withCatalogPhotos(context: BrowserContext, snapshot: SourceProjectSnapshot, uploads?: V2LookUploads) {
  const config = snapshot.files.find(file => file.path === 'config.js');
  if (!uploads || !config || config.encoding === 'base64') return;
  // Routes registered later run first, ahead of the sandbox's own.
  await context.route('https://preview.invalid/config.js', route => route.fulfill({ body: config.content.replace(/https?:\/\/[^"'\s]+?\/v1\/uploads\//g, 'https://preview.invalid/__uploads/'), contentType: 'text/javascript', headers: { 'Cache-Control': 'no-store' } }));
  await context.route(/^https:\/\/preview\.invalid\/__uploads\/[\w-]+\.(?:jpe?g|png|webp)$/, async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = await uploads(name).catch(() => null);
    if (!body) return route.abort();
    return route.fulfill({ body, contentType: name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg', headers: { 'Cache-Control': 'no-store' } });
  });
}

const jpeg = (page: Page, clip: { x: number; y: number; width: number; height: number }) =>
  page.screenshot({ type: 'jpeg', quality: 62, fullPage: true, clip, timeout: 10_000 }).catch(() => null);

/** The blocks of <main> in page coordinates, numbered as the page checks number them (index among main's children). */
const mainBlocks = (page: Page) => page.evaluate(() => {
  const main = document.querySelector('main');
  if (!main) return [];
  return Array.from(main.children).map((el, index) => {
    const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
    return { index, top: r.top + window.scrollY, height: r.height, shown: r.height >= 40 && style.display !== 'none' && style.visibility !== 'hidden' };
  });
});

async function strips(page: Page, width: number, tall: number, count: number, out: V2LookShot[], kind: V2LookShot['page'], name: string) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 0, y = 0; i < count && y < height; i++, y += tall) {
    const shot = await jpeg(page, { x: 0, y, width, height: Math.min(tall, height - y) });
    if (shot) out.push({ page: kind, label: `${name} ${i + 1}`, section: null, jpeg: shot });
  }
}

export async function captureV2Look(snapshot: SourceProjectSnapshot, uploads?: V2LookUploads): Promise<V2LookCapture> {
  const shots: V2LookShot[] = [];
  let sections: number[] = [];
  const home = sourceVisualState(snapshot, 'index.html', undefined, true).query;
  // Desktop: the first screen as a visitor lands on it, then each block of <main> on its own.
  await withVisualSandbox(snapshot, home, undefined, false, async context => {
    await withCatalogPhotos(context, snapshot, uploads);
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await settle(page, 'index.html');
    const first = await page.screenshot({ type: 'jpeg', quality: 62, timeout: 10_000 }).catch(() => null);
    if (first) shots.push({ page: 'home', label: 'Primera pantalla (escritorio)', section: null, jpeg: first });
    const blocks = (await mainBlocks(page)).filter(entry => entry.shown).slice(0, MAX_SECTIONS);
    sections = blocks.map(block => block.index);
    for (const block of blocks) {
      const shot = await jpeg(page, { x: 0, y: Math.max(0, block.top), width: DESKTOP.width, height: Math.min(block.height, MAX_SHOT) });
      if (shot) shots.push({ page: 'home', label: `S${block.index}${block.height > MAX_SHOT ? ` (los primeros ${MAX_SHOT}px de ${Math.round(block.height)})` : ''}`, section: block.index, jpeg: shot });
    }
  });
  // Phone: screens of the whole home, each section's number drawn at its top so a problem can name it.
  await withVisualSandbox(snapshot, home, undefined, false, async context => {
    await withCatalogPhotos(context, snapshot, uploads);
    const page = await context.newPage();
    await page.setViewportSize(PHONE);
    await settle(page, 'index.html');
    const blocks = await mainBlocks(page);
    await page.evaluate((list: Array<{ index: number; top: number; shown: boolean }>) => {
      for (const block of list.filter(entry => entry.shown)) {
        const tag = document.createElement('div');
        tag.textContent = `S${block.index}`;
        tag.setAttribute('style', `position:absolute;left:4px;top:${block.top + 4}px;z-index:2147483647;padding:2px 6px;font:700 12px/1.2 system-ui,sans-serif;color:#fff;background:#e0006c;border-radius:4px;pointer-events:none`);
        document.body.append(tag);
      }
    }, blocks);
    await strips(page, PHONE.width, PHONE.height * 2, PHONE_STRIPS, shots, 'phone', 'Celular, tramo');
  });
  // The product page of the first product, desktop, in screens; and whether the runtime threw the written template away.
  let productTemplateInvalid = false;
  const product = snapshot.files.some(file => file.path === 'product.html') ? sourceVisualState(snapshot, 'product.html', undefined, true).query : '';
  if (product) await withVisualSandbox(snapshot, product, undefined, false, async context => {
    await withCatalogPhotos(context, snapshot, uploads);
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await settle(page, 'product.html');
    productTemplateInvalid = await page.evaluate(() => document.documentElement.dataset.productPageTemplateInvalid === 'true');
    await strips(page, DESKTOP.width, MAX_SHOT, PRODUCT_STRIPS, shots, 'product', 'Página de producto, tramo');
  });
  return { shots, sections, productTemplateInvalid };
}

export function v2LookPrompt(catalogPhotos = false): string {
  return `Eres el director de arte de esta tienda y acabas de construirla. Ahora la MIRAS como la verá un cliente: capturas reales del
navegador (portada en escritorio por secciones S0, S1…; el celular en tramos con el número de sección en rosa; la página de producto).
Nombra solo lo que un cliente vería mal, en este orden de importancia:
- algo roto o sin terminar: una caja, recuadro o columna vacía; un formulario o bloque apretado en una columna estrecha; un botón sin
  estilo; texto encima de otro texto o de una foto que lo hace ilegible; algo que se sale o queda cortado;
- el mismo dato o mensaje repetido en varias secciones (los mismos números en una cinta, una lista y unas tarjetas) o los mismos
  productos ofrecidos en dos secciones distintas: dejar cada dato y cada producto en un solo lugar
- la misma foto dos veces en una página (también en la página de producto: un capítulo con la misma foto que la galería del
  producto);
- una sección que es casi toda aire (un gran espacio vacío a un lado o debajo), o una foto demasiado grande que se come la pantalla
  (más de unos 720 px de ancho y 780 de alto en escritorio);
- en el celular: columnas que no se reacomodaron, títulos partidos, cosas diminutas;
- la página de producto: que muestre la compra (fotos, nombre, precio, botón) y después los capítulos de la marca; si parece la
  página simple sin capítulos, dilo.
La etiqueta rosa «S3» del celular la puso la revisión, no es parte de la tienda.
Las TARJETAS DE PRODUCTO (foto, nombre, precio, botón, en filas o rejillas del catálogo) y su reacomodo en el celular son de la
plataforma y la tienda no puede cambiarlas: no las reportes. Tampoco que la foto de un producto en su tarjeta aparezca otra vez en
la página: las fotos de la tienda son pocas. Sí reporta la misma foto dos veces FUERA de las tarjetas. Lo marcado «ejemplo» (reseñas, puntuación,
«Combínalo con · ejemplo» y su nota para el comerciante) son muestras de la vista previa que la tienda publicada no muestra: no las reportes.${catalogPhotos ? '' : ` En estas capturas las fotos de los
PRODUCTOS DEL CATÁLOGO no cargan (cuadros grises con su nombre, en tarjetas, la galería de producto o «combínalo»): es la revisión,
en la tienda se ven; no lo reportes. Las demás fotos sí cargan.`} No opines de gusto cuando está bien hecho, no pidas
secciones nuevas y no repitas el mismo problema. Cada problema: la página, el número de sección si es de la portada (el de la captura
o el rosa del celular; null si no), lo que se ve (concreto: qué, dónde) y el arreglo (concreto: medidas, columnas, qué mover o
quitar). Si todo está bien, «problems» vacío. Como mucho 8.`;
}

export function v2LookSchema(): object {
  return {
    type: 'object', additionalProperties: false, required: ['problems'],
    properties: {
      problems: { type: 'array', maxItems: 8, items: {
        type: 'object', additionalProperties: false, required: ['page', 'section', 'see', 'fix'],
        properties: {
          page: { type: 'string', enum: ['home', 'phone', 'product'] },
          section: { type: ['integer', 'null'] },
          see: { type: 'string' },
          fix: { type: 'string' },
        },
      } },
    },
  };
}

type LookContent = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' | 'low' };

/** The captures with their labels, after a line on what the store is. */
export function v2LookInput(capture: Pick<V2LookCapture, 'shots'>, about: string): LookContent[] {
  const out: LookContent[] = [{ type: 'input_text', text: `LA TIENDA: ${about}` }];
  for (const shot of capture.shots) {
    out.push({ type: 'input_text', text: shot.label });
    out.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${shot.jpeg.toString('base64')}`, detail: 'high' });
  }
  return out;
}

/** The look's answer as check lines the build loop already reads («Escritorio: [sección N] …»), so a section problem goes to the
 *  section fix; a product page problem, or one with no section, goes to the full fix. */
export function v2LookLines(raw: unknown, capture: Pick<V2LookCapture, 'productTemplateInvalid' | 'sections'>): string[] {
  const lines: string[] = [];
  if (capture.productTemplateInvalid) lines.push('Escritorio: Página de producto: el sistema descartó tu <ProductPageTemplate> y se ve la página simple de la plataforma. Debe tener UN solo elemento raíz (un <div>) con los huecos gallery, title, pricing y buy, y los capítulos dentro de ese mismo <div>.');
  const problems = Array.isArray((raw as { problems?: unknown })?.problems) ? (raw as { problems: V2LookProblem[] }).problems : [];
  for (const problem of problems.slice(0, 8)) {
    if (!problem || typeof problem.see !== 'string' || !problem.see.trim()) continue;
    const width = problem.page === 'phone' ? 'Celular' : 'Escritorio';
    const known = problem.page !== 'product' && Number.isInteger(problem.section) && capture.sections.includes(problem.section as number);
    const where = problem.page === 'product' ? 'Página de producto: ' : known ? `[sección ${problem.section}] ` : '';
    const fix = typeof problem.fix === 'string' && problem.fix.trim() ? ` → ${problem.fix.trim().slice(0, 300)}` : '';
    lines.push(`${width}: ${where}Vista de la página: ${problem.see.trim().slice(0, 300)}${fix}`);
  }
  return lines;
}
