import { readPopupLook, type PopupLookId } from '../store-popups/popup-looks';

/** YAPI A/B tests (spec 2026-11-09-yapi-ab-tests): the words YAPI hears, what a popup B changes, when a test has an answer and what
 *  YAPI says about it — no model call. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Final review 2026-11-09: only the spec's phrases — «prueba con…», «prueba un botón más grande» are everyday «try…», not a test.
const REQUEST = [
  /^\s*(?:por favor,?\s+)?prueba\s+(?:si|otr[oa]s?)\b/,
  /^\s*(?:por favor,?\s+)?prueba\s+(?:la|el)\s+\w+\s+con\s+otr[oa]s?\b/,
  /^\s*(?:por favor,?\s+)?prueba\s+(?:la|el)\s+(?:ventana|popup|descuento)\b/,
  /\bhaz\s+una\s+prueba\b(?!\s+de\s+compra)/,
  /\bprueba\s*a\s*\/\s*b\b|\ba\s*\/\s*b\s+test|\bab\s*test/,
  /\bcompar\w*\s+(?:las\s+)?(?:dos|ambas)\s+versiones\b/,
  /\bque\s+(?:funciona|vende|atrae)\s+(?:mejor|mas)\b/,
];
// The whole message is the question or the order: «para» is also «for» («un botón para la prueba gratis»).
export const AB_STATUS = /^\s*¿?\s*(?:c[oó]mo\s+va\s+(?:mi\s+|la\s+)?prueba(?:\s+a\s*\/\s*b)?|(?:los\s+)?resultados?\s+de\s+(?:la|mi)\s+prueba(?:\s+a\s*\/\s*b)?)\s*[?.!]*\s*$/i;
export const AB_END = /^\s*(?:por\s+favor,?\s+)?(?:termina|terminar|det[eé]n|detener|para|parar|cierra|acaba)\s+(?:la\s+|mi\s+)?prueba(?:\s+a\s*\/\s*b)?\s*[.!]*\s*$/i;
/** Status and end words are heard first by the caller; a request is everything else that asks to compare two versions. */
export const AB_REQUEST = { test: (text: string) => !AB_STATUS.test(text) && !AB_END.test(text) && REQUEST.some(rule => rule.test(fold(text))) } as const;

const LOOK_WORD = /estilo\s+([a-z]+)/g;
const lookIn = (text: string) => [...fold(text).matchAll(LOOK_WORD)].map(match => readPopupLook(match[1])).find((look): look is PopupLookId => Boolean(look)) ?? null;

export function abKind(text: string): 'popup' | 'design' {
  return /ventana|suscrip|popup|bienvenida|\d+\s*%/.test(fold(text)) || lookIn(text) ? 'popup' : 'design';
}

/** B's discount is the percent that is not today's (5–50); B's look is a named look that is not today's. Nothing new → null. */
export function readPopupVariant(text: string, current: { discount: number; look: PopupLookId }): { discount?: number; look?: PopupLookId } | null {
  const percents = [...text.matchAll(/(\d{1,3})\s*%/g)].map(match => Number(match[1])).filter(value => value >= 5 && value <= 50);
  const discount = percents.find(value => value !== current.discount);
  const look = lookIn(text);
  const variant = { ...(discount !== undefined ? { discount } : {}), ...(look && look !== current.look ? { look } : {}) };
  return Object.keys(variant).length ? variant : null;
}

/** The popup's own words name its percent («un 10 % de bienvenida»): B's words say B's percent instead. Only words that changed. */
export function popupWordsFor(settings: Record<string, unknown>, b: { discount?: number; percentA?: number }): Record<string, string> {
  if (!b.discount || !b.percentA) return {};
  const number = new RegExp(`(^|[^\\d])${b.percentA}(\\s*%)`, 'g');
  const words: Record<string, string> = {};
  // rewardLabel is the comeback card's promise, not the popup's (final review 2026-11-09).
  for (const key of ['signupTitle', 'signupBody', 'signupButton']) {
    const text = settings[key];
    if (typeof text === 'string' && number.test(text)) words[key] = text.replace(number, `$1${b.discount}$2`);
    number.lastIndex = 0;
  }
  return words;
}

