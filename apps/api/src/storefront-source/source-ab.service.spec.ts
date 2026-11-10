import { ConflictException } from '@nestjs/common';
import { SourceAbService } from './source-ab.service';
import type { AbNumbers } from './source-ab';

/** YAPI A/B tests (spec 2026-11-09): the lines and cards YAPI posts, no model call. */
function setup(over: { store?: Record<string, unknown>; running?: any; canPublish?: boolean } = {}) {
  const messages: any[] = [];
  const store = { id: 's', slug: 'remo', status: 'ACTIVE', publicVisibility: true, sourcePublicationPaused: false, publishedSourceRevision: 4, checkoutMode: 'payment', sourcePublicationVersion: 3, ...over.store };
  let running = over.running ?? null;
  const prisma: any = {
    store: { findFirst: jest.fn(async () => store) },
    storeAgentThread: { upsert: jest.fn(async () => ({ id: 't' })) },
    storeAgentMessage: {
      create: jest.fn(async ({ data }) => { const row = { id: `m${messages.length}`, ...data, createdAt: new Date() }; messages.push(row); return row; }),
      findMany: jest.fn(async () => [...messages].reverse()),
    },
    storeRetention: { findUnique: jest.fn(async () => ({ settings: { popupPromoCodeId: 'codeA', popupLook: 'postal' } })) },
    promoCode: { findFirst: jest.fn(async () => ({ id: 'codeA', discountType: 'PERCENT', discountValue: 10 })) },
    storeSourceExperiment: { findUnique: jest.fn(async () => running), updateMany: jest.fn(async () => ({ count: 1 })) },
    storeSourceVisit: { count: jest.fn(async () => 3) },
  };
  const publishing: any = {
    startPopupTest: jest.fn(async () => { if (running) throw new ConflictException(`Ya tienes una prueba de «${running.request}» corriendo. ¿La termino para empezar esta?`); running = { id: 'e1', status: 'RUNNING', request: '15% vs 10%' }; }),
    finishWith: jest.fn(async () => { running = null; }),
    extend: jest.fn(async () => undefined),
  };
  const plans: any = { assertCanPublish: jest.fn(async () => { if (over.canPublish === false) throw new ConflictException('Tu plan Gratis no incluye publicar la tienda. Elige un plan para publicarla y empezar a vender.'); }) };
  const service = new SourceAbService(prisma, publishing, plans);
  return { service, prisma, publishing, messages, last: () => messages.at(-1), setRunning: (value: any) => { running = value; } };
}
const numbers = (over: Partial<AbNumbers> = {}): AbNumbers => ({ kind: 'popup', request: '15% vs 10%', days: 3, a: { visitors: 40, buyers: 1, signups: 4 }, b: { visitors: 42, buyers: 2, signups: 7 }, winner: null, stale: false, ...over });

describe('before building B', () => {
  it('says what is missing: a published store, a paid plan, integrated payments, no other test', async () => {
    expect(await setup({ store: { publishedSourceRevision: null } }).service.blocker('m', 's')).toBe('Para hacer una prueba A/B, primero publica tu tienda.');
    expect(await setup({ canPublish: false }).service.blocker('m', 's')).toContain('Tu plan Gratis');
    expect(await setup({ store: { checkoutMode: 'contact' } }).service.blocker('m', 's')).toBe('Para comparar ventas reales, activa los pagos integrados de tu tienda.');
    expect(await setup({ running: { id: 'e0', request: 'otra portada', kind: 'design' } }).service.blocker('m', 's')).toBe('Ya tienes una prueba de «otra portada» corriendo. ¿La termino para empezar esta?');
    expect(await setup().service.blocker('m', 's')).toBeNull();
  });
});

describe('a test already running', () => {
  it('the refusal comes with buttons to end it — «sí» alone means nothing to YAPI (live Remolino 2026-11-09)', async () => {
    const { service, last } = setup({ running: { id: 'e0', request: 'otra portada', kind: 'design' } });
    await service.blocked('s', 'Ya tienes una prueba de «otra portada» corriendo. ¿La termino para empezar esta?');
    expect(last().content).toBe('Ya tienes una prueba de «otra portada» corriendo. ¿La termino para empezar esta?');
    expect(last().metadata.abChips.map((c: any) => [c.label, c.action])).toEqual([['Terminarla y dejar A', 'keepA'], ['Terminarla y dejar B', 'keepB']]);
    await setup().service.blocked('s', 'Para hacer una prueba A/B, primero publica tu tienda.');
  });
  it('another blocker is said plainly, without buttons', async () => {
    const { service, last } = setup();
    await service.blocked('s', 'Para hacer una prueba A/B, primero publica tu tienda.');
    expect(last().metadata.abChips).toBeUndefined();
  });
});

