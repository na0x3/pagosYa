import { escapeHtml as esc } from "./html.mjs";

/**
 * The store's mascots (owner 2026-11-16, «little mascots to give a resume of the store»; spec 2026-11-16-store-mascots-design.md):
 * YAPI's star family — four small stars in the Clyro wash colours, one per topic — telling the store's news in real numbers and
 * friendly words. Built from what Inicio already loads (finances, low stock, setup steps): no API, no AI, no credits. Amounts go
 * through the panel's money(), so «Ocultar montos» hides them here too.
 */
const COLOURS = { sales: "#bfe5cf", orders: "#f6c9ae", visits: "#cfd3f2", stock: "#f3d9a6" };
const INK = "#17191c";
const STAR = "32,8 39.6,23.5 56.7,26 44.4,38 47.3,55 32,47 16.7,55 19.6,38 7.3,26 24.4,23.5";
const FACES = {
  happy: `<ellipse cx="27" cy="31" rx="2.2" ry="3.2" fill="${INK}"/><ellipse cx="37" cy="31" rx="2.2" ry="3.2" fill="${INK}"/>`
    + `<circle cx="22.5" cy="37" r="2.6" fill="#f29c8f" opacity=".45"/><circle cx="41.5" cy="37" r="2.6" fill="#f29c8f" opacity=".45"/>`
    + `<path d="M28 37.5 Q32 41.5 36 37.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  sleepy: `<path d="M24.5 31.5 Q27 34 29.5 31.5 M34.5 31.5 Q37 34 39.5 31.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
    + `<circle cx="32" cy="38.5" r="1.4" fill="${INK}"/><text x="45" y="20" font-size="9" font-weight="700" fill="${INK}" opacity=".55">z</text>`,
  worried: `<ellipse cx="27" cy="31.5" rx="2.2" ry="3" fill="${INK}"/><ellipse cx="37" cy="31.5" rx="2.2" ry="3" fill="${INK}"/>`
    + `<path d="M24 26.5 L29 25 M40 26.5 L35 25" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
    + `<path d="M28 39 Q30 37.4 32 39 Q34 40.6 36 39" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
};

/** One mascot: a rounded star in its colour with the mood's face. @param {string} kind @param {"happy"|"sleepy"|"worried"} mood */
export function mascotSvg(kind, mood) {
  const colour = COLOURS[kind] || COLOURS.sales;
  return `<svg class="mascot mascot--${kind} is-${mood}" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">`
    + `<polygon points="${STAR}" fill="${colour}" stroke="${colour}" stroke-width="7" stroke-linejoin="round"/>`
    + `<polygon points="${STAR}" fill="none" stroke="${INK}" stroke-opacity=".12" stroke-width="1" stroke-linejoin="round" transform="translate(0 .5)"/>`
    + (FACES[mood] || FACES.happy) + `</svg>`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {{ finances: any, money: (cents: number) => string, lowStock?: Array<{ name: string }>, steps?: Array<{ label: string, done: boolean, view: string }> }} input
 * @returns {Array<{ kind: string, mood: "happy"|"sleepy"|"worried", text: string, label: string, view: string }>}
 */
export function storeSummary({ finances, money, lowStock = [], steps = [] }) {
  if (!finances) return [];
  const month = Number(finances.monthlyProjection?.monthToDateRevenue) || 0;
  const payments = Number(finances.paymentCount) || 0;
  const views = Number(finances.totalStoreViews) || 0;
  const items = [
    month > 0
      ? { kind: "sales", mood: "happy", text: `Este mes vendiste ${money(month)}.`, label: "Ver tu dinero", view: "payouts" }
      : { kind: "sales", mood: "sleepy", text: "Aún no hay ventas este mes. Comparte tu tienda para recibir la primera.", label: "Cobrar", view: "charge-links" },
    payments > 0
      ? { kind: "orders", mood: "happy", text: `${plural(payments, "pago exitoso", "pagos exitosos")} desde que empezaste.`, label: "Ver pedidos", view: "payments" }
      : { kind: "orders", mood: "sleepy", text: "Tu primer pago aparecerá aquí.", label: "Ver pedidos", view: "payments" },
    views > 0
      ? { kind: "visits", mood: "happy", text: `${plural(views, "visita", "visitas")} a tu tienda.`, label: "Atraer clientes", view: "marketing" }
      : { kind: "visits", mood: "sleepy", text: "Nadie visitó tu tienda todavía.", label: "Atraer clientes", view: "marketing" },
  ];
  const next = steps.find((step) => !step.done);
  if (lowStock.length) items.push({ kind: "stock", mood: "worried", text: `${plural(lowStock.length, "producto casi agotado", "productos casi agotados")}: ${lowStock[0].name}.`, label: "Reponer", view: "products" });
  else if (next) items.push({ kind: "stock", mood: "worried", text: `Te falta: ${next.label}.`, label: "Hacerlo ahora", view: next.view });
  else items.push({ kind: "stock", mood: "happy", text: "Todo al día: nada por reponer.", label: "Ver productos", view: "products" });
  return items;
}

/** Inicio: one glass card per mascot (the <li>s of #overviewMascots). */
export function renderMascotCards(items) {
  return items.map((item) => `<li class="mascot-card mascot-card--${item.kind}">${mascotSvg(item.kind, item.mood)}`
    + `<p class="mascot-text">${esc(item.text)}</p>`
    + `<a class="mascot-link" href="#dashboard-${esc(item.view)}" data-dashboard-view="${esc(item.view)}">${esc(item.label)}</a></li>`).join("");
}

const PRIORITY = { worried: 0, happy: 1, sleepy: 2 };

/** YAPI's welcome: up to `max` speech bubbles, what needs the merchant first, then good news, then the quiet ones. */
export function renderMascotBubbles(items, max = 3) {
  return [...items].sort((a, b) => PRIORITY[a.mood] - PRIORITY[b.mood]).slice(0, max)
    .map((item, index) => `<div class="mascot-bubble mascot-bubble--${item.kind}" style="--i:${index}">${mascotSvg(item.kind, item.mood)}<p>${esc(item.text)}</p></div>`).join("");
}
