import { buildSuggestions, filterSuggestions, REDESIGN_OFFER, withRedesignOffer } from './source-suggestions';
import { sourceRedesignRequested } from './source-context';
import { RetentionService } from '../retention/retention.service';
import { DEFAULT_RETENTION } from '../retention/retention.dto';

// Spec 2026-10-19 §2: after a build YAPI offers 2–3 personal next steps the store does not have yet.
const input = { storeName: 'PEPPA please', sections: ['faq', 'story'], products: [{ id: 'p1', name: 'Garlic Heat' }, { id: 'p2', name: 'Trío' }], featuredProductIds: ['p2'], signupEnabled: false };
const card = (over: Record<string, unknown>) => ({ title: 'Agrega una guía de picante', instruction: 'Agrega una sección corta que explique el nivel de picante de cada salsa.', kind: 'design', ...over });

describe('filterSuggestions', () => {
  it('drops what the store already has: popup with signup on, a featured product, a section it shows', () => {
    const out = filterSuggestions([card({ kind: 'popup', title: 'Activa el popup' }), card({ kind: 'product', productId: 'p2', title: 'Destaca el Trío' }), card({ section: 'faq', title: 'Preguntas' })], { ...input, signupEnabled: true });
    expect(out).toEqual([]);
  });
  it('keeps at most three distinct cards, trimmed, each with an id', () => {
    const cards = [card({ title: 'A'.repeat(90) }), card({ title: 'B' }), card({ title: 'B' }), card({ title: 'C', kind: 'popup' }), card({ title: 'D', kind: 'product', productId: 'p1' })];
    const out = filterSuggestions(cards, input);
    expect(out).toHaveLength(3);
    expect(out[0].title.length).toBeLessThanOrEqual(60);
    expect(new Set(out.map(c => c.title)).size).toBe(3);
    expect(out.every(c => /^s\d$/.test(c.id))).toBe(true);
  });
  it('drops unknown kinds and products that are not the store own', () => {
    expect(filterSuggestions([card({ kind: 'coupon' }), card({ kind: 'product', productId: 'nope' })], input)).toEqual([]);
  });
});

describe('buildSuggestions', () => {
  it('returns nothing for a store that dismissed them, without asking the model', async () => {
    const suggest = jest.fn();
    expect(await buildSuggestions({ dismissed: true, input, suggest })).toEqual([]);
    expect(suggest).not.toHaveBeenCalled();
  });
  it('returns nothing when the model call fails or answers nothing', async () => {
    expect(await buildSuggestions({ dismissed: false, input, suggest: async () => { throw new Error('bridge down'); } })).toEqual([]);
    expect(await buildSuggestions({ dismissed: false, input, suggest: async () => null })).toEqual([]);
  });
  it('filters what the model answers', async () => {
    const out = await buildSuggestions({ dismissed: false, input, suggest: async () => [card({ title: 'X' }), card({ title: 'Y', kind: 'popup' }), card({ title: 'Z', kind: 'product', productId: 'p1' }), card({ title: 'W' })] });
    expect(out.map(c => c.title)).toEqual(['X', 'Y', 'Z']);
  });
});

describe('dismissing suggestions', () => {
  function service(saved: Record<string, unknown> | null) {
    const prisma = {
      store: { findFirst: jest.fn(async () => ({ id: 's1', merchantId: 'm1' })) },
      storeRetention: { findUnique: jest.fn(async () => (saved ? { settings: saved, revision: 2 } : null)), upsert: jest.fn(async (args: any) => args), update: jest.fn() },
    };
    const s = Object.create(RetentionService.prototype); s.prisma = prisma;
    return { s, prisma };
  }
  it('records the dismissal once and keeps the other settings', async () => {
    const { s, prisma } = service({ ...DEFAULT_RETENTION, signupEnabled: true });
    await s.dismissSuggestions('m1', 's1');
    const settings = prisma.storeRetention.upsert.mock.calls[0][0].update.settings;
    expect(settings).toMatchObject({ signupEnabled: true });
    expect(typeof settings.suggestionsDismissedAt).toBe('string');
    const again = service({ ...DEFAULT_RETENTION, suggestionsDismissedAt: '2026-10-20T00:00:00.000Z' });
    await again.s.dismissSuggestions('m1', 's1');
    expect(again.prisma.storeRetention.upsert).not.toHaveBeenCalled();
  });
});

describe('withRedesignOffer', () => {
  it('puts the redesign card first and keeps three cards in all', () => {
    const card = (id: string) => ({ id, title: id, instruction: id, kind: 'design' as const });
    expect(withRedesignOffer([card('s1'), card('s2'), card('s3')]).map(c => c.id)).toEqual(['redesign', 's1', 's2']);
    expect(withRedesignOffer([]).map(c => c.id)).toEqual(['redesign']);
  });

  it('offers a request the chat reads as a redesign', () => {
    expect(sourceRedesignRequested(REDESIGN_OFFER.instruction)).toBe(true);
  });
});
