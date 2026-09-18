export type Bundle = { id: string; name: string; kind: string; items: Array<{ productId: string; quantity: number }>; minimumQuantity: number; discountPercent: number };
type Line = { paymentLinkId: string; quantity: number; unitAmount: number };
/** Best single offer wins; no implicit stacking with promo codes. Stock remains on ordinary cart lines. */
export function bestBundleDiscount(bundles: Bundle[], lines: Line[]) {
  let best = { id: '', name: '', amount: 0 };
  for (const bundle of bundles) {
    const prices = new Map(bundle.items.map(item => [item.productId, lines.filter(line => line.paymentLinkId === item.productId).flatMap(line => Array(line.quantity).fill(line.unitAmount) as number[]).sort((a, b) => a - b)]));
    let eligible = 0, discount = 0;
    if (bundle.kind === 'FIXED') {
      const cycles = Math.min(...bundle.items.map(item => Math.floor((prices.get(item.productId)?.length || 0) / item.quantity)));
      if (cycles > 0 && Number.isFinite(cycles)) eligible = bundle.items.reduce((sum, item) => sum + prices.get(item.productId)!.slice(0, cycles * item.quantity).reduce((a, b) => a + b, 0), 0);
    } else {
      const units = [...prices.values()].flat().sort((a, b) => a - b);
      if (bundle.kind === 'BOGO') discount = units.slice(0, Math.floor(units.length / 2)).reduce((a, b) => a + b, 0);
      else eligible = units.slice(0, Math.floor(units.length / bundle.minimumQuantity) * bundle.minimumQuantity).reduce((a, b) => a + b, 0);
    }
    discount ||= Math.floor(eligible * bundle.discountPercent / 100);
    if (discount > best.amount) best = { id: bundle.id, name: bundle.name, amount: discount };
  }
  const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
  return { ...best, amount: Math.min(best.amount, Math.max(0, subtotal - 1)) };
}
