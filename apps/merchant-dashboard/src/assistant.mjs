// Pure helpers for Crecer › Asistente (no DOM).
export const NOTES_MAX = 4000;
export const usageLabel = (used, cap) => `${used} de ${cap} conversaciones este mes${used >= cap ? " · el chat volvió al botón de contacto" : ""}`;
export const conversationTags = (c) => [`${c.buyerMessages} ${c.buyerMessages === 1 ? "mensaje" : "mensajes"}`, c.addedToCart && "Agregó al carrito", c.handedOff && "Pasó con la tienda"].filter(Boolean);
export const teachPreview = (question, answer) => `Pregunta: ${question}\nRespuesta: ${String(answer).trim()}`;
export const notesLeft = (text) => NOTES_MAX - String(text ?? "").length;
const LA_PAZ = "America/La_Paz";
const day = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: LA_PAZ }).format(date);
export function shortDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (day(date) === day(now)) return "hoy";
  if (day(date) === day(new Date(now.getTime() - 86400000))) return "ayer";
  return new Intl.DateTimeFormat("es-BO", { timeZone: LA_PAZ, day: "numeric", month: "short" }).format(date).replace(".", "");
}
