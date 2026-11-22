import { PopupDesignService } from './popup-design.service';

/** Popups 2.0 part 1 (spec 2026-11-18 §5–6, §8): YAPI's answer cleaned, checked, retried once, saved LIVE or FAILED. */
const card = (inner: string) => `<div class="card"><button data-close aria-label="Cerrar">×</button>${inner}</div>`;
const answer = (over: Record<string, unknown> = {}) => ({
  composition: 'Ticket de cupón inclinado', launcher: '',
  flow: [{ id: 'o', kind: 'offer', products: [], to: 'product', questions: [] }, { id: 'p', kind: 'pick', products: ['p1', 'p2'], to: 'product', questions: [] }, { id: 'c', kind: 'capture', products: [], to: 'product', questions: [] }, { id: 'r', kind: 'reveal', products: [], to: 'product', questions: [] }, { id: 'l', kind: 'land', products: [], to: 'product', questions: [] }],
  steps: [{ id: 'o', html: card('<h2>15%</h2><button data-next>Quiero</button>') }, { id: 'p', html: card('<ul><li data-tile><img data-slot="photo" src="/v1/uploads/a.jpg" alt=""><b data-slot="name"></b></li></ul>') }, { id: 'c', html: card('<input data-field="whatsapp"><button data-submit>Enviar</button>') }, { id: 'r', html: card('<strong data-slot="code"></strong><button data-next>Ir</button>') }],
  css: '.card{background:#fff;color:#111}', ...over,
});
const goodMeasure = (stepId: string, width: number) => ({ stepId, size: { width, height: 800 }, close: { x: 10, y: 10, width: 44, height: 44, visible: true }, closeHit: true, scrollWidth: width, dialog: null, contentLeft: 0, contentRight: width - 10, contrastFails: [], fieldsTypeable: stepId === 'c' ? true : null, tiles: stepId === 'p' ? 2 : null, tileImages: stepId === 'p' ? 2 : null, screenshot: Buffer.from('jpeg-bytes-'.repeat(200)) });

function setup(answers: unknown[], over: { measures?: Array<(id: string, w: number) => unknown>; taken?: Array<{ fingerprint: string; composition: string }> } = {}) {
  const rows: any[] = [];
  let retention: any = { settings: { popupDesignId: 'old' }, updatedAt: new Date(1) };
  const prisma: any = {
    store: { findFirst: jest.fn(async () => ({ id: 's1', name: 'Calima', slug: 'calima', merchantId: 'm1', onboarding: null })) },
    storeRetention: { findUnique: jest.fn(async () => retention), upsert: jest.fn(async ({ update }: any) => { retention = { settings: update.settings }; return retention; }),
      create: jest.fn(async ({ data }: any) => { retention = { settings: data.settings, updatedAt: new Date(1) }; return retention; }),
      updateMany: jest.fn(async ({ where, data }: any) => { if (retention?.updatedAt && where.updatedAt && retention.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 }; retention = { settings: data.settings, updatedAt: new Date((retention?.updatedAt?.getTime() ?? 0) + 1) }; return { count: 1 }; }) },
    paymentLink: { findMany: jest.fn(async () => [{ id: 'p1', name: 'Habanero', amount: 4500, imageUrls: ['/v1/uploads/a.jpg'] }, { id: 'p2', name: 'Serrano', amount: 4000, imageUrls: ['/v1/uploads/b.jpg'] }]) },
    storePopupDesign: {
      findMany: jest.fn(async () => over.taken ?? []),
      aggregate: jest.fn(async () => ({ _max: { version: rows.length ? Math.max(...rows.map(r => r.version)) : null } })),
      create: jest.fn(async ({ data }: any) => { rows.push(data); return data; }),
      updateMany: jest.fn(async ({ where, data }: any) => { for (const r of rows) if (r.storeId === where.storeId && r.status === where.status && r.id !== where.id?.not && (where.moment === undefined || (r.moment ?? 'welcome') === where.moment)) Object.assign(r, data); return { count: 1 }; }),
      findFirst: jest.fn(async ({ where }: any) => rows.find(r => r.id === where.id && r.storeId === where.storeId) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find(r => r.id === where.id), data)),
    },
  };
  const order: string[] = [];
  prisma.$executeRaw = jest.fn(async () => { order.push('lock'); return 1; });
  const aggregate = prisma.storePopupDesign.aggregate; prisma.storePopupDesign.aggregate = jest.fn(async (args: any) => { order.push('version'); return aggregate(args); });
  prisma.$transaction = (fn: any) => fn(prisma);
  const uploads: any = { getBuffer: jest.fn(async () => Buffer.from('img')), saveBuffer: jest.fn(async () => ({ url: '/v1/uploads/preview.jpg', filename: 'preview.jpg', mimeType: 'image/jpeg', byteSize: 3 })) };
  const plans: any = { assertCredits: jest.fn(async () => 100) };
  const service = new PopupDesignService(prisma, { get: () => undefined } as any, uploads, plans);
  const calls: string[] = [];
  service.cut = jest.fn(async () => ({ cut: null }));
  service.call = jest.fn(async (prompt: string) => { calls.push(prompt); return answers.shift(); });
  let attempt = 0;
  service.measure = jest.fn(async (input: any) => { const make = over.measures?.[Math.min(attempt++, (over.measures?.length ?? 1) - 1)] ?? goodMeasure; return ['o', 'p', 'c', 'r'].flatMap(id => [1280, 390].map(w => make(id, w))) as any; });
  return { service, rows, prisma, calls, plans, order, retention: () => retention, setRetention: (value: any) => { retention = value; } };
}