describe('final review 2026-11-09 (re-graded)', () => {
  it('a database fault in the plan check is said in plain words', async () => {
    const built = setup();
    (built.service as any).plans = { assertCanPublish: jest.fn(async () => { throw Object.assign(new Error('Invalid `prisma.merchant.findUnique()` invocation'), { name: 'PrismaClientUnknownRequestError' }); }) } as any;
    expect(await built.service.blocker('m', 's')).toBe('No pude revisar tu plan por un problema mío. Inténtalo de nuevo en un momento.');
  });
  it('a popup test is refused while the popup plays a game: every signup wins the game prize, so nothing would be measured', async () => {
    const built = setup();
    built.prisma.storeRetention.findUnique.mockResolvedValue({ settings: { popupPromoCodeId: 'codeA', popupLook: 'postal', popupGame: 'wheel' } });
    await built.service.proposePopup('s', 'prueba si 15% atrae más que 10%');
    expect(built.last().content).toBe('Tu ventana tiene un juego (rasca o ruleta) y cada cliente gana su premio, así que una prueba de la ventana no mediría nada. Apaga el juego y la pruebo.');
    expect(built.last().metadata.abChips).toBeUndefined();
  });
  it('a design launch with a test already running says so at once, before minutes of checks', async () => {
    const built = setup();
    const id = ((await built.service.proposeDesign('s', 7, 'prueba otra portada')).metadata as any).abProposal.id;
    built.setRunning({ id: 'e9', request: '15% vs 10%', kind: 'popup' });
    expect(await built.service.answer('m', 's', id, 'launch')).not.toHaveProperty('needsChecks');
    expect(built.last().content).toBe('Ya tienes una prueba de «15% vs 10%» corriendo. ¿La termino para empezar esta?');
  });
});

describe('the card', () => {
  it('a popup ask reads B and asks to launch, without touching the popup', async () => {
    const { service, last, prisma } = setup();
    await service.proposePopup('s', 'prueba si 15% atrae más que 10%');
    expect(last().content).toBe('Versión B de tu ventana: 15 % de descuento (hoy 10 %). ¿Lanzo la prueba? La mitad de tus visitantes verá esta versión.');
    expect(last().metadata.abProposal).toMatchObject({ kind: 'popup', variant: { discount: 15 }, request: 'prueba si 15% atrae más que 10%' });
    expect(last().metadata.abChips.map((c: any) => c.action)).toEqual(['launch', 'cancel']);
    expect(prisma.storeRetention.update).toBeUndefined();
  });
  it('an unclear popup ask gets one question', async () => {
    const { service, last } = setup();
    await service.proposePopup('s', 'prueba otra ventana');
    expect(last().content).toBe('¿Qué quieres probar en tu ventana: otro descuento (por ejemplo 15 %) u otro estilo (Clásica, Portada, Cartel, Postal, Revista o Etiqueta)?');
    expect(last().metadata.abChips).toBeUndefined();
  });
  it('a design B gets launch, another option and cancel', async () => {
    const { service, last } = setup();
    await service.proposeDesign('s', 7, 'prueba otra portada');
    expect(last().content).toBe('Esta es la versión B (en la vista previa). ¿Lanzo la prueba? La mitad de tus visitantes verá esta versión.');
    expect(last().metadata.abProposal).toMatchObject({ kind: 'design', revision: 7 });
    expect(last().metadata.abChips.map((c: any) => c.action)).toEqual(['launch', 'another', 'cancel']);
  });
});

