export const CATEGORY_OPTIONS = [
  { value: "NOT_DELIVERED", label: "No recibí mi pedido" },
  { value: "NOT_AS_DESCRIBED", label: "El producto es distinto o llegó dañado" },
  { value: "UNRECOGNIZED_CHARGE", label: "No reconozco este cobro" },
  { value: "DUPLICATE_CHARGE", label: "Me cobraron dos veces" },
  { value: "REFUND_NOT_RECEIVED", label: "No recibí mi reembolso" },
  { value: "OTHER", label: "Otro" },
];
export const REQUEST_OPTIONS = [
  { value: "REFUND", label: "Que me devuelvan el dinero" },
  { value: "DELIVERY", label: "Que me entreguen el pedido" },
  { value: "OTHER", label: "Otra solución" },
];
export const BUYER_STATUS_LABEL = { RECEIVED: "Recibido", IN_REVIEW: "En revisión", ANSWERED: "Respondido" } as const;
export const OUTCOME_LABEL: Record<string, string> = { UPHELD: "A tu favor", PARTIALLY_UPHELD: "Parcialmente a tu favor", NOT_UPHELD: "No a tu favor" };

export type ComplaintDraft = { buyerName: string; buyerEmail: string; buyerPhone: string; reference: string; storeName: string; category: string; request: string; description: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export function validateComplaintDraft(d: ComplaintDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (d.buyerName.trim().length < 2) errors.buyerName = "Escribe tu nombre.";
  if (!EMAIL.test(d.buyerEmail.trim())) errors.buyerEmail = "Escribe un correo válido; ahí te enviaremos la respuesta.";
  if (!d.reference.trim() && !d.storeName.trim()) errors.reference = "Escribe la referencia de tu pago o el nombre de la tienda.";
  if (!d.category) errors.category = "Elige qué pasó.";
  if (!d.request) errors.request = "Elige qué solución esperas.";
  const length = d.description.trim().length;
  if (length < 20 || length > 5000) errors.description = "Cuéntanos qué pasó (entre 20 y 5000 caracteres).";
  return errors;
}

export function clientFileProblem(files: Array<{ name: string; size: number; type: string }>): string | null {
  if (files.length > 3) return "Puedes adjuntar hasta 3 archivos.";
  if (files.some((file) => file.size > 5_000_000)) return "Cada archivo puede pesar hasta 5 MB.";
  if (files.some((file) => !ALLOWED.includes(file.type))) return "Solo se aceptan fotos JPG o PNG y archivos PDF.";
  return null;
}

export function complaintDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(new Date(iso));
}
