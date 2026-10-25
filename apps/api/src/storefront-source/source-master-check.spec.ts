import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { masterLayoutFindings } from './source-master-check';

jest.setTimeout(240_000);
const snapshotWith = async (extraCss = '', extraHome = (_firstId: string) => '') => {
  const assembled = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial'));
  const config = JSON.parse(assembled.files.find(f => f.path === 'config.js')!.content.match(/^window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
  const home = extraHome(config.data.items[0].id);
  const files = assembled.files.map(f => f.path === 'styles/globals.css' ? { ...f, content: f.content + extraCss }
    : f.path === 'components/home.tsx' && home ? { ...f, content: f.content.replace('    </main>', `      ${home}\n    </main>`) } : f);
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

// Owner 2026-10-22, goodProtein #6: YAPI squashed the home's product grid to 4px with its own CSS, and gave each brand a
// spotlight with nothing beside the buy card (half of every brand block empty). Both now earn one repair round
// (the follow-up that carries the merchant's request always runs this check: personalTouch requires masterDesign).
it('reports a product grid hidden with CSS', async () => {
  const findings = await masterLayoutFindings(await snapshotWith('#productos .es-grid{height:4px!important;max-height:4px!important;overflow:hidden!important}') as any);
  expect(findings.some(f => /cuadrícula de productos/.test(f) && /escondida/.test(f))).toBe(true);
});
it('reports a spotlight with nothing beside its buy card', async () => {
  const findings = await masterLayoutFindings(await snapshotWith('', id => `<section id="marca"><div data-pagosya-spotlight="${id}" data-side="left" /></section>`) as any);
  expect(findings.some(f => /destacado/.test(f) && /nada a su lado/.test(f))).toBe(true);
  const withText = await masterLayoutFindings(await snapshotWith('', id => `<section id="marca"><div data-pagosya-spotlight="${id}"><p>Proteína limpia para después de entrenar.</p></div></section>`) as any);
  expect(withText.some(f => /destacado/.test(f))).toBe(false);
});
