import type { PrismaService } from '../prisma/prisma.service';

/** Sessions per checkout step for one store and period: the one definition the insights, the Store Brain and Carritos abandonados share. */
export type FunnelSessions = {
  visitors: number; productViews: number; cartAdds: number; checkoutStarts: number; deliverySelections: number;
  /** Added to the cart more than 24 hours ago: old enough that not finishing means something. */
  matureCartAdds: number;
  /** …and never opened the order review. */
  cartWithoutCheckout: number;
  /** …and never pressed Pagar. Every paid session pressed it, so no order lookup is needed (and none could join, see below). */
  cartWithoutPay: number;
};
const EMPTY: FunnelSessions = { visitors: 0, productViews: 0, cartAdds: 0, checkoutStarts: 0, deliverySelections: 0, matureCartAdds: 0, cartWithoutCheckout: 0, cartWithoutPay: 0 };

/**
 * Steps come only from the G1 events (spec 2026-10-13-abandoned-carts): page_view, product_view, add_to_cart and the
 * review / delivery checkout steps, each counted once per session since `since`, read through the (storeId, createdAt)
 * index; only counts leave the query. createdAt is UTC wall time and the server's TimeZone is not UTC everywhere, so the
 * bounds are cast explicitly (as StoreGrowthService.deviceConversion does). The session hash is keyed with the
 * analytics secret: these sessions cannot be joined to StoreFunnelVisit or to orders, on purpose.
 */
export async function funnelSessions(prisma: Pick<PrismaService, '$queryRaw'>, storeId: string, since: Date, now = new Date()): Promise<FunnelSessions> {
  const matureBefore = new Date(now.getTime() - 86_400_000).toISOString();
  const [row] = await prisma.$queryRaw<FunnelSessions[]>`
    WITH s AS (
      SELECT "sessionHash",
             BOOL_OR("type" = 'page_view') AS "visited",
             BOOL_OR("type" = 'product_view') AS "viewed",
             BOOL_OR("type" = 'add_to_cart') AS "added",
             BOOL_OR("type" = 'add_to_cart' AND "createdAt" < (${matureBefore}::timestamptz AT TIME ZONE 'UTC')) AS "addedLongAgo",
             BOOL_OR("type" = 'checkout_step' AND "target" = 'review') AS "reviewed",
             BOOL_OR("type" = 'checkout_step' AND "target" = 'delivery') AS "delivery",
             BOOL_OR("type" = 'pay_click') AS "pressedPay"
      FROM "StoreAnalyticsEvent"
      WHERE "storeId" = ${storeId} AND "createdAt" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY "sessionHash"
    )
    SELECT COUNT(*) FILTER (WHERE "visited")::int AS "visitors",
           COUNT(*) FILTER (WHERE "viewed")::int AS "productViews",
           COUNT(*) FILTER (WHERE "added")::int AS "cartAdds",
           COUNT(*) FILTER (WHERE "reviewed")::int AS "checkoutStarts",
           COUNT(*) FILTER (WHERE "delivery")::int AS "deliverySelections",
           COUNT(*) FILTER (WHERE "addedLongAgo")::int AS "matureCartAdds",
           COUNT(*) FILTER (WHERE "addedLongAgo" AND NOT "reviewed")::int AS "cartWithoutCheckout",
           COUNT(*) FILTER (WHERE "addedLongAgo" AND NOT "pressedPay")::int AS "cartWithoutPay"
    FROM s`;
  return row ?? EMPTY;
}
