import { currentSourceRuntime } from './source-runtime';

describe('current source runtime hardening', () => {
  it('retrofits the global layout floor and referenced local fonts for older snapshots', async () => {
    const result = await currentSourceRuntime({
      schemaVersion: 1,
      brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida' },
      files: [
        { path: 'styles.css', encoding: 'utf8', content: '@font-face{font-family:Bricolage;src:url(/assets/bricolage.ttf)} body{}' },
        { path: 'index.html', encoding: 'utf8', content: '<main><h1>Café</h1></main>' },
      ],
    });

    expect(result.files.find(file => file.path === 'styles.css')?.content).toContain('pagosya-layout-baseline:start');
    expect(result.files.some(file => file.path === 'assets/bricolage.ttf')).toBe(true);
  });
});
