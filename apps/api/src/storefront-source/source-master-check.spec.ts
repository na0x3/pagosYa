import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { masterLayoutFindings } from './source-master-check';

jest.setTimeout(240_000);
const snapshotWith = async (extraCss = '') => {
  const assembled = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial'));
  const files = assembled.files.map(f => f.path === 'styles/globals.css' ? { ...f, content: f.content + extraCss } : f);
  return new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled, files });
};

it('finds nothing on Esencial as shipped', async () => {
  expect(await masterLayoutFindings(await snapshotWith() as any)).toEqual([]);
});
it('reports sideways overflow', async () => {
  const findings = await masterLayoutFindings(await snapshotWith('.es-section__head{width:1900px}') as any);
  expect(findings.some(f => /se desborda/.test(f))).toBe(true);
});
it('reports overlapping text', async () => {
  const findings = await masterLayoutFindings(await snapshotWith('.es-hero__sub{margin-top:-90px}') as any);
  expect(findings.some(f => /se superponen/.test(f))).toBe(true);
});
