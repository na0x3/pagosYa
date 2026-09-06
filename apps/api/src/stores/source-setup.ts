export type SetupStep = 'business' | 'logo' | 'products' | 'colors' | 'review';
export type SourceSetupDraft = { step: SetupStep; answers: Record<string, string>; assetUrls: string[] };
export const newSourceSetup = (): SourceSetupDraft => ({ step: 'business', answers: {}, assetUrls: [] });
export function sourceSetupPrompt(draft: SourceSetupDraft, store: { name: string; logoUrl?: string | null; _count?: { paymentLinks: number } }) {
  const options: Array<{ label: string; value: string; action?: 'generate' | 'restart' }> = [];
  let prompt = '';
  switch (draft.step) {
    case 'business': prompt = `Vamos a crear el sitio de ${store.name}. Primero: ¿qué vendes, a quién y qué hace especial a tu negocio? Después veremos tu logo, productos y colores.`; break;
    case 'logo':
      prompt = '¿Tienes un logo? Adjunta su imagen y cuéntame cómo quieres usarla. También podemos empezar con el nombre del negocio.';
      if (store.logoUrl) options.push({ label: 'Usar mi logo actual', value: 'Usar mi logo actual' });
      options.push({ label: 'Solo el nombre por ahora', value: 'Usar el nombre del negocio, sin logo por ahora' }); break;
    case 'products':
      prompt = `Tu catálogo tiene ${store._count?.paymentLinks || 0} productos. ¿Cuáles quieres destacar y cómo los organizarías? Puedes agregar productos, fotos, precios y stock en Productos y volver aquí. El sitio usará ese mismo catálogo y el checkout de pagosYa.`;
      options.push({ label: 'Usar mi catálogo', value: 'Usar el catálogo actual y sus categorías' }, { label: 'Agregaré productos después', value: 'Preparar el sitio con el catálogo disponible; agregaré productos después, sin inventar artículos ni precios' }); break;
    case 'colors':
      prompt = '¿Qué colores y estilo representan tu marca? Puedes escribir nombres, códigos de color o describir un sitio que te guste.';
      options.push({ label: 'Que YAPI proponga', value: 'Propón una paleta y una dirección visual propias para este negocio' }); break;
    case 'review':
      prompt = `Este es el punto de partida:\n\nNegocio: ${draft.answers.business}\nLogo: ${draft.answers.logo}\nCatálogo: ${draft.answers.products}\nColores y estilo: ${draft.answers.colors}\n\n¿Creamos la primera versión? También puedes escribir un ajuste antes de comenzar.`;
      if (draft.answers.adjustments) prompt += `\n\nAjustes: ${draft.answers.adjustments}`;
      options.push({ label: 'Crear mi sitio', value: 'Crear mi sitio con estos detalles', action: 'generate' }, { label: 'Rehacer las respuestas', value: 'Volver a las preguntas iniciales', action: 'restart' }); break;
  }
  return { step: draft.step, prompt, options };
}
