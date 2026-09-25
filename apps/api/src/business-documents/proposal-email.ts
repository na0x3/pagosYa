import { money } from "../reports/finance-pdfs";
import { escapeHtml } from "./business-document-email";

/**
 * The merchant's heads-up when a customer accepts a proposal or asks for changes.
 * Every customer-typed string is escaped in the HTML; replying goes to the customer.
 */
export function buildProposalMerchantEmail(input: {
  reason: "accepted" | "changes";
  storeName: string;
  numberLabel: string;
  title: string;
  totalAmount: number;
  currency: string;
  customerName: string | null;
  customerEmail: string;
  message?: string | null;
  dashboardUrl: string;
}) {
  const who = input.customerName?.trim() || input.customerEmail;
  const accepted = input.reason === "accepted";
  const subject = accepted ? `¡${who} aceptó tu propuesta ${input.numberLabel}!` : `${who} pidió cambios en la propuesta ${input.numberLabel}`;
  const total = input.totalAmount > 0 ? money(input.totalAmount, input.currency) : null;
  const lead = accepted
    ? `${who} aceptó «${input.title}»${total ? ` por ${total}` : ""}. Crea el cobro en un toque desde tu panel.`
    : `${who} leyó «${input.title}» y te pidió cambios. Edita la propuesta y vuelve a enviarla; responde este correo para escribirle.`;
  const action = accepted ? "Crear el cobro" : "Ver la propuesta";
  const text = [
    `Hola, ${input.storeName}:`,
    "",
    lead,
    ...(input.message ? ["", `Su mensaje: "${input.message}"`] : []),
    "",
    `Cliente: ${[input.customerName, input.customerEmail].filter(Boolean).join(" · ")}`,
    "",
    `${action}: ${input.dashboardUrl}`,
  ].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#666">Propuesta ${escapeHtml(input.numberLabel)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(accepted ? "¡Propuesta aceptada!" : "Te pidieron cambios")}</h1>
<p style="margin:0 0 16px">${escapeHtml(lead)}</p>
${input.message ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:4px solid #111;background:#fafaf9;white-space:pre-line">${escapeHtml(input.message)}</blockquote>` : ""}
<p style="margin:0 0 20px;color:#444">Cliente: ${escapeHtml([input.customerName, input.customerEmail].filter(Boolean).join(" · "))}</p>
<p style="margin:0"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(action)}</a></p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
