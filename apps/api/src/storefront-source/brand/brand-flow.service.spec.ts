import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { BrandFlowService } from './brand-flow.service';
import * as call from './brand-model-call';

const research = { niche: 'salsas picantes', audience: 'a', references: [{ name: 'Heinz', why: 'w' }, { name: 'Cholula', why: 'w' }, { name: 'Tabasco', why: 'w' }], patterns: ['Receta junto al producto', 'Escala de picante', 'Packs'] };
const identity = { mode: 'new', palette: { ink: '#3B1F14', primary: '#B4400A', accent: '#F2C342', secondary: '#7AA62E', base: '#F8F1E4' }, fonts: { display: 'oswald', secondary: 'fraunces', body: 'instrument' }, oneLiner: 'Sol tibio.', voice: 'de tú', photoDirection: 'tarde', scene: {} };

function setup(over: { plan?: number; shot?: jest.Mock; credits?: jest.Mock; products?: unknown[]; researchFails?: boolean; onboarding?: unknown; posterText?: string } = {}) {
  const messages: Array<{ content: string; metadata: any }> = [];
  const store: any = { id: 's1', name: 'Calima', onboarding: 'onboarding' in over ? over.onboarding : {} };
  const prisma: any = {
    store: { findUnique: jest.fn(async () => store), update: jest.fn(async ({ data }: any) => Object.assign(store, data)) },
    paymentLink: { findMany: jest.fn(async () => over.products ?? [{ name: 'Habanero', imageUrls: ['/v1/uploads/a.jpg'] }, { name: 'Serrano', imageUrls: ['/v1/uploads/b.jpg'] }, { name: 'Chipotle', imageUrls: ['/v1/uploads/c.jpg'] }]) },
    storeAgentThread: { upsert: jest.fn(async () => ({ id: 't1' })) },
    storeAgentMessage: { create: jest.fn(async ({ data }: any) => { messages.push({ content: data.content, metadata: data.metadata }); return data; }) },
  };
  const brands: any = { get: jest.fn(async () => ({ revision: 1, data: { confirmed: [], suggested: [] } })), analyze: jest.fn(async () => ({})) };
  let n = 0;
  const scenes: any = { campaignShot: over.shot ?? jest.fn(async () => ({ url: `/v1/uploads/shot-${++n}.jpg` })), discardCampaignShot: jest.fn(async () => undefined) };
  const plans: any = { planOf: jest.fn(async () => ({ campaignPhotos: over.plan ?? 8 })), assertCredits: over.credits ?? jest.fn(async () => 100) };
  const v2: any = { designForChat: jest.fn(async () => ({ revision: { revision: 7 } })) };
  const config: any = { get: () => undefined };
  const uploads: any = { getBuffer: jest.fn(async () => Buffer.from('jpg')) };
  jest.spyOn(call, 'brandCall').mockImplementation(async (_deps, req) => {
    if (req.schemaName === 'brand_research') { if (over.researchFails) throw new Error('down'); return { json: research, searched: true }; }
    if (req.schemaName === 'brand_identity') return { json: identity, searched: false };
    return { json: { text: over.posterText ?? 'CALIMA' }, searched: false };
  });
  const service = new BrandFlowService(prisma, config, brands, scenes, plans, v2, uploads, undefined, { endpoint: 'e', apiKey: 'k', model: 'm' });
  const run = (input: any = {}, signal = new AbortController().signal) => service.runForChat({ merchantId: 'm1', storeId: 's1', input: { instruction: 'Mejorar mi marca', revision: 3, requestId: 'r', ...input }, signal });
  return { run, messages, store, scenes, v2, plans, brands };
}

afterEach(() => jest.restoreAllMocks());

