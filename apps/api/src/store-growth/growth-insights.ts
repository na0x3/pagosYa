import type { buildAnalyticsReport } from '../store-analytics/store-analytics-report';
import { money } from '../store-knowledge/store-knowledge';

/**
 * Growth insights v2 (G2): deterministic rules over the G1 analytics report, orders, the catalog, leads and the Store
 * Brain gaps. No AI and no guesses: every insight names its numbers and period, explains why it fired, and carries one
 * action the dashboard turns into a button that opens the right screen already filled in — it never applies anything.
 * An impact appears only when it is arithmetic on the store's own numbers, and says "Estimación".
 */
export type Severity = 'high' | 'medium' | 'low';
export type GrowthActionKind = 'yapi' | 'product' | 'stock' | 'proposal' | 'promo' | 'settings' | 'inbox';
export type GrowthAction = { kind: GrowthActionKind; label: string; payload: Record<string, string> };
export type GrowthInsight = { id: string; rule: string; severity: Severity; title: string; evidence: string; why: string[]; impact: string | null; action: GrowthAction; weight: number };
type Report = ReturnType<typeof buildAnalyticsReport>;
export type GrowthProduct = { id: string; name: string; stock: number | null; photos: number; hasDescription: boolean; amount: number; currency: string; createdAt: Date };
export type GrowthInsightInput = {
  days: number;
  /** The store's checkout mode: payment | whatsapp | external. */
  mode: string;
  storeName: string;
  store: { published: boolean; paused: boolean; hidden: boolean; verified: boolean; policies: { returns: boolean; delivery: boolean } };
  report: Report;
  previousReport: Report;
  /** Active products. */
  products: GrowthProduct[];
  /** Units sold in the period (paid live orders), per product id. */
  unitsSold: Record<string, number>;
  /** Live paid orders ever (onboarding). */
  paidEver: number;
  leads: { unread: number; oldestUnreadAt: Date | null; inPeriod: number };
  devices: { device: string; sessions: number; addSessions: number }[];
  /** The instant the period starts (a product created after it had no fair chance to be seen). */
  periodStart: Date;
  now: Date;
};
export type InsightState = { insightId: string; status: string; until: Date | null };

export const INSIGHTS_SHOWN = 5;
const BLOCKERS = ['unpublished', 'paused', 'test-mode'];
const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];
const ANALYTICS_NOTE = 'Cuenta solo las visitas que aceptaron la analítica; los datos se actualizan cada 15 minutos.';
const NO_PRICE_CHANGE = 'No cambies precios ni productos.';

const number = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const pct = (part: number, whole: number) => number.format(Math.round((part / whole) * 1000) / 10);
const clip = (text: string, max = 40) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
const quoted = (name: string) => `«${clip(name)}»`;
const plural = (n: number, one: string, many: string) => `${number.format(n)} ${n === 1 ? one : many}`;
const nameList = (names: string[]) => {
  const shown = names.slice(0, 3).map(quoted);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} y ${rest} más`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}` : shown[0];
};

/** Checkout steps as the merchant reads them: what the sessions before did, what this step is. */
const STEP_WORDS: Record<string, { did: string; reach: string; title: string }> = {
  cart_open: { did: 'abrieron el carrito', reach: 'abrieron el carrito', title: '' },
  review: { did: 'vieron el resumen del pedido', reach: 'llegaron al resumen del pedido', title: 'Muchos abren el carrito y no continúan' },
  pay_click: { did: 'tocaron el botón final', reach: 'tocaron el botón final', title: 'El resumen del pedido frena la compra' },
  whatsapp: { did: 'abrieron WhatsApp', reach: 'abrieron WhatsApp', title: 'El paso a WhatsApp pierde pedidos' },
  contact: { did: 'abrieron el formulario seguro', reach: 'abrieron el formulario seguro de pago', title: 'Se pierden compradores al pasar al pago' },
  payment: { did: 'llegaron a elegir cómo pagar', reach: 'llegaron a elegir cómo pagar', title: 'Compradores abandonan en el formulario de pago' },
};
const FINAL_BUTTON: Record<string, string> = { payment: 'tocaron «Pagar»', whatsapp: 'tocaron «Pedir por WhatsApp»', external: 'tocaron el botón final' };

