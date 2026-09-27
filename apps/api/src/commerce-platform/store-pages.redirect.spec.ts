import { NotFoundException } from '@nestjs/common';
import { StorePagesService } from './store-pages.service';

const table: Record<string, { toPath: string }> = { '/products/croquetas': { toPath: '/p/abc' }, '/collections/perros': { toPath: '/c/perros' }, '/products/vieja': { toPath: '/es/articulo' } };
const prisma: any = {
  store: { findFirst: jest.fn(async () => ({ id: 's1', brandProfile: null })) },
  storeRedirect: { findUnique: jest.fn(async ({ where }: any) => table[where.storeId_fromPath.fromPath] ?? null) },
};
const service = new StorePagesService(prisma, { get: () => undefined } as any);

describe('public Shopify-path redirects', () => {
  it('resolves products, collections and nested collection product links', async () => {
    await expect(service.publicRedirect('tienda', '/products/croquetas')).resolves.toEqual({ location: '/p/abc' });
    await expect(service.publicRedirect('tienda', '/collections/perros')).resolves.toEqual({ location: '/c/perros' });
    await expect(service.publicRedirect('tienda', '/collections/perros/products/croquetas')).resolves.toEqual({ location: '/p/abc' });
  });
  it('finds links typed with capitals, accents or decomposed accents under the key the import stored', async () => {
    table['/products/café-molido'] = { toPath: '/p/cafe' };
    await expect(service.publicRedirect('tienda', '/Products/Café-Molido')).resolves.toEqual({ location: '/p/cafe' });
    await expect(service.publicRedirect('tienda', '/collections/Perros/products/cafe\u0301-molido/')).resolves.toEqual({ location: '/p/cafe' });
    await expect(service.publicRedirect('tienda', '/products/con_guion')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s unknown and non-Shopify paths, and never sends a Shopify path to an article target', async () => {
    await expect(service.publicRedirect('tienda', '/products/nada')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.publicRedirect('tienda', '/admin')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.publicRedirect('tienda', '/products/vieja')).rejects.toBeInstanceOf(NotFoundException);
  });
});
