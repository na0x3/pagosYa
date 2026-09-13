import { compileNextPreview, isNextSource, nextSourceFile, nextProjectExport } from './source-next';
import { normalizeProductVariants, totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import { applyVariantOperations } from './source-product-options';
import { applyProductSubscriptionOperations, validateProductSubscriptions } from '../payment-links/product-subscriptions';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentSourceRuntime } from './source-runtime';
import { publicationState } from './source-publishing.service';
import { withSourceMotion, type SourceMotionMode } from './source-motion';
import { applySourceLayoutBaseline } from './source-layout-baseline';
import { withSourceFonts } from './source-fonts';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PaymentLinkStatus, Prisma, type PaymentLink } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { EditSourceFileDto, SaveSourceProjectDto } from "./dto/save-source-project.dto";
import { sourceProjectArchive, sourceProjectDigest, sourceProjectSnapshot, SourceProjectSnapshot } from "./source-project";
import type { SourceProduct, SourceProductOperation } from './source-products';

type GenerationSave = { id: string; enablePayments?: boolean; products?: SourceProduct[]; productOperations?: SourceProductOperation[]; data: Prisma.StoreSourceGenerationUpdateManyMutationInput };
const summarySelect = { revision: true, label: true, digest: true, restoredFrom: true, createdAt: true } as const;

