import { BadRequestException } from '@nestjs/common';
import { pickPopupLook } from '../store-popups/popup-looks';
import { RetentionService, publicRetentionSettings } from './retention.service';
import { DEFAULT_RETENTION } from './retention.dto';

// The signup popup (plan 2026-10-20-store-popup): its timing and welcome code live in the store's retention settings,
// and the code only leaves the server after a popup signup, only when it is this store's active code.
const CODES = [
  { id: 'own', storeId: 's1', code: 'PEPPA10', isActive: true },
  { id: 'off', storeId: 's1', code: 'OLD', isActive: false },
  { id: 'foreign', storeId: 's2', code: 'OTHER', isActive: true },
];
function service(saved: Record<string, unknown> = {}) {
  const findFirst = jest.fn(async ({ where }: any) => CODES.find(c => c.id === where.id && c.storeId === where.storeId && c.isActive === where.isActive) || null);
  const tx = {
    storeRetention: { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => data), updateMany: jest.fn(async () => ({ count: 1 })) },
    storeNewsletterSubscriber: { upsert: jest.fn(async () => ({ id: 'sub1' })) },
    storeEmailDelivery: { upsert: jest.fn() },
  };
  const prisma = {
    store: { findFirst: jest.fn(async () => ({ id: 's1', merchantId: 'm1' })) },
    promoCode: { findFirst },
    storeRetention: { findUnique: jest.fn(async () => ({ settings: { ...DEFAULT_RETENTION, signupEnabled: true, ...saved }, revision: 1 })) },
    category: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const s = Object.create(RetentionService.prototype); s.prisma = prisma;
  return { s, prisma, tx };
}
const dto = (over: Record<string, unknown> = {}) => ({ ...DEFAULT_RETENTION, revision: 0, signupEnabled: true, ...over }) as any;
const store = { id: 's1', slug: 'peppa', name: 'PEPPA please' };

describe('signup popup settings', () => {
  it('refuses a welcome code that is inactive or belongs to another store', async () => {
    for (const id of ['off', 'foreign']) await expect(service().s.save('m1', 's1', dto({ popupPromoCodeId: id }))).rejects.toThrow(new BadRequestException('Elige un código activo de esta tienda.'));
  });
  it('saves the timing and the store own active code', async () => {
    const { s, tx } = service();
    await s.save('m1', 's1', dto({ popupTrigger: 'delay', popupDelaySeconds: 12, popupPromoCodeId: 'own' }));
    expect(tx.storeRetention.create.mock.calls[0][0].data.settings).toMatchObject({ popupTrigger: 'delay', popupDelaySeconds: 12, popupPromoCodeId: 'own' });
  });
  it('defaults to both triggers after eight seconds and no code', () => {
    expect(DEFAULT_RETENTION).toMatchObject({ popupTrigger: 'both', popupDelaySeconds: 8, popupPromoCodeId: null });
  });
});

describe('popup signup', () => {
  it('hands out the store active code only to a popup signup', async () => {
    expect(await service({ popupPromoCodeId: 'own' }).s.subscribe(store, 'ana@example.com', { source: 'popup' })).toEqual({ subscribed: true, code: 'PEPPA10' });
    expect(await service({ popupPromoCodeId: 'own' }).s.subscribe(store, 'ana@example.com', {})).toEqual({ subscribed: true });
  });
  it('gives no code when the saved code was switched off or none is set', async () => {
    expect(await service({ popupPromoCodeId: 'off' }).s.subscribe(store, 'ana@example.com', { source: 'popup' })).toEqual({ subscribed: true });
    expect(await service().s.subscribe(store, 'ana@example.com', { source: 'popup' })).toEqual({ subscribed: true });
  });
});

describe('public popup settings', () => {
  it('carry the timing and whether a code exists, never the code or its id', () => {
    const out = publicRetentionSettings({ ...DEFAULT_RETENTION, signupEnabled: true, popupTrigger: 'exit', popupDelaySeconds: 5, popupPromoCodeId: 'own' } as any);
    expect(out).toMatchObject({ signupEnabled: true, popupTrigger: 'exit', popupDelaySeconds: 5, popupHasCode: true });
    expect(JSON.stringify(out)).not.toMatch(/own|PEPPA10|popupPromoCodeId/);
  });
});

