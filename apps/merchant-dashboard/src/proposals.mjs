// Pure helpers for the Propuestas view (D2): status chips, the editor's items and
// pending data, validity, the save payload, the timeline and the WhatsApp text.
// No DOM here, so node --test covers every rule.
import { formatMoney, shortDate } from "./cobros.mjs";

const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PRICE_MARKER = "{{precio}}";
/** A price YAPI read from the merchant's own words: shown, but the send waits for a confirm tap. */
export const CONFIRM_MARKER = "{{confirmar precio}}";
const PLACEHOLDER = /\{\{[^{}]{1,80}\}\}/g;

/** The three example prompts of the first-run guide. */
export const EXAMPLE_PROMPTS = [
  { label: "Logo para una cafetería", brief: "Diseño de logo e identidad para una cafetería que abre en noviembre: logo, paleta de colores, tipografías y tarjetas de presentación.", tone: "cercano" },
  { label: "Mantenimiento de jardín", brief: "Mantenimiento mensual de jardín para una casa con 200 m² de área verde: poda, riego, abono y limpieza, dos visitas por semana.", tone: "formal" },
  { label: "Catering para 50 personas", brief: "Catering para 50 personas en un evento de empresa: bocaditos salados y dulces, bebidas y personal de servicio durante 4 horas.", tone: "formal" },
];

/** The nine sections of an AI draft, empty: "Empezar sin IA". */
export function blankProposalBlocks() {
  return [
    { type: "paragraph", title: "Introducción", text: "" },
    { type: "paragraph", title: "Entendimiento del problema", text: "" },
    { type: "list", title: "Alcance", items: [] },
    { type: "list", title: "Entregables", items: [] },
    { type: "list", title: "Cronograma", items: [] },
    { type: "paragraph", title: "Inversión", text: "" },
    { type: "clause", title: "Condiciones de pago", text: "" },
    { type: "clause", title: "Revisiones", text: "" },
    { type: "paragraph", title: "Próximo paso", text: "" },
  ];
}

export const PROPOSAL_STATE_LABEL = {
  draft: "Borrador",
  sent: "Enviada",
  viewed: "Vista",
  changes: "Cambios pedidos",
  accepted: "Aceptada",
  expired: "Vencida",
  voided: "Anulada",
};

