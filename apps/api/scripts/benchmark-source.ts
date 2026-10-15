/** Runs the production source generator against synthetic businesses, never merchant data.
 * Usage: node --env-file=.env -r ts-node/register scripts/benchmark-source.ts --models auto,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol --cases cafe,shop --out ../../tmp/source-benchmark
 */
import 'reflect-metadata';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { SourceGenerationService } from '../src/storefront-source/source-generation.service';
import { sourceProjectSnapshot } from '../src/storefront-source/source-project';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../src/storefront-source/source-generation-policy';
import { sourceDesignExploration } from '../src/storefront-source/source-design';
import { createHash } from 'node:crypto';
import { SourceProviderQuotaException } from '../src/storefront-source/source-provider-error';
import type { SourceSitePurpose } from '../src/storefront-source/source-site-purpose';
import { kitPath } from '@pagosya/storefront-kit';

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const output = resolve(option('--out', '../../tmp/source-benchmark'));
const models = option('--models', 'gpt-5.6-terra,gpt-5.6-luna').split(',') as SourceModelChoice[];
const requestedCases = option('--cases', 'cafe').split(',');
const repeats = Number(option('--repeats', '1'));
const maxCredits = Number(option('--max-credits', '25'));
const arm = option('--arm', 'story') as 'layout' | 'story';
if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 500) throw new Error('Invalid max credits (1–500).');
if (!['layout', 'story'].includes(arm)) throw new Error('Invalid arm; choose layout or story.');
if (!models.length || models.some(m => !SOURCE_MODEL_CHOICES.includes(m)) || !Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('Invalid models or repeats (1–5).');
const cases: Array<{ id: string; name: string; business: string; style: string; products: string[]; sitePurpose?: SourceSitePurpose; asset?: string; assets?: string[] }> = [
  { id: 'cafe', name: 'Café del Patio', business: 'Cafetería de barrio en La Paz', style: 'Carta editorial cálida, crema y verde bosque. Tipografía legible y pedido visible.', products: ['Café filtrado', 'Café con leche', 'Pan de chocolate'] },
  { id: 'shop', name: 'Taller Sur', business: 'Tienda de cerámica artesanal en La Paz', style: 'Catálogo sobrio con fondo claro, títulos amplios, acento terracota y una compra sencilla.', products: ['Taza de cerámica', 'Cuenco de cerámica', 'Jarrón pequeño'] },
  { id: 'breakfast', name: 'Mesa Temprana', business: 'Desayunos para compartir en La Paz', style: 'Usa la imagen de desayuno suministrada como foco visual, conserva el aspecto de los alimentos. Es una ilustración de prueba, no fotografía real del comercio.', products: ['Desayuno para compartir', 'Café de la mañana', 'Pan del día'] },
  { id: 'beauty', name: 'Estudio Botánico', business: 'Cosmética y cuidado personal', style: 'Una colección editorial de productos con tipografía cuidada; la imagen suministrada es un recurso sintético de prueba, no certifica ingredientes o resultados.', products: ['Jabón de manos', 'Jabón corporal', 'Estuche'], asset: '../../examples/premium-benchmark-photos/beauty-photo-1/scene-jabon.jpg' },
  { id: 'furniture', name: 'Objeto Norte', business: 'Muebles de diseño para espacios compactos', style: 'Composición cinematográfica y tipografía precisa. Sin fotos disponibles: crea una identidad tipográfica sin dibujar ni inventar productos.', products: ['Mesa auxiliar', 'Banco', 'Repisa'] },
  { id: 'service', name: 'Estudio Ladera', business: 'Servicios de diseño de interiores para viviendas', style: 'Presenta los servicios de distribución y asesoría de materiales; contacto por correo hola@example.com. No inventes reservas, clientes ni proyectos.', products: [], sitePurpose: 'service' as const },
  { id: 'portfolio', name: 'Nora Taller', business: 'Portafolio de diseño gráfico independiente', style: 'Un portafolio de tipografía clara. Proyecto suministrado: Identidad para un taller, exploración personal de letras. No inventes clientes. Contacto hola@example.com.', products: [], sitePurpose: 'portfolio' as const },
  { id: 'editorial', name: 'Cuaderno Urbano', business: 'Publicación sobre observación de la ciudad', style: 'Presenta la publicación y el espacio del blog real. No hay artículos publicados: muestra un estado honesto sin inventar autores ni historias. Contacto hola@example.com.', products: [], sitePurpose: 'editorial' as const },
].filter(c => requestedCases.includes(c.id));
if (!cases.length || requestedCases.some(id => !cases.some(c => c.id === id))) throw new Error('Available cases: cafe,shop,breakfast,beauty,furniture,service,portfolio,editorial');
// Supplemental photo-rich cohort uses the same approved local synthetic imagery as the owned examples.
if (args.includes('--with-media')) for (const business of cases) {
  if (business.id === 'beauty') {
    business.products = ['Jabón de manos', 'Crema de manos'];
    business.assets = ['../../examples/premium-benchmark-photos/beauty-photo-1/scene-jabon.jpg', '../../examples/premium-benchmark-photos/beauty-photo-1/scene-crema.jpg'];
    business.style = 'Composición editorial con fotografías protagonistas, tipografía expresiva y una colección breve fácil de comprar. Las dos imágenes suministradas son recursos sintéticos de prueba del jabón y la crema respectivamente; no inventes ingredientes, resultados o certificaciones.';
  }
  if (business.id === 'furniture') {
    business.business = 'Objetos y textiles para interiores';
    business.products = ['Manta tejida', 'Cojín terracota'];
    business.assets = ['../../examples/premium-benchmark-photos/home-photo-1/scene-manta.jpg', '../../examples/premium-benchmark-photos/home-photo-1/scene-cojin.jpg'];
    business.style = 'Una tienda cinematográfica con las fotografías suministradas como protagonistas: una manta tejida y un cojín terracota, en ese orden. Usa composición de imagen y tipografía con carácter, una historia de producto y compra clara; no una portada vacía ni una lista sin fotos. Los recursos son sintéticos de prueba; no inventes materiales, procedencia ni certificaciones.';
  }
}
if (args.includes('--open-direction')) for (const business of cases) business.style = 'Dirección visual completamente libre: inventa una composición propia para este negocio. No hay colores, tipografías ni estructura predefinidos. El pedido debe ser fácil de encontrar.';
const phases = args.includes('--create-only') ? ['create'] : ['create', 'edit'];
const cycleConcepts = args.includes('--cycle-concepts');
const resume = args.includes('--resume');
const boundedSmoke = args.includes('--bounded-smoke');
if (resume && args.includes('--recheck')) throw new Error('Choose --resume or --recheck, not both.');
if (resume && phases.length !== 1) throw new Error('Safe resume supports --create-only; use --recheck for saved edit runs.');
const preflight = { arm, models, mediaCohort: args.includes('--with-media'), cases: cases.map(c => c.id), repeats, phases, cycleConcepts, maxCreditsPerRequest: maxCredits, plannedRequests: models.length * cases.length * repeats * phases.length, estimatedBudgetUsd: models.length * cases.length * repeats * phases.length * maxCredits / 100 };
if (boundedSmoke && (models.length !== 1 || repeats !== 1 || phases.length !== 1 || preflight.plannedRequests > 6 || maxCredits > 50 || preflight.estimatedBudgetUsd > 3)) throw new Error('Bounded smoke requires one model, one repeat, --create-only, <=6 requests, <=50 credits/request and <=$3 total.');
if (args.includes('--dry-run')) { console.log(JSON.stringify(preflight, null, 2)); process.exit(0); }
if (!args.includes('--recheck')) {
  for (const model of models) {
    if (!process.env.OPENAI_API_KEY) throw new Error(`OPENAI_API_KEY is required for ${model}. No generation was started.`);
  }
  console.log(JSON.stringify(preflight));
}
const requireStudio = createRequire(resolve('../merchant-studio/package.json'));
const { chromium } = requireStudio('@playwright/test');
const replay = args.includes('--recheck');
const results: any[] = [];
let haltReason: string | null = null;
const providerFetch = globalThis.fetch;
globalThis.fetch = async (...input: Parameters<typeof fetch>) => {
  const response = await providerFetch(...input);
  if ([401, 403].includes(response.status)) haltReason = 'provider-auth';
  return response;
};
const content = new Map<string, { content: string | Buffer; type: string }>();
const mime: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://local').pathname;
  const file = content.get(pathname) || [...content.entries()].reverse().find(([key]) => key.endsWith(pathname))?.[1];
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' }); res.end(file.content);
});

