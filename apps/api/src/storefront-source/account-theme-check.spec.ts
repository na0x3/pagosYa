jest.setTimeout(120_000);
import { checkAccountThemeOnSnapshot } from './account-theme-check';
import { kitDefaultSnapshot } from './source-scorecard-capture';

/** Real-browser check that the account pages keep their fields, button, links and errors usable (spec 2026-10-08).
 * The raw CSS bypasses the sanitizer on purpose: it proves the check catches what slips past it. */
async function themed(css: string, theme: Record<string, unknown> = { layout: 'card' }, body = '') {
  const kit = await kitDefaultSnapshot();
  return { ...kit, files: kit.files.map(file => {
    if (file.path === 'index.html' && body) return { ...file, content: file.content.replace(/<\/body>/i, `${body}</body>`) };
    if (file.path !== 'config.js') return file;
    const config = JSON.parse(file.content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
    config.accountTheme = { ...theme, ...(css ? { css } : {}) };
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` };
  }) };
}

describe('checkAccountTheme', () => {
  it('passes the default account pages', async () => {
    expect(await checkAccountThemeOnSnapshot(await themed(''))).toEqual([]);
  });
  it('reports a submit button shrunk below a usable size, at both widths', async () => {
    const failures = await checkAccountThemeOnSnapshot(await themed('[data-account-gate] [data-part="submit"]{height:10px;min-height:0;padding:0;font-size:4px;line-height:4px}'));
    expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({ control: 'submit', viewport: 'mobile', reason: expect.stringMatching(/too small/) }), expect.objectContaining({ control: 'submit', viewport: 'desktop' })]));
  });
  // PEPPA please 2026-10-20: the split theme's photo plus the design's own copy beside it, the form squeezed between.
  it('reports the split photo drawn twice', async () => {
    const failures = await checkAccountThemeOnSnapshot(await themed('', { layout: 'split', photo: 'assets/peppa.jpg' }, '<img src="assets/peppa.jpg" alt="" width="400" height="400" style="display:block">'));
    expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({ control: 'layout', reason: expect.stringMatching(/same photo shows twice \(peppa\.jpg\)/) })]));
  });
  it('passes the split photo shown once', async () => {
    expect(await checkAccountThemeOnSnapshot(await themed('', { layout: 'split', photo: 'assets/peppa.jpg' }))).toEqual([]);
  });
  it('reports a form squeezed into a strip on desktop only', async () => {
    const failures = await checkAccountThemeOnSnapshot(await themed('[data-account-gate] [data-part="form"]{max-width:240px}'));
    expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({ control: 'layout', viewport: 'desktop', reason: expect.stringMatching(/squeezed to 240px/) })]));
    expect(failures.some(f => f.control === 'layout' && f.viewport === 'mobile')).toBe(false);
  });
});
