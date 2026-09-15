/** Photo-led fixtures: the text-only catalogs with product photography. Local only; never publishes. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { SourceGenerationService } from '../src/stores/source-generation.service';
import { SourceVisualReviewService } from '../src/stores/source-visual-review.service';
import { ProductScenesService, type ProductSceneSetting } from '../src/stores/product-scenes.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { normalizeProductVariants, totalVariantStock } from '../src/payment-links/product-variants';
import { sourceProjectSnapshot, sourceProjectDigest } from '../src/stores/source-project';
import { currentSourceRuntime } from '../src/stores/source-runtime';
import { captureSourceVisuals, probeSourceShopping } from '../src/stores/source-visual-capture';
import { designCaptureFailures } from '../src/stores/source-design-evaluator';

type Product = { slug: string; name: string; description: string; amount: number; group: string; values: string[]; tags?: string[]; look: string };
type Fixture = { id: string; name: string; business: string; audience: string; direction: string; scene: ProductSceneSetting; products: Product[] };

// Same catalogs as the text-only benchmark; each product gains a packshot and a YAPI scene.
const fixtures: Fixture[] = [
  { id: 'apparel', name: 'Trama', business: 'Prendas cotidianas con colores y tallas', audience: 'Adultos que buscan ropa informal', direction: 'Moda contemporánea: contraste tinta y papel, tipografía elegante, acento azul cobalto. Usa la fotografía de producto suministrada.', scene: 'lifestyle', products: [
    { slug: 'camisa', name: 'Camisa de algodón de manga larga', description: 'Algodón, cuello clásico y manga larga. Dos colores, tres tallas.', amount: 14000, group: 'Color', values: ['Crudo', 'Azul'], tags: ['Algodón', 'Manga larga'], look: 'a long-sleeve classic-collar cotton shirt in natural ecru, neatly folded' },
    { slug: 'camiseta', name: 'Camiseta esencial', description: 'Cuello redondo. Disponible en tres tallas.', amount: 8500, group: 'Talla', values: ['S', 'M', 'L'], look: 'a plain crew-neck t-shirt in heather grey, laid flat' } ] },
  { id: 'beauty', name: 'Bruma', business: 'Cuidado cosmético diario en varios volúmenes', audience: 'Personas que eligen formatos para casa y viaje', direction: 'Sereno y contemporáneo: lavanda suave, ciruela y fondo claro, tipografía legible. Usa la fotografía de producto suministrada.', scene: 'natural', products: [
    { slug: 'crema', name: 'Crema de manos', description: 'Crema cosmética sin perfume. Elige el volumen.', amount: 4500, group: 'Volumen', values: ['30 ml', '60 ml'], tags: ['Sin perfume'], look: 'a matte soft-lavender hand cream tube with a plum cap and a small plain label reading "Bruma"' },
    { slug: 'jabon', name: 'Jabón líquido', description: 'Jabón líquido para uso cotidiano.', amount: 3800, group: 'Volumen', values: ['250 ml', '500 ml'], look: 'a frosted glass liquid soap pump bottle with a plum pump and a small plain label reading "Bruma"' } ] },
  { id: 'technical', name: 'Punto', business: 'Accesorios de escritorio con especificaciones claras', audience: 'Personas que equipan un espacio de trabajo', direction: 'Precisión técnica con verde lima, grafito y blanco, diagramación legible. Usa la fotografía de producto suministrada.', scene: 'studio', products: [
    { slug: 'lampara', name: 'Lámpara de escritorio USB-C', description: 'Alimentación USB-C. Brazo ajustable y acabado mate. No incluye adaptador de pared.', amount: 22000, group: 'Color', values: ['Negro', 'Marfil'], tags: ['USB-C', 'Brazo ajustable'], look: 'a minimalist matte black desk lamp with an adjustable arm and a round base, unbranded' },
    { slug: 'soporte', name: 'Soporte para portátil', description: 'Soporte de aluminio para mesa. Dos tamaños.', amount: 16000, group: 'Tamaño', values: ['Compacto', 'Amplio'], tags: ['Aluminio'], look: 'an anodized aluminium laptop stand with a slim angled profile, unbranded' } ] },
  { id: 'home', name: 'Pliegue', business: 'Textiles de hogar con materiales y tamaños', audience: 'Personas que renuevan detalles de su casa', direction: 'Hogar editorial: terracota, rosa apagado y fondo crema con espacios deliberados. Usa la fotografía de producto suministrada.', scene: 'lifestyle', products: [
    { slug: 'cojin', name: 'Funda de cojín', description: 'Funda de lino, cierre oculto. No incluye relleno.', amount: 11000, group: 'Tamaño', values: ['40 × 40 cm', '50 × 50 cm'], tags: ['Lino'], look: 'a square washed-linen cushion cover in terracotta, plain weave, no pattern' },
    { slug: 'manta', name: 'Manta de algodón', description: 'Manta tejida de algodón para sofá.', amount: 18000, group: 'Color', values: ['Arena', 'Arcilla', 'Oliva'], tags: ['Algodón'], look: 'a folded woven cotton throw blanket in sand with a subtle texture and fringed edge' } ] },
];

async function main() {
  const root = resolve(__dirname, '../../../examples/premium-benchmark-photos'); await mkdir(resolve(root, 'fixtures'), { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const settings = app.get(ConfigService); settings.set('app.sourceFramework', 'static'); settings.set('app.sourceDesignJobsEnabled', false); settings.set('app.port', 3001); settings.set('app.checkoutOrigin', 'http://localhost:5175');
    if (!['localhost', '127.0.0.1'].includes(new URL(settings.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local fixtures only');
    const prisma = app.get(PrismaService), stores = app.get(StoresService), projects = app.get(SourceProjectsService), generator = app.get(SourceGenerationService), uploads = app.get(UploadsService), scenes = app.get(ProductScenesService), review = app.get(SourceVisualReviewService);
    const apiKey = settings.getOrThrow<string>('app.openAi.apiKey'), imageModel = settings.getOrThrow<string>('app.openAi.imageModel');

    // Fictional benchmark packshots, generated once and kept with the fixtures for reuse.
    async function packshot(fixture: Fixture, product: Product) {
      const path = resolve(root, 'fixtures', fixture.id, `${product.slug}.jpg`);
      const saved = await readFile(path).catch(() => null); if (saved) return saved;
      const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(150_000),
        body: JSON.stringify({ model: imageModel, n: 1, size: '1024x1024', quality: 'medium', output_format: 'jpeg', output_compression: 88, prompt: `Ecommerce packshot of a fictional product for a store benchmark: ${product.look}. Centered on a plain light warm-grey seamless background, soft even studio light, gentle contact shadow, whole product visible, true-to-life colors. No hands, no props, no extra text beyond what is described, no watermark.` }) });
      const body: any = await response.json();
      if (!response.ok || !body.data?.[0]?.b64_json) throw new Error(`Packshot failed for ${product.slug}: ${body.error?.message || response.status}`);
      const bytes = Buffer.from(body.data[0].b64_json, 'base64');
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); return bytes;
    }

    for (const fixture of fixtures) {
      const id = `${fixture.id}-photo-1`, folder = resolve(root, id); await mkdir(folder, { recursive: true });
      const receiptPath = resolve(folder, 'receipt.json');
      let record: any = await readFile(receiptPath, 'utf8').then(JSON.parse).catch(() => null);
      if (record?.status === 'completed' || record?.status === 'failed' || record?.status === 'interrupted') { console.log(`${id}: ${record.status}`); continue; }
      const start = Date.now();
      try {
        if (!record) {
          const merchant = await prisma.merchant.create({ data: { name: fixture.name + ' · Benchmark fotos', email: `premium-benchmark-${id}-${Date.now()}@local.invalid` } });
          const store = await stores.create(merchant.id, { name: fixture.name, tagline: fixture.business, animations: [] });
          record = { id, fixture: fixture.id, merchantId: merchant.id, storeId: store.id, slug: store.slug, status: 'setup', maxCredits: 200, createdAt: new Date().toISOString(), assets: [], scenes: [] };
          await writeFile(receiptPath, JSON.stringify(record, null, 2));
          for (const product of fixture.products) {
            const stored = await uploads.saveBuffer(await packshot(fixture, product), 'image/jpeg');
            await prisma.mediaAsset.create({ data: { merchantId: merchant.id, storeId: store.id, url: stored.url, storageKey: stored.filename, mimeType: stored.mimeType, byteSize: stored.byteSize } });
            console.log(`${id}: scene for ${product.slug}`);
            const scene = await scenes.create(merchant.id, store.id, { imageUrl: stored.url, productName: product.name, description: product.description, setting: fixture.scene, aspect: 'square' });
            await writeFile(resolve(folder, `scene-${product.slug}.jpg`), (await uploads.getBuffer(scene.url.split('/').at(-1)!))!);
            const variants = normalizeProductVariants(product.values.map((value, i) => ({ name: value, amount: product.amount + i * 700, stock: i === product.values.length - 1 && product.values.length > 2 ? 0 : 12, options: [{ name: product.group, value }] })));
            await prisma.paymentLink.create({ data: { storeId: store.id, name: product.name, description: product.description, amount: product.amount, currency: 'BOB', stock: totalVariantStock(variants), tags: product.tags || [], imageUrls: [stored.url, scene.url], variants: variants as any } });
            record.assets.push(stored.url, scene.url); record.scenes.push({ product: product.slug, url: scene.url });
          }
          record.status = 'ready'; await writeFile(receiptPath, JSON.stringify(record, null, 2));
        }
        const current = await projects.current(record.merchantId, record.storeId);
        if (record.status === 'running' && !current.revision) { record.status = 'interrupted'; record.error = 'Previous paid request may have run. Not automatically replayed.'; throw Object.assign(new Error(record.error), { keep: true }); }
        let revision = current.revision;
        if (!revision) {
          record.status = 'running'; await writeFile(receiptPath, JSON.stringify(record, null, 2)); console.log(`${id}: generating`);
          const generated = await generator.generate(record.merchantId, record.storeId, { revision: 0, maxCredits: 200, model: 'gpt-5.6-sol', motion: 'subtle', brief: { businessType: fixture.business, audience: fixture.audience, primaryAction: 'Elegir un producto y añadirlo al pedido', visualDirection: fixture.direction }, instruction: 'Crea una tienda premium original, coherente y completa en español para este catálogo. Define una jerarquía de compra clara, con opciones propias de cada producto y una página de producto cuidada. Usa una composición deliberada en Inicio, producto y checkout; no repitas cajas de colores sin propósito. Respeta las fotografías y hechos suministrados; deja que la fotografía de producto lidere sin inventar reseñas, beneficios, políticas ni productos. No muestres instrucciones técnicas en la interfaz. Mantén todos los hooks de comercio y la misma identidad a 1280, 768, 390 y 320px. Es una tienda ficticia de evaluación.', assetUrls: record.assets }, undefined, record.assets.map((url: string) => ({ url, role: 'product', description: 'Supplied product photography. Preserve packaging and factual product identity.' })), async stage => { console.log(`${id}: ${stage}`); });
          record.generation = generated.generation; revision = generated.revision;
        }
        const version = await projects.version(record.merchantId, record.storeId, revision);
        const snapshot = sourceProjectSnapshot({ ...(version.snapshot as any), revision: version.revision, label: version.label });
        for (const file of snapshot.files) {
          const path = resolve(folder, 'site', file.path); if (!path.startsWith(resolve(folder, 'site') + '/')) throw new Error('Unsafe export path'); await mkdir(dirname(path), { recursive: true });
          let content: string | Buffer = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
          if (file.path === 'config.js') { const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]); content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...config, demo: true }) + ';\n'; }
          await writeFile(path, content);
        }
        // Evidence renders merchant uploads locally, exactly as design jobs do.
        const rendered = await review.hydrate(await currentSourceRuntime(snapshot), record.merchantId);
        const evidence: any = { revision, digest: sourceProjectDigest(snapshot) };
        for (const page of ['index.html', 'product.html']) {
          if (!rendered.files.some(file => file.path === page)) continue;
          const captures = await captureSourceVisuals(rendered, page), prefix = page === 'index.html' ? 'capture' : 'product-capture';
          evidence[prefix === 'capture' ? 'captures' : 'productCaptures'] = await Promise.all(captures.map(async ({ image, ...capture }, i) => { const path = `${prefix}-${i}.jpg`; await writeFile(resolve(folder, path), Buffer.from(image.split(',')[1], 'base64')); return { ...capture, path }; }));
          evidence[prefix === 'capture' ? 'captureFailures' : 'productCaptureFailures'] = designCaptureFailures(captures);
        }
        evidence.shopping = await probeSourceShopping(rendered);
        await writeFile(resolve(folder, 'evidence.json'), JSON.stringify(evidence, null, 2));
        record = { ...record, status: 'completed', revision, elapsedMs: Date.now() - start };
      } catch (error: any) { record = { ...record, status: error?.keep ? record.status : 'failed', elapsedMs: Date.now() - start, error: error instanceof Error ? error.message : 'Generation failed' }; }
      await writeFile(receiptPath, JSON.stringify(record, null, 2)); console.log(JSON.stringify({ id, status: record.status, credits: record.generation?.credits, error: record.error }));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Photo benchmark failed'); process.exitCode = 1; });
