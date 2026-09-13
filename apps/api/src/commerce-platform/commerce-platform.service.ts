import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateFilesService } from './private-files.service';
import { creditHash, refundCredit } from './credit-ledger';
import { readOrderTrackingToken } from '../consumer/order-tracking-token';
@Injectable()
export class CommercePlatformService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly files: PrivateFilesService) {}
  private secret() { return this.config.get<string>('app.orderTrackingSecret')!; }
  async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada.'); return store;
  }
  async list(merchantId: string, storeId: string) {
    const store = await this.owner(merchantId, storeId);
    const [credits, files, products, redirects] = await Promise.all([
      this.prisma.storeCredit.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, label: true, kind: true, issuedAmount: true, balance: true, currency: true, expiresAt: true, active: true, createdAt: true } }),
      this.prisma.digitalAsset.findMany({ where: { storeId }, select: { id: true, productId: true, filename: true, mimeType: true, byteSize: true, active: true } }),
      this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, name: true, fulfillmentType: true } }),
      this.prisma.storeRedirect.findMany({ where: { storeId }, orderBy: { fromPath: 'asc' }, take: 500 }),
    ]); return { storeSlug: store.slug, credits, files, products, redirects };
  }
  async issueCredit(merchantId: string, storeId: string, input: { reference: string; label: string; kind: string; amount: number; currency: string; expiresAt?: string }) {
    await this.owner(merchantId, storeId);
    const code = createHmac('sha256', this.secret()).update(`store-credit:${storeId}:${input.reference}`).digest('hex').slice(0, 32).toUpperCase();
    try {
      const credit = await this.prisma.$transaction(async tx => {
        const prior = await tx.storeCredit.findUnique({ where: { storeId_reference: { storeId, reference: input.reference } } });
        if (prior) { if (prior.issuedAmount !== input.amount || prior.currency !== input.currency || prior.kind !== input.kind) throw new ConflictException('Esta referencia ya corresponde a otra emisión.'); return prior; }
        if (!input.label.trim() || input.expiresAt && new Date(input.expiresAt) <= new Date()) throw new BadRequestException('Escribe una referencia y, si corresponde, una fecha de vencimiento futura.');
        const row = await tx.storeCredit.create({ data: { storeId, reference: input.reference, label: input.label.trim(), kind: input.kind, issuedAmount: input.amount, balance: input.amount, currency: input.currency, codeHash: creditHash(code), expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } });
        await tx.storeCreditEntry.create({ data: { creditId: row.id, reference: `issue:${row.id}`, delta: input.amount, kind: 'ISSUE' } });
        await tx.store.update({ where: { id: storeId }, data: { creditsEnabled: true } }); return row;
      });
      if (credit.codeHash !== creditHash(code)) throw new ConflictException('El saldo existe, pero su código no se puede recuperar tras cambiar la clave del servidor.');
      return { id: credit.id, code: code.match(/.{8}/g)!.join('-'), balance: credit.balance, currency: credit.currency };
    } catch (error: any) { if (error.code === 'P2002') throw new ConflictException('La emisión ya está en curso. Reintenta con la misma referencia.'); throw error; }
  }
  async creditStatus(merchantId: string, storeId: string, id: string, active: boolean) {
    await this.owner(merchantId, storeId);
    if (!(await this.prisma.storeCredit.updateMany({ where: { id, storeId }, data: { active } })).count) throw new NotFoundException();
    return { active };
  }
  async creditRefund(merchantId: string, storeId: string, orderId: string, amount: number, reference: string) {
    await this.owner(merchantId, storeId);
    const order = await this.prisma.storeOrder.findFirst({ where: { id: orderId, storeId, paymentIntent: { status: 'SUCCEEDED' } } });
    if (!order) throw new NotFoundException('Pedido pagado no encontrado.');
    return this.prisma.$transaction(tx => refundCredit(tx, order.paymentIntentId, amount, `refund:${storeId}:${reference}`));
  }
  async upload(merchantId: string, storeId: string, productId: string, file: Express.Multer.File) {
    await this.owner(merchantId, storeId);
    if (!file?.size || file.size > 50_000_000) throw new BadRequestException('Elige un archivo de hasta 50 MB.');
    const types: Record<string, string> = { pdf: 'application/pdf', zip: 'application/zip', epub: 'application/epub+zip', mp3: 'audio/mpeg', mp4: 'video/mp4' };
    const ext = file.originalname.split('.').at(-1)!.toLowerCase();
    if (!types[ext]) throw new BadRequestException('Usa PDF, ZIP, EPUB, MP3 o MP4.');
    if (!await this.prisma.paymentLink.findFirst({ where: { id: productId, storeId } })) throw new NotFoundException('Producto no encontrado.');
    const filename = file.originalname.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 160) || `download.${ext}`;
    const storageKey = await this.files.put(file.buffer, types[ext]);
    try { return await this.prisma.$transaction(async tx => {
      const asset = await tx.digitalAsset.create({ data: { storeId, productId, filename, storageKey, mimeType: types[ext], byteSize: file.size } });
      await tx.paymentLink.update({ where: { id: productId }, data: { fulfillmentType: 'DIGITAL', shippingWeightGrams: 0 } });
      await tx.store.update({ where: { id: storeId }, data: { digitalGoodsEnabled: true } });
      return { id: asset.id, filename, byteSize: file.size };
    }); } catch (error) { await this.files.remove(storageKey); throw error; }
  }
  async fileStatus(merchantId: string, storeId: string, id: string, active: boolean) {
    await this.owner(merchantId, storeId);
    if (!(await this.prisma.digitalAsset.updateMany({ where: { id, storeId }, data: { active } })).count) throw new NotFoundException();
    return { active };
  }
  private async paidOrder(id: string) {
    const order = await this.prisma.storeOrder.findFirst({ where: { id, paymentIntent: { status: 'SUCCEEDED' } } });
    if (!order) throw new NotFoundException('Pedido pagado no encontrado.');
    const [refunds, credit] = await Promise.all([
      this.prisma.transaction.aggregate({ where: { paymentIntentId: order.paymentIntentId, type: 'REFUND', status: 'SUCCEEDED' }, _sum: { amount: true } }),
      this.prisma.storeCreditReservation.findUnique({ where: { paymentIntentId: order.paymentIntentId } }),
    ]);
    if ((refunds._sum.amount || 0) + (credit?.refundedAmount || 0) >= order.amount) throw new NotFoundException('Este pedido fue reembolsado.');
    return order;
  }
  private assetIds(items: unknown) { return Array.isArray(items) ? items.flatMap(item => Array.isArray(item?.digitalAssetIds) ? item.digitalAssetIds.filter((id: unknown) => typeof id === 'string') : []) as string[] : []; }
  async downloads(trackingToken: string) {
    const id = readOrderTrackingToken(trackingToken, this.secret()); if (!id) throw new NotFoundException('Enlace no válido.');
    const order = await this.paidOrder(id);
    const assets = await this.prisma.digitalAsset.findMany({ where: { storeId: order.storeId, id: { in: this.assetIds(order.items) } }, select: { id: true, filename: true, byteSize: true } });
    return assets.map(asset => {
      const payload = Buffer.from(JSON.stringify({ order: id, asset: asset.id, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
      const signature = createHmac('sha256', this.secret()).update(`digital:${payload}`).digest('base64url');
      return { ...asset, url: `/v1/commerce/downloads/${payload}.${signature}`, expiresInSeconds: 900 };
    });
  }
  async download(token: string) {
    const [payload, supplied, extra] = token.split('.');
    if (!payload || !supplied || extra || token.length > 1000) throw new NotFoundException();
    const expected = createHmac('sha256', this.secret()).update(`digital:${payload}`).digest();
    const signature = Buffer.from(supplied, 'base64url');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new NotFoundException();
    let parsed: any; try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new NotFoundException(); }
    if (!Number.isSafeInteger(parsed.exp) || parsed.exp <= Date.now() / 1000 || typeof parsed.order !== 'string' || typeof parsed.asset !== 'string') throw new NotFoundException('El enlace venció. Abre tu pedido para generar otro.');
    const order = await this.paidOrder(parsed.order);
    if (!this.assetIds(order.items).includes(parsed.asset)) throw new NotFoundException();
    const asset = await this.prisma.digitalAsset.findFirst({ where: { id: parsed.asset, storeId: order.storeId } });
    if (!asset) throw new NotFoundException();
    return { asset, bytes: await this.files.get(asset.storageKey) };
  }
}
