/** BAEK Korean Bakehouse (owner 2026-10-23: «there is a baek folder, create a full store with it»): a Korean bakery in La Paz built
 *  from ~/baek (11 brand photos + 2 videos), on the owner's demo merchant (the one that owns NOA VARGAS and BOXY). This script only
 *  writes what a merchant would type in themselves — logo, products, photos, delivery, codes, subscription, settings; the design
 *  is YAPI's, asked in the Studio chat (feedback: test stores are designed by YAPI). Local database only; idempotent through
 *  examples/baek/demo.json.
 *   npx ts-node --transpile-only scripts/create-baek-demo.ts
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party brand images (Pinterest/Behance): a local demo only, never to be published outside. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { PaymentLinksService } from '../src/payment-links/payment-links.service';
import { PromoCodesService } from '../src/promo-codes/promo-codes.service';
import { OperationsService } from '../src/operations/operations.service';
import { SubscribersService } from '../src/operations/subscribers.service';

const FOLDER = resolve(homedir(), 'baek');
/** Index → file: 0 baker holding a seeded baguette in a kraft bag, 1 sourdough boules from above, 2 cut loaves still life,
 *  3 brown poster with the logo, 4 canvas BAEK bag with baguettes, 5 linen bag of breads on black, 6 boules scored «BAEK»,
 *  7 shop door with the logo, 8 brown round sticker on bread, 9 white crates of bread, 10 tan poster with the logo. */
const PHOTOS = ['290a83a6ce51b3bddf09623c6879f59e.jpg', '4a959acb83855d19b861f3d782a9f9a6.jpg', '5c3ec40d74f2c16f2e78a6006fa9687c.jpg', '785af4cfab106f84c7838a41df4e7556.jpg',
  '7971ac84adb4fa247c543d7a68d9132d.jpg', 'c25e39e87775604f245ad74e8ea4812f.jpg', 'e53b28b87c8226d5a636f1a597b3bd23.jpg', 'e988046130889db1e6b549cf3d16a152.jpg',
  'f3cd6a8456d2b7b66628e632d944787a.jpg', 'f7d69fddc14861c3a2c7ca317ce6044b.jpg', 'ff45a56c936813975e079fd348815393.jpg'];
/** 0 four croissants turning on pale blue, 1 brand reel (poster, crates, kraft bag, loaves). */
const VIDEOS = ['ab2d8d5c12fc367521f4a3375198c16e_720w.mp4', 'ea9eb8e146ca54a380fbb07d209a352d_720w.mp4'];
/** Croissant stills cut from video 0 (seconds), framed 4:5 around the pastry. */
const CROISSANTS = [{ name: 'Mantequilla', at: 2.0 }, { name: 'Canela y azúcar', at: 0.3 }, { name: 'Sésamo negro', at: 3.6 }, { name: 'Crema de almendra', at: 5.3 }];
const CATEGORIES = ['Panes', 'Croissants', 'Para llevar'];

/** ffmpeg (on the owner's Mac) cuts the logo from the tan poster and the croissant stills from the video. */
async function cut(): Promise<{ logo: Buffer; croissants: Buffer[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'baek-'));
  const run = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  run(['-i', resolve(FOLDER, PHOTOS[10]), '-vf', 'crop=260:260:238:320', '-q:v', '2', join(dir, 'logo.jpg')]);
  CROISSANTS.forEach((item, index) => run(['-ss', String(item.at), '-i', resolve(FOLDER, VIDEOS[0]), '-frames:v', '1', '-vf', 'crop=400:500:160:200', '-q:v', '2', join(dir, `c${index}.jpg`)]));
  return { logo: await readFile(join(dir, 'logo.jpg')), croissants: await Promise.all(CROISSANTS.map((_, index) => readFile(join(dir, `c${index}.jpg`)))) };
}

