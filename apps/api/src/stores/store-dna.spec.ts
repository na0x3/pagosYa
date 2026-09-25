import { publishedStoreDna } from './store-dna';
import { sourceRuntimeDna } from '../storefront-source/source-dna';

describe('publishedStoreDna', () => {
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
});
