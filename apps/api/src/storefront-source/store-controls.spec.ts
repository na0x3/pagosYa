import { cleanControlWord, ICON_MAX_CHARS, parseIconPath, readControls, sanitizeControls, sanitizeControlsReport, withControlsConfig, type StoreControls } from './store-controls';

const CUP = 'M4 7h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM5.75 8.75h8.5V13a3.25 3.25 0 0 1-3.25 3.25H9A3.25 3.25 0 0 1 5.75 13zM16 8.5h1.5a3 3 0 0 1 0 6H16v-1.75h1.5a1.25 1.25 0 0 0 0-2.5H16zM3 20h16v1.75H3z';
const PLUS = 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z';
const FALLBACK = 'M4 4h16v16H4z';
const RECORD: StoreControls = {
  version: 1,
  shape: { outline: 'ticket', corner: 4, notch: 5, tilt: -2, border: 'dashed', weight: 2, fill: 'solid', colour: 'accent' },
  layout: { cart: 'icon+word', account: 'icon' },
  icons: { cart: CUP, plus: PLUS },
  words: { cart: 'Tu pedido', account: 'Mi cuenta' },
  badge: 'stamp', source: 'yapi',
};

describe('sanitizeControls (spec 2026-10-14, part 2)', () => {
  it('keeps a valid record as it is, and is idempotent', () => {
    expect(sanitizeControls(RECORD)).toEqual(RECORD);
    expect(sanitizeControls(sanitizeControls(RECORD))).toEqual(RECORD);
  });

  it('clamps numbers to their ranges in half steps', () => {
    expect(sanitizeControls({ ...RECORD, shape: { ...RECORD.shape, corner: 40, notch: 3.3, tilt: -9, weight: 0 } })!.shape)
      .toMatchObject({ corner: 24, notch: 3.5, tilt: -6, weight: 1 });
  });

  it.each([
    ['an unknown outline', { shape: { ...RECORD.shape, outline: 'hexagon' } }],
    ['an unknown fill', { shape: { ...RECORD.shape, fill: 'gradient' } }],
    ['a colour that is not a token', { shape: { ...RECORD.shape, colour: '#ff0000' } }],
    ['an unknown border', { shape: { ...RECORD.shape, border: 'groove' } }],
    ['an unknown badge', { badge: 'flag' }],
    ['an unknown layout', { layout: { cart: 'big', account: 'icon' } }],
    ['an unknown source', { source: 'model' }],
    ['a corner that is not a number', { shape: { ...RECORD.shape, corner: '8px' } }],
    ['another version', { version: 2 }],
  ])('drops the whole record for %s', (_name, change) => {
    expect(sanitizeControls({ ...RECORD, ...change })).toBeUndefined();
  });

  it('replaces a bad icon with the fallback for its slot and keeps the rest of the record', () => {
    const report = sanitizeControlsReport({ ...RECORD, icons: { cart: '<path d="M0 0"/>', plus: PLUS, close: 'M0 0L30 30', logo: CUP } }, { fallbackIcon: () => FALLBACK });
    expect(report.controls!.icons).toEqual({ cart: FALLBACK, plus: PLUS, close: FALLBACK });
    expect(report.replacedIcons).toEqual(['cart', 'close']);
    expect(report.controls!.shape).toEqual(RECORD.shape);
  });

  it('leaves a bad icon out when there is no fallback, and an empty string means none', () => {
    expect(sanitizeControls({ ...RECORD, icons: { cart: 'url(#x)', menu: '' } })!.icons).toEqual({});
  });

  it('drops a bad word only, and keeps the record', () => {
    const report = sanitizeControlsReport({ ...RECORD, words: { cart: '🛒 carrito', account: '  Mi   cuenta ' } });
    expect(report.controls!.words).toEqual({ account: 'Mi cuenta' });
    expect(report.droppedWords).toEqual(['cart']);
  });
});

describe('cleanControlWord', () => {
  it.each([
    ['  Tu   taza ', 'Tu taza'], ['Tu selección', 'Tu selección'], ["Pa'llevar", "Pa'llevar"],
    ['Tu canasta grande', undefined], ['🛒', undefined], ['<b>Carrito</b>', undefined], ['Cart', undefined], ['My account', undefined], ['', undefined], [42, undefined],
  ])('%p → %p', (raw, expected) => expect(cleanControlWord(raw)).toBe(expected));
});

describe('parseIconPath', () => {
  it.each([
    ['arcs, relative commands and several subpaths', CUP],
    ['an implicit lineto after a moveto', 'M2 2 22 2 22 22z'],
    ['compact arc flags', 'M4 12a8 8 0 0010 0z'],
    ['quadratic curves', 'M4 12Q12 2 20 12Q12 22 4 12z'],
    ['a smooth cubic', 'M4 12C4 4 20 4 20 12S4 20 4 12z'],
    ['a self-crossing shape that still paints', 'M2 12Q7 4 12 12T22 12z'],
  ])('accepts %s', (_name, d) => expect(parseIconPath(d)).toEqual({ ok: true, d }));

  it('collapses whitespace in what it keeps', () => expect(parseIconPath('  M4 4h16v16H4z \n')).toEqual({ ok: true, d: 'M4 4h16v16H4z' }));

  it.each([
    ['markup', '<path d="M0 0"/>', 'not path data'],
    ['a URL', 'url(#x)', 'not path data'],
    ['a stray exponent letter where a command belongs', 'M2 2h20v20H2z e', 'not path data'],
    ['a point outside the box', 'M0 0L30 30L0 30z', 'outside the 24×24 box'],
    ['an arc that bulges out of the box', 'M2 4a10 10 0 0 1 20 0z', 'outside the 24×24 box'],
    ['a smooth curve whose mirrored control leaves the box', 'M4 12Q12 2 20 12T4 12z', 'outside the 24×24 box'],
    ['a line with no area', 'M2 2L22 22', 'draws no visible area'],
    ['a sliver', 'M2 2h20v.01H2z', 'draws no visible area'],
    ['a hairline ring', 'M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10zM12 7.01a4.99 4.99 0 1 0 0 9.98a4.99 4.99 0 1 0 0-9.98z', 'draws no visible area'],
    ['no moveto first', 'L2 2', 'does not start with M'],
    ['a missing coordinate', 'M2 2 3', 'incomplete L command'],
    ['numbers after a close', 'M2 2h20v20z 4 4', 'numbers without a command'],
    ['more than 1,500 characters', 'M2 2h20v20H2z' + ' M2 2h1v1H2z'.repeat(130), `longer than ${ICON_MAX_CHARS} characters`],
    ['not text', 42, 'not text'],
  ])('rejects %s', (_name, d, reason) => expect(parseIconPath(d)).toEqual({ ok: false, reason }));
});

describe('config.controls in config.js', () => {
  const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","look":{"version":1,"edge":"offset"}};\n' }, { path: 'index.html', content: '<main></main>' }];
  it('writes, reads back and removes the record, leaving every other file and key alone', () => {
    const written = withControlsConfig(files, RECORD);
    expect(readControls(written)).toEqual(RECORD);
    expect(written[1]).toBe(files[1]);
    const removed = withControlsConfig(written, undefined);
    expect(readControls(removed)).toBeUndefined();
    expect(removed[0].content).toBe(files[0].content);
  });
});
