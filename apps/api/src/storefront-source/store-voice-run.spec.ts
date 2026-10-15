import { createHash } from 'node:crypto';
import { describeNewPhotos, startVoiceRun, writeVoiceSheet, type VoiceRunInput } from './store-voice-run';
import { voiceFile, type StoreVoice } from './store-voice';

const bytes = Buffer.from('una foto');
const digest = createHash('sha256').update(bytes).digest('hex');
const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const SHEET: StoreVoice = { version: 1, voice: 'Hablamos de tú.', specifics: [{ id: 's1', text: 'El cortado con alfajor', source: 'merchant' }], texture: [], assumed: [], words: { order: 'Tu pedido' }, avoid: [] };
const input = (over: Partial<VoiceRunInput> = {}): VoiceRunInput => ({
  on: true, sep5Author: true, storeId: 's1', merchantId: 'm1', previousFiles: [], proposalVoice: undefined, kind: 'cafe-food',
  assetLegend: [{ original: '/v1/uploads/a.jpg', path: 'assets/image-a.jpg' }, { original: '/v1/uploads/b.jpg', path: 'assets/image-b.jpg' }],
  buffers: new Map<string, Buffer | null>([['/v1/uploads/a.jpg', bytes], ['/v1/uploads/b.jpg', Buffer.from('otra')]]), contentType: () => 'image/jpeg',
  prisma: {
    mediaAssetDescription: { findMany: jest.fn().mockResolvedValue([{ digest, description: 'pan de masa madre' }]), upsert: jest.fn().mockResolvedValue({}) },
    store: { findFirst: jest.fn().mockResolvedValue({ onboarding: { what: 'Café', answers: [{ question: '¿Qué tiene tu local?', answer: 'Una ventana a la plaza' }] } }) },
    storeAgentMessage: { findMany: jest.fn().mockResolvedValue([{ content: 'Hazme la tienda' }]) },
  } as any,
  recentVoices: jest.fn().mockResolvedValue([{ kind: 'clothing', sentences: ['ropa'] }, { kind: 'cafe-food', sentences: ['café'] }]),
  ...over,
});

describe('startVoiceRun (spec 2026-10-14, parts 1–2)', () => {
  it('reads nothing and keeps nothing with the flag off', async () => {
    const run = input({ on: false });
    expect(await startVoiceRun(run)).toMatchObject({ on: false, fresh: false, sheet: undefined, photos: [], onboarding: { answers: [] }, merchantMessages: '', siblings: [] });
    expect(run.prisma.mediaAssetDescription.findMany).not.toHaveBeenCalled();
    expect(run.recentVoices).not.toHaveBeenCalled();
  });

  it('writes cached descriptions onto the legend and reads the onboarding, the messages and the siblings', async () => {
    const run = input();
    const voice = await startVoiceRun(run);
    expect(run.assetLegend.map(entry => entry.description)).toEqual(['pan de masa madre', undefined]);
    expect(voice).toMatchObject({ on: true, fresh: true, kind: 'cafe-food', merchantMessages: 'Hazme la tienda', onboarding: { what: 'Café', answers: [{ question: '¿Qué tiene tu local?', answer: 'Una ventana a la plaza' }] } });
    expect(voice.siblings.map(row => row.sentences[0])).toEqual(['café', 'ropa']);
    expect(voice.sheet).toBeUndefined();
    expect(run.recentVoices).toHaveBeenCalledWith('s1', expect.any(Date), 12);
  });

  it('carries the store’s own sheet with the answers given since, and is not fresh; a picked card brings its proposal’s', async () => {
    const carried = await startVoiceRun(input({ sep5Author: false, previousFiles: [voiceFile(SHEET)] }));
    expect(carried.fresh).toBe(false);
    expect(carried.sheet!.specifics.map(entry => entry.text)).toEqual(['El cortado con alfajor', 'Una ventana a la plaza']);
    const picked = await startVoiceRun(input({ proposalVoice: SHEET }));
    expect(picked.sheet!.voice).toBe('Hablamos de tú.');
  });

  it('a failed read is an empty one, and a store with no answers gives none', async () => {
    const failing = input({ prisma: { mediaAssetDescription: { findMany: jest.fn().mockRejectedValue(new Error('no table')) }, store: { findFirst: jest.fn().mockResolvedValue({ onboarding: null }) }, storeAgentMessage: { findMany: jest.fn().mockRejectedValue(new Error('down')) } } as any, recentVoices: jest.fn().mockRejectedValue(new Error('slow')) });
    const voice = await startVoiceRun(failing);
    expect(voice).toMatchObject({ on: true, onboarding: { answers: [] }, merchantMessages: '', siblings: [] });
    expect(failing.assetLegend.every(entry => entry.description === undefined)).toBe(true);
  });

  it('an edit of a store without a sheet reads no material', async () => {
    const run = input({ sep5Author: false });
    await startVoiceRun(run);
    expect(run.prisma.store.findFirst).not.toHaveBeenCalled();
    expect(run.prisma.storeAgentMessage.findMany).not.toHaveBeenCalled();
  });
});

