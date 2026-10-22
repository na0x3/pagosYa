import { SourceStorePlanService, StorePlanParts } from './source-store-plan.service';

const catalogue = { variants: { hero: ['full', 'type', 'poster'], header: ['classic', 'minimal'], grid: ['grid3', 'grid4'] }, sections: ['faq', 'sizes', 'journal'], palettes: ['linen', 'citrus'], fonts: ['grotesk', 'serif'] };
const plan: any = { version: 1, parts: { hero: { id: 'type', why: 'el nombre corto de la marca se lee grande' } }, sections: [{ id: 'faq', why: 'las velas necesitan instrucciones de uso' }], custom: [],
  colour: { palette: 'linen', from: '' }, fonts: { id: 'serif', why: 'velas artesanales, tono cálido y tranquilo' }, brands: [], card: ['Portada con el nombre en grande'], revision: 0 };
const facts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };

function setup(others: any[] = []) {
  const dialogue: any = { planStore: jest.fn().mockResolvedValue(plan) };
  const data: any = { catalogFacts: jest.fn().mockResolvedValue(facts), otherFingerprints: jest.fn().mockResolvedValue(others) };
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ name: 'Luz' }) } };
  const parts = new StorePlanParts(() => catalogue, () => ({ hero: 'full', header: 'classic', grid: 'grid3' }));
  return { service: new SourceStorePlanService(prisma, dialogue, parts, data), dialogue };
}

it('drafts a checked plan that builds without the dice', async () => {
  const out = await setup().service.draft('m1', 's1', { revision: 0, request: 'hazme una tienda de velas', what: 'velas', photos: [] });
  expect(out?.applied).toMatchObject({ variants: { hero: 'type', header: 'classic', grid: 'grid3' }, sections: ['faq'], palette: 'linen', fonts: 'serif', dna: {} });
});

it('a clash re-plans once with the clash in words, then swaps until unique', async () => {
  const twin = { variants: { hero: 'type', header: 'classic', grid: 'grid3' }, sections: ['faq'], palette: 'linen', fonts: 'serif', accentHue: null };
  const { service, dialogue } = setup([twin]);
  const out = await service.draft('m1', 's1', { revision: 0, request: 'tienda', what: 'velas', photos: [] });
  expect(dialogue.planStore).toHaveBeenCalledTimes(2);
  expect(dialogue.planStore.mock.calls[1][1].clash).toMatch(/que otra tienda$/);
  expect(out?.exhausted).toBe(false);
  expect(out!.applied.sections).not.toEqual(['faq']);
});

it('null when the plan call fails', async () => {
  const { service, dialogue } = setup();
  dialogue.planStore.mockResolvedValue(null);
  expect(await service.draft('m1', 's1', { revision: 0, request: 'x', what: '', photos: [] })).toBeNull();
});

it('custom sections and a motif become the follow-up brief; none means no follow-up', () => {
  const { service } = setup();
  expect(service.followUpBrief(plan)).toBeNull();
  const brief = service.followUpBrief({ ...plan, custom: [{ kind: 'per-brand', why: '3 marcas', items: [{ name: 'Bloom', layout: 'stats', colourFrom: 'foto 2' }] }], motif: { what: 'espiral', from: 'logo' } })!;
  expect(brief).toMatch(/Bloom.*stats.*foto 2/s);
  expect(brief).toMatch(/espiral.*logo/s);
  expect(brief).toMatch(/nunca inventes un color/i);
});

describe('final review fixes (2026-10-22)', () => {
  it('F2: an edit plan starts from the store\'s current parts, never a fresh dice roll', async () => {
    const { service } = setup();
    const out = await service.draft('m1', 's1', { revision: 2, request: 'ponlo más bonito', what: '', photos: [], current: { variants: { hero: 'poster', header: 'minimal', grid: 'grid4' }, sections: ['journal'], palette: 'citrus', fonts: 'grotesk' } });
    expect(out?.applied.variants).toMatchObject({ hero: 'type', header: 'minimal', grid: 'grid4' });
  });
  it('F3: the dice hears the real catalog, and a uniqueness swap never breaks the rules', async () => {
    const roll = jest.fn().mockReturnValue({ hero: 'full', header: 'classic', grid: 'grid3', closing: 'accent', filters: 'bar', menu: 'none' });
    const dialogue: any = { planStore: jest.fn().mockResolvedValue({ ...plan, parts: {} }) };
    const twin = { variants: { hero: 'full', header: 'classic', grid: 'grid3', closing: 'accent', filters: 'bar' }, sections: [], palette: 'linen', fonts: 'serif', accentHue: null };
    const parts = new StorePlanParts(() => ({ ...catalogue, variants: { ...catalogue.variants, closing: ['accent', 'dark'], filters: ['bar', 'sidebar'], menu: ['none', 'dropdowns'] } }), roll);
    const service = new SourceStorePlanService({ store: { findFirst: jest.fn().mockResolvedValue(null) } } as any, dialogue, parts, { catalogFacts: jest.fn().mockResolvedValue(facts), otherFingerprints: jest.fn().mockResolvedValue([twin]) } as any);
    const out = await service.draft('m1', 's1', { revision: 0, request: 'tienda', what: '', photos: [] });
    expect(roll).toHaveBeenCalledWith('s1', expect.objectContaining({ productCount: 1, photoCount: 0 }));
    expect(out!.applied.variants).toMatchObject({ filters: 'bar', menu: 'none' });
    expect(out!.applied.variants.closing).not.toBe('dark');
  });
  it('F1: the plan call\'s shown photos are what «foto N» is checked against', async () => {
    const { service, dialogue } = setup();
    dialogue.planStore.mockResolvedValue({ ...plan, colour: { palette: 'linen', accent: '#f26b1d', from: 'foto 1' } });
    expect((await service.draft('m1', 's1', { revision: 0, request: 'x', what: '', photos: [] }))!.applied.accent).toBeUndefined();
    expect((await service.draft('m1', 's1', { revision: 0, request: 'x', what: '', photos: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'] }))!.applied.accent).toBe('#f26b1d');
  });
});
