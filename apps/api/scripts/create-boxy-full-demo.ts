/** BOXY, the full store (owner 2026-10-25: «elegant, and full: many sections, a blog, the chatbot, a popup, footer newsletter,
 *  colour picker, sorter»). Only what a merchant types in is scripted here — the catalog from ~/Downloads/boxy (colour and size
 *  options, so the colour picker and the sorter have something to work on), blog articles, the assistant, the signup popup with
 *  a welcome code, delivery, policies. The design is YAPI's: the store is left at revision 0 for a Studio chat.
 *   npx ts-node --transpile-only scripts/create-boxy-full-demo.ts
 *  Local database only; idempotent through examples/boxy-full/demo.json. The app context's timers are stopped before their first
 *  tick, so it never sends emails or claims jobs beside the running API. The photos and the video are third-party Pinterest
 *  files: a local demo only, never to be published. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { PaymentLinksService } from '../src/payment-links/payment-links.service';
import { PromoCodesService } from '../src/promo-codes/promo-codes.service';
import { RetentionService } from '../src/retention/retention.service';
import { OperationsService } from '../src/operations/operations.service';
import { CommerceContentService } from '../src/product-content/commerce-content.service';
import { StoreAssistantAdminService } from '../src/store-assistant/store-assistant-admin.service';
import { normalizeProductVariants, totalVariantStock } from '../src/payment-links/product-variants';

const FOLDER = resolve(homedir(), 'Downloads/boxy');
/** Index → photo: 0 navy hoodie, 1 cream «Bagels» back print, 2 navy oversize, 3 navy detail, 4 brown, 5 brown boxy, 6 washed
 *  grey, 7 cream «Slow Sunday», 8 navy «No Weak Days», 9 cream back detail (as named in create-boxy-demo.ts). */
const PHOTOS = ['0d2fb4eb273a61d945c7535f20c444cd', '1ed4b3d06c3673919e46c7bf8c9c5fc5', '5467569d269d48c5a3b88b98e3b92c2a', '6424b9c7fe3b6d038bbf508caf490cc1', '68b4b99981fb23b898414712a3d2b013',
  '6b140618c96fd1477562f49698bb2391', '864d7a87e70fcaadf13a4571baf1e8f4', 'b90555ce9c0c12166b4c48999a196bb7', 'dce66be07b2360a074241f74e3abbe88', 'eef5a66fe3744a2667b2fab41eeba4e3'];
const SIZES = ['S', 'M', 'L', 'XL'];
const CATEGORIES = ['Básicos', 'Gráficos'];
const PRODUCTS = [
  { name: 'Hoodie Boxy Esencial', category: 'Básicos', amount: 32000, colours: [['Azul marino', 0], ['Café', 5], ['Gris lavado', 6]], photos: [0, 5, 6, 3], tags: ['Algodón perchado', 'Corte boxy'], badge: 'Más vendido',
    description: 'Nuestro básico de corte boxy: hombro caído, capucha doble y bolsillo canguro, en algodón perchado de 400 g. Tres colores.' },
  { name: 'Hoodie Marino Oversize', category: 'Básicos', amount: 34000, colours: [['Azul marino', 2]], photos: [2, 3], tags: ['Oversize', 'Algodón perchado'],
    description: 'Un oversize azul marino de tela pesada, con puños y bajo acanalados.' },
  { name: 'Hoodie Café Relajado', category: 'Básicos', amount: 34000, colours: [['Café', 4], ['Azul marino', 2]], photos: [4, 5], tags: ['Relajado'],
    description: 'Café profundo, corte relajado y capucha amplia. Para todos los días.' },
  { name: 'Hoodie Lavado Niebla', category: 'Básicos', amount: 36000, colours: [['Gris lavado', 6]], photos: [6], tags: ['Lavado a mano', 'Edición limitada'], badge: 'Edición limitada',
    description: 'Teñido y lavado para un gris azulado gastado: cada pieza queda un poco distinta.' },
  { name: 'Hoodie Bagels', category: 'Gráficos', amount: 38000, colours: [['Crema', 1]], photos: [1], tags: ['Estampado en la espalda'],
    description: 'Crema con un gráfico ilustrado en la espalda y un detalle pequeño al frente.' },
  { name: 'Hoodie Slow Sunday', category: 'Gráficos', amount: 38000, colours: [['Crema', 7], ['Azul marino', 8]], photos: [7, 9], tags: ['Estampado en la espalda'], badge: 'Nuevo',
    description: 'Para domingos lentos: un gráfico rojo en la espalda y el nombre pequeño al frente.' },
  { name: 'Hoodie No Weak Days', category: 'Gráficos', amount: 38000, colours: [['Azul marino', 8]], photos: [8], tags: ['Estampado en la espalda'],
    description: 'Azul marino con tipografía blanca en la espalda.' },
] as const;
const ARTICLES = [
  { slug: 'como-elegir-tu-talla-boxy', title: 'Cómo elegir tu talla en un corte boxy', excerpt: 'Hombro caído y largo corto: por qué muchos bajan una talla, y cuándo no hacerlo.',
    body: 'Un hoodie boxy es más ancho que largo. El hombro cae por debajo del tuyo y el bajo llega a la cadera, no más abajo.\n\nSi te gusta suelto, pide tu talla de siempre. Si lo quieres más cerca del cuerpo, baja una. Entre la S y la XL hay cuatro centímetros de ancho por talla.\n\n¿Dudas? Escríbenos con tu altura y la prenda que más usas, y te recomendamos una talla.' },
  { slug: 'cuidar-algodon-perchado', title: 'Cómo cuidar el algodón perchado', excerpt: 'Agua fría, del revés y nada de secadora: así tu hoodie conserva la forma años.',
    body: 'El algodón perchado es suave por dentro porque sus fibras están cepilladas. El calor las apelmaza.\n\nLava tu hoodie del revés, con agua fría y colores parecidos. Sécalo extendido a la sombra: la secadora lo achica y le quita volumen.\n\nSi aparecen pelotitas, pásale un quitapelusas: es normal en las primeras lavadas.' },
  { slug: 'detras-del-lavado-niebla', title: 'Detrás del lavado Niebla', excerpt: 'Cómo teñimos y lavamos cada hoodie gris para que ninguno sea igual.',
    body: 'El Lavado Niebla empieza como un hoodie azul. Lo teñimos de nuevo y lo lavamos con piedra hasta que el color se abre en un gris azulado.\n\nCada lote sale un poco distinto: algunas costuras quedan más oscuras, algunas capuchas más claras. Por eso es edición limitada.\n\nHacemos pocas piezas por mes. Cuando se acaban, esperamos el siguiente lote.' },
];

