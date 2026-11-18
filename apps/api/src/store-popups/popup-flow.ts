/** Popups 2.0 (spec 2026-11-18 §4): the steps the platform understands and the rules a YAPI flow must follow. */
export const POPUP_STEP_KINDS = ['offer', 'game', 'pick', 'quiz', 'capture', 'reveal', 'land'] as const;
export type PopupStepKind = (typeof POPUP_STEP_KINDS)[number];
export type QuizQuestion = { id: string; text: string; answers: Array<{ id: string; text: string; products: string[] }> };
export type PopupStep =
  | { id: string; kind: 'offer' }
  | { id: string; kind: 'game'; game: 'scratch' | 'wheel' }
  | { id: string; kind: 'pick'; products: string[] }
  | { id: string; kind: 'quiz'; questions: QuizQuestion[] }
  | { id: string; kind: 'capture' }
  | { id: string; kind: 'reveal' }
  | { id: string; kind: 'land'; to: 'product' | 'scroll' };
export type PopupFlow = PopupStep[];

const ID = /^[a-z][a-z0-9-]{0,23}$/;
const line = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const renderedSteps = (flow: PopupFlow) => flow.filter(step => step.kind !== 'land');

export function validateFlow(raw: unknown, products: readonly string[]): { flow: PopupFlow } | { problems: string[] } {
  const problems: string[] = [];
  const known = new Set(products);
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 2 || list.length > 6) problems.push('El flujo necesita de 2 a 6 pasos.');
  const flow: PopupFlow = [];
  for (const item of list as Array<Record<string, any>>) {
    const id = String(item?.id ?? '');
    if (!ID.test(id) || flow.some(step => step.id === id)) { problems.push(`Paso con id inválido o repetido: ${id || '(vacío)'}.`); continue; }
    switch (item?.kind) {
      case 'offer': case 'capture': case 'reveal': flow.push({ id, kind: item.kind }); break;
      case 'game': flow.push({ id, kind: 'game', game: item.game === 'wheel' ? 'wheel' : 'scratch' }); break;
      case 'land': flow.push({ id, kind: 'land', to: item.to === 'scroll' ? 'scroll' : 'product' }); break;
      case 'pick': flow.push({ id, kind: 'pick', products: (Array.isArray(item.products) ? item.products : []).map(String).filter((p: string) => known.has(p)).slice(0, 6) }); break;
      case 'quiz': {
        const questions: QuizQuestion[] = (Array.isArray(item.questions) ? item.questions : []).slice(0, 3).map((q: any, qi: number) => ({
          id: ID.test(String(q?.id)) ? String(q.id) : `q${qi + 1}`, text: line(q?.text, 120),
          answers: (Array.isArray(q?.answers) ? q.answers : []).slice(0, 6).map((a: any, ai: number) => ({
            id: ID.test(String(a?.id)) ? String(a.id) : `a${ai + 1}`, text: line(a?.text, 60),
            products: (Array.isArray(a?.products) ? a.products : []).map(String).filter((p: string) => known.has(p)).slice(0, 3) })) }));
        if (!questions.length || questions.some(q => !q.text || q.answers.length < 2)) problems.push('Cada pregunta del quiz necesita texto y al menos 2 respuestas.');
        if (questions.some(q => q.answers.some(a => !a.products.length))) problems.push('Hay una respuesta sin productos.');
        flow.push({ id, kind: 'quiz', questions });
        break;
      }
      default: problems.push(`Paso desconocido: ${String(item?.kind)}.`);
    }
  }
  const kinds = flow.map(step => step.kind);
  if (kinds.filter(k => k === 'game').length > 1) problems.push('Un flujo lleva un solo juego.');
  // Part 1 ruling (2026-11-18): the runtime does not play scratch/wheel inside a YAPI design yet; today's games keep their own popup.
  if (kinds.includes('game')) problems.push('Los juegos todavía no van en los popups de YAPI: usa offer, pick o quiz.');
  const capture = kinds.indexOf('capture'), reveal = kinds.indexOf('reveal');
  if (capture < 0) problems.push('Falta el paso capture (WhatsApp o email).');
  if (reveal >= 0 && (capture < 0 || capture > reveal)) problems.push('El paso capture va antes que reveal.');
  if (kinds.includes('land') && kinds.indexOf('land') !== kinds.length - 1) problems.push('El paso land va último.');
  const productSteps = flow.filter(step => step.kind === 'pick' || step.kind === 'quiz');
  if (productSteps.length && known.size < 2) problems.push('Los pasos de productos necesitan al menos 2 productos en la tienda.');
  for (const step of flow) if (step.kind === 'pick' && step.products.length < 2 && known.size >= 2) problems.push(`El paso ${step.id} necesita al menos 2 productos.`);
  return problems.length ? { problems } : { flow };
}
