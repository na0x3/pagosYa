/** The Boceto's own right-click menu (Figma-style): drawn by the Studio over the board, never the browser's. */
export type MenuItem = { label: string; shortcut?: string; disabled?: boolean; run?: () => void; items?: MenuItem[] } | 'separator';

let current: (() => void) | null = null;

export function closeBocetoMenu() { current?.(); }

function build(doc: Document, items: MenuItem[], sub = false): HTMLElement {
  const menu = doc.createElement('div');
  menu.className = sub ? 'bct-menu bct-menu--sub' : 'bct-menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item === 'separator') { const line = doc.createElement('div'); line.className = 'bct-menu__sep'; menu.append(line); continue; }
    // Items are divs: a submenu nests inside its item, and buttons cannot nest.
    const row = doc.createElement('div');
    row.className = `bct-menu__item${item.disabled ? ' is-disabled' : ''}${item.items ? ' has-sub' : ''}`;
    row.setAttribute('role', 'menuitem');
    row.setAttribute('aria-disabled', String(Boolean(item.disabled)));
    row.tabIndex = -1;
    const label = doc.createElement('span'); label.textContent = item.label;
    row.append(label);
    const tail = item.items ? '›' : item.shortcut;
    if (tail) { const key = doc.createElement('span'); key.className = 'bct-menu__key'; key.textContent = tail; row.append(key); }
    if (item.items && !item.disabled) row.append(build(doc, item.items, true));
    row.addEventListener('click', event => {
      event.stopPropagation();
      if (item.disabled || item.items) return;
      closeBocetoMenu();
      item.run?.();
    });
    menu.append(row);
  }
  return menu;
}

export function openBocetoMenu(doc: Document, x: number, y: number, items: MenuItem[]): HTMLElement {
  closeBocetoMenu();
  const root = build(doc, items);
  doc.body.append(root);
  const view = doc.defaultView;
  const width = root.offsetWidth || 220, height = root.offsetHeight || 0;
  root.style.left = `${Math.max(8, Math.min(x, (view?.innerWidth ?? 1280) - width - 8))}px`;
  root.style.top = `${Math.max(8, Math.min(y, (view?.innerHeight ?? 800) - height - 8))}px`;
  const onDown = (event: Event) => { if (!(event.target instanceof Node) || !root.contains(event.target)) close(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
  const close = () => {
    root.remove();
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('wheel', close, true);
    view?.removeEventListener('blur', close);
    if (current === close) current = null;
  };
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('wheel', close, true);
  // A press on the board goes to its frame, which blurs this window.
  view?.addEventListener('blur', close);
  current = close;
  return root;
}
