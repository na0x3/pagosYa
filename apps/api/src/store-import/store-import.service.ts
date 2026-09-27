import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StoreImport } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SourceChatService } from '../storefront-source/source-chat.service';
import type { SourceProgress } from '../storefront-source/source-progress';
import { CreateStoreDto } from '../stores/dto/create-store.dto';
import { StoresService } from '../stores/stores.service';
import { UploadsService } from '../uploads/uploads.service';
import { writeImport } from './import-writer';
import { copyPhotos } from './photo-copier';
import { readShopifyCsv } from './shopify-csv';
import { buildPreview, mapArticle, mapProduct, MAX_PHOTOS, photoSources, storeName, type ImportProduct } from './shopify-mapping';
import { readShopifyStore, ShopifyReadError } from './shopify-reader';
import type { ShopifyStoreData } from './shopify-types';

const LEASE_MS = 5 * 60_000;
/** An import whose worker died this many times (its lease expired each time) would most likely kill the next one too. */
export const MAX_IMPORT_ATTEMPTS = 3;
export const MAX_FREE_BUILD_TRIES = 2;
const DESIGN_STALE_MS = 15 * 60_000;

/** Another worker took over this import after its lease expired: this one stops without writing anything. */
class LeaseLost extends Error {}

/** Shopify → pagosYa import (spec 2026-09-27): preview, confirm, retry; the worker calls claim() and run(). */
@Injectable()
export class StoreImportService {
  constructor(private readonly prisma: PrismaService, private readonly stores: StoresService, private readonly uploads: UploadsService, private readonly chat: SourceChatService) {}

