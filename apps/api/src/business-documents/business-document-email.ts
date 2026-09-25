import { money } from "../reports/finance-pdfs";
import { DOCUMENT_KIND_LABEL, documentDate } from "./business-document-pdf";
import type { DocumentSnapshot } from "./business-document-snapshot";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Why a reminder goes out: the merchant's Recordar, the due day, or 3 days late. */
export type DocumentReminderStage = "manual" | "due" | "overdue";

/**
 * The customer's email for a sent document. Every merchant-typed string is
 * escaped in the HTML; the text body carries the same facts for clients that
 * do not render HTML. The PDF goes as an attachment (see the service).
 */
export function buildDocumentEmail(input: {
  storeName: string;
  snapshot: DocumentSnapshot;
  publicUrl: string;
  message?: string | null;
  reminder?: DocumentReminderStage;
}) {
  const { snapshot, reminder } = input;
  const kind = DOCUMENT_KIND_LABEL[snapshot.kind];
  const subject = `${reminder ? "Recordatorio: " : ""}${kind} ${snapshot.numberLabel} de ${input.storeName}`;
  const facts = [
    snapshot.title,
    snapshot.items.length ? `Total: ${money(snapshot.totalAmount, snapshot.currency)}` : "",
    snapshot.dueAt ? `Vence: ${documentDate(snapshot.dueAt)}` : "",
    snapshot.validUntil ? `Válido hasta: ${documentDate(snapshot.validUntil)}` : "",
  ].filter(Boolean);
  // A cobro is there to be paid: its button says so.
  const action = snapshot.kind === "INVOICE" ? "Ver y pagar" : `Ver ${kind.toLowerCase()}`;
  const greeting = snapshot.customer.name ? `Hola ${snapshot.customer.name},` : "Hola,";
  const noun = kind.toLowerCase();
  const intro = reminder === "due"
    ? `Te recordamos que tu ${noun} de ${input.storeName} vence hoy.`
    : reminder === "overdue"
      ? `Tu ${noun} de ${input.storeName} venció el ${documentDate(snapshot.dueAt)}. Si ya lo pagaste, ignora este mensaje.`
      : reminder === "manual"
        ? `${input.storeName} te recuerda ${kind === "Propuesta" ? "esta" : "este"} ${noun} pendiente.`
        : `${input.storeName} te envió ${kind === "Propuesta" ? "una" : "un"} ${noun}.`;

  const text = [
    greeting,
    "",
    intro,
    ...(input.message ? ["", input.message] : []),
    "",
    ...facts,
    "",
    `${action}: ${input.publicUrl}`,
    "",
    "Adjuntamos el PDF.",
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#666">${escapeHtml(kind)} ${escapeHtml(snapshot.numberLabel)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(input.storeName)}</h1>
<p style="margin:0 0 8px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
${input.message ? `<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(input.message)}</p>` : ""}
<div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:0 0 20px">
${facts.map((fact, index) => `<p style="margin:${index ? "6px" : "0"} 0 0;${index ? "color:#444" : "font-weight:bold"}">${escapeHtml(fact)}</p>`).join("\n")}
</div>
<p style="margin:0 0 20px"><a href="${escapeHtml(input.publicUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(action)}</a></p>
<p style="margin:0;font-size:12px;color:#666">Adjuntamos el PDF. Si el botón no funciona, copia este enlace: ${escapeHtml(input.publicUrl)}</p>
</td></tr></table></body></html>`;

  return { subject, text, html };
}
