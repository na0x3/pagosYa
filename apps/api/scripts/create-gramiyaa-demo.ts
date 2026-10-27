/** GRAMIYAA (owner 2026-10-25: «make a store with the folder gramiyaa — an animated store with videos, explanations, etc»,
 *  slogan «let the oil do its thing»): wood cold-pressed oils built from ~/Downloads/gramiyaa (13 brand photos and explainer
 *  cards + 2 videos), on the owner's demo merchant (the one that owns NOA VARGAS, BOXY and BAEK). This script only writes what a
 *  merchant would type in themselves — products, photos, story, policies, delivery, a code, a subscription; the design is YAPI's,
 *  asked in the Studio chat with the explainer cards and videos attached (feedback: test stores are designed by YAPI). Local
 *  database only; idempotent through examples/gramiyaa/demo.json.
 *   npx ts-node --transpile-only scripts/create-gramiyaa-demo.ts [--record <folder>]
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party brand images: a local demo only, never to be published outside. */
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

const FOLDER = resolve(homedir(), 'Downloads/gramiyaa');
/** The product photos: three groundnut cartons, the 5 L groundnut jug, the mustard carton in a kitchen, the sesame «Sun Protect
 *  Pack» carton, the coconut-oil jar. */
const PHOTOS = { groundnut: '2b7b39e506bc08bd324aedd4d422315b.jpg', jug: '9517dd3657ecca843cdea4180834bc79.jpg', mustard: '75de7bf4f505528f84070f2cd3b83889.jpg',
  sesame: 'd73dc78e70de1ad13cd2da04dc84b541.jpg', coconut: 'cdd3b0af3f022038e35af7d0b5ad89de.jpg' } as const;
/** «Oils: A (cold) Pressing Matter» — a wire basket filling with the four cartons; its 3 s frame is the tasting pack's photo. */
const BASKET_VIDEO = 'From Klickpin.com- Build these clever launch checklist tips to make your next project easier and prettier with aesthetic touches that photograph b.mp4';
/** What YAPI gets in the chat to build the explanations from: the explainer cards (health, vegan, refined vs cold-pressed, what
 *  cold-pressed is, «Let oil do its thing.»), the oil-on-a-spoon «Taste tradition together» photo, the olives and the 2 videos. */
const BRAND = ['20139e99e9031b8b099e6c878bbbba36.jpg', '72560d72e46d293e08b89e4b218ab2d8.jpg', '9ae2dfc279d10b92354486d521b90a76.jpg', 'c0e1a19bc4a78b0321f737f813b7dd07.jpg',
  '9bd96312acc48db8f38d4c27058c31c2.jpg', '50e579f381805d31fbe75049452b34ab.jpg', '1881e5c95ce9c0333b2cc2350d09f388.jpg'];
const POUR_VIDEO = '9da7e7f969fb5c3b60e7288ad783a624_720w.mp4';
const CATEGORIES = ['Aceites', 'Packs'];

async function basketFrame(): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'gramiyaa-'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '3', '-i', resolve(FOLDER, BASKET_VIDEO), '-frames:v', '1', '-q:v', '2', join(dir, 'basket.jpg')]);
  return readFile(join(dir, 'basket.jpg'));
}

