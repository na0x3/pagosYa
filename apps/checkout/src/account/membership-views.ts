import type { StoreItem } from "../api";
import { escapeHtml, formatAmount } from "../ui/html";
import type { MemberView } from "./account-api";

/** Membership pages of a shopper's account (spec 2026-10-09 §2). Pure markup; account-page.ts owns events. */
const CONSENT = "Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.";
const LABEL: Record<number, string> = { 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const label = (months: number) => LABEL[months] ?? `Cada ${months} meses`;
const SUFFIX: Record<number, string> = { 1: "/ mes", 3: "/ 3 meses", 6: "/ 6 meses", 12: "/ año" };
type Context = { slug: string; storeName: string; signedIn: boolean; preview?: boolean };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" }) : "");
const joinPath = (slug: string, productId: string, periodId: string) => `/cuenta/${encodeURIComponent(slug)}/unirme?producto=${encodeURIComponent(productId)}&periodo=${encodeURIComponent(periodId)}`;
const JOIN_QUERY = /^\?producto=[\w-]{1,40}&periodo=[\w-]{1,40}$/;
const ID = /^[\w-]{1,40}$/;
const JOIN_TTL_MS = 60 * 60 * 1000;
const key = (slug: string) => `pagosya:join:${slug}`;

/** Kept in localStorage (not sessionStorage): the confirmation email opens in a new tab. */
export function rememberJoin(slug: string, search: string) {
  const params = new URLSearchParams(search);
  const product = params.get("producto") ?? "", period = params.get("periodo") ?? "";
  if (!ID.test(product) || !ID.test(period)) return;
  try { localStorage.setItem(key(slug), JSON.stringify({ query: `?producto=${encodeURIComponent(product)}&periodo=${encodeURIComponent(period)}`, at: Date.now() })); } catch {}
}
export function takePendingJoin(slug: string): string | null {
  try {
    const raw = localStorage.getItem(key(slug));
    localStorage.removeItem(key(slug));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { query?: unknown; at?: unknown };
    if (typeof saved.query !== "string" || typeof saved.at !== "number") return null;
    if (Date.now() - saved.at > JOIN_TTL_MS || saved.at > Date.now() + 60_000) return null;
    return JOIN_QUERY.test(saved.query) ? saved.query : null;
  } catch { return null; }
}

export function joinHtml(context: Context, product: StoreItem, periodId: string, error = ""): string {
  const periods = product.membershipPeriods ?? [];
  const chosen = periods.some(period => period.id === periodId) ? periodId : periods[0]?.id;
  return `<h1>Hazte miembro</h1><section class="card"><h2>${escapeHtml(product.name)}</h2>
    <form data-form="join" data-product="${escapeHtml(product.id)}" novalidate><fieldset><legend>Período</legend>${periods.map(period => `<label><input type="radio" name="periodId" value="${escapeHtml(period.id)}"${period.id === chosen ? " checked" : ""}> ${escapeHtml(label(period.months))} · <strong>${escapeHtml(formatAmount(period.amount, product.currency))}</strong></label>`).join("")}</fieldset>
    <label><input type="checkbox" name="consent" required> ${escapeHtml(CONSENT)}</label>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ""}<button type="submit" class="primary">Pagar y hacerme miembro</button></form></section>`;
}

export function alreadyMemberHtml(context: Context, message: string): string {
  return `<h1>Ya eres miembro</h1><p>${escapeHtml(message)}</p><p><a class="primary" href="/cuenta/${encodeURIComponent(context.slug)}/membresias">Ver mis membresías</a></p>`;
}

export function membershipsHtml(context: Context, rows: MemberView[]): string {
  if (!rows.length) return `<h1>Mis membresías</h1><p>Aún no eres miembro en esta tienda.</p>`;
  const item = (row: MemberView) => {
    const actions: string[] = [];
    if (row.renewalUrl) actions.push(`<a class="primary" href="${escapeHtml(row.renewalUrl)}">Pagar renovación</a>`);
    if (row.state === "ACTIVE" || row.state === "GRACE") {
      if (row.periods.length > 1) actions.push(`<label>Cambiar período<select data-member-period data-id="${escapeHtml(row.id)}">${row.periods.map(period => `<option value="${escapeHtml(period.id)}"${period.id === (row.pendingPeriod ?? row.period)?.id ? " selected" : ""}>${escapeHtml(period.label)} · ${escapeHtml(formatAmount(period.amount, row.currency))}</option>`).join("")}</select></label>`);
      actions.push(`<button type="button" class="quiet" data-member-action="cancel" data-id="${escapeHtml(row.id)}">Cancelar</button>`);
    }
    if (row.state === "CANCELED_ACTIVE") actions.push(`<button type="button" data-member-action="resume" data-id="${escapeHtml(row.id)}">Reanudar</button>`);
    if ((row.state === "LAPSED" || row.state === "CANCELED") && row.period) actions.push(`<a class="primary" href="${escapeHtml(joinPath(context.slug, row.productId, row.period.id))}">Reactivar</a>`);
    const until = row.accessUntil && row.state !== "CANCELED" && row.state !== "LAPSED" ? ` · Activa hasta ${escapeHtml(day(row.accessUntil))}` : "";
    const next = row.nextBillingAt && row.state === "ACTIVE" ? ` · próximo cobro ${escapeHtml(day(row.nextBillingAt))}` : "";
    return `<li class="card"><strong>${escapeHtml(row.name)}</strong> · <span class="badge">${escapeHtml(row.stateLabel)}</span>
      <p>${row.period ? `${escapeHtml(row.period.label)} · ${escapeHtml(formatAmount(row.amount, row.currency))}` : ""}${until}${next}</p>
      ${row.pendingPeriod ? `<p class="faint">Desde la próxima renovación: ${escapeHtml(row.pendingPeriod.label)}.</p>` : ""}
      <div class="account__actions">${actions.join("")}</div></li>`;
  };
  return `<h1>Mis membresías</h1><ul class="account__list">${rows.map(item).join("")}</ul><p class="faint">${escapeHtml(CONSENT)}</p>`;
}

/** Card price for a membership: the cheapest period, read as recurring ("Desde 50.00 BOB / mes"). */
export function membershipFromPrice(product: StoreItem): string {
  const periods = product.membershipPeriods ?? [];
  if (!periods.length) return "";
  const cheapest = periods.reduce((best, period) => (period.amount < best.amount ? period : best));
  return `Desde ${formatAmount(cheapest.amount, product.currency)} ${SUFFIX[cheapest.months] ?? `/ ${cheapest.months} meses`}`;
}

export function membershipPurchaseHtml(slug: string, product: StoreItem): string {
  const periods = product.membershipPeriods ?? [];
  if (!periods.length) return "";
  return `<form class="product-detail-purchase" data-membership-purchase action="/cuenta/${encodeURIComponent(slug)}/unirme" method="get"><input type="hidden" name="producto" value="${escapeHtml(product.id)}"><fieldset class="membership-periods"><legend>Elige tu período</legend>${periods.map((period, index) => `<label><input type="radio" name="periodo" value="${escapeHtml(period.id)}"${index ? "" : " checked"}><span>${escapeHtml(label(period.months))}</span><strong>${escapeHtml(formatAmount(period.amount, product.currency))}</strong></label>`).join("")}</fieldset><button type="submit" class="primary">Hacerme miembro</button><p class="faint">${escapeHtml(CONSENT)}</p></form>`;
}
