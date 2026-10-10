import { DEFAULT_IDENTITY, storeIdentity } from './store-identity';

const design = (display: string, kase = 'none') => ({ path: 'design-direction.json', content: JSON.stringify({ selected: 1, concepts: [{ dna: { type: { display: 'fraunces', case: 'none' } } }, { dna: { type: { display, case: kase } } }] }) });

describe('storeIdentity', () => {
  it('takes the selected concept display font and case, and the hex colour tokens', () => {
    const identity = storeIdentity([design('instrument-serif', 'upper'), { path: 'styles/globals.css', content: ':root{--store-background:#F4EFE4;--store-foreground: #1e297a;}' }]);
    expect(identity).toEqual({ fontId: 'instrument-serif', upper: true, ink: '#1e297a', ground: '#F4EFE4' });
  });
  it('ignores colour tokens written as color-mix or variables, and unknown fonts', () => {
    const identity = storeIdentity([design('comic-sans'), { path: 'styles.css', content: ':root{--store-foreground:color-mix(in srgb, red 50%, blue);--store-background:var(--paper)}' }]);
    expect(identity).toEqual(DEFAULT_IDENTITY);
  });
  it('falls back to the defaults with no files, a broken design file, or base64 css', () => {
    expect(storeIdentity([])).toEqual(DEFAULT_IDENTITY);
    expect(storeIdentity([{ path: 'design-direction.json', content: '{' }])).toEqual(DEFAULT_IDENTITY);
    expect(storeIdentity([{ path: 'x.css', content: Buffer.from(':root{--store-foreground:#123456}').toString('base64'), encoding: 'base64' }])).toEqual(DEFAULT_IDENTITY);
  });
});
