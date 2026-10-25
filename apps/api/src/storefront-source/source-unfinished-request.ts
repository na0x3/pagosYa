/**
 * Unfinished requests (owner 2026-10-22): the computer shut off while YAPI was applying the merchant's own request on a new
 * store, the follow-up failed quietly, and YAPI went on as if the store were done. A request that did not finish now leaves
 * a note in the chat that says so and keeps the request; «sigue» picks it up again.
 */
export type PendingRequest = { instruction: string; direct: boolean; setupAction?: string };

/** The request a note kept, while no build has been saved since. Reads assistant messages newest first. */
export function pendingRequestIn(newestFirst: { metadata: unknown }[]): PendingRequest | undefined {
  for (const message of newestFirst) {
    const metadata = (message.metadata ?? {}) as { pendingRequest?: Partial<PendingRequest>; sourceRevision?: unknown; plan?: unknown };
    const pending = metadata.pendingRequest;
    if (pending && typeof pending.instruction === 'string' && pending.instruction.trim()) return { instruction: pending.instruction, direct: pending.direct === true, ...(typeof pending.setupAction === 'string' ? { setupAction: pending.setupAction } : {}) };
    // A build saved since, or a newer plan card the merchant is answering, ends the search.
    if (typeof metadata.sourceRevision === 'number' || metadata.plan) return undefined;
  }
  return undefined;
}

const CONTINUE = /^\s*(?:(?:s[ií]|ok|okay|ya|bueno|listo|perfecto)[,.!\s]+)?(?:por\s+favor[,\s]+)?(?:sigue|segu[ií]|sigamos|contin[uú]a|continuar|contin[uú]emos|continu[aá]|retoma|retom[aá]|retomemos|reintenta|reintent[aá]|vuelve\s+a\s+intentar|int[eé]ntalo|termina|termin[aá]|terminemos|ac[aá]ba(?:lo)?|hazlo|dale|adelante|go\s+on|continue|keep\s+going|resume)(?![\p{L}])/iu;

/** «sigue», «continúa con lo que estábamos haciendo», «dale, termínalo»: a short message that only asks to go on. */
export function continuesRequest(words: string): boolean {
  const text = words.trim().normalize('NFC');
  return text.length > 0 && text.length <= 140 && CONTINUE.test(text);
}

/** What the chat says when a request stopped before it finished; reason is 'interrupted' or a merchant-facing failure. */
export function unfinishedNote(reason: string, ownRequestOnNewStore: boolean): string {
  const what = ownRequestOnNewStore ? 'No terminé de aplicar lo que me pediste: tu tienda sigue con la base de la plantilla.' : 'Tu pedido no llegó a terminarse: tu tienda quedó como estaba.';
  const why = reason === 'interrupted' ? 'El trabajo se cortó antes de terminar (se perdió la conexión o se apagó el equipo).' : reason;
  return `${why} ${what} Tu pedido quedó guardado: escríbeme «sigue» y lo retomo desde ahí.`;
}
