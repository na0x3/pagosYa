import { withSourceFonts } from './source-fonts';

it('bundles only requested local font assets and their licenses without replacing retained bytes', async () => {
  const files = [{ path: 'styles.css', content: '@font-face{font-family:Instrument;src:url(assets/instrument.ttf)}' }];
  const bundled = await withSourceFonts(files);
  expect(bundled.map(file => file.path)).toEqual(['styles.css', 'assets/instrument.ttf', 'assets/instrument-OFL.txt']);
  const font = bundled.find(file => file.path.endsWith('.ttf'))!;
  expect(font.encoding).toBe('base64');
  expect(Buffer.from(font.content, 'base64').readUInt32BE(0)).toBe(0x00010000);
  expect(bundled.find(file => file.path.endsWith('OFL.txt'))?.content).toContain('SIL OPEN FONT LICENSE');
  expect(await withSourceFonts(bundled)).toEqual(bundled);
  expect(await withSourceFonts([{ path: 'styles.css', content: 'body{font-family:serif}' }])).toEqual([{ path: 'styles.css', content: 'body{font-family:serif}' }]);
});

it('ships the theme display fonts and licenses in Next exports', async () => {
  const bundled = await withSourceFonts([{ path: 'styles/globals.css', content: '@font-face{font-family:Print;src:url(../assets/oswald.ttf)} @font-face{font-family:Workshop;src:url(../assets/instrument-serif.ttf)}' }]);
  for (const name of ['oswald', 'instrument-serif']) {
    const font = bundled.find(file => file.path === `assets/${name}.ttf`)!;
    expect(Buffer.from(font.content, 'base64').readUInt32BE(0)).toBe(0x00010000);
    expect(bundled.find(file => file.path === `assets/${name}-OFL.txt`)?.content).toContain('SIL OPEN FONT LICENSE');
  }
});
