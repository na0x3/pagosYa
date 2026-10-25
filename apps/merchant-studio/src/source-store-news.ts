/**
 * YAPI's store news (owner 2026-10-22): now and then the glass window brings the merchant one piece of news about their
 * store — new orders since they last looked, the month's sales, visits, their best seller, what is running out, carts left
 * behind. Every line is built from the merchant's own figures, never written by a model, and never covers a running build.
 */

export type StoreNewsItem = { id: string; title: string; line: string };

type Finances = {
  totalRevenue?: number; paymentCount?: number; totalStoreViews?: number;
  topProducts?: Array<{ name?: string; quantity?: number }>;
  monthlyProjection?: { monthToDateRevenue?: number; projectedRevenue?: number };
  bestSalesDay?: { name?: string; paymentCount?: number } | null;
};
type OrderRow = { id: string; kind?: string; status?: string; amount?: number; customerName?: string | null; items?: unknown; createdAt?: string };
type ProductRow = { id: string; name: string; status?: string; stock?: number | null; variants?: Array<{ name: string; stock?: number | null }> | null };
type Carts = { carts?: unknown[]; anonymousSessions?: number } | null;

export type StoreNewsData = { finances?: Finances | null; orders?: OrderRow[] | null; products?: ProductRow[] | null; carts?: Carts; seenOrderIds?: string[] | null };

const LOW_STOCK = 3;

