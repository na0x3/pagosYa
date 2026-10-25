/** REMOLINO (owner 2026-10-21): a lively demo blender store built from the photos in ~/Downloads/blender, with the spiral
 *  (spirals.webp) as its logo, on the owner's demo merchant (the one that owns NOA VARGAS and BOXY). It switches on the heavier
 *  commerce features so they can be tested in one place: options and add-ons, a choose-3 pick, long product page blocks, a
 *  timed discount, low and sold-out stock, subscriptions, a membership, a PDF download (the owner's db746c-tutorial-blender.pdf),
 *  two bundles, promo codes, a gift card, blog articles, the newsletter popup with a welcome code, the loyalty card, the store
 *  assistant, the contact form, policies and delivery. Local database only; idempotent through examples/remolino/demo.json.
 *   npx ts-node --transpile-only scripts/create-remolino-demo.ts [--rebuild] [--variant-b]
 *   … --record remolino-yapi --catalog-only   a new store with the catalog and features only, for YAPI to design (owner
 *   2026-10-25: test stores are designed by YAPI; the look below was scripted and is not YAPI's).
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party Pinterest images (two are nutribullet adverts): a local demo only, never to be published outside. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { PaymentLinksService } from '../src/payment-links/payment-links.service';
import { PromoCodesService } from '../src/promo-codes/promo-codes.service';
import { RetentionService } from '../src/retention/retention.service';
import { SubscribersService } from '../src/operations/subscribers.service';
import { OperationsService } from '../src/operations/operations.service';
import { CommercePlatformService } from '../src/commerce-platform/commerce-platform.service';
import { CommerceContentService } from '../src/product-content/commerce-content.service';
import { StoreAssistantAdminService } from '../src/store-assistant/store-assistant-admin.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceTemplatesService } from '../src/storefront-source/source-templates.service';

const FOLDER = resolve(homedir(), 'Downloads/blender');
/** Index → file: 0 basket, 1 ingredient stack, 2 filling a blender, 3 personal blender in clouds, 4 red splash, 5 personal blender
 *  with fruit, 6 berry smoothie on purple, 7 pink blender in a kitchen. */
const PHOTOS = ['2cbf2782594080a5f120da0f087dd71d.jpg', '555d6f24c3eb269149d501f274787c24.jpg', '5b297b20bbcdc217cc5098d1213669b1.jpg', '5ed5e8b3d5dd2fb458881877364480f1.jpg',
  '639363033b6de53a617b9aaa68e172bd.jpg', '665fd50300baa0f77c7ef8039423a5a0.jpg', '7fddb31790ebda77f1f2be78a2a182cc.jpg', '9df00367c5ff8e2a6e5a000f303e5688.jpg'];
const LOGO = 'spirals.webp';
const GUIDE_PDF = 'db746c-tutorial-blender.pdf';
const CATEGORIES = ['Licuadoras', 'Batidos', 'Club y guías'];
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** The look (owner: «an animated blender store»): logo red on warm paper, the soft rounded fonts, a ticker announcement, colour
 *  blocks with the moving marquee, pill buttons, round corners, the playful motion personality, and the interactive parts worth
 *  testing — category chips with colour dots (explore), shop by colour, the dropdown menu and the sidebar filters. */
const LOOK = { feature: ['explore', 'palette'], menu: 'dropdowns', filters: 'sidebar', grid: 'grid4', header: 'classic', announce: 'ticker', footer: 'twotone', button: 'pill', corners: 'round',
  bands: 'blocks', hero: 'split-right', story: 'split', values: 'icons', closing: 'newsletter', density: 'regular', texture: 'none', photos: 'rounded', cards: 'showcase', card: 'plain', offers: 'steps',
  pdp: 'gallery-left', pdpOrder: 'details-first' };
