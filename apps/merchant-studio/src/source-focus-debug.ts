/**
 * Local-only diagnostics for "the YAPI box stops taking my typing": records every time the composer loses focus
 * without the merchant clicking, tabbing or pressing Escape, and every redraw that could not carry focus over.
 * Entries go to the console as [yapi-focus] and to sessionStorage (pagosya_focus_log, last 40) so they can be read
 * after the fact. Nothing runs outside localhost.
 */
const KEY = 'pagosya_focus_log';
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

export type FocusDebugState = () => { busy: boolean; mode: string; renderedAt: number; storeId: string };

const describe = (node: EventTarget | Element | null | undefined) => {
  if (!node || !(node instanceof Element)) return node ? String(node) : null;
  return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.getAttribute('title') ? `[${node.getAttribute('title')!.slice(0, 40)}]` : ''}`;
};

export function focusDebugEnabled(host = location.hostname) {
  return LOCAL.includes(host);
}

export function recordFocusLoss(entry: Record<string, unknown>) {
  const row = { at: new Date().toISOString(), ...entry };
  console.warn('[yapi-focus]', row);
  try {
    const log = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    sessionStorage.setItem(KEY, JSON.stringify([...(Array.isArray(log) ? log : []), row].slice(-40)));
  } catch { /* Storage full or blocked: the console line is enough. */ }
}

/** Watches the composer by id, so it survives the redraws that replace the textarea. */
export function watchComposerFocus(app: HTMLElement, state: FocusDebugState) {
  if (!focusDebugEnabled()) return;
  let intentAt = 0;
  const intent = () => { intentAt = performance.now(); };
  app.addEventListener('pointerdown', intent, true);
  app.addEventListener('keydown', event => { if (event.key === 'Tab' || event.key === 'Escape' || event.key === 'Enter') intent(); }, true);
  app.addEventListener('focusout', event => {
    const field = event.target as HTMLElement;
    if (field.id !== 'agent-command' || performance.now() - intentAt < 400) return;
    const lost = { to: describe(event.relatedTarget), ...state() };
    // Where focus actually landed is only known once the change completes.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && active.id === 'agent-command') return;
      recordFocusLoss({
        kind: 'focusout', ...lost, activeAfter: describe(active), windowFocused: document.hasFocus(),
        renderedMsAgo: Math.round(performance.now() - lost.renderedAt), fieldConnected: field.isConnected, fieldDisabled: (field as HTMLTextAreaElement).disabled,
      });
    }, 0);
  }, true);
}
