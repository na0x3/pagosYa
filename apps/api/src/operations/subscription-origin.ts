import { PrismaService } from "../prisma/prisma.service";

/**
 * A product subscription lives in the mode its first order was paid in (sourceOrder -> paymentIntent.livemode).
 * Plan subscriptions and rows without a source order have no origin and follow the store.
 */
type WithOrigin = { id: string; sourceOrderId?: string | null };

export async function originLivemodes(prisma: Pick<PrismaService, "storeOrder">, subscriptions: WithOrigin[]): Promise<Map<string, boolean>> {
  const orderIds = [...new Set(subscriptions.map(subscription => subscription.sourceOrderId).filter((id): id is string => !!id))];
  const orders = orderIds.length ? await prisma.storeOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, paymentIntent: { select: { livemode: true } } } }) : [];
  return new Map(orders.map(order => [order.id, order.paymentIntent.livemode]));
}

/** Live from the buyer's and the dashboard's point of view: no source order (plan) or a source order paid in live mode. */
export function isLiveOrigin(subscription: WithOrigin, origins: Map<string, boolean>): boolean {
  return !subscription.sourceOrderId || origins.get(subscription.sourceOrderId) === true;
}

/** The renewal engine only bills a product subscription in the mode it was born in. */
export function originMatchesStore(subscription: WithOrigin & { paymentLinkId?: string | null }, origins: Map<string, boolean>, storeLivemode: boolean): boolean {
  if (!subscription.paymentLinkId) return true;
  return isLiveOrigin(subscription, origins) === storeLivemode;
}