/** Calls to action whose next step can be measured, and what that step is. */
const CTA_FOLLOW: Record<string, { name: string; follow: 'product_view' | 'add_to_cart' | 'contact_submit'; did: string; title: string }> = {
  'hero-cta': { name: 'el botón principal de la portada', follow: 'product_view', did: 'abrieron un producto', title: 'El botón principal de tu portada no lleva a comprar' },
  'nav-catalog': { name: '«Catálogo» en el menú', follow: 'product_view', did: 'abrieron un producto', title: 'El catálogo del menú no lleva a ver productos' },
  promo: { name: 'tu promoción', follow: 'add_to_cart', did: 'añadieron algo al carrito', title: 'Tu promoción recibe clics pero no carritos' },
  contact: { name: '«Contacto»', follow: 'contact_submit', did: 'enviaron el formulario', title: 'Muchos abren Contacto pero pocos escriben' },
};
const CTA_INSTRUCTION: Record<string, string> = {
  'hero-cta': `Haz que el botón principal de mi portada lleve directo a mis productos más vendidos, con un texto de acción claro. ${NO_PRICE_CHANGE}`,
  'nav-catalog': `Revisa el enlace «Catálogo» del menú: que lleve a la lista de productos con fotos y precios visibles. ${NO_PRICE_CHANGE}`,
  promo: 'Revisa la promoción de mi tienda: que su botón lleve a los productos en oferta y que el descuento se vea claro junto al precio. No inventes descuentos ni cambies precios.',
  contact: 'Simplifica el formulario de contacto de mi tienda: pocos campos, un botón de envío claro y visible en celular. No inventes datos de contacto.',
};

