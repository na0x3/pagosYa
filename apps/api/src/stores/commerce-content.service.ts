import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { readOrderTrackingToken } from '../consumer/order-tracking-token';
import { ArticleDto, BundleDto, ReviewDto, ReviewQueryDto } from './commerce-content.dto';

@Injectable()
export class CommerceContentService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  private readonly reviewSelect = { id: true, productId: true, displayName: true, rating: true, body: true, status: true, createdAt: true } as const;
  async owner(merchantId: string, storeId: string) {
    if (!await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } })) throw new NotFoundException('Store not found');
  }
  async list(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId);
    const [articles, reviews, bundles, reviewCounts] = await Promise.all([
      this.prisma.storeArticle.findMany({ where: { storeId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      this.prisma.storeReview.findMany({ where: { storeId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31, select: this.reviewSelect }),
      this.prisma.storeBundle.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.storeReview.groupBy({ by: ['status'], where: { storeId }, _count: true }),
    ]); return { articles, reviews: reviews.slice(0, 30), reviewNextBefore: reviews.length > 30 ? reviews[29].id : null, reviewCounts: Object.fromEntries(reviewCounts.map((row: any) => [row.status, row._count])), bundles };
  }
  async reviews(merchantId: string, storeId: string, query: ReviewQueryDto) {
    await this.owner(merchantId, storeId);
    const where = { storeId, ...(query.status ? { status: query.status } : {}) };
    const cursor = query.before ? await this.prisma.storeReview.findFirst({ where: { ...where, id: query.before }, select: { id: true } }) : null;
    if (query.before && !cursor) throw new NotFoundException('La página de reseñas ya no existe.');
    const [rows, counts] = await Promise.all([
      this.prisma.storeReview.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31, ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}), select: this.reviewSelect }),
      this.prisma.storeReview.groupBy({ by: ['status'], where: { storeId }, _count: true }),
    ]);
    return { items: rows.slice(0, 30), nextBefore: rows.length > 30 ? rows[29].id : null, counts: Object.fromEntries(counts.map((row: any) => [row.status, row._count])) };
  }
  async saveArticle(merchantId: string, storeId: string, dto: ArticleDto) {
    await this.owner(merchantId, storeId);
    if (![dto.title, dto.author, dto.body].every(value => value.trim())) throw new BadRequestException('Completa título, autor y contenido.');
    const data = { title: dto.title.trim(), excerpt: dto.excerpt.trim(), body: dto.body.trim(), author: dto.author.trim(), publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null };
    try {
      if (!dto.revision) return await this.prisma.storeArticle.create({ data: { storeId, slug: dto.slug, locale: dto.locale, ...data } });
      const updated = await this.prisma.storeArticle.updateMany({ where: { storeId, slug: dto.slug, locale: dto.locale, revision: dto.revision }, data: { ...data, revision: { increment: 1 } } });
      if (!updated.count) throw new ConflictException('El artículo cambió. Recarga antes de guardarlo.');
      return this.prisma.storeArticle.findUnique({ where: { storeId_locale_slug: { storeId, locale: dto.locale, slug: dto.slug } } });
    } catch (e: any) { if (e.code === 'P2002') throw new ConflictException('Ya existe un artículo con esa dirección e idioma.'); throw e; }
  }
  async createBundle(merchantId: string, storeId: string, dto: BundleDto) {
    await this.owner(merchantId, storeId);
    const ids = [...new Set(dto.items.map(item => item.productId))];
    if (ids.length !== dto.items.length || !dto.name.trim()) throw new BadRequestException('Revisa los productos del paquete.');
    const products = await this.prisma.paymentLink.findMany({ where: { id: { in: ids }, storeId, status: 'ACTIVE' }, select: { id: true, currency: true } });
    if (products.length !== ids.length || new Set(products.map(p => p.currency)).size !== 1) throw new BadRequestException('Usa productos activos de esta tienda con la misma moneda.');
    return this.prisma.$transaction(async tx => {
      const bundle = await tx.storeBundle.create({ data: { storeId, name: dto.name.trim(), kind: dto.kind, items: dto.items.map(i => ({ productId: i.productId, quantity: i.quantity })), minimumQuantity: dto.minimumQuantity, discountPercent: dto.discountPercent } });
      await tx.store.update({ where: { id: storeId }, data: { bundlesEnabled: true } }); return bundle;
    });
  }
  async moderate(merchantId: string, storeId: string, id: string, status: string) {
    await this.owner(merchantId, storeId);
    if (!(await this.prisma.storeReview.updateMany({ where: { id, storeId }, data: { status } })).count) throw new NotFoundException('Reseña no encontrada');
    return { status };
  }
  async bundleStatus(merchantId: string, storeId: string, id: string, active: boolean) {
    await this.owner(merchantId, storeId);
    if (!(await this.prisma.storeBundle.updateMany({ where: { id, storeId }, data: { active } })).count) throw new NotFoundException('Paquete no encontrado');
    return { active };
  }
  async review(storeId: string, dto: ReviewDto) {
    const secret = this.config.get<string>('app.orderTrackingSecret');
    const orderId = secret ? readOrderTrackingToken(dto.trackingToken, secret) : null;
    const order = orderId ? await this.prisma.storeOrder.findFirst({ where: { id: orderId, storeId, paymentIntent: { status: 'SUCCEEDED' } }, select: { items: true } }) : null;
    if (!order || !Array.isArray(order.items) || !order.items.some((item: any) => item.paymentLinkId === dto.productId)) throw new BadRequestException('Necesitas el enlace de un pedido pagado que incluya este producto.');
    if (!dto.displayName.trim() || !dto.body.trim()) throw new BadRequestException('Completa el nombre público y la reseña.');
    try { await this.prisma.storeReview.create({ data: { storeId, orderId: orderId!, productId: dto.productId, displayName: dto.displayName.trim(), body: dto.body.trim(), rating: dto.rating } }); }
    catch (e: any) { if (e.code === 'P2002') throw new ConflictException('Este pedido ya tiene una reseña para ese producto.'); throw e; }
    return { submitted: true, status: 'PENDING' };
  }
  async publicContent(storeId: string, locale = 'es') {
    if (typeof locale !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) throw new BadRequestException('Idioma no válido.');
    const [articles, reviews, bundles] = await Promise.all([
      this.prisma.storeArticle.findMany({ where: { storeId, locale, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: 'desc' }, take: 100, select: { slug: true, locale: true, title: true, excerpt: true, body: true, author: true, publishedAt: true } }),
      this.prisma.storeReview.findMany({ where: { storeId, status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, productId: true, displayName: true, rating: true, body: true, createdAt: true } }),
      this.prisma.storeBundle.findMany({ where: { storeId, active: true }, take: 100, select: { id: true, name: true, kind: true, items: true, minimumQuantity: true, discountPercent: true } }),
    ]); return { articles, reviews, bundles };
  }
}
