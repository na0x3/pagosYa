import type { SourceSnapshot } from './source-preview';

/** Calculate display-only totals from the catalog, never amounts supplied by authored JS. */
export function sourcePaymentSummary(snapshot: SourceSnapshot, cart: unknown) {
  const config = snapshot.files.find(file => file.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  if (!config || !Array.isArray(cart) || !cart.length || cart.length > 100) throw new Error('Añade productos al pedido antes de pagar.');
  const store = JSON.parse(config[1]).data;
  const seen = new Set<string>();
  let amount = 0, currency = '';
  const names: string[] = [];
  for (const line of cart) {
    const product = store?.items?.find((item: any) => item.id === line?.id);
    if (!product || seen.has(product.id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > Math.min(99, product.stock ?? 99, product.purchaseLimit ?? 99) || product.variants?.length || product.extras?.length) throw new Error('Revisa los productos y cantidades del pedido.');
    seen.add(product.id);
    if (!Number.isSafeInteger(product.amount) || product.amount < 0 || !/^[A-Z]{3}$/.test(product.currency) || currency && currency !== product.currency) throw new Error('No se pudo calcular el total del pedido.');
    currency = product.currency;
    const now = Date.now();
    const discount = product.discountPercent > 0 && product.discountPercent <= 100 && (!product.discountStartsAt || Date.parse(product.discountStartsAt) <= now) && (!product.discountEndsAt || Date.parse(product.discountEndsAt) > now);
    const unit = discount ? Math.round(product.amount * (1 - product.discountPercent / 100)) : product.amount;
    amount += unit * line.quantity;
    names.push(`${line.quantity} × ${String(product.name).slice(0, 120)}`);
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('El pedido necesita un importe válido para pagar.');
  return { amount, currency, merchantName: String(store.storeName || 'Tu tienda').slice(0, 120), description: names.join(' · ').slice(0, 1500) };
}
