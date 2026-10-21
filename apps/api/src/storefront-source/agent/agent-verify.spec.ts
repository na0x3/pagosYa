import { listTemplates } from '@pagosya/store-templates';
import { literalTemplateSource } from '../fixtures/literal-template';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { authoredAccountHooks, authoredAccountPhotos, verifyAgentDraft } from './agent-verify';

jest.setTimeout(60_000);
let pausa: Array<{ path: string; content: string }>;
beforeAll(async () => {
  const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, literalTemplateSource('pausa'));
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

// PEPPA please 2026-10-20: register.tsx wrapped AccountGatePage in its own columns with the split theme's photo again.
describe('authoredAccountPhotos', () => {
  const gate = 'export default function Register() { return <Shell><AccountGatePage view="register" /></Shell>; }';
  const wrapped = 'export default function Register() { return <Shell><main className="r"><AccountGatePage view="register" /><figure><img src="/assets/p.jpg" alt="" /></figure></main></Shell>; }';
  it('flags an auth component this edit gave its own photo', () => {
    const findings = authoredAccountPhotos([{ path: 'components/auth/register.tsx', content: gate }], [{ path: 'components/auth/register.tsx', content: wrapped }]);
    expect(findings).toEqual([expect.objectContaining({ source: 'contract', message: expect.stringContaining('set_account_theme') })]);
  });
  it('leaves an unchanged file, a photo-free edit and photos outside components/auth alone', () => {
    expect(authoredAccountPhotos([{ path: 'components/auth/register.tsx', content: wrapped }], [{ path: 'components/auth/register.tsx', content: wrapped }])).toEqual([]);
    expect(authoredAccountPhotos([{ path: 'components/auth/login.tsx', content: gate }], [{ path: 'components/auth/login.tsx', content: gate.replace('Register', 'Login') }])).toEqual([]);
    expect(authoredAccountPhotos([], [{ path: 'components/home.tsx', content: '<img src="/assets/p.jpg" alt="" />' }])).toEqual([]);
  });
});

// PEPPA please 2026-10-20 (rev 16): register.tsx added a class to <html> so globals.css could restyle the card.
describe('authoredAccountHooks', () => {
  const gate = 'export default function Register() { return <Shell><AccountGatePage view="register" /></Shell>; }';
  const hooked = "import { useEffect } from 'react';\nexport default function Register() { useEffect(() => { document.documentElement.classList.add('x'); return () => document.documentElement.classList.remove('x'); }, []); return <Shell><AccountGatePage view=\"register\" /></Shell>; }";
  it('flags an auth component this edit made mark the document', () => {
    expect(authoredAccountHooks([{ path: 'components/auth/register.tsx', content: gate }], [{ path: 'components/auth/register.tsx', content: hooked }])).toEqual([expect.objectContaining({ source: 'contract', message: expect.stringContaining('[data-account-gate="register"]') })]);
  });
  it('leaves an unchanged file and other components alone', () => {
    expect(authoredAccountHooks([{ path: 'components/auth/register.tsx', content: hooked }], [{ path: 'components/auth/register.tsx', content: hooked }])).toEqual([]);
    expect(authoredAccountHooks([], [{ path: 'components/Shell.tsx', content: hooked }])).toEqual([]);
  });
});
