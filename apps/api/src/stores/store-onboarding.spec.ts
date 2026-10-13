import { mergeOnboarding, onboardingBrief, ONBOARDING_STEPS } from './store-onboarding';

it('records steps as done or skipped, keeps the furthest step and ignores unknown steps', () => {
  let state = mergeOnboarding(null, { step: 1, done: ['name'] });
  state = mergeOnboarding(state, { step: 2, done: ['what'], what: '  Café de especialidad en Sopocachi  ' });
  state = mergeOnboarding(state, { step: 3, skipped: ['logo', 'nope' as any] });
  expect(state).toMatchObject({ version: 1, step: 3, done: ['name', 'what'], skipped: ['logo'], what: 'Café de especialidad en Sopocachi' });
  expect(mergeOnboarding(state, { step: 1 }).step).toBe(3);
  expect(ONBOARDING_STEPS).toEqual(['name', 'what', 'sell', 'logo', 'photos', 'products', 'story', 'contact']);
});

it('caps text, photo count and contact fields, and stamps the finish once', () => {
  const state = mergeOnboarding(null, { story: 'x'.repeat(5000), photos: Array.from({ length: 40 }, (_, i) => `/v1/uploads/p${i}.webp`), contact: { whatsapp: '+591 70000000', city: 'La Paz' }, finished: true });
  expect(state.story!.length).toBe(1200);
  expect(state.photos).toHaveLength(20);
  expect(state.finishedAt).toEqual(expect.any(String));
  expect(mergeOnboarding(state, { finished: true }).finishedAt).toBe(state.finishedAt);
  expect(mergeOnboarding(null, { photos: ['https://evil.test/x.png'] }).photos).toBeUndefined();
});

it('composes a brief from the answers without inventing facts', () => {
  const brief = onboardingBrief('Café Buna', { version: 1, step: 7, done: [], skipped: [], what: 'Café de especialidad', story: 'Desde 2019 en Sopocachi.', contact: { whatsapp: '+591 70000000', city: 'La Paz' } }, [{ name: 'Café molido 250 g', amount: 4500 }]);
  expect(brief).toContain('Café Buna');
  expect(brief).toContain('Café de especialidad');
  expect(brief).toContain('Desde 2019 en Sopocachi.');
  expect(brief).toContain('La Paz');
  expect(brief).toContain('Café molido 250 g a Bs 45');
  expect(onboardingBrief('X', { version: 1, step: 2, done: [], skipped: [], what: 'Ropa' }, [])).not.toMatch(/historia|WhatsApp/i);
});

it('keeps the showcase answer and a valid main action, and ignores anything else (spec 2026-10-13)', () => {
  const state = mergeOnboarding(null, { purpose: 'showcase', primaryAction: { kind: 'booking', value: '  https://cal.com/deff  ' } });
  expect(state).toMatchObject({ purpose: 'showcase', primaryAction: { kind: 'booking', value: 'https://cal.com/deff' } });
  expect(mergeOnboarding(state, { purpose: 'otro' as any, primaryAction: { kind: 'fax' } }).primaryAction).toEqual({ kind: 'booking', value: 'https://cal.com/deff' });
  expect(mergeOnboarding(state, { purpose: 'otro' as any }).purpose).toBe('showcase');
  expect(mergeOnboarding(state, { primaryAction: { kind: 'form' } }).primaryAction).toEqual({ kind: 'form' });
});

it('briefs a showcase as a site that does not sell online', () => {
  const brief = onboardingBrief('deff', { version: 1, step: 8, done: [], skipped: [], what: 'Estudio de arquitectura', purpose: 'showcase', primaryAction: { kind: 'form' } }, []);
  expect(brief).toContain('No vendemos en línea');
  expect(brief.endsWith('Crea mi sitio.')).toBe(true);
  expect(onboardingBrief('Buna', { version: 1, step: 8, done: [], skipped: [], what: 'Café' }, []).endsWith('Crea mi tienda.')).toBe(true);
});
