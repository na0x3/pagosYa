// Pure helpers for the Cobros view (D1): money, due dates, status, WhatsApp text
// and the timeline copy. No DOM here, so node --test covers every rule.

const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000; // Bolivia is UTC-4 all year.
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Centavos from what a merchant types: "150", "150,50", "1.250,00", "1,250.00", "Bs 45,90".
 * The last separator followed by one or two digits is the decimal one.
 * @param {unknown} text
 * @returns {number | null}
 */
export function parseMoney(text) {
  const raw = String(text ?? "").trim();
  if (!raw || raw.includes("-")) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const decimal = /[.,](\d{1,2})$/.exec(cleaned);
  const integerPart = decimal ? cleaned.slice(0, decimal.index) : cleaned;
  // Thousands groups must be groups of three.
  if (/[.,]/.test(integerPart) && !/^\d{1,3}([.,]\d{3})+$/.test(integerPart)) return null;
  const units = Number(integerPart.replace(/[.,]/g, "") || "0");
  const cents = decimal ? Number(decimal[1].padEnd(2, "0")) : 0;
  const value = units * 100 + cents;
  return Number.isSafeInteger(value) ? value : null;
}

/** @param {number} amount centavos @param {string} [currency] */
export function formatMoney(amount, currency = "BOB") {
  const figure = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((amount || 0) / 100);
  return `${currency === "USD" ? "US$" : "Bs"} ${figure}`;
}

