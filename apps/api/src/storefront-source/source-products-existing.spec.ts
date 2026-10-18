import { requestedSourceProducts } from './source-products';
import { SourceProjectsService } from './source-projects.service';

// FLORZ 2026-10-17: the walkthrough created «flor roja» and «flor azul» with their photos, then the style-pick build
// read «Productos: flor roja a Bs 20; flor azul a Bs 20» from the same request and created both again, photo-less.
describe('products YAPI lists that the store already sells', () => {
  const save = async (existing: Array<{ name: string; currency: string }>, listed: string[]) => {
    const prisma: any = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
      storeSourceProject: { upsert: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      storeSourceGeneration: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      storeSourceVersion: { create: jest.fn().mockResolvedValue({ revision: 1 }) },
      paymentLink: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: `new-${data.name}`, ...data })),
        findMany: jest.fn().mockResolvedValue(existing),
      },
    };
    prisma.$transaction = jest.fn(async work => work(prisma));
    const input = { revision: 0, label: 'FLORZ', brief: { businessType: 'Florería', audience: 'Santa Cruz', primaryAction: 'Comprar', visualDirection: 'Calma' }, files: [
      { path: 'package.json', content: '{"name":"florz","scripts":{"build":"node build.mjs"}}' },
      { path: 'README.md', content: 'Build with npm run build. Commerce uses PagosYa.' },
      { path: 'build.mjs', content: 'console.log("build")' },
    ] };
    const products = requestedSourceProducts(listed.map(name => ({ name, description: '', amount: 2000, currency: 'BOB', priceText: 'Bs 20', imageUrls: [] })),
      `Crea mi tienda. Productos: ${listed.map(name => `${name} a Bs 20`).join('; ')}.`, new Set());
    const saved = await new SourceProjectsService(prisma).save('m1', 's1', input as any, { id: 'g1', data: { status: 'COMPLETED' }, products } as any);
    return { prisma, saved };
  };

  it('keeps the product the store already has instead of creating a photo-less copy', async () => {
    const { prisma, saved } = await save([{ name: 'Flor  Roja', currency: 'BOB' }], ['flor roja', 'flor azul']);
    expect(prisma.paymentLink.create).toHaveBeenCalledTimes(1);
    expect(prisma.paymentLink.create.mock.calls[0][0].data.name).toBe('flor azul');
    expect(saved.createdProducts).toEqual([{ id: 'new-flor azul', name: 'flor azul' }]);
  });

  it('creates a listed name only once, and still creates one sold in another currency', async () => {
    const { prisma } = await save([{ name: 'Flor roja', currency: 'USD' }], ['flor roja', 'Flor Roja']);
    expect(prisma.paymentLink.create.mock.calls.map((call: any) => call[0].data.name)).toEqual(['flor roja']);
  });
});
