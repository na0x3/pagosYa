import { applySourceLayoutBaseline, SOURCE_LAYOUT_BASELINE_MARKER } from './source-layout-baseline';

describe('source layout baseline', () => {
  it('adds the same responsive safety floor to static and React stylesheets', () => {
    const files = applySourceLayoutBaseline([
      { path: 'styles.css', content: 'body { color: red; }' },
      { path: 'styles/globals.css', content: 'h1 { font-size: 4rem; }' },
      { path: 'site.js', content: 'console.log("ok")' },
    ]);

    expect(files[0].content).toContain(SOURCE_LAYOUT_BASELINE_MARKER);
    expect(files[1].content).toContain(SOURCE_LAYOUT_BASELINE_MARKER);
    expect(files[0].content).toContain('min-width: 0');
    expect(files[0].content).toContain('overflow-wrap: anywhere');
    expect(files[0].content).not.toMatch(/overflow-x:\s*(?:hidden|clip)/i);
  });

  it('is idempotent and preserves already-safe source bytes', () => {
    const initial = applySourceLayoutBaseline([{ path: 'styles.css', content: 'body { color: red; }' }]);
    expect(applySourceLayoutBaseline(initial)).toEqual(initial);
    expect(applySourceLayoutBaseline([{ path: 'assets/styles.css', content: 'body{}' }])[0].content).toContain(SOURCE_LAYOUT_BASELINE_MARKER);
    expect(applySourceLayoutBaseline([{ path: 'styles.css', encoding: 'base64', content: 'YWJj' }])).toEqual([{ path: 'styles.css', encoding: 'base64', content: 'YWJj' }]);
  });
});
