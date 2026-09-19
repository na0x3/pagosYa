import { sourceRedesignRequested } from './source-context';

export const SOURCE_VISUAL_DOMAINS = ['typography', 'spacing', 'palette', 'icons', 'background', 'motion', 'header', 'footer', 'responsive', 'product', 'cart', 'checkout'] as const;
export type SourceVisualDomain = typeof SOURCE_VISUAL_DOMAINS[number];
export type SourceRequestProfile = {
  scope: 'full-redesign' | 'visual-refinement' | 'targeted-visual' | 'functional-or-content';
  userLanguage: string;
  visualDomains: SourceVisualDomain[];
  targetedFeature?: 'marquee';
  preserve: string[];
  acceptanceCriteria: string[];
};

const ALL_VISUAL_DOMAINS = [...SOURCE_VISUAL_DOMAINS];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const has = (task: string, pattern: RegExp) => pattern.test(task);

/**
 * Converts ordinary merchant language into a small internal design brief.
 * The merchant never sees this object and never needs design vocabulary.
 */
export function sourceRequestProfile(instruction: string, hasExistingSite: boolean): SourceRequestProfile {
  const task = normalize(instruction.split('Pedido actual del comercio:').at(-1) || instruction).trim();
  const redesign = sourceRedesignRequested(instruction);
  const marqueeRequested = has(task, /\b(?:marquesin\w*|marquee|ticker|announcement|banner)\b/);
  const marqueeOnly = marqueeRequested && !has(task, /\b(?:seccion|section|everywhere|cada|every|sitio|site|pagina|page|hero|header|footer|catalog|producto|product|cart|checkout|redisen|redesign|whole|entera|entero|todo|toda)\b/);
  const visual = has(task, /\b(diseno|dise[nñ]a|estilo|visual|bonit|lind|mejor|mejora|better|great|pretty|beautiful|professional|premium|elegan|modern|clean|limpi|sofistic|luxur|look|aparien|colou?r|color|tipograf|fuente|icon|animat|motion|spacing|espaci|margen|header|footer|encabezado|pie)\w*/);
  const vagueVisual = has(task, /\b(?:haz(?:lo)?|que\s+se\s+vea|se\s+vea|make(?:\s+it)?|give(?:\s+it)?|dame|quiero(?:\s+que\s+sea)?|want)\b.{0,60}\b(?:bonit|lind|mejor|better|pretty|beautiful|professional|look|bien|good|great|premium|pro|elegan|modern|clean|limpi|sofistic|luxur)\w*/)
    || has(task, /\b(?:mejora|improve|polish|arregla|fix)\b.{0,40}\b(?:diseno|design|sitio|site|pagina|page|tienda|storefront|visual|look|appearance)\w*/);
  const contentChange = has(task, /\b(?:agrega|anade|add|create|crea|elimina|delete|remove|actualiza|update)\b.{0,50}\b(?:productos?|products?|precio|price|horario|hours?|enlace|link|instagram|facebook)\b/)
    || has(task, /\b(?:cambia|change)\b.{0,30}\b(?:precio|price|horario|hours?)\b/);
  const domains: SourceVisualDomain[] = [];
  const add = (domain: SourceVisualDomain, pattern: RegExp) => { if (has(task, pattern) && !domains.includes(domain)) domains.push(domain); };
  add('typography', /tipograf|fuente|font|titulo|title|legible|readab|letra/);
  add('spacing', /espaci|margen|padding|gap|separac|breath|compact|crowd/);
  add('palette', /color|paleta|palette|fondo|background|tono|tone/);
  add('icons', /icon|simbol|glyph/);
  add('background', /fondo|background|textura|pattern|motif|atmosfer/);
  add('motion', /animat|animac|motion|movimiento|transicion|transition|hover|marquesin|marquee|ticker|announcement|banner/);
  add('header', /header|encabezado|navegacion|navigation|menu|top bar|arriba/);
  add('footer', /footer|pie de pagina|pie/);
  add('responsive', /movil|mobil|mobile|responsive|celular|telefono|390|320/);
  add('product', /producto|product|catalogo|catalog|foto|imagen|image|card|tarjeta/);
  add('cart', /carrito|cart|pedido|order/);
  add('checkout', /checkout|pago|payment|compra|comprar/);
  const fullVisual = redesign || vagueVisual || (visual && domains.length === 0);
  const scope = contentChange ? 'functional-or-content' : redesign ? 'full-redesign' : fullVisual ? 'visual-refinement' : domains.length ? 'targeted-visual' : 'functional-or-content';
  const visualDomains = contentChange ? [] : fullVisual ? ALL_VISUAL_DOMAINS : domains;
  const preserve = ['real products, prices, stock and business facts', 'uploaded photos and confirmed asset roles', 'cart, payment, checkout and platform-owned commerce hooks', 'working links, accessibility and readable content'];
  const acceptanceCriteria = [
    'Use one coherent visual language across homepage, product page, cart, checkout, header and footer.',
    'Use normal flow and natural wrapping; no clipped, overlapping or unreadable text or controls.',
    'Keep mobile usable at 320px and 390px, with visible navigation and 44px purchase controls.',
  ];
  if (visualDomains.includes('icons')) acceptanceCriteria.push('Use one local icon family with consistent stroke weight and semantic labels.');
  if (visualDomains.includes('motion')) acceptanceCriteria.push('Use purposeful motion with a complete reduced-motion fallback.');
  if (visualDomains.includes('product')) acceptanceCriteria.push('Keep each real product name, price and purchase action together.');
  if (marqueeOnly) acceptanceCriteria.push('For a marquee or announcement request, edit only the existing marquee/announcement component and its scoped styles or behavior. Do not remove it or rewrite the hero, header, footer, or unrelated sections.');
  return { scope, userLanguage: instruction.trim().slice(0, 1000), visualDomains, ...(marqueeOnly ? { targetedFeature: 'marquee' as const } : {}), preserve, acceptanceCriteria };
}

