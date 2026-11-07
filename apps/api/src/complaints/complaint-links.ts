const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function complaintsUrl(checkoutOrigin: string, paymentIntentId: string): string {
  return `${checkoutOrigin.replace(/\/$/, "")}/reclamos?ref=${encodeURIComponent(paymentIntentId)}`;
}

export function complaintsTextLine(url: string): string {
  return `\n¿Problemas con tu compra? Presenta un reclamo: ${url}\n`;
}

/** A platform line every receipt carries (ASFI), outside whatever the store authored. */
export function appendComplaintsFooter(html: string, url: string): string {
  const footer = `<p style="margin:24px 0 0;font-size:12px;color:#6b6b73;text-align:center">¿Problemas con tu compra? <a href="${escapeAttr(url)}" style="color:#6b6b73">Presenta un reclamo</a></p>`;
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at === -1 ? `${html}${footer}` : `${html.slice(0, at)}${footer}${html.slice(at)}`;
}
