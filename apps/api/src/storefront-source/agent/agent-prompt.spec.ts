import { agentInstructions } from './agent-prompt';

describe('agent instructions', () => {
  it('give new stores and redesigns the bold section recipes and the large type scale', () => {
    const creative = agentInstructions('CONTRATOS', 'shop', true, true);
    for (const section of ['Oferta', 'Historia', 'Producto estrella', 'Comparación', 'Confianza', 'Cifras', 'Preguntas', 'Cierre', 'Pie']) expect(creative).toContain(section);
    expect(creative).toMatch(/clamp\(3\.2rem, 9vw, 8\.5rem\)/);
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
    expect(service).toContain('Preguntas');
  });
});

describe('agent limits in the instructions', () => {
  it('tells the model the minutes it really has', () => {
    expect(agentInstructions('CONTRATOS', 'shop', false, false)).toContain('6 minutes');
    expect(agentInstructions('CONTRATOS', 'shop', false, false, 12)).toContain('12 minutes');
  });
});