describe('describeNewPhotos (spec 2026-10-14, part 1)', () => {
  it('describes only what the cache did not have, saves it by digest and writes it onto the legend', async () => {
    const run = input();
    const voice = await startVoiceRun(run);
    const sep5Call = jest.fn(async () => ({ attempt: { status: 'FAILED' } as any, body: reply({ description: 'latte con arte de hoja en taza azul' }) }));
    const logger = { log: jest.fn(), warn: jest.fn() };
    await describeNewPhotos({ voice, assetLegend: run.assetLegend, sep5Call: sep5Call as any, prisma: run.prisma, merchantId: 'm1', signal: new AbortController().signal, logger, runId: 'run-1' });
    expect(sep5Call).toHaveBeenCalledTimes(1);
    expect((sep5Call.mock.calls[0] as unknown[])[0]).toBe('photo');
    expect(run.assetLegend.map(entry => entry.description)).toEqual(['pan de masa madre', 'latte con arte de hoja en taza azul']);
    expect(run.prisma.mediaAssetDescription.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ merchantId: 'm1', description: 'latte con arte de hoja en taza azul' }) }));
  });
});

describe('writeVoiceSheet (spec 2026-10-14, part 2)', () => {
  const ANSWER = { voice: 'Hablamos de tú.', specifics: [{ text: 'Una ventana a la plaza grande', source: 'merchant' }], texture: [], assumed: [], words: { products: '', customers: '', order: 'Tu pedido', team: '' }, avoid: [] };
  const deps = async (sep5Call: unknown) => {
    const run = input();
    const voice = await startVoiceRun(run);
    return { voice, assetLegend: run.assetLegend, sep5Call: sep5Call as any, prisma: run.prisma, merchantId: 'm1', signal: new AbortController().signal, logger: { log: jest.fn(), warn: jest.fn() }, runId: 'run-1', storeName: 'Café Remanso', brief: { businessType: 'Cafetería' }, products: [{ name: 'Espresso doble' }] };
  };

  it('waits for the photos, writes the sheet from the run material and bills it once kept', async () => {
    let photosDone = false;
    const attempt = { status: 'FAILED' };
    const sep5Call = jest.fn(async () => ({ attempt, body: photosDone ? reply(ANSWER) : reply('las fotos no estaban') }));
    const ready = await deps(sep5Call);
    ready.voice.brain = { identity: { name: 'Café Remanso' } };
    ready.voice.photosJob = new Promise<void>(resolve => setTimeout(() => { photosDone = true; resolve(); }, 10));
    const sheet = await writeVoiceSheet(ready);
    expect(sheet).toMatchObject({ voice: 'Hablamos de tú.', specifics: [{ id: 's1', source: 'merchant' }], words: { order: 'Tu pedido' } });
    expect(attempt.status).toBe('COMPLETED');
    const [phase, prompt] = sep5Call.mock.calls[0] as unknown as [string, string];
    expect(phase).toBe('voice');
    expect(prompt).toContain('"storeBrain":{"identity":{"name":"Café Remanso"}}');
    expect(prompt).toContain('pan de masa madre');
  });

  it('returns null, unbilled, when the call fails or answers nothing usable', async () => {
    const attempt = { status: 'FAILED' };
    expect(await writeVoiceSheet(await deps(jest.fn(async () => ({ attempt, body: reply('no') }))))).toBeNull();
    expect(await writeVoiceSheet(await deps(jest.fn(async () => { throw new Error('bridge'); })))).toBeNull();
    expect(attempt.status).toBe('FAILED');
  });
});
