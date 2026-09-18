/** Only an unanswered catalog request can carry into a short clarification reply. */
export function continuedCatalogRequest(pending: string | undefined, current: string, setup = false): string {
  const text = current.trim();
  if (!pending || /\b(?:cancel|cancela|olvida|forget|instead|mejor|no crees|don't create|do not create)\b/i.test(text)) return text;
  // Before a store has any site, the whole setup conversation is one request: a catalog priced three messages ago
  // is still what "créala" means. Once a site exists, only a direct clarification carries, which keeps an old
  // request from creating duplicate products.
  if (setup) return `${pending}\n${text}`.slice(-12000);
  const clarification = /^(?:s[ií]|yes|ok|dale|correcto|todas?|todos?|all|cada|each|same|mismo|mismas?|sin l[ií]mite|ilimitad[oa]|unlimited|stock|precio|price|Bs\.?|BOB|USD|\d+|cinco|five|dos|two|tres|three|cuatro|four|diez|ten)\b/i.test(text)
    && !/\b(?:diseño|design|header|footer|fondo|background|tipograf[ií]a|logo|crea|create|add product|agrega producto)\b/i.test(text);
  return clarification ? `${pending}\nRespuesta a la aclaración: ${text}`.slice(-12000) : text;
}
/** A merchant message that states prices ("Matcha – Bs 22") is catalog content even without the word "crea". */
const statesPrices = (text: string) => /(?:\b(?:bs\.?|bob|usd)\s*\d|\d+(?:[.,]\d{1,2})?\s*(?:bs\b|bob\b|usd\b))/i.test(text);

export function pendingCatalogRequest(instruction: string, setup = false, previous?: string): string | undefined {
  if (setup) return statesPrices(instruction) || previous ? instruction.slice(-12000) : undefined;
  return /\b(?:crea|create|agrega|add|cambia|change|actualiza|update|stock|agotad[oa]|sold out)\b/i.test(instruction)
    && /\b(?:producto|product|camiseta|camisa|shirt|cat[aá]logo|opciones|options|tallas?|sizes?|combinaciones|combinations|variantes?|variants?)\b/i.test(instruction) ? instruction.slice(-12000) : undefined;
}
