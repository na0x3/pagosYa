/** RHODE (owner 2026-10-30: «create a store with one of my folders that use toque personal»): lip tints, lip treatments and pocket
 *  blushes built from ~/Downloads/catalogo_rhode_pagosya (productos_rhode.csv + 11 photos), on the owner's demo merchant (the one
 *  that owns NOA VARGAS, BOXY and BAEK). This script only writes what a merchant would type in themselves — products, photos, story,
 *  policies, delivery, a code; the design is YAPI's, asked through the chat-jobs API (feedback: test stores are designed by YAPI).
 *  Local database only; idempotent through examples/<record>/demo.json.
 *   npx ts-node --transpile-only scripts/create-rhode-demo.ts [--record <folder>]
 *  The app context's timers are stopped before their first tick, so it never sends emails or claims jobs beside the running API.
 *  The photos are third-party brand images: a local demo only, never to be published outside. */
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

const FOLDER = resolve(homedir(), 'Downloads/catalogo_rhode_pagosya');
const CATEGORIES = ['Labios', 'Rubor', 'Sets'];
const BADGES: Record<string, string> = { 'RH-LIP-001': 'Más pedido', 'RH-LIP-007': 'Nuevo', 'RH-BLU-001': 'Para regalar' };

async function main() {
  const recordArg = process.argv.indexOf('--record');
  const folder = resolve(__dirname, `../../../examples/${recordArg > 0 ? process.argv[recordArg + 1] : 'rhode'}`);
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('create-rhode-demo requires a local database');
    config.set('app.port', 3001);
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    const step = async (name: string, run: () => Promise<void>) => { if (record.done[name]) return; await run(); record.done[name] = true; await save(); console.log('✓', name); };
    if (!record) {
      const noa = await prisma.store.findFirstOrThrow({ where: { name: 'NOA VARGAS Atelier' }, select: { merchantId: true } });
      const store = await stores.create(noa.merchantId, { name: 'rhode', tagline: 'Labios jugosos, mejillas con color.', backgroundColor: '#f6efe9', accentColor: '#8a4b3c', animations: [] } as never);
      record = { merchantId: noa.merchantId, storeId: store.id, slug: store.slug, photos: {}, categories: {}, products: {}, done: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    const keep = async (file: string) => {
      if (record.photos[file]) return record.photos[file] as string;
      const asset = await uploads.saveBuffer(await readFile(resolve(FOLDER, 'imagenes', file)), file.endsWith('.png') ? 'image/png' : 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.photos[file] = asset.url; await save(); return asset.url as string;
    };
    for (const [order, name] of CATEGORIES.entries()) {
      if (record.categories[name]) continue;
      record.categories[name] = (await prisma.category.create({ data: { storeId, name, sortOrder: order } })).id; await save();
    }

    await step('settings', async () => {
      await stores.update(merchantId, storeId, {
        contactFormEnabled: true, showLowStockToCustomers: true, cartRecommendationsEnabled: true,
        aboutText: 'Traemos a La Paz los tintes y tratamientos labiales con péptidos y los rubores en barra de rhode: labios jugosos con brillo y mejillas con color en un solo gesto. Tonos inspirados en postres — berry, mocha, chocolate, avellana, limón — que hidratan mientras dan color. Productos originales, entrega en el día. Tienda de demostración: ningún pedido es real.',
        policies: {
          returns: 'Por higiene, los productos abiertos no tienen devolución. Si algo llega dañado, escríbenos en 48 horas y lo reponemos. Tienda de demostración: ningún pedido es real.',
          delivery: 'Entregamos en La Paz y El Alto el mismo día, o recoge tu pedido en Calacoto. Tienda de demostración: ningún envío es real.',
          privacy: 'Usamos tus datos solo para tu pedido. Tienda de demostración.',
          terms: 'Precios en bolivianos. Tienda de demostración para probar funciones de pagosYa.',
        },
      } as never);
    });

    // productos_rhode.csv: sku;nombre;precio;categoria;stock;descripcion;imagenes — prices with a decimal comma (159,90).
    const csv = (await readFile(resolve(FOLDER, 'productos_rhode.csv'), 'utf8')).replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
    for (const line of csv) {
      const [sku, name, price, category, stock, description, image] = line.split(';');
      if (record.products[sku]) continue;
      const photo = await keep(image.trim());
      const created: any = await links.create(merchantId, storeId, {
        name: name.replace(/^Rhode /, ''), currency: 'BOB', amount: Math.round(Number(price.replace(',', '.')) * 100), stock: Number(stock),
        categoryId: record.categories[category], imageUrls: [photo], description: `${description} Producto de demostración.`,
        ...(BADGES[sku] ? { badge: BADGES[sku] } : {}),
      } as never);
      record.products[sku] = created.id; await save();
    }
    await step('promo-codes', async () => { await app.get(PromoCodesService).create(merchantId, storeId, { code: 'GLOSS10', discountType: 'PERCENT', discountValue: 10 } as never); });
    await step('shipping', async () => {
      await prisma.store.update({ where: { id: storeId }, data: { shippingEnabled: true, shippingPickupEnabled: true, locations: [{ id: 'calacoto', name: 'rhode Calacoto', address: 'Calle 21 de Calacoto 8350, La Paz',
        openingHours: [1, 2, 3, 4, 5, 6].map(day => ({ day, open: '10:00', close: '20:00', closed: false })).concat([{ day: 0, open: '10:00', close: '14:00', closed: true }]) }] as never } });
      await app.get(OperationsService).createDeliveryZone(merchantId, storeId, { name: 'La Paz y El Alto', fee: 1500, departments: ['LA_PAZ'], freeAbove: 40000, estimatedMinutes: 360 } as never);
    });
    console.log(JSON.stringify({ storeId, slug: record.slug, products: Object.keys(record.products).length, photos: Object.values(record.photos) }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
