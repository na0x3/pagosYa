import { whatsAppShareUrl } from "./cobros.mjs";
import { formatCount } from "./growth.mjs";

/**
 * Crecer › Carritos abandonados: pure helpers for the panel — labels, the follow-up the merchant edits before sending,
 * and its WhatsApp / email links. No DOM here, so node:test covers it. Nothing is sent from the dashboard.
 */
export const SOURCE_LABEL = { payment: "Generó el QR / pulsó Pagar", saved: "Guardó su carrito" };
export const REMINDER_LABEL = { scheduled: "Recordatorio programado", sent: "Recordatorio enviado", none: "Sin recordatorio" };

/** Name, else email, else phone. */
export const cartPerson = (cart) => cart.name?.trim() || cart.email || cart.phone || "Cliente";
/** «Café ×2, Té (Grande) ×1» */
export const cartItemsText = (items) => (items || []).map((item) => `${item.name}${item.variant ? ` (${item.variant})` : ""} ×${item.quantity}`).join(", ");

export function timeAgo(iso, now = new Date()) {
  const minutes = Math.max(1, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

/** The saved cart's restore link when there is one, else the store: the shopper lands where they can finish. */
export function followUpMessage(cart, storeName) {
  const first = cart.name?.trim().split(/\s+/)[0];
  return `Hola${first ? ` ${first}` : ""}, vimos que dejaste ${cartItemsText(cart.items)} en ${storeName}. ¿Te ayudamos a terminar tu compra? ${cart.recoverUrl || cart.storeUrl}`;
}
export const followUpSubject = (storeName) => `Tu carrito en ${storeName}`;

/** wa.me with the shopper's number (an 8-digit Bolivian mobile gets 591, see cobros.mjs). */
export const whatsAppFollowUpUrl = (cart, storeName) => cart.phone ? whatsAppShareUrl(cart.phone, followUpMessage(cart, storeName)) : "";
export const mailtoFollowUpUrl = (cart, storeName) => cart.email
  ? `mailto:${encodeURIComponent(cart.email).replace("%40", "@")}?subject=${encodeURIComponent(followUpSubject(storeName))}&body=${encodeURIComponent(followUpMessage(cart, storeName))}`
  : "";

/** The spec: saved-cart rows always say their reminder state; a payment row only when it led to a saved cart. */
export const showsReminder = (cart) => cart.source === "saved" || Boolean(cart.recoverUrl);

export const anonymousLine = (count) => count === 1
  ? "1 visita dejó su carrito sin dejar contacto"
  : `${formatCount(count)} visitas dejaron su carrito sin dejar contacto`;
