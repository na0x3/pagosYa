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

/**
 * Removes the code points Postgres `text` cannot store (NUL and the C0 controls
 * below tab, rejected with SQLSTATE 22021) and the lone surrogates that are not
 * valid UTF-16.
 *
 * decodeCodePoint already refuses to PRODUCE these from an entity, but that
 * only guards one door. A raw NUL byte sitting in the text/plain part of an
 * inbound mail never passes through htmlToText at all — recordInbound prefers
 * the text part and skips the HTML path entirely — so it reached the INSERT
 * untouched and still turned the webhook into a 500 and a Svix retry loop.
 * Everything that becomes a StoreInboxMessage.body goes through here, whatever
 * part of the message it came from.
 */
export function stripUnstorable(text: string): string {
  return text.replace(/[\u0000-\u0008\uD800-\uDFFF]/g, "");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Eacute: "É", Aacute: "Á", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
};

/**
 * Safely decode a numeric code point.
 *
 * Catching the throw is not enough, because the dangerous values do not throw.
 * `String.fromCodePoint(0)` returns "\u0000" quite happily, and Postgres then
 * rejects that byte in a `text` column with SQLSTATE 22021 ("unsupported
 * Unicode escape sequence"). So a shopper who puts `&#0;` in a mail makes the
 * INSERT in recordInbound throw, the webhook answers 500, and Svix retries the
 * same payload on its whole schedule — a retry storm from one character.
 * The lone surrogates 0xD800-0xDFFF are the same story one step later: they do
 * not throw either, and they produce invalid UTF-16 that the driver cannot
 * encode.
 *
 * Both ranges are stripped rather than preserved as their entity text: they
 * carry no meaning a merchant could read, and echoing "&#0;" back would leave
 * the next reader wondering whether it mattered.
 */
function decodeCodePoint(code: number, original: string): string {
  // Out of Unicode range entirely, or not a number: keep the source text.
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return original;
  // Unstorable in Postgres text (NUL and the C0 controls below \t) or invalid
  // UTF-16 (unpaired surrogates). Dropped.
  if (code <= 0x08 || (code >= 0xd800 && code <= 0xdfff)) return "";
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
 *
 * DO NOT SPLIT STEP 1 INTO SEVERAL .replace() PASSES. The single alternation
 * with one callback is the security property, not a tidiness choice. Three
 * sequential passes let the output of one pass become the input of the next,
 * and that reopens markup injection through inputs no reviewer guesses:
 * "&#x26;#60;b onclick=alert(1)" decoded hex-then-decimal yields "<b ...>",
 * because the "&" the hex pass emits joins the literal "#60;" that followed it.
 * A global .replace() never rescans the text it inserts, so one pass closes the
 * whole class at once. This cost three review rounds to find; please leave it.
 */
export function htmlToText(html: string): string {
  return html
    // 1. Decode all entity types in a single non-rescanning pass
    // This prevents output from one match becoming input to the next match.
    .replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (whole, hex, dec, name) => {
      if (hex !== undefined) return decodeCodePoint(parseInt(hex, 16), whole);
      if (dec !== undefined) return decodeCodePoint(Number(dec), whole);
      return ENTITIES[name] ?? whole;
    })
    // 2. Remove script and style blocks with their contents
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    // 3. Convert <br> and closing block tags to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    // 4. Strip all remaining tags
    .replace(/<[^>]+>/g, "")
    // 5. Collapse whitespace and trim
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .trim();
}
