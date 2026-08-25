import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentIntentStatus, PaymentLinkStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { createFinancesPdf, createOrdersPdf } from "../reports/finance-pdfs";

type InventoryVariant = { amount: number; stock?: number | null };
const BOLIVIA_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
const PENDING_STATUSES = ["REQUIRES_PAYMENT_METHOD", "REQUIRES_CONFIRMATION", "PROCESSING"] as const;
const ENDED_STATUSES = ["CANCELED", "FAILED"] as const;

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

function boliviaShifted(date: Date): Date {
  // Bolivia is UTC-4 year-round. Shift first, then use UTC accessors so the
  // grouping remains stable regardless of the API server's own timezone.
  return new Date(date.getTime() - BOLIVIA_UTC_OFFSET_MS);
}

function normalizeOrderStatusFilter(value?: string): string {
  return (value || "all").toLowerCase();
}

function isStatusVisible(status: string, statusFilter: string): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "active") return status !== "REQUIRES_PAYMENT_METHOD";
  if (statusFilter === "pending") return PENDING_STATUSES.includes(status as (typeof PENDING_STATUSES)[number]);
  if (statusFilter === "ended") return ENDED_STATUSES.includes(status as (typeof ENDED_STATUSES)[number]);
  return status === statusFilter;
}

function itemsLabel(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return "Producto";
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string" && item.name.trim() ? item.name : typeof item.label === "string" && item.label.trim() ? item.label : "Producto";
    const variantName = typeof item.variantName === "string" && item.variantName.trim() ? ` (${item.variantName})` : "";
    const rawQuantity = Number(item.quantity);
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;
    return `${name}${variantName} × ${quantity}`;
  }).join(" · ");
}

function boliviaMonthWindow(now: Date) {
  const shifted = boliviaShifted(now);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const start = new Date(Date.UTC(year, month, 1) + BOLIVIA_UTC_OFFSET_MS);
  const end = new Date(Date.UTC(year, month + 1, 1) + BOLIVIA_UTC_OFFSET_MS);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedFraction = Math.max(1, day - 1 + (shifted.getUTCHours() + shifted.getUTCMinutes() / 60) / 24);
  return { start, end, day, daysInMonth, elapsedFraction };
}

@Injectable()
export class FinancesService {
  constructor(private readonly prisma: PrismaService) {}

