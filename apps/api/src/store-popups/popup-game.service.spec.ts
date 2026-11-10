import { PopupGameService } from './popup-game.service';
import { createGameToken } from './popup-games';

function setup() {
  let settings: Record<string, unknown> | null = null;
  const created: Array<Record<string, unknown>> = [];
  const prisma: any = {
    storeRetention: { findUnique: jest.fn(async () => (settings ? { settings } : null)), upsert: jest.fn(async ({ update }: any) => { settings = update.settings; }) },
    category: { findMany: jest.fn(async () => [{ name: 'Gelatos' }, { name: 'Copas' }, { name: 'Para regalar' }]) },
    promoCode: { create: jest.fn(async ({ data }: any) => { created.push(data); return data; }) },
  };
  return { service: new PopupGameService(prisma, { get: jest.fn(() => 'secret') } as never), created, prisma, read: () => settings };
}

describe('PopupGameService (single-use codes, spec addendum 2026-11-09)', () => {
  it('turns a game on with four percent prizes 40/30/20/10 and a question — creating no shared code', async () => {
    const { service, prisma, read } = setup();
    await service.enable('s1', 'scratch');
    expect(prisma.promoCode.create).not.toHaveBeenCalled();
    expect((read()!.popupGamePrizes as any[]).map(p => [p.percent, p.label, p.chance])).toEqual([[5, '5 % de descuento', 40], [10, '10 % de descuento', 30], [15, '15 % de descuento', 20], [20, '20 % de descuento', 10]]);
    expect(read()).toMatchObject({ popupGame: 'scratch', popupQuestion: { text: '¿Qué se te antoja más?' } });
  });
  it('plays: signs the drawn percent and gives the slices and index', async () => {
    const { service } = setup();
    await service.enable('s1', 'wheel');
    const result = (await service.play('s1', 45))!;
    expect(result.prize.label).toBe('10 % de descuento'); expect(result.at).toBe(1); expect(result.slices).toHaveLength(4);
    await expect(service.validPrize('s1', result.gameToken)).resolves.toBe(true);
  });
  it('a claim creates the winner own one-use code; once per email; a bad token gives none', async () => {
    const { service, created } = setup();
    await service.enable('s1', 'wheel');
    const token = createGameToken('s1', 15, Date.now() + 60_000, 'secret');
    const first = await service.claim('s1', token, false);
    expect(first.code).toMatch(/^RULETA15-[A-HJ-NP-Z2-9]{6}$/);
    expect(created[0]).toMatchObject({ storeId: 's1', code: first.code, discountType: 'PERCENT', discountValue: 15, maxUses: 1, isActive: true, showInEmails: false, showInAssistant: false });
    const second = await service.claim('s1', token, false);
    expect(second.code).not.toBe(first.code);
    await expect(service.claim('s1', token, true)).resolves.toEqual({ message: 'Este correo ya recibió su premio.' });
    await expect(service.claim('s1', 'bad.token', false)).resolves.toEqual({ message: 'Tu premio venció; vuelve a jugar.' });
  });
  it('moves the top prize (also under 15 %) and reads prizes saved before as percents', async () => {
    const { service, read } = setup();
    await service.enable('s1', 'scratch');
    await service.setTopPrize('s1', 10);
    expect((read()!.popupGamePrizes as any[]).map(p => p.percent)).toEqual([5, 10]);
    await service.setTopPrize('s1', 30);
    expect((read()!.popupGamePrizes as any[]).map(p => p.percent)).toEqual([5, 10, 30]);
    expect((read()!.popupGamePrizes as any[]).reduce((sum, p) => sum + p.chance, 0)).toBe(100);
  });
  it('shows every saved prize while the game is on, and none when fewer than two', async () => {
    const { service } = setup();
    await service.enable('s1', 'wheel');
    await expect(service.activeSlices('s1')).resolves.toHaveLength(4);
    await service.disable('s1');
    await expect(service.play('s1', 10)).resolves.toBeNull();
  });

  it('sets all prizes at once: chances computed, or the given ones (owner 2026-11-09)', async () => {
    const { service, read } = setup();
    await service.enable('s1', 'wheel');
    await service.setPrizes('s1', [{ percent: 10 }, { percent: 15 }, { percent: 20 }, { percent: 30 }]);
    expect((read()!.popupGamePrizes as any[]).map(p => [p.percent, p.chance])).toEqual([[10, 40], [15, 30], [20, 20], [30, 10]]);
    await service.setPrizes('s1', [{ percent: 10, chance: 50 }, { percent: 30, chance: 50 }]);
    expect((read()!.popupGamePrizes as any[]).map(p => [p.percent, p.label, p.chance])).toEqual([[10, '10 % de descuento', 50], [30, '30 % de descuento', 50]]);
  });
});


describe('rasca y elige settings (spec 2026-11-10)', () => {
  const bakery = () => {
    const made = setup();
    made.prisma.store = { findUnique: jest.fn(async () => ({ name: 'Miga Dorada', onboarding: { what: 'Panadería de autor: cookies rellenas y rolls' } })) };
    made.prisma.paymentLink = { findMany: jest.fn(async () => [{ name: 'Torre de cookies' }, { name: 'Caja de rolls' }, { name: 'Desayuno box' }]) };
    return made;
  };
  it('turning a game on writes the shape, the interests, the favourite question and WhatsApp from the store words', async () => {
    const { service, read } = bakery();
    await service.enable('s1', 'scratch');
    expect(read()).toMatchObject({ popupShape: 'cookie', popupContact: 'whatsapp', popupFavourite: { text: '¿Cuál es tu favorito?' } });
    expect((read()!.popupInterests as any).answers.map((a: any) => a.label)).toEqual(['Para mí', 'Para regalar', 'Desayunos', 'Para la oficina', 'Para una fiesta']);
  });
  it('keeps what the merchant set; the setters write each part (null removes interests)', async () => {
    const { service, read } = bakery();
    await service.setShape('s1', 'can');
    await service.setContact('s1', 'email');
    await service.enable('s1', 'wheel');
    expect(read()).toMatchObject({ popupShape: 'can', popupContact: 'email' });
    await service.setInterests('s1', null);
    await service.enable('s1', 'scratch');
    expect(read()!.popupInterests).toBeNull();
  });
  it('a store the words say nothing about gets a bag and its categories as interests', async () => {
    const { service, read } = setup();
    await service.enable('s1', 'scratch');
    expect(read()).toMatchObject({ popupShape: 'bag', popupContact: 'whatsapp' });
    expect((read()!.popupInterests as any).answers.map((a: any) => a.label)).toEqual(['Gelatos', 'Copas', 'Para regalar']);
  });
});