  private async view(row: StoreImport) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: row.merchantId }, select: { importBuildUsedAt: true } });
    const tries = (await this.prisma.storeImport.findMany({ where: { merchantId: row.merchantId }, select: { designTries: true } }).catch(() => [])).reduce((sum, item) => sum + (item.designTries ?? 0), 0);
    const { data: _data, photos: _photos, leaseToken: _lease, leaseUntil: _until, exchangeRateMilli: _rate, excluded: _excluded, ...rest } = row;
    return { ...rest, freeBuildAvailable: !merchant?.importBuildUsedAt && tries < MAX_FREE_BUILD_TRIES, designSteps: row.designStatus === 'RUNNING' ? await this.designSteps(row) : null };
  }

  /** YAPI's own steps for the build under way, as the Studio shows them: labels and states, never prompts or code. */
  private async designSteps(row: StoreImport) {
    if (!row.storeId) return null;
    const message = await this.prisma.storeAgentMessage.findFirst({ where: { role: 'USER', channel: 'source', thread: { storeId: row.storeId }, metadata: { path: ['requestId'], equals: row.id } },
      orderBy: { createdAt: 'desc' }, select: { metadata: true } }).catch(() => null);
    const steps = (message?.metadata as { progress?: SourceProgress } | undefined)?.progress?.steps;
    if (!Array.isArray(steps) || !steps.length) return null;
    return steps.map(step => ({ label: step.label, status: step.status, detail: step.status === 'running' ? step.details?.at(-1)?.label ?? null : null }));
  }

  private async owned(merchantId: string, id: string) {
    const row = await this.prisma.storeImport.findFirst({ where: { id, merchantId } });
    if (!row) throw new NotFoundException('No encontramos esa importación.');
    return row;
  }

  async get(merchantId: string, id: string) { return this.view(await this.owned(merchantId, id)); }

  /** The dialog resumes from here after a reload or on another device (final review, Important #7). */
  async latest(merchantId: string) {
    const row = await this.prisma.storeImport.findFirst({ where: { merchantId, status: { not: 'REVIEW' } }, orderBy: { createdAt: 'desc' } });
    return row ? this.view(row) : null;
  }

  async previewUrl(merchantId: string, url: string) {
    let data: ShopifyStoreData;
    try { data = await readShopifyStore(url); }
    catch (error) { if (error instanceof ShopifyReadError) throw new BadRequestException({ message: error.message, code: error.code }); throw error; }
    return this.create(merchantId, 'SHOPIFY_URL', data, true);
  }

  async previewCsv(merchantId: string, csv: string, name: string, host?: string) {
    let data: ShopifyStoreData;
    try { data = readShopifyCsv(csv, name.trim() || 'Mi tienda', (host || 'csv.shopify').toLowerCase()); }
    catch (error) { if (error instanceof ShopifyReadError) throw new BadRequestException({ message: error.message, code: error.code }); throw error; }
    return this.create(merchantId, 'SHOPIFY_CSV', data, Boolean(host));
  }

  private async create(merchantId: string, source: string, data: ShopifyStoreData, reusable: boolean) {
    // A re-import of a store this merchant already brought over goes back into the same pagosYa store. The key is the
    // myshopify domain, so mitienda.com and www.mitienda.com are one store; a CSV without an address never matches
    // anything, or two different stores' files would merge into one (final review, Critical #2 and Important #8).
    const sourceHost = data.shopDomain || data.host;
    data = { ...data, name: storeName(data.name) };
    const previous = reusable ? await this.prisma.storeImport.findFirst({ where: { merchantId, sourceHost, storeId: { not: null } }, orderBy: { createdAt: 'desc' } }) : null;
    const row = await this.prisma.storeImport.create({ data: { merchantId, source, sourceHost, storeId: previous?.storeId ?? null,
      data: data as unknown as Prisma.InputJsonValue, preview: buildPreview(data) as unknown as Prisma.InputJsonValue } });
    return this.view(row);
  }

  async confirm(merchantId: string, id: string, input: { exchangeRate?: number; excluded?: string[] }) {
    const row = await this.owned(merchantId, id);
    const preview = row.preview as { needsExchangeRate: boolean; products: Array<{ externalId: string; problem?: string | null }> };
    if (preview.needsExchangeRate && !input.exchangeRate) throw new BadRequestException('Indica el tipo de cambio a bolivianos para convertir tus precios.');
    const known = new Set(preview.products.map(product => product.externalId));
    if (!preview.products.some(product => !product.problem && !input.excluded?.includes(product.externalId))) throw new BadRequestException('No hay productos para importar. Revisa tu tienda o sube el CSV de Shopify.');
    const changed = await this.prisma.storeImport.updateMany({ where: { id, merchantId, status: 'REVIEW' },
      data: { status: 'QUEUED', exchangeRateMilli: input.exchangeRate ? Math.round(input.exchangeRate * 1000) : null, excluded: (input.excluded ?? []).filter(item => known.has(item)) } });
    if (!changed.count) throw new BadRequestException('Esta importación ya se confirmó.');
    return this.get(merchantId, id);
  }

  async retry(merchantId: string, id: string) {
    const row = await this.owned(merchantId, id);
    if (row.status !== 'FAILED') throw new BadRequestException('Solo se puede reintentar una importación que falló.');
    await this.prisma.storeImport.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'QUEUED', error: null, attempts: 0 } });
    return this.get(merchantId, id);
  }

  async claim() {
    await this.prisma.storeImport.updateMany({ where: { status: 'RUNNING', leaseUntil: { lt: new Date() }, attempts: { gte: MAX_IMPORT_ATTEMPTS } },
      data: { status: 'FAILED', error: 'La importación se interrumpió varias veces y la detuvimos. Puedes reintentarla; si vuelve a pasar, sube el CSV de Shopify.', leaseToken: null } });
    const row = await this.prisma.storeImport.findFirst({ where: { OR: [{ status: 'QUEUED' }, { status: 'RUNNING', leaseUntil: { lt: new Date() } }] }, orderBy: { updatedAt: 'asc' } });
    if (!row) return null;
    const leaseToken = randomUUID();
    const changed = await this.prisma.storeImport.updateMany({ where: { id: row.id, status: row.status, leaseToken: row.leaseToken }, data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } } });
    return changed.count ? this.prisma.storeImport.findUniqueOrThrow({ where: { id: row.id } }) : null;
  }

  private async checkpoint(row: StoreImport, data: Prisma.StoreImportUncheckedUpdateManyInput) {
    const changed = await this.prisma.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { ...data, leaseUntil: new Date(Date.now() + LEASE_MS) } });
    if (!changed.count) throw new LeaseLost();
  }

  /** The store name through the same rules as a store created in the dashboard. */
  private async storeDto(name: string) {
    const dto = plainToInstance(CreateStoreDto, { name: storeName(name) });
    if ((await validate(dto)).length) throw new BadRequestException('El nombre de tu tienda no es válido. Cámbialo en Shopify o sube el CSV con otro nombre.');
    return dto;
  }

  /** Photos earlier imports into this store already copied: a re-import reuses them instead of uploading them again. */
  private async earlierPhotos(row: StoreImport) {
    if (!row.storeId) return {};
    const rows = await this.prisma.storeImport.findMany({ where: { storeId: row.storeId, status: 'COMPLETED', id: { not: row.id } }, orderBy: { createdAt: 'asc' }, select: { photos: true } });
    return Object.assign({}, ...rows.map(item => item.photos as Record<string, string>)) as Record<string, string>;
  }

  /** Photos first (slow, per-photo failures are warnings), then the store and its whole catalog in one transaction: never a
   * half-written store, and never an empty one left behind by a failed import. */
  async run(row: StoreImport) {
    try {
      const data = row.data as unknown as ShopifyStoreData;
      const dto = await this.storeDto(data.name);
      const excluded = new Set(row.excluded);
      const warnings: string[] = [];
      const products: ImportProduct[] = [];
      for (const product of data.products.filter(product => !excluded.has(product.handle))) {
        const mapped = mapProduct(product, data.currency === 'BOB' ? null : row.exchangeRateMilli, data.stockKnown);
        if ('problem' in mapped) warnings.push(mapped.problem); else products.push(mapped.product);
      }
      const sources = products.flatMap(photoSources);
      await this.checkpoint(row, { progress: { stage: 'photos', done: 0, total: Math.min(new Set(sources).size, MAX_PHOTOS) } });
      const copied = await copyPhotos(sources, { storeHost: data.host, done: row.photos as Record<string, string>, save: (buffer, mime) => this.uploads.saveBuffer(buffer, mime),
        reuse: { urls: await this.earlierPhotos(row), exists: url => this.uploads.exists(url.split('/').pop() ?? '') },
        onProgress: async (done, total) => { if (done % 10 === 0 || done === total) await this.checkpoint(row, { progress: { stage: 'photos', done, total } }); } });
      await this.checkpoint(row, { photos: copied.urls, progress: { stage: 'catalog' } });
      if (copied.failed.length) warnings.push(`${copied.failed.length} ${copied.failed.length === 1 ? 'foto no se pudo copiar' : 'fotos no se pudieron copiar'}; los productos se crearon sin ellas.`);
      if (copied.skipped) warnings.push(`${copied.skipped.toLocaleString('es-BO')} ${copied.skipped === 1 ? 'foto no se copió' : 'fotos no se copiaron'}: el límite es ${MAX_PHOTOS.toLocaleString('es-BO')} fotos por importación.`);
      await this.prisma.$transaction(async tx => {
        // The lease is checked where the catalog is written, and the row stays locked until commit: a worker that lost
        // its lease writes nothing, and the one that took it over cannot claim the row in between.
        const owned = await tx.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
        if (!owned.count) throw new LeaseLost();
        const current = await tx.storeImport.findUniqueOrThrow({ where: { id: row.id }, select: { storeId: true } });
        const storeId = current.storeId ?? (await this.stores.create(row.merchantId, dto, tx)).id;
        const summary = await writeImport(tx, {
          storeId, sourceHost: data.host, authorName: dto.name, stockKnown: data.stockKnown,
          products: products.map(product => ({ ...product, imageUrls: product.imageSources.map(src => copied.urls[src]).filter(Boolean), variantImageUrls: product.variants.map(variant => variant.imageSource ? copied.urls[variant.imageSource] : undefined) })),
          collections: data.collections.map(collection => ({ externalId: collection.handle, title: collection.title, productExternalIds: collection.productHandles.filter(handle => !excluded.has(handle)) })),
          articles: data.articles.map(mapArticle),
        });
        if (summary.skippedRedirects) warnings.push(`${summary.skippedRedirects} enlaces viejos no se redirigieron: se alcanzó el límite de 500 redirecciones.`);
        if (summary.invalidRedirects) warnings.push(`${summary.invalidRedirects} ${summary.invalidRedirects === 1 ? 'enlace viejo no se redirigió: su dirección' : 'enlaces viejos no se redirigieron: su dirección'} en Shopify usa caracteres que no podemos redirigir.`);
        await tx.storeImport.update({ where: { id: row.id }, data: { storeId, status: 'COMPLETED', summary: { ...summary, warnings } as unknown as Prisma.InputJsonValue, progress: { stage: 'done' }, completedAt: new Date(), leaseToken: null } });
      }, { timeout: 120_000 });
    } catch (error) {
      if (error instanceof LeaseLost) return;
      const message = error instanceof BadRequestException || error instanceof ShopifyReadError ? (error as Error).message : 'No pudimos terminar la importación. Si reintentas, nada se duplicará.';
      await this.prisma.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { status: 'FAILED', error: message, leaseToken: null } });
    }
  }

  /** Spec 2026-09-27 §3: one free build per merchant, one more try after a failure — counted across every import of the
   * merchant and reserved under a lock on the merchant, so re-importing or two tabs cannot buy more (final review, Important #4). */
  async requestDesign(merchantId: string, id: string, option: 'same' | 'redesign') {
    const row = await this.owned(merchantId, id);
    if (row.status !== 'COMPLETED' || !row.storeId) throw new BadRequestException('Primero termina de importar tu tienda.');
    if (option === 'same' && row.source === 'SHOPIFY_CSV') throw new BadRequestException('Para recrear tu tienda de Shopify necesitamos su dirección; elige el rediseño o una plantilla.');
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Merchant" WHERE id = ${merchantId} FOR UPDATE`;
      const merchant = await tx.merchant.findUnique({ where: { id: merchantId }, select: { importBuildUsedAt: true } });
      const imports = await tx.storeImport.findMany({ where: { merchantId }, select: { designTries: true, designStatus: true } });
      const tries = imports.reduce((sum, item) => sum + item.designTries, 0);
      if (merchant?.importBuildUsedAt || tries >= MAX_FREE_BUILD_TRIES) throw new ConflictException('Ya usaste tu diseño gratis. Elige una plantilla o pídele cambios a YAPI con tus créditos.');
      if (imports.some(item => item.designStatus === 'QUEUED' || item.designStatus === 'RUNNING')) throw new ConflictException('YAPI ya está diseñando una de tus tiendas.');
      const changed = await tx.storeImport.updateMany({ where: { id, merchantId, status: 'COMPLETED', OR: [{ designStatus: null }, { designStatus: 'FAILED' }] }, data: { designStatus: 'QUEUED', designOption: option, designError: null } });
      if (!changed.count) throw new ConflictException('YAPI ya está diseñando esta tienda.');
    });
    return this.get(merchantId, id);
  }

  async claimDesign() {
    // A build interrupted by a restart must not say "diseñando" forever; it did not finish, so it costs no try (Important #5).
    await this.prisma.storeImport.updateMany({ where: { designStatus: 'RUNNING', updatedAt: { lt: new Date(Date.now() - DESIGN_STALE_MS) } }, data: { designStatus: 'FAILED', designError: 'El diseño se interrumpió. Puedes pedirlo de nuevo sin costo.' } });
    const row = await this.prisma.storeImport.findFirst({ where: { designStatus: 'QUEUED' }, orderBy: { updatedAt: 'asc' } });
    if (!row) return null;
    const changed = await this.prisma.storeImport.updateMany({ where: { id: row.id, designStatus: 'QUEUED' }, data: { designStatus: 'RUNNING' } });
    return changed.count ? this.prisma.storeImport.findUniqueOrThrow({ where: { id: row.id } }) : null;
  }

  async runDesign(row: StoreImport) {
    const data = row.data as unknown as ShopifyStoreData;
    const summary = [`Tienda: ${data.name}`, `Productos: ${data.products.slice(0, 30).map(product => product.title).join(', ')}`,
      data.collections.length ? `Colecciones: ${data.collections.map(collection => collection.title).join(', ')}` : ''].filter(Boolean).join('\n');
    try {
      const result = await this.chat.importBuild(row.merchantId, row.storeId!, { importId: row.id, option: row.designOption as 'same' | 'redesign', origin: data.origin, productHandle: data.products[0]?.handle, summary });
      await this.prisma.storeImport.updateMany({ where: { id: row.id }, data: { designStatus: 'COMPLETED', designRevision: result.revision } });
      await this.prisma.merchant.update({ where: { id: row.merchantId }, data: { importBuildUsedAt: new Date() } });
    } catch (error) {
      const message = error instanceof HttpException && error.getStatus() < 500 ? (error as Error).message : 'YAPI no pudo terminar el diseño. Puedes intentarlo una vez más gratis o elegir una plantilla.';
      await this.prisma.storeImport.updateMany({ where: { id: row.id }, data: { designStatus: 'FAILED', designTries: { increment: 1 }, designError: message } });
    }
  }
}
