/** BOXY (owner 2026-10-21): a demo streetwear hoodie store built from the photos in ~/Downloads/boxy, on the owner's own demo
 *  merchant (the one that owns NOA VARGAS), so it shows in «Tus tiendas». Local database only; idempotent through demo.json.
 *   npx ts-node --transpile-only scripts/create-boxy-demo.ts [--rebuild] [--look]
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party Pinterest images: a local demo only, never to be published. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { templateManifest } from '@pagosya/store-templates';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { normalizeProductVariants, totalVariantStock } from '../src/payment-links/product-variants';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceTemplatesService } from '../src/storefront-source/source-templates.service';
import { SourceConversationService } from '../src/storefront-source/source-conversation.service';
import { MASTER_TEMPLATE_ID, masterFillFromRead, type MasterFill } from '../src/storefront-source/source-master';
import { isFashionStore } from '../src/storefront-source/source-master-fashion';

const PHOTOS = ['0d2fb4eb273a61d945c7535f20c444cd', '1ed4b3d06c3673919e46c7bf8c9c5fc5', '5467569d269d48c5a3b88b98e3b92c2a', '6424b9c7fe3b6d038bbf508caf490cc1', '68b4b99981fb23b898414712a3d2b013',
  '6b140618c96fd1477562f49698bb2391', '864d7a87e70fcaadf13a4571baf1e8f4', 'b90555ce9c0c12166b4c48999a196bb7', 'dce66be07b2360a074241f74e3abbe88', 'eef5a66fe3744a2667b2fab41eeba4e3'];
const SIZES = ['S', 'M', 'L', 'XL'];
/** photo indexes refer to PHOTOS; a product with several colours gets one variant photo per colour. */
const PRODUCTS = [
  { name: 'Hoodie Boxy Esencial', category: 'Básicos', amount: 32000, colours: [['Azul', 0], ['Marrón', 5], ['Gris', 6]], photos: [0, 5, 6, 3], tags: ['Algodón perchado', 'Corte boxy'],
    description: 'Nuestro básico de corte boxy: hombro caído, capucha doble y bolsillo canguro, en algodón perchado. Tres colores. Colección de demostración.' },
  { name: 'Hoodie Marino Oversize', category: 'Básicos', amount: 34000, colours: [['Azul', 2]], photos: [2, 3], tags: ['Oversize', 'Algodón perchado'],
    description: 'Un oversize azul marino de tela pesada, con puños y bajo acanalados. Colección de demostración.' },
  { name: 'Hoodie Café Relajado', category: 'Básicos', amount: 34000, colours: [['Marrón', 4]], photos: [4, 5], tags: ['Relajado'],
    description: 'Café profundo, corte relajado y capucha amplia. Para todos los días. Colección de demostración.' },
  { name: 'Hoodie Lavado Niebla', category: 'Básicos', amount: 36000, colours: [['Gris', 6]], photos: [6], tags: ['Lavado a mano', 'Edición limitada'],
    description: 'Teñido y lavado para un gris azulado gastado, cada pieza un poco distinta. Colección de demostración.' },
  { name: 'Hoodie Bagels', category: 'Gráficos', amount: 38000, colours: [['Crema', 1]], photos: [1], tags: ['Estampado en la espalda'],
    description: 'Crema con un gráfico ilustrado en la espalda y un detalle pequeño al frente. Colección de demostración.' },
  { name: 'Hoodie Slow Sunday', category: 'Gráficos', amount: 38000, colours: [['Crema', 7]], photos: [7, 9], tags: ['Estampado en la espalda'],
    description: 'Para domingos lentos: crema con un gráfico rojo en la espalda y el nombre pequeño al frente. Colección de demostración.' },
  { name: 'Hoodie No Weak Days', category: 'Gráficos', amount: 38000, colours: [['Azul', 8]], photos: [8], tags: ['Estampado en la espalda'],
    description: 'Azul marino con tipografía blanca en la espalda. Colección de demostración.' },
] as const;
/** The look chosen for BOXY (owner 2026-10-21: «boxy is just the same as atelier but with different pictures»): loud streetwear,
 *  the opposite of NOA VARGAS's quiet atelier — dark ink, poster type, a big-first grid, shop cards with an add bar, pills,
 *  grain, a capsule section and a giant-name footer. No part is shared with NOA's forced look on purpose. */
const LOOK = { feature: ['capsule'], menu: 'dropdowns', filters: 'bar', grid: 'feature', header: 'centered', announce: 'chip', footer: 'bigname', button: 'pill', corners: 'round',
  bands: 'blocks', hero: 'poster', story: 'overlay', values: 'line', closing: 'accent', density: 'compact', texture: 'grain', photos: 'rounded', cards: 'compact', card: 'bar', pdp: 'stacked' };