async function main() {
  const folder = resolve(__dirname, '../../../examples/boxy-full');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-boxy-full-demo requires a local database');
    // The running API serves uploads on 3001; without this the store's photo URLs point at :3000, the website.
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      // The owner's demo merchant (the one that owns NOA VARGAS and the first BOXY), so it shows in «Tus tiendas».
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'BOXY', tagline: 'Hoodies de corte boxy. La Paz.', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const upload = async (file: string, mime: string) => {
      if (record.photos[file]) return record.photos[file] as string;
      const asset = await uploads.saveBuffer(await readFile(resolve(FOLDER, file)), mime);
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[file] = asset.url; await save(); return asset.url as string;
    };
    for (const id of PHOTOS) await upload(`${id}.jpg`, 'image/jpeg');
    // The folder's one video goes into the media library as a merchant upload would; YAPI decides whether to use it.
    const video = (await readdir(FOLDER)).find(name => name.endsWith('.mp4'));
    if (video) await upload(video, 'video/mp4');
    const photo = (index: number) => record.photos[`${PHOTOS[index]}.jpg`] as string;
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }
    for (const p of PRODUCTS) {
      if (record.products[p.name]) continue;
      const variants = normalizeProductVariants(p.colours.flatMap(([colour, image]) => SIZES.map(size => ({
        name: `${colour} / ${size}`, amount: p.amount, stock: size === 'XL' && colour === 'Café' ? 0 : size === 'S' ? 3 : 10, imageUrl: photo(image as number),
        options: [{ name: 'Color', value: colour as string }, { name: 'Talla', value: size }],
      }))));
      const item = await prisma.paymentLink.create({ data: { storeId, categoryId: record.categories[p.category], name: p.name, description: p.description, amount: p.amount, currency: 'BOB',
        variants, stock: totalVariantStock(variants), imageUrls: p.photos.map(photo), tags: [...p.tags], shippingWeightGrams: 700, ...('badge' in p ? { badge: p.badge } : {}) } });
      record.products[p.name] = item.id; await save();
    }

    const what = 'Hoodies de corte boxy: básicos de algodón perchado en azul marino, café y gris lavado, y hoodies con gráficos en la espalda.';
    const story = 'BOXY hace hoodies amplios, de hombro caído y tela pesada, para usar todos los días. Hacemos pocas piezas por lote en La Paz.';
    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'BOXY hace hoodies de corte boxy en algodón perchado de 400 g: básicos en tres colores y gráficos en la espalda. Hecho en La Paz, en lotes pequeños.',
        policies: {
          returns: 'Tienes 30 días para cambiar de talla o devolver un hoodie sin usar, con su etiqueta.',
          delivery: 'Entregamos en La Paz ciudad en 24 horas o puedes recoger tu pedido en nuestro taller.',
          privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para enviarte novedades.',
          terms: 'Precios en bolivianos. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
      await prisma.store.update({ where: { id: storeId }, data: { onboarding: { version: 1, step: 7, what, story, contact: { city: 'La Paz' }, photos: [photo(0), photo(5)], finishedAt: new Date().toISOString() } } });
    });
    await step('recommendations', async () => {
      const id = (name: string) => record.products[name] as string;
      await links.update(merchantId, storeId, id('Hoodie Boxy Esencial'), { recommendedProductIds: [id('Hoodie Lavado Niebla'), id('Hoodie Slow Sunday')] } as never);
      await links.update(merchantId, storeId, id('Hoodie Slow Sunday'), { recommendedProductIds: [id('Hoodie Bagels'), id('Hoodie No Weak Days')] } as never);
    });
    const content = app.get(CommerceContentService);
    await step('bundle', async () => {
      const basics = ['Hoodie Boxy Esencial', 'Hoodie Marino Oversize', 'Hoodie Café Relajado', 'Hoodie Lavado Niebla'].map(name => ({ productId: record.products[name], quantity: 1 }));
      await content.createBundle(merchantId, storeId, { name: 'Dos básicos', kind: 'MIX_MATCH', items: basics, minimumQuantity: 2, discountPercent: 10, label: '10 % llevando dos' } as never);
    });
    await step('articles', async () => {
      for (const [index, article] of ARTICLES.entries()) await content.saveArticle(merchantId, storeId, { ...article, locale: 'es', author: 'Equipo BOXY', publishedAt: new Date(Date.now() - (index + 1) * 3 * 86_400_000).toISOString() } as never);
    });
    const promos = app.get(PromoCodesService);
    await step('promo-codes', async () => {
      const welcome: any = await promos.create(merchantId, storeId, { code: 'BOXY10', discountType: 'PERCENT', discountValue: 10 } as never);
      await promos.setFlags(merchantId, storeId, welcome.id, { showInAssistant: true });
      record.welcomeCodeId = welcome.id;
    });
    // Newsletter: the footer form and a popup after 10 s with the welcome code, plus the welcome and cart-recovery emails.
    // Emails only ever go to an address someone types into this store, and only once the API's email worker sends them.
    await step('newsletter', async () => {
      const retention = app.get(RetentionService);
      const current = await retention.settings(storeId);
      await retention.save(merchantId, storeId, {
        revision: current.revision, comebackEnabled: false, visitsRequired: 5, rewardLabel: 'Un gorro BOXY de regalo', timezone: 'America/La_Paz',
        signupEnabled: true, signupTitle: 'Primero en saber', signupBody: 'Lotes nuevos, reposiciones y un 10 % en tu primera compra.', signupButton: 'Suscribirme',
        popupTrigger: 'delay', popupDelaySeconds: 10, popupPromoCodeId: record.welcomeCodeId, recoveryEnabled: true, recoveryHours: 2, reviewRequestsEnabled: true,
        welcomeEnabled: true, welcomeSubject: 'Bienvenido a BOXY', welcomeBody: 'Gracias por suscribirte. Usa el código BOXY10 en tu primera compra.',
      } as never);
    });
    await step('assistant', async () => {
      await app.get(StoreAssistantAdminService).save(merchantId, storeId, {
        enabled: true, name: 'Boxy', greeting: 'Hola, soy Boxy. ¿Te ayudo con una talla o a elegir un color?', formality: 'tu',
        notes: 'BOXY vende hoodies de corte boxy en algodón perchado de 400 g, tallas S a XL. Básicos: Esencial (azul marino, café, gris lavado), Marino Oversize, Café Relajado, Lavado Niebla (edición limitada). Gráficos: Bagels, Slow Sunday, No Weak Days, con estampado en la espalda. El corte es amplio: quien lo quiere más ajustado baja una talla. Llevando dos básicos hay 10 % de descuento. El código BOXY10 da 10 % en la primera compra. Entregamos en La Paz ciudad en 24 horas o se recoge en el taller. Cambios de talla en 30 días.',
      } as never);
    });
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz ciudad', fee: 1500, departments: ['LA_PAZ'], freeAbove: 70000, estimatedMinutes: 1440 } as never);
    });
    console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