describe('BrandFlowService', () => {
  it('researches, shows the card, shoots 8 photos and builds from the brief', async () => {
    const { run, messages, store, scenes, v2 } = setup();
    await expect(run()).resolves.toEqual({ revision: { revision: 7 } });
    expect(messages.find(m => m.metadata?.brandCard)?.content).toBe('Esta es la nueva identidad de Calima: sol tibio.');
    expect(scenes.campaignShot).toHaveBeenCalledTimes(8);
    expect(store.onboarding.brandBrief.shots).toHaveLength(8);
    expect(v2.designForChat).toHaveBeenCalledWith('m1', 's1', 3, expect.objectContaining({ storeName: 'Calima', shots: expect.any(Array) }));
    expect(messages.at(-1)!.content).toContain('fotografié 8 escenas');
  });

  it('shoots 2 photos on Gratis', async () => {
    const { run, scenes } = setup({ plan: 2 });
    await run();
    expect(scenes.campaignShot).toHaveBeenCalledTimes(2);
  });

  it('builds with what was shot when credits run out after the third photo', async () => {
    let calls = 0;
    const credits = jest.fn(async () => { if (++calls > 3) throw new HttpException({ code: 'credits_exhausted' }, 402); return 1; });
    const { run, scenes, v2, messages } = setup({ credits });
    await run();
    expect(scenes.campaignShot).toHaveBeenCalledTimes(3);
    expect(v2.designForChat).toHaveBeenCalled();
    expect(messages.at(-1)!.content).toMatch(/créditos/);
  });

  it('skips a refused shot and keeps shooting; stops the shoot without the image service', async () => {
    const refused = jest.fn().mockRejectedValueOnce(new BadRequestException('x')).mockResolvedValue({ url: '/v1/uploads/s.jpg' });
    const one = setup({ shot: refused });
    await one.run();
    expect(one.store.onboarding.brandBrief.shots).toHaveLength(7);
    const off = setup({ shot: jest.fn().mockRejectedValue(new ServiceUnavailableException('off')) });
    await off.run();
    expect(off.scenes.campaignShot).toHaveBeenCalledTimes(1);
    expect(off.messages.at(-1)!.content).toMatch(/servicio de imágenes/);
    expect(off.v2.designForChat).toHaveBeenCalled();
  });

  it('falls back to a plain build when research fails twice', async () => {
    const { run, v2, messages } = setup({ researchFails: true });
    await run();
    expect(v2.designForChat).toHaveBeenCalledWith('m1', 's1', 3);
    expect(messages.some(m => /investigación/.test(m.content))).toBe(true);
  });

  it('asks for screenshots for an Instagram link, uses attached photos without a catalogue, and asks for a product photo when there is none', async () => {
    const insta = setup();
    await expect(insta.run({ instruction: 'Mejorar mi marca https://instagram.com/calima' })).resolves.toEqual({ assistantMessage: { metadata: { awaitingInput: true } } });
    expect(insta.messages[0].content).toMatch(/capturas/);
    const attached = setup({ products: [] });
    await attached.run({ assetUrls: ['/v1/uploads/p1.jpg'] });
    expect(attached.scenes.campaignShot.mock.calls[0][2].referenceUrls).toEqual(['/v1/uploads/p1.jpg']);
    const empty = setup({ products: [] });
    await empty.run();
    expect(empty.messages[0].content).toMatch(/foto de tu producto/);
    expect(empty.v2.designForChat).not.toHaveBeenCalled();
  });

  it('a second run replaces the brief and posts a new card', async () => {
    const twice = setup();
    await twice.run();
    const first = twice.store.onboarding.brandBrief.createdAt;
    await new Promise(resolve => setTimeout(resolve, 5));
    await twice.run();
    expect(twice.store.onboarding.brandBrief.createdAt).not.toBe(first);
    expect(twice.messages.filter(m => m.metadata?.brandCard)).toHaveLength(2);
  });

  // Final review 2026-11-18 fixes.
  it('stops on a cancel during research instead of building', async () => {
    const { run, v2 } = setup();
    const controller = new AbortController();
    jest.spyOn(call, 'brandCall').mockImplementation(async () => { controller.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    await expect(run({}, controller.signal)).rejects.toBeDefined();
    expect(v2.designForChat).not.toHaveBeenCalled();
  });

  it('marks its asks so the next message with photos resumes the brand flow', async () => {
    const insta = setup();
    await insta.run({ instruction: 'Mejorar mi marca https://instagram.com/calima' });
    expect(insta.messages[0].metadata).toEqual({ brandAsk: { instruction: 'Mejorar mi marca https://instagram.com/calima' } });
  });

  it('on a store from before the walkthrough, saves the brief as a finished walkthrough', async () => {
    const old = setup({ onboarding: null });
    await old.run();
    expect(old.store.onboarding).toMatchObject({ version: 1, finishedAt: expect.any(String), brandBrief: expect.objectContaining({ storeName: 'Calima' }) });
  });

  it('deletes a poster that failed the spelling check before shooting it again', async () => {
    const wrong = setup({ posterText: 'CALIMMA' });
    await wrong.run();
    expect(wrong.scenes.discardCampaignShot).toHaveBeenCalledTimes(2);
    expect(wrong.store.onboarding.brandBrief.shots.filter((s: any) => s.kind === 'poster')).toHaveLength(1);
  });
});
