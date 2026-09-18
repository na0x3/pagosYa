/** Bounded six-run pilot: three fictional catalogs, two independent generations. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { StoresService } from '../src/stores/stores.service';
import { SourceGenerationService } from '../src/stores/source-generation.service';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { normalizeProductVariants, totalVariantStock } from '../src/payment-links/product-variants';
import type { SourceImageUse } from '../src/stores/source-setup';

async function main() {
  const root = resolve(__dirname, '../../..'), folder = resolve(root, 'examples/savia/pilot');
  await mkdir(folder, { recursive: true });
  const demo = JSON.parse(await readFile(resolve(root, 'examples/savia/demo.json'), 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService), stores = app.get(StoresService), generator = app.get(SourceGenerationService), projects = app.get(SourceProjectsService);
    app.get(ConfigService).set('app.sourceFramework', 'static');
    app.get(ConfigService).set('app.port', 3001);
    app.get(ConfigService).set('app.checkoutOrigin', 'http://localhost:5175');
    const original = await prisma.paymentLink.findMany({ where: { storeId: demo.storeId }, orderBy: { createdAt: 'asc' } });
    const cases = [
      { id: 'pantry', name: 'Nido', description: 'Despensa de jugos y granola', audience: 'Personas que disfrutan un desayuno cotidiano', direction: 'Despensa contemporánea: fotografía cálida y natural, tipografía clara, superficies tranquilas, acentos cítricos con propósito.', products: original.filter(p => !p.name.includes('Botella')), assets: [demo.assets['juice.jpg'], demo.assets['granola.jpg'], demo.premiumAssets['juice-studio'], demo.premiumAssets['granola-studio']] },
      { id: 'hydration', name: 'Forma', description: 'Botellas reutilizables de acero inoxidable', audience: 'Personas que buscan una botella para llevar todos los días', direction: 'Precisión cotidiana: diseño moderno limpio, fotos generosas, color en el producto y sus swatches, controles compactos y tipografía legible.', products: original.filter(p => p.name.includes('Botella')), assets: [demo.assets['bottles.jpg'], demo.premiumAssets['bottle-salvia'], demo.premiumAssets['bottle-coral'], demo.premiumAssets['bottle-marfil']] },
      { id: 'cafe', name: 'Lumbre', description: 'Cafetería de barrio con carta breve sin fotografías', audience: 'Vecinos que eligen un café para recoger', direction: 'Carta de café contemporánea: tipografía expresiva pero legible, color berenjena y papel claro, ritmo compacto y composición útil. No hay fotografías: diseña con tipografía, líneas y el catálogo real.', products: [], assets: [] },
    ];
    const results: any[] = await readFile(resolve(folder, 'results.json'), 'utf8').then(JSON.parse).catch(() => []);
    for (const fixture of cases) for (let repetition = 1; repetition <= 2; repetition++) {
      const id = `${fixture.id}-${repetition}`;
      if (results.some(r => r.id === id)) continue;
      const merchant = await prisma.merchant.create({ data: { name: `${fixture.name} · Design pilot ${repetition}`, email: `premium-pilot-${id}-${Date.now()}@local.invalid` } });
      const store = await stores.create(merchant.id, { name: `${fixture.name} · Pilot ${repetition}`, tagline: fixture.description, animations: [] });
      const uploads = app.get(UploadsService);
      const urls = [...new Set([...fixture.assets, ...fixture.products.flatMap(p => [...p.imageUrls, ...(p.variants as any[]).map(v => v.imageUrl).filter(Boolean)])])];
      const mapped = new Map<string, string>();
      for (const url of urls) {
        const buffer = await uploads.getBuffer(String(url).split('/').at(-1)!);
        if (!buffer) throw new Error('Missing pilot product asset');
        const asset = await uploads.saveBuffer(buffer, 'image/jpeg');
        await prisma.mediaAsset.create({ data: { merchantId: merchant.id, storeId: store.id, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
        mapped.set(url, asset.url);
      }
      const created: any[] = [];
      for (const p of fixture.products) {
        const variants = p.variants as any[];
        created.push(await prisma.paymentLink.create({ data: { storeId: store.id, name: p.name, description: p.description, amount: p.amount, currency: p.currency, stock: p.stock, variants: variants.map(v => ({ ...v, ...(v.imageUrl ? { imageUrl: mapped.get(v.imageUrl) } : {}) })), imageUrls: p.imageUrls.map(url => mapped.get(url)!), tags: p.tags } }));
      }
      if (!created.length) for (const [name, amount] of [['Café filtrado', 1500], ['Latte', 2200], ['Chocolate caliente', 2000]] as const) {
        const variants = normalizeProductVariants([{ name: '250 ml', amount, stock: 30 }, { name: '350 ml', amount: amount + 500, stock: 30 }]);
        created.push(await prisma.paymentLink.create({ data: { storeId: store.id, name, description: `${name} preparado al momento. Elige 250 ml o 350 ml.`, amount, currency: 'BOB', variants, stock: totalVariantStock(variants), imageUrls: [], tags: ['Para recoger'] } }));
      }
      const uses: SourceImageUse[] = fixture.assets.map(url => ({ url: mapped.get(url)!, role: 'product', description: 'Real supplied product photography for this fictional catalog. Product packaging may say SAVIA; preserve it exactly as a stocked brand.' }));
      const start = Date.now();
      let result: any = { id, merchantId: merchant.id, storeId: store.id, slug: store.slug, productIds: created.map(p => p.id), maxCredits: 300 };
      console.log(`Starting ${id}`);
      try {
        const generated = await generator.generate(merchant.id, store.id, { revision: 0, model: 'gpt-5.6-sol', maxCredits: 300, motion: 'subtle', brief: { businessType: fixture.description, audience: fixture.audience, primaryAction: 'Elegir opciones reales y añadir al pedido', visualDirection: fixture.direction }, instruction: 'Crea una tienda premium completa, original y coherente, en español. Diseña primero una página de producto comprensible con galería (si hay imágenes), opciones reales, cantidad y compra; traslada su sistema visual a Inicio y checkout. Usa imágenes aportadas como productos de la marca SAVIA disponibles en esta tienda. No cambies su marca impresa. Unifica colores, tipografía, espacios y geometría con --store-*; reserva --brand-* para identidad confirmada. Evita cajas coloreadas sin propósito, duplicar descripciones, instrucciones repetidas y botones enormes de navegación. No inventes reseñas, beneficios de salud, certificados, políticas de entrega o productos. La tienda es una demostración. Mantén funcionando todas las opciones y hooks del runtime. Las páginas deben verse deliberadamente compuestas en 1280 y 390px.', assetUrls: [...mapped.values()] }, undefined, uses, async phase => { console.log(`${id}: ${phase}`); });
        const version = await projects.version(merchant.id, store.id, generated.revision);
        const snapshot = version.snapshot as any;
        for (const file of snapshot.files) {
          const path = resolve(folder, id, file.path); await mkdir(dirname(path), { recursive: true });
          let content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
          if (file.path === 'config.js') { const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]); config.demo = true; content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify(config) + ';\n'; }
          await writeFile(path, content);
        }
        result = { ...result, status: 'completed', generation: generated.generation, design: JSON.parse(snapshot.files.find((f: any) => f.path === 'design-direction.json').content), visualSystem: JSON.parse(snapshot.files.find((f: any) => f.path === 'visual-system.json').content), elapsedMs: Date.now() - start };
      } catch (error) { result = { ...result, status: 'failed', error: error instanceof Error ? error.message : 'Generation failed', elapsedMs: Date.now() - start }; }
      results.push(result); await writeFile(resolve(folder, 'results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ id, status: result.status, durationMs: result.elapsedMs, error: result.error, credits: result.generation?.credits }));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Pilot failed'); process.exitCode = 1; });
