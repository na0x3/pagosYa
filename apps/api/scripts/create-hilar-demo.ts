/** Creates only the fictional Hilar store on the local development database. */
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
import { SourcePublishingService } from '../src/stores/source-publishing.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { normalizeProductVariants, totalVariantStock } from '../src/payment-links/product-variants';
import type { SourceImageUse } from '../src/stores/source-setup';

async function main() {
  const folder = resolve(__dirname, '../../../examples/hilar');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('Hilar demo requires a local database');
    config.set('app.sourceFramework', 'static');
    config.set('app.port', 3001);
    config.set('app.checkoutOrigin', 'http://localhost:5175');
    const prisma = app.get(PrismaService), stores = app.get(StoresService), uploads = app.get(UploadsService), projects = app.get(SourceProjectsService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const saveRecord = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    if (!record) {
      const merchant = await prisma.merchant.findFirst({ where: { email: 'hilar-sweaters-demo@local.invalid' } }) || await prisma.merchant.create({ data: { name: 'Hilar · Sweaters de demostración', email: 'hilar-sweaters-demo@local.invalid' } });
      const store = await prisma.store.findFirst({ where: { merchantId: merchant.id } }) || await stores.create(merchant.id, { name: 'Hilar', tagline: 'Tu nueva capa favorita.', backgroundColor: '#f8f5ef', accentColor: '#642938', animations: [] });
      record = { merchantId: merchant.id, storeId: store.id, slug: store.slug, assets: {}, products: [] };
      await saveRecord();
    }
    const owned = await prisma.store.findFirstOrThrow({ where: { id: record.storeId, merchantId: record.merchantId, merchant: { email: 'hilar-sweaters-demo@local.invalid' } }, include: { merchant: true } });
    if (owned.merchant.status === 'ACTIVE') throw new Error('Hilar must remain a test-mode merchant');
    if (process.argv.includes('--inspect')) {
      console.log(JSON.stringify(await prisma.storeSourceGeneration.findMany({ where: { storeId: record.storeId }, orderBy: { createdAt: 'desc' }, take: 3, select: { status: true, attempts: true, credits: true, durationMs: true } }), null, 2));
      return;
    }
    const manifest = JSON.parse(await readFile(resolve(folder, 'assets/manifest.json'), 'utf8')) as Record<string, string>;
    for (const name of Object.keys(manifest)) {
      if (record.assets[name]) continue;
      const asset = await uploads.saveBuffer(await readFile(resolve(folder, 'assets', name + '.jpg')), 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId: record.merchantId, storeId: record.storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.assets[name] = asset.url; await saveRecord();
    }
    const products = [
      { key: 'cable', name: 'Suéter Ocho', amount: 32000, tags: ['Punto trenzado', 'Cuello redondo'], description: 'Punto trenzado con cuello redondo, puños y bajo acanalados. Mezcla de 70% lana y 30% algodón. Cinco tallas, tres colores y dos cortes. Colección de demostración.', colors: ['oat', 'burgundy', 'olive'] },
      { key: 'rib', name: 'Suéter Sur', amount: 29000, tags: ['Punto acanalado', 'Cuello redondo'], description: 'Un básico de punto acanalado con cuello redondo. Mezcla de 70% lana y 30% algodón. Cinco tallas, tres colores y dos cortes. Colección de demostración.', colors: ['burgundy', 'oat', 'olive'] },
      { key: 'cardigan', name: 'Cárdigan Nido', amount: 39000, tags: ['Con botones', 'Bolsillos'], description: 'Cárdigan con escote en V, botones y dos bolsillos. Mezcla de 70% lana y 30% algodón. Cinco tallas, tres colores y dos cortes. Colección de demostración.', colors: ['olive', 'oat', 'burgundy'] },
    ];
    const labels: Record<string, string> = { oat: 'Avena', burgundy: 'Vino', olive: 'Oliva' };
    for (const p of products) {
      let item = await prisma.paymentLink.findFirst({ where: { storeId: record.storeId, name: p.name } });
      if (!item) {
        const variants = normalizeProductVariants(p.colors.flatMap(color => ['XS', 'S', 'M', 'L', 'XL'].flatMap(size => ['Clásico', 'Relajado'].map(fit => ({
          name: `${labels[color]} / ${size} / ${fit}`, amount: p.amount + (fit === 'Relajado' ? 3000 : 0), stock: color === 'burgundy' && size === 'XL' && fit === 'Relajado' ? 0 : size === 'XS' ? 3 : 8,
          imageUrl: record.assets[p.key + '-' + color], options: [{ name: 'Color', value: labels[color] }, { name: 'Talla', value: size }, { name: 'Corte', value: fit }],
        })))));
        item = await prisma.paymentLink.create({ data: { storeId: record.storeId, name: p.name, description: p.description, amount: p.amount, currency: 'BOB', variants, stock: totalVariantStock(variants), imageUrls: p.colors.map(color => record.assets[p.key + '-' + color]), tags: p.tags, shippingWeightGrams: 600 } });
      }
      if (!record.products.some((x: any) => x.id === item!.id)) { record.products.push({ id: item.id, name: item.name }); await saveRecord(); }
    }
    let gift = await prisma.paymentLink.findFirst({ where: { storeId: record.storeId, name: 'Caja de regalo' } });
    if (!gift) gift = await prisma.paymentLink.create({ data: { storeId: record.storeId, name: 'Caja de regalo', description: 'Una caja para presentar una prenda. Complemento opcional; añade una caja por cada regalo.', amount: 2500, currency: 'BOB', stock: 50, tags: ['Complemento'] } });
    if (!record.products.some((x: any) => x.id === gift!.id)) { record.products.push({ id: gift.id, name: gift.name }); await saveRecord(); }
    let current = await projects.current(record.merchantId, record.storeId);
    if (current.revision === 0 && process.argv.includes('--authored')) {
      const files: Array<{path:string;content:string;encoding?:'utf8'|'base64'}> = [];
      for (const path of ['index.html', 'product.html', 'checkout.html', 'styles.css', 'site.js']) files.push({ path, content: await readFile(resolve(folder, 'site', path), 'utf8') });
      for (const path of ['build.mjs', 'server.mjs', 'commerce-pages.css']) files.push({ path, content: await readFile(resolve(__dirname, '../src/stores/source-kit', path), 'utf8') });
      files.push({ path: 'commerce.js', content: (await Promise.all(['privacy.js', 'commerce.js', 'retention.js'].map(path => readFile(resolve(__dirname, '../src/stores/source-kit', path), 'utf8')))).join('\n') });
      for (const name of Object.keys(manifest)) files.push({path: 'assets/' + name + '.jpg', encoding: 'base64', content: (await readFile(resolve(folder, 'assets', name + '.jpg'))).toString('base64')});
      const data = await stores.getStorePublic(record.slug, { trackView: false, ownerMerchantId: record.merchantId });
      const storefrontConfig = { slug: record.slug, apiBaseUrl: 'http://localhost:3001/v1', checkoutOrigin: 'http://localhost:5175', productPage: 'product.html', checkoutPage: 'checkout.html', demo: false, motion: 'subtle', data: {...data, checkoutMode:'payment'} };
      files.push({ path: 'config.js', content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify(storefrontConfig) + ';\n' });
      files.push({ path: 'package.json', content: JSON.stringify({ name: 'hilar-storefront', version:'1.0.0', private:true, type:'module', scripts:{ build:'node build.mjs', start:'node server.mjs'} }, null, 2) });
      files.push({ path: 'README.md', content: '# Hilar\n\nFictional knitwear store. Run npm run build then npm start. Requires the local pagosYa API on port 3001 for catalog, stock and test checkout. Authored source uses the shared commerce runtime. Images generated with the built-in imagegen tool.\n' });
      await prisma.store.update({ where:{id:record.storeId}, data:{checkoutMode:'payment'} });
      await projects.save(record.merchantId, record.storeId, { revision:0, label:'Hilar: sweaters, fotografía editorial y 90 combinaciones', brief:{businessType:'Hilar, tienda ficticia de sweaters y cárdigans',audience:'Personas que buscan prendas de punto contemporáneas',primaryAction:'Elegir color, talla y corte y añadir a la bolsa',visualDirection:'Marfil y vino, fotografía editorial, tipografía Instrument, controles de compra claros.'}, files });
      record.authored = true;
      current = await projects.current(record.merchantId, record.storeId);
    }
    if (current.revision === 0) {
      const uses: SourceImageUse[] = Object.entries(record.assets).map(([name, url]) => ({ url: url as string, role: name === 'hero' ? 'business' : 'product', description: name === 'hero' ? 'Hilar campaign: a woman in Suéter Ocho Avena and a man in Suéter Sur Vino. Use as hero image.' : `Hilar ${name}: cable = Suéter Ocho, rib = Suéter Sur, cardigan = Cárdigan Nido. oat = Avena, burgundy = Vino, olive = Oliva. Exact product photo; color-matched variants already exist.` }));
      console.log('Generating Hilar storefront…');
      const generated = await app.get(SourceGenerationService).generate(record.merchantId, record.storeId, { revision: 0, model: 'gpt-5.6-sol', maxCredits: 300, motion: 'subtle', brief: { businessType: 'Hilar, marca ficticia de sweaters y cárdigans con opciones completas', audience: 'Personas que buscan prendas de punto contemporáneas y cálidas', primaryAction: 'Elegir color, talla y corte, añadir a la bolsa y revisar el pedido', visualDirection: 'Ivory and burgundy fashion editorial, large tactile sweater photographs, clean oversized sans typography and compact, clear variant controls. Warm modern knitwear.' }, instruction: await readFile(resolve(folder, 'PROMPT.md'), 'utf8'), assetUrls: Object.values(record.assets) }, undefined, uses, async phase => { console.log(`Hilar: ${phase}`); });
      record.generation = generated.generation; await saveRecord();
    }
    current = await projects.current(record.merchantId, record.storeId);
    if (process.argv.includes('--sync')) {
      const previous = await projects.version(record.merchantId, record.storeId, current.revision);
      const snapshot = previous.snapshot as any;
      const editable = ['index.html', 'product.html', 'checkout.html', 'styles.css', 'site.js'];
      const files = await Promise.all(snapshot.files.map(async (f: any) => editable.includes(f.path) ? { ...f, content: await readFile(resolve(folder, 'site', f.path), 'utf8') } : f));
      const saved = await projects.save(record.merchantId, record.storeId, { revision: current.revision, label: 'Hilar: refinamiento visual y opciones verificadas', brief: snapshot.brief, files });
      current = await projects.current(record.merchantId, record.storeId);
      record.revision = saved.revision;
    }
    const version = await projects.version(record.merchantId, record.storeId, current.revision);
    for (const file of (version.snapshot as any).files) {
      const path = resolve(folder, 'site', file.path);
      if (!path.startsWith(resolve(folder, 'site') + '/')) throw new Error('Invalid source path');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content);
    }
    record.revision = current.revision;
    record.url = 'http://localhost:5175/s/' + record.slug;
    if (process.argv.includes('--publish')) {
      const store = await prisma.store.findUniqueOrThrow({ where: { id: record.storeId } });
      const published = await app.get(SourcePublishingService).publish(record.merchantId, record.storeId, record.revision, store.sourcePublicationVersion);
      record.localPublication = { revision: published.revision, payments: published.payments, url: record.url };
    }
    await saveRecord();
    console.log(JSON.stringify({ storeId: record.storeId, revision: record.revision, url: record.url, products: record.products.length, publication: record.localPublication }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Hilar creation failed'); process.exitCode = 1; });
