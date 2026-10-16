import { merchantOwnWords, withoutHeaderCart } from '../kit-touch';
import { COMMERCE_TEMPLATES_FILE, type SurfacePart } from './surface-parts';
import type { SurfacesOutcome } from './surface-stage';

const PARTS: Array<{ parts: SurfacePart[]; noun: string }> = [
  { parts: ['card'], noun: String.raw`tarjetas?\s+de(?:l)?\s+(?:productos?|catalogo)|product\s+cards?` },
  { parts: ['productPage'], noun: String.raw`pagina\s+de(?:l)?\s+productos?|ficha(?!\s+tecnica)|product\s+page` },
  { parts: ['cart', 'cartLine'], noun: String.raw`carrito|canasta|bolsa\s+de\s+compras` },
  { parts: ['added'], noun: String.raw`aviso\s+(?:al|de|cuando)\s+(?:agrega|anad)\w*|mensaje\s+de\s+(?:agregado|anadido)` },
  { parts: ['checkout'], noun: String.raw`checkout|pagina\s+de\s+pago|pantalla\s+de\s+pago|caja\s+de\s+pago|el\s+pago` },
];
/** A design request: a verb that changes how something looks, or a judgement of its look. */
const VERB = String.raw`(?:haz(?:lo|la|los|las)?|hacer|cambia\w*|redisen\w*|disen\w*|mejora\w*|arregla\w*|personaliza\w*|moderniza\w*|renueva\w*|embellec\w*)`;
const JUDGEMENT = String.raw`(?:mas\s+bonit\w*|fe[oa]s?|elegante|moderno|anticuad\w*|aburrid\w*|se\s+ve\s+mal|no\s+me\s+gusta)`;
const designed = (text: string, noun: string) =>
  new RegExp(String.raw`\b${VERB}\b(?:\s+\S+){0,3}?\s+(?:${noun})\b`).test(text)
  || new RegExp(String.raw`\b(?:${noun})\b(?:\s+\S+){0,4}?\s+${JUDGEMENT}`).test(text)
  || new RegExp(String.raw`\b${JUDGEMENT}\b(?:\s+\S+){0,3}?\s+(?:${noun})\b`).test(text);

/** Spec 2026-10-15: the parts a chat request asks to redesign (review I6). The header's cart control (icon, badge, drawing,
 *  placement, also under the store's own cart word) stays a controls request; a passing mention of a part changes nothing. */
export function requestedSurfaceParts(instruction: string): SurfacePart[] {
  const text = withoutHeaderCart(merchantOwnWords(instruction).replace(/\b(?:canasta|cesta|bolsa)\b(?!\s+de\s+compras)/g, 'carrito'));
  return PARTS.filter(({ noun }) => designed(text, noun)).flatMap(({ parts }) => parts);
}

/** Which commerce-templates.json the save carries (spec 2026-10-15, Review Focus 5). */
export function surfacesAfterStage(input: { previousFiles: Array<{ path: string; content: string }>; outcome: SurfacesOutcome | null; fresh: boolean }): { file?: string } {
  if (input.outcome?.file) return { file: input.outcome.file };
  if (input.fresh) return {};
  const previous = input.previousFiles.find(f => f.path === COMMERCE_TEMPLATES_FILE)?.content;
  return previous ? { file: previous } : {};
}

/** The background review's N+1 save is assembled without the file (it is added after the save assembly), so it carries
 *  revision N's, as withSavedCatalog carries N's catalog (review C2). */
export function carryCommerceTemplates<F extends { path: string; content: string }>(savedFiles: F[], files: F[]): F[] {
  if (files.some(f => f.path === COMMERCE_TEMPLATES_FILE)) return files;
  const saved = savedFiles.find(f => f.path === COMMERCE_TEMPLATES_FILE);
  return saved ? [...files, saved] : files;
}
