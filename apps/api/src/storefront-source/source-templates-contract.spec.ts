import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { captureSourceVisuals, probeSourceShopping } from './source-visual-capture';
import { nextPageMarkup, validateNextSources } from './source-next';

jest.setTimeout(240_000);

/** Every template must be a store a shopper can buy from, on a phone and a laptop, before it ships. */
describe.each(listTemplates().map(manifest => [manifest.id, manifest] as const))('plantilla %s', (_id, manifest) => {
  let snapshot: Awaited<ReturnType<SourceProjectsService['prepare']>>;

  beforeAll(async () => {
    const assembled = await templateDemoRevision(manifest, templateSourceFiles(manifest.id));
    snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
  });

  it('is valid React source with exactly one h1 on the home page', () => {
    const authored = snapshot.files.filter(f => /^components\/.+\.tsx$/.test(f.path) || f.path === 'styles/globals.css');
    expect(() => validateNextSources(authored)).not.toThrow();
    expect(nextPageMarkup(authored, 'home').match(/<h1\b/g) || []).toHaveLength(1);
  });

  it('passes the commerce contract', () => {
    expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
  });

  it('fits a phone and a laptop without sideways scroll or missing images', async () => {
    const captures = await captureSourceVisuals(snapshot, 'index.html');
    for (const capture of captures) {
      expect({ width: capture.width, y: capture.y, scrollWidth: capture.readiness.scrollWidth }).toEqual({ width: capture.width, y: capture.y, scrollWidth: capture.width });
      expect({ width: capture.width, y: capture.y, missingImages: capture.readiness.missingImages }).toEqual({ width: capture.width, y: capture.y, missingImages: 0 });
    }
  });

  it('lets a shopper add each product and reach checkout at 1280 and 390', async () => {
    const probes = await probeSourceShopping(snapshot);
    expect(probes.filter(probe => probe.status !== 'passed')).toEqual([]);
  });
});
