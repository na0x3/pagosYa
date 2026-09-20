import { BadGatewayException, HttpException } from '@nestjs/common';

/**
 * Validator messages steer the bounded repair: they are written in English, name
 * internal paths and contracts, and read as instructions to a model. Merchant
 * copy is Spanish and explains what to do next. One string cannot be both, so a
 * failed contract carries the two separately.
 *
 * `diagnostic` goes to the repair prompt. `merchantMessage` is the only text a
 * merchant may ever read. Validators that do not author merchant copy fall back
 * to GENERIC_MERCHANT_FAILURE rather than leaking their diagnostic.
 */
export const GENERIC_MERCHANT_FAILURE =
  'YAPI armó un borrador que no pasó las comprobaciones automáticas, así que no lo guardé. Tu revisión anterior sigue intacta.';

export class SourceValidationError extends BadGatewayException {
  constructor(
    readonly diagnostic: string,
    readonly merchantMessage: string = GENERIC_MERCHANT_FAILURE,
  ) {
    super(merchantMessage);
  }
}

/** The text handed to the bounded repair, which needs the internal detail. */
export function repairDiagnostic(error: unknown): string {
  if (error instanceof SourceValidationError) return error.diagnostic;
  if (error instanceof Error) return error.message;
  return 'Invalid source';
}

/**
 * The single gate every generation failure passes through on its way to a
 * merchant. Default-deny: only text authored for merchants survives, so a new
 * validator cannot leak its diagnostic by forgetting to opt in.
 */
export function merchantFacingSourceFailure(error: unknown): unknown {
  if (error instanceof SourceValidationError) return new BadGatewayException(error.merchantMessage);
  if (!(error instanceof Error)) return error;
  // Aborts, timeouts and Prisma faults are control flow. Callers catch them by
  // type and code, so they are never rewritten regardless of how they read.
  if (isControlFlow(error)) return error;
  // Everything else is judged on its text: Spanish authored for merchants passes
  // through unchanged, anything that reads as a diagnostic is replaced.
  const message = error instanceof HttpException ? merchantText(error) : error.message;
  if (message && !readsAsDiagnostic(message)) return error;
  return new BadGatewayException(GENERIC_MERCHANT_FAILURE);
}

function isControlFlow(error: Error): boolean {
  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || /^Prisma/.test(error.constructor?.name || '');
}

function merchantText(error: HttpException): string {
  const response = error.getResponse() as string | { message?: unknown };
  if (typeof response === 'string') return response;
  const message = response?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter(part => typeof part === 'string').join(' ');
  return error.message || '';
}

/**
 * Validator diagnostics name source artefacts a merchant never sees. Any of
 * these markers means the text was written for a model, not for a person.
 */
const DIAGNOSTIC_MARKERS = [
  /\bassets\//i,
  /\bcomponents\//i,
  /\bstyles\//i,
  /\.(?:html|css|tsx|jsx|js|svg|jpe?g|png|webp|ttf|woff2?)\b/i,
  /\bdata-pagosya-/i,
  /\b(?:JSX|h1|img|alt text|overflow|selector|schema|viewport)\b/,
  /\b(?:missing|absent|broken|invalid|expected|required|must|do not)\b/i,
  /[[\]{}<>]/,
];

function readsAsDiagnostic(message: string): boolean {
  return DIAGNOSTIC_MARKERS.some(marker => marker.test(message));
}
