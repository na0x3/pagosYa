/**
 * The dashboard embeds Studio pages in iframes that grow to their content, so a
 * modal centered in the iframe can sit mostly off screen. While a plugin dialog
 * is open, pin it to the part of the iframe the merchant can actually see and
 * hide the dashboard's YAPI dock so it does not cover the form.
 */
const GAP = 16;

function parentFrame(): { frame: HTMLIFrameElement; host: Window } | null {
  if (window.parent === window) return null;
  try {
    const frame = window.frameElement;
    const host = window.parent;
    return frame?.tagName === 'IFRAME' ? { frame: frame as HTMLIFrameElement, host } : null;
  } catch { return null; } // A cross-origin host cannot be measured; keep the default centering.
}

function pin(dialog: HTMLDialogElement) {
  const embed = parentFrame();
  if (!embed) return () => {};
  const { frame, host } = embed;
  const topbar = host.document.querySelector<HTMLElement>('.topbar');
  const place = () => {
    const rect = frame.getBoundingClientRect();
    const hostTop = Math.max(0, topbar?.getBoundingClientRect().bottom ?? 0);
    const visibleTop = Math.max(0, hostTop - rect.top) + GAP;
    const visibleBottom = Math.min(rect.height, host.innerHeight - rect.top) - GAP;
    dialog.style.position = 'fixed';
    dialog.style.inset = `${Math.round(visibleTop)}px 0 auto 0`;
    dialog.style.margin = '0 auto';
    dialog.style.maxHeight = `${Math.max(240, Math.round(visibleBottom - visibleTop))}px`;
  };
  // Like any modal, the page behind stays still so the wheel scrolls the form.
  const root = host.document.documentElement;
  const previousOverflow = root.style.overflow;
  root.style.overflow = 'hidden';
  place();
  host.document.body.classList.add('studio-dialog-open');
  host.addEventListener('scroll', place, { passive: true });
  host.addEventListener('resize', place);
  return () => {
    host.removeEventListener('scroll', place);
    host.removeEventListener('resize', place);
    root.style.overflow = previousOverflow;
    if (!document.querySelector('dialog.brand-dialog[open]')) host.document.body.classList.remove('studio-dialog-open');
    for (const key of ['position', 'inset', 'margin', 'maxHeight'] as const) dialog.style[key] = '';
  };
}

export function fitEmbeddedDialogs() {
  if (window.parent === window) return;
  const releases = new Map<HTMLDialogElement, () => void>();
  const sync = (dialog: HTMLDialogElement) => {
    // Embedded pages that render the dialog shell inline are not modals.
    // Panels drawn inside the settings window (brand, shipping, domain) sit in its page flow; pinning would pull them out of it.
    if (!dialog.matches('.brand-dialog') || dialog.matches('.retention-embedded') || dialog.closest('.settings-shell__host')) return;
    if (dialog.open && !releases.has(dialog)) releases.set(dialog, pin(dialog));
    else if (!dialog.open && releases.has(dialog)) { releases.get(dialog)!(); releases.delete(dialog); }
  };
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLDialogElement) sync(record.target);
      for (const node of record.removedNodes) if (node instanceof HTMLDialogElement && releases.has(node)) { releases.get(node)!(); releases.delete(node); }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
}