/** Amounts arrive in cents, the way the dashboard reads them. */
export const bs = (cents: number) => `Bs ${(Math.round(cents) / 100).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || '';
const itemName = (items: unknown) => {
  const first = Array.isArray(items) ? items[0] as { name?: unknown } | undefined : undefined;
  return typeof first?.name === 'string' ? first.name : '';
};

/** The paid orders and messages the merchant has not been told about. The first visit only remembers, it never announces. */
export function unseenOrders(orders: OrderRow[], seen: string[] | null | undefined) {
  if (!seen) return [];
  const known = new Set(seen);
  return orders.filter(order => !known.has(order.id) && (order.status === 'SUCCEEDED' || order.kind === 'LEAD'));
}

/** Products, or a product's emptiest option, with 3 units or fewer; unlimited stock (null) never runs low. */
export function runningOut(products: ProductRow[]) {
  const items: Array<{ name: string; stock: number }> = [];
  for (const product of products) {
    if (product.status && product.status !== 'ACTIVE') continue;
    const variants = (product.variants || []).filter(v => typeof v.stock === 'number') as Array<{ name: string; stock: number }>;
    if (variants.length) {
      const lowest = variants.reduce((min, v) => (v.stock < min.stock ? v : min));
      if (lowest.stock <= LOW_STOCK) items.push({ name: `${product.name} · ${lowest.name}`, stock: lowest.stock });
    } else if (typeof product.stock === 'number' && product.stock <= LOW_STOCK) items.push({ name: product.name, stock: product.stock });
  }
  return items.sort((a, b) => a.stock - b.stock);
}

/** Every piece of news worth telling right now, the most urgent first. */
export function storeNews(data: StoreNewsData): StoreNewsItem[] {
  const news: StoreNewsItem[] = [];
  const finances = data.finances || {};
  const fresh = unseenOrders(data.orders || [], data.seenOrderIds);
  const paid = fresh.filter(order => order.kind !== 'LEAD');
  const messages = fresh.filter(order => order.kind === 'LEAD');
  if (paid.length === 1) {
    const [order] = paid; const who = firstName(order.customerName); const what = itemName(order.items);
    news.push({ id: `order:${order.id}`, title: '¡Nueva venta!', line: `${who || 'Alguien'} pagó ${bs(order.amount || 0)}${what ? ` por ${what}` : ''}. Revisa el pedido en Pedidos para prepararlo.` });
  } else if (paid.length > 1) {
    const total = paid.reduce((sum, order) => sum + (order.amount || 0), 0);
    news.push({ id: `orders:${paid.map(o => o.id).join(',')}`, title: '¡Nuevas ventas!', line: `Tienes ${plural(paid.length, 'pedido nuevo', 'pedidos nuevos')} desde tu última visita, por ${bs(total)} en total.` });
  }
  if (messages.length) {
    const who = firstName(messages[0].customerName);
    news.push({ id: `leads:${messages.map(o => o.id).join(',')}`, title: 'Te escribieron', line: messages.length === 1 ? `${who || 'Un cliente'} te dejó un mensaje desde tu tienda. Respóndele pronto en Pedidos.` : `${plural(messages.length, 'cliente te dejó', 'clientes te dejaron')} un mensaje desde tu tienda.` });
  }
  const out = runningOut(data.products || []);
  if (out.length) {
    const [first] = out;
    const line = first.stock === 0 ? `${first.name} está agotado.` : `Quedan ${plural(first.stock, 'unidad', 'unidades')} de ${first.name}.`;
    news.push({ id: `stock:${out.map(i => `${i.name}=${i.stock}`).join('|')}`, title: 'Por reponer', line: `${line}${out.length > 1 ? ` Y ${plural(out.length - 1, 'producto más está', 'productos más están')} por acabarse.` : ''} Repón antes de que tus clientes lo encuentren agotado.` });
  }
  const carts = data.carts?.carts?.length || 0;
  if (carts) news.push({ id: `carts:${carts}`, title: 'Carritos abandonados', line: `${plural(carts, 'persona dejó', 'personas dejaron')} su carrito sin pagar esta semana. Un recordatorio por WhatsApp suele traerlas de vuelta.` });
  const month = Number(finances.monthlyProjection?.monthToDateRevenue) || 0;
  const projected = Number(finances.monthlyProjection?.projectedRevenue) || 0;
  if (month > 0) news.push({ id: `month:${month}`, title: 'Tus ventas del mes', line: `Este mes llevas ${bs(month)} vendidos.${projected > month ? ` A este ritmo cerrarías el mes cerca de ${bs(projected)}.` : ''}` });
  const top = finances.topProducts?.[0];
  if (top?.name && (top.quantity || 0) > 0) news.push({ id: `top:${top.name}:${top.quantity}`, title: 'Tu favorito', line: `${top.name} es lo que más se vende en tu tienda: ${plural(top.quantity || 0, 'unidad vendida', 'unidades vendidas')}.` });
  const best = finances.bestSalesDay;
  if (best?.name && (best.paymentCount || 0) >= 3) news.push({ id: `day:${best.name}`, title: 'Tu mejor día', line: `Los ${best.name.toLowerCase()} son tu mejor día de ventas. Es buen día para publicar novedades.` });
  const views = Number(finances.totalStoreViews) || 0;
  if (views > 0) news.push({ id: `views:${views}`, title: 'Visitas', line: `Tu tienda ya tiene ${plural(views, 'visita', 'visitas')}.${(Number(finances.paymentCount) || 0) === 0 ? ' Todavía sin ventas: un buen precio o un envío claro puede dar el primer empujón.' : ''}` });
  if (!news.length && (Number(finances.paymentCount) || 0) === 0) news.push({ id: 'first-sale', title: 'Tu primera venta', line: 'Aún no tienes ventas. Comparte el enlace de tu tienda en WhatsApp e Instagram para recibir tus primeras visitas.' });
  return news;
}

type Timers = { setTimeout(fn: () => void, ms: number): number; clearTimeout(id: number): void };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const NEWS_FIRST_MS = 20_000;
export const NEWS_EVERY_MS = 4 * 60_000;
export const NEWS_SNOOZE_MS = 30 * 60_000;

/**
 * The cadence: the first news a little after the Studio opens, then one every few minutes, each told once per session.
 * A build in progress always wins: the news waits for the next turn. Closing a news window quiets YAPI for half an hour.
 */
export function storeNewsTicker(opts: {
  storeId: () => string;
  load: (storeId: string) => Promise<Omit<StoreNewsData, 'seenOrderIds'>>;
  show: (item: StoreNewsItem) => boolean;
  busy: () => boolean;
  timers?: Timers; storage?: Storage | null; now?: () => number;
}) {
  const timers = opts.timers ?? { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: id => window.clearTimeout(id) };
  const now = opts.now ?? (() => Date.now());
  const told = new Set<string>();
  let timer = 0, snoozedUntil = 0, stopped = false;
  const key = (storeId: string) => `pagosya_yapi_news:${storeId}`;
  const seen = (storeId: string): string[] | null => { try { const raw = opts.storage?.getItem(key(storeId)); return raw ? JSON.parse(raw) as string[] : null; } catch { return null; } };
  const remember = (storeId: string, ids: string[]) => { try { opts.storage?.setItem(key(storeId), JSON.stringify(ids.slice(0, 200))); } catch { /* storage blocked */ } };
  const schedule = (ms: number) => { timers.clearTimeout(timer); if (!stopped) timer = timers.setTimeout(() => { void tick(); }, ms); };

  async function tick() {
    const storeId = opts.storeId();
    if (!storeId || opts.busy() || now() < snoozedUntil) { schedule(NEWS_EVERY_MS); return; }
    try {
      const data = await opts.load(storeId);
      const before = seen(storeId);
      const item = storeNews({ ...data, seenOrderIds: before }).find(news => !told.has(`${storeId}:${news.id}`));
      // The first visit, or once new orders were told: every current order counts as seen from then on.
      const ids = (data.orders || []).map(order => order.id);
      if (!opts.busy() && item && opts.show(item)) {
        told.add(`${storeId}:${item.id}`);
        if (before === null || item.id.startsWith('order') || item.id.startsWith('leads')) remember(storeId, ids);
      } else if (before === null) remember(storeId, ids);
    } catch { /* news is a nicety: a failed read waits for the next turn */ }
    schedule(NEWS_EVERY_MS);
  }

  return {
    start() { stopped = false; schedule(NEWS_FIRST_MS); },
    stop() { stopped = true; timers.clearTimeout(timer); },
    /** The merchant closed a news window: no more news for a while. */
    snooze() { snoozedUntil = now() + NEWS_SNOOZE_MS; },
    tick,
  };
}