describe('popup looks (spec 2026-11-09)', () => {
  it('keeps the look, photo and previous look when Ajustes saves without them', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupLook: 'postal', popupLookPrevious: 'cartel', popupPhoto: '/v1/uploads/a.jpg' }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3 }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupLook: 'postal', popupLookPrevious: 'cartel', popupPhoto: '/v1/uploads/a.jpg' });
  });
  it('records the previous look when Ajustes changes it', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupLook: 'postal' }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3, popupLook: 'revista' }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupLook: 'revista', popupLookPrevious: 'postal' });
  });
  it('gives the store page a look for every store, and the chosen photo, never the previous look', () => {
    const saved = publicRetentionSettings({ ...DEFAULT_RETENTION, popupLook: 'etiqueta', popupLookPrevious: 'postal', popupPhoto: '/v1/uploads/a.jpg' } as never, 'miga') as Record<string, unknown>;
    expect(saved).toMatchObject({ popupLook: 'etiqueta', popupPhoto: '/v1/uploads/a.jpg' });
    expect(saved).not.toHaveProperty('popupLookPrevious');
    expect(publicRetentionSettings(DEFAULT_RETENTION as never, 'miga')).toMatchObject({ popupLook: pickPopupLook('miga') });
    expect(publicRetentionSettings({ ...DEFAULT_RETENTION, popupLook: 'ruleta' } as never, 'miga')).toMatchObject({ popupLook: pickPopupLook('miga') });
  });
});

describe('popup looks — Ajustes through the real DTO (review 2026-11-09)', () => {
  it('keeps the saved look when the Studio form does not send one', async () => {
    const { plainToInstance } = require('class-transformer');
    const { RetentionSettingsDto } = require('./retention.dto');
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupLook: 'revista' }, revision: 3 } as never);
    await s.save('m1', 's1', plainToInstance(RetentionSettingsDto, { ...DEFAULT_RETENTION, revision: 3, signupEnabled: true }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupLook: 'revista' });
  });
});

describe('popup games (spec 2026-11-09)', () => {
  const PRIZES = [{ promoCodeId: 'p5', label: '5 % de descuento', chance: 60 }, { promoCodeId: 'p10', label: '10 % de descuento', chance: 40 }];
  it('tells the page the game, its prize labels and the question — never the codes', () => {
    const shown = publicRetentionSettings({ ...DEFAULT_RETENTION, popupGame: 'wheel', popupGamePrizes: PRIZES, popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } } as never, 'miga') as Record<string, unknown>;
    expect(shown).toMatchObject({ popupGame: 'wheel', popupGameSlices: ['5 % de descuento', '10 % de descuento'], popupQuestion: { text: '¿Para quién?' } });
    expect(JSON.stringify(shown)).not.toMatch(/p5|p10|popupGamePrizes/);
    expect(publicRetentionSettings({ ...DEFAULT_RETENTION, popupGame: 'wheel', popupGamePrizes: PRIZES.slice(0, 1) } as never, 'miga')).not.toHaveProperty('popupGame');
  });
  it('keeps the game when Ajustes saves', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupGame: 'scratch', popupGamePrizes: PRIZES, popupQuestion: null }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3 }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupGame: 'scratch', popupGamePrizes: PRIZES });
  });
  it('a game signup returns the prize code and stores a valid answer', async () => {
    const { s, prisma, tx } = service({ popupGame: 'scratch', popupGamePrizes: PRIZES, popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } });
    (s as any).games = { validPrize: jest.fn(async () => true), claim: jest.fn(async () => ({ code: 'RASCA10' })) };
    (prisma as any).storeNewsletterSubscriber = { findUnique: jest.fn(async () => null) };
    expect(await s.subscribe(store, 'ana@example.com', { source: 'popup', gameToken: 't', answer: 'Para regalar' } as never)).toEqual({ subscribed: true, code: 'RASCA10' });
    expect((s as any).games.claim).toHaveBeenCalledWith('s1', 't', false);
    expect((tx.storeNewsletterSubscriber.upsert.mock.calls[0] as any)[0].create.interests).toEqual(['Para regalar']);
  });
});

describe('popup games — claims (review 2026-11-09)', () => {
  const PRIZES = [{ promoCodeId: 'p5', label: '5 % de descuento', chance: 60 }, { promoCodeId: 'p10', label: '10 % de descuento', chance: 40 }];
  it('an expired or dead prize subscribes nobody, so playing again still works', async () => {
    const { s, prisma, tx } = service({ popupGame: 'scratch', popupGamePrizes: PRIZES });
    (s as any).games = { validPrize: jest.fn(async () => false), claim: jest.fn() };
    (prisma as any).storeNewsletterSubscriber = { findUnique: jest.fn(async () => null) };
    await expect(s.subscribe(store, 'ana@example.com', { source: 'popup', gameToken: 'old' } as never)).rejects.toThrow('Tu premio venció; vuelve a jugar.');
    expect(tx.storeNewsletterSubscriber.upsert).not.toHaveBeenCalled();
  });
  it('an email that only saved a cart (inactive) still gets its prize', async () => {
    const { s, prisma } = service({ popupGame: 'scratch', popupGamePrizes: PRIZES });
    (s as any).games = { validPrize: jest.fn(async () => true), claim: jest.fn(async () => ({ code: 'RASCA5' })) };
    (prisma as any).storeNewsletterSubscriber = { findUnique: jest.fn(async () => ({ id: 'x', isActive: false })) };
    await s.subscribe(store, 'ana@example.com', { source: 'popup', gameToken: 't' } as never);
    expect((s as any).games.claim).toHaveBeenCalledWith('s1', 't', false);
  });
});

