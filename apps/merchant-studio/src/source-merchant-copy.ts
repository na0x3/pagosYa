/**
 * Last line of defence between a diagnostic and a merchant.
 *
 * The API already gates its own failures (merchantFacingSourceFailure), but the
 * studio renders text from three places that gate cannot reach: messages stored
 * before the gate existed, details written by the browser checks, and any future
 * endpoint that forgets to opt in. A merchant should never read a file path, an
 * English validator sentence or a JSON fragment, so the studio re-checks every
 * failure string on its way to the screen.
 *
 * The rule is the API's: Spanish authored for merchants passes through unchanged,
 * anything that reads as a diagnostic is dropped. Dropping is per sentence, so a
 * leaked head does not cost the merchant the reassurance that follows it.
 */

export const MERCHANT_FAILURE_FALLBACK =
  'No pude completar tu pedido. Tu mensaje y tus archivos siguen guardados; no necesitas volver a adjuntarlos.';

/**
 * Markers that mean the text was written for a model or a developer. The English
 * function words matter as much as the paths: a diagnostic that names no file is
 * still unreadable to a Spanish-speaking merchant.
 */
const DIAGNOSTIC_MARKERS = [
  /\b(?:assets|components|styles|public|src|dist)\//i,
  /\.(?:html|css|tsx|jsx|js|mjs|json|svg|jpe?g|png|webp|ttf|woff2?|mp4)\b/i,
  /\bdata-pagosya-/i,
  /\b(?:JSX|h1|h2|img|alt text|overflow|selector|schema|viewport|stack trace|undefined|null)\b/,
  /\b(?:the|these|this|with|from|into|are|was|were|does|should|must|cannot|missing|absent|broken|invalid|expected|required|replace|display|failed|preflight)\b/i,
  /[[\]{}<>]/,
  /\b[A-Za-z]+(?:Error|Exception)\b/,
  /\bHTTP\s*\d{3}\b|\bstatus\s*\d{3}\b/i,
];

export function readsAsDiagnostic(text: string): boolean {
  return DIAGNOSTIC_MARKERS.some(marker => marker.test(text));
}

/**
 * The server appends its reassurance to whatever the failure said, without a
 * sentence boundary when the failure did not end in one. Split there too, so a
 * leaked head cannot swallow the part the merchant needs.
 */
const REASSURANCE = /\bTu mensaje y (?:los|tus) archivos\b/i;
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+|\s+(?=Tu mensaje y (?:los|tus) archivos\b)/;

function sentences(text: string): string[] {
  return text.split(SENTENCE_BOUNDARY).map(part => part.trim()).filter(Boolean);
}

/**
 * Returns text a merchant may read. Clean text is returned untouched so authored
 * copy keeps its exact wording; otherwise the diagnostic sentences are dropped
 * and `fallback` explains the failure in their place.
 */
export function merchantSafeText(text: string, fallback = MERCHANT_FAILURE_FALLBACK): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return fallback;
  const parts = sentences(trimmed);
  const safe = parts.filter(part => !readsAsDiagnostic(part));
  if (safe.length === parts.length) return trimmed;
  if (!safe.length) return fallback;
  // The server appends its own reassurance to every failure, so the fallback's
  // copy of it would be the second one the merchant reads, worded differently.
  // Keep the one already on screen and contribute only the missing explanation.
  const lead = safe.some(part => REASSURANCE.test(part))
    ? sentences(fallback).filter(part => !REASSURANCE.test(part))
    : [fallback];
  return [...lead, ...safe].join(' ');
}
