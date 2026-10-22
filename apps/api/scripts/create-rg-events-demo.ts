/** RG EVENTS (owner 2026-10-22): a wedding company that plans weddings and sells champagne, cakes and glasses, built from the photos
 *  in ~/Downloads/Rg events, on the owner's demo merchant (the one that owns NOA VARGAS and BOXY). Elegant and calm: linen paper,
 *  a champagne accent and the editorial serif. Local database only; idempotent through examples/rg-events/demo.json.
 *   npx ts-node --transpile-only scripts/create-rg-events-demo.ts [--rebuild]
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party wedding images (Pinterest): a local demo only, never to be published outside. */
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
import { OperationsService } from '../src/operations/operations.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceTemplatesService } from '../src/storefront-source/source-templates.service';

const FOLDER = resolve(homedir(), 'Downloads/Rg events');
/** Index → file: 0 couple running (black and white), 1 couple on a lawn under a pine, 2 raspberry cake being cut, 3 champagne tower,
 *  4 white cake cut together, 5 couple hugging with the veil, 6 champagne glasses held, 7 bride's bouquet and train, 8 champagne spray. */
const PHOTOS = ['054504e4faceeb61c885dcb08e15e317.jpg', '153255da6c5d115f931d85a2d7860e6b.jpg', '44567f05249efd02ac660454918c726f.jpg', '63b83b8b5f802925312124bc672dd3bc.jpg',
  '7f0ed649c3b2f0edc9718411701fa742.jpg', 'b34ba468675ef9880b51e558c60c0f0a.jpg', 'be93c56e64ee98d38ec5c3e073875fba.jpg', 'e0f20c93a42a55ed01a41f8c1f61d72e.jpg', 'faab6c6ca40b1adbbcb31dc7e0c8de84.jpg'];
const CATEGORIES = ['Bodas', 'Tortas', 'Champagne y copas'];

/** Owner: «a company that makes weddings, sells champagne, cakes and wine cups». Calm and elegant: centred header, the photo hero
 *  with parallax, an overlay story, square buttons, sharp corners, airy spacing and the editorial product page. */
const LOOK = { feature: [], menu: 'panel', filters: 'chips', grid: 'grid3', header: 'centered', announce: 'plain', footer: 'bigname', button: 'square', corners: 'sharp',
  bands: 'calm', hero: 'full', story: 'overlay', values: 'line', closing: 'photo', density: 'airy', texture: 'none', photos: 'natural', cards: 'showcase', card: 'plain', offers: 'rows',
  pdp: 'editorial', pdpOrder: 'story-first' };
const SECTIONS = [
  { id: 'process', title: 'Cómo planeamos tu boda', items: [
    { title: 'Conversamos', text: 'Nos cuentas la fecha, el lugar y cómo imaginan el día; te proponemos un plan y un presupuesto.' },
    { title: 'Diseñamos', text: 'Elegimos juntos flores, mesa, torta y champagne, y coordinamos a cada proveedor.' },
    { title: 'Celebramos', text: 'El día de la boda nuestro equipo está en todo, para que ustedes solo disfruten.' }] },
  { id: 'faq', title: 'Preguntas', items: [
    { title: '¿Con cuánta anticipación reservamos?', text: 'Lo ideal es entre seis y doce meses antes; para fechas cercanas, consúltanos disponibilidad.' },
    { title: '¿Puedo comprar solo la torta o el champagne?', text: 'Sí. Tortas, champagne y copas se venden también por separado, con entrega en La Paz.' },
    { title: '¿Esta tienda es real?', text: 'Es una tienda de demostración de pagosYa: ningún pedido ni cobro es real.' }] },
];

