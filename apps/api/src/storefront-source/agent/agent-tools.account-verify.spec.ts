jest.mock('./agent-verify', () => ({ verifyAgentDraft: jest.fn(async () => ({ files: [], repairs: [], findings: [] })) }));
jest.mock('./agent-capture', () => ({
  agentPreviewSnapshot: jest.fn(async () => ({ files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"x"};' }] })),
  captureAgentDraft: jest.fn(),
}));
import { AgentWorkspace } from './agent-workspace';
import { AgentToolbox } from './agent-tools';
import type { ThemeCheckFailure } from '../product-theme-check';

// Spec 2026-10-08-store-built-in-account-pages: verify proves the account pages' theme leaves the controls usable.
const box = (checkAccountTheme: (snapshot: any) => Promise<ThemeCheckFailure[]>) =>
  new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'haz el login más elegante', purpose: 'shop', maxScreenshots: 0, accountThemeAllowed: true, checkAccountTheme } as never);
const setTheme = (b: AgentToolbox) => b.run('set_account_theme', JSON.stringify({ layout: 'panel', photo: null, css: '[data-part=title]{letter-spacing:2px}' }));
const configOf = (snapshot: any) => JSON.parse(snapshot.files.find((f: any) => f.path === 'config.js').content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));

describe('verify checks the account pages in a real browser', () => {
  it('checks the draft with the account theme in its config and keeps the CSS when it passes', async () => {
    const check = jest.fn(async (_snapshot: any) => [] as ThemeCheckFailure[]);
    const b = box(check);
    await setTheme(b);
    expect((await b.run('verify', '{}')).output).toBe('Todo en orden.');
    expect(configOf(check.mock.calls[0][0]).accountTheme).toEqual(b.pendingAccountTheme);
    expect(b.pendingAccountTheme!.css).toContain('letter-spacing');
  });
  it('removes the CSS and says why when a control is no longer usable', async () => {
    const b = box(async () => [{ control: 'submit', viewport: 'mobile', reason: 'too small (90x20px, needs 120x44)' }]);
    await setTheme(b);
    const output = (await b.run('verify', '{}')).output;
    expect(output).toContain('submit (mobile): too small');
    expect(output).toContain('Se quitó el CSS de las páginas de cuenta');
    expect(b.pendingAccountTheme).toEqual({ layout: 'panel' });
  });
});
