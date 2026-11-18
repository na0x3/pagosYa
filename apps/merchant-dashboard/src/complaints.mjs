// America/La_Paz is UTC-4 all year; formatting by hand keeps output identical in every browser and in node --test.
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;
const laPazDay = (date) => new Date(date.getTime() - LA_PAZ_OFFSET_MS).toISOString().slice(0, 10);

const STATUS = { RECEIVED: "Recibido", IN_REVIEW: "En revisión por pagosYa", WAITING_MERCHANT: "Esperando tu respuesta", ANSWERED: "Cerrado" };
const CATEGORY = {
  NOT_DELIVERED: "Pedido no recibido",
  NOT_AS_DESCRIBED: "Producto distinto o dañado",
  UNRECOGNIZED_CHARGE: "Cobro no reconocido",
  DUPLICATE_CHARGE: "Cobro duplicado",
  REFUND_NOT_RECEIVED: "Reembolso no recibido",
  OTHER: "Otro",
};

export const complaintStatusLabel = (status) => STATUS[status] ?? status;
export const complaintCategoryLabel = (category) => CATEGORY[category] ?? category;
export const canReply = (detail) => detail?.status === "WAITING_MERCHANT";

export function replyByLabel(iso, now = new Date()) {
  if (!iso) return "";
  const due = new Date(iso);
  if (due.getTime() < now.getTime()) return "Fuera de plazo: responde lo antes posible";
  const day = laPazDay(due);
  if (day === laPazDay(now)) return "Responde hasta hoy";
  const [y, m, d] = day.split("-");
  return `Responde hasta el ${d}/${m}/${y}`;
}
