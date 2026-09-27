import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StoreImport } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StoresService } from '../stores/stores.service';
import { UploadsService } from '../uploads/uploads.service';
import { writeImport } from './import-writer';
import { copyPhotos } from './photo-copier';
import { readShopifyCsv } from './shopify-csv';
import { buildPreview, mapArticle, mapProduct, type ImportProduct } from './shopify-mapping';
import { readShopifyStore, ShopifyReadError } from './shopify-reader';
import type { ShopifyStoreData } from './shopify-types';

const LEASE_MS = 5 * 60_000;
export const MAX_FREE_BUILD_TRIES = 2;

/** Shopify → pagosYa import (spec 2026-09-27): preview, confirm, retry; the worker calls claim() and run(). */
@Injectable()
export class StoreImportService {
  constructor(private readonly prisma: PrismaService, private readonly stores: StoresService, private readonly uploads: UploadsService) {}

  private async view(row: StoreImport) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: row.merchantId }, select: { importBuildUsedAt: true } });
    const { data: _data, photos: _photos, leaseToken: _lease, leaseUntil: _until, exchangeRateMilli: _rate, excluded: _excluded, ...rest } = row;
    return { ...rest, freeBuildAvailable: !merchant?.importBuildUsedAt && row.designTries < MAX_FREE_BUILD_TRIES };
  }

  private async owned(merchantId: string, id: string) {
    const row = await this.prisma.storeImport.findFirst({ where: { id, merchantId } });
    if (!row) throw new NotFoundException('No encontramos esa importación.');
    return row;
  }

  async get(merchantId: string, id: string) { return this.view(await this.owned(merchantId, id)); }

  async previewUrl(merchantId: string, url: string) {
    let data: ShopifyStoreData;
    try { data = await readShopifyStore(url); }
    catch (error) { if (error instanceof ShopifyReadError) throw new BadRequestException({ message: error.message, code: error.code }); throw error; }
    return this.create(merchantId, 'SHOPIFY_URL', data);
  }

  async previewCsv(merchantId: string, csv: string, name: string, host?: string) {
    let data: ShopifyStoreData;
    try { data = readShopifyCsv(csv, name.trim() || 'Mi tienda', (host || 'csv.shopify').toLowerCase()); }
    catch (error) { if (error instanceof ShopifyReadError) throw new BadRequestException({ message: error.message, code: error.code }); throw error; }
    return this.create(merchantId, 'SHOPIFY_CSV', data);
  }

  private async create(merchantId: string, source: string, data: ShopifyStoreData) {
    // A re-import of a store this merchant already brought over goes back into the same pagosYa store.
    const previous = await this.prisma.storeImport.findFirst({ where: { merchantId, sourceHost: data.host, storeId: { not: null } }, orderBy: { createdAt: 'desc' } });
    const row = await this.prisma.storeImport.create({ data: { merchantId, source, sourceHost: data.host, storeId: previous?.storeId ?? null,
      data: data as unknown as Prisma.InputJsonValue, preview: buildPreview(data) as unknown as Prisma.InputJsonValue } });
    return this.view(row);
  }

  async confirm(merchantId: string, id: string, input: { exchangeRate?: number; excluded?: string[] }) {
    const row = await this.owned(merchantId, id);
    const preview = row.preview as { needsExchangeRate: boolean; products: Array<{ externalId: string }> };
    if (preview.needsExchangeRate && !input.exchangeRate) throw new BadRequestException('Indica el tipo de cambio a bolivianos para convertir tus precios.');
    const known = new Set(preview.products.map(product => product.externalId));
    const changed = await this.prisma.storeImport.updateMany({ where: { id, merchantId, status: 'REVIEW' },
      data: { status: 'QUEUED', exchangeRateMilli: input.exchangeRate ? Math.round(input.exchangeRate * 1000) : null, excluded: (input.excluded ?? []).filter(item => known.has(item)) } });
    if (!changed.count) throw new BadRequestException('Esta importación ya se confirmó.');
    return this.get(merchantId, id);
  }

  async retry(merchantId: string, id: string) {
    const row = await this.owned(merchantId, id);
    if (row.status !== 'FAILED') throw new BadRequestException('Solo se puede reintentar una importación que falló.');
    await this.prisma.storeImport.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'QUEUED', error: null } });
    return this.get(merchantId, id);
  }

  async claim() {
    const row = await this.prisma.storeImport.findFirst({ where: { OR: [{ status: 'QUEUED' }, { status: 'RUNNING', leaseUntil: { lt: new Date() } }] }, orderBy: { updatedAt: 'asc' } });
    if (!row) return null;
    const leaseToken = randomUUID();
    const changed = await this.prisma.storeImport.updateMany({ where: { id: row.id, status: row.status, leaseToken: row.leaseToken }, data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } } });
    return changed.count ? this.prisma.storeImport.findUniqueOrThrow({ where: { id: row.id } }) : null;
  }

  private checkpoint(row: StoreImport, data: Prisma.StoreImportUncheckedUpdateManyInput) {
    return this.prisma.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { ...data, leaseUntil: new Date(Date.now() + LEASE_MS) } });
  }

  /** Photos first (slow, per-photo failures are warnings), then the whole catalog in one transaction: never a half-written store. */
  async run(row: StoreImport) {
    try {
      const data = row.data as unknown as ShopifyStoreData;
      let storeId = row.storeId;
      if (!storeId) {
        storeId = (await this.stores.create(row.merchantId, { name: data.name.slice(0, 120) } as never)).id;
        await this.checkpoint(row, { storeId });
      }
      const excluded = new Set(row.excluded);
      const warnings: string[] = [];
      const products: ImportProduct[] = [];
      for (const product of data.products.filter(product => !excluded.has(product.handle))) {
        const mapped = mapProduct(product, data.currency === 'BOB' ? null : row.exchangeRateMilli, data.stockKnown);
        if ('problem' in mapped) warnings.push(mapped.problem); else products.push(mapped.product);
      }
      const sources = products.flatMap(product => [...product.imageSources, ...product.variants.map(variant => variant.imageSource).filter((src): src is string => Boolean(src))]);
      await this.checkpoint(row, { progress: { stage: 'photos', done: 0, total: new Set(sources).size } });
      const copied = await copyPhotos(sources, { storeHost: data.host, done: row.photos as Record<string, string>, save: (buffer, mime) => this.uploads.saveBuffer(buffer, mime),
        onProgress: async (done, total) => { if (done % 10 === 0 || done === total) await this.checkpoint(row, { progress: { stage: 'photos', done, total } }); } });
      await this.checkpoint(row, { photos: copied.urls, progress: { stage: 'catalog' } });
      if (copied.failed.length) warnings.push(`${copied.failed.length} ${copied.failed.length === 1 ? 'foto no se pudo copiar' : 'fotos no se pudieron copiar'}; los productos se crearon sin ellas.`);
      const summary = await this.prisma.$transaction(tx => writeImport(tx, {
        storeId: storeId!, sourceHost: data.host, authorName: data.name,
        products: products.map(product => ({ ...product, imageUrls: product.imageSources.map(src => copied.urls[src]).filter(Boolean), variantImageUrls: product.variants.map(variant => variant.imageSource ? copied.urls[variant.imageSource] : undefined) })),
        collections: data.collections.map(collection => ({ externalId: collection.handle, title: collection.title, productExternalIds: collection.productHandles.filter(handle => !excluded.has(handle)) })),
        articles: data.articles.map(mapArticle),
      }), { timeout: 120_000 });
      if (summary.skippedRedirects) warnings.push(`${summary.skippedRedirects} enlaces viejos no se redirigieron: se alcanzó el límite de 500 redirecciones.`);
      await this.checkpoint(row, { status: 'COMPLETED', summary: { ...summary, warnings } as unknown as Prisma.InputJsonValue, progress: { stage: 'done' }, completedAt: new Date(), leaseToken: null });
    } catch (error) {
      const message = error instanceof BadRequestException || error instanceof ShopifyReadError ? (error as Error).message : 'No pudimos terminar la importación. Si reintentas, nada se duplicará.';
      await this.prisma.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { status: 'FAILED', error: message, leaseToken: null } });
    }
  }
}
