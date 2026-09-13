/** Only an unanswered catalog request can carry into a short clarification reply. */
export function continuedCatalogRequest(pending: string | undefined, current: string): string {
  const text = current.trim();
  if (!pending || /\b(?:cancel|cancela|olvida|forget|instead|mejor|no crees|don't create|do not create)\b/i.test(text)) return text;
  const clarification = /^(?:s[ií]|yes|ok|dale|correcto|todas?|todos?|all|cada|each|same|mismo|mismas?|sin l[ií]mite|ilimitad[oa]|unlimited|stock|precio|price|Bs\.?|BOB|USD|\d+|cinco|five|dos|two|tres|three|cuatro|four|diez|ten)\b/i.test(text)
    && !/\b(?:diseño|design|header|footer|fondo|background|tipograf[ií]a|logo|crea|create|add product|agrega producto)\b/i.test(text);
  return clarification ? `${pending}\nRespuesta a la aclaración: ${text}`.slice(-12000) : text;
}
export function pendingCatalogRequest(instruction: string): string | undefined {
  return /\b(?:crea|create|agrega|add|cambia|change|actualiza|update|stock|agotad[oa]|sold out)\b/i.test(instruction)
    && /\b(?:producto|product|camiseta|camisa|shirt|cat[aá]logo|opciones|options|tallas?|sizes?|combinaciones|combinations|variantes?|variants?)\b/i.test(instruction) ? instruction.slice(-12000) : undefined;
}
