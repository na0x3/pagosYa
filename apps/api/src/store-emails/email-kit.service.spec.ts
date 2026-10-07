import { EmailKitService } from './email-kit.service';
import * as designer from './email-kit-designer';
import { loadFloorKit } from './email-copy-defaults';

function harness({ active = null as any, kit = null as any } = {}) {
  const prisma: any = {
    store: { findUnique: jest.fn(async () => ({ name: 'Café', publishedSourceRevision: 3 })) },
    storeSourceVersion: { findFirst: jest.fn(async () => ({ revision: 5, snapshot: { files: [{ path: 'styles.css', content: 'body{}' }, { path: 'index.html', content: '<h1>Café</h1>' }] } })) },
    storeBrandProfile: { findUnique: jest.fn(async () => null) },
    paymentLink: { findMany: jest.fn(async () => [{ name: 'Café de altura' }]) },
  };
  const kits: any = { active: jest.fn(async () => active), saveActive: jest.fn(async (_s: string, k: unknown) => k), saveCandidate: jest.fn(async (_s: string, k: unknown) => k) };
  const usage: any = { record: jest.fn(async () => undefined) };
  const config: any = { get: (key: string) => ({ 'app.openAi.apiKey': 'k' } as Record<string, unknown>)[key] };
  const spy = jest.spyOn(designer, 'designEmailKit').mockImplementation(async () => kit);
  return { service: new EmailKitService(prisma, kits, usage, config), kits, spy };
}

afterEach(() => jest.restoreAllMocks());

describe('EmailKitService', () => {
  // The revision recorded is the one whose files the design read (the latest draft), not the published one.
  it('saves a usable design: live for a first look, as a candidate otherwise, recording the site revision', async () => {
    const floor = await loadFloorKit();
    const kit = { raw: { layout: floor.layout!, blocks: Object.values(floor.blocks).join(''), copy: '{}' }, usage: { input_tokens: 10, output_tokens: 10 } };
    const first = harness({ kit });
    expect((await first.service.design('s', 'twin', 'first')).status).toBe('saved');
    expect(first.kits.saveActive).toHaveBeenCalledWith('s', expect.objectContaining({ mode: 'twin', designedFromRevision: 5 }));
    const again = harness({ kit });
    await again.service.design('s', 'bold', 'candidate');
    expect(again.kits.saveCandidate).toHaveBeenCalledWith('s', expect.objectContaining({ mode: 'bold' }));
  });

  it('never saves an unusable design', async () => {
    const { service, kits } = harness({ kit: { raw: { layout: '<p>no slot</p>', blocks: '', copy: '{}' }, usage: null } });
    expect((await service.design('s', 'twin', 'candidate')).status).toBe('unusable');
    expect(kits.saveCandidate).not.toHaveBeenCalled();
  });

  it('after a site is saved: designs only for a store without a look, and never throws', async () => {
    const withLook = harness({ active: { id: 'k' } });
    await withLook.service.designAfterSite('s');
    expect(withLook.spy).not.toHaveBeenCalled();
    const failing = harness();
    failing.spy.mockRejectedValue(new Error('provider down'));
    await expect(failing.service.designAfterSite('s')).resolves.toBeUndefined();
  });
});