/** @param {Date} date */
const laPazDay = (date) => {
  const shifted = new Date(date.getTime() - LA_PAZ_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
};

/**
 * @param {{ status: string, validUntil?: string | null }} doc @param {Date} [now]
 * @returns {"draft" | "sent" | "viewed" | "changes" | "accepted" | "expired" | "voided"}
 */
export function proposalState(doc, now = new Date()) {
  if (doc.status === "DRAFT") return "draft";
  if (doc.status === "ACCEPTED") return "accepted";
  if (doc.status === "VOIDED") return "voided";
  if (["EXPIRED", "DECLINED"].includes(doc.status)) return "expired";
  // Past its validity it is closed at once; the worker catches up within 15 minutes.
  if (doc.validUntil && new Date(doc.validUntil).getTime() < now.getTime()) return "expired";
  if (doc.status === "CHANGES_REQUESTED") return "changes";
  if (doc.status === "VIEWED") return "viewed";
  return "sent";
}

/** @param {{ status: string, validUntil?: string | null }} doc @param {Date} [now] */
export function validityLine(doc, now = new Date()) {
  if (!doc.validUntil) return "";
  const state = proposalState(doc, now);
  if (state === "expired") return `Venció el ${shortDate(doc.validUntil)}`;
  if (["accepted", "voided"].includes(state)) return "";
  const days = Math.round((laPazDay(new Date(doc.validUntil)) - laPazDay(now)) / DAY_MS);
  if (days <= 0) return "Vence hoy";
  return `Válida hasta el ${shortDate(doc.validUntil)} · ${days === 1 ? "queda 1 día" : `quedan ${days} días`}`;
}

const stripMarker = (text) => String(text || "").replace(/\s*\{\{(?:precio|confirmar precio)\}\}\s*/g, " ").trim();
const priceText = (amount) => formatMoney(amount).replace(/^Bs\s/, "");

/**
 * Server items → editor lines. A {{precio}} line shows an empty, flagged price field.
 * @param {Array<{ description: string, quantity: number, unitAmount: number, paymentLinkId?: string | null }>} items
 */
export function editorItems(items) {
  return (items || []).map((item) => {
    const needsPrice = !(item.unitAmount > 0) || String(item.description).includes(PRICE_MARKER);
    return {
      description: stripMarker(item.description),
      quantity: item.quantity || 1,
      unitAmount: needsPrice ? null : item.unitAmount,
      priceText: needsPrice ? "" : priceText(item.unitAmount),
      paymentLinkId: item.paymentLinkId ?? null,
      needsPrice,
      needsConfirm: !needsPrice && String(item.description).includes(CONFIRM_MARKER),
    };
  });
}

/** @typedef {{ description: string, quantity: number, unitAmount: number | null, priceText?: string, paymentLinkId?: string | null, needsPrice?: boolean, needsConfirm?: boolean }} EditorItem */

/**
 * A line with a description and no price is sent with the {{precio}} marker, and a price taken from
 * the merchant's words keeps {{confirmar precio}} until confirmed: both block the send. @param {EditorItem[]} items
 */
export function proposalItemsPayload(items) {
  return items
    .filter((item) => item.description.trim() || (item.unitAmount ?? 0) > 0)
    .map((item) => {
      const priced = (item.unitAmount ?? 0) > 0;
      const description = stripMarker(item.description) || "Ítem";
      return {
        description: !priced ? `${description} ${PRICE_MARKER}` : item.needsConfirm ? `${description} ${CONFIRM_MARKER}` : description,
        quantity: Math.min(100000, Math.max(1, Math.round(item.quantity || 1))),
        unitAmount: priced ? /** @type {number} */ (item.unitAmount) : 0,
        ...(item.paymentLinkId ? { paymentLinkId: item.paymentLinkId } : {}),
      };
    });
}

/** @param {EditorItem[]} items */
export function proposalTotal(items) {
  return items.reduce((sum, item) => sum + ((item.unitAmount ?? 0) > 0 ? /** @type {number} */ (item.unitAmount) * Math.max(1, Math.round(item.quantity || 1)) : 0), 0);
}

/** @param {unknown} text */
const tokens = (text) => String(text || "").match(PLACEHOLDER) || [];

/**
 * Every {{dato}} still to fill, with where it is — the send button stays off until it is empty.
 * @param {{ title: string, customer: { name?: string, email?: string, phone?: string }, items: EditorItem[], blocks: Array<{ type: string, title?: string, text?: string, items?: string[] }> }} draft
 * @returns {Array<{ where: string, label: string, token: string }>}
 */
export function pendingData(draft) {
  /** @type {Array<{ where: string, label: string, token: string }>} */
  const found = [];
  const add = (where, label, token) => { if (!found.some((row) => row.where === where && row.token === token)) found.push({ where, label, token }); };
  tokens(draft.title).forEach((token) => add("title", "Título", token));
  for (const value of Object.values(draft.customer || {})) tokens(value).forEach((token) => add("customer", "Cliente", token));
  draft.items.forEach((item, index) => {
    const name = stripMarker(item.description);
    if (name && !((item.unitAmount ?? 0) > 0)) add(`item:${index}`, `Precio de «${name}»`, PRICE_MARKER);
    else if (item.needsConfirm) add(`item:${index}`, `Confirma el precio de «${name || "Ítem"}»`, CONFIRM_MARKER);
    tokens(stripMarker(item.description)).forEach((token) => add(`item:${index}`, `«${name}»`, token));
  });
  draft.blocks.forEach((block, index) => {
    [block.title, block.text, ...(block.items || [])].forEach((text) => tokens(text).forEach((token) => add(`block:${index}`, block.title?.trim() || `Sección ${index + 1}`, token)));
  });
  return found;
}

/**
 * The PATCH body of the editor's autosave (POST adds kind).
 * @param {{ title: string, customer: { name?: string, email?: string, phone?: string }, items: EditorItem[], blocks: Array<{ type: string, title?: string, text?: string, items?: string[] }>, validUntil: string | null }} draft
 */
export function proposalPayload(draft) {
  const clean = (value) => String(value || "").trim() || null;
  return {
    title: draft.title.trim() || "Propuesta",
    customerName: clean(draft.customer.name),
    customerEmail: clean(draft.customer.email)?.toLowerCase() ?? null,
    customerPhone: clean(draft.customer.phone),
    items: proposalItemsPayload(draft.items),
    content: draft.blocks.map((block) => {
      const title = block.title?.trim() ? { title: block.title.trim() } : {};
      if (block.type === "list") return { type: "list", ...title, items: (block.items || []).map((item) => item.trim()).filter(Boolean) };
      return { type: block.type, ...title, text: block.text || "" };
    }),
    ...(draft.validUntil ? { validUntil: draft.validUntil } : {}),
  };
}

/**
 * @param {Array<{ id: string, type: string, at: string, version?: number | null, data?: any }>} events
 * @returns {Array<{ id: string, at: string, label: string, tone: "good" | "warning" | "bad" | "neutral" }>}
 */
export function proposalTimeline(events) {
  /** @type {Array<{ id: string, at: string, label: string, tone: "good" | "warning" | "bad" | "neutral" }>} */
  const entries = [];
  for (const event of events || []) {
    const data = event.data || {};
    /** @type {[string, "good" | "warning" | "bad" | "neutral"] | null} */
    let entry = null;
    switch (event.type) {
      case "created": entry = ["Creaste la propuesta", "neutral"]; break;
      case "ai_drafted": entry = ["YAPI armó el borrador", "neutral"]; break;
      case "sent": entry = [data.resend ? "Reenviada" : (event.version || 1) > 1 ? `Enviaste la versión ${event.version}` : "Propuesta enviada", "neutral"]; break;
      case "shared": entry = [data.channel === "whatsapp" ? "Compartida por WhatsApp" : "Enlace copiado", "neutral"]; break;
      case "emailed": entry = [`Correo enviado a ${data.to || "tu cliente"}`, "neutral"]; break;
      case "email_failed": entry = ["No se pudo enviar un correo", "bad"]; break;
      case "viewed": entry = ["Tu cliente la abrió", "neutral"]; break;
      case "changes_requested": entry = [`${data.name || "Tu cliente"} pidió cambios${data.message ? `: «${String(data.message).slice(0, 140)}»` : ""}`, "warning"]; break;
      case "accepted": entry = [`Aceptada por ${data.name || "tu cliente"}`, "good"]; break;
      case "expired": entry = ["Venció sin respuesta", "warning"]; break;
      case "voided": entry = [data.reason ? `Anulada: ${data.reason}` : "Anulada", "bad"]; break;
      case "cobro_created": entry = ["Creaste el cobro", "good"]; break;
      default: entry = null;
    }
    if (entry) entries.push({ id: event.id, at: event.at, label: entry[0], tone: entry[1] });
  }
  return entries;
}

/**
 * @param {{ customerName: string | null, storeName: string, numberLabel: string, title: string, total: number, currency?: string, validUntil: string | null, url: string }} input
 */
export function whatsAppProposalMessage(input) {
  const firstName = input.customerName?.trim().split(/\s+/)[0];
  const amount = input.total > 0 ? ` por ${formatMoney(input.total, input.currency)}` : "";
  const valid = input.validUntil ? ` (válida hasta el ${shortDate(input.validUntil)})` : "";
  return `${firstName ? `Hola ${firstName}` : "Hola"}, te comparto la propuesta ${input.numberLabel} de ${input.storeName}: «${input.title}»${amount}${valid}. Puedes verla y aceptarla aquí: ${input.url}`;
}
