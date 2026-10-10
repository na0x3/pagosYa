export const TOP_SELLER_MIN_ORDERS = 5;
export const TOP_SELLER_WINDOW_DAYS = 90;

/** The store's single best seller by units across paid orders, or null with too few orders or a tie (spec 2026-10-10). */
export function topSellerId(orders: Array<{ items: unknown }>): string | null {
  if (orders.length < TOP_SELLER_MIN_ORDERS) return null;
  const units = new Map<string, number>();
  for (const order of orders) {
    for (const line of Array.isArray(order.items) ? order.items as any[] : []) {
      const id = typeof line?.paymentLinkId === 'string' ? line.paymentLinkId : null;
      if (id) units.set(id, (units.get(id) || 0) + (Number.isFinite(line.quantity) && line.quantity > 0 ? Number(line.quantity) : 1));
    }
  }
  const ranked = [...units].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return null;
  return ranked[0][0];
}
