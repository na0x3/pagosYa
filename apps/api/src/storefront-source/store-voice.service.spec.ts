import { StoreVoiceService } from './store-voice.service';
import { readVoice, voiceFile, type StoreVoice } from './store-voice';

const SHEET: StoreVoice = { version: 1, voice: 'Hablamos de tú.', specifics: [], texture: [], assumed: [{ id: 'a1', text: 'desde 1998', kind: 'history', status: 'assumed' }], words: {}, avoid: [] };
const HOME = '<main><p>Tostamos <span data-assumed="a1">desde 1998</span>.</p><p>Servimos café desde 1998.</p></main>';
function setup() {
  const snapshot = { brief: { businessType: 'Café' }, files: [{ path: 'index.html', content: HOME }, voiceFile(SHEET)] };
  const projects: any = {
    current: jest.fn().mockResolvedValue({ revision: 3 }),
    version: jest.fn().mockResolvedValue({ revision: 3, snapshot }),
    save: jest.fn(async (_m: string, _s: string, input: any) => ({ revision: input.revision + 1, label: input.label, digest: 'd', createdAt: new Date(), restoredFrom: null })),
  };
  const generation: any = { generate: jest.fn().mockResolvedValue({ revision: 4, label: 'Dato quitado' }), newBudget: jest.fn((credits: number) => ({ credits })) };
  const prisma: any = { $queryRaw: jest.fn() };
  return { service: new StoreVoiceService(prisma, projects, generation), projects, generation, prisma };
}

describe('StoreVoiceService (spec 2026-10-14, part 5)', () => {
  it('lists the facts of a revision', async () => {
    const { service } = setup();
    expect(await service.list('m', 's', 3)).toEqual({ revision: 3, facts: [expect.objectContaining({ id: 'a1', pages: ['index.html'], unwrapped: ['index.html'] })] });
    expect(await service.list('m', 's', 0)).toEqual({ revision: 0, facts: [] });
  });

  it('Confirmar saves the fact as confirmed in a normal save, with no model call', async () => {
    const { service, projects, generation } = setup();
    await service.confirm('m', 's', 'a1', 3);
    const saved = projects.save.mock.calls[0][2];
    expect(saved).toMatchObject({ revision: 3, label: 'Dato confirmado', brief: { businessType: 'Café' } });
    expect(readVoice(saved.files)!.assumed[0].status).toBe('confirmed');
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('Editar replaces every marked copy in a normal save, reports where the old text is unmarked, and makes no model call', async () => {
    const { service, projects, generation } = setup();
    const result = await service.edit('m', 's', 'a1', 3, 'desde 2003');
    const saved = projects.save.mock.calls[0][2];
    expect(saved.label).toBe('Dato corregido');
    expect(saved.files.find((file: any) => file.path === 'index.html').content).toBe('<main><p>Tostamos <span data-assumed="a1">desde 2003</span>.</p><p>Servimos café desde 1998.</p></main>');
    expect(readVoice(saved.files)!.assumed[0]).toEqual({ id: 'a1', text: 'desde 2003', kind: 'history', status: 'confirmed' });
    expect(result).toMatchObject({ revision: 4, replaced: 1, unwrapped: ['index.html'] });
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('refuses markup or an empty text, an unknown or unsafe id, and a store that moved on', async () => {
    const { service, projects } = setup();
    await expect(service.edit('m', 's', 'a1', 3, '<b>2003</b>')).rejects.toMatchObject({ status: 400 });
    await expect(service.edit('m', 's', '"><x', 3, 'x')).rejects.toMatchObject({ status: 400 });
    await expect(service.edit('m', 's', 'a9', 3, 'x')).rejects.toMatchObject({ status: 404 });
    projects.current.mockResolvedValue({ revision: 4 });
    await expect(service.confirm('m', 's', 'a1', 3)).rejects.toMatchObject({ status: 409 });
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('Quitar runs the local chat edit with the pages named, and says whether the fact is gone', async () => {
    const { service, projects, generation } = setup();
    const after = { revision: 4, snapshot: { brief: {}, files: [{ path: 'index.html', content: '<main><p>Tostamos cada semana.</p></main>' }, voiceFile({ ...SHEET, assumed: [] })] } };
    projects.version.mockImplementation(async (_m: string, _s: string, revision: number) => (revision === 4 ? after : { revision: 3, snapshot: { brief: { businessType: 'Café' }, files: [{ path: 'index.html', content: HOME }, voiceFile(SHEET)] } }));
    const result = await service.remove('m', 's', 'a1', 3);
    const [merchantId, storeId, dto] = generation.generate.mock.calls[0];
    expect([merchantId, storeId]).toEqual(['m', 's']);
    expect(dto).toMatchObject({ revision: 3, model: 'auto', maxCredits: 40, brief: { businessType: 'Café' } });
    expect(dto.instruction).toContain('<span data-assumed="a1">');
    expect(dto.instruction).toContain('index.html');
    expect(generation.newBudget).toHaveBeenCalledWith(40);
    expect(result).toEqual({ revision: 4, label: 'Dato quitado', removed: true });
  });

  it('counts the pending facts of each store’s current revision for Mi tienda, read-only', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ storeId: 's1', voice: JSON.stringify(SHEET) }, { storeId: 's2', voice: null }, { storeId: 's3', voice: '{broken' }]);
    expect(await service.pendingCounts('m')).toEqual({ counts: { s1: 1 } });
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(query.values).toEqual(expect.arrayContaining(['voice.json', 'm']));
  });
});
