import type { CartItemDto } from '../payment-links/dto/cart-checkout.dto';
const CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;

/**
 * The cart of a store-page payment, kept as a saved cart keeps it ({ paymentLinkId, variantId, extraIds, quantity,
 * subscriptionCadence }), or null.
 * Subscription renewals (metadata.subscription) and membership joins (metadata.membership) carry a one-line cart too,
 * but nobody "left" them: they are not store carts. Cobros, debts and appointments carry no cart at all.
 * metadata.storeId is caller-supplied on API payments: whoever uses this must also check the store's merchant.
 */
export function reminderCart(metadata: unknown): { storeId: string; items: CartItemDto[] } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.storeId !== 'string' || !Array.isArray(value.cart) || value.subscription || value.membership) return null;
  const items = value.cart.flatMap((entry): CartItemDto[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const line = entry as Record<string, unknown>;
    if (typeof line.paymentLinkId !== 'string' || !Number.isInteger(line.quantity) || (line.quantity as number) < 1) return [];
    const extraIds = Array.isArray(line.extraIds) ? line.extraIds.filter((id): id is string => typeof id === 'string') : [];
    // A subscription comes back as a subscription (owner, 2026-10-13); the store page drops a cadence it no longer offers.
    const cadence = (line.subscription as { cadence?: unknown } | undefined)?.cadence;
    const subscriptionCadence = CADENCES.find(value => value === cadence);
    return [{ paymentLinkId: line.paymentLinkId, ...(typeof line.variantId === 'string' ? { variantId: line.variantId } : {}), ...(extraIds.length ? { extraIds } : {}), quantity: line.quantity as number, ...(subscriptionCadence ? { subscriptionCadence } : {}) }];
  });
  return items.length ? { storeId: value.storeId, items: items.slice(0, 50) } : null;
}
