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

/**
 * What the list and the detail flag about a cobro's payment (from the API's `payment` flags):
 * a test-mode payment, and payments the merchant has to refund or reconcile.
 * @param {{ status: string, payment?: { testMode?: boolean, manual?: boolean, afterClose?: boolean, mismatch?: boolean } }} doc
 * @returns {{ label: string, tone: "warning" | "test" } | null}
 */
export function paymentBadge(doc) {
  const payment = doc.payment || {};
  if (payment.afterClose) return { label: doc.status === "VOIDED" ? "Pago recibido tras anular — reembolsar" : "Pago repetido — reembolsar", tone: "warning" };
  if (payment.mismatch) return { label: "Pago de otra versión — revisar", tone: "warning" };
  if (payment.testMode && doc.status === "PAID") return { label: "Pago de prueba", tone: "test" };
  return null;
}

export const PAYMENT_METHOD_LABEL = { cash: "efectivo", transfer: "transferencia", other: "otro medio" };

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
      case "payment_after_close": entry = ["Llegó un pago con el cobro ya cerrado (anulado o ya pagado): reembólsalo", "warning"]; break;
      case "payment_mismatch": entry = ["Llegó un pago por otra versión o monto del cobro: revísalo y reembolsa si corresponde", "warning"]; break;
      case "paid_manually": {
        const method = PAYMENT_METHOD_LABEL[/** @type {"cash" | "transfer" | "other"} */ (data.method)];
        entry = [["Marcado como pagado", method, data.reference].filter(Boolean).join(" · "), "good"];
        break;
      }
      case "reminders_off": entry = ["Recordatorios automáticos apagados", "neutral"]; break;
      case "reminders_on": entry = ["Recordatorios automáticos encendidos", "neutral"]; break;
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
 * @typedef {{ description: string, quantity: number, unitAmount: number | null, priceText?: string, paymentLinkId?: string | null }} DraftItem
 * @typedef {{ customer: { name: string, email?: string, phone?: string, document?: string, businessCustomerId?: string | null }, items: DraftItem[], dueAt?: string | null, note?: string, autoReminders?: boolean }} CobroDraft
 */

/** A line the cobro charges: it has both a description and a price. @param {DraftItem} item */
const isChargedLine = (item) => Boolean(item.description.trim()) && (item.unitAmount ?? 0) > 0;
/** @param {DraftItem} item */
const lineQuantity = (item) => Math.max(1, Math.round(item.quantity || 1));

/**
 * The inline error of one line, or null. A blank line is ignored; a half-filled one never is.
 * @param {DraftItem} item
 */
export function lineProblem(item) {
  const described = Boolean(item.description.trim());
  const typedPrice = Boolean(String(item.priceText ?? "").trim());
  const priced = (item.unitAmount ?? 0) > 0;
  if (!described && !priced && !typedPrice) return null;
  if (described && !priced) return typedPrice && item.unitAmount == null ? "Revisa el precio: escribe solo el número, por ejemplo 150,50." : "Falta el precio de esta línea.";
  if (!described) return "Falta la descripción de esta línea.";
  return null;
}

/** The live total: exactly the lines buildCobroPayload sends. @param {DraftItem[]} items */
export function cobroTotal(items) {
  return items.filter(isChargedLine).reduce((sum, item) => sum + /** @type {number} */ (item.unitAmount) * lineQuantity(item), 0);
}

/**
 * Contact fields are always sent — a cleared one as null — because an omitted field is filled
 * from the CRM row the customer was picked from, and a cleared one must stay cleared.
 * @param {CobroDraft} draft
 */
export function buildCobroPayload(draft) {
  const items = draft.items
    .filter(isChargedLine)
    .map((item) => ({
      description: item.description.trim(),
      quantity: lineQuantity(item),
      unitAmount: /** @type {number} */ (item.unitAmount),
      ...(item.paymentLinkId ? { paymentLinkId: item.paymentLinkId } : {}),
    }));
  const note = draft.note?.trim();
  return {
    kind: "INVOICE",
    title: cobroTitle(items),
    ...(draft.customer.businessCustomerId ? { businessCustomerId: draft.customer.businessCustomerId } : {}),
    customerName: draft.customer.name.trim(),
    customerEmail: draft.customer.email?.trim().toLowerCase() || null,
    customerPhone: draft.customer.phone?.trim() || null,
    customerDocument: draft.customer.document?.trim() || null,
    items,
    ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
    autoReminders: draft.autoReminders !== false,
    content: note ? [{ type: "paragraph", text: note }] : [],
  };
}

/** @param {CobroDraft} draft @param {Date} [now] */
export function validateCobroDraft(draft, now = new Date()) {
  const problems = [];
  if (!draft.customer.name?.trim()) problems.push("¿A quién le cobras? Escribe su nombre.");
  const email = draft.customer.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("Revisa el correo del cliente.");
  if (draft.items.some((item) => lineProblem(item))) problems.push("Revisa las líneas marcadas: cada una necesita descripción y precio.");
  else if (!draft.items.some(isChargedLine)) problems.push("Agrega al menos un producto o servicio con precio.");
  if (draft.dueAt && new Date(draft.dueAt).getTime() < now.getTime()) problems.push("La fecha de vencimiento ya pasó. Elige hoy o una fecha futura.");
  return problems;
}
