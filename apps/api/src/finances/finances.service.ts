import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentIntentStatus, PaymentLinkStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type InventoryVariant = { amount: number; stock?: number | null };

function readInventoryVariants(value: unknown): InventoryVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is InventoryVariant =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) >= 0 &&
      (!("stock" in entry) ||
        (entry as Record<string, unknown>).stock === null ||
        (Number.isInteger((entry as Record<string, unknown>).stock) &&
          ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

@Injectable()
export class FinancesService {
  constructor(private readonly prisma: PrismaService) {}

  async orders(merchantId: string, storeId?: string, search?: string, includeAll = false) {
    const selectedStore = storeId
      ? await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, name: true } })
      : null;
    if (storeId && !selectedStore) throw new NotFoundException("Store not found");

    const term = search?.trim().slice(0, 120);
    const contactSearch = term
      ? {
          OR: [
            { id: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { customerName: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { customerEmail: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { customerPhone: { contains: term, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {};
    const [payments, leads, stores] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where: {
          merchantId,
          ...(storeId ? { metadata: { path: ["storeId"], equals: storeId } } : {}),
          ...contactSearch,
        },
        orderBy: { createdAt: "desc" },
        ...(includeAll ? {} : { take: 100 }),
      }),
      this.prisma.storeLead.findMany({
        where: { merchantId, ...(storeId ? { storeId } : {}), ...contactSearch },
        orderBy: { createdAt: "desc" },
        ...(includeAll ? {} : { take: 100 }),
      }),
      selectedStore
        ? Promise.resolve([selectedStore])
        : this.prisma.store.findMany({ where: { merchantId }, select: { id: true, name: true } }),
    ]);
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));
    const paymentRows = payments.map((payment) => {
      const metadata = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
        ? payment.metadata as Prisma.JsonObject
        : {};
      const paymentStoreId = typeof metadata.storeId === "string" ? metadata.storeId : null;
      return {
        id: payment.id,
        kind: "PAYMENT" as const,
        storeId: paymentStoreId,
        storeName: paymentStoreId ? storeNames.get(paymentStoreId) ?? null : null,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethodType: payment.paymentMethodType,
        customerName: payment.customerName,
        customerEmail: payment.customerEmail,
        customerPhone: payment.customerPhone,
        description: payment.description,
        items: Array.isArray(metadata.cart) ? metadata.cart : [],
        createdAt: payment.createdAt,
      };
    });
    const leadRows = leads.map((lead) => ({
      id: lead.id,
      kind: "LEAD" as const,
      storeId: lead.storeId,
      storeName: storeNames.get(lead.storeId) ?? null,
      amount: lead.amount,
      currency: lead.currency,
      status: "LEAD_RECEIVED",
      paymentMethodType: null,
      customerName: lead.customerName,
      customerEmail: lead.customerEmail,
      customerPhone: lead.customerPhone,
      description: lead.message,
      items: lead.items,
      createdAt: lead.createdAt,
    }));

    const rows = [...paymentRows, ...leadRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return includeAll ? rows : rows.slice(0, 100);
  }

  async summary(merchantId: string, storeId?: string) {
    const selectedStore = storeId
      ? await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, name: true, viewCount: true } })
      : null;
    if (storeId && !selectedStore) throw new NotFoundException("Store not found");

    const succeededWhere = {
      merchantId,
      status: PaymentIntentStatus.SUCCEEDED,
      ...(storeId ? { metadata: { path: ["storeId"], equals: storeId } } : {}),
    };
    const [revenue, inventoryLinks, storeViews, methodTotals, productStats, unattributedRows] = await Promise.all([
      this.prisma.paymentIntent.aggregate({
        where: succeededWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // "Money in products": what the current catalog would be worth if
      // every tracked unit sold at its listed price. Only counts products
      // with stock actually tracked — an unlimited (null-stock) product has
      // no meaningful "units on hand" to value.
      this.prisma.paymentLink.findMany({
        where: { store: { merchantId }, ...(storeId ? { storeId } : {}), status: PaymentLinkStatus.ACTIVE },
        select: { amount: true, stock: true, variants: true },
      }),
      storeId
        ? Promise.resolve({ _sum: { viewCount: selectedStore?.viewCount ?? 0 } })
        : this.prisma.store.aggregate({ where: { merchantId }, _sum: { viewCount: true } }),
      this.prisma.paymentIntent.groupBy({
        by: ["paymentMethodType"],
        where: succeededWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.storeProductStat.findMany({
        where: { merchantId, ...(storeId ? { storeId } : {}) },
        orderBy: [{ quantity: "desc" }, { paymentLinkId: "asc" }],
        take: 10,
        select: { paymentLinkId: true, productName: true, quantity: true, revenue: true },
      }),
      storeId
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<{ amount: bigint | null; count: bigint }>>(Prisma.sql`
            SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
            FROM "PaymentIntent"
            WHERE "merchantId" = ${merchantId}
              AND status = 'SUCCEEDED'
              AND NULLIF(metadata ->> 'storeId', '') IS NULL
          `),
    ]);

    const inventoryValue = inventoryLinks.reduce((sum, link) => {
      const variants = readInventoryVariants(link.variants);
      if (variants.length === 0) return sum + link.amount * (link.stock ?? 0);

      const finiteOptionValue = variants.reduce(
        (optionSum, variant) => optionSum + (typeof variant.stock === "number" ? variant.amount * variant.stock : 0),
        0,
      );
      const usesOnlyLegacySharedStock = variants.every((variant) => variant.stock === undefined);
      return sum + (usesOnlyLegacySharedStock ? link.amount * (link.stock ?? 0) : finiteOptionValue);
    }, 0);

    const topProducts = productStats.map((stat) => ({
      paymentLinkId: stat.paymentLinkId,
      name: stat.productName,
      quantity: stat.quantity,
      revenue: stat.revenue,
    }));
    const revenueByPaymentMethod = methodTotals
      .map((row) => ({
        paymentMethodType: row.paymentMethodType ?? "UNSPECIFIED",
        amount: row._sum.amount ?? 0,
        paymentCount: row._count._all,
      }))
      .sort((a, b) => b.amount - a.amount);
    const unattributed = unattributedRows[0];

    return {
      totalRevenue: revenue._sum.amount ?? 0,
      paymentCount: revenue._count._all,
      unattributedRevenue: Number(unattributed?.amount ?? 0),
      unattributedPaymentCount: Number(unattributed?.count ?? 0),
      inventoryValue,
      totalStoreViews: storeViews._sum.viewCount ?? 0,
      revenueByPaymentMethod,
      topProducts,
      scope: storeId ? { type: "STORE", storeId, storeName: selectedStore?.name } : { type: "MERCHANT" },
      currency: "BOB",
    };
  }
}
