import { writeCatalogChange } from './source-catalog-write';
import { emptyCatalogChange, type CatalogChange } from './source-catalog-edit';

const txMock = () => {
  const calls: string[] = [];
  const track = (name: string, answer: (args: any) => unknown) => jest.fn(async (args: any) => { calls.push(name); return answer(args); });
  const tx = {
    category: { count: track('category.count', () => 2), create: track('category.create', args => ({ id: `cat-${args.data.name}` })),
      updateMany: track('category.updateMany', () => ({ count: 1 })), deleteMany: track('category.deleteMany', () => ({ count: 1 })) },
    paymentLink: { create: track('paymentLink.create', () => ({})), update: track('paymentLink.update', () => ({})),
      findFirst: track('paymentLink.findFirst', args => ({ id: args.where.id, variants: [{ id: 'v1', name: 'S', amount: 9000, stock: 0 }, { id: 'v2', name: 'M', amount: 9500, stock: 2 }] })) },
    promoCode: { create: track('promoCode.create', () => ({})), updateMany: track('promoCode.updateMany', () => ({ count: 1 })) },
    $queryRaw: track('$queryRaw', () => []),
  };
  return { tx, calls };
};
const change = (fill: (c: CatalogChange) => void) => { const c = emptyCatalogChange(); fill(c); return c; };

it('creates the new categories first and files new and existing products into them', async () => {
  const { tx } = txMock();
  await writeCatalogChange(tx as never, 's1', change(c => {
    c.categories.create.push({ ref: 'new:0', name: 'Bebidas' });
    c.products.create.push({ name: 'Limonada', description: '', amount: 1500, currency: 'BOB', imageUrls: [], stock: null, variants: [], categoryRef: 'new:0' });
    c.products.update.push({ id: 'p1', categoryRef: 'new:0' }, { id: 'p3', categoryRef: null });
  }));
  expect(tx.category.create).toHaveBeenCalledWith({ data: { storeId: 's1', name: 'Bebidas', sortOrder: 2 }, select: { id: true } });
  expect(tx.paymentLink.create).toHaveBeenCalledWith({ data: { storeId: 's1', name: 'Limonada', description: null, amount: 1500, currency: 'BOB', imageUrls: [], stock: null, categoryId: 'cat-Bebidas' } });
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(1, { where: { id: 'p1' }, data: { categoryId: 'cat-Bebidas' } });
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(2, { where: { id: 'p3' }, data: { categoryId: null } });
});

it('archives instead of deleting, and re-reads options under a row lock so a sale in between is kept', async () => {
  const { tx, calls } = txMock();
  await writeCatalogChange(tx as never, 's1', change(c => {
    c.products.update.push({ id: 'p9', status: 'ARCHIVED' }, { id: 'p2', variantOps: [{ action: 'update', variantId: 'v2', changes: { stock: 5 } as never }] });
  }));
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(1, { where: { id: 'p9' }, data: { status: 'ARCHIVED' } });
  // S sold out between the chat's read and this write: it stays 0, only M changes.
  expect(tx.paymentLink.update).toHaveBeenNthCalledWith(2, { where: { id: 'p2' }, data: expect.objectContaining({ amount: 9000, stock: 5,
    variants: [expect.objectContaining({ id: 'v1', stock: 0 }), expect.objectContaining({ id: 'v2', stock: 5 })] }) });
  expect(calls.indexOf('$queryRaw')).toBeLessThan(calls.lastIndexOf('paymentLink.findFirst'));
  expect(calls.some(call => call.includes('delete') && call.startsWith('paymentLink'))).toBe(false);
});

it('codes are made private, flags go by id, and the removed categories go last', async () => {
  const { tx, calls } = txMock();
  await writeCatalogChange(tx as never, 's1', change(c => {
    c.categories.remove.push({ id: 'c2', name: 'Postres' });
    c.categories.rename.push({ id: 'c1', name: 'Pasteles' });
    c.categories.order = ['c2', 'c1'];
    c.codes.create.push({ code: 'NOVIA10', type: 'PERCENT', value: 10 });
    c.codes.flags.push({ id: 'k1', isActive: false });
  }));
  expect(tx.promoCode.create).toHaveBeenCalledWith({ data: { storeId: 's1', code: 'NOVIA10', discountType: 'PERCENT', discountValue: 10 } });
  expect(tx.promoCode.updateMany).toHaveBeenCalledWith({ where: { id: 'k1', storeId: 's1' }, data: { isActive: false } });
  expect(tx.category.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', storeId: 's1' }, data: { name: 'Pasteles' } });
  expect(tx.category.updateMany).toHaveBeenCalledWith({ where: { id: 'c2', storeId: 's1' }, data: { sortOrder: 0 } });
  expect(tx.category.deleteMany).toHaveBeenCalledWith({ where: { storeId: 's1', id: { in: ['c2'] } } });
  expect(calls.at(-1)).toBe('category.deleteMany');
});
