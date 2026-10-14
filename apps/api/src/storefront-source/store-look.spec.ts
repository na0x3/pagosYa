import { lookFromReading, lookUniqueness, patchConfigFile, readConfigFile, sameLook, sanitizeLook, type LookBox, type LookPhoto, type LookReading } from './store-look';

const box = (radius: number, extra: Partial<LookBox> = {}): LookBox => ({ width: 300, height: 375, radii: [radius, radius, radius, radius], borderWidth: 0, shadows: [], ...extra });
const photo = (radius: number, extra: Partial<LookPhoto> = {}): LookPhoto => ({ ...box(radius), grayscale: 0, sepia: 0, blend: 'normal', overlay: false, padding: 0, lightBacking: false, rotate: 0, ...extra });
const reading = (over: Partial<LookReading> = {}): LookReading => ({
  heading: { families: ['Fraunces', 'serif'], weight: 700, transform: 'none', literalUpper: false, letterSpacing: -0.96, fontSize: 48, italic: false },
  loadedFamilies: ['Fraunces', 'Inter'], labels: [], photos: [photo(16), photo(16), photo(18)], cards: [], buttons: [], sections: [], pageLuminance: 0.9, ...over,
});

describe('lookFromReading', () => {
  it('reads a calm serif café', () => {
    const look = lookFromReading(reading())!;
    expect(look.type?.heading).toEqual({ family: 'Fraunces', weight: 700, case: 'none', tracking: -0.02, italic: false });
    expect(look.shape?.photo).toBe(16);
    expect(look.photo?.treatment).toBe('natural');
    expect(look.photo?.aspect).toBe('portrait');
  });

  it('reads a bold stamp store: uppercase heavy headline, labels, pill buttons, offset shadows', () => {
    const offset = { x: 6, y: 6, blur: 0, spread: 0, inset: false };
    const look = lookFromReading(reading({
      heading: { families: ['Anton'], weight: 900, transform: 'uppercase', literalUpper: false, letterSpacing: 4.8, fontSize: 48, italic: false },
      loadedFamilies: ['Anton'],
      labels: [1, 2, 3].map(() => ({ letterSpacing: 1.2, fontSize: 12, weight: 700 })),
      buttons: [box(999, { width: 180, height: 48 }), box(999, { width: 160, height: 48 })],
      cards: [box(0, { shadows: [offset] }), box(0, { shadows: [offset] }), box(0, { shadows: [offset] })],
    }))!;
    expect(look.type?.heading).toMatchObject({ family: 'Anton', weight: 900, case: 'upper', tracking: 0.1 });
    expect(look.type?.label).toEqual({ case: 'upper', tracking: 0.1, weight: 700 });
    expect(look.shape?.button).toBe('pill');
    expect(look.shape?.card).toBe(0);
    expect(look.edge).toBe('offset');
  });

  it('reads polaroid frames and their tilt', () => {
    const look = lookFromReading(reading({ photos: [photo(2, { padding: 12, lightBacking: true, rotate: 3 }), photo(2, { padding: 12, lightBacking: true, rotate: -2 }), photo(2, { padding: 12, lightBacking: true, rotate: 4 })] }))!;
    expect(look.photo?.treatment).toBe('polaroid');
    expect(look.photo?.tilt).toBe(3);
  });

  it('lets the drawn treatment beat the measured one', () => {
    expect(lookFromReading(reading(), { treatment: 'black-white' })!.photo?.treatment).toBe('mono');
    expect(lookFromReading(reading(), { treatment: 'one-per-screen' })!.photo?.treatment).toBe('natural');
    expect(lookFromReading(reading(), { treatment: 'tight-crops' })!.photo?.treatment).toBe('tight');
  });

  it('leaves out what it cannot read: no photos, an unloaded font', () => {
    const look = lookFromReading(reading({ photos: [], loadedFamilies: [] }))!;
    expect(look.photo).toBeUndefined();
    expect(look.shape?.photo).toBeUndefined();
    expect(look.type?.heading?.family).toBeUndefined();
    expect(look.type?.heading?.weight).toBe(700);
  });

  it('leaves out radii that disagree with each other', () => {
    expect(lookFromReading(reading({ photos: [photo(0), photo(24), photo(48)] }))!.shape?.photo).toBeUndefined();
  });

  it('recognises arches and colour treatments', () => {
    const arch = (extra: Partial<LookPhoto> = {}) => photo(0, { radii: [150, 150, 0, 0], ...extra });
    expect(lookFromReading(reading({ photos: [arch(), arch(), arch()] }))!.shape?.photo).toBe('arch');
    expect(lookFromReading(reading({ photos: [photo(0, { grayscale: 1 }), photo(0, { grayscale: 1 }), photo(0)] }))!.photo?.treatment).toBe('mono');
    expect(lookFromReading(reading({ photos: [photo(0, { grayscale: 1, blend: 'multiply' }), photo(0, { grayscale: 1, blend: 'multiply' })] }))!.photo?.treatment).toBe('duotone');
  });

  it('reads the surface rhythm', () => {
    const band = (luminance: number, background: string) => ({ luminance, background });
    expect(lookFromReading(reading({ sections: [band(0.95, 'a'), band(0.04, 'b')] }))!.surface).toBe('banded');
    expect(lookFromReading(reading({ sections: [band(0.95, 'a'), band(0.85, 'b')] }))!.surface).toBe('tinted');
    expect(lookFromReading(reading({ sections: [band(0.95, 'a'), band(0.95, 'a')] }))!.surface).toBe('flat');
  });

  it('returns nothing when the page gave nothing to read', () => {
    expect(lookFromReading(reading({ heading: null, photos: [] }))).toBeUndefined();
  });
});

