// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { focusDebugEnabled, watchComposerFocus } from './source-focus-debug';

afterEach(() => { sessionStorage.clear(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const mount = () => {
  const app = document.createElement('div');
  app.innerHTML = '<textarea id="agent-command"></textarea><button id="other">x</button>';
  document.body.append(app);
  watchComposerFocus(app, () => ({ busy: false, mode: 'preview', renderedAt: performance.now(), storeId: 's1' }));
  return app;
};
const log = () => JSON.parse(sessionStorage.getItem('pagosya_focus_log') || '[]');
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

it('records the composer losing focus when the merchant did nothing to move it', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const app = mount();
  app.querySelector<HTMLTextAreaElement>('#agent-command')!.focus();
  app.querySelector<HTMLButtonElement>('#other')!.focus();
  await settle();
  expect(log()).toEqual([expect.objectContaining({ kind: 'focusout', to: 'button#other', activeAfter: 'button#other', storeId: 's1', busy: false })]);
});

it('stays quiet when the merchant clicked elsewhere', async () => {
  const app = mount();
  app.querySelector<HTMLTextAreaElement>('#agent-command')!.focus();
  const other = app.querySelector<HTMLButtonElement>('#other')!;
  other.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  other.focus();
  await settle();
  expect(log()).toEqual([]);
});

it('runs only on a local host', () => {
  expect(focusDebugEnabled('localhost')).toBe(true);
  expect(focusDebugEnabled('127.0.0.1')).toBe(true);
  expect(focusDebugEnabled('pagosya.bo')).toBe(false);
});
