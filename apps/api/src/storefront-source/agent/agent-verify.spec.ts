import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { verifyAgentDraft } from './agent-verify';

jest.setTimeout(60_000);
let pausa: Array<{ path: string; content: string }>;
beforeAll(async () => {
  const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
  pausa = base.files.filter(f => nextSourceFile(f.path));
});
const editHome = (from: string, to: string) => pausa.map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace(from, to) } : f);

describe('verifyAgentDraft', () => {
  it('passes a valid template draft with no findings', async () => {
    const result = await verifyAgentDraft({ previous: pausa, draft: editHome('Un respiro', 'Tu calma'), instruction: 'cambia el título', purpose: 'shop' });
    expect(result.findings).toEqual([]);
  });
  it('turns a TypeScript error into a finding instead of throwing', async () => {
    const result = await verifyAgentDraft({ previous: pausa, draft: editHome('<h1 className="pa2-display">', '<Missing /><h1 className="pa2-display">'), instruction: 'cambia el título', purpose: 'shop' });
    expect(result.findings).toEqual([expect.objectContaining({ source: 'typescript', message: expect.stringContaining('Missing') })]);
  });
  it('reports a removed merchant photo as a scope finding', async () => {
    const previous = [...pausa, { path: 'components/Gallery.tsx', content: 'export function Gallery() { return <img src="/assets/mia.jpg" alt="Mía" />; }' }];
    const draft = [...pausa, { path: 'components/Gallery.tsx', content: 'export function Gallery() { return null; }' }];
    const result = await verifyAgentDraft({ previous, draft, instruction: 'hazlo más bonito', purpose: 'shop' });
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'scope', message: expect.stringContaining('foto') })]));
  });
  it('applies the code auto-repairs before validating and reports them', async () => {
    const result = await verifyAgentDraft({ previous: pausa, draft: editHome(' alt="Una de nuestras instructoras"', ''), instruction: 'cambia el título', purpose: 'shop' });
    expect(result.findings).toEqual([]);
    expect(result.repairs).toEqual([expect.stringContaining('components/home.tsx')]);
  });
  it('does not check scope for a new store', async () => {
    const result = await verifyAgentDraft({ previous: [], draft: pausa, instruction: 'hazme una tienda', purpose: 'shop' });
    expect(result.findings).toEqual([]);
  });
});
