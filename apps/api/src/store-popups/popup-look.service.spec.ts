import { isFirstBuildStep, PopupLookService, POPUP_LOOK_CHOSEN } from './popup-look.service';
import { pickPopupLook } from './popup-looks';

function setup(stored: Record<string, unknown> | null = {}) {
  let row = stored;
  const prisma: any = {
    store: { findUnique: jest.fn(async () => ({ slug: 'miga' })) },
    storeRetention: { findUnique: jest.fn(async () => (row ? { settings: row } : null)), upsert: jest.fn(async ({ update }: any) => { row = update.settings; }) },
    storeAgentThread: { upsert: jest.fn(async () => ({ id: 't1' })) }, storeAgentMessage: { create: jest.fn(async () => ({})) },
  };
  return { service: new PopupLookService(prisma), prisma, read: () => row };
}
describe('PopupLookService', () => {
  it('says the new store\'s look after the first build without creating a popup row (review 2026-11-09: a row locks the timezone)', async () => {
    const { service, prisma } = setup(null);
    await service.designAfterBuild('s1');
    expect(prisma.storeRetention.upsert).not.toHaveBeenCalled();
    expect(prisma.storeAgentMessage.create.mock.calls[0][0].data.content).toBe(POPUP_LOOK_CHOSEN(pickPopupLook('miga')));
  });
  it('saves the look into an existing popup row that has none', async () => {
    const { service, read } = setup({ signupTitle: 'Únete' });
    await service.designAfterBuild('s1');
    expect(read()).toEqual({ signupTitle: 'Únete', popupLook: pickPopupLook('miga') });
  });
  it('never replaces a look the store already has', async () => {
    const { service, prisma } = setup({ popupLook: 'postal' });
    await service.designAfterBuild('s1');
    expect(prisma.storeRetention.upsert).not.toHaveBeenCalled();
  });
  it('sets a look keeping the old one for undo, sets the photo, and undoes one step', async () => {
    const { service, read } = setup({ popupLook: 'postal', signupTitle: 'Únete' });
    await service.setLook('s1', 'revista');
    expect(read()).toMatchObject({ popupLook: 'revista', popupLookPrevious: 'postal', signupTitle: 'Únete' });
    await service.setPhoto('s1', '/v1/uploads/b.jpg');
    expect(read()).toMatchObject({ popupPhoto: '/v1/uploads/b.jpg' });
    await expect(service.undo('s1')).resolves.toBe(true);
    expect(read()).toMatchObject({ popupLook: 'postal', popupLookPrevious: 'revista' });
    await expect(setup({}).service.undo('s1')).resolves.toBe(false);
  });
  it('knows the first-build chain', () => {
    expect(isFirstBuildStep({ briefCheck: 1 })).toBe(true);
    expect(isFirstBuildStep({ instruction: 'x' })).toBe(false);
  });
});
