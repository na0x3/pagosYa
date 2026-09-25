/**
 * Crecimiento (G2): pure helpers for the growth panel — number formatting, deltas, chart geometry and the routing of
 * an insight's action to the screen that does it. No DOM here, so node:test covers it.
 */
const COUNT = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const formatCount = (value) => COUNT.format(value || 0);
export const formatPercent = (value) => value === null || value === undefined ? "—" : `${ONE_DECIMAL.format(value)} %`;
export const shortDay = (day) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
export const severityLabel = (severity) => ({ high: "Urgente", medium: "Importante", low: "Oportunidad" })[severity] || "Sugerencia";

/** The chip under a KPI: its text, a tone for colour, and a sentence for screen readers. */
export function formatDelta({ value, previous, delta, format }) {
  const none = { text: "—", tone: "none", label: "Sin datos para comparar" };
  if (format === "percent") {
    if (delta === null || delta === undefined) return none;
    if (delta === 0) return { text: "Igual", tone: "flat", label: "Igual que el periodo anterior" };
    const points = ONE_DECIMAL.format(Math.abs(delta));
    return delta > 0
      ? { text: `+${points} pts`, tone: "up", label: `${points} puntos más que el periodo anterior` }
      : { text: `−${points} pts`, tone: "down", label: `${points} puntos menos que el periodo anterior` };
  }
  if (delta === null || delta === undefined) return !previous && value ? { text: "Nuevo", tone: "new", label: "No hubo en el periodo anterior" } : none;
  if (delta === 0) return { text: "Igual", tone: "flat", label: "Igual que el periodo anterior" };
  const amount = ONE_DECIMAL.format(Math.abs(delta));
  return delta > 0
    ? { text: `+${amount} %`, tone: "up", label: `${amount} % más que el periodo anterior` }
    : { text: `−${amount} %`, tone: "down", label: `${amount} % menos que el periodo anterior` };
}

/**
 * An SVG path through `values`, left to right inside `width × height` with `pad` around it. `sharedMax` puts two
 * series on one scale. An all-zero series is a flat line on the baseline; a single value spans the width.
 */
export function linePath(values, width, height, pad, sharedMax) {
  const max = Math.max(sharedMax || 0, ...values, 0);
  if (!values.length) return { d: "", points: [], max };
  const y = (value) => Math.round((height - pad - (max ? value / max : 0) * (height - 2 * pad)) * 10) / 10;
  const x = (index) => values.length === 1 ? pad : Math.round((pad + index * (width - 2 * pad) / (values.length - 1)) * 10) / 10;
  const points = values.map((value, index) => ({ x: x(index), y: y(value), value }));
  if (values.length === 1) return { d: `M${pad} ${points[0].y} L${width - pad} ${points[0].y}`, points, max };
  return { d: points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" "), points, max };
}

/** A bar's width in percent of the largest; a small non-zero value keeps a visible sliver. */
export function barWidth(value, max) {
  if (!value || !max) return 0;
  return Math.max(2, Math.round(value / max * 100));
}

const PRODUCT_STEPS = ["description", "price", "photos", "stock"];
const SETTINGS_VIEWS = ["store-settings", "workspace", "compliance"];
const SETTINGS_SECTIONS = ["identity", "checkout", "contact", "policies", "locations"];
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : "";

/**
 * Where an insight's button goes and what it fills in. The dashboard opens that view and prefills; nothing is saved,
 * sent or generated until the merchant confirms there. Unknown or malformed actions route nowhere (the card hides the button).
 */
export function actionRoute(action) {
  const payload = action?.payload || {};
  switch (action?.kind) {
    case "yapi": return text(payload.instruction) ? { view: "workspace", compose: text(payload.instruction) } : null;
    case "product": return text(payload.productId) ? { view: "products", productId: text(payload.productId), step: PRODUCT_STEPS.includes(payload.step) ? payload.step : null } : null;
    case "stock": return text(payload.productId) ? { view: "products", productId: text(payload.productId), step: "stock" } : null;
    case "proposal": return { view: "proposals", brief: text(payload.prompt) };
    case "promo": return { view: "discounts", code: /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(payload.code || "") ? payload.code : "" };
    case "settings": return SETTINGS_VIEWS.includes(payload.view) ? { view: payload.view, section: SETTINGS_SECTIONS.includes(payload.section) ? payload.section : null } : null;
    case "inbox": return { view: "inbox" };
    default: return null;
  }
}
