/** Oh Belly (owner 2026-10-23: «create a full animated store for the oh belly brand»): a prebiotic sparkling soda built from
 *  ~/Downloads/oh belly (7 brand photos + a 5 s flavour video), on the owner's demo merchant (the one that owns NOA VARGAS, BOXY
 *  and BAEK). This script only writes what a merchant would type in themselves — logo, products, photos, delivery, codes,
 *  subscription, settings; the design is YAPI's, asked in the Studio chat (feedback: test stores are designed by YAPI). Local
 *  database only; idempotent through examples/ohbelly/demo.json.
 *   npx ts-node --transpile-only scripts/create-ohbelly-demo.ts
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

const FOLDER = resolve(homedir(), 'Downloads/oh belly');
/** Index → file: 0 hand raising a splashing can against blue sky, 1 pile of cans in every flavour, 2 pink/orange poster with the
 *  BBBB monogram and the OH BELLY wordmark, 3 three gift boxes (orange, white, olive), 4 cans in a fridge door, 5 cans on wire
 *  fridge shelves, 6 poster with the delivery truck («Prebiotic sparkling soda designed for happy bellies and gut comfort»). */
const PHOTOS = ['4be456a2e973560c3bf1ee4ec56c71f3.jpg', '73c866436950ae6bf59f31a6abc935a2.jpg', '7678c5c5da3c90d9a567db7d62dd65f8.jpg', '98d044f2c43fa474a808f0bd7f87d9fa.jpg',
  'd1da82a1b1a4a4219b122d8a547ce25a.jpg', 'dc25c70c7cd63986310d5a46d4549158.jpg', 'ee8e49e17d5ff2dae518b8974ae95a8a.jpg'];
/** A can on a bed of its fruit, one flavour every ~⅓ s (pear, lemon, watermelon, orange, blueberry, repeated). */
const VIDEO = '3EE9BA51-FD2E-4778-BA3E-A9EBDA8D9682.mp4';
/** Flavour stills cut from the video (seconds); the names are the ones printed on the cans. */
const FLAVOURS = [{ name: 'Limón y jengibre', at: 0.5, stock: 40 }, { name: 'Pera e hinojo', at: 0.2, stock: 32 }, { name: 'Sandía y menta', at: 0.9, stock: 4 },
  { name: 'Naranja y cúrcuma', at: 1.2, stock: 36 }, { name: 'Arándano y manzanilla', at: 1.5, stock: 28 }];
const CATEGORIES = ['Sodas', 'Packs', 'Regalos'];

/** ffmpeg (on the owner's Mac) cuts the BBBB monogram and the wordmark from the poster and the flavour stills from the video. */
async function cut(): Promise<{ logo: Buffer; wordmark: Buffer; flavours: Buffer[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'ohbelly-'));
  const run = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  run(['-i', resolve(FOLDER, PHOTOS[2]), '-vf', 'crop=280:280:228:100', '-q:v', '2', join(dir, 'logo.jpg')]);
  run(['-i', resolve(FOLDER, PHOTOS[2]), '-vf', 'crop=700:150:18:650', '-q:v', '2', join(dir, 'wordmark.jpg')]);
  FLAVOURS.forEach((item, index) => run(['-ss', String(item.at), '-i', resolve(FOLDER, VIDEO), '-frames:v', '1', '-q:v', '2', join(dir, `f${index}.jpg`)]));
  return {
    logo: await readFile(join(dir, 'logo.jpg')), wordmark: await readFile(join(dir, 'wordmark.jpg')),
    flavours: await Promise.all(FLAVOURS.map((_, index) => readFile(join(dir, `f${index}.jpg`)))),
  };
}

