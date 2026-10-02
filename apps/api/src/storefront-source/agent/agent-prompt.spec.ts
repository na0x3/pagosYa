import { agentInstructions, agentOpening } from './agent-prompt';

describe('agent instructions', () => {
  it('distinguishes technical checks from independent visual review and bounds scoped repairs without banning product grids', () => {
    const prompt = agentInstructions('CONTRATOS', 'shop', true, true);
    expect(prompt).toContain('it is not visual approval');
    expect(prompt).toContain('[composition:ID]');
    expect(prompt).toContain('At most one composition repair');
    expect(prompt).toContain('Valid product grids and deliberate fashion campaign compositions are allowed');
    expect(prompt).toContain('Never create an unrequested gallery');
    expect(prompt).toContain('no universal image-count rule');
    expect(prompt).not.toContain('a small number of supporting images');
    expect(prompt).not.toContain('Bold, complete, editorial design');
  });
  it('follow the merchant reference without forcing a section recipe', () => {
    const creative = agentInstructions('CONTRATOS', 'shop', true, true);
    expect(creative).toContain('REFERENCE-LED DESIGN');
    expect(creative).toContain('Curate uploaded media');
    expect(creative).toContain('let the runtime own its empty state');
    expect(creative).not.toContain('Build these sections in this order');
    expect(creative).not.toContain('clamp(3.2rem, 9vw, 8.5rem)');
    expect(creative.startsWith('CONTRATOS')).toBe(true);
  });
  it('keep local edits to the requested change', () => {
    const local = agentInstructions('CONTRATOS', 'shop', false, false);
    expect(local).not.toContain('Producto estrella');
    expect(local).toContain('AGENT PROTOCOL');
  });
  it('drop commerce-only recipes for sites that do not sell', () => {
    const service = agentInstructions('CONTRATOS', 'service', true, true);
    expect(service).not.toContain('cantidad');
    expect(service).toContain('primary contact or booking action');
  });
});

describe('agent limits in the instructions', () => {
  it('tells the model the minutes it really has', () => {
    expect(agentInstructions('CONTRATOS', 'shop', false, false)).toContain('6 minutes');
    expect(agentInstructions('CONTRATOS', 'shop', false, false, 12)).toContain('12 minutes');
  });
});

describe('standard pages in the agent context', () => {
  const page = '// @pagosya-page\nexport default function P() { return null; }';
  const files = [{ path: 'components/home.tsx', content: 'x' }, { path: 'components/pages/faq.tsx', content: page }, { path: 'components/catalog/search.tsx', content: page }, { path: 'components/page-historia.tsx', content: 'x' }];
  const opening = (list = files) => JSON.stringify(agentOpening('Cambia el FAQ', list, []));

  it('lists the store pages with their files and addresses so a request names the right file', () => {
    const text = opening();
    expect(text).toContain('Project capabilities');
    expect(text).toContain('components/pages/faq.tsx');
    expect(text).toContain('faq.html');
    expect(text).toContain('buscar.html');
    expect(text).toContain('historia.html');
  });

  it('adds no page list to a store without standard pages or hand-made ones', () => {
    expect(opening([{ path: 'components/home.tsx', content: 'x' }])).toContain('index.html');
  });

  it('tells the model the standard pages are filled by the platform and must never hold policy text', () => {
    const text = agentInstructions('base', 'shop', false);
    expect(text).toContain('STANDARD PAGES');
    expect(text).toContain('AccountGatePage');
    expect(text).toMatch(/never add authored password fields or scripts/i);
    expect(text).toMatch(/never (write|hardcode|type)[^.]*(policy|shipping|refund|privacy|terms)/i);
    expect(text).toContain('@pagosya-page');
  });
});