@Injectable()
export class SourceProjectsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly uploads?: UploadsService) {}

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async current(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { slug: true, sourceProject: { select: { revision: true, updatedAt: true } } } });
    if (!store) throw new NotFoundException("Store not found");
    return { slug: store.slug, revision: store.sourceProject?.revision ?? 0, updatedAt: store.sourceProject?.updatedAt ?? null };
  }

  // Aggregate in PostgreSQL so typing an estimate never downloads bundled image data.
  async authoredSize(merchantId: string, storeId: string, revision: number) {
    const rows = await this.prisma.$queryRaw<Array<{ size: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(length(f->>'content') + length(f->>'path') + 32), 0)::int AS size
      FROM "StoreSourceVersion" v JOIN "Store" s ON s.id = v."storeId",
      LATERAL jsonb_array_elements(v.snapshot->'files') f
      WHERE s.id = ${storeId} AND s."merchantId" = ${merchantId} AND v.revision = ${revision}
      AND (CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v.snapshot->'files') marker WHERE marker->>'path' = 'storefront-framework.json')
        THEN f->>'path' ~ '^components/.*[.]tsx$' OR f->>'path' = 'styles/globals.css'
        ELSE f->>'path' ~ '[.](html|css|js)$' AND f->>'path' NOT IN ('config.js', 'commerce.js') END)
    `);
    return rows[0]?.size ?? 0;
  }

  async state(merchantId: string, storeId: string, before?: number) {
    await this.ownedStore(merchantId, storeId);
    const [project, versions] = await this.prisma.$transaction([
      this.prisma.storeSourceProject.findUnique({ where: { storeId }, select: { revision: true, updatedAt: true } }),
      this.prisma.storeSourceVersion.findMany({
        where: { storeId, ...(before ? { revision: { lt: before } } : {}) },
        orderBy: { revision: "desc" }, take: 31, select: summarySelect,
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { publication: await publicationState(this.prisma, storeId), revision: project?.revision ?? 0, updatedAt: project?.updatedAt ?? null, versions: versions.slice(0, 30), nextBefore: versions.length > 30 ? versions[29].revision : null };
  }

  async version(merchantId: string, storeId: string, revision: number) {
    await this.ownedStore(merchantId, storeId);
    const version = await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { ...summarySelect, snapshot: true } });
    if (!version) throw new NotFoundException("Source project revision not found");
    return version;
  }

  async save(merchantId: string, storeId: string, input: SaveSourceProjectDto, generation?: GenerationSave) {
    await this.ownedStore(merchantId, storeId);
    let snapshot = sourceProjectSnapshot({ ...input, files: applySourceLayoutBaseline(await withSourceFonts(input.files)) });
    if (isNextSource(snapshot.files)) {
      const compiled = await compileNextPreview(snapshot.files.filter(f => nextSourceFile(f.path)));
      const paths = new Set(compiled.map(f => f.path));
      snapshot = sourceProjectSnapshot({ ...input, files: [...snapshot.files.filter(f => !paths.has(f.path) && !f.path.startsWith('_compiled/')), ...compiled] });
    }
    return this.append(storeId, input.revision, input.label, snapshot, null, generation);
  }

  async setContactForm(merchantId: string, storeId: string, revision: number, enabled: boolean) {
    await this.ownedStore(merchantId, storeId);
    if (!revision) {
      await this.prisma.$transaction(async tx => {
        await tx.storeSourceProject.upsert({ where: { storeId }, create: { storeId }, update: {} });
        const unchanged = await tx.storeSourceProject.updateMany({ where: { storeId, revision: 0 }, data: { updatedAt: new Date() } });
        if (!unchanged.count) throw new ConflictException('Actualiza el sitio antes de cambiar el formulario.');
        await tx.store.update({ where: { id: storeId }, data: { contactFormEnabled: enabled } });
      });
      return { revision: 0 };
    }
    const previous = await this.version(merchantId, storeId, revision);
    const snapshot = await currentSourceRuntime(previous.snapshot as unknown as SourceProjectSnapshot);
    const files = snapshot.files.map(file => {
      if (file.path === 'config.js') {
        const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
        if (!match) throw new BadRequestException('No se pudo leer la configuración del formulario.');
        const config = JSON.parse(match[1]);
        return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...config.data, contactFormEnabled: enabled } })};` };
      }
      if (!isNextSource(snapshot.files) && enabled && file.path === 'index.html' && !file.content.includes('data-pagosya-contact')) {
        const slot = '<section id="contacto" data-pagosya-contact></section>';
        const target = /<\/main>/i.test(file.content) ? /<\/main>/i : /<\/body>/i;
        return { ...file, content: target.test(file.content) ? file.content.replace(target, slot + '$&') : file.content + slot };
      }
      return file;
    });
    return this.append(storeId, revision, enabled ? 'Formulario de contacto activado' : 'Formulario de contacto desactivado', { ...snapshot, files }, null, undefined, enabled);
  }

  async setMotion(merchantId: string, storeId: string, revision: number, motion: SourceMotionMode) {
    const previous = await this.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const files = await withSourceMotion(snapshot.files, motion);
    const label = { auto: 'Movimiento según el diseño', off: 'Sin movimiento', subtle: 'Movimiento sutil', expressive: 'Movimiento expresivo' }[motion];
    return this.save(merchantId, storeId, { revision, label, brief: snapshot.brief, files });
  }

  async editFile(merchantId: string, storeId: string, input: EditSourceFileDto) {
    const version = await this.version(merchantId, storeId, input.revision);
    const snapshot = version.snapshot as unknown as SourceProjectSnapshot;
    if (isNextSource(snapshot.files) && !nextSourceFile(input.path)) throw new BadRequestException('Edita los componentes React o styles/globals.css; los archivos compilados se actualizan automáticamente.');
    const file = snapshot.files.find((entry) => entry.path === input.path);
    if (!file || file.encoding === "base64") throw new BadRequestException("Selecciona un archivo de texto existente.");
    return this.save(merchantId, storeId, { revision: input.revision, label: `Edición de ${input.path}`.slice(0, 120), brief: snapshot.brief,
      files: snapshot.files.map((entry) => entry.path === input.path ? { ...entry, content: input.content } : entry) });
  }

  private async append(storeId: string, revision: number, label: string, snapshot: SourceProjectSnapshot, restoredFrom: number | null = null, generation?: GenerationSave, contactFormEnabled?: boolean) {
    if (!Number.isInteger(revision) || revision < 0 || revision >= 2_147_483_647) throw new BadRequestException("Invalid project revision");
    if (typeof label !== "string" || !label.trim() || label.trim().length > 120) throw new BadRequestException("Invalid revision label");
    const deletedImageUrls: string[] = [];
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.storeSourceProject.upsert({ where: { storeId }, create: { storeId }, update: {} });
        const updated = await tx.storeSourceProject.updateMany({ where: { storeId, revision }, data: { revision: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException("El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.");
        if (contactFormEnabled !== undefined) await tx.store.update({ where: { id: storeId }, data: { contactFormEnabled } });
        const createdProducts: PaymentLink[] = [];
        const optionChanges: Array<{ productName: string; count: number }> = [];
        for (const product of generation?.products || []) {
          const variants = normalizeProductVariants(product.variants);
          if (variants.length) optionChanges.push({ productName: product.name, count: variants.length });
          createdProducts.push(await tx.paymentLink.create({ data: { storeId, name: product.name, description: product.description,
            ...(product.subscriptionOptions?.length ? { subscriptionOptions: { create: validateProductSubscriptions({ options: product.subscriptionOptions }) } } : {}),
            amount: variants.length ? Math.min(...variants.map(variant=>variant.amount)) : product.amount,
            ...(variants.length ? { variants: variants as unknown as Prisma.InputJsonValue, stock: totalVariantStock(variants) } : {}),
            currency: product.currency || 'BOB', imageUrls: [...new Set([...(product.imageUrls || []),...variants.flatMap(variant=>variant.imageUrl ? [variant.imageUrl] : [])])] } }));
        }
        const updatedProducts: Array<{ id: string; name: string }> = [];
        const deletedProducts: Array<{ id: string; name: string }> = [];
        for (const operation of generation?.productOperations || []) {
          if (operation.variantOperations?.length) {
            // Serialize against stock decrements while reading and applying a small option delta.
            await tx.$queryRaw`SELECT id FROM "PaymentLink" WHERE id = ${operation.productId} AND "storeId" = ${storeId} FOR UPDATE`;
          }
          const existing = await tx.paymentLink.findFirst({ where: { id: operation.productId, storeId } });
          if (!existing) throw new NotFoundException('El producto seleccionado ya no existe en esta tienda.');
          if (operation.action === 'delete') {
            if (existing.fulfillmentType === 'DIGITAL') throw new BadRequestException('Archiva el producto digital para conservar los archivos de pedidos pagados.');
            deletedImageUrls.push(...existing.imageUrls);
            await tx.paymentLink.delete({ where: { id: existing.id } });
            deletedProducts.push({ id: existing.id, name: existing.name });
            continue;
          }
          const changes = operation.changes || {};
          if (operation.subscriptionOperations?.length) {
            await applyProductSubscriptionOperations(tx, storeId, existing.id, operation.subscriptionOperations);
          }
          const variants = operation.variantOperations?.length
            ? applyVariantOperations((Array.isArray(existing.variants) ? existing.variants : []) as unknown as ProductVariant[], operation.variantOperations) : undefined;
          if (variants) optionChanges.push({ productName: changes.name || existing.name, count: variants.length });
          if (Array.isArray(existing.variants) && existing.variants.length && changes.currency !== undefined && changes.currency !== existing.currency) throw new BadRequestException('Cambia la moneda y los precios de todas las combinaciones juntos desde Productos.');
          if (!variants && Array.isArray(existing.variants) && existing.variants.length && (changes.amount !== undefined || changes.stock !== undefined)) {
            throw new BadRequestException('Este producto tiene combinaciones. Indica qué opciones deben cambiar de precio o stock.');
          }
          const updated = await tx.paymentLink.update({ where: { id: existing.id }, data: {
            ...(changes.name !== undefined && { name: changes.name }),
            ...(changes.description !== undefined && { description: changes.description }),
            ...(changes.imageUrls !== undefined && { imageUrls: changes.imageUrls }),
            ...(changes.imagePositions !== undefined && { imagePositions: changes.imagePositions }),
            ...(changes.tags !== undefined && { tags: changes.tags }),
            ...(changes.stock !== undefined && { stock: changes.stock }),
            ...(changes.color !== undefined && { color: changes.color }),
            ...(changes.amount !== undefined && { amount: changes.amount }),
            ...(changes.currency !== undefined && { currency: changes.currency }),
            ...(variants ? { variants: variants as unknown as Prisma.InputJsonValue,
              amount: Math.min(...variants.map(variant=>variant.amount)),
              ...(variants.every(variant=>variant.stock !== undefined) ? { stock: totalVariantStock(variants) } : {}),
              imageUrls: [...new Set([...(changes.imageUrls ?? existing.imageUrls),...variants.flatMap(variant=>variant.imageUrl ? [variant.imageUrl] : [])])],
            } : {}),
          } });
          updatedProducts.push({ id: updated.id, name: updated.name });
        }
        if (createdProducts.length || updatedProducts.length || deletedProducts.length) {
          const catalog = await tx.paymentLink.findMany({ where: { storeId, status: PaymentLinkStatus.ACTIVE }, orderBy: { createdAt: 'desc' } });
          snapshot = { ...snapshot, files: snapshot.files.map(file => {
            if (file.path !== 'config.js') return file;
            const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
            if (!match) throw new BadRequestException('No se pudo actualizar el catálogo.');
            const config = JSON.parse(match[1]);
            const items = catalog.map(p => ({ id: p.id, name: p.name, description: p.description, amount: p.amount, currency: p.currency, stock: p.stock, imageUrls: p.imageUrls, imagePositions: p.imagePositions, variants: p.variants, extras: p.extras, tags: p.tags, color: p.color, categoryId: p.categoryId, recommendedProductIds: p.recommendedProductIds }));
            return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...config.data, items } })};` };
          }) };
          snapshot = sourceProjectSnapshot({ ...snapshot, revision, label });
        }
        if (generation?.enablePayments) await tx.store.update({ where: { id: storeId }, data: { checkoutMode: "payment" } });
        if (generation) {
          const completed = await tx.storeSourceGeneration.updateMany({ where: { id: generation.id, storeId, status: 'RUNNING', activeStoreId: storeId }, data: generation.data });
          if (completed.count !== 1) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
        }
        const saved = await tx.storeSourceVersion.create({ data: {
          storeId, revision: revision + 1, label: label.trim(), digest: sourceProjectDigest(snapshot),
          snapshot: snapshot as unknown as Prisma.InputJsonValue, restoredFrom,
        }, select: summarySelect });
        return { ...saved, createdProducts: createdProducts.map(p => ({ id: p.id, name: p.name })), updatedProducts, deletedProducts, ...(optionChanges.length ? { optionChanges } : {}) };
      });
      if (deletedImageUrls.length) await this.uploads?.deleteFiles(deletedImageUrls);
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new ConflictException("El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.");
      }
      throw error;
    }
  }

  async restore(merchantId: string, storeId: string, targetRevision: number, currentRevision: number) {
    const version = await this.version(merchantId, storeId, targetRevision);
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    // Revalidate old snapshots before creating a new revision under today's contract.
    const snapshot = sourceProjectSnapshot({ ...stored, revision: currentRevision, label: `Restaurada desde revisión ${targetRevision}` });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException("Source project integrity check failed");
    return this.append(storeId, currentRevision, `Restaurada desde revisión ${targetRevision}`, snapshot, targetRevision);
  }

  async archive(merchantId: string, storeId: string, revision: number) {
    const version = await this.version(merchantId, storeId, revision);
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    const snapshot = sourceProjectSnapshot({ ...stored, revision, label: version.label });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException("Source project integrity check failed");
    const runtime = await currentSourceRuntime(snapshot);
    for (const name of ['build.mjs', 'server.mjs']) { const file = runtime.files.find(f => f.path === name); if (file) file.content = await readFile(join(__dirname, 'source-kit', name), 'utf8'); }
    return { filename: `storefront-r${revision}-${version.digest.slice(0, 12)}.zip`, buffer: sourceProjectArchive(isNextSource(runtime.files) ? { ...runtime, files: nextProjectExport(runtime.files, (await this.ownedStore(merchantId, storeId)).slug).map(f => ({ ...f, encoding: f.encoding || 'utf8' })) } : runtime, revision, version.restoredFrom) };
  }
}