describe('the buttons', () => {
  it('launching twice starts one test', async () => {
    const { service, last, publishing } = setup();
    const card = await service.proposePopup('s', 'prueba si 15% atrae más que 10%');
    const id = (card.metadata as any).abProposal.id;
    await service.answer('m', 's', id, 'launch');
    expect(last().content).toBe('Listo: tu prueba de «prueba si 15% atrae más que 10%» empezó. La mitad de tus visitantes ve la versión B; te cuento cómo va.');
    await service.answer('m', 's', id, 'launch');
    expect(publishing.startPopupTest).toHaveBeenCalledTimes(2);
    expect(last().content).toBe('Ya tienes una prueba de «15% vs 10%» corriendo. ¿La termino para empezar esta?');
  });
  it('an internal failure is said in plain words, never the database text (live Remolino 2026-11-09)', async () => {
    const { service, last, publishing } = setup();
    const id = ((await service.proposePopup('s', 'prueba si 15% atrae más que 10%')).metadata as any).abProposal.id;
    publishing.startPopupTest.mockRejectedValueOnce(Object.assign(new Error('Invalid `tx.storeSourceExperiment.create()` invocation\n  245   const code = discount ?'), { name: 'PrismaClientUnknownRequestError' }));
    await service.answer('m', 's', id, 'launch');
    expect(last().content).toBe('No pude iniciar la prueba por un problema mío. Tu tienda sigue como estaba; inténtalo de nuevo en un momento.');
  });
  it('a design launch asks the Studio for the checks; another option resends the words; cancel says so', async () => {
    const { service, last } = setup();
    const id = ((await service.proposeDesign('s', 7, 'prueba otra portada')).metadata as any).abProposal.id;
    expect(await service.answer('m', 's', id, 'launch')).toEqual({ needsChecks: { revision: 7, request: 'prueba otra portada' } });
    expect(await service.answer('m', 's', id, 'another')).toEqual({ resend: 'prueba otra portada' });
    await service.answer('m', 's', id, 'cancel');
    expect(last().content).toBe('Listo, no lanzo la prueba.');
  });
  it('after the Studio launched a design B, YAPI says it started; with no test running it says nothing went live', async () => {
    const { service, last, setRunning } = setup();
    const id = ((await service.proposeDesign('s', 7, 'prueba otra portada')).metadata as any).abProposal.id;
    await service.answer('m', 's', id, 'launched');
    expect(last().content).toBe('No tienes una prueba corriendo. Pídeme una: por ejemplo «prueba si 15% atrae más que 10%» o «prueba otra portada».');
    setRunning({ id: 'e1', request: 'prueba otra portada', kind: 'design' });
    await service.answer('m', 's', id, 'launched');
    expect(last().content).toBe('Listo: tu prueba de «prueba otra portada» empezó. La mitad de tus visitantes ve la versión B; te cuento cómo va.');
  });
  it('keepA / keepB end the running test with the merchant choice; extend gives two more weeks', async () => {
    const { service, publishing, last } = setup({ running: { id: 'e1', request: '15% vs 10%', kind: 'popup' } });
    await service.answer('m', 's', 'end', 'keepB');
    expect(publishing.finishWith).toHaveBeenCalledWith('m', 's', 3, 'e1', 'B');
    expect(last().content).toBe('Listo: dejé la versión B como tu ventana.');
    const again = setup({ running: { id: 'e1', request: 'otra portada', kind: 'design' } });
    await again.service.answer('m', 's', 'end', 'keepA');
    expect(again.last().content).toBe('Listo: me quedo con A, tu tienda como estaba.');
    const more = setup({ running: { id: 'e1', request: 'otra portada', kind: 'design' } });
    await more.service.answer('m', 's', 'end', 'extend');
    expect(more.publishing.extend).toHaveBeenCalledWith('m', 's', 'e1');
    expect(more.last().content).toBe('Listo: la prueba sigue dos semanas más.');
  });
});

describe('status, end and notes', () => {
  it('status says the numbers, or that no test runs', async () => {
    const { service, last } = setup();
    jest.spyOn(service, 'numbers').mockResolvedValue(numbers());
    await service.status('s');
    expect(last().content).toBe('Tu prueba de «15% vs 10%» lleva 3 días: A tuvo 40 visitantes y 4 suscripciones, B 42 y 7. Todavía no hay una diferencia clara.');
    jest.spyOn(service, 'numbers').mockResolvedValue(null);
    await service.status('s');
    expect(last().content).toBe('No tienes una prueba corriendo. Pídeme una: por ejemplo «prueba si 15% atrae más que 10%» o «prueba otra portada».');
  });
  it('end asks which version stays', async () => {
    const { service, last } = setup({ running: { id: 'e1', request: 'otra portada', kind: 'design' } });
    jest.spyOn(service, 'numbers').mockResolvedValue(numbers({ kind: 'design', request: 'otra portada' }));
    await service.end('s');
    expect(last().content).toBe('¿Qué versión dejo? A es tu tienda como está; B es la de «otra portada».');
    expect(last().metadata.abChips.map((c: any) => c.action)).toEqual(['keepA', 'keepB']);
  });
  it('a note: at most once a day and only when visits came; the end card when there is a winner or the test is stale', async () => {
    const running = { id: 'e1', request: '15% vs 10%', kind: 'popup', lastNoteAt: null };
    const { service, messages, prisma } = setup({ running });
    jest.spyOn(service, 'numbers').mockResolvedValue(numbers());
    await service.note('s');
    expect(messages).toHaveLength(1);
    running.lastNoteAt = new Date() as any;
    await service.note('s');
    expect(messages).toHaveLength(1);
    running.lastNoteAt = new Date(Date.now() - 2 * 86400000) as any;
    prisma.storeSourceVisit.count.mockResolvedValue(0);
    await service.note('s');
    expect(messages).toHaveLength(1);
    jest.spyOn(service, 'numbers').mockResolvedValue(numbers({ winner: 'B' }));
    await service.note('s');
    expect(messages.at(-1).content).toBe('B suscribe más: se suscribió el 16,7 % de sus visitantes, contra 10,0 % en A. ¿La dejo como tu ventana?');
    expect(messages.at(-1).metadata.abChips.map((c: any) => [c.label, c.action])).toEqual([['Sí, deja B', 'keepB'], ['Quedarme con A', 'keepA']]);
    jest.spyOn(service, 'numbers').mockResolvedValue(numbers({ stale: true, days: 28 }));
    running.lastNoteAt = new Date(Date.now() - 2 * 86400000) as any;
    await service.note('s');
    expect(messages.at(-1).metadata.abChips.map((c: any) => [c.label, c.action])).toEqual([['Quedarme con A', 'keepA'], ['Seguir 2 semanas más', 'extend']]);
  });
});
