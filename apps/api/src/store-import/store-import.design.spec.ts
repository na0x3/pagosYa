import { ConflictException } from '@nestjs/common';
import { StoreImportService } from './store-import.service';

const completed = (over: any = {}) => ({ id: 'imp', merchantId: 'm', storeId: 's', status: 'COMPLETED', designTries: 0, designStatus: null, designOption: null, sourceHost: 'x.com', leaseToken: null,
  data: { origin: 'https://x.com/', name: 'X', products: [{ handle: 'croquetas', title: 'Croquetas' }], collections: [], articles: [] }, preview: {}, ...over });

function setup(row: any, usedAt: Date | null = null, chat: any = { importBuild: jest.fn(async () => ({ revision: 3 })) }) {
  const prisma: any = {
    storeImport: { findFirst: jest.fn(async () => row), findUniqueOrThrow: jest.fn(async () => row), updateMany: jest.fn(async () => ({ count: 1 })) },
    merchant: { findUnique: jest.fn(async () => ({ importBuildUsedAt: usedAt })), update: jest.fn() },
  };
  return { service: new StoreImportService(prisma, {} as any, {} as any, chat), prisma, chat };
}

describe('free import build', () => {
  it('queues the first build for a completed import', async () => {
    const { service, prisma } = setup(completed());
    await service.requestDesign('m', 'imp', 'same');
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { id: 'imp', merchantId: 'm', status: 'COMPLETED', OR: [{ designStatus: null }, { designStatus: 'FAILED' }] }, data: { designStatus: 'QUEUED', designOption: 'same', designError: null } });
  });

  it('refuses once the merchant used the free build or after two failed tries', async () => {
    await expect(setup(completed(), new Date()).service.requestDesign('m', 'imp', 'same')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup(completed({ designTries: 2, designStatus: 'FAILED' })).service.requestDesign('m', 'imp', 'redesign')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a successful build marks the merchant; a failed one counts a try', async () => {
    const running = completed({ designStatus: 'RUNNING', designOption: 'same' });
    const ok = setup(running);
    await ok.service.runDesign(running as any);
    expect(ok.chat.importBuild).toHaveBeenCalledWith('m', 's', expect.objectContaining({ importId: 'imp', option: 'same', origin: 'https://x.com/', productHandle: 'croquetas' }));
    expect(ok.prisma.merchant.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { importBuildUsedAt: expect.any(Date) } });
    const bad = setup(running, null, { importBuild: jest.fn(async () => { throw new Error('boom'); }) });
    await bad.service.runDesign(running as any);
    expect(bad.prisma.storeImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ designStatus: 'FAILED', designTries: { increment: 1 } }) }));
    expect(bad.prisma.merchant.update).not.toHaveBeenCalled();
  });
});