async function main() {
  const folder = resolve(__dirname, '../../../examples/ohbelly');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-ohbelly-demo requires a local database');
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'Oh Belly', tagline: 'Soda prebiótica con burbujas, sin azúcar, para pancitas felices.', backgroundColor: '#fbe9e4', accentColor: '#f0531c', animations: [] } as never);
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
    await store(VIDEO, () => readFile(resolve(FOLDER, VIDEO)), 'video/mp4');
    const cutKeys = ['logo.jpg', 'wordmark.jpg', ...FLAVOURS.map((_, index) => `flavour-${index}.jpg`)];
    const cuts = cutKeys.every(key => record.photos[key]) ? null : await cut();
    const logo = await store('logo.jpg', async () => cuts!.logo, 'image/jpeg');
    const wordmark = await store('wordmark.jpg', async () => cuts!.wordmark, 'image/jpeg');
    for (const index of FLAVOURS.keys()) await store(`flavour-${index}.jpg`, async () => cuts!.flavours[index], 'image/jpeg');
    const photo = (index: number) => record.photos[PHOTOS[index]] as string;
    const flavour = (index: number) => record.photos[`flavour-${index}.jpg`] as string;
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        logoUrl: logo, contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'Oh Belly es una soda prebiótica con burbujas, sin azúcar, hecha con fruta de verdad y fibra prebiótica para pancitas felices. Cinco sabores, cada uno con su personaje bailando en la lata. Tienda de demostración.',
        policies: {
          returns: 'Si una lata llega abollada o abierta, escríbenos en 48 horas y la reponemos. Las latas cerradas no tienen devolución por ser bebidas. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos en La Paz y El Alto en 24 horas, o puedes recoger tu pedido en nuestro local de Sopocachi. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido y tu suscripción. Tienda de demostración.',
          terms: 'Precios en bolivianos. Oh Belly no reemplaza una dieta equilibrada. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
    });

    const product = async (name: string, dto: Record<string, unknown>) => {
      if (record.products[name]) return record.products[name] as string;
      const created: any = await links.create(merchantId, storeId, { name, currency: 'BOB', ...dto } as never);
      record.products[name] = created.id; await save(); return created.id as string;
    };
    const demo = ' Producto de demostración.';
    const nutrition = [{ label: 'Contenido', value: 'Lata de 355 ml' }, { label: 'Azúcar añadida', value: '0 g' }, { label: 'Fibra prebiótica', value: '5 g por lata' }, { label: 'Calorías', value: '30 kcal' }];
    const lata = await product('Oh Belly soda prebiótica', { categoryId: record.categories['Sodas'], amount: 1800, imageUrls: [flavour(0), photo(0)], badge: 'Sin azúcar',
      description: 'Nuestra soda con burbujas: fruta de verdad, 5 g de fibra prebiótica y cero azúcar añadida. Cinco sabores, cada uno con su personaje bailando en la lata.' + demo,
      variants: FLAVOURS.map((item, index) => ({ name: item.name, amount: 1800, stock: item.stock, imageUrl: flavour(index), options: [{ name: 'Sabor', value: item.name }] })),
      specifications: nutrition,
      highlights: [{ icon: 'leaf', label: 'Fruta de verdad' }, { icon: 'sprout', label: 'Prebiótica' }, { icon: 'sparkle', label: 'Con burbujas' }] });
    const surtido = await product('Pack surtido x6', { categoryId: record.categories['Packs'], amount: 9900, imageUrls: [photo(1)], stock: 30, badge: 'Más pedido',
      description: 'Seis latas para probarlas todas: una de cada sabor y una extra de Limón y jengibre, el favorito de la casa.' + demo,
      contentBlocks: [{ type: 'features', title: 'Qué trae', items: [{ icon: 'bottle', label: '6 latas de 355 ml', detail: 'Los cinco sabores' }, { icon: 'leaf', label: '0 g de azúcar añadida', detail: 'Endulzada con fruta' }, { icon: 'sprout', label: '5 g de fibra prebiótica', detail: 'En cada lata' }] }] });
    const nevera = await product('Caja nevera x12', { categoryId: record.categories['Packs'], amount: 18900, imageUrls: [photo(5), photo(4)], stock: 18,
      description: 'Doce latas de un mismo sabor para llenar la nevera de la semana. Elige el sabor al pedir.' + demo,
      variants: FLAVOURS.map((item, index) => ({ name: item.name, amount: 18900, stock: index === 2 ? 0 : 6, imageUrl: flavour(index), options: [{ name: 'Sabor', value: item.name }] })),
      specifications: [{ label: 'Contenido', value: '12 latas de 355 ml' }, { label: 'Precio por lata', value: 'Bs 15,75' }] });
    await product('Caja regalo Oh Belly', { categoryId: record.categories['Regalos'], amount: 8500, imageUrls: [photo(3)], badge: 'Nuevo',
      description: 'Una caja con asa y cuatro latas surtidas, lista para regalar. Elige el color de la caja.' + demo,
      variants: [{ name: 'Naranja', amount: 8500, stock: 10, options: [{ name: 'Color', value: 'Naranja' }] }, { name: 'Blanca', amount: 8500, stock: 8, options: [{ name: 'Color', value: 'Blanca' }] },
        { name: 'Oliva', amount: 8500, stock: 2, options: [{ name: 'Color', value: 'Oliva' }] }] });
    await product('Póster Oh Belly', { categoryId: record.categories['Regalos'], amount: 6000, imageUrls: [photo(6)], stock: 12,
      description: 'El póster del camión Oh Belly, impreso en papel mate de 50 × 70 cm para la cocina o la oficina.' + demo });
    await step('subscriptions', async () => {
      await links.updateSubscriptions(merchantId, storeId, surtido, { options: [{ cadence: 'MONTHLY', discountPercent: 15, label: 'Cada mes' }] } as never);
      await app.get(SubscribersService).setEnabled(merchantId, storeId, true);
    });
    await step('promo-codes', async () => { await app.get(PromoCodesService).create(merchantId, storeId, { code: 'HOLABELLY', discountType: 'PERCENT', discountValue: 10 } as never); });
    await step('recommendations', async () => {
      await links.update(merchantId, storeId, lata, { recommendedProductIds: [surtido, nevera] } as never);
      await links.update(merchantId, storeId, surtido, { recommendedProductIds: [lata, nevera] } as never);
    });
    // Next-day delivery in La Paz and El Alto, and the Sopocachi shop, with an address so pickup is offered.
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true, locations: [{ id: 'sopocachi', name: 'Oh Belly Sopocachi', address: 'Av. 20 de Octubre 2150, Sopocachi, La Paz', department: 'LA_PAZ', city: 'La Paz', pickupEnabled: true, deliveryEnabled: true,
        openingHours: [1, 2, 3, 4, 5, 6].map(day => ({ day, open: '10:00', close: '20:00', closed: false })).concat([{ day: 0, open: '10:00', close: '14:00', closed: true }]) }] as never } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz y El Alto', fee: 1200, departments: ['LA_PAZ'], freeAbove: 15000, estimatedMinutes: 1440 } as never);
    });
    console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length, logo, wordmark, brand: [0, 2, 4, 6].map(photo), video: record.photos[VIDEO] }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
