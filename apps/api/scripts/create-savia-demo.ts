/** Authorized local demo. Uses the production GPT source generator and an isolated merchant. */
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
import type { SourceImageUse } from '../src/stores/source-setup';

async function main() {
  const root = resolve(__dirname, '../../..');
  const folder = resolve(root, 'examples/savia');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService), stores = app.get(StoresService), uploads = app.get(UploadsService);
    const projects = app.get(SourceProjectsService), generator = app.get(SourceGenerationService);
    app.get(ConfigService).set('app.sourceFramework', 'static');
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (!record) {
      const merchant = await prisma.merchant.findFirst({ where: { name: 'Savia · Demostración', email: { startsWith: 'savia-demo-', endsWith: '@local.invalid' } }, orderBy: { createdAt: 'desc' } }) || await prisma.merchant.create({ data: { name: 'Savia · Demostración', email: `savia-demo-${Date.now()}@local.invalid` } });
      const shop = await prisma.store.findFirst({ where: { merchantId: merchant.id } }) || await stores.create(merchant.id, { name: 'Savia', tagline: 'Pequeños rituales. Días más vivos.', backgroundColor: '#f7f3e8', accentColor: '#284c38', animations: [] });
      record = { merchantId: merchant.id, storeId: shop.id, slug: shop.slug, assets: {}, products: [] };
      await writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2));
    }
    for (const name of ['juice.jpg', 'granola.jpg', 'bottles.jpg', 'juice-preparation.mp4', 'reference.jpg']) {
      if (record.assets[name]) continue;
      const buffer = await readFile(resolve(folder, 'assets', name));
      const asset = await uploads.saveBuffer(buffer, name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId: record.merchantId, storeId: record.storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.assets[name] = asset.url;
      await writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2));
    }
    const catalog = [
      { name: 'Jugo naranja + jengibre', description: 'Naranja y jengibre en una botella de vidrio. Elige 330 ml o 750 ml, individual o en pack de 3. Una pausa cítrica para acompañar tu día.', image: 'juice.jpg', tags: ['Naranja + jengibre', 'Botella de vidrio'], groups: [['Tamaño', '330 ml', '750 ml'], ['Presentación', 'Individual', 'Pack de 3']], prices: [[1800, 5000], [3400, 9600]] },
      { name: 'Granola de la casa', description: 'Avena, almendras y arándanos para acompañar yogur, fruta o tus desayunos. Disponible en Original o Cacao, en 250 g y 500 g. Contiene almendras.', image: 'granola.jpg', tags: ['Avena y almendras', 'Desayunos'], groups: [['Sabor', 'Original', 'Cacao'], ['Peso', '250 g', '500 g']], prices: [[3200, 5900], [3500, 6500]] },
      { name: 'Botella Ritual', description: 'Botella reutilizable de acero inoxidable con acabado mate y tapa roscada. Elige tu color y capacidad para acompañar tus pequeños rituales de cada día.', image: 'bottles.jpg', tags: ['Acero inoxidable', 'Reutilizable'], groups: [['Color', 'Salvia', 'Coral', 'Marfil'], ['Capacidad', '500 ml', '750 ml']], prices: [[8900, 10900], [8900, 10900], [8900, 10900]] },
    ];
    for (const product of catalog) {
      if (record.products.some((p: any) => p.name === product.name)) continue;
      const [first, second] = product.groups;
      const variants = normalizeProductVariants(first.slice(1).flatMap((a, i) => second.slice(1).map((b, j) => ({ name: `${a} / ${b}`, amount: product.prices[i][j], stock: 20, options: [{ name: first[0], value: a }, { name: second[0], value: b }] }))));
      const item = await prisma.paymentLink.create({ data: { storeId: record.storeId, name: product.name, description: product.description, imageUrls: [record.assets[product.image]], tags: product.tags, amount: product.prices[0][0], currency: 'BOB', stock: totalVariantStock(variants), variants } });
      record.products.push({ id: item.id, name: item.name });
      await writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2));
    }
    const current = await projects.current(record.merchantId, record.storeId);
    if (current.revision === 0) {
      const instruction = await readFile(resolve(folder, 'PROMPT.md'), 'utf8');
      const imageUses: SourceImageUse[] = Object.entries(record.assets).map(([name, url]) => ({ url: url as string, role: name === 'reference.jpg' ? 'reference' : name.endsWith('.mp4') ? 'business' : 'product', description: name === 'reference.jpg' ? 'Amboras reference: rich colorful product panels, never embed this screenshot.' : name === 'juice.jpg' ? 'Jugo naranja + jengibre; also use as Savia hero photo.' : name === 'granola.jpg' ? 'Granola de la casa.' : name === 'bottles.jpg' ? 'Botella Ritual: Salvia, Coral, Marfil.' : 'Orange juice preparation stock video, use in editorial section with visible playback controls.' }));
      console.log('Generating Savia with GPT using the configured API key…');
      const result = await generator.generate(record.merchantId, record.storeId, { revision: 0, model: 'gpt-5.6-sol', maxCredits: 300, motion: 'subtle', brief: { businessType: 'Marca ficticia de jugos, granola y botellas reutilizables', audience: 'Personas que disfrutan desayunos y pequeños rituales cotidianos', primaryAction: 'Elegir las opciones de un producto y agregarlo al carrito', visualDirection: 'Savia: crema, verde bosque, salvia, naranja y coral. Fotografía editorial generosa, tipografía con personalidad, iconos y paneles de compra completos inspirados en la captura adjunta.' }, instruction, assetUrls: Object.values(record.assets) }, undefined, imageUses, async phase => { console.log(`Savia generation: ${phase}`); });
      record.generation = result.generation;
    }
    const generated = await projects.current(record.merchantId, record.storeId);
    const draft = await projects.version(record.merchantId, record.storeId, generated.revision);
    const authored = draft.snapshot as any;
    const marker = '/* Savia browser refinement */';
    if (!record.premiumDesign && !authored.files.find((file: any) => file.path === 'styles.css')?.content.includes(marker)) {
      const polish = await readFile(resolve(folder, 'refinement.css'), 'utf8');
      const files = authored.files.map((file: any) => {
        if (file.path === 'styles.css') return { ...file, content: file.content + '\n' + polish };
        if (file.path === 'index.html') return { ...file, content: file.content.replace('elige sus opciones reales', 'encuentra tu combinación favorita').replace('aria-label="Preparación de jugo SAVIA"', 'aria-label="Video: preparación de jugo de naranja"') };
        if (file.path === 'site.js') return { ...file, content: file.content.replace("button.setAttribute('data-confirmation','Agregado')", "button.setAttribute('data-confirmation',button.hasAttribute('data-add')?'Agregado':'Elige tus opciones')") + '\n' + `(function(){var link=document.querySelector('.product-detail__breadcrumb a');if(link)link.href='index.html#chapter-catalog';})();\n` };
        return file;
      });
      await projects.save(record.merchantId, record.storeId, { revision: generated.revision, label: 'Savia: refinamiento visual verificado en navegador', brief: authored.brief, files });
    }
    const latest = await projects.current(record.merchantId, record.storeId);
    const version = await projects.version(record.merchantId, record.storeId, latest.revision);
    const snapshot = version.snapshot as any;
    for (const file of snapshot.files) {
      const destination = resolve(folder, 'site', file.path);
      if (!destination.startsWith(resolve(folder, 'site') + '/')) throw new Error('Invalid generated file path');
      await mkdir(dirname(destination), { recursive: true });
      let content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
      if (file.path === 'config.js') {
        const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]);
        config.demo = true;
        // Keep this portable demo usable when the development API is stopped.
        for (const item of config.data.items) item.imageUrls = item.imageUrls.map((url: string) => {
          const match = Object.values(record.assets).find((asset: any) => url.endsWith(asset));
          return match ? `assets/${String(match).split('/').pop()}` : url;
        });
        content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n`;
      }
      await writeFile(destination, content);
    }
    record.revision = latest.revision;
    record.demoUrl = 'http://localhost:4326';
    await writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ storeId: record.storeId, slug: record.slug, revision: latest.revision, demoUrl: record.demoUrl, generation: record.generation }, null, 2));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Demo creation failed'); process.exitCode = 1; });
