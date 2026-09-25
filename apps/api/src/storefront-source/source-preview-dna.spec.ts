import { captureSourceVisuals } from './source-visual-capture';
import { SourceProjectsController } from './source-projects.controller';
import { SourceDesignJobWorker } from './source-design-job.worker';
import { SourceVisualReviewService } from './source-visual-review.service';
import { sourceRuntimeDna } from './source-dna';
jest.mock('./source-visual-capture', () => ({ captureSourceVisuals: jest.fn(), probeSourceShopping: jest.fn() }));

// Studio previews must show the DNA the published site will carry: a stored config.js without one gets the same seeded DNA.
const brief = { businessType: '', audience: '', primaryAction: '', visualDirection: '' };
const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};`, encoding: 'utf8' as const });
const snapshot = (settings: object) => ({ schemaVersion: 1, brief, files: [{ path: 'index.html', content: '<main data-pagosya-catalog></main>', encoding: 'utf8' }, config(settings)] });
const dnaOf = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]).dna;
const bare = { productPageStyle: 'dense', apiBaseUrl: 'https://api.test', data: { items: [] } };
const own = { ...bare, dna: { version: 1, button: 'pill' } };

describe.each([
  ['versions/:revision', async (settings: object) => {
    const projects: any = { version: jest.fn().mockResolvedValue({ revision: 2, snapshot: snapshot(settings) }) };
    const generation: any = { catalog: jest.fn().mockResolvedValue({ items: [] }) };
    const result = await new SourceProjectsController(projects, generation, {} as any).version({ id: 'm' }, 'store-7', 2);
    return result.snapshot.files;
  }],
  ['the design-job baseline', async (settings: object) => {
    let baseline: any;
    const jobs: any = {
      prisma: { store: { findUniqueOrThrow: jest.fn().mockResolvedValue({ merchantId: 'm' }) }, storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null) } },
      assertFresh: jest.fn(), reserve: jest.fn(), heartbeat: jest.fn().mockResolvedValue(true), checkpoint: jest.fn().mockResolvedValue(undefined), settlement: jest.fn(() => ({})),
    };
    const projects: any = { version: jest.fn().mockResolvedValue({ digest: 'd', snapshot: snapshot(settings) }) };
    const generator: any = { catalog: jest.fn().mockResolvedValue({ items: [] }) };
    const review: any = { hydrate: jest.fn(async (value: any) => { baseline = value; throw new Error('stop after the baseline'); }) };
    await new SourceDesignJobWorker(jobs, projects, generator, review, {} as any).run({ id: 'j', storeId: 'store-7', revision: 2, sourceDigest: 'd', stage: 'CAPTURE_BASELINE', checkpoints: {}, input: { page: 'index.html' } } as any);
    return baseline.files;
  }],
  ['the visual review capture', async (settings: object) => {
    const projects: any = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: snapshot(settings) }) };
    const service = new SourceVisualReviewService(projects, { get: () => 'key' } as any, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'hydrate').mockImplementation(async (value: any) => value);
    (captureSourceVisuals as jest.Mock).mockReset().mockRejectedValue(new Error('stop after the capture input'));
    await expect(service.review('m', 'store-7', { revision: 2, page: 'index.html' })).rejects.toThrow();
    return (captureSourceVisuals as jest.Mock).mock.calls[0][0].files;
  }],
])('%s', (_name, files) => {
  it('seeds the DNA the published site would carry when the stored config has none', async () => {
    expect(dnaOf(await files(bare))).toEqual(sourceRuntimeDna(undefined, 'store-7', 'dense'));
  });
  it('keeps a stored DNA unchanged', async () => {
    expect(dnaOf(await files(own))).toEqual(own.dna);
  });
});