  async orders(merchantId: string, storeId?: string, search?: string, includeAll = false, status?: string) {
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
    const statusFilter = normalizeOrderStatusFilter(status);
    const [payments, leads, stores] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where: {
          merchantId,
          ...(storeId ? { metadata: { path: ["storeId"], equals: storeId } } : {}),
          ...contactSearch,
        },
        include: { storeOrder: { select: { id: true, status: true } } },
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
      const delivery = metadata.delivery && typeof metadata.delivery === "object" && !Array.isArray(metadata.delivery)
        ? metadata.delivery as Prisma.JsonObject
        : null;
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
        deliveryRequested: delivery?.requested === true,
        deliveryAddress: typeof delivery?.address === "string" ? delivery.address : null,
        customerLatitude: typeof delivery?.latitude === "number" ? delivery.latitude : null,
        customerLongitude: typeof delivery?.longitude === "number" ? delivery.longitude : null,
        customerLocationAccuracy: typeof delivery?.accuracyMeters === "number" ? delivery.accuracyMeters : null,
        description: payment.description,
        items: Array.isArray(metadata.cart) ? metadata.cart : [],
        orderId: payment.storeOrder?.id ?? null,
        fulfillmentStatus: payment.storeOrder?.status ?? null,
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
      deliveryRequested: false,
      deliveryAddress: null,
      customerLatitude: null,
      customerLongitude: null,
      customerLocationAccuracy: null,
      description: lead.message,
      items: lead.items,
      orderId: null,
      fulfillmentStatus: null,
      createdAt: lead.createdAt,
    }));

    const rows = [...paymentRows, ...leadRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const filtered = rows.filter((row) => isStatusVisible(row.status, statusFilter));
    return includeAll ? filtered : filtered.slice(0, 100);
  }

  async exportOrdersPdf(merchantId: string, storeId?: string, search?: string, status?: string) {
    const rows = await this.orders(merchantId, storeId, search, true, status);
    return createOrdersPdf(rows.map((order) => ({
      kind: order.kind,
      id: order.id,
      storeName: order.storeName,
      createdAt: order.createdAt,
      status: order.status,
      paymentMethodType: order.paymentMethodType || null,
      customerName: order.customerName || null,
      customerEmail: order.customerEmail || null,
      customerPhone: order.customerPhone || null,
      description: order.description || null,
      itemsLabel: itemsLabel((order as { items: unknown }).items),
      amount: order.amount,
      currency: order.currency,
    })));
  }

  async exportFinancesPdf(merchantId: string, storeId?: string) {
    const finances = await this.summary(merchantId, storeId);
    return createFinancesPdf({
      scope: finances.scope.type === "STORE"
        ? { type: "STORE" as const, storeName: finances.scope.storeName ?? null }
        : { type: "MERCHANT" as const },
      currency: finances.currency || "BOB",
      totalRevenue: finances.totalRevenue,
      paymentCount: finances.paymentCount,
      unattributedRevenue: finances.unattributedRevenue,
      unattributedPaymentCount: finances.unattributedPaymentCount,
      inventoryValue: finances.inventoryValue,
      totalStoreViews: finances.totalStoreViews,
      revenueByPaymentMethod: finances.revenueByPaymentMethod,
      topProducts: finances.topProducts,
      monthlyProjection: finances.monthlyProjection,
      bestSalesDay: finances.bestSalesDay,
      salesByWeekday: finances.salesByWeekday,
    });
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
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const month = boliviaMonthWindow(now);
    const storeActivityScope = storeId
      ? Prisma.sql`AND pi.metadata ->> 'storeId' = ${storeId}`
      : Prisma.empty;
    const [revenue, inventoryLinks, storeViews, methodTotals, productStats, unattributedRows, recentActivityRows] = await Promise.all([
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
      this.prisma.$queryRaw<{ weekday: number; amount: bigint; count: bigint; monthAmount: bigint }[]>(Prisma.sql`
        SELECT
          EXTRACT(DOW FROM (t."createdAt" - INTERVAL '4 hours'))::int AS weekday,
          COALESCE(SUM(t.amount), 0)::bigint AS amount,
          COUNT(*)::bigint AS count,
          COALESCE(SUM(t.amount) FILTER (
            WHERE t."createdAt" >= ${month.start} AND t."createdAt" < ${month.end}
          ), 0)::bigint AS "monthAmount"
        FROM "Transaction" t
        INNER JOIN "PaymentIntent" pi ON pi.id = t."paymentIntentId"
        WHERE t.status = 'SUCCEEDED'
          AND t."createdAt" >= ${ninetyDaysAgo}
          AND pi."merchantId" = ${merchantId}
          AND pi.status = 'SUCCEEDED'
          ${storeActivityScope}
        GROUP BY weekday
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
    const monthToDateRevenue = recentActivityRows.reduce((sum, row) => sum + Number(row.monthAmount ?? 0), 0);
    const projectedRevenue = monthToDateRevenue > 0
      ? Math.round((monthToDateRevenue / month.elapsedFraction) * month.daysInMonth)
      : 0;
    const weekdayTotals = WEEKDAY_NAMES.map((name, weekday) => ({ weekday, name, amount: 0, paymentCount: 0 }));
    recentActivityRows.forEach((row) => {
      if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) return;
      weekdayTotals[row.weekday].amount = Number(row.amount);
      weekdayTotals[row.weekday].paymentCount = Number(row.count);
    });
    const totalRecentPayments = weekdayTotals.reduce((sum, row) => sum + row.paymentCount, 0);
    const busiestWeekdays = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
      const row = weekdayTotals[weekday];
      return {
        ...row,
        sharePercent: totalRecentPayments ? Math.round((row.paymentCount / totalRecentPayments) * 100) : 0,
        averageTicket: row.paymentCount ? Math.round(row.amount / row.paymentCount) : 0,
      };
    });
    const bestSalesDay = busiestWeekdays.reduce<(typeof busiestWeekdays)[number] | null>((best, row) => {
      if (!best || row.paymentCount > best.paymentCount || (row.paymentCount === best.paymentCount && row.amount > best.amount)) return row;
      return best;
    }, null);

    return {
      totalRevenue: revenue._sum.amount ?? 0,
      paymentCount: revenue._count._all,
      unattributedRevenue: Number(unattributed?.amount ?? 0),
      unattributedPaymentCount: Number(unattributed?.count ?? 0),
      inventoryValue,
      totalStoreViews: storeViews._sum.viewCount ?? 0,
      revenueByPaymentMethod,
      topProducts,
      monthlyProjection: {
        monthToDateRevenue,
        projectedRevenue,
        elapsedDays: month.day,
        daysInMonth: month.daysInMonth,
        asOf: now.toISOString(),
      },
      salesByWeekday: busiestWeekdays,
      bestSalesDay: bestSalesDay && bestSalesDay.paymentCount > 0 ? bestSalesDay : null,
      salesDayWindowDays: 90,
      scope: storeId ? { type: "STORE", storeId, storeName: selectedStore?.name } : { type: "MERCHANT" },
      currency: "BOB",
    };
  }
}
