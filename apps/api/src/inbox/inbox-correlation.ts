/** Copy shown when someone with no open thread writes to the inbox address. */
export const SPANISH_UNKNOWN_SENDER = "Remitente sin conversación abierta";

/**
 * Pulls the bracketed ids out of a References or In-Reply-To header. Anything
 * not inside angle brackets is commentary some clients add; it is not an id.
 */
export function parseReferences(header: string | null | undefined): string[] {
  if (!header) return [];
  return [...header.matchAll(/<([^<>]+)>/g)].map((match) => match[1].trim()).filter(Boolean);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Eacute: "É", Aacute: "Á", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
};

/**
 * Inbound HTML is never rendered as HTML anywhere, so it is flattened to text
 * on the way in rather than sanitised on the way out.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => ENTITIES[name] ?? whole)
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}
