/** First-store walkthrough state (spec 2026-10-11 Elige tu estilo, C1). Pure: the service persists what this returns. */
export const ONBOARDING_STEPS = ['name', 'what', 'logo', 'photos', 'products', 'story', 'contact'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type StoreOnboarding = { version: 1; step: number; done: string[]; skipped: string[]; what?: string; story?: string; photos?: string[]; contact?: { whatsapp?: string; city?: string }; finishedAt?: string };
export type StoreOnboardingPatch = { step?: number; done?: OnboardingStep[]; skipped?: OnboardingStep[]; what?: string; story?: string; photos?: string[]; contact?: { whatsapp?: string; city?: string }; finished?: boolean };

const steps = (list: unknown[] | undefined) => (list ?? []).filter((step): step is OnboardingStep => ONBOARDING_STEPS.includes(step as OnboardingStep));
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const UPLOAD = /^\/v1\/uploads\/[A-Za-z0-9._-]+$/;

export function mergeOnboarding(current: unknown, patch: StoreOnboardingPatch): StoreOnboarding {
  const base: StoreOnboarding = current && typeof current === 'object' && (current as StoreOnboarding).version === 1 ? current as StoreOnboarding : { version: 1, step: 0, done: [], skipped: [] };
  const done = [...new Set([...base.done, ...steps(patch.done)])];
  const skipped = [...new Set([...base.skipped, ...steps(patch.skipped)])].filter(step => !done.includes(step));
  const photos = patch.photos ? patch.photos.filter(url => UPLOAD.test(url)).slice(0, 20) : base.photos;
  const contact = patch.contact ? { ...(text(patch.contact.whatsapp, 30) ? { whatsapp: text(patch.contact.whatsapp, 30) } : {}), ...(text(patch.contact.city, 80) ? { city: text(patch.contact.city, 80) } : {}) } : base.contact;
  const what = text(patch.what, 300) ?? base.what;
  const story = text(patch.story, 1200) ?? base.story;
  return { version: 1, step: Math.max(base.step, Math.min(ONBOARDING_STEPS.length, Math.max(0, patch.step ?? 0))), done, skipped,
    ...(what ? { what } : {}), ...(story ? { story } : {}), ...(photos?.length ? { photos } : {}), ...(contact && Object.keys(contact).length ? { contact } : {}),
    ...(base.finishedAt ? { finishedAt: base.finishedAt } : patch.finished ? { finishedAt: new Date().toISOString() } : {}) };
}

export function onboardingBrief(storeName: string, onboarding: StoreOnboarding, products: Array<{ name: string; amount: number }>): string {
  const price = (amount: number) => `Bs ${(amount / 100).toFixed(amount % 100 ? 2 : 0)}`;
  return [
    `Mi negocio se llama ${storeName}.`,
    onboarding.what ? `Qué hacemos: ${onboarding.what}` : '',
    onboarding.story ? `Nuestra historia: ${onboarding.story}` : '',
    onboarding.contact?.city ? `Estamos en ${onboarding.contact.city}.` : '',
    onboarding.contact?.whatsapp ? `WhatsApp: ${onboarding.contact.whatsapp}` : '',
    products.length ? `Productos: ${products.map(product => `${product.name} a ${price(product.amount)}`).join('; ')}.` : '',
    'Crea mi tienda.',
  ].filter(Boolean).join('\n');
}