async function main() {
  const folder = resolve(__dirname, '../../../examples/boxy');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-boxy-demo requires a local database');
    // The running API serves uploads on 3001; without this the store's photo URLs pointed at :3000, the website (BOXY rev 1-2).
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), templates = app.get(SourceTemplatesService), projects = app.get(SourceProjectsService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    if (!record) {
      // The owner's demo merchant: the one that owns NOA VARGAS, so BOXY shows in the same dashboard.
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await app.get(StoresService).create(noa.merchantId, { name: 'BOXY', tagline: 'Hoodies de corte boxy.', backgroundColor: '#f4f1ec', accentColor: '#1d2b4f', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {} };
      await save();
    }
    for (const id of PHOTOS) {
      if (record.photos[id]) continue;
      const asset = await uploads.saveBuffer(await readFile(resolve(homedir(), 'Downloads/boxy', `${id}.jpg`)), 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId: record.merchantId, storeId: record.storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[id] = asset.url; await save();
    }
    const photo = (index: number) => record.photos[PHOTOS[index]] as string;
    for (const [order, name] of ['Básicos', 'Gráficos'].entries()) {
      if (record.categories[name]) continue;
      const category = await prisma.category.create({ data: { storeId: record.storeId, name, sortOrder: order } });
      record.categories[name] = category.id; await save();
    }
    for (const p of PRODUCTS) {
      if (record.products[p.name]) continue;
      const variants = normalizeProductVariants(p.colours.flatMap(([colour, image]) => SIZES.map(size => ({
        name: `${colour} / ${size}`, amount: p.amount, stock: size === 'XL' && colour === 'Marrón' ? 0 : 10, imageUrl: photo(image as number),
        options: [{ name: 'Color', value: colour as string }, { name: 'Talla', value: size }],
      }))));
      const item = await prisma.paymentLink.create({ data: { storeId: record.storeId, categoryId: record.categories[p.category], name: p.name, description: p.description, amount: p.amount, currency: 'BOB',
        variants, stock: totalVariantStock(variants), imageUrls: p.photos.map(photo), tags: [...p.tags], shippingWeightGrams: 700 } });
      record.products[p.name] = item.id; await save();
    }
    const what = 'Hoodies de corte boxy: básicos de algodón perchado en azul, café y gris lavado, y hoodies con gráficos en la espalda.';
    const story = 'BOXY hace hoodies amplios, de hombro caído y tela pesada, para usar todos los días. Colección de demostración.';
    await prisma.store.update({ where: { id: record.storeId }, data: { onboarding: { what, story, contact: { city: 'La Paz' }, photos: [photo(0), photo(5)] } } });
    let current = await projects.current(record.merchantId, record.storeId);
    if (current.revision === 0 || process.argv.includes('--rebuild')) {
      const manifest = templateManifest(MASTER_TEMPLATE_ID)!;
      const saved = await templates.applyMaster(record.merchantId, record.storeId, current.revision, async facts => {
        const photos = [...new Set([photo(0), photo(5), photo(3), photo(6), photo(9), ...facts.photos])].slice(0, 8);
        const read = await app.get(SourceConversationService).fillMaster(record.merchantId, {
          storeId: record.storeId, storeName: facts.storeName, what, story, city: 'La Paz', products: facts.products, photos,
          palettes: manifest.master!.palettes.map(({ id, name }) => ({ id, name })), fonts: manifest.master!.fonts.map(({ id, name }) => ({ id, name })),
          variantCatalogue: manifest.master!.variants, sectionCatalogue: manifest.master!.sections, ...(facts.menuTargets ? { menuTargets: facts.menuTargets } : {}),
        });
        console.log(read ? 'YAPI wrote the words and picked the look.' : 'The fill call failed; the merchant’s own words stand in.');
        const base: MasterFill = read ? masterFillFromRead(read, photos, false) : { copy: { headline: facts.storeName, subcopy: what.slice(0, 160) } };
        const fashion = isFashionStore({ kind: read?.kind, storeName: facts.storeName, what, products: facts.products });
        return { ...base, character: { ...(base.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] }), kind: fashion ? 'fashion' : 'other' } };
      });
      record.built = saved.revision; await save();
      current = await projects.current(record.merchantId, record.storeId);
    }
    if (process.argv.includes('--look')) {
      // The words BOXY's own facts support (sizes, colours, the cut and the fabric named in its products), written for the demo.
      const copy = { announcement: 'Nueva colección de otoño', eyebrow: 'Corte boxy · Tela pesada', headline: 'Hoodies pesados, corte boxy',
        subcopy: 'Básicos de algodón perchado y gráficos en la espalda. Hombro caído, capucha doble y bolsillo canguro.', primaryCta: 'Ver hoodies', secondaryCta: 'Nuestra historia',
        productsTitle: 'Hoodies', storyTitle: 'Hechos para durar', closingLine: 'Tu próximo hoodie favorito', closingCta: 'Ver la colección', tagline: 'Hoodies de corte boxy. La Paz.',
        storyBody: 'BOXY hace hoodies amplios, de hombro caído y tela pesada, para usar todos los días. Empezamos con básicos en azul, café y gris lavado, y sumamos gráficos en la espalda para los días con más ganas. Colección de demostración.',
        values: [{ title: 'Tela pesada', text: 'Algodón perchado que abriga sin perder la forma.' }, { title: 'Corte boxy', text: 'Hombro caído y un largo justo para llevar con todo.' }, { title: 'Tallas S a XL', text: 'Cuatro tallas en cada modelo.' }] };
      const saved = await templates.refill(record.merchantId, record.storeId, current.revision, {
        copy, look: { palette: 'ink', fonts: 'poster', colors: {} }, heroPhoto: photo(0), storyPhoto: photo(5),
        variants: LOOK as never, featureCopy: { capsuleText: 'Tres básicos para empezar: azul marino, café y gris lavado. Tela pesada, corte boxy y tallas de la S a la XL.' },
      }, 'Estilo BOXY');
      record.look = saved.revision; await save();
    }
    console.log(JSON.stringify({ storeId: record.storeId, slug: record.slug, revision: (await projects.current(record.merchantId, record.storeId)).revision, products: Object.keys(record.products).length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