async function main() {
  const folder = resolve(__dirname, '../../../examples/rg-events');
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-rg-events-demo requires a local database');
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'RG Events', tagline: 'Bodas, champagne y tortas para el día más lindo.', backgroundColor: '#f7f3ee', accentColor: '#a8874f', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const upload = async (file: string) => {
      if (record.photos[file]) return record.photos[file] as string;
      const asset = await uploads.saveBuffer(await readFile(resolve(FOLDER, file)), 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[file] = asset.url; await save(); return asset.url as string;
    };
    for (const file of PHOTOS) await upload(file);
    const photo = (index: number) => record.photos[PHOTOS[index]] as string;
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'RG Events planifica bodas en La Paz y vende tortas, champagne y copas para celebrar. Tienda de demostración.',
        policies: {
          returns: 'Las tortas se preparan por encargo y no tienen devolución; el champagne y las copas cerradas, dentro de 7 días. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos tortas, champagne y copas en La Paz, o puedes recogerlos en nuestro estudio de Calacoto. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido y para coordinar tu evento. Tienda de demostración.',
          terms: 'Precios en bolivianos. Los paquetes de boda se confirman con una reunión previa. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
    });

    const product = async (name: string, dto: Record<string, unknown>) => {
      if (record.products[name]) return record.products[name] as string;
      const created: any = await links.create(merchantId, storeId, { name, currency: 'BOB', ...dto } as never);
      record.products[name] = created.id; await save(); return created.id as string;
    };
    const demo = ' Producto de demostración.';
    const sizes = (prices: number[], image: number) => ['Para 30 personas', 'Para 60 personas', 'Para 100 personas'].map((value, index) => ({ name: value, amount: prices[index], stock: 5, imageUrl: photo(image), options: [{ name: 'Tamaño', value }] }));
    const tower = await product('Torre de champagne', { categoryId: record.categories['Champagne y copas'], amount: 240000, imageUrls: [photo(3)], stock: 4,
      description: 'Montamos una torre de copas de cristal y la servimos en el brindis, con el champagne incluido.' + demo,
      highlights: [{ icon: 'glass', label: '60 copas' }, { icon: 'bottle', label: 'Champagne incluido' }] });
    await product('Boda Esencial', { categoryId: record.categories['Bodas'], amount: 1800000, imageUrls: [photo(1), photo(7)], stock: 6, badge: 'Más elegido',
      description: 'Coordinación del día, diseño de mesa y flores, y un equipo en el lugar hasta el final. Hasta 80 invitados.' + demo,
      extras: [{ name: 'Torre de champagne', amount: 240000, groupName: 'Suma a tu boda' }, { name: 'Fotografía de la ceremonia', amount: 350000, groupName: 'Suma a tu boda' }],
      specifications: [{ label: 'Invitados', value: 'Hasta 80' }, { label: 'Incluye', value: 'Coordinación, mesa y flores' }],
      contentBlocks: [{ type: 'features', title: 'Qué incluye', items: [{ icon: 'calendar', label: 'Plan del día', detail: 'Cronograma con cada proveedor' }, { icon: 'heart', label: 'Mesa y flores', detail: 'Diseño a su estilo' }, { icon: 'star', label: 'Equipo en el lugar', detail: 'De la ceremonia al brindis' }] }] });
    await product('Boda Completa', { categoryId: record.categories['Bodas'], amount: 4500000, imageUrls: [photo(5), photo(8)], stock: 3,
      description: 'Todo lo de la Boda Esencial más torta, torre de champagne, música y fotografía. Hasta 200 invitados.' + demo,
      specifications: [{ label: 'Invitados', value: 'Hasta 200' }, { label: 'Incluye', value: 'Torta, champagne, música y fotografía' }] });
    await product('Torta de frambuesa', { categoryId: record.categories['Tortas'], amount: 95000, imageUrls: [photo(2)], badge: 'Nueva',
      description: 'Bizcocho de vainilla con crema y frambuesas frescas. Se prepara por encargo.' + demo, variants: sizes([95000, 160000, 240000], 2) });
    await product('Torta blanca clásica', { categoryId: record.categories['Tortas'], amount: 120000, imageUrls: [photo(4)],
      description: 'La torta de bodas de siempre: blanca, de varios pisos, con decoración a mano. Se prepara por encargo.' + demo, variants: sizes([120000, 190000, 280000], 4) });
    await product('Champagne Brut', { categoryId: record.categories['Champagne y copas'], amount: 38000, imageUrls: [photo(8)], stock: 24,
      description: 'Botella de champagne brut para el brindis, bien fría en la entrega.' + demo });
    await product('Copas de cristal (set de 6)', { categoryId: record.categories['Champagne y copas'], amount: 32000, imageUrls: [photo(6)],
      description: 'Seis copas de cristal para el brindis: de champagne o de vino.' + demo,
      variants: [{ name: 'Champagne', amount: 32000, stock: 10, imageUrl: photo(6), options: [{ name: 'Tipo', value: 'Champagne' }] }, { name: 'Vino', amount: 28000, stock: 2, imageUrl: photo(6), options: [{ name: 'Tipo', value: 'Vino' }] }] });
    await step('promo-codes', async () => { await app.get(PromoCodesService).create(merchantId, storeId, { code: 'BRINDIS10', discountType: 'PERCENT', discountValue: 10 } as never); });
    await step('recommendations', async () => {
      await links.update(merchantId, storeId, record.products['Champagne Brut'], { recommendedProductIds: [record.products['Copas de cristal (set de 6)'], tower] } as never);
    });
    // Delivery in La Paz and the Calacoto studio, with an address so pickup is offered (pickup needs an address since 2026-10-22).
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true, locations: [{ id: 'calacoto', name: 'Estudio RG Calacoto', address: 'Calle 16 de Calacoto 8020, La Paz', department: 'LA_PAZ', city: 'La Paz', pickupEnabled: true, deliveryEnabled: true,
        openingHours: [1, 2, 3, 4, 5].map(day => ({ day, open: '10:00', close: '19:00', closed: false })).concat([{ day: 6, open: '10:00', close: '14:00', closed: false }, { day: 0, open: '10:00', close: '14:00', closed: true }]) }] as never } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz ciudad', fee: 3000, departments: ['LA_PAZ'], freeAbove: 150000, estimatedMinutes: 240 } as never);
    });

    const templates = app.get(SourceTemplatesService), projects = app.get(SourceProjectsService);
    let current = await projects.current(merchantId, storeId);
    if (current.revision === 0 || process.argv.includes('--rebuild')) {
      await templates.applyMaster(merchantId, storeId, current.revision, async () => null);
      current = await projects.current(merchantId, storeId);
      const copy = { announcement: 'Reserva tu fecha 2027 · Tortas y champagne con entrega en La Paz', eyebrow: 'Bodas en La Paz', headline: 'El día más lindo, sin preocuparte de nada',
        subcopy: 'Planificamos tu boda y llevamos la torta, el champagne y las copas para el brindis.', primaryCta: 'Ver bodas y tortas', secondaryCta: 'Cómo trabajamos',
        productsTitle: 'Para celebrar', storyTitle: 'Bodas con calma', closingLine: 'Hablemos de su boda', closingCta: 'Ver paquetes', tagline: 'Bodas, tortas y champagne. La Paz.',
        storyBody: 'En RG Events creemos que una boda se disfruta cuando alguien más se ocupa de los detalles. Coordinamos cada proveedor, preparamos la torta y servimos el champagne, para que ustedes solo celebren. Tienda de demostración.',
        values: [{ title: 'Un solo equipo', text: 'Plan, torta y brindis con las mismas personas.' }, { title: 'Entrega en La Paz', text: 'Tortas, champagne y copas a tu puerta.' }, { title: 'Por encargo', text: 'Cada torta se prepara para tu fecha.' }] };
      const saved = await templates.refill(merchantId, storeId, current.revision, {
        copy, look: { palette: 'linen', fonts: 'editorial', colors: { accent: '#a8874f' } }, heroPhoto: photo(0), storyPhoto: photo(7), sections: SECTIONS, variants: LOOK as never,
        featureCopy: {},
      }, 'RG Events');
      const version = await projects.version(merchantId, storeId, saved.revision);
      const snapshot = version.snapshot as any;
      const files = snapshot.files.map((file: { path: string; content: string }) => {
        if (file.path !== 'config.js') return file;
        const json = JSON.parse(file.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;?\s*$/, ''));
        return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...json, dna: { ...json.dna, motion: 'cinematic', hover: 'lift', press: 'sink' } })};\n` };
      });
      const moved = await projects.save(merchantId, storeId, { revision: saved.revision, label: 'RG Events', brief: snapshot.brief, files } as never);
      record.built = (moved as any).revision; await save();
    }
    console.log(JSON.stringify({ storeId, slug: record.slug, revision: (await projects.current(merchantId, storeId)).revision, products: Object.keys(record.products).length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
