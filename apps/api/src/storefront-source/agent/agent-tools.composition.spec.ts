jest.mock('./agent-verify', () => ({ verifyAgentDraft: jest.fn(async () => ({ files: [], repairs: [], findings: [] })) }));
jest.mock('./agent-capture', () => ({ agentPreviewSnapshot: jest.fn(), captureAgentDraft: jest.fn() }));
import { AgentToolbox, type AgentCompositionReview } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';
import { agentPreviewSnapshot, captureAgentDraft } from './agent-capture';
import { verifyAgentDraft } from './agent-verify';

const files = [
  { path: 'components/home.tsx', content: 'export default function Home(){return <h1>Store</h1>}' },
  { path: 'components/page-galeria.tsx', content: 'export default function Gallery(){return <h1>Gallery</h1>}' },
  { path: 'components/pages/privacy.tsx', content: '// @pagosya-page\nexport default function Privacy(){return null}' },
];
const clean: AgentCompositionReview = { findings: [], summary: 'Coherent with reference.' };
const major: AgentCompositionReview = { findings: [{ id: 'gallery-hierarchy', page: 'galeria.html', section: 'campaign', severity: 'major', observation: 'Campaign images compete with the action.', correction: 'Retain the lead campaign photo; reduce the supporting photo scale.' }], summary: 'One issue.' };
const finish = JSON.stringify({ status: 'completed', summary: 'Listo', sections: ['Portada'], remaining: [] });
const box = (reviewComposition?: jest.Mock) => new AgentToolbox({ workspace: new AgentWorkspace(files, { redesign: true }), previous: files, base: { files, brief: {} as never }, instruction: 'redesign store', purpose: 'shop', maxScreenshots: 0, reviewComposition });
beforeEach(() => {
  jest.clearAllMocks();
  (verifyAgentDraft as jest.Mock).mockResolvedValue({ files: [], repairs: [], findings: [] });
  (agentPreviewSnapshot as jest.Mock).mockImplementation(async (_base, source) => ({ files: [...source, ...['index.html','galeria.html','privacidad.html','productos.html','product.html','checkout.html'].map(path => ({ path, content: '<html />' }))] }));
  (captureAgentDraft as jest.Mock).mockImplementation(async (_snapshot, width, _signal, page) => ({ image: `data:${page}:${width}`, thumbnail: 'thumb', errors: [], evidence: [] }));
});

it('reviews every registered authored page, including an unplanned gallery, using its existing desktop/mobile captures', async () => {
  const review = jest.fn().mockResolvedValue(clean);
  const b = box(review);
  expect((await b.run('finish', finish)).output).toContain('verify');
  const result = await b.run('verify', '{}');
  expect(result.output).toContain('Verificación técnica aprobada y revisión visual independiente');
  expect(review.mock.calls[0][0].captures).toEqual([
    { page: 'index.html', width: 1280, image: 'data:index.html:1280' },
    { page: 'index.html', width: 390, image: 'data:index.html:390' },
    { page: 'productos.html', width: 1280, image: 'data:productos.html:1280' },
    { page: 'productos.html', width: 390, image: 'data:productos.html:390' },
    { page: 'product.html', width: 1280, image: 'data:product.html:1280' },
    { page: 'product.html', width: 390, image: 'data:product.html:390' },
    { page: 'checkout.html', width: 1280, image: 'data:checkout.html:1280' },
    { page: 'checkout.html', width: 390, image: 'data:checkout.html:390' },
    { page: 'galeria.html', width: 1280, image: 'data:galeria.html:1280' },
    { page: 'galeria.html', width: 390, image: 'data:galeria.html:390' },
  ]);
  expect(captureAgentDraft).toHaveBeenCalledTimes(10); // baseline + custom page, once per width
  expect((await b.run('finish', finish)).output).toBe('ok');
});

it('caches no-change review, then requires fresh review after an edit', async () => {
  const review = jest.fn().mockResolvedValue(clean);
  const b = box(review);
  await b.run('verify', '{}'); await b.run('verify', '{}');
  expect(review).toHaveBeenCalledTimes(1);
  b.workspace.edit('components/home.tsx', 'Store', 'New store');
  expect(b.draftIsClean()).toBe(false);
  expect((await b.run('finish', finish)).output).toContain('verify');
  await b.run('verify', '{}');
  expect(review).toHaveBeenCalledTimes(2);
  expect(b.draftIsClean()).toBe(true);
});

