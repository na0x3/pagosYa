import { sourceMotionPlan } from './source-motion-plan';

describe('motion choreography scope', () => {
  const base = { creative: false, motion: 'auto' as const, react: true };
  it('does not reopen motion design for unrelated edits or conversation history', () => {
    expect(sourceMotionPlan({ ...base, instruction: 'Add parallax. Pedido actual del comercio: Cambia el título a Café Luna' })).toBe('');
  });
  it('plans requested parallax while preserving unrelated design', () => {
    expect(sourceMotionPlan({ ...base, instruction: 'Agrega paralaje a la foto' })).toContain('preserve unrelated layout');
  });
  it('opens fresh automatic designs straight onto the page, with two story moments and no full-screen opening', () => {
    const prompt = sourceMotionPlan({ ...base, creative: true, instruction: '', motion: 'auto' });
    expect(prompt).not.toMatch(/BrandEntrance|PageEntrance|SignatureStrokeEntrance|merchant name/);
    expect(prompt).toContain('Never add a full-screen opening');
    expect(prompt).toContain('two different scroll effects');
  });
  it('honors off and subtle modes over an ambitious brief', () => {
    expect(sourceMotionPlan({ ...base, creative: true, instruction: 'Expressive brand', motion: 'off' })).not.toContain('PageEntrance');
    expect(sourceMotionPlan({ ...base, creative: true, instruction: '', motion: 'subtle' })).toContain('omit parallax');
  });
  it('uses portable browser instructions for static projects', () => {
    const prompt = sourceMotionPlan({ ...base, creative: true, instruction: '', react: false });
    expect(prompt).toContain('guarded site.js');
    expect(prompt).not.toContain('@pagosya/ui');
  });
});