// Spec 2026-11-09 YAPI A/B tests: a B visitor of a running popup test sees B's popup and gets B's code; a new signup carries its visit.
describe('popup A/B tests', () => {
  const visits: Record<string, any> = {
    tokB: { id: 'vB', variant: 'B', experiment: { kind: 'popup', variantSettings: { discount: 15, percentA: 10, look: 'revista' }, variantPromoCodeId: 'codeB' } },
    tokA: { id: 'vA', variant: 'A', experiment: { kind: 'popup', variantSettings: { discount: 15, percentA: 10, look: 'revista' }, variantPromoCodeId: 'codeB' } },
  };
  function abService() {
    const built = service({ popupPromoCodeId: 'own', popupLook: 'postal', signupBody: 'Recetas y un 10 % de bienvenida.' });
    (built.prisma as any).storeSourceVisit = { findFirst: jest.fn(async ({ where }: any) => visits[where.token] ?? null) };
    CODES.push({ id: 'codeB', storeId: 's1', code: 'BIENVENIDA15-AB12', isActive: true });
    return built;
  }
  const upsertArg = (tx: any) => (tx.storeNewsletterSubscriber.upsert.mock.calls as any[])[0][0];
  afterEach(() => { const at = CODES.findIndex(c => c.id === 'codeB'); if (at >= 0) CODES.splice(at, 1); });

  it('a B visitor sees B look and B percent; an A visitor, no visitor or a stranger token sees A', async () => {
    const { s } = abService();
    const b = publicRetentionSettings((await s.settingsFor('s1', 'tokB')).settings, 'peppa');
    expect(b).toMatchObject({ popupLook: 'revista', signupBody: 'Recetas y un 15 % de bienvenida.', popupHasCode: true });
    for (const token of ['tokA', undefined, 'nope']) {
      const a = publicRetentionSettings((await s.settingsFor('s1', token)).settings, 'peppa');
      expect(a).toMatchObject({ popupLook: 'postal', signupBody: 'Recetas y un 10 % de bienvenida.' });
    }
  });

  it('only a running popup test of this store counts: the visit is read with those conditions', async () => {
    const { s, prisma } = abService();
    await s.settingsFor('s1', 'tokB');
    expect((prisma as any).storeSourceVisit.findFirst.mock.calls[0][0].where).toMatchObject({ token: 'tokB', experiment: { storeId: 's1', status: 'RUNNING', kind: 'popup' }, createdAt: { gte: expect.any(Date) } });
  });

  it('a B popup signup gets B code and its new row carries the visit', async () => {
    const { s, tx } = abService();
    expect(await s.subscribe(store, 'ana@example.com', { source: 'popup', sourceVisitToken: 'tokB' })).toEqual({ subscribed: true, code: 'BIENVENIDA15-AB12' });
    expect(upsertArg(tx).create).toMatchObject({ sourceVisitId: 'vB' });
    expect(upsertArg(tx).update.sourceVisitId).toBeUndefined();
  });

  it('an existing subscriber is not a new B signup, and an A signup keeps A code', async () => {
    const { s, tx } = abService();
    await s.subscribe(store, 'ana@example.com', { source: 'popup', sourceVisitToken: 'tokB' });
    expect(Object.keys(upsertArg(tx).update)).not.toContain('sourceVisitId');
    const a = abService();
    expect(await a.s.subscribe(store, 'eva@example.com', { source: 'popup', sourceVisitToken: 'tokA' })).toEqual({ subscribed: true, code: 'PEPPA10' });
    expect(upsertArg(a.tx).create).toMatchObject({ sourceVisitId: 'vA' });
  });
});

