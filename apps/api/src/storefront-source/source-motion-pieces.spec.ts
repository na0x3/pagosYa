import { asksForEnergy, motionPieceCount, motionPiecesDirection } from './source-motion-pieces';

describe('motion pieces and spotlights for YAPI (owner 2026-10-22)', () => {
  it('reads energy requests', () => {
    expect(asksForEnergy('Quiero algo con mucha energía y movimiento, una tienda animada')).toBe(true);
    expect(asksForEnergy('una tienda sobria y elegante para un estudio contable')).toBe(false);
  });
  it('teaches every piece, the spotlight patterns and the limits', () => {
    const text = motionPiecesDirection({ energy: 'high', motion: 'auto' });
    for (const piece of ['float', 'bob', 'spin', 'breathe', 'bubbles', 'marquee', 'pop', 'zoom']) expect(text).toContain(`data-pya-motion="${piece}"`);
    expect(text).toMatch(/SPOTLIGHT SECTIONS/);
    expect(text).toMatch(/never on body text, navigation, cart/i);
    expect(text).toMatch(/at least three different pieces/i);
  });
  it('keeps calm stores gentle and turns off with motion off', () => {
    expect(motionPiecesDirection({ energy: 'calm', motion: 'auto' })).toMatch(/only breathe, zoom and pop/i);
    expect(motionPiecesDirection({ energy: 'high', motion: 'off' })).toBe('');
  });
  it('counts the pieces an authored page uses', () => {
    expect(motionPieceCount('<img data-pya-motion="float"><b data-pya-motion="spin"></b><img data-pya-motion="float">')).toEqual({ float: 2, spin: 1 });
  });
});
