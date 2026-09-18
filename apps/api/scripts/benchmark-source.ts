/** Runs the production source generator against synthetic businesses, never merchant data.
 * Usage: node --env-file=.env -r ts-node/register scripts/benchmark-source.ts --models auto,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol --cases cafe,shop --out ../../tmp/source-benchmark
 */
import 'reflect-metadata';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { SourceGenerationService } from '../src/stores/source-generation.service';
import { sourceProjectSnapshot } from '../src/stores/source-project';
import { SOURCE_MODEL_CHOICES, type SourceModelChoice } from '../src/stores/source-generation-policy';
import { sourceDesignExploration } from '../src/stores/source-design';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const output = resolve(option('--out', '../../tmp/source-benchmark'));
const models = option('--models', 'gpt-5.6-terra,deepseek-v4-flash').split(',') as SourceModelChoice[];
const requestedCases = option('--cases', 'cafe').split(',');
const repeats = Number(option('--repeats', '1'));
const maxCredits = Number(option('--max-credits', '25'));
if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 500) throw new Error('Invalid max credits (1–500).');
if (!models.length || models.some(m => !SOURCE_MODEL_CHOICES.includes(m)) || !Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('Invalid models or repeats (1–5).');
const cases = [
  { id: 'cafe', name: 'Café del Patio', business: 'Cafetería de barrio en La Paz', style: 'Carta editorial cálida, crema y verde bosque. Tipografía legible y pedido visible.', products: ['Café filtrado', 'Café con leche', 'Pan de chocolate'] },
  { id: 'shop', name: 'Taller Sur', business: 'Tienda de cerámica artesanal en La Paz', style: 'Catálogo sobrio con fondo claro, títulos amplios, acento terracota y una compra sencilla.', products: ['Taza de cerámica', 'Cuenco de cerámica', 'Jarrón pequeño'] },
  { id: 'breakfast', name: 'Mesa Temprana', business: 'Desayunos para compartir en La Paz', style: 'Usa la imagen de desayuno suministrada como foco visual, conserva el aspecto de los alimentos. Es una ilustración de prueba, no fotografía real del comercio.', products: ['Desayuno para compartir', 'Café de la mañana', 'Pan del día'] },
].filter(c => requestedCases.includes(c.id));
if (!cases.length || requestedCases.some(id => !cases.some(c => c.id === id))) throw new Error('Available cases: cafe,shop,breakfast');
if (args.includes('--open-direction')) for (const business of cases) business.style = 'Dirección visual completamente libre: inventa una composición propia para este negocio. No hay colores, tipografías ni estructura predefinidos. El pedido debe ser fácil de encontrar.';
const phases = args.includes('--create-only') ? ['create'] : ['create', 'edit'];
const cycleConcepts = args.includes('--cycle-concepts');
const preflight = { models, cases: cases.map(c => c.id), repeats, phases, cycleConcepts, maxCreditsPerRequest: maxCredits, plannedRequests: models.length * cases.length * repeats * phases.length, estimatedBudgetUsd: models.length * cases.length * repeats * phases.length * maxCredits / 100 };
if (args.includes('--dry-run')) { console.log(JSON.stringify(preflight, null, 2)); process.exit(0); }
if (!args.includes('--recheck')) {
  for (const model of models) {
    const key = model.startsWith('deepseek-') ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY';
    if (!process.env[key]) throw new Error(`${key} is required for ${model}. No generation was started.`);
  }
  console.log(JSON.stringify(preflight));
}
const requireStudio = createRequire(resolve('../merchant-studio/package.json'));
const { chromium } = requireStudio('@playwright/test');
const replay = args.includes('--recheck');
const results: any[] = [];
const content = new Map<string, { content: string | Buffer; type: string }>();
const mime: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://local').pathname;
  const file = content.get(pathname) || [...content.entries()].reverse().find(([key]) => key.endsWith(pathname))?.[1];
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' }); res.end(file.content);
});

