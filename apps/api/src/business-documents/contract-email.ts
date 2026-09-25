import { escapeHtml } from "./business-document-email";
import { oneLine } from "./proposals.service";

/** D3 emails: the signing code, the signed copy for each party, and "your customer signed". Every merchant/customer string is escaped. */

const frame = (label: string, heading: string, body: string) => `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#666">${escapeHtml(label)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(heading)}</h1>
${body}
</td></tr></table></body></html>`;

export function buildSigningCodeEmail(input: { storeName: string; numberLabel: string; code: string; minutes: number }) {
  const subject = `Tu código para firmar el contrato ${input.numberLabel}`;
  const text = [
    "Hola,",
    "",
    `Este es tu código para firmar el contrato ${input.numberLabel} de ${oneLine(input.storeName)}:`,
    "",
    input.code,
    "",
    `Vence en ${input.minutes} minutos. Si no pediste firmar este contrato, ignora este correo: nadie puede firmar sin este código.`,
  ].join("\n");
  const html = frame(`Contrato ${input.numberLabel}`, input.storeName, `
<p style="margin:0 0 12px">Este es tu código para firmar el contrato:</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:bold;letter-spacing:8px;font-family:Menlo,Consolas,monospace">${escapeHtml(input.code)}</p>
<p style="margin:0;font-size:13px;color:#555">Vence en ${input.minutes} minutos. Si no pediste firmar este contrato, ignora este correo: nadie puede firmar sin este código.</p>`);
  return { subject, text, html };
}

export function buildSignedCopyEmail(input: { storeName: string; numberLabel: string; title: string; recipient: "customer" | "merchant"; otherParty: string; publicUrl: string; dashboardUrl: string }) {
  const subject = `Contrato ${input.numberLabel} firmado por ambas partes`;
  const link = input.recipient === "customer" ? input.publicUrl : input.dashboardUrl;
  const intro = input.recipient === "customer"
    ? `Firmaste el contrato «${oneLine(input.title)}» con ${oneLine(input.storeName)}. Te enviamos tu copia firmada, con el registro de firma electrónica.`
    : `${oneLine(input.otherParty)} y tú firmaron el contrato «${oneLine(input.title)}». Adjuntamos la copia firmada, con el registro de firma electrónica.`;
  const text = ["Hola,", "", intro, "", `Ver el contrato: ${link}`, "", "Guarda este correo: el PDF adjunto es tu copia del contrato firmado."].join("\n");
  const html = frame(`Contrato ${input.numberLabel}`, "Contrato firmado", `
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Ver el contrato</a></p>
<p style="margin:0;font-size:12px;color:#666">Guarda este correo: el PDF adjunto es tu copia del contrato firmado.</p>`);
  return { subject, text, html };
}

export function buildCustomerSignedEmail(input: { numberLabel: string; title: string; customerName: string; dashboardUrl: string }) {
  const who = oneLine(input.customerName) || "Tu cliente";
  const subject = `${who} firmó el contrato ${input.numberLabel}`;
  const intro = `${who} firmó «${oneLine(input.title)}». Solo falta tu firma para cerrarlo.`;
  const text = ["Hola,", "", intro, "", `Firmar ahora: ${input.dashboardUrl}`].join("\n");
  const html = frame(`Contrato ${input.numberLabel}`, "Tu cliente ya firmó", `
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<p style="margin:0"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Firmar ahora</a></p>`);
  return { subject, text, html };
}