export function sourceRequestProfilePrompt(profile: SourceRequestProfile): string {
  return `Internal request interpretation. The merchant used ordinary language; do not ask them for technical design instructions. Treat this as a ${profile.scope} request. Apply these visual domains as appropriate: ${profile.visualDomains.join(', ')}. Preserve: ${profile.preserve.join('; ')}. Acceptance criteria: ${profile.acceptanceCriteria.join(' ')}`;
}

/**
 * Turns the merchant's latest message into the authoritative execution block.
 * History and saved context may explain the request, but never replace it.
 */
export function sourceRequestExecutionPrompt(instruction: string, hasExistingSite: boolean): string {
  const current = instruction.trim().slice(0, 12000);
  const profile = sourceRequestProfile(current, hasExistingSite);
  return [
    'CURRENT MERCHANT REQUEST — HIGHEST PRIORITY',
    'Implement every explicit change in this message in the returned source. Do not satisfy only the conversation summary, a previous request, a browser observation, or a default theme.',
    `Scope: ${profile.scope}. Affected domains: ${profile.visualDomains.join(', ') || 'content or functionality'}.`,
    `Preserve unless this message explicitly changes it: ${profile.preserve.join('; ')}.`,
    `Acceptance criteria for this request: ${profile.acceptanceCriteria.join(' ')}`,
    'If the request names a feature that is missing from the current source, add the rendered markup and its scoped styles/behavior in the existing page or component that owns that surface. CSS-only changes are not sufficient when the request asks for a new visible element or interaction.',
    'Do not return a successful no-op. If the requested result cannot be implemented safely, fail with a precise reason instead of claiming that the change was saved.',
    `Current request copy:\n${current}`,
  ].join('\n\n');
}

export const SOURCE_NATURAL_LANGUAGE_REQUESTS = `Merchants will use short, imprecise requests such as "hazlo más bonito", "que se vea profesional", "cambia los iconos", "arregla el móvil" or "rediseña todo". Never require them to mention tokens, breakpoints, component names, icon libraries, CSS, typography systems or animation APIs. Interpret their natural language internally, choose the missing design decisions from the saved theme, brand, assets and visual system, and pass the generator a concrete internal brief. A vague visual request should improve the complete visual system coherently while preserving products, photos, facts and commerce. A narrow request should change only its affected domain. Never expose internal manifest names or technical requirements in the merchant-facing reply.`;