/** @param {Date} date */
function laPazDay(date) {
  const shifted = new Date(date.getTime() - LA_PAZ_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** 23:59:59 in La Paz of the given UTC-midnight day, as ISO. @param {number} dayUtc */
const endOfLaPazDay = (dayUtc) => new Date(dayUtc + DAY_MS - 1000 + LA_PAZ_OFFSET_MS).toISOString();

/** @param {number} days @param {Date} [now] */
export function dueDateFromPreset(days, now = new Date()) {
  return endOfLaPazDay(laPazDay(now) + days * DAY_MS);
}

/** From an <input type="date"> value. @param {string} value */
export function dueDateFromInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  return endOfLaPazDay(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** The <input type="date"> value for an ISO due date. @param {string | null} iso */
export function dueDateInputValue(iso) {
  if (!iso) return "";
  return new Date(laPazDay(new Date(iso))).toISOString().slice(0, 10);
}

/**
 * @typedef {{ id?: string, status: string, totalAmount: number, currency?: string, dueAt: string | null, paidAt?: string | null }} CobroRow
 * @param {CobroRow} doc @param {Date} [now]
 * @returns {"draft" | "open" | "overdue" | "paid" | "voided" | "closed"}
 */
export function cobroState(doc, now = new Date()) {
  if (doc.status === "DRAFT") return "draft";
  if (doc.status === "PAID") return "paid";
  if (doc.status === "VOIDED") return "voided";
  if (["EXPIRED", "DECLINED", "ACCEPTED", "SIGNED"].includes(doc.status)) return "closed";
  if (doc.status === "OVERDUE") return "overdue";
  // The worker marks overdue every 15 minutes; the list does not wait for it.
  if (doc.dueAt && new Date(doc.dueAt).getTime() < now.getTime()) return "overdue";
  return "open";
}

export const STATE_LABEL = { draft: "Borrador", open: "Por cobrar", overdue: "Vencido", paid: "Pagado", voided: "Anulado", closed: "Cerrado" };

/** @param {CobroRow[]} list @param {"all" | "open" | "overdue" | "paid"} filter @param {Date} [now] */
export function filterCobros(list, filter, now = new Date()) {
  if (filter === "all") return list;
  return list.filter((doc) => {
    const state = cobroState(doc, now);
    if (filter === "open") return state === "open" || state === "overdue";
    return state === filter;
  });
}

/** @param {CobroRow[]} list @param {Date} [now] */
export function cobroCounts(list, now = new Date()) {
  return {
    all: list.length,
    open: filterCobros(list, "open", now).length,
    overdue: filterCobros(list, "overdue", now).length,
    paid: filterCobros(list, "paid", now).length,
  };
}

/**
 * Bolivianos only (a USD cobro is rare and would mix currencies); collected = paid in the last 30 days.
 * @param {CobroRow[]} list @param {Date} [now]
 */
export function cobroSummary(list, now = new Date()) {
  const bob = list.filter((doc) => (doc.currency || "BOB") === "BOB");
  const sum = (/** @type {CobroRow[]} */ rows) => rows.reduce((total, doc) => total + (doc.totalAmount || 0), 0);
  const since = now.getTime() - 30 * DAY_MS;
  return {
    owed: sum(filterCobros(bob, "open", now)),
    overdue: sum(filterCobros(bob, "overdue", now)),
    collected: sum(bob.filter((doc) => doc.status === "PAID" && doc.paidAt && new Date(doc.paidAt).getTime() >= since)),
  };
}

/** @param {string} iso */
export function shortDate(iso) {
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", timeZone: "America/La_Paz" }).format(new Date(iso)).replace(/\.$/, "");
}

/** @param {string} iso */
export function longDate(iso) {
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(new Date(iso));
}

/** @param {CobroRow} doc @param {Date} [now] */
export function dueLine(doc, now = new Date()) {
  const state = cobroState(doc, now);
  if (state === "paid") return doc.paidAt ? `Pagado el ${shortDate(doc.paidAt)}` : "Pagado";
  if (state === "voided") return "Anulado";
  if (state === "draft") return "Borrador sin enviar";
  if (!doc.dueAt) return "Sin fecha de vencimiento";
  const days = Math.round((laPazDay(new Date(doc.dueAt)) - laPazDay(now)) / DAY_MS);
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days > 1) return `Vence en ${days} días`;
  if (days === -1) return "Venció ayer";
  return `Venció hace ${-days} días`;
}

/**
 * @param {{ customerName: string | null, storeName: string, numberLabel: string, total: number, currency?: string, dueAt: string | null, url: string, reminder?: boolean }} input
 */
export function whatsAppMessage(input) {
  const firstName = input.customerName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}` : "Hola";
  const verb = input.reminder ? "te recuerdo" : "te comparto";
  const due = input.dueAt ? ` (vence el ${shortDate(input.dueAt)})` : "";
  return `${greeting}, ${verb} el cobro ${input.numberLabel} de ${input.storeName} por ${formatMoney(input.total, input.currency)}${due}. Puedes verlo y pagarlo con QR o tarjeta aquí: ${input.url}`;
}

/**
 * wa.me with the customer's number when there is one (an 8-digit Bolivian mobile gets 591).
 * @param {string | null | undefined} phone @param {string} text
 */
export function whatsAppShareUrl(phone, text) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (/^[67]\d{7}$/.test(digits)) digits = `591${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const STAGE = { due: "día de vencimiento", overdue: "3 días después de vencer", manual: "" };

/**
 * @param {Array<{ id: string, type: string, at: string, version?: number | null, data?: any }>} events
 * @returns {Array<{ id: string, at: string, label: string, tone: "good" | "warning" | "bad" | "neutral" }>}
 */
export function timelineEntries(events) {
  /** @type {Array<{ id: string, at: string, label: string, tone: "good" | "warning" | "bad" | "neutral" }>} */
  const entries = [];
  for (const event of events) {
    const data = event.data || {};
    /** @type {[string, "good" | "warning" | "bad" | "neutral"] | null} */
    let entry = null;
    switch (event.type) {
      case "created": entry = ["Creaste el cobro", "neutral"]; break;
      case "sent": entry = [data.resend ? "Reenviado" : (event.version || 1) > 1 ? `Actualizado (versión ${event.version})` : "Cobro listo para compartir", "neutral"]; break;
      case "shared": entry = [data.channel === "whatsapp" ? "Compartido por WhatsApp" : "Enlace copiado", "neutral"]; break;
      case "emailed": entry = [`Correo enviado a ${data.to || "tu cliente"}`, "neutral"]; break;
      case "email_failed": entry = ["No se pudo enviar el correo", "bad"]; break;
      case "viewed": entry = ["Tu cliente lo abrió", "neutral"]; break;
      case "reminded":
        entry = [data.channel === "whatsapp"
          ? "Recordatorio por WhatsApp"
          : data.automatic ? `Recordatorio automático por correo${STAGE[/** @type {"due" | "overdue" | "manual"} */ (data.stage)] ? ` (${STAGE[/** @type {"due" | "overdue"} */ (data.stage)]})` : ""}` : "Recordatorio por correo", "neutral"];
        break;
      case "checkout_started": entry = ["Tu cliente empezó a pagar", "neutral"]; break;
      case "paid": entry = [data.livemode === false ? "Pagado · pago de prueba" : "Pagado", "good"]; break;
      case "payment_after_close": entry = ["Llegó un pago con el cobro ya cerrado: revísalo y reembolsa si corresponde", "warning"]; break;
      case "overdue": entry = ["Venció sin pago", "warning"]; break;
      case "voided": entry = [data.reason ? `Anulado: ${data.reason}` : "Anulado", "bad"]; break;
      default: entry = null;
    }
    if (entry) entries.push({ id: event.id, at: event.at, label: entry[0], tone: entry[1] });
  }
  return entries;
}

/** @param {Array<{ description: string }>} items */
export function cobroTitle(items) {
  const named = items.map((item) => item.description.trim()).filter(Boolean);
  if (!named.length) return "Cobro";
  const first = named[0].slice(0, 160);
  return named.length > 1 ? `${first} y ${named.length - 1} más` : first;
}

/**
 * @typedef {{ description: string, quantity: number, unitAmount: number | null, paymentLinkId?: string | null }} DraftItem
 * @typedef {{ customer: { name: string, email?: string, phone?: string, businessCustomerId?: string | null }, items: DraftItem[], dueAt?: string | null, note?: string, autoReminders?: boolean }} CobroDraft
 * @param {CobroDraft} draft
 */
export function buildCobroPayload(draft) {
  const items = draft.items
    .filter((item) => item.description.trim() && (item.unitAmount ?? 0) > 0)
    .map((item) => ({
      description: item.description.trim(),
      quantity: Math.max(1, Math.round(item.quantity || 1)),
      unitAmount: /** @type {number} */ (item.unitAmount),
      ...(item.paymentLinkId ? { paymentLinkId: item.paymentLinkId } : {}),
    }));
  const note = draft.note?.trim();
  return {
    kind: "INVOICE",
    title: cobroTitle(items),
    ...(draft.customer.businessCustomerId ? { businessCustomerId: draft.customer.businessCustomerId } : {}),
    customerName: draft.customer.name.trim(),
    customerEmail: draft.customer.email?.trim().toLowerCase() || "",
    customerPhone: draft.customer.phone?.trim() || "",
    items,
    ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
    autoReminders: draft.autoReminders !== false,
    content: note ? [{ type: "paragraph", text: note }] : [],
  };
}

/** @param {CobroDraft} draft */
export function validateCobroDraft(draft) {
  const problems = [];
  if (!draft.customer.name?.trim()) problems.push("¿A quién le cobras? Escribe su nombre.");
  const email = draft.customer.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("Revisa el correo del cliente.");
  if (!draft.items.some((item) => item.description.trim() && (item.unitAmount ?? 0) > 0)) problems.push("Agrega al menos un producto o servicio con precio.");
  return problems;
}