describe('sanitizeLook', () => {
  it('is idempotent on its own output', () => {
    const look = lookFromReading(reading())!;
    expect(sanitizeLook(look)).toEqual(look);
    expect(sanitizeLook(JSON.parse(JSON.stringify(look)))).toEqual(look);
  });

  it('normalises float noise in tracking and tilt', () => {
    expect(sanitizeLook({ version: 1, type: { heading: { tracking: 0.1 + 0.2 - 0.2 }, label: { case: 'upper', tracking: 0.1 * 3 } }, photo: { tilt: 0.1 * 3 * 10 } }))
      .toEqual({ version: 1, type: { heading: { tracking: 0.1 }, label: { case: 'upper', tracking: 0.3 } }, photo: { tilt: 3 } });
  });

  it('drops unknown keys, wrong versions and unsafe values', () => {
    expect(sanitizeLook(undefined)).toBeUndefined();
    expect(sanitizeLook({ version: 2, edge: 'soft' })).toBeUndefined();
    expect(sanitizeLook({ version: 1, edge: 'glow', evil: 1 })).toBeUndefined();
    const cleaned = sanitizeLook({ version: 1, type: { heading: { family: 'x;}body{display:none', weight: 1200 } }, shape: { photo: 400, card: 'pill' }, photo: { tilt: 9 } });
    expect(cleaned).toEqual({ version: 1, shape: { card: 'pill' } });
  });
});

describe('config helpers', () => {
  it('reads and patches config.js', () => {
    const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","dna":{"version":1}};\n' }, { path: 'index.html', content: '<p>' }];
    expect(readConfigFile(files).slug).toBe('cafe');
    const patched = patchConfigFile(files, config => ({ ...config, look: { version: 1 } }));
    expect(readConfigFile(patched).look).toEqual({ version: 1 });
    expect(patched[1]).toBe(files[1]);
  });
});

describe('one-look-check comparisons', () => {
  it('compares looks sanitized on both sides and regardless of key order', () => {
    const a = { version: 1, edge: 'offset', type: { heading: { family: 'Anton', case: 'upper', tracking: 0.1 } } };
    const b = { type: { heading: { tracking: 0.1 + 0.2 - 0.2, case: 'upper', family: 'Anton' } }, edge: 'offset', version: 1, junk: true };
    expect(sameLook(a, b)).toBe(true);
    expect(sameLook(a, { ...a, edge: 'soft' })).toBe(false);
    expect(sameLook(undefined, { version: 2 })).toBe(true);
  });
  it('leaves look-less stores out of the uniqueness verdict and reports them apart', () => {
    const look = { version: 1, edge: 'offset' };
    expect(lookUniqueness([{ slug: 'a', look }, { slug: 'b' }, { slug: 'c' }])).toEqual({ unique: true, duplicates: [], lookless: ['b', 'c'] });
    expect(lookUniqueness([{ slug: 'a', look }, { slug: 'b', look: { edge: 'offset', version: 1 } }])).toEqual({ unique: false, duplicates: [['b', 'a']], lookless: [] });
  });
});
