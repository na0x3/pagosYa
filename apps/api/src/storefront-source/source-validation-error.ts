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
  'YAPI no pudo completar las comprobaciones automáticas. Tu revisión guardada sigue intacta. Puedes reintentar para continuar.';

/** Stress test 2026-10-21: the ChatGPT plan's usage limit read as «no pudo completar las comprobaciones». */
export const MODEL_LIMIT_MERCHANT_FAILURE =
  'YAPI llegó al límite de uso de su modelo por ahora. Tu tienda sigue como estaba; vuelve a intentarlo en un rato.';
export const MODEL_LIMIT = /usage_limit_exceeded|insufficient_quota|rate_limit_exceeded/i;

/** Owner 2026-11-09 («ni siquiera se puede ver qué pasó»): a diagnostic the merchant may not read still says, in plain words, which
 *  kind of check failed. First match wins; none → the generic copy. */
const FAILURE_KINDS: Array<[RegExp, string]> = [
  [/\bimages?\b|assets\/|\.(?:jpe?g|png|webp|gif|svg)\b|\bfotos?\b|\bimagen(?:es)?\b|alt text/i, 'una foto no quedó bien puesta en el diseño nuevo'],
  [/compil|\bimports?\b|\bjsx\b|syntax|unexpected token|typescript|evaluaci[oó]n de c[oó]digo|elemento no permitido|archivo react|\bparse/i, 'el código del diseño nuevo tenía un error que no pude corregir'],
  [/overflow|ancho de pantalla|viewport|horizontal|\bmobile\b|m[oó]vil|celular|desktop|revisi[oó]n visual/i, 'el diseño nuevo no se veía bien en el celular o en la computadora'],
  [/checkout|\bcart\b|carrito|\bcompra|\bpago\b|variant/i, 'el carrito o la compra de prueba no funcionó en el diseño nuevo'],
  [/\bh1\b|heading|t[ií]tulo principal/i, 'a la página le faltaba su título principal'],
  [/\bhref\b|\blinks?\b|enlace|\broute|\bp[aá]gina|\bpages?\b/i, 'un enlace o una página del diseño nuevo no funcionaba'],
  [/\bbrand\b|frases de la marca/i, 'el diseño nuevo no usaba las frases de tu marca'],
];
export function plainFailure(diagnostic: string): string {
  const kind = FAILURE_KINDS.find(([pattern]) => pattern.test(diagnostic))?.[1];
  return kind ? `YAPI no pudo terminar este cambio: ${kind}. Tu tienda sigue como estaba; puedes reintentar.` : GENERIC_MERCHANT_FAILURE;
}

export class SourceValidationError extends BadGatewayException {
  constructor(
    readonly diagnostic: string,
    readonly merchantMessage: string = plainFailure(diagnostic),
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
  if (MODEL_LIMIT.test(`${message} ${error.message}`)) return new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE);
  if (message && !readsAsDiagnostic(message)) return error;
  return new BadGatewayException(plainFailure(`${message} ${error.message}`));
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
  // A compiler's own words in a Spanish sentence («No se pudo compilar Inicio: Unexpected token (12:4)»).
  /\b(?:unexpected|compilar|compile)\b|\(\d+:\d+\)/i,
];

function readsAsDiagnostic(message: string): boolean {
  return DIAGNOSTIC_MARKERS.some(marker => marker.test(message));
}
