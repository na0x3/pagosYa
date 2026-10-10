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
    expect(prompt).toContain('most story sections');
  });
  it('makes bold motion the default: no two-scene cap, marquee bands welcome when they respect reduced motion', () => {
    for (const react of [true, false]) {
      const prompt = sourceMotionPlan({ ...base, creative: true, instruction: '', motion: 'auto', react });
      expect(prompt).not.toMatch(/At most two scroll scenes/i);
      expect(prompt).not.toContain('decorative infinite loops without a pause control');
      expect(prompt).toMatch(/marquee band/i);
      expect(prompt).toContain('prefers-reduced-motion');
      expect(prompt).toMatch(/pauses on hover and focus/);
    }
  });
  it('keeps subtle motion restrained: no looping bands', () => {
    const prompt = sourceMotionPlan({ ...base, creative: true, instruction: '', motion: 'subtle' });
    expect(prompt).not.toMatch(/marquee band[^.]*welcome/i);
    expect(prompt).toContain('no looping bands');
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

describe('motion plan consistency', () => {
  it('drops the two-moment wording, and keeps a local motion edit to what was asked', () => {
    const fresh = sourceMotionPlan({ creative: true, instruction: '', motion: 'auto', react: false });
    expect(fresh).not.toContain('two different scroll moments');
    const edit = sourceMotionPlan({ creative: false, instruction: 'Agrega paralaje a la foto', motion: 'auto', react: false });
    expect(edit).toContain('Implement only the currently requested motion');
    expect(edit).not.toContain('most story sections');
    expect(edit).not.toMatch(/marquee band/i);
  });
});
