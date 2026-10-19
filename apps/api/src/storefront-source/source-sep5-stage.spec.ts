import { withSiteScript } from './source-sep5-stage';

describe('withSiteScript (Licua Mini 2, 2026-10-19)', () => {
  it('adds an empty site.js only when the author returned none', () => {
    const files = [{ path: 'index.html', content: '<html></html>' }, { path: 'styles.css', content: 'body{}' }];
    const fixed = withSiteScript(files);
    expect(fixed.map(file => file.path)).toEqual(['index.html', 'styles.css', 'site.js']);
    expect(fixed[2].content).toMatch(/^\/\*/);
    const complete = [...files, { path: 'site.js', content: 'console.log(1)' }];
    expect(withSiteScript(complete)).toBe(complete);
  });
});