async function main() {
  if (!replay && await access(join(output, 'results.json')).then(() => true, () => false)) throw new Error('This folder already contains results. Choose a new --out folder or use --recheck (no API calls).');
  await mkdir(output, { recursive: true });
  const generatorDigest = createHash('sha256').update((await Promise.all(['source-generation.service.ts','source-design.ts','source-design-planner.ts','source-fonts.ts','source-kit/commerce.js'].map(path => readFile(resolve('src/stores', path))))).map(buffer => buffer.toString('utf8')).join('\n')).digest('hex');
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const browser = await chromium.launch();
  try {
    for (const business of cases) for (const model of models) for (let repeat = 1; repeat <= repeats; repeat++) {
      const key = `${business.id}-${model}-${repeat}`;
      const folder = join(output, key); await mkdir(folder, { recursive: true });
      const versions: any[] = [], runs: any[] = [];
      const assetUrl = '/v1/uploads/00000000-0000-4000-8000-000000000001.webp';
      const assetBuffer = business.id === 'breakfast' ? await readFile(resolve('../../examples/independent-cafe/assets/breakfast.webp')) : null;
      const store = { storeName: business.name, tagline: business.business, checkoutMode: 'payment', categories: [], locations: [], items: business.products.map((name, index) => ({ id: `p${index}`, name, description: name, amount: 2000 + index * 1000, currency: 'BOB', stock: 10, imageUrls: [], variants: [], extras: [] })) };
      if (assetBuffer) (store.items[0].imageUrls as string[]).push(new URL(assetUrl, process.env.PUBLIC_API_URL || 'http://localhost:3001/v1').href);
      const prisma: any = { mediaAsset: { findMany: async () => assetBuffer ? [{ url: assetUrl }] : [] }, store: { findFirst: async () => ({ slug: 'benchmark' }) }, storeSourceGeneration: {
        create: async ({ data }: any) => { const run = { ...data, id: `run-${runs.length}` }; runs.push(run); return run; },
        updateMany: async ({ where, data }: any) => { if (where.id) Object.assign(runs.find(r => r.id === where.id), data); return { count: 1 }; },
      } };
      const projects: any = { current: async () => ({ revision: versions.length, slug: "benchmark" }), version: async (_m: string, _s: string, revision: number) => versions[revision - 1],
        save: async (_m: string, _s: string, input: any, generation: any) => {
          const snapshot = sourceProjectSnapshot(input);
          const version = { revision: versions.length + 1, label: input.label, snapshot }; versions.push(version);
          await prisma.storeSourceGeneration.updateMany({ where: { id: generation.id }, data: generation.data }); return version;
        } };
      const config: any = { get: (name: string) => ({ 'app.openAi.apiKey': process.env.OPENAI_API_KEY, 'app.openAi.enabled': true, 'app.deepSeek.apiKey': process.env.DEEPSEEK_API_KEY, 'app.deepSeek.enabled': true, 'app.environment': 'test', 'app.checkoutOrigin': origin, 'app.port': 3001 } as any)[name] };
      class BenchmarkGenerator extends SourceGenerationService {
        protected exploreDesign() { return cycleConcepts ? sourceDesignExploration((repeat - 1) % 3) : super.exploreDesign(); }
      }
      const service = new BenchmarkGenerator(prisma, { getStorePublic: async () => structuredClone(store) } as any, projects, { getBuffer: async () => assetBuffer, contentTypeFor: () => 'image/webp' } as any, config);
      const brief = { businessType: business.business, audience: 'Clientes de La Paz', primaryAction: 'Explorar el catálogo y hacer un pedido', visualDirection: business.style };
      for (const phase of phases) {
        if (phase === 'edit' && !versions.length) break;
        const started = Date.now();
        const result: any = { generatorDigest, requestedConcept: cycleConcepts ? (repeat - 1) % 3 : null, costBasis: model.startsWith('deepseek-') ? 'DeepSeek peak-rate estimate; off-peak invoice may be lower' : 'OpenAI standard-rate estimate', maxCredits, case: business.id, requestedModel: model, repeat, phase, usable: false, generationMs: null, timeToUsableMs: null, providerMicroUsd: null, credits: 0, attempts: [], visualReview: 'pending', screenshots: [] };
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
            files.find(f => f.path === 'commerce.js')!.content = await readFile(resolve('src/stores/source-kit/commerce.js'), 'utf8');
            versions.push({ snapshot: { files } });
            generated = { generation: { credits: 0, attempts: [] } };
            result.originalGenerationMs = original?.generationMs ?? null; result.recheck = true;
          } else {
            generated = await service.generate('benchmark', 'benchmark', { revision: versions.length, brief, instruction: phase === 'create' ? `Crea el sitio de ${business.name}. ${business.business}. ${business.style}${assetBuffer ? ' Usa la imagen de desayuno suministrada; es una ilustración de prueba.' : ''}` : 'Cambia solo el texto del título principal a «Hecho para disfrutar». Conserva el resto del diseño.', assetUrls: assetBuffer ? [assetUrl] : [], model, maxCredits });
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
          await page.locator('[data-pagosya-catalog] [data-add="p0"]').first().waitFor({ state: 'visible' });
          await page.evaluate(() => (globalThis as any).document.fonts.ready);
          result.designChecks = [];
          // Capture the design before commerce checks so a checkout failure cannot hide it.
          for (const [label, width, height] of [['desktop', 1280, 844], ['mobile', 390, 844]] as const) {
            await page.setViewportSize({ width, height });
            const layout = result.design?.concepts[result.design.selected]?.layout;
            const metrics = await page.evaluate(`(() => {
              const layout = ${JSON.stringify(layout) || 'null'};
              const rect = el => { if (!el) return null; const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width && r.height && s.visibility!=='hidden' && s.display!=='none' ? {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height} : null; };
              const opening = el => { const r=rect(el); return r && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth; };
              const cards = [...document.querySelectorAll('[data-pagosya-catalog] .menu-item')];
              const firstProductVisible = cards.some(card => opening(card.querySelector('[data-product-field="name"],.menu-item__name,h3')) && opening(card.querySelector('[data-product-field="price"],.menu-item__price')) && opening(card.querySelector('[data-add]')));
              const cartVisible = [...document.querySelectorAll('header [data-cart-open]')].some(opening);
              const brokenImages = [...document.images].filter(image => image.currentSrc && image.naturalWidth === 0).length;
              return {width:innerWidth,catalogTop:rect(document.querySelector('[data-pagosya-catalog]'))?.top,firstProductVisible,cartVisible,font:getComputedStyle(document.querySelector('h1')||document.body).fontFamily,images:document.images.length,brokenImages,passed:brokenImages===0&&(!layout?.productsInOpening||firstProductVisible)&&(layout?.standaloneIntro!==false||(rect(document.querySelector('[data-pagosya-catalog]'))?.top??Infinity)<=320)&&(innerWidth>=650||cartVisible)};
            })()`);
            result.designChecks.push(metrics);
            const screenshot = join(folder, `${replay ? 'recheck-' : ''}${phase}-${label}.png`);
            await page.screenshot({ path: screenshot, fullPage: true }); result.screenshots.push(screenshot);
          }
          result.designPassed = result.designChecks.every((check: any) => check.passed);
          await page.setViewportSize({ width: 1280, height: 844 });
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
          await page.locator('header [data-cart-open]').first().click();
          await page.getByRole('dialog', { name: 'Tu pedido', exact: true }).locator('[data-checkout]').click();
          await page.locator('[data-checkout-review=review] [data-pay]').first().waitFor({ state: 'visible' });
          await page.getByRole('button', { name: 'Continuar al pago de prueba' }).click();
          await page.getByRole('button', { name: 'Completar prueba' }).click();
          await page.getByText('Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.', { exact: true }).first().waitFor();
          result.commercePassed = true;
          if (version.snapshot.files.some((file: any) => file.path === 'product.html')) {
            await page.goto(`${origin}/${key}/${phase}/product.html?id=p0`);
            await page.getByRole('heading', {name: business.products[0], exact: true}).waitFor();
            await page.getByRole('tab', {name: 'Envíos y retiro'}).click();
            for (const [label, width, height] of [['desktop',1280,900],['mobile',390,844]] as const) {
              await page.setViewportSize({width,height});
              await page.screenshot({path:join(folder, `${replay ? 'recheck-' : ''}${phase}-product-${label}.png`),fullPage:true});
            }
            await page.goto(`${origin}/${key}/${phase}/checkout.html`);
            await page.locator('[data-checkout-review=review] [data-pay]').first().waitFor({ state: 'visible' });
            for (const [label, width, height] of [['desktop',1280,900],['mobile',390,844]] as const) {
              await page.setViewportSize({width,height});
              await page.screenshot({path:join(folder, `${replay ? 'recheck-' : ''}${phase}-checkout-${label}.png`),fullPage:true});
            }
          }
          await page.goto(`${origin}/${key}/${phase}/index.html`);
          await page.locator('[data-pagosya-catalog] [data-add="p0"]').first().waitFor({ state: 'visible' });
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
          result.usable = result.designPassed && responsive && pricesReadable && pageErrors.length === 0;
          if (result.usable && !replay) result.timeToUsableMs = Date.now() - started;
          if (replay) result.verificationMs = Date.now() - started;
        } catch (e) {
          result.error = e instanceof Error ? e.message : 'Unknown failure';
          result.attempts = runs.at(-1)?.attempts || result.attempts;
          const failureScreenshot = join(folder, `${replay ? 'recheck-' : ''}${phase}-failure.png`);
          await page.screenshot({ path: failureScreenshot, fullPage: true }).then(() => result.screenshots.push(failureScreenshot)).catch(() => {});
        } finally { await context.close(); }
        const knownUsage = result.attempts.length && result.attempts.every((a: any) => a.usage);
        result.providerMicroUsd = replay ? 0 : knownUsage ? result.attempts.reduce((n: number, a: any) => n + a.usage.providerMicroUsd, 0) : null;
        result.elapsedMs = Date.now() - started; results.push(result);
        await writeFile(join(output, replay ? 'verification.json' : 'results.json'), JSON.stringify({ createdAt: new Date().toISOString(), methodology: 'Production generator; synthetic catalog; simulated checkout; desktop/mobile overflow and JS errors. Visual quality requires human review. One trial is not a model ranking.', results }, null, 2));
        console.log(`${key} ${phase}: ${result.usable ? 'usable' : 'failed'}; ${Math.round(result.elapsedMs / 1000)}s; ${result.credits} credits${result.error ? '; ' + result.error.slice(0, 160) : ''}`);
      }
    }
  } finally { await browser.close(); server.close(); }
  const lines = [replay ? '# Saved source verification (no model calls)' : '# Source generation benchmark', '', 'Synthetic businesses; simulated checkout only. Visual quality is pending human review. Results include failed attempts. A single trial is not a ranking.', '', '| Business | Choice | Task | Usable | Seconds to usable | Credits | Estimated API USD |', '|---|---|---|---|---:|---:|---:|', ...results.map(r => `| ${r.case} | ${r.requestedModel} | ${r.phase} | ${r.usable} | ${r.timeToUsableMs === null ? '—' : (r.timeToUsableMs / 1000).toFixed(1)} | ${r.credits} | ${r.providerMicroUsd === null ? 'unknown' : (r.providerMicroUsd / 1e6).toFixed(4)} |`)];
  await writeFile(join(output, replay ? 'VERIFICATION.md' : 'REPORT.md'), lines.join('\n') + '\n');
  const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const relativeImage = (path: string) => path.slice(output.length + 1).split('/').map(encodeURIComponent).join('/');
  await writeFile(join(output, replay ? 'verification.html' : 'comparison.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Storefront design comparison</title><style>body{font:16px system-ui;margin:32px;background:#f5f3ef;color:#212121}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:24px}article{background:white;padding:20px;border:1px solid #ddd}img{width:100%;height:auto;border:1px solid #eee}p{line-height:1.5}summary{cursor:pointer}small{color:#555}</style><h1>Generated storefront comparison</h1><p>Synthetic café/store · simulated checkout · estimated API cost including repairs. DeepSeek uses conservative peak rates. This sample is not a ranking.</p><p>Review: brief fidelity, typography, layout, useful content, mobile usability, and preservation of design after the title edit. Scores are intentionally left for review.</p><main>${results.map(r => `<article><h2>${escape(r.case)} · concept ${r.design?.selected ?? "unknown"} · ${escape(r.phase)}</h2><p>${escape(r.case)} · ${r.usable ? 'Automated checks passed' : 'Needs review'} · API estimate: ${r.providerMicroUsd === null ? 'unknown' : '$' + (r.providerMicroUsd / 1e6).toFixed(4)} · elapsed ${(r.elapsedMs / 1000).toFixed(1)}s</p>${r.error ? `<p>${escape(r.error)}</p>` : ''}${r.screenshots.map((path: string) => `<details open><summary>${escape(path.split('/').at(-1))}</summary><a href="${relativeImage(path)}"><img loading="lazy" src="${relativeImage(path)}" alt="${escape(r.requestedModel)} ${escape(r.phase)} screenshot"></a></details>`).join('')}</article>`).join('')}</main></html>`);
  console.log(`Results: ${join(output, replay ? 'VERIFICATION.md' : 'REPORT.md')}`);
}
main().catch(error => { server.close(); console.error(error.message); process.exitCode = 1; });