async function main() {
  // `--record <folder>` makes a second, fresh store (owner 2026-10-25: rebuild Gramiyaa after the platform fixes).
  const recordArg = process.argv.indexOf('--record');
  const folder = resolve(__dirname, `../../../examples/${recordArg > 0 ? process.argv[recordArg + 1] : 'gramiyaa'}`);
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-gramiyaa-demo requires a local database');
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'Gramiyaa', tagline: 'Let the oil do its thing.', backgroundColor: '#f4f1ea', accentColor: '#9b1b30', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const keep = async (key: string, bytes: () => Promise<Buffer>, mime: string) => {
      if (record.photos[key]) return record.photos[key] as string;
      const asset = await uploads.saveBuffer(await bytes(), mime);
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[key] = asset.url; await save(); return asset.url as string;
    };
    const photo: Record<string, string> = {};
    for (const [key, file] of Object.entries(PHOTOS)) photo[key] = await keep(file, () => readFile(resolve(FOLDER, file)), 'image/jpeg');
    photo.basket = await keep('basket.jpg', basketFrame, 'image/jpeg');
    const brand = [];
    for (const file of BRAND) brand.push(await keep(file, () => readFile(resolve(FOLDER, file)), 'image/jpeg'));
    for (const file of [BASKET_VIDEO, POUR_VIDEO]) brand.push(await keep(file, () => readFile(resolve(FOLDER, file)), 'video/mp4'));
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'Gramiyaa hace aceites prensados en madera, en frío, como se hacía antes: las semillas y frutos secos se prensan lento, sin calor ni químicos, y el aceite conserva su aroma, su sabor y sus nutrientes. Maní, mostaza, sésamo y coco. 100 % veganos y libres de crueldad, en un empaque opaco y sin oxígeno para que lleguen frescos a tu cocina. Let the oil do its thing. Tienda de demostración: ningún pedido es real.',
        policies: {
          returns: 'Si un envase llega abierto o dañado, escríbenos en 48 horas y lo reponemos. Los aceites cerrados no tienen devolución por ser alimentos. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos en La Paz y El Alto en 24 horas, o recoge tu pedido en nuestro local de Sopocachi. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido y tu suscripción. Tienda de demostración.',
          terms: 'Precios en bolivianos. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
    });

    const product = async (name: string, dto: Record<string, unknown>) => {
      if (record.products[name]) return record.products[name] as string;
      const created: any = await links.create(merchantId, storeId, { name, currency: 'BOB', ...dto } as never);
      record.products[name] = created.id; await save(); return created.id as string;
    };
    const demo = ' Producto de demostración.';
    const pressed = [{ icon: 'leaf', label: 'Prensado en madera' }, { icon: 'sprout', label: 'Sin químicos' }, { icon: 'sparkle', label: '100 % vegano' }];
    const groundnut = await product('Aceite de maní prensado en madera', { categoryId: record.categories['Aceites'], amount: 7500, imageUrls: [photo.groundnut, photo.jug], badge: 'Más pedido',
      description: 'Aceite de maní prensado en frío en prensa de madera: sabor suave a maní tostado, ideal para freír, saltear y cocinar todos los días. Sin calor ni químicos, conserva su aroma y sus nutrientes.' + demo,
      variants: [{ name: '1 L', amount: 7500, stock: 40, imageUrl: photo.groundnut, options: [{ name: 'Tamaño', value: '1 L' }] },
        { name: 'Bidón 5 L', amount: 33000, stock: 8, imageUrl: photo.jug, options: [{ name: 'Tamaño', value: 'Bidón 5 L' }] }],
      specifications: [{ label: 'Extracción', value: 'Prensado en frío, en prensa de madera' }, { label: 'Ingredientes', value: '100 % maní' }, { label: 'Empaque', value: 'Cartón opaco sin oxígeno' }],
      highlights: pressed });
    const mustard = await product('Aceite de mostaza prensado en madera', { categoryId: record.categories['Aceites'], amount: 8000, imageUrls: [photo.mustard], stock: 30,
      description: 'Aceite de mostaza prensado en frío: picante, aromático y con carácter, para encurtidos, curries y verduras al sartén.' + demo,
      specifications: [{ label: 'Extracción', value: 'Prensado en frío, en prensa de madera' }, { label: 'Ingredientes', value: '100 % semilla de mostaza' }, { label: 'Contenido', value: '1 L' }],
      highlights: pressed });
    const sesame = await product('Aceite de sésamo prensado en madera', { categoryId: record.categories['Aceites'], amount: 9500, imageUrls: [photo.sesame], stock: 24, badge: 'Nuevo',
      description: 'Aceite de sésamo prensado en frío en su «Sun Protect Pack»: opaco y sin oxígeno para que dure fresco. Perfecto para aliños, salteados y para terminar un plato.' + demo,
      specifications: [{ label: 'Extracción', value: 'Prensado en frío, en prensa de madera' }, { label: 'Ingredientes', value: '100 % sésamo' }, { label: 'Contenido', value: '1 L' }],
      highlights: pressed });
    const coconut = await product('Aceite de coco prensado en madera', { categoryId: record.categories['Aceites'], amount: 8500, imageUrls: [photo.coconut], stock: 20,
      description: 'Aceite de coco prensado en frío: para cocinar, hornear y también para el cuidado del pelo y la piel. Sin refinar, con todo el aroma del coco.' + demo,
      specifications: [{ label: 'Extracción', value: 'Prensado en frío, en prensa de madera' }, { label: 'Ingredientes', value: '100 % coco' }, { label: 'Contenido', value: 'Frasco de 500 ml' }],
      highlights: pressed });
    const pack = await product('Pack degustación 4 aceites', { categoryId: record.categories['Packs'], amount: 29900, imageUrls: [photo.basket], stock: 15, badge: 'Para regalar',
      description: 'Los cuatro aceites en una canasta: maní, mostaza, sésamo y coco, de 1 L cada uno (el coco en frasco de 500 ml). La mejor forma de descubrir cuál va con cada receta.' + demo,
      contentBlocks: [{ type: 'features', title: 'Qué trae', items: [{ icon: 'bottle', label: 'Aceite de maní 1 L', detail: 'Para todos los días' }, { icon: 'bottle', label: 'Aceite de mostaza 1 L', detail: 'Con carácter' },
        { icon: 'bottle', label: 'Aceite de sésamo 1 L', detail: 'Para terminar platos' }, { icon: 'bottle', label: 'Aceite de coco 500 ml', detail: 'Cocina y cuidado' }] }] });
    await step('subscriptions', async () => {
      await links.updateSubscriptions(merchantId, storeId, groundnut, { options: [{ cadence: 'MONTHLY', discountPercent: 10, label: 'Cada mes' }] } as never);
      await app.get(SubscribersService).setEnabled(merchantId, storeId, true);
    });
    await step('promo-codes', async () => { await app.get(PromoCodesService).create(merchantId, storeId, { code: 'PRENSADO10', discountType: 'PERCENT', discountValue: 10 } as never); });
    await step('recommendations', async () => {
      await links.update(merchantId, storeId, groundnut, { recommendedProductIds: [pack, sesame] } as never);
      await links.update(merchantId, storeId, pack, { recommendedProductIds: [groundnut, coconut] } as never);
      await links.update(merchantId, storeId, mustard, { recommendedProductIds: [pack] } as never);
    });
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true, locations: [{ id: 'sopocachi', name: 'Gramiyaa Sopocachi', address: 'Av. 6 de Agosto 2450, Sopocachi, La Paz',
        openingHours: [1, 2, 3, 4, 5, 6].map(day => ({ day, open: '09:00', close: '19:00', closed: false })).concat([{ day: 0, open: '09:00', close: '13:00', closed: true }]) }] as never } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz y El Alto', fee: 1200, departments: ['LA_PAZ'], freeAbove: 30000, estimatedMinutes: 1440 } as never);
    });
    console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length, brand }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
