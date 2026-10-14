import { orQuery, searchInfo, searchProductIds } from './assistant-search';

describe('assistant search', () => {
  it('turns a question into an OR query of plain words', () => {
    expect(orQuery('¿Tienen chompas de alpaca, talla M?')).toBe('tienen | chompas | de | alpaca | talla');
    expect(orQuery("x'); DROP TABLE --")).toBe('drop | table');
    expect(orQuery('¿?')).toBe('');
  });

  it('skips the database for an empty query', async () => {
    const prisma = { $queryRaw: jest.fn() };
    await expect(searchProductIds(prisma as any, 's1', '¿?')).resolves.toEqual([]);
    await expect(searchInfo(prisma as any, 's1', '', [])).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns ranked ids and passages from the query', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 'p2' }, { id: 'p1' }]).mockResolvedValueOnce([{ title: 'Envíos', body: 'A todo el país', rank: 0.3 }]) };
    await expect(searchProductIds(prisma as any, 's1', 'chompa')).resolves.toEqual(['p2', 'p1']);
    await expect(searchInfo(prisma as any, 's1', 'envio', [{ title: 'Envíos', body: 'A todo el país' }])).resolves.toEqual([{ title: 'Envíos', body: 'A todo el país' }]);
  });
});