const SECTIONS = [
  { id: 'howto', title: 'Tu batido en tres pasos', items: [
    { title: 'Carga', text: 'Primero los líquidos, después la fruta y al final el hielo.' },
    { title: 'Gira', text: 'Empieza lento y sube la velocidad; un pulso al final deja todo parejo.' },
    { title: 'Sirve', text: 'Listo en menos de un minuto. Enjuaga la jarra con agua tibia al terminar.' }] },
  { id: 'blog', title: 'Del blog', items: [{ title: 'Artículos', text: 'Las guías publicadas por la tienda.' }, { title: 'Recetas', text: 'Batidos, limpieza y hielo.' }] },
  { id: 'faq', title: 'Preguntas', items: [
    { title: '¿Qué licuadora elijo?', text: 'La Pro para la familia, la Torbellino si picas mucho hielo, la Rosa para cocinas pequeñas y la Nube para llevar.' },
    { title: '¿Cómo funciona la suscripción del Pack Batido?', text: 'Eliges cada cuánto lo recibes y pagas con descuento; puedes pausar o cancelar desde tu correo.' },
    { title: '¿Qué incluye el Club Remolino?', text: 'Recetas nuevas cada mes y precios de socio. Es una membresía de prueba de esta tienda de demostración.' }] },
];
const ARTICLES = [
  { slug: 'batido-verde-que-si-sabe-bien', title: 'Un batido verde que sí sabe bien', excerpt: 'Espinaca, piña y jengibre: el orden en que cargas la jarra lo cambia todo.',
    body: 'El secreto de un batido verde suave es el orden. Primero el agua de coco, después la espinaca y al final la piña congelada.\n\nLicúa treinta segundos en velocidad cinco y termina con un pulso. Si queda espeso, agrega un chorrito más de líquido.\n\nArtículo de prueba de la tienda de demostración Remolino.' },
  { slug: 'limpia-tu-licuadora-en-30-segundos', title: 'Limpia tu licuadora en 30 segundos', excerpt: 'Agua tibia, una gota de detergente y un giro: así queda lista para el próximo batido.',
    body: 'Llena la jarra hasta la mitad con agua tibia y una gota de detergente. Tapa y licúa treinta segundos.\n\nEnjuaga con agua limpia y deja secar boca abajo. Así las cuchillas no guardan restos.\n\nArtículo de prueba de la tienda de demostración Remolino.' },
  { slug: 'hielo-picado-sin-esfuerzo', title: 'Hielo picado sin esfuerzo', excerpt: 'Por qué el pulso pica mejor que la velocidad máxima.',
    body: 'El hielo se pica mejor a golpes cortos. Usa el pulso tres o cuatro veces en lugar de dejar la licuadora en la velocidad más alta.\n\nPara granizados, agrega un poco de jugo antes del hielo: ayuda a que todo gire.\n\nArtículo de prueba de la tienda de demostración Remolino.' },
];

