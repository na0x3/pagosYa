import { templateManifest } from '@pagosya/store-templates';
import { masterDnaLook } from './source-master';

describe('lively one-product stores: Esencial switches (spec 2026-11-03)', () => {
  it('lists the mood variant', () => {
    expect(templateManifest('esencial')!.master!.variants!.mood).toEqual(['calm', 'colourful']);
  });
  it('gives Único buttons a lift on hover and a squash on press', () => {
    expect(masterDnaLook({ theme: 'unico', button: 'pill', corners: 'round' } as never)).toEqual({ button: 'pill', radius: 'round', hover: 'lift', press: 'squash' });
    expect(masterDnaLook({ theme: 'calma', button: 'pill' } as never)).toEqual({ button: 'pill' });
  });
});
