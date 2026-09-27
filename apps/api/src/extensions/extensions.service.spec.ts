import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ExtensionManifest } from './extension';
import { ExtensionsService } from './extensions.service';
import { openSecrets, sealSecrets } from './secret-box';

const KEY = 'test-key-0123456789012345678901234';
const withToken: ExtensionManifest = { id: 'with-token', name: 'Con token', category: 'messaging', tier: 'pro', logo: null, summary: 'Resumen suficiente', description: 'Descripción suficientemente larga', settings: [{ key: 'phone', label: 'Teléfono', type: 'text', required: true, pattern: /^[0-9]{8}$/ }], secrets: [{ key: 'token', label: 'Token', pattern: /^[a-z0-9-]{6,}$/ }] };

function setup(row: any = null) {
  const prisma: any = {
    store: { findFirst: jest.fn(async ({ where }: any) => where.merchantId === 'm' ? { id: 's', slug: 'cafe' } : null) },
    storeExtension: {
      findMany: jest.fn(async () => row ? [row] : []), findUnique: jest.fn(async () => row),
      upsert: jest.fn(async ({ create, update }: any) => row ? { ...row, ...update } : create),
      update: jest.fn(async ({ data }: any) => ({ ...row, ...data })), deleteMany: jest.fn(async () => ({ count: row ? 1 : 0 })),
    },
  };
  const box: any = { seal: (value: Record<string, string>) => sealSecrets(KEY, value), open: (value: string) => openSecrets(KEY, value) };
  return { service: new ExtensionsService(prisma, box, { get: () => undefined } as any, [withToken]), prisma };
}

describe('ExtensionsService', () => {
  it('only serves stores the merchant owns', async () => {
    await expect(setup().service.list('other', 's')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists extensions and guides, and never returns a secret value', async () => {
    const { service } = setup({ extensionId: 'with-token', enabled: true, settings: { phone: '70000000' }, secrets: sealSecrets(KEY, { token: 'abc-123' }), lastError: null, lastErrorAt: null });
    const { extensions, guides } = await service.list('m', 's');
    expect(extensions[0]).toMatchObject({ id: 'with-token', installed: true, configured: true, secrets: [{ key: 'token', configured: true }], tier: 'pro' });
    expect(JSON.stringify(extensions)).not.toContain('abc-123');
    expect(guides.map(guide => guide.id)).toContain('whatsapp-business');
  });

  it('says so when a stored secret cannot be read, instead of failing the page', async () => {
    const { service } = setup({ extensionId: 'with-token', enabled: true, settings: { phone: '70000000' }, secrets: sealSecrets('another-key-000000000000000000000', { token: 'x' }) });
    const [view] = (await service.list('m', 's')).extensions;
    expect(view).toMatchObject({ configured: false, lastError: 'Vuelve a pegar tu clave: no pudimos leer la que guardaste.' });
  });

  // Review focus 2: an empty secret field keeps the stored secret.
  it('saves validated settings and keeps the stored secret when the field comes back empty', async () => {
    const { service, prisma } = setup({ extensionId: 'with-token', enabled: true, settings: { phone: '70000000' }, secrets: sealSecrets(KEY, { token: 'abc-123' }) });
    await service.save('m', 's', 'with-token', { settings: { phone: '71111111' }, secrets: { token: '' } });
    const saved = prisma.storeExtension.upsert.mock.calls[0][0];
    expect(saved.update.settings).toEqual({ phone: '71111111' });
    expect(openSecrets(KEY, saved.update.secrets)).toEqual({ token: 'abc-123' });
    expect(saved.update.lastError).toBeNull();
  });

  it('refuses unknown extensions and invalid input without writing', async () => {
    const { service, prisma } = setup();
    await expect(service.save('m', 's', 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.save('m', 's', 'with-token', { settings: { phone: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.storeExtension.upsert).not.toHaveBeenCalled();
  });

  it('pauses, resumes and uninstalls', async () => {
    const { service, prisma } = setup({ extensionId: 'with-token', enabled: true, settings: {}, secrets: null });
    await service.setEnabled('m', 's', 'with-token', false);
    expect(prisma.storeExtension.update).toHaveBeenCalledWith({ where: { storeId_extensionId: { storeId: 's', extensionId: 'with-token' } }, data: { enabled: false } });
    await expect(service.remove('m', 's', 'with-token')).resolves.toEqual({ removed: true });
    expect(prisma.storeExtension.deleteMany).toHaveBeenCalledWith({ where: { storeId: 's', extensionId: 'with-token' } });
  });

  it('tells the card of an installed feed what the catalog leaves out', async () => {
    const feed: ExtensionManifest = { id: 'feed', name: 'Feed', category: 'catalogs', tier: 'pro', logo: null, summary: 's', description: 'd', settings: [], productFeed: { platform: 'google', steps: ['Paso'] } };
    const prisma: any = { store: { findFirst: jest.fn(async () => ({ id: 's', slug: 'cafe' })) }, storeExtension: { findMany: jest.fn(async () => [{ extensionId: 'feed', enabled: true, settings: {}, secrets: null }]) } };
    const feeds: any = { summary: jest.fn(async () => ({ skipped: { noPhoto: 2, noPrice: 1 } })) };
    const [view] = (await new ExtensionsService(prisma, {} as any, { get: () => undefined } as any, [feed], feeds).list('m', 's')).extensions;
    expect(view.feed).toMatchObject({ url: expect.stringMatching(/\/stores\/public\/cafe\/feeds\/feed\.xml$/), skipped: { noPhoto: 2, noPrice: 1 } });
    expect(feeds.summary).toHaveBeenCalledWith('cafe');
  });
});