async function main() {
  const recordArg = process.argv.indexOf('--record');
  const folder = resolve(__dirname, `../../../examples/${recordArg > 0 ? process.argv[recordArg + 1] : 'remolino'}`);
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-remolino-demo requires a local database');
    // The running API serves uploads on 3001; without this the store's photo URLs point at :3000, the website (BOXY rev 1-2).
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'Remolino', tagline: 'Licuadoras que giran a tu ritmo.', backgroundColor: '#fff4ec', accentColor: '#e0262b', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const upload = async (path: string, mime: string) => {
      if (record.photos[path]) return record.photos[path] as string;
      const asset = await uploads.saveBuffer(await readFile(path.startsWith('/') ? path : resolve(FOLDER, path)), mime);
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[path] = asset.url; await save(); return asset.url as string;
    };
    for (const file of PHOTOS) await upload(file, 'image/jpeg');
    const logo = await upload(LOGO, 'image/webp');
    // Page 1 of the PDF, rendered beside this script's data (sips -s format png -Z 1400 <pdf>).
    const cover = await upload(resolve(__dirname, '../../../examples/remolino/guia-blender-portada.png'), 'image/png');
    const photo = (index: number) => record.photos[PHOTOS[index]] as string;
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    // The store's own settings: logo, policies, contact form, low-stock notes and cart suggestions.
    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        logoUrl: logo, contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'Remolino vende licuadoras para batidos, cremas y hielo picado, y comparte guías para sacarles el máximo. Tienda de demostración.',
        policies: {
          returns: 'Tienes 30 días para devolver una licuadora sin usar, en su caja. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos en La Paz ciudad o puedes recoger tu pedido. Los archivos PDF se descargan después del pago. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido y, si te suscribes, para enviarte novedades. Tienda de demostración.',
          terms: 'Precios en bolivianos. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
    });

    const product = async (name: string, dto: Record<string, unknown>) => {
      if (record.products[name]) return record.products[name] as string;
      const created: any = await links.create(merchantId, storeId, { name, currency: 'BOB', ...dto } as never);
      record.products[name] = created.id; await save(); return created.id as string;
    };
    const colours = (amount: number, list: Array<[string, number, number]>) => list.map(([colour, stock, image]) => ({ name: colour, amount, stock, imageUrl: photo(image), options: [{ name: 'Color', value: colour }] }));
    const pro = await product('Licuadora Remolino Pro', {
      categoryId: record.categories.Licuadoras, amount: 89000, imageUrls: [photo(6), photo(2)], shippingWeightGrams: 4200, discountPercent: 15, discountStartsAt: new Date().toISOString(), discountEndsAt: inDays(14),
      description: 'Jarra de 2 litros, 1200 W y cinco velocidades con pulso. Batidos, cremas y hielo picado para toda la familia. Producto de demostración.',
      tags: ['1200 W', 'Jarra de 2 L'], variants: colours(89000, [['Negro', 8, 6], ['Plata', 2, 6]]),
      extras: [{ name: 'Vaso personal 600 ml', amount: 8000, groupName: 'Accesorios' }, { name: 'Tapa con vertedor', amount: 4000, groupName: 'Accesorios' }],
      highlights: [{ icon: 'bolt', label: '1200 W' }, { icon: 'drop', label: 'Jarra de 2 L' }, { icon: 'snowflake', label: 'Pica hielo' }],
      specifications: [{ label: 'Potencia', value: '1200 W' }, { label: 'Capacidad', value: '2 litros' }, { label: 'Velocidades', value: '5 y pulso' }, { label: 'Cuchillas', value: 'Acero inoxidable, 6 puntas' }],
      contentBlocks: [
        { type: 'compare', title: 'De fruta a batido', beforeUrl: photo(2), afterUrl: photo(6), beforeLabel: 'Antes', afterLabel: 'Después', alt: 'La jarra con fruta entera y la misma jarra con el batido listo' },
        { type: 'features', title: 'Hecha para girar', items: [{ icon: 'bolt', label: 'Motor de 1200 W', detail: 'Tritura semillas y fruta congelada' }, { icon: 'snowflake', label: 'Pulso para hielo', detail: 'Golpes cortos para granizados' }, { icon: 'drop', label: 'Jarra de 2 L', detail: 'Batidos para cuatro personas' }] },
        { type: 'versus', title: 'Pro frente a una licuadora común', ours: 'Remolino Pro', theirs: 'Común', rows: [{ label: 'Pica hielo sin agua', ours: true, theirs: false }, { label: 'Cinco velocidades y pulso', ours: true, theirs: false }, { label: 'Jarra de 2 litros', ours: true, theirs: true }] },
        { type: 'faq', title: 'Sobre la Pro', items: [{ q: '¿La jarra va al lavavajillas?', a: 'Sí, la jarra y la tapa. La base se limpia con un paño húmedo.' }, { q: '¿Puedo licuar líquidos calientes?', a: 'Sí, con la tapa con vertedor puesta y empezando en velocidad baja.' }] },
      ],
    });
    const torbellino = await product('Licuadora Torbellino', {
      categoryId: record.categories.Licuadoras, amount: 129000, imageUrls: [photo(4)], stock: 5, shippingWeightGrams: 5200, badge: 'Más potente',
      description: 'Nuestro motor más fuerte: 1800 W para hielo, frutos secos y batidos espesos. Producto de demostración.', tags: ['1800 W'],
      highlights: [{ icon: 'bolt', label: '1800 W' }, { icon: 'snowflake', label: 'Hielo en segundos' }],
      specifications: [{ label: 'Potencia', value: '1800 W' }, { label: 'Capacidad', value: '1,8 litros' }],
      contentBlocks: [{ type: 'story', title: 'Por qué la hicimos', problem: 'Las licuadoras comunes se traban con hielo y frutos secos.', tried: 'Probamos jarras más grandes y cuchillas más largas.', solution: 'La respuesta fue más motor: 1800 W que no bajan de ritmo con nada.' }],
    });
    const rosa = await product('Licuadora Rosa Compacta', {
      categoryId: record.categories.Licuadoras, amount: 59000, imageUrls: [photo(7)], shippingWeightGrams: 2600,
      description: 'Compacta y de color, para cocinas pequeñas y batidos de todos los días. El color crema está agotado a propósito para probarlo. Producto de demostración.',
      tags: ['Compacta'], variants: colours(59000, [['Rosa', 3, 7], ['Crema', 0, 7]]),
    });
    const nube = await product('Licuadora Personal Nube', {
      categoryId: record.categories.Licuadoras, amount: 39000, imageUrls: [photo(3), photo(5)], stock: 12, shippingWeightGrams: 1400,
      description: 'Licúa en el vaso y llévalo contigo. Producto de demostración.', tags: ['Para llevar'],
      contentBlocks: [{ type: 'media', imageUrl: photo(5), alt: 'La licuadora personal junto a fruta fresca', caption: 'Cabe en cualquier mochila.' }],
    });
    const pack = await product('Pack Batido Semanal', {
      categoryId: record.categories.Batidos, amount: 12000, imageUrls: [photo(1), photo(0)], stock: 40, shippingWeightGrams: 1500,
      description: 'Una caja semanal con base de batido y fruta de temporada. Pide una vez o suscríbete con descuento. Producto de demostración.',
    });
    // The kit offers subscriptions only on products without add-ons, so the choose-3 pick lives on its own box.
    await product('Caja de frutas a elegir', {
      categoryId: record.categories.Batidos, amount: 9000, imageUrls: [photo(0)], stock: 30, shippingWeightGrams: 1500,
      description: 'Elige tres frutas para tus batidos de la semana. Producto de demostración.',
      extras: ['Frutilla', 'Plátano', 'Piña', 'Mango', 'Arándano'].map(name => ({ name, amount: 1000, groupName: 'Elige tus frutas', pickCount: 3, freeAllowance: 3 })),
    });
    await step('pack-without-extras', async () => { await links.update(merchantId, storeId, pack, { extras: [], description: 'Una caja semanal con base de batido y fruta de temporada. Pide una vez o suscríbete con descuento. Producto de demostración.' } as never); });
    await product('Club Remolino', {
      categoryId: record.categories['Club y guías'], amount: 5000, imageUrls: [photo(0)], fulfillmentType: 'MEMBERSHIP',
      membershipPeriods: [{ months: 1, amount: 5000 }, { months: 3, amount: 13500 }, { months: 12, amount: 48000 }],
      description: 'Membresía de prueba: recetas nuevas cada mes y precios de socio. Producto de demostración.',
    });
    const guide = await product('Guía Blender (PDF)', {
      categoryId: record.categories['Club y guías'], amount: 3500, imageUrls: [cover],
      description: 'Archivo PDF de prueba para las descargas digitales: un tutorial gratuito de Blender, el programa 3D. Se descarga después del pago. Producto de demostración.',
    });

    await step('recommendations', async () => {
      await links.update(merchantId, storeId, pro, { recommendedProductIds: [pack, nube, guide] } as never);
      await links.update(merchantId, storeId, torbellino, { recommendedProductIds: [pro, pack] } as never);
    });
    await step('download', async () => {
      const buffer = await readFile(resolve(FOLDER, GUIDE_PDF));
      await app.get(CommercePlatformService).upload(merchantId, storeId, guide, { buffer, size: buffer.length, originalname: 'tutorial-blender.pdf', mimetype: 'application/pdf' } as Express.Multer.File);
    });
    await step('subscriptions', async () => {
      await links.updateSubscriptions(merchantId, storeId, pack, { options: [{ cadence: 'WEEKLY', discountPercent: 10, label: 'Cada semana' }, { cadence: 'MONTHLY', discountPercent: 5, label: 'Cada mes' }] } as never);
      await app.get(SubscribersService).setEnabled(merchantId, storeId, true);
    });
    const content = app.get(CommerceContentService);
    await step('bundles', async () => {
      await content.createBundle(merchantId, storeId, { name: 'Licuadora + Pack Batido', kind: 'FIXED', items: [{ productId: pro, quantity: 1 }, { productId: pack, quantity: 1 }], minimumQuantity: 2, discountPercent: 10, label: 'Recomendado' } as never);
      await content.createBundle(merchantId, storeId, { name: 'Arma tu cocina', kind: 'MIX_MATCH', items: [pro, torbellino, rosa, nube].map(productId => ({ productId, quantity: 1 })), minimumQuantity: 2, discountPercent: 8 } as never);
    });
    await step('articles', async () => {
      for (const [index, article] of ARTICLES.entries()) await content.saveArticle(merchantId, storeId, { ...article, locale: 'es', author: 'Equipo Remolino', publishedAt: new Date(Date.now() - (index + 1) * 86_400_000).toISOString() } as never);
    });
    const promos = app.get(PromoCodesService);
    await step('promo-codes', async () => {
      const welcome: any = await promos.create(merchantId, storeId, { code: 'REMOLINO10', discountType: 'PERCENT', discountValue: 10 } as never);
      await promos.setFlags(merchantId, storeId, welcome.id, { showInAssistant: true });
      await promos.create(merchantId, storeId, { code: 'BATIDO20', discountType: 'FIXED', discountValue: 2000 } as never);
      record.welcomeCodeId = welcome.id;
    });
    await step('gift-card', async () => {
      const card = await app.get(CommercePlatformService).issueCredit(merchantId, storeId, { reference: 'remolino-demo-1', label: 'Tarjeta de regalo de prueba', kind: 'GIFT_CARD', amount: 20000, currency: 'BOB', expiresAt: inDays(365) });
      record.giftCardCode = card.code;
    });
    // Newsletter (signup + a popup after 8 s with the welcome code), the loyalty card and the welcome/recovery/review emails.
    // Emails only ever go to an address someone types into this store, and only once the API's email worker sends them.
    await step('newsletter', async () => {
      const retention = app.get(RetentionService);
      const current = await retention.settings(storeId);
      await retention.save(merchantId, storeId, {
        revision: current.revision, comebackEnabled: true, visitsRequired: 5, rewardLabel: 'Un vaso personal de regalo', timezone: 'America/La_Paz',
        signupEnabled: true, signupTitle: 'Únete al remolino', signupBody: 'Recetas nuevas cada semana y un 10 % de bienvenida en tu primera compra.', signupButton: 'Quiero mis recetas',
        popupTrigger: 'delay', popupDelaySeconds: 8, popupPromoCodeId: record.welcomeCodeId, recoveryEnabled: true, recoveryHours: 2, reviewRequestsEnabled: true,
        welcomeEnabled: true, welcomeSubject: 'Bienvenido a Remolino', welcomeBody: '¡Gracias por sumarte! Usa el código REMOLINO10 en tu primera compra. Esta es una tienda de demostración.',
      } as never);
    });
    await step('assistant', async () => {
      await app.get(StoreAssistantAdminService).save(merchantId, storeId, {
        enabled: true, name: 'Remi', greeting: '¡Hola! Soy Remi. ¿Te ayudo a elegir licuadora o a encontrar una receta?', formality: 'tu',
        notes: 'Remolino es una tienda de demostración de licuadoras. La Pro es para la familia, la Torbellino para mucho hielo, la Rosa para cocinas pequeñas y la Nube para llevar. El Pack Batido Semanal se puede suscribir cada semana o cada mes. La Guía Blender es un PDF que se descarga después del pago. El código REMOLINO10 da 10 % en la primera compra. Entregamos en La Paz ciudad o se puede recoger.',
      } as never);
    });
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz ciudad', fee: 1500, departments: ['LA_PAZ'], freeAbove: 100000, estimatedMinutes: 240 } as never);
    });

    if (process.argv.includes('--catalog-only')) {
      console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length, giftCard: record.giftCardCode }));
      return;
    }
    // The site: the Esencial home built from the current template (no YAPI call: the look's own words below replace the fill's),
    // then the look, then the playful motion personality in config.js.
    const templates = app.get(SourceTemplatesService), projects = app.get(SourceProjectsService);
    let current = await projects.current(merchantId, storeId);
    if (current.revision === 0 || process.argv.includes('--rebuild')) {
      await templates.applyMaster(merchantId, storeId, current.revision, async () => null);
      current = await projects.current(merchantId, storeId);
      const copy = { announcement: 'Envío gratis en La Paz desde Bs 1.000 · Usa REMOLINO10 en tu primera compra', eyebrow: 'Licuadoras con ritmo', headline: 'Licuadoras que giran a tu ritmo',
        subcopy: 'Batidos, cremas y hielo picado en segundos, con recetas para cada día.', primaryCta: 'Ver licuadoras', secondaryCta: 'Nuestra historia',
        productsTitle: 'Elige tu licuadora', storyTitle: 'Todo empieza girando', closingLine: 'Únete al remolino', closingCta: 'Ver la tienda', tagline: 'Licuadoras y recetas. La Paz.',
        storyBody: 'Remolino nació para que un buen batido no dependa de una buena mañana: licuadoras fáciles de usar, que pican hielo sin pelear y se limpian en treinta segundos. Sumamos recetas, un club y packs de fruta para que nunca falte qué licuar. Tienda de demostración.',
        values: [{ title: 'Motor fuerte', text: 'Hasta 1800 W para hielo y fruta congelada.' }, { title: 'Envío en La Paz', text: 'Gratis desde Bs 1.000 o recoge tu pedido.' }, { title: '30 días', text: 'Para devolver una licuadora sin usar.' }] };
      const saved = await templates.refill(merchantId, storeId, current.revision, {
        copy, look: { palette: 'ember', fonts: 'soft', colors: { accent: '#e0262b' } }, heroPhoto: photo(6), storyPhoto: photo(7), sections: SECTIONS, variants: LOOK as never,
        featureCopy: { paletteIntro: 'Negro, rosa o crema: elige tu licuadora por color.' },
      }, 'Remolino');
      const version = await projects.version(merchantId, storeId, saved.revision);
      const snapshot = version.snapshot as any;
      const files = snapshot.files.map((file: { path: string; content: string }) => {
        if (file.path !== 'config.js') return file;
        const json = JSON.parse(file.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;?\s*$/, ''));
        return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...json, dna: { ...json.dna, motion: 'playful', hover: 'lift', press: 'pop' } })};\n` };
      });
      const moved = await projects.save(merchantId, storeId, { revision: saved.revision, label: 'Remolino con movimiento', brief: snapshot.brief, files } as never);
      record.built = (moved as any).revision; await save();
    }
    // A/B test (owner 2026-10-22): design B is the same look with other words, so a test compares how each one sells.
    if (process.argv.includes('--variant-b')) {
      const current = await projects.current(merchantId, storeId);
      const copy = { eyebrow: 'Batidos en casa', headline: 'Tu batido perfecto, sin esfuerzo',
        subcopy: 'Licuadoras potentes que pican hielo, se limpian en 30 segundos y vienen con recetas.', primaryCta: 'Elegir mi licuadora', secondaryCta: 'Ver cómo funciona',
        productsTitle: 'Encuentra tu licuadora', storyTitle: 'Por qué Remolino', closingLine: '¿Listo para tu primer batido?', closingCta: 'Empezar ahora',
        storyBody: 'Queríamos batidos sin pelear con el hielo ni lavar media hora. Por eso Remolino hace licuadoras simples y fuertes, con un club de recetas y packs de fruta para cada semana. Tienda de demostración.' };
      const saved = await templates.refill(merchantId, storeId, current.revision, { copy }, 'Remolino B · otros textos');
      record.variantB = saved.revision; await save();
    }
    console.log(JSON.stringify({ storeId, slug: record.slug, revision: (await projects.current(merchantId, storeId)).revision, products: Object.keys(record.products).length, giftCard: record.giftCardCode }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
