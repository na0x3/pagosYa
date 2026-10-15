import { CART_WORDS } from './design-engine/commerce-draw';
import type { PlaybookKind } from './design-engine/playbook';
import { CONTROL_OUTLINES, parseIconPath, sanitizeControls } from './store-controls';
import { CART_ICONS, CONTROL_LANGUAGES, KIND_CART_ICON, SHARED_ICONS, cartIconFor, cartIconName, controlsKey, controlsToAvoid, hexContrast, languageReadable, libraryIconFallback, libraryRecord, pickLibraryControls, storePalette } from './store-controls-library';

describe('the controls library (spec 2026-10-14, part 5)', () => {
  it('draws every icon as valid path data inside the 24×24 box, in both styles', () => {
    for (const [name, styles] of Object.entries({ ...CART_ICONS, ...SHARED_ICONS })) for (const [style, d] of Object.entries(styles)) {
      expect({ name, style, parsed: parseIconPath(d) }).toEqual({ name, style, parsed: { ok: true, d } });
    }
  });

  it('has one language per outline, each a record the sanitizer keeps as it is', () => {
    expect(CONTROL_LANGUAGES.map(language => language.shape.outline).sort()).toEqual([...CONTROL_OUTLINES].sort());
    for (const language of CONTROL_LANGUAGES) {
      const record = libraryRecord(language, 'clothing', 'bag');
      expect(sanitizeControls(record)).toEqual(record);
      expect(record.source).toBe('library');
    }
  });

  it('gives every kind of business its cart icon and its own cart word', () => {
    expect(cartIconFor('cafe-food')).toBe('cup');
    expect(cartIconFor('services')).toBe('briefcase');
    expect(cartIconFor('crafts-home')).toBe('frame');
    expect(cartIconFor('general', 'Tienda de accesorios para mascotas')).toBe('paw');
    for (const kind of Object.keys(KIND_CART_ICON) as PlaybookKind[]) {
      const record = pickLibraryControls({ kind, mode: 'calm', seed: kind });
      expect(record.words).toEqual({ cart: CART_WORDS[kind], account: 'Mi cuenta' });
      expect(cartIconName(record.icons.cart)).toBe(KIND_CART_ICON[kind]);
    }
  });

  it('is a pure function of its input', () => {
    const input = { kind: 'cafe-food' as const, mode: 'bold' as const, seed: 'store-1:0', look: { version: 1 as const, shape: { button: 'pill' as const } } };
    expect(pickLibraryControls(input)).toEqual(pickLibraryControls(input));
  });

  it('keeps calm and bold apart', () => {
    const modeOf = (outline: string) => CONTROL_LANGUAGES.find(language => language.shape.outline === outline)!.mode;
    for (let n = 0; n < 40; n++) {
      expect(modeOf(pickLibraryControls({ kind: 'beauty', mode: 'calm', seed: `c${n}` }).shape.outline)).not.toBe('bold');
      expect(modeOf(pickLibraryControls({ kind: 'beauty', mode: 'bold', seed: `b${n}` }).shape.outline)).not.toBe('calm');
    }
  });

  it('follows the measured button shape', () => {
    for (let n = 0; n < 20; n++) {
      expect(['pill', 'rounded']).toContain(pickLibraryControls({ kind: 'clothing', mode: 'calm', seed: `p${n}`, look: { version: 1, shape: { button: 'pill' } } }).shape.outline);
    }
    expect(['square', 'bracket', 'underline', 'tab']).toContain(pickLibraryControls({ kind: 'clothing', mode: 'calm', seed: 's', look: { version: 1, shape: { button: 0 } } }).shape.outline);
    expect(pickLibraryControls({ kind: 'clothing', mode: 'calm', seed: 'r', look: { version: 1, shape: { button: 'pill' } } }).shape.corner).toBeLessThanOrEqual(24);
  });

  it("never repeats a sibling store's outline and cart icon, and still answers when everything is taken", () => {
    const first = pickLibraryControls({ kind: 'cafe-food', mode: 'calm', seed: 'x' });
    const second = pickLibraryControls({ kind: 'cafe-food', mode: 'calm', seed: 'x', avoid: [first] });
    expect(controlsKey(second)).not.toBe(controlsKey(first));
    const everything = CONTROL_LANGUAGES.map(language => libraryRecord(language, 'cafe-food', 'cup'));
    expect(pickLibraryControls({ kind: 'cafe-food', mode: 'calm', seed: 'x', avoid: everything }).source).toBe('library');
  });

  it('treats the line and solid drawings of one icon as the same icon', () => {
    const line = libraryRecord(CONTROL_LANGUAGES[0], 'cafe-food', 'cup');
    expect(controlsKey({ ...line, icons: { ...line.icons, cart: CART_ICONS.cup.solid } })).toBe(controlsKey(line));
    expect(cartIconName('M4 4h16v16H4z')).toBe('custom');
    expect(cartIconName(undefined)).toBe('none');
  });

  it("skips languages the store's colours cannot read", () => {
    const yellow = { paper: '#ffffff', ink: '#111111', accent: '#ffd400', onAccent: '#111111' };
    expect(languageReadable(CONTROL_LANGUAGES.find(language => language.id === 'price-tag')!, yellow)).toBe(false);
    for (let n = 0; n < 40; n++) {
      const record = pickLibraryControls({ kind: 'general', mode: n % 2 ? 'bold' : 'calm', seed: `y${n}`, palette: yellow });
      expect(record.shape.fill === 'outline' && record.shape.colour === 'accent').toBe(false);
    }
    expect(hexContrast('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('reads the store palette from hex tokens only', () => {
    expect(storePalette([{ path: 'brand.css', content: ':root{--brand-background:#F7F4EF;--brand-foreground:#1a1f2b;--brand-accent:#2f4bb8;--brand-accent-foreground:#ffffff}' }]))
      .toEqual({ paper: '#f7f4ef', ink: '#1a1f2b', accent: '#2f4bb8', onAccent: '#ffffff' });
    expect(storePalette([{ path: 'styles.css', content: ':root{--store-background:oklch(98% 0 0)}' }])).toBeUndefined();
  });

  it("falls back to the line drawing of the store's own icons for a failing slot", () => {
    expect(libraryIconFallback('cafe-food')('cart')).toBe(CART_ICONS.cup.line);
    expect(libraryIconFallback('cafe-food')('close')).toBe(SHARED_ICONS.close.line);
  });
});

describe('controlsToAvoid', () => {
  it('takes the same-kind stores first, then the newest others, six at most, each language once', () => {
    const records = CONTROL_LANGUAGES.map(language => libraryRecord(language, 'cafe-food', 'cup'));
    const rows = [{ kind: 'clothing', controls: records[0] }, { kind: 'cafe-food', controls: records[1] }, { controls: records[2] }, { kind: 'cafe-food', controls: records[1] }, ...records.slice(3, 9).map(controls => ({ kind: 'beauty', controls }))];
    expect(controlsToAvoid(rows, 'cafe-food')).toEqual([records[1], records[0], records[2], records[3], records[4], records[5]]);
  });
});