it('does not reuse a review when snapshot content changes at the same workspace version', async () => {
  const review = jest.fn().mockResolvedValue(clean);
  const b = box(review);
  await b.run('verify', '{}');
  (agentPreviewSnapshot as jest.Mock).mockResolvedValue({ files: [{ path: 'index.html', content: 'changed runtime' }, { path: 'galeria.html', content: 'gallery' }] });
  await b.run('verify', '{}');
  expect(review).toHaveBeenCalledTimes(2);
});

it('allows one scoped repair and accepts it when the second review is clean', async () => {
  const review = jest.fn().mockResolvedValueOnce(major).mockResolvedValueOnce(clean);
  const b = box(review);
  expect((await b.run('verify', '{}')).output).toContain('[composition:gallery-hierarchy]');
  expect(b.draftIsClean()).toBe(false);
  await b.run('verify', '{}');
  expect(review).toHaveBeenCalledTimes(1);
  expect(b.workspace.edit('components/page-galeria.tsx', '<h1>Gallery</h1>', '<h1>Campaign</h1>').ok).toBe(true);
  await b.run('verify', '{}');
  expect(b.draftIsClean()).toBe(true);
  expect(b.stopped).toBeNull();
});

it('stops partial after the second major review even when the finding wording or ID changes', async () => {
  const review = jest.fn().mockResolvedValueOnce(major).mockResolvedValueOnce({ ...major, findings: [{ ...major.findings[0], id: 'another-major', observation: 'Different words' }] });
  const b = box(review);
  await b.run('verify', '{}');
  b.workspace.edit('components/home.tsx', 'Store', 'Repaired');
  await b.run('verify', '{}');
  expect(b.stopped?.status).toBe('partial');
  expect(b.draftIsClean()).toBe(false);
  expect((await b.run('finish', finish)).output).toContain('incompleto');
  expect(b.finished).toBeNull();
});

it('never spends a third review after optional edits invalidate two previously clean versions', async () => {
  const review = jest.fn().mockResolvedValue(clean);
  const b = box(review);
  await b.run('verify', '{}');
  b.workspace.edit('components/home.tsx', 'Store', 'One'); await b.run('verify', '{}');
  b.workspace.edit('components/home.tsx', 'One', 'Two'); await b.run('verify', '{}');
  expect(review).toHaveBeenCalledTimes(2);
  expect(b.stopped?.remaining).toContain('composition:review-budget');
});

it('fails closed without visual approval when the reviewer is unavailable', async () => {
  const review = jest.fn().mockRejectedValue(new Error('provider unavailable'));
  const b = box(review);
  expect((await b.run('verify', '{}')).output).toContain('[composition:review-unavailable]');
  expect(b.stopped?.status).toBe('partial');
  expect(b.draftIsClean()).toBe(false);
  await b.run('verify', '{}');
  expect(review).toHaveBeenCalledTimes(1);
});

it('does not buy a review when technical capture checks fail', async () => {
  const review = jest.fn().mockResolvedValue(clean);
  (captureAgentDraft as jest.Mock).mockResolvedValue({ image: 'image', errors: ['overflow'], evidence: [] });
  const b = box(review);
  expect((await b.run('verify', '{}')).output).toContain('overflow');
  expect(review).not.toHaveBeenCalled();
  expect(b.draftIsClean()).toBe(false);
});

it('minor findings do not trigger optional paid repair loops', async () => {
  const b = box(jest.fn().mockResolvedValue({ ...major, findings: [{ ...major.findings[0], severity: 'minor' }] }));
  await b.run('verify', '{}');
  expect(b.draftIsClean()).toBe(true);
});

it('preserves the legacy technical-only path when no reviewer is configured', async () => {
  const b = box();
  expect((await b.run('verify', '{}')).output).toBe('Todo en orden.');
  expect(captureAgentDraft).toHaveBeenCalledTimes(8);
  expect(b.draftIsClean()).toBe(true);
});
