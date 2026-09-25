import { clearStoreDnaCache, publishedStoreDna, publishedStoreLook } from './store-dna';
import { sourceRuntimeDna } from '../storefront-source/source-dna';

describe('publishedStoreDna', () => {
  beforeEach(() => clearStoreDnaCache());
  const seeded = sourceRuntimeDna(undefined, 'store-1');
  const config = (dna: unknown): any => ({ $queryRaw: jest.fn(async () => [{ content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 's', dna })};` }]) });

  it('serves the DNA of the published config.js', async () => {
    const dna = { ...seeded, button: seeded.button === 'stamp' ? 'pill' : 'stamp', cart: seeded.cart === 'sheet' ? 'page' : 'sheet' };
    const prisma = config(dna);
    await expect(publishedStoreDna(prisma, 'store-1', 3)).resolves.toEqual(dna);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('keeps the seeded value for unknown or missing fields', async () => {
    const result = await publishedStoreDna(config({ button: 'sparkle', review: 'ticket', evil: 'x' }), 'store-1', 3);
    expect(result).toEqual({ ...seeded, review: 'ticket' });
  });
  it('serves no DNA for a store without a published source revision (classic stores render as today)', async () => {
    const prisma = config({ button: 'pill' });
    for (const revision of [null, undefined]) await expect(publishedStoreDna(prisma, 'store-1', revision)).resolves.toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it.each([
    ['a failing query', 2, { $queryRaw: jest.fn(async () => { throw new Error('db'); }) }],
    ['an unreadable config', 2, { $queryRaw: jest.fn(async () => [{ content: 'window.PAGOSYA_CONFIG = {oops' }]) }],
    ['no config.js', 2, { $queryRaw: jest.fn(async () => []) }],
    ['a config without dna', 2, config(undefined)],
  ])('falls back to the seeded DNA with %s', async (_label, revision, prisma) => {
    await expect(publishedStoreDna(prisma as any, 'store-1', revision as number | null)).resolves.toEqual(seeded);
  });

  it('reads a published revision once: revisions are immutable, so the next request is a cache hit', async () => {
    const prisma = config({ ...seeded, button: 'stamp' });
    const first = await publishedStoreDna(prisma, 'store-1', 4);
    await expect(publishedStoreDna(prisma, 'store-1', 4)).resolves.toEqual(first);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    await publishedStoreDna(prisma, 'store-1', 5); // a new publication is a new key
    await publishedStoreDna(prisma, 'store-2', 4);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('does not cache a failed read, and keeps the cache bounded', async () => {
    const failing = { $queryRaw: jest.fn(async () => { throw new Error('db'); }) };
    await publishedStoreDna(failing as any, 'store-1', 6);
    await publishedStoreDna(failing as any, 'store-1', 6);
    expect(failing.$queryRaw).toHaveBeenCalledTimes(2);
    const prisma = config({ button: 'pill' });
    for (let i = 0; i < 600; i++) await publishedStoreDna(prisma, `s${i}`, 1);
    await publishedStoreDna(prisma, 's0', 1); // evicted (least recently used)
    await publishedStoreDna(prisma, 's599', 1); // still cached
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(601);
  });
});

describe('publishedStoreLook (sub-project 3: the confirmation motif)', () => {
  beforeEach(() => clearStoreDnaCache());
  const drawing = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12l5 5L20 6"/></svg>';
  const motif = (overrides: object = {}) => ({ file: 'motifs/tienda.svg', for: 'store', target: 'Tienda', behavior: 'draw', trigger: 'purchase', placement: 'confirmation', svg: drawing, ...overrides });
  const config = (value: object): any => ({ $queryRaw: jest.fn(async () => [{ content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 's', ...value })};` }]) });

  it('serves the confirmation motif of the published config with the DNA, from one read', async () => {
    const prisma = config({ dna: { button: 'stamp' }, motifs: [motif({ placement: 'product', trigger: 'hover', behavior: 'glow' }), motif()] });
    const look = await publishedStoreLook(prisma, 'store-1', 3);
    expect(look).toEqual({ dna: expect.objectContaining({ button: 'stamp' }), confirmationMotif: { behavior: 'draw', svg: drawing, motion: 'subtle' } });
    await expect(publishedStoreDna(prisma, 'store-1', 3)).resolves.toEqual(look!.dna);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('re-sanitises the markup it serves, and serves none when it cannot be cleaned', async () => {
    const hostile = drawing.replace('<path', '<foreignObject><img src=x onerror="alert(1)"></foreignObject><path onclick="alert(1)"');
    expect((await publishedStoreLook(config({ motifs: [motif({ svg: hostile })] }), 'store-1', 3))!.confirmationMotif).toEqual({ behavior: 'draw', svg: drawing, motion: 'subtle' });
    clearStoreDnaCache();
    expect((await publishedStoreLook(config({ motifs: [motif({ svg: '<img src=x onerror=alert(1)>' })] }), 'store-1', 3))!.confirmationMotif).toBeNull();
  });
  it("carries the store's motion setting, so the confirmation stays still when the merchant turned motion off", async () => {
    expect((await publishedStoreLook(config({ motion: 'off', motifs: [motif()] }), 'store-1', 3))!.confirmationMotif).toEqual({ behavior: 'draw', svg: drawing, motion: 'off' });
    expect((await publishedStoreLook(config({ motion: 'expressive', motifs: [motif()] }), 'store-1', 4))!.confirmationMotif!.motion).toBe('expressive');
    // An unknown value is not 'off': the default mode (source-motion reads 'subtle').
    expect((await publishedStoreLook(config({ motion: 'sparkle', motifs: [motif()] }), 'store-1', 5))!.confirmationMotif!.motion).toBe('subtle');
  });
  it('has no confirmation motif without one, for a classic store, or when the read fails', async () => {
    expect((await publishedStoreLook(config({ motifs: [motif({ placement: 'cart', trigger: 'appear' })] }), 'store-1', 3))!.confirmationMotif).toBeNull();
    await expect(publishedStoreLook(config({ motifs: [motif()] }), 'store-1', null)).resolves.toBeNull();
    expect((await publishedStoreLook({ $queryRaw: jest.fn(async () => { throw new Error('db'); }) } as any, 'store-1', 9))!.confirmationMotif).toBeNull();
  });
});
