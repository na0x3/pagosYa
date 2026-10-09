import { formatMoney } from "./cobros.mjs";

/** Pure helpers for the Suscripciones page (spec 2026-09-28 §4). */
export { formatMoney };
export const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY"];
export const CADENCE_LABEL = { WEEKLY: "Semanal", BIWEEKLY: "Quincenal", MONTHLY: "Mensual" };
export const STATUS_LABEL = { ACTIVE: "Activa", PAUSED: "Pausada", CANCELED: "Cancelada", PENDING_PAYMENT: "Pago pendiente" };
export const STATUS_TONE = { ACTIVE: "ok", PAUSED: "muted", CANCELED: "muted", PENDING_PAYMENT: "warn" };

export function summaryFigures(summary) {
  return [
    { label: "Suscriptores activos", value: String(summary.active) },
    { label: "Ingreso mensual recurrente", value: formatMoney(summary.monthlyRecurring, summary.currency) },
    { label: "Renovaciones esta semana", value: String(summary.renewalsThisWeek) },
    { label: "Tasa de pago de renovaciones", value: summary.renewalPayRate === null ? "—" : `${Math.round(summary.renewalPayRate * 100)}%` },
  ];
}

export function subscriberWhatsAppUrl(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.length === 8 ? `591${digits}` : digits}?text=${encodeURIComponent(text)}`;
}

export function validateOffers(offers) {
  if (!offers.length) return "Elige al menos una frecuencia.";
  if (offers.some(offer => !Number.isInteger(offer.discountPercent) || offer.discountPercent < 0 || offer.discountPercent > 99)) return "El descuento debe ser un número entero entre 0 y 99.";
  return null;
}

/** Form rows ({ cadence, checked, discountPercent }) and the cadences saved today → what to PATCH and what to DELETE. */
export function offersPayload(rows, savedCadences) {
  return {
    upsert: rows.filter(row => row.checked).map(row => ({ cadence: row.cadence, discountPercent: row.discountPercent })),
    remove: rows.filter(row => !row.checked && savedCadences.includes(row.cadence)).map(row => row.cadence),
  };
}

export const MEMBER_STATUS_FILTERS = [["", "Todos"], ["ACTIVE", "Activos"], ["LAPSED", "Vencidos"], ["CANCELED", "Cancelados"]];
export const MEMBER_STATE_TONE = { ACTIVE: "ok", GRACE: "warn", LAPSED: "muted", CANCELED_ACTIVE: "muted", CANCELED: "muted" };

export function memberFigures(summary) {
  const members = summary.members || { active: 0, monthlyRecurring: 0, currency: summary.currency || "BOB" };
  return [
    { label: "Miembros activos", value: String(members.active) },
    { label: "Ingreso mensual de membresías", value: formatMoney(members.monthlyRecurring, members.currency) },
  ];
}

export function validateGraceDays(value) {
  const days = Number(value);
  return String(value).trim() !== "" && Number.isInteger(days) && days >= 0 && days <= 30 ? null : "Los días de gracia van de 0 a 30.";
}