async function main() {
  const folder = resolve(__dirname, '../../../examples/baek');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-baek-demo requires a local database');
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'BAEK Korean Bakehouse', tagline: 'Panadería coreana: mañanas suaves, masa madre y croissants tibios.', backgroundColor: '#f4ece0', accentColor: '#5a2a1f', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const store = async (key: string, bytes: () => Promise<Buffer>, mime: string) => {
      if (record.photos[key]) return record.photos[key] as string;
      const asset = await uploads.saveBuffer(await bytes(), mime);
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[key] = asset.url; await save(); return asset.url as string;
    };
    for (const file of PHOTOS) await store(file, () => readFile(resolve(FOLDER, file)), 'image/jpeg');
    for (const file of VIDEOS) await store(file, () => readFile(resolve(FOLDER, file)), 'video/mp4');
    const cuts = record.photos['logo.jpg'] && CROISSANTS.every((_, index) => record.photos[`croissant-${index}.jpg`]) ? null : await cut();
    const logo = await store('logo.jpg', async () => cuts!.logo, 'image/jpeg');
    for (const index of CROISSANTS.keys()) await store(`croissant-${index}.jpg`, async () => cuts!.croissants[index], 'image/jpeg');
    const photo = (index: number) => record.photos[PHOTOS[index]] as string;
    const croissant = (index: number) => record.photos[`croissant-${index}.jpg`] as string;
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        logoUrl: logo, contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'BAEK (빵집, «panadería» en coreano) es una panadería coreana moderna en La Paz, pensada para mañanas suaves: masa madre de fermentación lenta, croissants tibios y pan para compartir. Tienda de demostración.',
        policies: {
          returns: 'El pan y los croissants se hornean cada mañana y no tienen devolución; si algo llegó mal, escríbenos el mismo día y lo reponemos. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos en La Paz por la mañana, o puedes recoger tu pedido en nuestra panadería de San Miguel desde las 7:30. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido y tu suscripción. Tienda de demostración.',
          terms: 'Precios en bolivianos. Los pedidos para cafeterías se confirman un día antes. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
    });

    const product = async (name: string, dto: Record<string, unknown>) => {
      if (record.products[name]) return record.products[name] as string;
      const created: any = await links.create(merchantId, storeId, { name, currency: 'BOB', ...dto } as never);
      record.products[name] = created.id; await save(); return created.id as string;
    };
    const demo = ' Producto de demostración.';
    const hogaza = await product('Hogaza BAEK de masa madre', { categoryId: record.categories['Panes'], amount: 3800, imageUrls: [photo(6), photo(1)], badge: 'La de la casa',
      description: 'Nuestra hogaza de masa madre, 36 horas de fermentación lenta, corteza crujiente y miga húmeda. Marcada a mano con el nombre BAEK.' + demo,
      variants: [{ name: 'Entera', amount: 3800, stock: 14, imageUrl: photo(6), options: [{ name: 'Tamaño', value: 'Entera' }] }, { name: 'Media', amount: 2000, stock: 3, imageUrl: photo(1), options: [{ name: 'Tamaño', value: 'Media' }] }],
      specifications: [{ label: 'Fermentación', value: '36 horas' }, { label: 'Peso', value: '900 g la entera' }],
      highlights: [{ icon: 'clock', label: 'Horneada hoy' }, { icon: 'sprout', label: 'Masa madre' }] });
    const baguette = await product('Baguette de semillas', { categoryId: record.categories['Panes'], amount: 1800, imageUrls: [photo(0)], stock: 20,
      description: 'Baguette con linaza, sésamo y girasol, larga y crujiente. Va en su bolsa kraft BAEK.' + demo });
    await product('Pan de centeno rebanado', { categoryId: record.categories['Panes'], amount: 3200, imageUrls: [photo(2)], stock: 8, badge: 'Nuevo',
      description: 'Pan de centeno y masa madre, denso y aromático, rebanado para tus tostadas de la semana.' + demo });
    const croissants = await product('Croissant BAEK', { categoryId: record.categories['Croissants'], amount: 1400, imageUrls: [croissant(0)], badge: 'Más pedido',
      description: 'Croissant de mantequilla laminado a mano durante tres días. Cuatro sabores, algunos con un guiño coreano.' + demo,
      variants: CROISSANTS.map((item, index) => ({ name: item.name, amount: index === 0 ? 1400 : 1700, stock: index === 3 ? 2 : 24, imageUrl: croissant(index), options: [{ name: 'Sabor', value: item.name }] })) });
    const bolsa = await product('Bolsa de la mañana', { categoryId: record.categories['Para llevar'], amount: 9500, imageUrls: [photo(5)], stock: 12,
      description: 'Una hogaza, una baguette y cuatro croissants surtidos en nuestra bolsa de lino: el desayuno de la familia resuelto.' + demo,
      contentBlocks: [{ type: 'features', title: 'Qué trae', items: [{ icon: 'chef-hat', label: 'Hogaza de masa madre', detail: 'Entera, horneada hoy' }, { icon: 'wheat', label: 'Baguette de semillas', detail: 'Larga y crujiente' }, { icon: 'star', label: '4 croissants', detail: 'Sabores surtidos' }] }] });
    await product('Caja para cafeterías', { categoryId: record.categories['Para llevar'], amount: 42000, imageUrls: [photo(9)], stock: 5,
      description: 'Una caja de 40 panes y croissants para tu cafetería, entregada antes de abrir. Se confirma un día antes.' + demo,
      specifications: [{ label: 'Contenido', value: '40 piezas surtidas' }, { label: 'Entrega', value: 'Antes de las 8:00' }] });
    await product('Bolsa de lona BAEK', { categoryId: record.categories['Para llevar'], amount: 8500, imageUrls: [photo(4)], stock: 15,
      description: 'Nuestra bolsa de lona cruda con el logo BAEK, para llevar el pan cada día sin papel.' + demo });
    await step('subscriptions', async () => {
      await links.updateSubscriptions(merchantId, storeId, bolsa, { options: [{ cadence: 'WEEKLY', discountPercent: 10, label: 'Cada semana' }] } as never);
      await app.get(SubscribersService).setEnabled(merchantId, storeId, true);
    });
    await step('promo-codes', async () => { await app.get(PromoCodesService).create(merchantId, storeId, { code: 'BAEK10', discountType: 'PERCENT', discountValue: 10 } as never); });
    await step('recommendations', async () => {
      await links.update(merchantId, storeId, hogaza, { recommendedProductIds: [croissants, baguette] } as never);
      await links.update(merchantId, storeId, croissants, { recommendedProductIds: [hogaza, bolsa] } as never);
    });
    // Morning delivery in La Paz and the San Miguel bakery, with an address so pickup is offered.
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true, locations: [{ id: 'san-miguel', name: 'BAEK San Miguel', address: 'Calle 21 de San Miguel 8350, La Paz', department: 'LA_PAZ', city: 'La Paz', pickupEnabled: true, deliveryEnabled: true,
        openingHours: [1, 2, 3, 4, 5, 6].map(day => ({ day, open: '07:30', close: '19:00', closed: false })).concat([{ day: 0, open: '08:00', close: '13:00', closed: false }]) }] as never } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz ciudad', fee: 1500, departments: ['LA_PAZ'], freeAbove: 15000, estimatedMinutes: 120 } as never);
    });
    console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length, logo, brand: [3, 7, 8, 10].map(photo), videos: VIDEOS.map(file => record.photos[file]) }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
