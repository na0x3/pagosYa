import { COMMERCE_TEMPLATES_FILE, type SurfacePart } from './surface-parts';
import type { SurfacesOutcome } from './surface-stage';

const own = (text: string) => (text.split('Pedido actual del comercio:').at(-1) ?? text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** The header's cart control (icon, button, badge, placement) is a controls request (store-controls-design.ts), never a part. */
const HEADER_CART = /\b(?:icono|boton|simbolo|insignia|contador)\s+(?:del?\s+)?carrito\b|\bcarrito\s+(?:del?\s+|de\s+la\s+|en\s+(?:el|la)\s+)?(?:encabezado|header|menu|barra|navegacion|cabecera)\b/g;

/** Spec 2026-10-15: the parts a chat request names; a request for the cart redesigns its panel and its lines together. */
export function requestedSurfaceParts(instruction: string): SurfacePart[] {
  const t = own(instruction).replace(HEADER_CART, ' ');
  const parts: SurfacePart[] = [];
  if (/\btarjetas?\s+de(?:l)?\s+productos?\b|\btarjetas?\s+del\s+catalogo\b|\bproduct\s+cards?\b/.test(t)) parts.push('card');
  if (/\bpagina\s+de(?:l)?\s+productos?\b|\bficha\b|\bproduct\s+page\b/.test(t)) parts.push('productPage');
  if (/\b(?:carrito|canasta|bolsa\s+de\s+compras)\b/.test(t)) parts.push('cart', 'cartLine');
  if (/\baviso\b.{0,30}\bagreg|\bal\s+agregar\b|\bmensaje\s+de\s+(?:agregado|anadido)\b/.test(t)) parts.push('added');
  if (/\bcheckout\b|\bpagina\s+de\s+pago\b|\bpantalla\s+de\s+pago\b|\bel\s+pago\b|\bcaja\s+de\s+pago\b/.test(t)) parts.push('checkout');
  return parts;
}

/** Which commerce-templates.json the save carries (spec 2026-10-15, Review Focus 5). */
export function surfacesAfterStage(input: { previousFiles: Array<{ path: string; content: string }>; outcome: SurfacesOutcome | null; fresh: boolean }): { file?: string } {
  if (input.outcome?.file) return { file: input.outcome.file };
  if (input.fresh) return {};
  const previous = input.previousFiles.find(f => f.path === COMMERCE_TEMPLATES_FILE)?.content;
  return previous ? { file: previous } : {};
}
