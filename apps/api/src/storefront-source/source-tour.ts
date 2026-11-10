/** YAPI store tour (spec 2026-11-09-yapi-tour): the steps YAPI walks the merchant through, built from the saved store (no model call). */
export type TourStep = { id: string; kind: 'part' | 'section' | 'product' | 'popup' | 'cart'; page: 'home' | 'product'; at?: number; part?: 'header' | 'main' | 'footer'; label: string };

/** Spanish names of the common home section types (anything else is «Sección n»). */
const SECTION_NAMES: Record<string, string> = {
  hero: 'Portada', products: 'Productos', 'featured-products': 'Productos destacados', categories: 'Categorías', reviews: 'Opiniones',
  testimonials: 'Opiniones', faq: 'Preguntas frecuentes', story: 'Nuestra historia', about: 'Nosotros', gallery: 'Fotos',
  banner: 'Banner', marquee: 'Texto en movimiento', newsletter: 'Suscripción', contact: 'Contacto', steps: 'Cómo funciona', trust: 'Confianza',
};

export function tourSteps(input: { layout: unknown[]; hasProduct: boolean; popupLookName: string }): TourStep[] {
  const steps: TourStep[] = [{ id: 'header', kind: 'part', page: 'home', part: 'header', label: 'Encabezado y menú' }];
  input.layout.forEach((raw, at) => {
    const block = (raw ?? {}) as { type?: unknown; title?: unknown };
    const title = typeof block.title === 'string' && block.title.trim() ? block.title.trim().slice(0, 60) : '';
    steps.push({ id: `home-${at}`, kind: 'section', page: 'home', at, label: title || SECTION_NAMES[String(block.type)] || `Sección ${at + 1}` });
  });
  // Live 2026-11-09 (Remolino): a store from before the section library keeps no layout — its whole home is one step.
  if (!input.layout.length) steps.push({ id: 'main', kind: 'part', page: 'home', part: 'main', label: 'Portada' });
  steps.push({ id: 'footer', kind: 'part', page: 'home', part: 'footer', label: 'Pie de página' });
  if (input.hasProduct) steps.push({ id: 'product', kind: 'product', page: 'product', label: 'Ficha de producto' });
  steps.push({ id: 'popup', kind: 'popup', page: 'home', label: `Tu ventana de suscripción — estilo ${input.popupLookName}` });
  steps.push({ id: 'cart', kind: 'cart', page: 'home', label: 'Carrito' });
  return steps;
}

export const stepLine = (step: TourStep, number: number, total: number) => `Paso ${number} de ${total} · ${step.label}. ¿Te gusta así o cambio algo?`;

/** «muéstrame mi tienda», «hazme un tour», «recorre/recorrer mi tienda». */
export const TOUR_REQUEST = /(?:mu[eé]strame|ens[eé][ñn]ame)\s+(?:toda\s+)?mi\s+tienda|hazme\s+un\s+(?:tour|recorrido)|recorr(?:e|er|amos)\s+(?:toda\s+)?mi\s+tienda|(?:sigue|segu[ií]|sigamos|contin[uú]a|continuemos|retoma|volvamos\s+a)\s+(?:con\s+)?(?:los\s+pasos|el\s+recorrido|el\s+tour)/i;

/** Owner 2026-11-09 («perdón me equivoqué, sí me gustaba»): a reply to «¿Qué le cambio?» that keeps the section as it is. */
const KEEP = /me\s+gusta(?:ba)?|d[eé]ja(?:la|lo)|est[aá]\s+bien|as[ií]\s+est[aá]|me\s+equivoqu|no\s+(?:la|lo)\s+cambies|no\s+cambies|ning[uú]n\s+cambio|^\s*(?:nada|sigue|siguiente|contin[uú]a|ok|vale|listo)\b/i;
const CHANGE = /\b(?:pero|cambi|pon|ponle|quit|agreg|a[ñn]ad|haz|hazla|m[aá]s|menos|otr[oa]|color|foto|texto|t[ií]tulo|borra|sac)/i;
export const keepsStep = (text: string) => KEEP.test(text) && !CHANGE.test(text.replace(/me\s+equivoqu\w*|no\s+(?:la\s+|lo\s+)?cambies|ning[uú]n\s+cambio/gi, ''));

const PART_NAMES: Record<string, string> = { header: 'el encabezado y menú', main: 'la portada', footer: 'el pie de página', product: 'la ficha de producto', popup: 'la ventana de suscripción', cart: 'el carrito' };
/** The merchant's reply to «¿Qué le cambio?» is focused on that step: a home section as if pointed at in the preview, any other step
 *  named in the request. `tourStepId` tells the job to ask «¿Así está bien?» once the edit ends. */
export function tourFocus<T extends { instruction: string }>(input: T, step: TourStep): T & { selection?: { sectionId: string; page: string; at: number }; tourStepId: string; tourWords: string } {
  const tourWords = input.instruction.trim();
  if (step.kind === 'section' && typeof step.at === 'number') return { ...input, selection: { sectionId: step.id, page: step.page, at: step.at }, tourStepId: step.id, tourWords };
  const name = PART_NAMES[step.part ?? step.kind] ?? step.label.toLowerCase();
  return { ...input, instruction: `En ${name}: ${tourWords}`, tourStepId: step.id, tourWords };
}
