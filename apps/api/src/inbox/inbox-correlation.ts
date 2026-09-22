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
 * Safely decode a numeric code point, returning the original text if invalid.
 * String.fromCodePoint throws on values above 0x10FFFF, and inbound mail is
 * hostile input, so we catch and preserve the original entity text.
 */
function decodeCodePoint(code: number, original: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return original;
  }
}

/**
 * Inbound HTML is never rendered as HTML anywhere, so it is flattened to text
 * on the way in rather than sanitised on the way out. Entities are decoded first
 * to prevent encoded markup from bypassing tag removal.
 */
export function htmlToText(html: string): string {
  return html
    // 1. Decode hex numeric entities (&#x...;) with case-insensitive x and hex digits
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (whole, hexCode) =>
      decodeCodePoint(parseInt(hexCode, 16), whole)
    )
    // 2. Decode decimal numeric entities (&#...;)
    .replace(/&#(\d+);/g, (whole, code) =>
      decodeCodePoint(Number(code), whole)
    )
    // 3. Decode named entities
    .replace(/&([a-zA-Z]+);/g, (whole, name) => ENTITIES[name] ?? whole)
    // 4. Remove script and style blocks with their contents
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    // 5. Convert <br> and closing block tags to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    // 6. Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // 7. Collapse whitespace and trim
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}