describe('rasca y elige public settings (spec 2026-11-10)', () => {
  const GAME = { popupGame: 'scratch', popupGamePrizes: [{ percent: 5, label: '5 %', chance: 60 }, { percent: 10, label: '10 %', chance: 40 }] };
  const INTERESTS = { text: '¿Qué te interesa?', answers: [{ label: 'Para mí', icon: '🙋' }, { label: 'Para regalar', icon: '🎁' }] };
  it('hands the page the shape, interests, favourite question and contact while a game is on', () => {
    const out = publicRetentionSettings({ ...DEFAULT_RETENTION, ...GAME, popupShape: 'can', popupInterests: INTERESTS, popupFavourite: { text: '¿Cuál es tu sabor favorito?' }, popupContact: 'email' } as never) as Record<string, unknown>;
    expect(out).toMatchObject({ popupShape: 'can', popupInterests: INTERESTS, popupFavourite: { text: '¿Cuál es tu sabor favorito?' }, popupContact: 'email' });
    const off = publicRetentionSettings({ ...DEFAULT_RETENTION, popupShape: 'can', popupInterests: INTERESTS } as never) as Record<string, unknown>;
    expect(off.popupShape).toBeUndefined();
    expect(off.popupInterests).toBeUndefined();
  });
  it('reads an old text question as interests, an unknown shape as none, and WhatsApp by default', () => {
    const out = publicRetentionSettings({ ...DEFAULT_RETENTION, ...GAME, popupShape: 'rocket', popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } } as never) as Record<string, unknown>;
    expect(out).toMatchObject({ popupShape: null, popupContact: 'whatsapp', popupInterests: { text: '¿Para quién?', answers: [{ label: 'Para mí', icon: '' }, { label: 'Para regalar', icon: '' }] } });
  });
  it('keeps them when Ajustes saves without them', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupShape: 'cookie', popupInterests: INTERESTS, popupFavourite: { text: 'x' }, popupContact: 'email' }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3 }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupShape: 'cookie', popupInterests: INTERESTS, popupFavourite: { text: 'x' }, popupContact: 'email' });
  });
});

describe('rasca y elige signups (spec 2026-11-10)', () => {
  const INTERESTS = { text: '¿Qué te interesa?', answers: [{ label: 'Para regalar', icon: '🎁' }, { label: 'Desayunos', icon: '☕' }] };
  const setup = (saved: Record<string, unknown> = {}, existing: Record<string, unknown> | null = null) => {
    const made = service({ popupGame: 'scratch', popupInterests: INTERESTS, popupContact: 'whatsapp', ...saved });
    const whatsapp = { findUnique: jest.fn(async () => existing), upsert: jest.fn(async ({ create }: any) => ({ id: 'w1', ...create })) };
    (made.prisma as any).storeWhatsappSubscriber = whatsapp; (made.tx as any).storeWhatsappSubscriber = whatsapp;
    (made.prisma as any).paymentLink = { findMany: jest.fn(async ({ where }: any) => [{ id: 'p1', variants: [] }, { id: 'soda', variants: [{ options: [{ name: 'Sabor', value: 'Sandía y menta' }] }] }].filter(p => p.id === where.id)) };
    made.s.games = { validPrize: jest.fn(async () => true), claim: jest.fn(async (_s: string, _t: string, existed: boolean, by?: string) => existed ? { message: by === 'phone' ? 'Este número ya recibió su premio.' : 'Este correo ya recibió su premio.' } : { code: 'RASCA10-ABCDEF' }) };
    return { ...made, whatsapp };
  };
  it('a WhatsApp signup keeps the number, the store own answers and a real favourite, and gets the prize', async () => {
    const { s, whatsapp } = setup();
    const out = await s.subscribe(store, null, { phone: '7123 4567', answers: ['Para regalar', 'Inventado'], favourite: 'p1', gameToken: 't', consent: true, source: 'popup' });
    expect(out).toEqual({ subscribed: true, code: 'RASCA10-ABCDEF' });
    expect(whatsapp.upsert.mock.calls[0][0].create).toMatchObject({ storeId: 's1', phone: '59171234567', interests: ['Para regalar'], favourite: 'p1' });
  });
  it('a flavour of a one-product store is a favourite; anything else is dropped', async () => {
    const { s, whatsapp } = setup();
    await s.subscribe(store, null, { phone: '71234567', favourite: 'soda:Sandía y menta', consent: true });
    expect(whatsapp.upsert.mock.calls[0][0].create.favourite).toBe('soda:Sandía y menta');
    await s.subscribe(store, null, { phone: '71234567', favourite: 'other-store-product', consent: true });
    expect(whatsapp.upsert.mock.calls[1][0].create.favourite).toBeNull();
  });
  it('the same number gets no second prize; a wrong number is refused in plain words', async () => {
    const { s } = setup({}, { isActive: true });
    await expect(s.subscribe(store, null, { phone: '71234567', gameToken: 't', consent: true })).resolves.toEqual({ subscribed: true, message: 'Este número ya recibió su premio.' });
    await expect(s.subscribe(store, null, { phone: '123', consent: true })).rejects.toThrow('Escribe tu WhatsApp con 8 números, como 71234567.');
  });
  it('an email store keeps the favourite and the answers on the email subscriber', async () => {
    const { s, tx } = setup({ popupContact: 'email' });
    await s.subscribe(store, 'Ana@Mail.com', { favourite: 'p1', answers: ['Desayunos'], consent: true });
    expect((tx.storeNewsletterSubscriber.upsert.mock.calls[0] as any)[0].create).toMatchObject({ email: 'ana@mail.com', favourite: 'p1', interests: ['Desayunos'] });
  });
});
