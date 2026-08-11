import { Injectable } from "@nestjs/common";
import { PaymentIntentStatus, PaymentLinkStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface CartLine {
  paymentLinkId: string;
  name: string;
  quantity: number;
  unitAmount: number;
}

type InventoryVariant = { amount: number; stock?: number | null };

function readInventoryVariants(value: unknown): InventoryVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is InventoryVariant =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) > 0 &&
      (!("stock" in entry) ||
        (entry as Record<string, unknown>).stock === null ||
        (Number.isInteger((entry as Record<string, unknown>).stock) &&
          ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

@Injectable()
export class FinancesService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(merchantId: string) {
    const [revenue, inventoryLinks, storeViews, succeededIntents] = await Promise.all([
      this.prisma.paymentIntent.aggregate({
        where: { merchantId, status: PaymentIntentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),
      // "Money in products": what the current catalog would be worth if
      // every tracked unit sold at its listed price. Only counts products
      // with stock actually tracked — an unlimited (null-stock) product has
      // no meaningful "units on hand" to value.
      this.prisma.paymentLink.findMany({
        where: { store: { merchantId }, status: PaymentLinkStatus.ACTIVE },
        select: { amount: true, stock: true, variants: true },
      }),
      this.prisma.store.aggregate({ where: { merchantId }, _sum: { viewCount: true } }),
      // Cart line items (product id/name/quantity) are only present in
      // metadata for store-checkout PaymentIntents (see
      // StoresService.createCartCheckout) — a plain API-created intent has
      // none, and correctly can't contribute to "most sold product" since
      // it isn't tied to a specific catalog product.
      this.prisma.paymentIntent.findMany({
        where: { merchantId, status: PaymentIntentStatus.SUCCEEDED },
        select: { amount: true, paymentMethodType: true, metadata: true },
      }),
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

    const soldByProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
    const revenueByMethod = new Map<string, { amount: number; paymentCount: number }>();
    for (const intent of succeededIntents) {
      const method = intent.paymentMethodType ?? "UNSPECIFIED";
      const methodRevenue = revenueByMethod.get(method) ?? { amount: 0, paymentCount: 0 };
      methodRevenue.amount += intent.amount;
      methodRevenue.paymentCount += 1;
      revenueByMethod.set(method, methodRevenue);

      const cart = (intent.metadata as { cart?: CartLine[] } | null)?.cart;
      if (!cart) continue;
      for (const line of cart) {
        const existing = soldByProduct.get(line.paymentLinkId) ?? { name: line.name, quantity: 0, revenue: 0 };
        existing.quantity += line.quantity;
        existing.revenue += line.unitAmount * line.quantity;
        soldByProduct.set(line.paymentLinkId, existing);
      }
    }
    const topProducts = [...soldByProduct.entries()]
      .map(([paymentLinkId, v]) => ({ paymentLinkId, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    const revenueByPaymentMethod = [...revenueByMethod.entries()]
      .map(([paymentMethodType, values]) => ({ paymentMethodType, ...values }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalRevenue: revenue._sum.amount ?? 0,
      inventoryValue,
      totalStoreViews: storeViews._sum.viewCount ?? 0,
      revenueByPaymentMethod,
      topProducts,
      currency: "BOB",
    };
  }
}
