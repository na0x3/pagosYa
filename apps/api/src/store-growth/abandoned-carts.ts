/**
 * Crecer › Carritos abandonados (spec 2026-10-13-abandoned-carts): the rows, from what the service read. Pure, so the
 * rules (merge, one row per person, who paid later) are unit-tested without a database.
 */
export type CartLine = { name: string; variant: string | null; quantity: number };
export type CartReminder = 'scheduled' | 'sent' | 'none';
export type AbandonedCart = {
  key: string; source: 'payment' | 'saved'; name: string | null; email: string | null; phone: string | null;
  items: CartLine[]; total: number; currency: string; leftAt: string; reminder: CartReminder; recoverUrl: string | null; storeUrl: string;
};
/** Kind 1: a live store-cart payment confirmed (Pagar pressed) at least an hour ago and not paid. */
export type AttemptInput = { paymentIntentId: string; name: string | null; email: string | null; phone: string | null; items: CartLine[]; total: number; currency: string; leftAt: Date };
/** Kind 2: an open saved cart. paymentSucceeded: the payment it was linked to went through (any mode). */
export type SavedInput = { id: string; token: string; email: string; name: string | null; phone: string | null; paymentIntentId: string | null; items: CartLine[]; total: number; currency: string; leftAt: Date; sentAt: Date | null; paymentSucceeded: boolean };
/** A live paid payment of this store. paidAt is the payment's updatedAt, as RetentionService.cartPaid reads it. */
export type PaidInput = { email: string | null; phone: string | null; paidAt: Date };
export type ProductPrice = { id: string; name: string; amount: number; currency: string; variants: unknown; extras: unknown };

const emailKey = (email: string | null | undefined) => email?.trim().toLowerCase() || null;
/** Digits without Bolivia's 591, so «+591 7000 0001» and «70000001» are one person. */
export function phoneKey(phone: string | null | undefined): string | null {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('591')) digits = digits.slice(3);
  return digits.length >= 7 ? digits : null;
}
/** One row per person: the lower-cased email, else the phone digits. */
export function personKey(email: string | null | undefined, phone: string | null | undefined): string | null {
  const byEmail = emailKey(email);
  if (byEmail) return `email:${byEmail}`;
  const byPhone = phoneKey(phone);
  return byPhone ? `phone:${byPhone}` : null;
}

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry)) : [];

/** An order's cart snapshot as the merchant reads it: name, option and quantity. */
export function orderLines(items: unknown): CartLine[] {
  return records(items).flatMap((line): CartLine[] => typeof line.name === 'string' && Number.isInteger(line.quantity)
    ? [{ name: line.name, variant: typeof line.variantName === 'string' ? line.variantName : null, quantity: line.quantity as number }] : []);
}

type SavedItem = { paymentLinkId: string; variantId?: string; extraIds: string[]; quantity: number };
/** A saved cart's items as stored: { paymentLinkId, variantId?, extraIds?, quantity }. */
export function savedItems(items: unknown): SavedItem[] {
  return records(items).flatMap((item): SavedItem[] => typeof item.paymentLinkId === 'string' && Number.isInteger(item.quantity)
    ? [{ paymentLinkId: item.paymentLinkId, ...(typeof item.variantId === 'string' ? { variantId: item.variantId } : {}), extraIds: Array.isArray(item.extraIds) ? item.extraIds.filter((id): id is string => typeof id === 'string') : [], quantity: item.quantity as number }] : []);
}

/** A saved cart keeps ids only: names and today's prices come from the catalog; a removed product shows as «Producto». */
export function savedCartLines(items: unknown, products: Map<string, ProductPrice>): { items: CartLine[]; total: number; currency: string } {
  let total = 0, currency = 'BOB';
  const lines = savedItems(items).map((item): CartLine => {
    const product = products.get(item.paymentLinkId);
    if (!product) return { name: 'Producto', variant: null, quantity: item.quantity };
    currency = product.currency;
    const variant = records(product.variants).find(entry => entry.id === item.variantId);
    const extras = records(product.extras);
    const extrasAmount = item.extraIds.reduce((sum, id) => { const extra = extras.find(entry => entry.id === id); return sum + (typeof extra?.amount === 'number' ? extra.amount : 0); }, 0);
    total += ((typeof variant?.amount === 'number' ? variant.amount : product.amount) + extrasAmount) * item.quantity;
    return { name: product.name, variant: typeof variant?.name === 'string' ? variant.name : null, quantity: item.quantity };
  });
  return { items: lines, total, currency };
}

export function buildAbandonedCarts(input: { attempts: AttemptInput[]; saved: SavedInput[]; paid: PaidInput[]; recoveryOn: boolean; storeUrl: string; recoverUrl: (token: string) => string }): AbandonedCart[] {
  // An unsent cart is "programado" only while the store's reminders are on; the worker would close it otherwise.
  const reminder = (cart: SavedInput): CartReminder => cart.sentAt ? 'sent' : input.recoveryOn ? 'scheduled' : 'none';
  const byPayment = new Map(input.saved.flatMap(cart => cart.paymentIntentId ? [[cart.paymentIntentId, cart] as const] : []));
  const merged = new Set<string>();
  type Row = Omit<AbandonedCart, 'key' | 'leftAt' | 'storeUrl'> & { at: Date };
  const rows: Row[] = input.attempts.map((attempt): Row => {
    const cart = byPayment.get(attempt.paymentIntentId);
    if (cart) merged.add(cart.id);
    return { source: 'payment', name: attempt.name, email: attempt.email ?? cart?.email ?? null, phone: attempt.phone, items: attempt.items, total: attempt.total, currency: attempt.currency, at: attempt.leftAt, reminder: cart ? reminder(cart) : 'none', recoverUrl: cart ? input.recoverUrl(cart.token) : null };
  });
  for (const cart of input.saved) {
    if (merged.has(cart.id) || cart.paymentSucceeded) continue;
    rows.push({ source: 'saved', name: cart.name, email: cart.email, phone: cart.phone, items: cart.items, total: cart.total, currency: cart.currency, at: cart.leftAt, reminder: reminder(cart), recoverUrl: input.recoverUrl(cart.token) });
  }
  // Whoever paid in this store after leaving is not abandoned (cartPaid's rule, by email or phone).
  const paidLater = (row: Row) => input.paid.some(payment => payment.paidAt >= row.at && (
    (emailKey(row.email) !== null && emailKey(row.email) === emailKey(payment.email)) || (phoneKey(row.phone) !== null && phoneKey(row.phone) === phoneKey(payment.phone))));
  const people = new Map<string, Row>();
  for (const row of rows.filter(row => !paidLater(row)).sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const key = personKey(row.email, row.phone);
    if (key && !people.has(key)) people.set(key, row);
  }
  return [...people].map(([key, { at, ...row }]) => ({ key, ...row, leftAt: at.toISOString(), storeUrl: input.storeUrl }));
}
