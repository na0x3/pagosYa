import { ConfigService } from '@nestjs/config';
jest.mock('./agent/agent-capture', () => ({ ...jest.requireActual('./agent/agent-capture'), captureAgentDraft: jest.fn(async () => ({ image: 'img', sections: ['img'] })) }));
import { SourceChatService } from './source-chat.service';
import { templateStoreDataFile } from './source-templates';
import * as composer from './source-composer';
import * as library from './source-section-library';
import type { LayoutBlock } from './source-section-library';

/** Spec 2026-11-11 store composer: a template store's first build composes its home behind YAPI_COMPOSER. */
const own: LayoutBlock[] = [{ type: 'cover-mega', look: 'side' }, { type: 'products-rows' }, { type: 'names-list' }, { type: 'faq-split' }];
const files = [
  templateStoreDataFile({ name: 'Miga' }, { hero: '' }, { copy: { headline: 'x' } as never, look: { palette: 'mono', fonts: 'zancada' } as never, variants: { theme: 'merienda' } as never, layout: own }),
  { path: 'components/home.tsx', content: "import { copy, layout } from './store-data';" },
  { path: 'components/library.tsx', content: '' },
];
const seven = ['cover-mega', 'products-rows', 'story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-photo'];
// Enough to fill the seven sections (products-rows wants two products, names-list three photos): the composer is offered only those.
const facts = { what: 'Cereales', story: '', request: '', notes: '', products: [{ id: 'p1', name: 'Avena' }, { id: 'p2', name: 'Granola' }], categories: [],
  photos: [{ url: '/v1/uploads/a.jpg' }, { url: '/v1/uploads/b.jpg' }, { url: '/v1/uploads/c.jpg' }], codes: [], services: [], reviews: 0, tone: 'bold' };
const workflow = { report: jest.fn(), finish: jest.fn(), value: {} };

function build(on: boolean) {
  const prisma = { storeAgentMessage: { create: jest.fn(async ({ data }: any) => ({ ...data, id: 'a1' })) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } };
  const refill = jest.fn().mockResolvedValue({ revision: 2, label: 'x' });
  const real = jest.requireActual('@pagosya/store-templates');
  const templates = { refill, refillDraft: jest.fn().mockResolvedValue({ files: [] }), recentThemeHomes: jest.fn().mockResolvedValue([]), registry: { templateManifest: real.templateManifest } };
  const dialogue = { composeHome: jest.fn(), reviewHome: jest.fn().mockResolvedValue({ problems: [], microUsd: 1 }), composeLibrary: jest.fn().mockResolvedValue({ blocks: own }) };
  const config = { get: (key: string) => ({ 'app.yapiComposer': on, 'app.yapiComposerMaxUsd': 10, 'app.yapiPhotoCutouts': false } as Record<string, unknown>)[key] } as unknown as ConfigService;
  const chat: any = new SourceChatService(prisma as any, { version: jest.fn() } as any, {} as any, dialogue as any, templates as any, config);
  chat.libraryFacts = jest.fn().mockResolvedValue(facts);
  chat.productPhotoTint = jest.fn().mockResolvedValue(undefined);
  const run = () => chat.sectionLibrary('m1', 's1', 't1', { id: 'u1' }, workflow, { instruction: 'Portada', firstDesign: true, revision: 1 }, 1, { snapshot: { brief: { templateId: 'esencial' }, files } });
  return { chat, refill, dialogue, run };
}

beforeEach(() => {
  jest.spyOn(composer, 'readSectionFit').mockReturnValue({ fit: { merienda: seven }, signature: { merienda: ['cover-mega'] } });
  // The words and needs checks are Task 3's; here a composed answer comes back as it was sent.
  const realValidate = jest.requireActual('./source-section-library').validateLibraryLayout;
  jest.spyOn(library, 'validateLibraryLayout').mockImplementation(((answer: any, f: any, options: any = {}) => options.composed ? answer.blocks : realValidate(answer, f, options)) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('the store composer in the first build (spec 2026-11-11)', () => {
  it('with YAPI_COMPOSER on, a first build on a template with a signature saves the composed home', async () => {
    const { refill, dialogue, run } = build(true);
    dialogue.composeHome.mockResolvedValue({ answer: { blocks: seven.map(type => ({ type, ...(type === 'cover-mega' ? { look: 'tilt' } : {}) })) }, microUsd: 1 });
    await run();
    expect(dialogue.composeHome).toHaveBeenCalled();
    expect(dialogue.reviewHome).toHaveBeenCalled();
    expect(dialogue.composeLibrary).not.toHaveBeenCalled();
    expect(refill).toHaveBeenCalledWith('m1', 's1', 1, expect.objectContaining({ layout: expect.arrayContaining([expect.objectContaining({ type: 'cover-mega', look: 'tilt' })]) }), 'Portada compuesta por YAPI');
  });
  it('with the switch off, fill mode runs exactly as before', async () => {
    const { refill, dialogue, run } = build(false);
    await run();
    expect(dialogue.composeHome).not.toHaveBeenCalled();
    expect(dialogue.composeLibrary).toHaveBeenCalledWith('m1', expect.objectContaining({ template: expect.any(Array) }));
    expect(refill.mock.calls[0][4]).toBe('Portada de YAPI');
  });
  it('fill mode drops repeated product rows before the top-up (owner 2026-11-11)', async () => {
    const rows = jest.spyOn(library, 'withoutRepeatedProductRows');
    const { run } = build(false);
    await run();
    expect(rows).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: 'cover-mega' })]), expect.objectContaining({ what: 'Cereales' }));
  });
  it('fill mode keeps the cover photo sharp before saving (owner 2026-11-11)', async () => {
    const sharpCover = jest.spyOn(library, 'withSharpCover');
    const { run } = build(false);
    await run();
    expect(sharpCover).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: 'cover-mega' })]), expect.objectContaining({ what: 'Cereales' }));
  });
  it('the composer is offered only the sections this store can fill (live test 2026-11-11)', async () => {
    jest.spyOn(composer, 'readSectionFit').mockReturnValue({ fit: { merienda: [...seven, 'reviews-cards'] }, signature: { merienda: ['cover-mega', 'reviews-cards'] } });
    const { dialogue, run } = build(true);
    dialogue.composeHome.mockResolvedValue({ answer: { blocks: seven.map(type => ({ type })) }, microUsd: 1 });
    await run();
    const { template } = dialogue.composeHome.mock.calls[0][1];
    expect(template.allowed).toContain('story-split');
    expect(template.allowed).not.toContain('reviews-cards');
    expect(template.signature).toEqual(['cover-mega']);
  });
  it('a composer that cannot pass its check falls back to fill mode', async () => {
    const { refill, dialogue, run } = build(true);
    dialogue.composeHome.mockResolvedValue({ answer: { blocks: [{ type: 'cover-mega' }, { type: 'faq-split' }] }, microUsd: 1 });
    await run();
    expect(dialogue.composeHome).toHaveBeenCalledTimes(2);
    expect(dialogue.composeLibrary).toHaveBeenCalledWith('m1', expect.objectContaining({ template: expect.any(Array) }));
    expect(refill.mock.calls[0][4]).toBe('Portada de YAPI');
  });
});
