/** First-store walkthrough state (spec 2026-10-11 Elige tu estilo, C1; the sell step: spec 2026-10-13). Pure: the service persists what this returns. */
import { PRIMARY_ACTION_KINDS, type PrimaryActionKind } from '../storefront-source/source-primary-action';
import { detectKind, PLAYBOOK } from '../storefront-source/design-engine/playbook';

/** Spec 2026-10-14 store voice: answers to the kind questions, word for word, at most 6, each clamped to 400 characters like `story`. */
export type OnboardingAnswer = { question: string; answer: string };
export const ONBOARDING_ANSWERS_MAX = 6;
export const ONBOARDING_ANSWER_CHARS = 400;

export const ONBOARDING_STEPS = ['name', 'what', 'sell', 'logo', 'photos', 'products', 'story', 'contact'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingAction = { kind: PrimaryActionKind; value?: string };
export type StoreOnboarding = { version: 1; step: number; done: string[]; skipped: string[]; what?: string; story?: string; answers?: OnboardingAnswer[]; photos?: string[]; contact?: { whatsapp?: string; city?: string }; purpose?: 'shop' | 'showcase'; primaryAction?: OnboardingAction; finishedAt?: string };
export type StoreOnboardingPatch = { step?: number; done?: OnboardingStep[]; skipped?: OnboardingStep[]; what?: string; story?: string; answers?: Array<{ question?: unknown; answer?: unknown }>; photos?: string[]; contact?: { whatsapp?: string; city?: string }; purpose?: 'shop' | 'showcase'; primaryAction?: { kind?: unknown; value?: unknown }; finished?: boolean; brief?: boolean };

const steps = (list: unknown[] | undefined) => (list ?? []).filter((step): step is OnboardingStep => ONBOARDING_STEPS.includes(step as OnboardingStep));
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const UPLOAD = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;

/** A patch's answers on top of the saved ones: the newest answer to a question wins, a blank one clears it, the newest 6 stay. */
function mergeAnswers(base: OnboardingAnswer[] = [], patch: Array<{ question?: unknown; answer?: unknown }>): OnboardingAnswer[] {
  const byQuestion = new Map(base.map(entry => [entry.question.toLowerCase(), entry]));
  for (const entry of patch) {
    const question = text(entry?.question, 200);
    if (!question) continue;
    const answer = text(entry?.answer, ONBOARDING_ANSWER_CHARS);
    byQuestion.delete(question.toLowerCase());
    if (answer) byQuestion.set(question.toLowerCase(), { question, answer });
  }
  return [...byQuestion.values()].slice(-ONBOARDING_ANSWERS_MAX);
}

export function mergeOnboarding(current: unknown, patch: StoreOnboardingPatch): StoreOnboarding {
  const base: StoreOnboarding = current && typeof current === 'object' && (current as StoreOnboarding).version === 1 ? current as StoreOnboarding : { version: 1, step: 0, done: [], skipped: [] };
  const done = [...new Set([...base.done, ...steps(patch.done)])];
  const skipped = [...new Set([...base.skipped, ...steps(patch.skipped)])].filter(step => !done.includes(step));
  const photos = patch.photos ? patch.photos.filter(url => UPLOAD.test(url)).slice(0, 20) : base.photos;
  const contact = patch.contact ? { ...(text(patch.contact.whatsapp, 30) ? { whatsapp: text(patch.contact.whatsapp, 30) } : {}), ...(text(patch.contact.city, 80) ? { city: text(patch.contact.city, 80) } : {}) } : base.contact;
  const what = text(patch.what, 300) ?? base.what;
  // Owner 2026-10-16: the story step is one free box for everything the merchant wants YAPI to know.
  const story = text(patch.story, 4000) ?? base.story;
  const answers = patch.answers ? mergeAnswers(base.answers, patch.answers) : base.answers;
  const purpose = patch.purpose === 'shop' || patch.purpose === 'showcase' ? patch.purpose : base.purpose;
  const actionValue = text(patch.primaryAction?.value, 300);
  const primaryAction: OnboardingAction | undefined = patch.primaryAction && PRIMARY_ACTION_KINDS.includes(patch.primaryAction.kind as PrimaryActionKind)
    ? { kind: patch.primaryAction.kind as PrimaryActionKind, ...(actionValue ? { value: actionValue } : {}) } : base.primaryAction;
  return { version: 1, step: Math.max(base.step, Math.min(ONBOARDING_STEPS.length, Math.max(0, patch.step ?? 0))), done, skipped,
    ...(what ? { what } : {}), ...(story ? { story } : {}), ...(answers?.length ? { answers } : {}), ...(photos?.length ? { photos } : {}), ...(contact && Object.keys(contact).length ? { contact } : {}),
    ...(purpose ? { purpose } : {}), ...(primaryAction ? { primaryAction } : {}),
    ...(base.finishedAt ? { finishedAt: base.finishedAt } : patch.finished ? { finishedAt: new Date().toISOString() } : {}) };
}

/** The kind questions the story step asks (spec 2026-10-14 store voice), from the merchant's «¿Qué vendes?» answer. */
export function onboardingQuestions(onboarding: { what?: string } | null | undefined): string[] {
  return [...PLAYBOOK[detectKind(onboarding?.what ?? '')].questions];
}

export function onboardingBrief(storeName: string, onboarding: StoreOnboarding, products: Array<{ name: string; amount: number }>): string {
  const price = (amount: number) => `Bs ${(amount / 100).toFixed(amount % 100 ? 2 : 0)}`;
  return [
    `Mi negocio se llama ${storeName}.`,
    onboarding.what ? `Qué hacemos: ${onboarding.what}` : '',
    onboarding.story ? `Lo que quiero que sepas de mi negocio:\n${onboarding.story}` : '',
    ...(onboarding.answers ?? []).map(entry => `${entry.question} ${entry.answer}`),
    onboarding.contact?.city ? `Estamos en ${onboarding.contact.city}.` : '',
    onboarding.contact?.whatsapp ? `WhatsApp: ${onboarding.contact.whatsapp}` : '',
    products.length ? `Productos: ${products.map(product => `${product.name} a ${price(product.amount)}`).join('; ')}.` : '',
    onboarding.purpose === 'showcase' ? 'No vendemos en línea: el sitio muestra el negocio y lleva a su acción principal.' : '',
    onboarding.purpose === 'showcase' ? 'Crea mi sitio.' : 'Crea mi tienda.',
  ].filter(Boolean).join('\n');
}