describe('PopupDesignService', () => {
  it('saves a sound design LIVE, retires the previous one and points the store at it, with phone previews', async () => {
    const { service, rows, retention } = setup([answer()]);
    rows.push({ id: 'old', storeId: 's1', version: 1, status: 'LIVE' });
    const result = await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    expect(result.design.status).toBe('LIVE');
    expect(rows.find(r => r.id === 'old').status).toBe('RETIRED');
    expect(retention().settings.popupDesignId).toBe(result.design.id);
    const saved = rows.find(r => r.id === result.design.id);
    expect(saved).toMatchObject({ version: 2, composition: 'Ticket de cupón inclinado', capture: 'whatsapp', percent: 10 });
    expect(saved.css).toContain(`[data-pya-popup="${result.design.id}"] .card`);
    expect(saved.previews).toEqual([{ stepId: 'o', url: '/v1/uploads/preview.jpg' }, { stepId: 'p', url: '/v1/uploads/preview.jpg' }, { stepId: 'c', url: '/v1/uploads/preview.jpg' }, { stepId: 'r', url: '/v1/uploads/preview.jpg' }]);
  });

  it('retries once with what failed, then goes LIVE', async () => {
    const bad = (id: string, w: number) => ({ ...goodMeasure(id, w), closeHit: false });
    const { service, calls } = setup([answer(), answer({ composition: 'Otra cosa' })], { measures: [bad, goodMeasure] });
    const result = await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    expect(result.design.status).toBe('LIVE');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/cerrar/);
  });

  it('saves FAILED and leaves the store\'s popup alone after its three tries fail', async () => {
    const bad = (id: string, w: number) => ({ ...goodMeasure(id, w), contrastFails: ['Hola'] });
    const { service, retention } = setup([answer(), answer(), answer()], { measures: [bad, bad, bad] });
    const result = await service.design('m1', 's1', { createdBy: 'batch' });
    expect(result.design.status).toBe('FAILED');
    expect(result.problems.join(' ')).toMatch(/contraste/);
    expect(retention().settings.popupDesignId).toBe('old');
  });

  it('sends a repeated composition back to YAPI', async () => {
    const { service, calls } = setup([answer(), answer({ composition: 'Póster con la botella' })], { taken: [{ fingerprint: 'x', composition: 'ticket de cupon inclinado' }] });
    await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    expect(calls[1]).toMatch(/Composición repetida/);
  });

  it('restores an older version and changes settings without a model call', async () => {
    const { service, rows, retention } = setup([answer()]);
    rows.push({ id: 'cold000000000000000000001', storeId: 's1', version: 1, status: 'RETIRED', percent: 10, capture: 'whatsapp', flow: answer().flow });
    await service.restore('m1', 's1', 'cold000000000000000000001');
    expect(retention().settings.popupDesignId).toBe('cold000000000000000000001');
    expect(rows[0].status).toBe('LIVE');
    await service.updateSettings('m1', 's1', { percent: 50, capture: 'email' });
    expect(rows[0]).toMatchObject({ percent: 30, capture: 'email' });
    await expect(service.updateSettings('m1', 's1', { products: ['nope'] })).rejects.toThrow(/productos/);
  });
  it('answers popup requests in the chat: settings without a model call, a redesign with the merchant words', async () => {
    const { service, prisma, rows, calls } = setup([answer()]);
    const messages: string[] = [];
    prisma.storeAgentThread = { upsert: jest.fn(async () => ({ id: 't1' })) };
    prisma.storeAgentMessage = { create: jest.fn(async ({ data }: any) => { messages.push(data.content); return data; }) };
    rows.push({ id: 'cold000000000000000000001', storeId: 's1', version: 1, status: 'LIVE', percent: 10, capture: 'whatsapp', flow: answer().flow });
    prisma.storeRetention.findUnique = jest.fn(async () => ({ settings: { popupDesignId: 'cold000000000000000000001' } }));
    await expect(service.forChat({ merchantId: 'm1', storeId: 's1', input: { instruction: 'pon 20% en el popup' } as any })).resolves.toEqual({ skipped: true });
    expect(rows[0].percent).toBe(20);
    expect(calls).toHaveLength(0);
    await service.forChat({ merchantId: 'm1', storeId: 's1', input: { instruction: 'hazme otro popup más divertido' } as any });
    expect(calls[0]).toContain('hazme otro popup más divertido');
    expect(messages.at(-1)).toMatch(/^Listo: tu popup nuevo/);
  });
  // Final review (I3): off → on → a new design → save with the box ticked keeps the new design; saving while off keeps the design.
  it('keeps on/off pointed at the right design', async () => {
    const { service, rows, retention } = setup([answer()]);
    rows.push({ id: 'cold000000000000000000001', storeId: 's1', version: 1, status: 'LIVE', percent: 10, capture: 'whatsapp', flow: answer().flow });
    await service.restore('m1', 's1', 'cold000000000000000000001');
    await service.updateSettings('m1', 's1', { on: false });
    await service.updateSettings('m1', 's1', { on: false, percent: 12 });
    expect(retention().settings).toMatchObject({ popupDesignId: null, popupDesignOff: 'cold000000000000000000001' });
    expect(rows[0].percent).toBe(12);
    await service.updateSettings('m1', 's1', { on: true });
    expect(retention().settings.popupDesignId).toBe('cold000000000000000000001');
    const fresh = await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    await service.updateSettings('m1', 's1', { on: true, percent: 15 });
    expect(retention().settings.popupDesignId).toBe(fresh.design.id);
    expect(retention().settings.popupDesignOff ?? null).toBeNull();
  });
  it('takes the store lock before numbering a new version, so two designs never clash', async () => {
    const { service, order } = setup([answer()]);
    await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    expect(order).toEqual(['lock', 'version']);
  });
  it('writes the store settings only over the version it read, retrying when another save came first', async () => {
    const { service, prisma, retention, setRetention } = setup([answer()]);
    const real = prisma.storeRetention.updateMany;
    prisma.storeRetention.updateMany = jest.fn(async (args: any) => { if (prisma.storeRetention.updateMany.mock.calls.length === 1) { setRetention({ settings: { ...retention().settings, comebackEnabled: true }, updatedAt: new Date(50) }); return { count: 0 }; } return real(args); });
    await service.updateSettings('m1', 's1', { percent: 20 });
    expect(retention().settings).toMatchObject({ comebackEnabled: true, popupDesignPercent: 20 });
  });
  it('keeps «¿qué buscas?» to 6 products, the most a design was checked with', async () => {
    const { service, prisma } = setup([answer()]);
    prisma.paymentLink.findMany = jest.fn(async ({ where }: any) => (where.id?.in ?? []).map((id: string) => ({ id })));
    await expect(service.updateSettings('m1', 's1', { products: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).rejects.toThrow(/6/);
  });
  it('repairs: the retry carries the previous design, and a third attempt is allowed', async () => {
    const bad = (id: string, w: number) => ({ ...goodMeasure(id, w), contrastFails: ['Hola'] });
    const { service, calls } = setup([answer({ css: '.card{background:#fff;color:#111}.mark-1{color:red}' }), answer(), answer()], { measures: [bad, bad, goodMeasure] });
    const result = await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain('.mark-1{color:red}');
    expect(result.design.status).toBe('LIVE');
  });
  it('a full-page design must mark every step data-full', async () => {
    const plain = answer();
    const full = answer({ steps: answer().steps.map((step: any) => ({ ...step, html: step.html.replace('<div class="card">', '<div class="card" data-full>') })) });
    const { service, calls } = setup([plain, full]);
    const result = await service.design('m1', 's1', { createdBy: 'merchant-chat', layout: 'full' });
    expect(calls[0]).toMatch(/PANTALLA COMPLETA/);
    expect(calls[1]).toMatch(/data-full/);
    expect(result.design.status).toBe('LIVE');
  });
});

describe('family of moments (spec 2026-11-21 §6)', () => {
  const close = '<button data-close aria-label="Cerrar">×</button>';
  const box = (inner: string) => `<div class="card">${close}${inner}</div>`;
  const fi = (o: Record<string, unknown>) => ({ products: [], to: 'product', questions: [], source: '', ...o });
  const cartStep = { id: 'k', html: box('<ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul><button data-next>Seguir</button>') };
  const capture = { id: 'c', html: box('<input data-field><button data-submit>Enviar</button>') };
  const reveal = { id: 'r', html: box('<b data-slot="code"></b><button data-next>Ir</button>') };
  const remind = { id: 'm', html: box('<b data-slot="code"></b><button data-apply>Usar</button>') };
  const pick = { id: 'p', html: box('<h2><span data-slot="product-name"></span></h2><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul>') };
  const family = {
    composition: 'mundo de salsas', css: '.card{background:#fff;color:#111;padding:20px}',
    moments: [
      { moment: 'rescue', composition: 'carrito propio', css: '', flow: [fi({ id: 'k', kind: 'cart' }), fi({ id: 'c', kind: 'capture' }), fi({ id: 'r', kind: 'reveal' }), fi({ id: 'm', kind: 'remind' }), fi({ id: 'l', kind: 'land', to: 'checkout' })], steps: [cartStep, capture, reveal, remind] },
      { moment: 'interest', composition: 'interés propio', css: '', flow: [fi({ id: 'p', kind: 'pick', source: 'context' }), fi({ id: 'c', kind: 'capture' }), fi({ id: 'r', kind: 'reveal' }), fi({ id: 'm', kind: 'remind' })], steps: [pick, capture, reveal, remind] },
      // Broken on purpose: a return popup must not ask for the contact.
      { moment: 'return', composition: 'regreso propio', css: '', flow: [fi({ id: 'p', kind: 'pick', source: 'new' }), fi({ id: 'x', kind: 'capture' })], steps: [pick, { ...capture, id: 'x' }] },
    ],
  };
  const fixedReturn = { composition: 'regreso arreglado', flow: [fi({ id: 'p', kind: 'pick', source: 'new' }), fi({ id: 'm', kind: 'remind' })], steps: [pick, remind], css: '', launcher: '' };
  const withWelcome = () => {
    const made = setup([]);
    made.rows.push({ id: 'old', storeId: 's1', version: 1, status: 'LIVE', moment: 'welcome', css: '.card{color:#111}', steps: { o: '<div class="card"></div>' } });
    made.service.measure = jest.fn(async () => []) as any;
    return made;
  };

  it('writes the missing moments in one call, repairs the broken one alone, and saves each by moment', async () => {
    const { service, prisma, retention } = withWelcome();
    service.call = jest.fn(async (_p: string, _s: string, kind?: string) => (kind === 'family' ? family : fixedReturn)) as any;
    const result = await service.designFamily('m1', 's1', { createdBy: 'batch' });
    expect((service.call as jest.Mock).mock.calls.map(c => c[2] ?? 'design')).toEqual(['family', 'design']);
    expect(result.results.map(r => [r.moment, r.status])).toEqual([['rescue', 'LIVE'], ['interest', 'LIVE'], ['return', 'LIVE']]);
    const created = prisma.storePopupDesign.create.mock.calls.map((c: any) => c[0].data);
    expect(created.map((d: any) => d.moment)).toEqual(['rescue', 'interest', 'return']);
    expect(new Set(created.map((d: any) => d.family)).size).toBe(1);
    expect(prisma.storePopupDesign.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ moment: 'rescue', status: 'LIVE' }) }));
    expect(retention().settings.popupDesignId).toBe('old');
    expect(Object.keys(retention().settings.popupMoments)).toEqual(['rescue', 'interest', 'return']);
  });
  it('a moment that still fails after two repairs is FAILED and the others go LIVE', async () => {
    const { service, retention } = withWelcome();
    service.call = jest.fn(async (_p: string, _s: string, kind?: string) => (kind === 'family' ? family : { composition: '', flow: [], steps: [], css: '', launcher: '' })) as any;
    const result = await service.designFamily('m1', 's1', { createdBy: 'batch' });
    expect(result.results.find(r => r.moment === 'return')).toMatchObject({ status: 'FAILED', problems: expect.arrayContaining([expect.any(String)]) });
    expect(result.results.filter(r => r.status === 'LIVE').map(r => r.moment)).toEqual(['rescue', 'interest']);
    expect((service.call as jest.Mock).mock.calls.filter(c => c[2] !== 'family')).toHaveLength(2);
    expect(retention().settings.popupMoments.return).toBeUndefined();
  });
  it('a welcome redesign retires only the welcome', async () => {
    const { service, prisma } = setup([answer()]);
    await service.design('m1', 's1', { createdBy: 'merchant-chat' });
    expect(prisma.storePopupDesign.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ moment: 'welcome', status: 'LIVE' }) }));
  });
});

