import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PaymentLinkStatus, Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateIntegrationDto,
  CreateProductMappingDto,
  CreateSubscriptionPlanMappingDto,
  InboundSubscriptionItemDto,
  InboundSubscriptionSyncDto,
  InboundStockSyncDto
} from "./dto/operations.dto";
import { ownedStore, clean, subscriptionIdentityKey, readStockVariants } from "./operations-helpers";
import { SubscriptionsService } from "./subscriptions.service";

const integrationSecretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 40);

/** Inbound integrations: connections, product and plan mappings, and stock/subscription syncs pushed by external systems. */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async createIntegration(merchantId: string, storeId: string, dto: CreateIntegrationDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const secret = `sync_${integrationSecretPart()}`;
    const connection = await this.prisma.integrationConnection.create({ data: { merchantId, storeId, kind: dto.kind, name: dto.name.trim(), secretHash: await argon2.hash(secret) }, select: { id: true, kind: true, name: true, status: true, createdAt: true } });
    return { ...connection, secret };
  }
  async listIntegrations(merchantId: string, storeId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const connections = await this.prisma.integrationConnection.findMany({
      where: { merchantId, storeId, status: "ACTIVE" },
      select: { id: true, kind: true, name: true, status: true, lastSyncAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(connections.map(async (connection) => {
      const [mappingCount, lastRun] = await Promise.all([
        this.prisma.integrationProductMapping.count({ where: { connectionId: connection.id } }),
        this.prisma.integrationSyncRun.findFirst({ where: { connectionId: connection.id }, orderBy: { startedAt: "desc" }, select: { direction: true, status: true, itemCount: true, errorMessage: true, details: true, startedAt: true } }),
      ]);
      return { ...connection, mappingCount, lastRun };
    }));
  }
  /** Products and combinations with their linked SKUs, so the merchant can link every sellable item. */
  async listProductMappings(merchantId: string, storeId: string, connectionId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, merchantId, storeId, status: "ACTIVE" }, select: { id: true } });
    if (!connection) throw new NotFoundException("Integration not found");
    const [products, mappings] = await Promise.all([
      this.prisma.paymentLink.findMany({ where: { storeId, status: PaymentLinkStatus.ACTIVE }, select: { id: true, name: true, stock: true, variants: true }, orderBy: { name: "asc" }, take: 500 }),
      this.prisma.integrationProductMapping.findMany({ where: { connectionId }, select: { id: true, paymentLinkId: true, variantId: true, externalSku: true } }),
    ]);
    return {
      products: products.map((product) => ({ id: product.id, name: product.name, stock: product.stock, variants: readStockVariants(product.variants).map((variant) => ({ id: variant.id, name: variant.name, stock: variant.stock ?? null })) })),
      mappings,
    };
  }
  async deleteProductMapping(merchantId: string, storeId: string, connectionId: string, mappingId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, merchantId, storeId }, select: { id: true } });
    if (!connection) throw new NotFoundException("Integration not found");
    const deleted = await this.prisma.integrationProductMapping.deleteMany({ where: { id: mappingId, connectionId } });
    if (!deleted.count) throw new NotFoundException("Mapping not found");
    return { deleted: true };
  }
  async verifyIntegrationInbound(connectionId: string, secret: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, status: "ACTIVE" },
      select: { id: true, name: true, kind: true, secretHash: true },
    });
    if (!connection || !(await argon2.verify(connection.secretHash, secret))) {
      throw new UnauthorizedException("Invalid integration secret");
    }
    return {
      connected: true,
      connectionId: connection.id,
      name: connection.name,
      kind: connection.kind,
      checkedAt: new Date().toISOString(),
      capabilities: ["stock", "subscriptions"],
    };
  }
  async createProductMapping(merchantId: string, storeId: string, connectionId: string, dto: CreateProductMappingDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, merchantId, storeId, status: "ACTIVE" } });
    if (!connection) throw new NotFoundException("Integration not found");
    const product = await this.prisma.paymentLink.findFirst({ where: { id: dto.paymentLinkId, storeId } });
    if (!product) throw new BadRequestException("El producto no pertenece a esta tienda");
    const variants = readStockVariants(product.variants);
    if (variants.length && !dto.variantId) throw new BadRequestException("Este producto tiene combinaciones: elige a qué combinación corresponde el SKU");
    if (dto.variantId && !variants.some((variant) => variant.id === dto.variantId)) throw new BadRequestException("La combinación no pertenece a este producto");
    const variantId = variants.length ? dto.variantId! : null;
    const externalSku = dto.externalSku.trim();
    // One SKU per product or combination: a new SKU for the same target replaces the old one.
    return this.prisma.$transaction(async (tx) => {
      await tx.integrationProductMapping.deleteMany({ where: { connectionId, paymentLinkId: product.id, variantId, NOT: { externalSku } } });
      return tx.integrationProductMapping.upsert({
        where: { connectionId_externalSku: { connectionId, externalSku } },
        create: { connectionId, paymentLinkId: product.id, variantId, externalSku, externalName: clean(dto.externalName) },
        update: { paymentLinkId: product.id, variantId, externalName: clean(dto.externalName) },
      });
    });
  }
  async createSubscriptionPlanMapping(merchantId: string, storeId: string, connectionId: string, dto: CreateSubscriptionPlanMappingDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const [connection, plan] = await Promise.all([
      this.prisma.integrationConnection.findFirst({ where: { id: connectionId, merchantId, storeId, status: "ACTIVE" } }),
      this.prisma.subscriptionPlan.findFirst({ where: { id: dto.subscriptionPlanId, merchantId, storeId, isActive: true } }),
    ]);
    if (!connection) throw new NotFoundException("Integration not found");
    if (!plan) throw new BadRequestException("El plan no pertenece a esta tienda o está inactivo");
    const externalPlanCode = dto.externalPlanCode.trim();
    return this.prisma.integrationSubscriptionPlanMapping.upsert({
      where: { connectionId_externalPlanCode: { connectionId, externalPlanCode } },
      create: { connectionId, subscriptionPlanId: plan.id, externalPlanCode, externalName: clean(dto.externalName) },
      update: { subscriptionPlanId: plan.id, externalName: clean(dto.externalName) },
    });
  }
  /**
   * Merge rule: the connected system owns stock counts for mapped SKUs. An
   * absolute count replaces pagosYa's number, minus units pagosYa sold (online
   * or in its POS) after `asOf`; a delta adjusts the current number. Every change is an auditable
   * movement, and every SKU that could not be applied is reported with a reason.
   */
  async syncStockInbound(connectionId: string, secret: string, dto: InboundStockSyncDto) {
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, status: "ACTIVE" } });
    if (!connection || !(await argon2.verify(connection.secretHash, secret))) throw new UnauthorizedException("Invalid integration secret");
    const skus = dto.items.map((item) => item.externalSku.trim());
    const mappings = await this.prisma.integrationProductMapping.findMany({ where: { connectionId, externalSku: { in: skus } } });
    const mappingBySku = new Map(mappings.map((mapping) => [mapping.externalSku, mapping]));
    const run = await this.prisma.integrationSyncRun.create({ data: { connectionId, direction: "INBOUND_STOCK" } });
    const updated: Array<{ externalSku: string; productId: string; variantId: string | null; stock: number; soldAfterCount?: number }> = [];
    const skipped: Array<{ externalSku: string; reason: string }> = [];
    try {
      await this.prisma.$transaction(async (tx) => {
        const seen = new Set<string>();
        for (const item of dto.items) {
          const externalSku = item.externalSku.trim();
          const skip = (reason: string) => { skipped.push({ externalSku, reason }); };
          if (seen.has(externalSku)) { skip("SKU repetido en esta sincronización; se aplicó la primera fila"); continue; }
          seen.add(externalSku);
          if ((item.stock === undefined) === (item.delta === undefined)) { skip("Envía stock o delta (solo uno)"); continue; }
          if (item.delta !== undefined && item.asOf) { skip("asOf solo se usa con stock absoluto"); continue; }
          const mapping = mappingBySku.get(externalSku);
          if (!mapping) { skip("SKU sin vincular a un producto en pagosYa"); continue; }
          // Lock the product row so a checkout decrement cannot interleave with this merge.
          await tx.$queryRaw`SELECT "id" FROM "PaymentLink" WHERE "id" = ${mapping.paymentLinkId} FOR UPDATE`;
          const product = await tx.paymentLink.findFirst({ where: { id: mapping.paymentLinkId, storeId: connection.storeId } });
          if (!product) { skip("El producto vinculado ya no existe"); continue; }
          const variants = readStockVariants(product.variants);
          if (variants.length && !mapping.variantId) { skip("El producto tiene combinaciones: vincula este SKU a una combinación"); continue; }
          const variant = mapping.variantId ? variants.find((candidate) => candidate.id === mapping.variantId) : undefined;
          if (mapping.variantId && !variant) { skip("La combinación vinculada ya no existe"); continue; }
          if (variant && variants.some((candidate) => candidate.stock === undefined)) { skip("Las combinaciones comparten stock en pagosYa; asigna stock a cada combinación"); continue; }
          const current = variant ? variant.stock ?? null : product.stock;
          let next: number;
          let soldAfterCount: number | undefined;
          if (item.delta !== undefined) {
            if (current === null) { skip("El stock es ilimitado en pagosYa; envía un stock absoluto"); continue; }
            next = Math.max(0, current + item.delta);
          } else {
            next = item.stock!;
            if (item.asOf) {
              const sold = await tx.inventoryMovement.aggregate({ _sum: { quantityDelta: true }, where: { storeId: connection.storeId, paymentLinkId: product.id, variantId: mapping.variantId ?? null, sourceType: { in: ["ORDER", "POS"] }, createdAt: { gt: new Date(item.asOf) } } });
              soldAfterCount = -(sold._sum.quantityDelta ?? 0);
              next = Math.max(0, next - soldAfterCount);
            }
          }
          if (variant) {
            const nextVariants = variants.map((candidate) => (candidate.id === variant.id ? { ...candidate, stock: next } : candidate));
            const total = nextVariants.some((candidate) => candidate.stock == null) ? null : nextVariants.reduce((sum, candidate) => sum + (candidate.stock ?? 0), 0);
            await tx.paymentLink.update({ where: { id: product.id }, data: { variants: nextVariants as unknown as Prisma.InputJsonValue, stock: total } });
          } else {
            await tx.paymentLink.update({ where: { id: product.id }, data: { stock: next } });
          }
          await tx.inventoryMovement.create({ data: { merchantId: connection.merchantId, storeId: connection.storeId, paymentLinkId: product.id, variantId: mapping.variantId, quantityDelta: next - (current ?? 0), stockAfter: next, reason: `Sincronización ${connection.name}`, sourceType: "INTEGRATION", sourceId: run.id } });
          updated.push({ externalSku, productId: product.id, variantId: mapping.variantId, stock: next, ...(soldAfterCount ? { soldAfterCount } : {}) });
        }
        await tx.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
        await tx.integrationSyncRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", itemCount: updated.length, details: { updated, skipped } as unknown as Prisma.InputJsonValue, completedAt: new Date() } });
      });
      return { received: dto.items.length, updated: updated.length, skipped: skipped.length, results: updated, skippedItems: skipped };
    } catch (error) {
      await this.prisma.integrationSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: (error as Error).message.slice(0, 1_000), completedAt: new Date() } });
      throw error;
    }
  }
  private async upsertExternalCustomer(
    tx: Prisma.TransactionClient,
    connection: { id: string; merchantId: string; storeId: string },
    item: InboundSubscriptionItemDto,
  ) {
    const externalCustomerId = item.externalCustomerId.trim();
    const mapped = await tx.integrationCustomerMapping.findUnique({
      where: { connectionId_externalCustomerId: { connectionId: connection.id, externalCustomerId } },
    });
    let customer = mapped
      ? await tx.businessCustomer.findFirst({ where: { id: mapped.businessCustomerId, storeId: connection.storeId } })
      : null;
    const email = clean(item.customerEmail)?.toLowerCase() ?? null;
    const phone = clean(item.customerPhone);
    if (!customer && email) customer = await tx.businessCustomer.findUnique({ where: { storeId_email: { storeId: connection.storeId, email } } });
    if (!customer && phone) customer = await tx.businessCustomer.findFirst({ where: { storeId: connection.storeId, phone } });
    const data = { name: item.customerName.trim(), email, phone };
    if (customer) customer = await tx.businessCustomer.update({ where: { id: customer.id }, data });
    else customer = await tx.businessCustomer.create({ data: { merchantId: connection.merchantId, storeId: connection.storeId, ...data } });
    await tx.integrationCustomerMapping.upsert({
      where: { connectionId_externalCustomerId: { connectionId: connection.id, externalCustomerId } },
      create: { connectionId: connection.id, externalCustomerId, businessCustomerId: customer.id },
      update: { businessCustomerId: customer.id },
    });
    return customer;
  }
  async syncSubscriptionsInbound(connectionId: string, secret: string, dto: InboundSubscriptionSyncDto) {
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, status: "ACTIVE" } });
    if (!connection || !(await argon2.verify(connection.secretHash, secret))) throw new UnauthorizedException("Invalid integration secret");
    const externalIds = dto.items.map((item) => item.externalSubscriptionId.trim());
    if (new Set(externalIds).size !== externalIds.length) throw new BadRequestException("externalSubscriptionId no puede repetirse en una misma sincronización");
    const planCodes = [...new Set(dto.items.map((item) => item.externalPlanCode.trim()))];
    const planMappings = await this.prisma.integrationSubscriptionPlanMapping.findMany({
      where: { connectionId, externalPlanCode: { in: planCodes } },
    });
    const mappingByCode = new Map(planMappings.map((mapping) => [mapping.externalPlanCode, mapping]));
    const run = await this.prisma.integrationSyncRun.create({ data: { connectionId, direction: "INBOUND_SUBSCRIPTIONS" } });
    try {
      const summary = { created: 0, updated: 0, canceled: 0, paused: 0, skipped: [] as Array<{ externalSubscriptionId: string; reason: string }> };
      await this.prisma.$transaction(async (tx) => {
        for (const item of dto.items) {
          const externalSubscriptionId = item.externalSubscriptionId.trim();
          const planMapping = mappingByCode.get(item.externalPlanCode.trim());
          if (!planMapping) {
            summary.skipped.push({ externalSubscriptionId, reason: `Plan externo sin mapear: ${item.externalPlanCode.trim()}` });
            continue;
          }
          const plan = await tx.subscriptionPlan.findFirst({
            where: { id: planMapping.subscriptionPlanId, storeId: connection.storeId, isActive: true },
          });
          if (!plan) {
            summary.skipped.push({ externalSubscriptionId, reason: "El plan mapeado ya no está activo" });
            continue;
          }
          const customer = await this.upsertExternalCustomer(tx, connection, item);
          const existingMapping = await tx.integrationSubscriptionMapping.findUnique({
            where: { connectionId_externalSubscriptionId: { connectionId, externalSubscriptionId } },
          });
          const canceledAt = item.status === "CANCELED" ? new Date(item.canceledAt ?? Date.now()) : null;
          const activeKey = item.status === "CANCELED" ? null : subscriptionIdentityKey(connection.storeId, plan.id, {
            id: customer.id,
            email: item.customerEmail,
            phone: item.customerPhone,
            name: item.customerName,
          });
          const subscriptionData = {
            planId: plan.id,
            customerId: customer.id,
            customerName: item.customerName.trim(),
            customerEmail: clean(item.customerEmail)?.toLowerCase(),
            customerPhone: clean(item.customerPhone),
            amountOverride: item.amount ?? null,
            status: item.status,
            startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
            nextBillingAt: new Date(item.nextBillingAt),
            canceledAt,
            activeKey,
          };
          const mappedSubscription = existingMapping
            ? await tx.customerSubscription.findFirst({ where: { id: existingMapping.customerSubscriptionId, storeId: connection.storeId } })
            : null;
          let duplicateSubscription = !mappedSubscription && activeKey
            ? await tx.customerSubscription.findUnique({ where: { activeKey } })
            : null;
          if (!mappedSubscription && !duplicateSubscription && activeKey) {
            duplicateSubscription = await tx.customerSubscription.findFirst({
              where: {
                storeId: connection.storeId,
                planId: plan.id,
                status: { in: ["ACTIVE", "PAUSED"] },
                customerId: customer.id,
              },
            });
          }
          const existingSubscription = mappedSubscription ?? duplicateSubscription;
          let subscription;
          if (existingSubscription) {
            const nextBillingAt = existingSubscription.nextBillingAt > subscriptionData.nextBillingAt
              ? existingSubscription.nextBillingAt
              : subscriptionData.nextBillingAt;
            subscription = await tx.customerSubscription.update({ where: { id: existingSubscription.id }, data: { ...subscriptionData, nextBillingAt } });
            summary.updated += 1;
          } else {
            subscription = await tx.customerSubscription.create({
              data: { merchantId: connection.merchantId, storeId: connection.storeId, ...subscriptionData },
            });
            summary.created += 1;
          }
          await tx.integrationSubscriptionMapping.upsert({
            where: { connectionId_externalSubscriptionId: { connectionId, externalSubscriptionId } },
            create: { connectionId, externalSubscriptionId, customerSubscriptionId: subscription.id },
            update: { customerSubscriptionId: subscription.id },
          });
          if (item.status === "CANCELED") summary.canceled += 1;
          if (item.status === "PAUSED") summary.paused += 1;
        }
        const processed = summary.created + summary.updated;
        await tx.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
        await tx.integrationSyncRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", itemCount: processed, completedAt: new Date() } });
      });
      const billing = await this.subscriptions.generateSubscriptionInvoices(connection.merchantId, connection.storeId);
      return { received: dto.items.length, ...summary, billing };
    } catch (error) {
      await this.prisma.integrationSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: (error as Error).message.slice(0, 1_000), completedAt: new Date() } });
      throw error;
    }
  }
}
