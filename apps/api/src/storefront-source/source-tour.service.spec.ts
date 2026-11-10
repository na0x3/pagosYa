import { SourceTourService } from './source-tour.service';
import type { TourStep } from './source-tour';

const STEPS: TourStep[] = [
  { id: 'header', kind: 'part', page: 'home', part: 'header', label: 'Encabezado y menú' },
  { id: 'home-0', kind: 'section', page: 'home', at: 0, label: 'Portada' },
  { id: 'cart', kind: 'cart', page: 'home', label: 'Carrito' },
];
function setup(createdAt = new Date()) {
  const messages: Array<{ id: string; content: string; metadata: any; createdAt: Date }> = [];
  const prisma: any = {
    store: { findUnique: jest.fn(async () => ({ createdAt, slug: 'miga' })) },
    storeAgentThread: { upsert: jest.fn(async () => ({ id: 't1' })) },
    storeAgentMessage: {
      create: jest.fn(async ({ data }: any) => { const row = { id: `m${messages.length}`, ...data, createdAt: new Date(Date.now() + messages.length) }; messages.push(row); return row; }),
      findMany: jest.fn(async () => [...messages].reverse()),
      findFirst: jest.fn(async () => messages.at(-1) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(messages.find(row => row.id === where.id)!, data)),
    },
  };
  const service = new SourceTourService(prisma);
  jest.spyOn(service as any, 'stepsFor').mockResolvedValue(STEPS);
  return { service, messages, last: () => messages.at(-1)! };
}

describe('SourceTourService (spec 2026-11-09)', () => {
  it('offers the tour once, only for a new store', async () => {
    const { service, messages, last } = setup();
    await service.offer('s1'); await service.offer('s1');
    expect(messages).toHaveLength(1);
    expect(last().content).toBe('¿Te muestro tu tienda sección por sección? Te pregunto qué te gusta y cambio lo que quieras.');
    expect(last().metadata.tourChips.map((c: any) => c.label)).toEqual(['Empezar', 'Ahora no']);
    const old = setup(new Date('2026-01-01')); await old.service.offer('s1');
    expect(old.messages).toHaveLength(0);
  });
  it('walks the steps: like and skip advance, then the summary', async () => {
    const { service, last } = setup();
    await service.start('s1');
    expect(last().content).toBe('Paso 1 de 3 · Encabezado y menú. ¿Te gusta así o cambio algo?');
    expect(last().metadata.tourStep).toMatchObject({ id: 'header', part: 'header' });
    expect(last().metadata.tourChips.map((c: any) => c.action)).toEqual(['like', 'change', 'skip']);
    const id = last().metadata.tour.id;
    await service.answer('s1', id, 'like');
    expect(last().metadata.tourStep).toMatchObject({ id: 'home-0', at: 0 });
    await service.answer('s1', id, 'skip');
    await service.answer('s1', id, 'like');
    expect(last().content).toBe('Listo, recorrimos tu tienda: te gustaron 2 secciones y no cambiamos ninguna. Puedes pedirme cambios cuando quieras.');
    expect(last().metadata.tour.done).toBe(true);
  });
  it('«Cámbiala»: asks what to change, waits on that section, and after the edit asks if it is fine', async () => {
    const { service, last } = setup();
    await service.start('s1');
    const id = last().metadata.tour.id;
    await service.answer('s1', id, 'like');
    await service.answer('s1', id, 'change');
    expect(last().content).toBe('¿Qué le cambio a «Portada»? Por ejemplo: otra foto, otro texto, más corta, otro color o quitarla.');
    await expect(service.waiting('s1')).resolves.toMatchObject({ id: 'home-0', at: 0 });
    await service.afterEdit('s1');
    expect(last().content).toBe('¿Así está bien?');
    expect(last().metadata.tourChips.map((c: any) => c.action)).toEqual(['ok', 'again']);
    await service.answer('s1', id, 'ok');
    expect(last().metadata.tourStep).toMatchObject({ id: 'cart' });
    await expect(service.waiting('s1')).resolves.toBeNull();
    await service.answer('s1', id, 'like');
    expect(last().content).toBe('Listo, recorrimos tu tienda: te gustaron 2 secciones y cambiamos 1 (Portada). Puedes pedirme cambios cuando quieras.');
  });
  it('starting again resumes the open tour where it stopped', async () => {
    const { service, last } = setup();
    await service.start('s1');
    await service.answer('s1', last().metadata.tour.id, 'skip');
    await service.start('s1');
    expect(last().metadata.tourStep).toMatchObject({ id: 'home-0' });
  });
  it('«keep it» while waiting counts the step as liked and goes on', async () => {
    const { service, last } = setup();
    await service.start('s1');
    const id = last().metadata.tour.id;
    await service.answer('s1', id, 'skip');
    await service.answer('s1', id, 'change');
    await service.keep('s1');
    expect(last().content).toBe('Perfecto, la dejamos así. Paso 3 de 3 · Carrito. ¿Te gusta así o cambio algo?');
    expect(last().metadata.tour).toMatchObject({ liked: ['Portada'], disliked: [], at: 2 });
    await expect(service.waiting('s1')).resolves.toBeNull();
  });
  it('a change typed straight after «¿Te gusta así o cambio algo?» edits that step, as if «Cámbiala» was pressed (live Remolino 2026-11-09)', async () => {
    const { service, messages, last } = setup();
    await service.start('s1');
    await service.answer('s1', last().metadata.tour.id, 'skip');
    await expect(service.waiting('s1')).resolves.toBeNull();
    await expect(service.stepForReply('s1')).resolves.toMatchObject({ id: 'home-0' });
    expect(last().metadata.tour).toMatchObject({ waiting: 'home-0', disliked: ['Portada'] });
    await service.afterEdit('s1');
    expect(last().content).toBe('¿Así está bien?');
    // Anything said after the step question (another YAPI reply) ends the claim: the next message is an ordinary request.
    messages.push({ id: 'x', content: 'Listo.', metadata: {}, createdAt: new Date() });
    await expect(service.stepForReply('s1')).resolves.toBeNull();
  });
});