describe('the Popups page per moment (spec 2026-11-21 §8)', () => {
  it('lists the four moments with their designs and last-30-day counts', async () => {
    const { service, prisma, setRetention } = setup([]);
    prisma.storePopupDesign.findMany = jest.fn(async () => [
      { id: 'cw', version: 3, status: 'LIVE', moment: 'welcome', composition: 'w', previews: [], percent: 10, capture: 'whatsapp', flow: [], createdAt: new Date() },
      { id: 'cr', version: 4, status: 'LIVE', moment: 'rescue', composition: 'r', previews: [], percent: 10, capture: 'whatsapp', flow: [], createdAt: new Date() }]);
    prisma.paymentLink.findMany = jest.fn(async () => []);
    prisma.storePopupEvent = { groupBy: jest.fn(async () => [{ moment: 'rescue', kind: 'shown', _count: { _all: 5 } }, { moment: 'rescue', kind: 'completed', _count: { _all: 2 } }]) };
    setRetention({ settings: { popupDesignId: 'cw', popupMoments: { rescue: { id: 'cr' } } }, updatedAt: new Date(1) });
    const view: any = await service.overview('m1', 's1');
    expect(view.moments.map((m: any) => [m.moment, m.liveId, m.on])).toEqual([['welcome', 'cw', true], ['rescue', 'cr', true], ['interest', null, false], ['return', null, false]]);
    expect(view.moments[1].counts).toEqual({ shown: 5, closed: 0, completed: 2 });
    expect(view.designs.map((d: any) => d.id)).toEqual(['cw']);
  });
  it('switches one moment off, keeping its design to switch back on', async () => {
    const { service, retention, setRetention } = setup([]);
    setRetention({ settings: { popupDesignId: 'cw', popupMoments: { rescue: { id: 'cr' } } }, updatedAt: new Date(1) });
    await service.updateSettings('m1', 's1', { moment: 'rescue', on: false });
    expect(retention().settings.popupMoments).toEqual({ rescue: { id: 'cr', off: true } });
    await service.updateSettings('m1', 's1', { moment: 'rescue', on: true });
    expect(retention().settings.popupMoments).toEqual({ rescue: { id: 'cr' } });
    expect(retention().settings.popupDesignId).toBe('cw');
  });
  it('restores an older version of one moment without touching the others', async () => {
    const { service, rows, retention, setRetention } = setup([]);
    rows.push({ id: 'cw', storeId: 's1', version: 1, status: 'LIVE', moment: 'welcome' }, { id: 'cr1', storeId: 's1', version: 2, status: 'RETIRED', moment: 'rescue' }, { id: 'cr2', storeId: 's1', version: 3, status: 'LIVE', moment: 'rescue' });
    setRetention({ settings: { popupDesignId: 'cw', popupMoments: { rescue: { id: 'cr2' } } }, updatedAt: new Date(1) });
    await service.restore('m1', 's1', 'cr1');
    expect(rows.map(r => [r.id, r.status])).toEqual([['cw', 'LIVE'], ['cr1', 'LIVE'], ['cr2', 'RETIRED']]);
    expect(retention().settings).toMatchObject({ popupDesignId: 'cw', popupMoments: { rescue: { id: 'cr1' } } });
  });
});
