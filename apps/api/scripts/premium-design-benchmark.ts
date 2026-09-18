/** 6 held-out catalogs × 3 repetitions × 2 workflow arms. Never publishes. */
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
import { UploadsService } from '../src/uploads/uploads.service';
import { normalizeProductVariants, totalVariantStock } from '../src/payment-links/product-variants';
import { sourceProjectDigest } from '../src/stores/source-project';

async function main() {
  const arm = process.argv[2]; if (!['baseline', 'candidate'].includes(arm)) throw new Error('Choose baseline or candidate');
  const root = resolve(__dirname, '../../../examples/premium-benchmark'); await mkdir(root, { recursive: true });
  const demo = JSON.parse(await readFile(resolve(root, '../savia/demo.json'), 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const settings = app.get(ConfigService); settings.set('app.sourceFramework', 'static'); settings.set('app.sourceDesignJobsEnabled', false); settings.set('app.port', 3001); settings.set('app.checkoutOrigin', 'http://localhost:5175');
    if (!['localhost', '127.0.0.1'].includes(new URL(settings.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local fixtures only');
    const prisma = app.get(PrismaService), stores = app.get(StoresService), projects = app.get(SourceProjectsService), generator = app.get(SourceGenerationService), uploads = app.get(UploadsService);
    const originals = await prisma.paymentLink.findMany({ where: { storeId: demo.storeId }, orderBy: { createdAt: 'asc' } });
    const simple = (name: string, description: string, amount: number, group: string, values: string[], tags: string[] = []) => {
      const variants = normalizeProductVariants(values.map((value, i) => ({ name: value, amount: amount + i * 700, stock: i === values.length - 1 && values.length > 2 ? 0 : 12, options: [{ name: group, value }] })));
      return { name, description, amount, currency: 'BOB', variants, stock: totalVariantStock(variants), imageUrls: [] as string[], tags };
    };
    const fixtures = [
      { id: 'food', name: 'Mesa Clara', business: 'Despensa de jugo y granola en formatos individuales y packs', audience: 'Personas que preparan desayunos en casa', direction: 'Editorial cálido, fotografía real del catálogo SAVIA, color cítrico con propósito y compra clara.', products: originals.filter(p => !p.name.includes('Botella')) },
      { id: 'apparel', name: 'Trama', business: 'Prendas cotidianas con colores y tallas', audience: 'Adultos que buscan ropa informal', direction: 'Moda contemporánea: contraste tinta y papel, tipografía elegante, acento azul cobalto. Sin fotografías disponibles: no inventarlas.', products: [(() => { const variants = normalizeProductVariants(['Crudo', 'Azul'].flatMap((color, i) => ['S', 'M', 'L'].map((size, j) => ({ name: color + ' / ' + size, amount: 14000 + i * 1000, stock: i === 1 && j === 2 ? 0 : 8, options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }] })))); return { name: 'Camisa de algodón de manga larga', description: 'Algodón, cuello clásico y manga larga. Dos colores, tres tallas.', amount: 14000, currency: 'BOB', variants, stock: totalVariantStock(variants), imageUrls: [], tags: ['Algodón', 'Manga larga'] }; })(), simple('Camiseta esencial', 'Cuello redondo. Disponible en tres tallas.', 8500, 'Talla', ['S', 'M', 'L'])] },
      { id: 'beauty', name: 'Bruma', business: 'Cuidado cosmético diario en varios volúmenes', audience: 'Personas que eligen formatos para casa y viaje', direction: 'Sereno y contemporáneo: lavanda suave, ciruela y fondo claro, tipografía legible. Sin fotos; trabajar con el catálogo y tipografía sin dibujar envases.', products: [simple('Crema de manos', 'Crema cosmética sin perfume. Elige el volumen.', 4500, 'Volumen', ['30 ml', '60 ml'], ['Sin perfume']), simple('Jabón líquido', 'Jabón líquido para uso cotidiano.', 3800, 'Volumen', ['250 ml', '500 ml'])] },
      { id: 'technical', name: 'Punto', business: 'Accesorios de escritorio con especificaciones claras', audience: 'Personas que equipan un espacio de trabajo', direction: 'Precisión técnica con verde lima, grafito y blanco, diagramación legible. No hay fotos ni diagramas suministrados: no inventar dibujos de productos.', products: [simple('Lámpara de escritorio USB-C', 'Alimentación USB-C. Brazo ajustable y acabado mate. No incluye adaptador de pared.', 22000, 'Color', ['Negro', 'Marfil'], ['USB-C', 'Brazo ajustable']), simple('Soporte para portátil', 'Soporte de aluminio para mesa. Dos tamaños.', 16000, 'Tamaño', ['Compacto', 'Amplio'], ['Aluminio'])] },
      { id: 'home', name: 'Pliegue', business: 'Textiles de hogar con materiales y tamaños', audience: 'Personas que renuevan detalles de su casa', direction: 'Hogar editorial: terracota, rosa apagado y fondo crema con espacios deliberados. No hay fotografías: no usar imágenes ajenas ni inventar el aspecto del producto.', products: [simple('Funda de cojín', 'Funda de lino, cierre oculto. No incluye relleno.', 11000, 'Tamaño', ['40 × 40 cm', '50 × 50 cm'], ['Lino']), simple('Manta de algodón', 'Manta tejida de algodón para sofá.', 18000, 'Color', ['Arena', 'Arcilla', 'Oliva'], ['Algodón'])] },
      { id: 'single', name: 'Aire', business: 'Una botella reutilizable con colores y capacidades', audience: 'Personas que llevan agua durante el día', direction: 'Una pieza, muy bien presentada. Fotografía proporcionada de SAVIA, fondo cálido claro, color en las botellas y opciones visibles.', products: originals.filter(p => p.name.includes('Botella')) },
    ];
    await writeFile(resolve(root, 'methodology.json'), JSON.stringify({ cases: fixtures.map(f => ({ ...f, products: f.products.map(p => ({ name: p.name, description: p.description, amount: p.amount, variants: p.variants })) })), repetitions: 3, arms: ['baseline', 'candidate'], model: 'gpt-5.6-sol', maxCreditsPerGeneration: 200, notes: 'Both arms use the same current generator. Candidate additionally receives the durable review/repair workflow. Independent initial generations; identical fixture briefs, catalog and owned photo bytes. No publication or live purchases.' }, null, 2));
    for (const fixture of fixtures) for (let repeat = 1; repeat <= 3; repeat++) {
      const id = `${fixture.id}-${repeat}-${arm}`, folder = resolve(root, id); await mkdir(folder, { recursive: true });
      const receiptPath = resolve(folder, 'receipt.json');
      let record: any = await readFile(receiptPath, 'utf8').then(JSON.parse).catch(() => null);
      if (record?.status === 'completed' || record?.status === 'failed') continue;
      if (!record) {
        const merchant = await prisma.merchant.create({ data: { name: fixture.name + ' · Benchmark', email: `premium-benchmark-${id}-${Date.now()}@local.invalid` } });
        const store = await stores.create(merchant.id, { name: fixture.name, tagline: fixture.business, animations: [] });
        record = { id, arm, fixture: fixture.id, repeat, merchantId: merchant.id, storeId: store.id, slug: store.slug, status: 'setup', maxCredits: 200, createdAt: new Date().toISOString() };
        await writeFile(receiptPath, JSON.stringify(record, null, 2));
        const urls = [...new Set(fixture.products.flatMap(p => [...p.imageUrls, ...(p.variants as any[]).flatMap(v => v.imageUrl ? [v.imageUrl] : [])]))];
        const mapped = new Map<string, string>();
        for (const url of urls) {
          const bytes = await uploads.getBuffer(url.split('/').at(-1)!); if (!bytes) throw new Error('Missing fixture image');
          const asset = await uploads.saveBuffer(bytes, 'image/jpeg');
          await prisma.mediaAsset.create({ data: { merchantId: merchant.id, storeId: store.id, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } }); mapped.set(url, asset.url);
        }
        for (const p of fixture.products) await prisma.paymentLink.create({ data: { storeId: store.id, name: p.name, description: p.description, amount: p.amount, currency: p.currency, stock: p.stock, tags: p.tags, imageUrls: p.imageUrls.map(url => mapped.get(url)!), variants: (p.variants as any[]).map(v => ({ ...v, ...(v.imageUrl ? { imageUrl: mapped.get(v.imageUrl) } : {}) })) } });
        record.assets = [...mapped.values()]; record.status = 'ready'; await writeFile(receiptPath, JSON.stringify(record, null, 2));
      }
      const current = await projects.current(record.merchantId, record.storeId);
      if (record.status === 'running' && !current.revision) { record.status = 'interrupted'; record.error = 'Previous paid request may have run. Not automatically replayed.'; await writeFile(receiptPath, JSON.stringify(record, null, 2)); continue; }
      if (record.status === 'interrupted') continue;
      const start = Date.now(); console.log(`Starting ${id}`);
      try {
        let revision = current.revision;
        if (!revision) {
          record.status = 'running'; await writeFile(receiptPath, JSON.stringify(record, null, 2));
          const generated = await generator.generate(record.merchantId, record.storeId, { revision: 0, maxCredits: 200, model: 'gpt-5.6-sol', motion: 'subtle', brief: { businessType: fixture.business, audience: fixture.audience, primaryAction: 'Elegir un producto y añadirlo al pedido', visualDirection: fixture.direction }, instruction: 'Crea una tienda premium original, coherente y completa en español para este catálogo. Define una jerarquía de compra clara, con opciones propias de cada producto y una página de producto cuidada. Usa una composición deliberada en Inicio, producto y checkout; no repitas cajas de colores sin propósito. Respeta las fotografías y hechos suministrados; si no hay fotos, usa tipografía y composición sin inventar imágenes, reseñas, beneficios, políticas ni productos. No muestres instrucciones técnicas en la interfaz. Mantén todos los hooks de comercio y la misma identidad a 1280, 768, 390 y 320px. Es una tienda ficticia de evaluación.', assetUrls: record.assets }, undefined, (record.assets || []).map((url: string) => ({ url, role: 'product', description: 'Supplied product photography. Preserve packaging and factual product identity.' })), async stage => { console.log(`${id}: ${stage}`); });
          record.generation = generated.generation; revision = generated.revision;
        }
        const version = await projects.version(record.merchantId, record.storeId, revision), snapshot = version.snapshot as any;
        for (const file of snapshot.files) {
          const path = resolve(folder, 'site', file.path); if (!path.startsWith(resolve(folder, 'site') + '/')) throw new Error('Unsafe export path'); await mkdir(dirname(path), { recursive: true });
          let content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
          if (file.path === 'config.js') { const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]); content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...config, demo: true }) + ';\n'; }
          await writeFile(path, content);
        }
        record = { ...record, status: 'completed', revision, digest: sourceProjectDigest(snapshot), elapsedMs: Date.now() - start };
      } catch (error) { record = { ...record, status: 'failed', elapsedMs: Date.now() - start, error: error instanceof Error ? error.message : 'Generation failed' }; }
      await writeFile(receiptPath, JSON.stringify(record, null, 2)); console.log(JSON.stringify({ id, status: record.status, credits: record.generation?.credits, error: record.error }));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Benchmark failed'); process.exitCode = 1; });