const DAY = 86400000;
const wilson = (n: number, x: number) => {
  const z = 1.96, p = x / n, d = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [mid - half, mid + half];
};
/** Popup tests are judged on signups: 7 days, 100 visitors and 20 signups per version, then separated 95 % intervals. */
export function signupEvidence(a: { visitors: number; signups: number }, b: { visitors: number; signups: number }, startedAt: Date, now = new Date()): { winner: 'A' | 'B' | null; reason: string } {
  if (now.getTime() - startedAt.getTime() < 7 * DAY || Math.min(a.visitors, b.visitors) < 100 || Math.min(a.signups, b.signups) < 20) return { winner: null, reason: 'Recopilando datos: al menos 7 días, 100 visitantes y 20 suscripciones por versión.' };
  const ai = wilson(a.visitors, a.signups), bi = wilson(b.visitors, b.signups);
  const winner = ai[0] > bi[1] ? 'A' : bi[0] > ai[1] ? 'B' : null;
  return { winner, reason: winner ? 'Ventaja observada con intervalos de suscripción del 95% separados. Revisa los resultados antes de aplicar.' : 'Todavía no hay una diferencia clara entre las versiones.' };
}
/** No clear answer 28 days after the start (or after «Seguir 2 semanas más»): YAPI proposes keeping A. */
export function staleTest(startedAt: Date, extendedUntil: Date | null, now = new Date()): boolean {
  return now.getTime() >= Math.max(startedAt.getTime() + 28 * DAY, extendedUntil?.getTime() ?? 0);
}

export type AbSide = { visitors: number; buyers: number; signups: number };
export type AbNumbers = { kind: 'design' | 'popup'; request: string; days: number; a: AbSide; b: AbSide; winner: 'A' | 'B' | null; stale: boolean };
const rate = (side: AbSide, popup: boolean) => side.visitors ? (popup ? side.signups : side.buyers) / side.visitors : 0;
const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')} %`;

export function progressLine(t: AbNumbers): string {
  const popup = t.kind === 'popup';
  const count = (side: AbSide) => popup ? side.signups : side.buyers;
  const unit = count(t.a) === 1 ? (popup ? 'suscripción' : 'compra') : (popup ? 'suscripciones' : 'compras');
  const when = t.days ? `lleva ${t.days} ${t.days === 1 ? 'día' : 'días'}` : 'empezó hoy';
  return `Tu prueba de «${t.request}» ${when}: A tuvo ${t.a.visitors} ${t.a.visitors === 1 ? 'visitante' : 'visitantes'} y ${count(t.a)} ${unit}, B ${t.b.visitors} y ${count(t.b)}. `
    + (t.winner ? `${t.winner} va ganando con claridad.` : 'Todavía no hay una diferencia clara.');
}
export function endLine(t: AbNumbers): string {
  if (!t.winner) return `Pasaron ${t.days} días y no se nota diferencia entre A y B. Te recomiendo quedarte con A.`;
  const popup = t.kind === 'popup', win = t.winner === 'A' ? t.a : t.b, lose = t.winner === 'A' ? t.b : t.a, other = t.winner === 'A' ? 'B' : 'A';
  return popup
    ? `${t.winner} suscribe más: se suscribió el ${percent(rate(win, true))} de sus visitantes, contra ${percent(rate(lose, true))} en ${other}. ¿La dejo como tu ventana?`
    : `${t.winner} vende más: compró el ${percent(rate(win, false))} de sus visitantes, contra ${percent(rate(lose, false))} en ${other}. ¿La dejo como tu tienda?`;
}
