/**
 * Correos y marketing › Correos: what the list shows. Every store email appears once, in the order a
 * buyer meets them. The two confirmations are the store's designed emails (email-studio-panel.mjs) and
 * always go out; the rest are the plain-text emails of the email workspace (/email-workspace
 * templates), each with its own switch. The rows are fixed here, so a template the API stops offering
 * (ORDER_CONFIRMATION, 2026-10-13) can never come back as a second confirmation.
 */
export const EMAIL_GROUPS = [["purchases", "Compras"], ["subscriptions", "Suscripciones"], ["automatic", "Automáticos"]];
export const EMAIL_ROWS = [
  { id: "order_confirmation", label: "Confirmación de compra", group: "purchases", designed: true, trigger: "Después de confirmar el pago" },
  { id: "appointment_confirmed", label: "Cita confirmada", group: "purchases", designed: true, trigger: "Después de pagar una cita" },
  { id: "SHIPPED", label: "Enviado", group: "purchases" },
  { id: "DELIVERED", label: "Entregado", group: "purchases" },
  { id: "CANCELED", label: "Cancelado", group: "purchases" },
  { id: "REFUND", label: "Reembolso", group: "purchases" },
  { id: "GIFT_CARD", label: "Tarjeta de regalo", group: "purchases" },
  { id: "SUBSCRIPTION_FAILED", label: "Pago de suscripción fallido", group: "subscriptions" },
  { id: "SUBSCRIPTION_SKIPPED", label: "Suscripción omitida", group: "subscriptions" },
  { id: "WELCOME", label: "Bienvenida", group: "automatic" },
  { id: "RECOVERY", label: "Carrito abandonado", group: "automatic" },
  { id: "REVIEW_REQUEST", label: "Pedir reseña", group: "automatic" },
];
/** The automatic emails know the store's name and nothing about an order. */
export const STORE_ONLY_VARIABLES = ["WELCOME", "RECOVERY", "REVIEW_REQUEST"];
/** What each automatic email does, moved here with its switch from the Comeback Card form. */
export const EMAIL_HELP = {
  WELCOME: "Se envía a quien se suscribe desde el formulario de tu tienda. Todos los correos comerciales incluyen un enlace para darse de baja.",
  RECOVERY: "Al activarlo, tu tienda ofrece guardar el carrito: el cliente deja su correo y acepta recibir un recordatorio. Recupera los productos guardados con un enlace; si ya pagó, el correo se cancela. Se envía un solo recordatorio por carrito, con un máximo de uno por cliente cada siete días. No lo suscribe a campañas.",
  REVIEW_REQUEST: "Se envía 24 horas después de entregar, un solo correo por pedido, con un enlace privado para reseñar los productos comprados. Las reseñas quedan pendientes de moderación y nunca se publican automáticamente.",
};

/** A usable overview whatever the API answered: a failed or odd reply leaves only the confirmations. */
export function normalizeOverview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { templates: [] };
  return { ...value, templates: Array.isArray(value.templates) ? value.templates : [] };
}

/** The groups that have at least one row, each row merged with what the API stores for it. */
export function emailListGroups(templates) {
  const byId = new Map((Array.isArray(templates) ? templates : []).map(template => [template.id, template]));
  return EMAIL_GROUPS.map(([key, title]) => ({ key, title, rows: EMAIL_ROWS.filter(row => row.group === key).flatMap(row => {
    if (row.designed) return [{ ...row, enabled: true, supported: true }];
    const template = byId.get(row.id);
    // An email the API does not offer is left out, rather than shown as a switch that cannot save.
    if (!template) return [];
    return [{ ...row, trigger: template.trigger || "", enabled: Boolean(template.enabled), supported: template.supported !== false, subject: template.subject ?? "", body: template.body ?? "", delayHours: Number(template.delayHours) || 0 }];
  }) })).filter(group => group.rows.length);
}

/** The PUT /email-workspace/templates/:id body. Carrito abandonado also carries its wait time. */
export function templateSaveBody(row, draft, revision) {
  const body = { revision, enabled: Boolean(row.supported && draft.enabled), subject: String(draft.subject ?? "").trim(), body: String(draft.body ?? "").trim() };
  if (row.id === "RECOVERY") body.recoveryHours = Number(draft.recoveryHours);
  return body;
}

/** What stops a draft from saving, in the merchant's words; "" when it can be saved. */
export function templateDraftError(row, draft) {
  const body = templateSaveBody(row, draft, 0);
  if (!body.subject || !body.body) return "Completa el asunto y el mensaje.";
  if (row.id === "RECOVERY" && !(Number.isInteger(body.recoveryHours) && body.recoveryHours >= 1 && body.recoveryHours <= 168)) return "Las horas de espera van de 1 a 168.";
  return "";
}

/** The sample the merchant previews: never sent, filled with example values. */
export function sampleText(text, storeName) {
  return String(text ?? "").replace(/\{\{store\}\}/g, () => storeName).replace(/\{\{customer\}\}/g, "María").replace(/\{\{order\}\}/g, "PEDIDO-123").replace(/\{\{amount\}\}/g, "Bs 180,00");
}