async function main() {
  if (!replay && !resume && await access(join(output, 'results.json')).then(() => true, () => false)) throw new Error('This folder already contains results. Choose a new --out folder or use --recheck (no API calls).');
  await mkdir(output, { recursive: true });
  const priorPlan = await readFile(join(output, 'plan.json'), 'utf8').then(JSON.parse, () => null);
  if (resume && priorPlan && Object.entries(preflight).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(priorPlan[key]))) throw new Error('Resume must use the original models, cases, repeats, phases and budget. No paid request was started.');
  await writeFile(join(output, replay ? 'verification-plan.json' : 'plan.json'), JSON.stringify({ ...preflight, boundedSmoke, live: !replay, humanReviewComplete: false }, null, 2));
  if (resume) {
    const prior = await readFile(join(output, 'results.json'), 'utf8').then(JSON.parse, () => ({ results: [] }));
    results.push(...prior.results);
    if (prior.haltReason) throw new Error('Prior run halted for provider quota/auth; resume will not repeat paid calls. Recheck saved outputs only.');
  }
  const generatorDigest = createHash('sha256').update((await Promise.all(['source-generation.service.ts','source-generation-types.ts','source-style-proposals.ts','source-review-runner.ts','source-sep5-call.ts','source-save-assembly.ts','source-sep5-stage.ts','source-sep5-review.ts','source-agent-stage.ts','source-design.ts','source-design-planner.ts','source-fonts.ts','source-composition-registry.ts','source-site-purpose.ts','source-next.ts'].map(path => readFile(resolve('src/storefront-source', path))).concat(readFile(kitPath('commerce.js'))))).map(buffer => buffer.toString('utf8')).join('\n')).digest('hex');
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const browser = await chromium.launch();
  try {
    runLoop: for (const business of cases) for (const model of models) for (let repeat = 1; repeat <= repeats; repeat++) {
      const key = `${business.id}-${model}-${repeat}`;
      const folder = join(output, key); await mkdir(folder, { recursive: true });
      const versions: any[] = [], runs: any[] = [];
      const assetPaths = business.assets || (business.asset ? [business.asset] : business.id === 'breakfast' ? ['../../examples/independent-cafe/assets/breakfast.webp'] : []);
      const media = await Promise.all(assetPaths.map(async (path, index) => ({ path, url: '/v1/uploads/00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0') + extname(path), bytes: await readFile(resolve(path)) })));
      const assetBuffer = media[0]?.bytes;
      const assetUrls = media.map(asset => asset.url);
      const isShop = !business.sitePurpose || business.sitePurpose === 'shop';
      const store = { contactEmail: 'hola@example.com', contactFormEnabled: false, storeName: business.name, tagline: business.business, checkoutMode: 'payment', categories: [], locations: [], items: business.products.map((name, index) => ({ id: `p${index}`, name, description: name, amount: 2000 + index * 1000, currency: 'BOB', stock: 10, imageUrls: [], variants: [], extras: [] })) };
      for (const [index, asset] of media.entries()) if (store.items[index]) (store.items[index].imageUrls as string[]).push(new URL(asset.url, process.env.PUBLIC_API_URL || 'http://localhost:3001/v1').href);
      const prisma: any = { mediaAsset: { findMany: async () => media.map(asset => ({ url: asset.url })) }, store: { findFirst: async () => ({ slug: 'benchmark' }) }, storeSourceGeneration: {
        create: async ({ data }: any) => { const run = { ...data, id: `run-${runs.length}` }; runs.push(run); return run; },
        updateMany: async ({ where, data }: any) => { if (where.id) Object.assign(runs.find(r => r.id === where.id), data); return { count: 1 }; },
      } };
      const projects: any = { current: async () => ({ revision: versions.length, slug: "benchmark" }), version: async (_m: string, _s: string, revision: number) => versions[revision - 1],
        save: async (_m: string, _s: string, input: any, generation: any) => {
          const snapshot = sourceProjectSnapshot(input);
          const version = { revision: versions.length + 1, label: input.label, snapshot }; versions.push(version);
          await prisma.storeSourceGeneration.updateMany({ where: { id: generation.id }, data: generation.data }); return version;
        } };
      const config: any = { get: (name: string) => ({ 'app.openAi.apiKey': process.env.OPENAI_API_KEY, 'app.openAi.enabled': true, 'app.environment': 'test', 'app.checkoutOrigin': origin, 'app.port': 3001, 'app.sourceFramework': 'next' } as any)[name] };
      class BenchmarkGenerator extends SourceGenerationService {
        protected exploreDesign() { return cycleConcepts ? sourceDesignExploration((repeat - 1) % 3) : super.exploreDesign(); }
        protected narrativePlanning() { return arm === 'story'; }
      }
      const service = new BenchmarkGenerator(prisma, { getStorePublic: async () => structuredClone(store) } as any, projects, { getBuffer: async (filename: string) => media.find(asset => asset.url.endsWith('/' + filename))?.bytes, contentTypeFor: (filename: string) => filename.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' } as any, config);
      const brief = { sitePurpose: business.sitePurpose || 'shop' as SourceSitePurpose, businessType: business.business, audience: 'Clientes de La Paz', primaryAction: isShop ? 'Explorar el catálogo y hacer un pedido' : 'Conocer el trabajo y contactar', visualDirection: business.style };
      for (const phase of phases) {
        if (haltReason) break runLoop;
        if (resume && results.some(result => result.case === business.id && result.requestedModel === model && result.repeat === repeat && result.phase === phase)) continue;
        const dispatchFile = join(folder, phase + '-dispatched.json');
        if (resume && await access(dispatchFile).then(() => true, () => false)) {
          results.push({ case: business.id, requestedModel: model, repeat, phase, usable: false, error: 'Interrupted after dispatch; not replayed to avoid duplicate spend.', providerMicroUsd: null, credits: null, screenshots: [], elapsedMs: 0, timeToUsableMs: null });
          continue;
        }
        if (phase === 'edit' && !versions.length) break;
        const started = Date.now();
        const result: any = { arm, generatorDigest, requestedConcept: cycleConcepts ? (repeat - 1) % 3 : null, costBasis: 'OpenAI standard-rate estimate', maxCredits, case: business.id, requestedModel: model, repeat, phase, usable: false, generationMs: null, timeToUsableMs: null, providerMicroUsd: null, credits: 0, attempts: [], visualReview: 'pending', screenshots: [] };
        const context = await browser.newContext({ viewport: { width: 1280, height: 844 }, serviceWorkers: 'block' });
        // Generated code runs only in a disposable browser. All outbound requests are blocked.
        await context.route('**/*', (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage(); page.setDefaultTimeout(8000);
        const pageErrors: string[] = []; page.on('pageerror', (e: Error) => pageErrors.push(e.message));
        try {
          let generated: any;
          if (replay) {
            const originals = JSON.parse(await readFile(join(output, 'results.json'), 'utf8')).results;
            const original = originals.find((r: any) => r.case === business.id && r.requestedModel === model && r.phase === phase && r.repeat === repeat);
            if (!await access(join(folder, phase)).then(() => true, () => false)) {
              throw new Error(original?.error || 'No saved source output is available for recheck.');
            }
            const files: Array<{ path: string; content: string }> = [];
            const collect = async (dir: string, prefix = '') => { for (const entry of await readdir(dir, { withFileTypes: true })) {
              if (entry.isDirectory()) await collect(join(dir, entry.name), prefix + entry.name + '/');
              else {
                const path = prefix + entry.name, binary = /\.(ttf|woff2?|png|jpe?g|webp)$/i.test(path);
                files.push({ path, content: (await readFile(join(dir, entry.name))).toString(binary ? 'base64' : 'utf8'), ...(binary ? { encoding: 'base64' } : {}) });
              }
            } };
            await collect(join(folder, phase));
            files.find(f => f.path === 'commerce.js')!.content = await readFile(kitPath('commerce.js'), 'utf8');
            versions.push({ snapshot: { files } });
            generated = { generation: { credits: 0, attempts: [] } };
            result.originalGenerationMs = original?.generationMs ?? null; result.originalGeneratorDigest = original?.generatorDigest ?? null; result.recheck = true;
          } else {
            await writeFile(dispatchFile, JSON.stringify({ case: business.id, model, phase, maxCredits, startedAt: new Date().toISOString(), status: 'reserved-before-dispatch' }, null, 2));
            generated = await service.generate('benchmark', 'benchmark', { revision: versions.length, brief, instruction: phase === 'create' ? `Crea el sitio de ${business.name}. ${business.business}. ${business.style}${assetBuffer ? ' Usa la imagen suministrada, recurso de prueba; no inventes afirmaciones a partir de ella.' : ''}` : 'Cambia solo el texto del título principal a «Hecho para disfrutar». Conserva el resto del diseño.', assetUrls, model, maxCredits }, undefined, media.map((asset, index) => ({ url: asset.url, role: 'product' as const, description: 'Imagen sintética de prueba de ' + business.products[index] })), undefined, { onDispatch: () => { void writeFile(dispatchFile, JSON.stringify({ case: business.id, model, phase, maxCredits, startedAt: new Date().toISOString(), status: 'dispatched' }, null, 2)); }, onAttempts: attempts => { void writeFile(join(folder, phase + '-attempts.json'), JSON.stringify(attempts, null, 2)); } });
          }
          result.generationMs = Date.now() - started;
          result.credits = generated.generation.credits; result.attempts = generated.generation.attempts;
          const version = versions.at(-1);
          const design = version.snapshot.files.find((file: any) => file.path === 'design-direction.json');
          result.design = design ? JSON.parse(design.content) : null;
          result.brief = brief;
          result.sourceDigest = createHash('sha256').update(JSON.stringify(version.snapshot.files)).digest('hex');
          for (const file of version.snapshot.files) {
            const local = join(folder, ...(replay ? ['rechecked'] : []), phase, file.path); await mkdir(resolve(local, '..'), { recursive: true });
            let source = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
            if (file.path === 'config.js') source = `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...JSON.parse(file.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, '')), demo: true, slug: key, apiBaseUrl: origin + '/v1', checkoutOrigin: origin })};`;
            await writeFile(local, source, 'utf8');
            content.set(`/${key}/${phase}/${file.path}`, { content: source, type: mime[extname(file.path)] || 'text/plain' });
          }
          await page.goto(`${origin}/${key}/${phase}/index.html`);
          if (isShop) await page.locator('[data-pagosya-catalog] [data-add="p0"]').first().waitFor({ state: 'visible' });
          else await page.locator('h1').first().waitFor({ state: 'visible' });
          await page.evaluate(() => (globalThis as any).document.fonts.ready);
          result.designChecks = [];
          // Capture the design before commerce checks so a checkout failure cannot hide it.
          for (const [label, width, height] of [['desktop', 1280, 844], ['mobile', 390, 844]] as const) {
            await page.setViewportSize({ width, height });
            const layout = result.design?.concepts[result.design.selected]?.layout;
            const metrics = await page.evaluate(`(() => {
              const layout = ${JSON.stringify(layout) || 'null'};
              const isShop = ${isShop};
              const rect = el => { if (!el) return null; const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width && r.height && s.visibility!=='hidden' && s.display!=='none' ? {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height} : null; };
              const opening = el => { const r=rect(el); return r && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth; };
              const cards = [...document.querySelectorAll('[data-pagosya-catalog] .menu-item')];
              const firstProductVisible = cards.some(card => opening(card.querySelector('[data-product-field="name"],.menu-item__name,h3')) && opening(card.querySelector('[data-product-field="price"],.menu-item__price')) && opening(card.querySelector('[data-add]')));
              const cartVisible = [...document.querySelectorAll('header [data-cart-open]')].some(opening);
              const cartNamed = [...document.querySelectorAll('header [data-cart-open]')].filter(opening).some(el => /pedido|carrito|cart|bag|order|bolsa/i.test(el.getAttribute('aria-label') || el.textContent || ''));
              const brokenImages = [...document.images].filter(image => image.currentSrc && image.naturalWidth === 0).length;
              return {width:innerWidth,catalogTop:rect(document.querySelector('[data-pagosya-catalog]'))?.top,firstProductVisible,cartVisible,cartNamed,font:getComputedStyle(document.querySelector('h1')||document.body).fontFamily,images:document.images.length,brokenImages,passed:brokenImages===0&&(!layout?.productsInOpening||firstProductVisible)&&(layout?.standaloneIntro!==false||(rect(document.querySelector('[data-pagosya-catalog]'))?.top??Infinity)<=320)&&(!isShop||(cartVisible&&cartNamed))};
            })()`);
            result.designChecks.push(metrics);
            const screenshot = join(folder, `${replay ? 'recheck-' : ''}${phase}-${label}.png`);
            await page.screenshot({ path: screenshot, fullPage: true }); result.screenshots.push(screenshot);
          }
          result.designPassed = result.designChecks.every((check: any) => check.passed);
          await page.setViewportSize({ width: 1280, height: 844 });
          if (isShop) {
          // Follow each rendered detail link; direct URL checks miss authored
          // scripts that accidentally remove the runtime-bound product ID.
          if (version.snapshot.files.some((file: any) => file.path === 'product.html')) {
            for (let index = 0; index < business.products.length; index++) {
              await page.goto(`${origin}/${key}/${phase}/index.html`);
              const card = page.locator('[data-pagosya-catalog] .menu-item').nth(index);
              const detailLink = card.locator('a[data-product-link]:visible,a.menu-item__details').first();
              await detailLink.focus();
              await page.keyboard.press('Enter');
              await page.getByRole('heading', { name: business.products[index], exact: true }).waitFor();
            }
            result.productLinksPassed = true;
            await page.goto(`${origin}/${key}/${phase}/index.html`);
          }
          await page.locator('[data-pagosya-catalog] [data-add="p0"]').first().click();
          await page.locator('header [data-cart-open]:visible').first().focus();
          await page.keyboard.press('Enter');
          await page.getByRole('dialog', { name: 'Tu pedido', exact: true }).waitFor({ state: 'visible' });
          result.cartKeyboardPassed = true;
          await page.getByRole('dialog', { name: 'Tu pedido', exact: true }).locator('[data-checkout]').click();
          await page.locator('[data-checkout-review=review] [data-pay]').first().waitFor({ state: 'visible' });
          await page.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
          await page.getByRole('button', { name: 'Completar prueba' }).click();
          await page.getByText('Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.', { exact: true }).first().waitFor();
          result.commercePassed = true;
          if (version.snapshot.files.some((file: any) => file.path === 'product.html')) {
            await page.goto(`${origin}/${key}/${phase}/product.html?id=p0`);
            await page.getByRole('heading', {name: business.products[0], exact: true}).waitFor();
            const deliveryTab = page.getByRole('tab', {name: 'Envíos y retiro'});
            if (await deliveryTab.count()) await deliveryTab.click();
            for (const [label, width, height] of [['desktop',1280,900],['mobile',390,844]] as const) {
              await page.setViewportSize({width,height});
              await page.screenshot({path:join(folder, `${replay ? 'recheck-' : ''}${phase}-product-${label}.png`),fullPage:true});
            }
            await page.locator('.product-detail__buy[data-add="p0"]').first().click();
            await page.goto(`${origin}/${key}/${phase}/checkout.html`);
            await page.locator('[data-checkout-review=review] [data-pay]').first().waitFor({ state: 'visible' });
            for (const [label, width, height] of [['desktop',1280,900],['mobile',390,844]] as const) {
              await page.setViewportSize({width,height});
              await page.screenshot({path:join(folder, `${replay ? 'recheck-' : ''}${phase}-checkout-${label}.png`),fullPage:true});
            }
          }
          } else {
            result.presentationPassed = await page.locator('[data-pagosya-contact]').count() > 0;
          }
          await page.goto(`${origin}/${key}/${phase}/index.html`);
          if (isShop) await page.locator('[data-pagosya-catalog] [data-add="p0"]').first().waitFor({ state: 'visible' });
          else await page.locator('h1').first().waitFor({ state: 'visible' });
          if (phase === 'edit') await page.getByRole('heading', { name: /Hecho para disfrutar/ }).first().waitFor();
          let responsive = true, pricesReadable = true;
          for (const [label, width, height] of [['desktop', 1280, 844], ['mobile', 390, 844]] as const) {
            await page.setViewportSize({ width, height });
            responsive &&= await page.evaluate('document.documentElement.scrollWidth <= innerWidth');
            pricesReadable &&= await page.evaluate(`Array.from(document.querySelectorAll('.menu-item')).every(card => {
              const price = card.querySelector('.menu-item__price'), add = card.querySelector('.menu-add');
              if (!price || !add) return false;
              const p = price.getBoundingClientRect(), a = add.getBoundingClientRect();
              return p.width > 0 && p.height > 0 && !(p.left < a.right && p.right > a.left && p.top < a.bottom && p.bottom > a.top);
            })`);
            const screenshot = join(folder, `${replay ? 'recheck-' : ''}${phase}-${label}.png`); await page.screenshot({ path: screenshot, fullPage: true });
          }
          result.responsive = responsive; result.pricesReadable = pricesReadable; result.pageErrors = pageErrors;
          result.usable = result.designPassed && responsive && pricesReadable && pageErrors.length === 0 && (isShop ? result.commercePassed : result.presentationPassed);
          if (result.usable && !replay) result.timeToUsableMs = Date.now() - started;
          if (replay) result.verificationMs = Date.now() - started;
        } catch (e) {
          result.error = e instanceof Error ? e.message : 'Unknown failure';
          if (e instanceof SourceProviderQuotaException) haltReason = 'provider-quota';
          result.attempts = runs.at(-1)?.attempts || result.attempts;
          const failureScreenshot = join(folder, `${replay ? 'recheck-' : ''}${phase}-failure.png`);
          await page.screenshot({ path: failureScreenshot, fullPage: true }).then(() => result.screenshots.push(failureScreenshot)).catch(() => {});
        } finally { await context.close(); }
        const knownUsage = result.attempts.length && result.attempts.every((a: any) => a.usage);
        result.providerMicroUsd = replay ? 0 : knownUsage ? result.attempts.reduce((n: number, a: any) => n + a.usage.providerMicroUsd, 0) : null;
        result.elapsedMs = Date.now() - started; results.push(result);
        await writeFile(join(output, replay ? 'verification.json' : 'results.json'), JSON.stringify({ createdAt: new Date().toISOString(), plan: preflight, haltReason, methodology: 'Production generator; synthetic catalog; simulated checkout; desktop/mobile overflow and JS errors. Visual quality requires human review. One trial is not a model ranking.', results }, null, 2));
        console.log(`${key} ${phase}: ${result.usable ? 'usable' : 'failed'}; ${Math.round(result.elapsedMs / 1000)}s; ${result.credits} credits${result.error ? '; ' + result.error.slice(0, 160) : ''}`);
      }
    }
  } finally { await browser.close(); server.close(); globalThis.fetch = providerFetch; }
  await writeFile(join(output, replay ? 'verification.json' : 'results.json'), JSON.stringify({ createdAt: new Date().toISOString(), plan: preflight, haltReason, methodology: 'Production generator; synthetic businesses; simulated checkout; bounded smoke only. Human review and 36-output comparison remain incomplete.', results }, null, 2));
  const lines = [replay ? '# Saved source verification (no model calls)' : '# Source generation benchmark', '', `Arm: ${arm}. Synthetic businesses; simulated checkout only. Visual quality is pending human review. Results include failed attempts. A single trial is not a ranking.`, `Planned ${preflight.plannedRequests} requests; recorded ${results.length}. Maximum allowance $${preflight.estimatedBudgetUsd.toFixed(2)}. Halt: ${haltReason || 'none'}. Human approval remains separate.`, '', '| Business | Arm | Choice | Task | Usable | Seconds to usable | Credits | Estimated API USD |', '|---|---|---|---|---|---:|---:|---:|', ...results.map(r => `| ${r.case} | ${r.arm} | ${r.requestedModel} | ${r.phase} | ${r.usable} | ${r.timeToUsableMs === null ? '—' : (r.timeToUsableMs / 1000).toFixed(1)} | ${r.credits} | ${r.providerMicroUsd === null ? 'unknown' : (r.providerMicroUsd / 1e6).toFixed(4)} |`)];
  await writeFile(join(output, replay ? 'VERIFICATION.md' : 'REPORT.md'), lines.join('\n') + '\n');
  const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const relativeImage = (path: string) => path.slice(output.length + 1).split('/').map(encodeURIComponent).join('/');
  await writeFile(join(output, replay ? 'verification.html' : 'comparison.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Storefront design comparison</title><style>body{font:16px system-ui;margin:32px;background:#f5f3ef;color:#212121}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:24px}article{background:white;padding:20px;border:1px solid #ddd}img{width:100%;height:auto;border:1px solid #eee}p{line-height:1.5}summary{cursor:pointer}small{color:#555}</style><h1>Generated storefront comparison</h1><p>Synthetic café/store · simulated checkout · estimated API cost including repairs. This sample is not a ranking.</p><p>Review: brief fidelity, typography, layout, useful content, mobile usability, and preservation of design after the title edit. Scores are intentionally left for review.</p><main>${results.map(r => `<article><h2>${escape(r.case)} · concept ${r.design?.selected ?? "unknown"} · ${escape(r.phase)}</h2><p>${escape(r.case)} · ${r.usable ? 'Automated checks passed' : 'Needs review'} · API estimate: ${r.providerMicroUsd === null ? 'unknown' : '$' + (r.providerMicroUsd / 1e6).toFixed(4)} · elapsed ${(r.elapsedMs / 1000).toFixed(1)}s</p>${r.error ? `<p>${escape(r.error)}</p>` : ''}${r.screenshots.map((path: string) => `<details open><summary>${escape(path.split('/').at(-1))}</summary><a href="${relativeImage(path)}"><img loading="lazy" src="${relativeImage(path)}" alt="${escape(r.requestedModel)} ${escape(r.phase)} screenshot"></a></details>`).join('')}</article>`).join('')}</main></html>`);
  console.log(`Results: ${join(output, replay ? 'VERIFICATION.md' : 'REPORT.md')}`);
}
main().catch(error => { server.close(); console.error(error.message); process.exitCode = 1; });