function age(from: Date, now: Date) {
  const hours = Math.max(1, Math.floor((now.getTime() - from.getTime()) / 3_600_000));
  return hours < 24 ? plural(hours, 'hora', 'horas') : plural(Math.floor(hours / 24), 'día', 'días');
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
/** A promo code from a referrer host: instagram.com → INSTAGRAM, l.facebook.com → FACEBOOK. */
export function promoCodeForHost(host: string) {
  const skip = new Set(['www', 'm', 'l', 'lm', 'web', 'mobile', 'com', 'net', 'org', 'bo', 'co', 'app', 'io', 'es', 'ar', 'pe', 'cl', 'mx']);
  const label = host.split('.').find(part => !skip.has(part)) || '';
  const code = label.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  return code.length >= 3 ? code : 'BIENVENIDA';
}

export function buildGrowthInsights(input: GrowthInsightInput): GrowthInsight[] {
  const { days, mode, report, now } = input;
  const period = `en los últimos ${days} días`;
  const insights: GrowthInsight[] = [];
  const add = (insight: Omit<GrowthInsight, 'weight' | 'impact'> & { weight?: number; impact?: string | null }) =>
    insights.push({ impact: null, weight: 0, ...insight });
  const active = new Map(input.products.map(product => [product.id, product]));
  const stats = new Map(report.topProducts.map(product => [product.productId, product]));
  const visits = report.totals.page_view.sessions;

  // ── Blockers: nothing else matters while shoppers cannot buy.
  if (!input.store.published) add({
    id: 'unpublished', rule: 'unpublished', severity: 'high', title: 'Publica tu tienda para empezar a recibir visitas',
    evidence: 'Tu tienda todavía no tiene un diseño publicado: nadie puede verla ni comprar.',
    why: ['Sin un diseño publicado, los clientes no pueden abrir tu tienda.', 'Las visitas, los clics y las ventas empiezan a contarse cuando la publicas.'],
    action: { kind: 'settings', label: 'Abrir el diseñador y publicar', payload: { view: 'workspace' } },
  });
  else if (input.store.paused || input.store.hidden) add({
    id: 'paused', rule: 'paused', severity: 'high', title: 'Tu tienda está en pausa',
    evidence: input.store.paused ? 'Publicaste un diseño, pero la tienda está en pausa: los clientes no pueden abrirla.' : 'Tu tienda está oculta al público: los clientes no pueden abrirla.',
    why: ['Mientras esté en pausa u oculta, no entran visitas ni pedidos.'],
    action: input.store.paused
      ? { kind: 'settings', label: 'Reactivar mi tienda', payload: { view: 'workspace' } }
      : { kind: 'settings', label: 'Mostrar mi tienda al público', payload: { view: 'store-settings', section: 'checkout' } },
  });
  if (mode === 'payment' && !input.store.verified) add({
    id: 'test-mode', rule: 'test-mode', severity: 'high', title: 'Completa la verificación para cobrar de verdad',
    evidence: 'Tu tienda cobra en modo de prueba: los pagos no llegan a tu cuenta hasta que se apruebe la verificación de tu negocio.',
    why: ['Los cobros reales se activan cuando se aprueba la verificación (KYC).'],
    action: { kind: 'settings', label: 'Completar verificación', payload: { view: 'compliance' } },
  });

  // ── People waiting for an answer.
  if (input.leads.unread > 0) {
    const waiting = input.leads.oldestUnreadAt ? now.getTime() - input.leads.oldestUnreadAt.getTime() : 0;
    add({
      id: 'unread-leads', rule: 'unread-leads', severity: waiting > 86_400_000 ? 'high' : 'medium',
      title: input.leads.unread === 1 ? 'Tienes una consulta sin responder' : `Tienes ${number.format(input.leads.unread)} consultas sin responder`,
      evidence: `${plural(input.leads.unread, 'consulta sin leer', 'consultas sin leer')}${input.leads.oldestUnreadAt ? `; la más antigua espera desde hace ${age(input.leads.oldestUnreadAt, now)}` : ''}.`,
      why: ['Quien escribe tiene una duda concreta o está listo para comprar; una respuesta a tiempo evita que busque en otro lado.', 'Se vuelve urgente cuando la consulta más antigua espera más de 24 horas.'],
      action: { kind: 'inbox', label: 'Abrir Inbox', payload: {} }, weight: input.leads.unread,
    });
  }

  // ── Onboarding: the first sale.
  if (mode === 'payment' && input.paidEver === 0 && input.store.published) add({
    id: 'first-sale', rule: 'first-sale', severity: 'medium', title: 'Consigue tu primera venta',
    evidence: visits > 0 ? `${plural(visits, 'visita', 'visitas')} ${period} y todavía ninguna venta pagada. Las pruebas no cuentan.` : 'Todavía no hay ventas pagadas. Las pruebas no cuentan.',
    why: ['Mira tu tienda con los ojos de un cliente nuevo: portada, precios visibles, botón de compra y confianza.', ...(visits ? [ANALYTICS_NOTE] : [])],
    action: { kind: 'yapi', label: 'Pedir a YAPI una revisión', payload: { instruction: 'Revisa mi tienda como si fueras un cliente que la visita por primera vez. Propón los 3 cambios que más ayudarían a conseguir la primera venta (portada, precios visibles, botón de compra claro, confianza) y explícame cada uno antes de aplicarlo.' } },
    weight: visits,
  });

  // ── Checkout: the step that loses the most shoppers (required, reachable in this store's mode).
  let previous: { step: string; sessions: number } | null = null;
  let worst: { step: string; before: { step: string; sessions: number }; sessions: number; dropOff: number } | null = null;
  for (const step of report.checkoutSteps) {
    if (!step.reachable || step.optional) continue;
    if (previous && step.dropOff !== null && previous.sessions >= 10 && step.dropOff >= 50 && (!worst || step.dropOff > worst.dropOff)) worst = { step: step.step, before: previous, sessions: step.sessions, dropOff: step.dropOff };
    previous = { step: step.step, sessions: step.sessions };
  }
  if (worst) {
    const lost = Math.max(0, worst.before.sessions - worst.sessions);
    const did = worst.before.step === 'pay_click' ? FINAL_BUTTON[mode] || FINAL_BUTTON.payment : STEP_WORDS[worst.before.step].did;
    const reach = worst.step === 'pay_click' ? (mode === 'whatsapp' ? 'tocaron «Pedir por WhatsApp»' : mode === 'payment' ? 'tocaron «Pagar»' : 'tocaron el botón final') : STEP_WORDS[worst.step].reach;
    const action: GrowthAction =
      worst.step === 'review' ? { kind: 'yapi', label: 'Mejorar el carrito con YAPI', payload: { instruction: `Mejora el carrito de mi tienda para que más clientes continúen: muestra el total y el costo de envío con claridad, deja un botón «Continuar» grande y visible en celular y quita distracciones. ${NO_PRICE_CHANGE}` } }
        : worst.step === 'pay_click' ? { kind: 'yapi', label: 'Mejorar el resumen con YAPI', payload: { instruction: `Mejora el resumen del pedido de mi tienda: que se vean claramente los productos, el total, la entrega y un único botón final destacado. Usa solo datos reales de mi tienda. ${NO_PRICE_CHANGE}` } }
          : worst.step === 'whatsapp' ? { kind: 'settings', label: 'Revisar mi número de WhatsApp', payload: { view: 'store-settings', section: 'checkout' } }
            : worst.step === 'contact' ? { kind: 'settings', label: 'Revisar cómo termina el pedido', payload: { view: 'store-settings', section: 'checkout' } }
              : { kind: 'promo', label: 'Crear un código de primera compra', payload: { code: 'PRIMERACOMPRA' } };
    add({
      id: `checkout-drop:${worst.step}`, rule: 'checkout-drop', severity: worst.dropOff >= 70 ? 'high' : 'medium',
      title: worst.step === 'pay_click' && mode === 'whatsapp' ? 'El resumen del pedido frena los pedidos' : STEP_WORDS[worst.step].title,
      evidence: `De ${plural(worst.before.sessions, 'sesión', 'sesiones')} que ${did}, ${number.format(lost)} no ${reach} (${number.format(worst.dropOff)} %) ${period}.`,
      why: ['Es el paso del pedido donde más compradores pierdes.', 'Cada paso se compara con el paso obligatorio anterior; la entrega es opcional y no cuenta.', 'Se marca cuando se pierde al menos la mitad con 10 sesiones o más en el paso anterior.', ANALYTICS_NOTE],
      action, weight: lost,
    });
  }

  // ── Products that are looked at but not added.
  const viewSessions = report.topProducts.reduce((sum, product) => sum + product.viewSessions, 0);
  const viewAdds = report.topProducts.reduce((sum, product) => sum + Math.min(product.addSessions, product.viewSessions), 0);
  const averageRate = viewSessions >= 50 ? viewAdds / viewSessions : null;
  const medianPrice = input.products.length >= 3 ? median(input.products.map(product => product.amount)) : null;
  report.topProducts
    .filter(stat => active.has(stat.productId) && stat.viewSessions >= 20 && stat.addSessions / stat.viewSessions < 0.03)
    .sort((a, b) => (b.viewSessions - b.addSessions) - (a.viewSessions - a.addSessions))
    .slice(0, 3)
    .forEach(stat => {
      const product = active.get(stat.productId)!;
      const name = quoted(product.name);
      const reasons: string[] = [];
      let action: GrowthAction;
      if (product.stock === 0) { reasons.push('Está agotado: lo ven, pero no pueden añadirlo.'); action = { kind: 'stock', label: 'Reponer stock', payload: { productId: product.id } }; }
      else if (product.photos <= 1) { reasons.push(product.photos ? 'Tiene una sola foto.' : 'No tiene fotos.'); action = { kind: 'product', label: `Mejorar las fotos de ${name}`, payload: { productId: product.id, step: 'photos' } }; }
      else if (!product.hasDescription) { reasons.push('No tiene una descripción útil.'); action = { kind: 'product', label: `Escribir la descripción de ${name}`, payload: { productId: product.id, step: 'description' } }; }
      else if (medianPrice && product.amount >= medianPrice * 1.5) {
        reasons.push(`Su precio (${money(product.amount, product.currency)}) es ${number.format(Math.round(product.amount / medianPrice * 10) / 10)} veces la mediana de tu catálogo (${money(medianPrice, product.currency)}).`);
        action = { kind: 'product', label: `Revisar el precio de ${name}`, payload: { productId: product.id, step: 'price' } };
      } else {
        reasons.push('Tiene fotos, descripción y un precio en la línea de tu catálogo: conviene revisar cómo se presenta en su página.');
        action = { kind: 'yapi', label: 'Mejorar su página con YAPI', payload: { instruction: `Mejora la página de ${name} para que más visitantes lo añadan al carrito: fotos más grandes, sus beneficios reales arriba, y el precio y el botón «Añadir» visibles sin desplazarse. No cambies el precio ni inventes datos.` } };
      }
      const productRate = stat.addSessions / stat.viewSessions;
      const extra = averageRate !== null && averageRate > productRate ? Math.round(stat.viewSessions * averageRate - stat.addSessions) : 0;
      add({
        id: `views-no-adds:${product.id}`, rule: 'views-no-adds', severity: stat.viewSessions >= 50 ? 'high' : 'medium',
        title: `${name} se mira mucho pero casi no se añade`,
        evidence: `${number.format(stat.viewSessions)} sesiones vieron ${name} ${period} y ${stat.addSessions === 0 ? 'ninguna lo añadió' : stat.addSessions === 1 ? 'solo 1 lo añadió' : `solo ${number.format(stat.addSessions)} lo añadieron`} al carrito (${pct(stat.addSessions, stat.viewSessions)} %).`,
        why: [...reasons, ...(averageRate !== null ? [`En tu tienda, el promedio es ${pct(viewAdds, viewSessions)} % (sesiones que añaden por cada sesión que ve un producto).`] : []), 'Se marca desde 20 sesiones de vista con menos de 3 % que lo añade.', ANALYTICS_NOTE],
        impact: extra >= 1 ? `Estimación: si ${name} llegara al promedio de tu tienda (${pct(viewAdds, viewSessions)} %), serían unas ${number.format(extra)} sesiones más con el producto en el carrito, con las mismas visitas.` : null,
        action, weight: stat.viewSessions - stat.addSessions,
      });
    });

  // ── Calls to action that get clicks but no next step.
  for (const cta of report.topCtas) {
    const rule = CTA_FOLLOW[cta.target];
    if (!rule || cta.sessions < 15) continue;
    const follow = report.totals[rule.follow].sessions;
    if (follow / cta.sessions >= 0.25) continue;
    add({
      id: `cta-no-follow:${cta.target}`, rule: 'cta-no-follow', severity: 'medium', title: rule.title,
      evidence: `${number.format(cta.sessions)} sesiones tocaron ${rule.name} ${period}; en todo ese periodo, solo ${plural(follow, 'sesión', 'sesiones')} ${rule.did} (${pct(follow, cta.sessions)} %).`,
      why: ['Compara quienes tocaron el botón con quienes dieron el paso siguiente en toda la tienda, así que entre quienes lo tocaron la cifra es igual o menor.', 'Se marca desde 15 sesiones cuando menos de un cuarto da el paso siguiente.', ANALYTICS_NOTE],
      action: { kind: 'yapi', label: cta.target === 'contact' ? 'Simplificar con YAPI' : 'Arreglar el botón con YAPI', payload: { instruction: CTA_INSTRUCTION[cta.target] } },
      weight: cta.sessions - follow,
    });
  }

  // ── Mobile vs desktop.
  const mobile = input.devices.find(device => device.device === 'mobile');
  const desktop = input.devices.find(device => device.device === 'desktop');
  if (mobile && desktop && mobile.sessions >= 30 && desktop.sessions >= 30) {
    const rateOf = (device: { sessions: number; addSessions: number }) => device.addSessions / device.sessions;
    const [weak, strong] = rateOf(mobile) <= rateOf(desktop) ? [mobile, desktop] : [desktop, mobile];
    if (rateOf(strong) > 0 && rateOf(weak) < rateOf(strong) * 0.6) {
      const phone = weak === mobile;
      const extra = Math.round(weak.sessions * rateOf(strong) - weak.addSessions);
      add({
        id: 'device-gap', rule: 'device-gap', severity: 'medium', title: phone ? 'Tu tienda vende menos en el celular' : 'Tu tienda rinde menos en computadora',
        evidence: `En el celular, ${pct(mobile.addSessions, mobile.sessions)} % de las visitas añade algo al carrito; en computadora, ${pct(desktop.addSessions, desktop.sessions)} % (últimos ${days} días; ${number.format(mobile.sessions)} y ${number.format(desktop.sessions)} visitas).`,
        why: ['Mide cuántas visitas de cada dispositivo añaden algo al carrito.', 'Se marca con al menos 30 visitas en cada uno cuando el más débil queda por debajo del 60 % del otro.', ANALYTICS_NOTE],
        impact: extra >= 1 ? `Estimación: si ${phone ? 'el celular convirtiera como la computadora' : 'la computadora convirtiera como el celular'}, serían unas ${number.format(extra)} sesiones más con carrito en este periodo.` : null,
        action: { kind: 'yapi', label: phone ? 'Mejorar el celular con YAPI' : 'Mejorar la computadora con YAPI', payload: { instruction: phone
          ? `Mejora mi tienda en celular: botones de compra grandes y fáciles de tocar, precio y «Añadir» visibles sin desplazarse, fotos livianas y un menú simple. ${NO_PRICE_CHANGE}`
          : `Mejora mi tienda en computadora: aprovecha el ancho con fotos grandes, precio y botón «Añadir» junto a la foto, y un menú claro. ${NO_PRICE_CHANGE}` } },
        weight: Math.max(extra, 1),
      });
    }
  }

  // ── A referrer that suddenly sends more people (hosts are plain text, G1 contract).
  const before = new Map(input.previousReport.referrers.map(ref => [ref.host, ref.sessions]));
  const surge = report.referrers.filter(ref => ref.host !== 'direct' && ref.sessions >= 20 && ref.sessions >= 2 * (before.get(ref.host) || 0))[0];
  if (surge) {
    const earlier = before.get(surge.host) || 0;
    add({
      id: `referrer-surge:${surge.host}`, rule: 'referrer-surge', severity: 'low', title: `Llegan más visitas desde ${surge.host}`,
      evidence: earlier
        ? `${number.format(surge.sessions)} visitas llegaron desde ${surge.host} ${period}, frente a ${number.format(earlier)} en los ${days} días anteriores.`
        : `${number.format(surge.sessions)} visitas llegaron desde ${surge.host} ${period}; en los ${days} días anteriores no llegó ninguna.`,
      why: ['Un código exclusivo para esa audiencia es una razón concreta para comprar hoy.', 'Se marca desde 20 visitas cuando es al menos el doble que el periodo anterior.', ANALYTICS_NOTE],
      action: { kind: 'promo', label: 'Crear un código para esas visitas', payload: { code: promoCodeForHost(surge.host) } },
      weight: surge.sessions - earlier,
    });
  }

  // ── Products nobody opened although the store had traffic.
  if (visits >= 50) {
    const unseen = input.products.filter(product => product.createdAt < input.periodStart && !(stats.get(product.id)?.viewSessions));
    if (unseen.length) add({
      id: 'never-viewed', rule: 'never-viewed', severity: 'low',
      title: unseen.length === 1 ? `${quoted(unseen[0].name)} no recibió visitas` : `${unseen.length} productos no recibieron visitas`,
      evidence: `${nameList(unseen.map(product => product.name))} no ${unseen.length === 1 ? 'fue visto' : 'fueron vistos'} ni una vez ${period}, aunque tu tienda tuvo ${plural(visits, 'visita', 'visitas')}.`,
      why: ['Si un producto no se ve, no se vende: suele estar lejos de la portada o fuera de las colecciones visibles.', 'Solo cuenta productos publicados antes del periodo, con al menos 50 visitas a la tienda.', ANALYTICS_NOTE],
      action: { kind: 'yapi', label: 'Destacarlos con YAPI', payload: { instruction: `Haz más visibles estos productos en mi tienda: ${nameList(unseen.map(product => product.name))}. Muéstralos en la portada o en una colección destacada, sin cambiar precios ni descripciones.` } },
      weight: unseen.length,
    });
  }

  // ── Sellers about to run out.
  input.products
    .filter(product => (input.unitsSold[product.id] || 0) >= 1 && product.stock !== null && product.stock <= 5)
    .sort((a, b) => (input.unitsSold[b.id] || 0) - (input.unitsSold[a.id] || 0))
    .slice(0, 2)
    .forEach(product => {
      const sold = input.unitsSold[product.id];
      const stock = product.stock!;
      const daysLeft = Math.floor(stock / (sold / days));
      add({
        id: `low-stock:${product.id}`, rule: 'low-stock', severity: stock === 0 ? 'high' : 'medium',
        title: stock === 0 ? `${quoted(product.name)} se agotó y se estaba vendiendo` : `Quedan ${number.format(stock)} de ${quoted(product.name)}`,
        evidence: `Vendiste ${plural(sold, 'unidad', 'unidades')} de ${quoted(product.name)} ${period} y ${stock === 0 ? 'ya no queda stock' : `quedan ${number.format(stock)}`}.`,
        why: ['Un producto agotado deja de venderse aunque lo sigan buscando.', 'Se marca cuando un producto vendido en el periodo tiene 5 unidades o menos.'],
        impact: stock > 0 ? `Estimación: al ritmo de este periodo, se agota ${daysLeft < 1 ? 'en menos de un día' : `en unos ${plural(daysLeft, 'día', 'días')}`}.` : null,
        action: { kind: 'stock', label: 'Reponer stock', payload: { productId: product.id } },
        weight: sold,
      });
    });

  // ── Store Brain gaps.
  const noPhoto = input.products.filter(product => product.photos === 0)
    .sort((a, b) => (stats.get(b.id)?.viewSessions || 0) - (stats.get(a.id)?.viewSessions || 0));
  if (noPhoto.length) add({
    id: 'weak-photos', rule: 'weak-photos', severity: 'medium',
    title: noPhoto.length === 1 ? `${quoted(noPhoto[0].name)} no tiene fotos` : `${noPhoto.length} productos no tienen fotos`,
    evidence: `${nameList(noPhoto.map(product => product.name))} ${noPhoto.length === 1 ? 'no tiene' : 'no tienen'} ninguna foto. Es lo primero que mira quien compra.`,
    why: ['Dato del Store Brain: productos activos sin foto.', 'Empieza por el más visto.'],
    action: { kind: 'product', label: `Agregar fotos a ${quoted(noPhoto[0].name)}`, payload: { productId: noPhoto[0].id, step: 'photos' } },
    weight: noPhoto.length,
  });
  const missing = [!input.store.policies.returns && 'cambios y devoluciones', !input.store.policies.delivery && 'envíos y entregas'].filter(Boolean) as string[];
  if (missing.length && input.products.length) add({
    id: 'missing-policies', rule: 'missing-policies', severity: 'low',
    title: missing.length === 2 ? 'Escribe tus políticas de cambios y envíos' : `Escribe tu política de ${missing[0]}`,
    evidence: `Falta la política de ${missing.join(' y la de ')}. Se muestra junto al botón de compra y da confianza para comprar.`,
    why: ['Dato del Store Brain: políticas vacías.', 'YAPI no inventa condiciones: las escribes tú con las reales.'],
    action: { kind: 'settings', label: 'Escribir mis políticas', payload: { view: 'store-settings', section: 'policies' } },
    weight: missing.length,
  });

  // ── Leads → proposals (D2).
  if (input.leads.inPeriod >= 3) add({
    id: 'leads-to-proposal', rule: 'leads-to-proposal', severity: 'low', title: 'Convierte tus consultas en propuestas',
    evidence: `Recibiste ${plural(input.leads.inPeriod, 'consulta', 'consultas')} ${period}. Con una propuesta en línea, el cliente ve el precio y el plazo y la acepta con un toque.`,
    why: ['Se sugiere desde 3 consultas en el periodo.'],
    action: { kind: 'proposal', label: 'Crear una propuesta', payload: { prompt: `Propuesta para un cliente que escribió a ${input.storeName} pidiendo información: alcance del trabajo, precio, plazo de entrega y condiciones.` } },
    weight: input.leads.inPeriod,
  });

  const rank = (insight: GrowthInsight) => BLOCKERS.includes(insight.rule) ? -1 : SEVERITY_ORDER.indexOf(insight.severity);
  return insights
    .map((insight, index) => ({ insight, index }))
    .sort((a, b) => rank(a.insight) - rank(b.insight) || b.insight.weight - a.insight.weight || a.index - b.index)
    .map(({ insight }) => insight);
}

/** The five to show now: dismissed ones never, snoozed ones until their date. */
export function selectInsights(all: GrowthInsight[], states: InsightState[], now: Date) {
  const hidden = new Set(states.filter(state => state.status === 'dismissed' || (state.status === 'snoozed' && state.until && state.until > now)).map(state => state.insightId));
  const visible = all.filter(insight => !hidden.has(insight.id));
  return { insights: visible.slice(0, INSIGHTS_SHOWN), moreInsights: Math.max(0, visible.length - INSIGHTS_SHOWN), hiddenInsights: all.length - visible.length };
}
