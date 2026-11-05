import type { AgentModel, AgentModelTurn, AgentToolDefinition } from './agent-loop';

/** Spec 2026-11-04 §5: the only problems the review may block on (seen on BOXY dvgx25dl/eajm1flt and Láminas kvued320). */
export const HOME_REVIEW_PROBLEMS = [
  'texto difícil de leer sobre una foto',
  'texto claro sobre una foto clara',
  'título tocado o tapado por una imagen',
  'palabras cortadas',
  'imagen vacía o rota',
  'sección que se ve sin terminar',
  'dos secciones que se ven iguales',
] as const;

export const HOME_REVIEW_TOOL: AgentToolDefinition = {
  type: 'function', name: 'report', strict: true,
  description: 'Informa los problemas que bloquean (lista vacía si no hay ninguno).',
  parameters: { type: 'object', additionalProperties: false, required: ['problemas'], properties: { problemas: { type: 'array', maxItems: 6, items: {
    type: 'object', additionalProperties: false, required: ['problema', 'donde', 'arreglo'],
    properties: { problema: { type: 'string', enum: [...HOME_REVIEW_PROBLEMS] }, donde: { type: 'string' }, arreglo: { type: 'string' } } } } } },
};

export function homeReviewInstructions(): string {
  return `Revisas la portada de una tienda antes de publicarla. Recibes dos capturas de página entera: escritorio (1280 px) y celular (390 px).
Informa SOLO estos problemas, cuando se ven claramente: ${HOME_REVIEW_PROBLEMS.join('; ')}.
No opines de gustos, colores, fuentes ni textos. «donde»: la sección (por ejemplo «portada», «tercera sección», «pie»). «arreglo»: una frase concreta.
Si no hay ninguno, llama report con una lista vacía. Llama siempre report.`;
}

export type HomeReviewer = (images: string[]) => Promise<string[]>;

/** The review's answer as lines for the writer; anything unreadable is no problem (a review never blocks by failing). */
export function readHomeReview(turn: AgentModelTurn): string[] {
  const report = turn.calls.find(call => call.name === 'report');
  if (!report) return [];
  try {
    const list = (JSON.parse(report.arguments) as { problemas?: unknown }).problemas;
    return (Array.isArray(list) ? list : []).flatMap(entry => {
      const { problema, donde, arreglo } = (entry ?? {}) as Record<string, unknown>;
      return (HOME_REVIEW_PROBLEMS as readonly string[]).includes(String(problema)) && typeof donde === 'string' && typeof arreglo === 'string'
        ? [`${problema} — ${donde.trim()}: ${arreglo.trim()}`] : [];
    }).slice(0, 6);
  } catch { return []; }
}

export function createHomeReviewer(model: AgentModel): HomeReviewer {
  return async images => readHomeReview(await model({
    instructions: homeReviewInstructions(), tools: [HOME_REVIEW_TOOL],
    transcript: [{ role: 'user', content: [{ type: 'input_text', text: 'Capturas de la portada: primero escritorio, luego celular.' },
      ...images.map(image_url => ({ type: 'input_image', image_url, detail: 'high' }))] }],
  }));
}
