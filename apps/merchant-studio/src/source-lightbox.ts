import './source-lightbox.css';

/** Owner 2026-11-16 («when a picture is touched in yapi open it inside the same screen and put a x button to close it»): pictures in
 *  YAPI's conversation (the merchant's attachments, YAPI's screenshots of the store) open in a viewer over the Studio instead of a new
 *  tab. Any link marked data-lightbox opens it; the × button, Escape or a tap outside the picture closes it; arrows step through the
 *  other pictures of the same message. The link keeps its href, so without this script it still opens the picture. */
export function mountLightbox(doc: Document = document): () => void {
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const link = (event.target as Element | null)?.closest?.('a[data-lightbox]') as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    const group = [...(link.closest('[data-lightbox-group]') ?? link.parentElement ?? doc.body).querySelectorAll('a[data-lightbox]')] as HTMLAnchorElement[];
    openLightbox(doc, group.map(item => ({ src: item.href, alt: item.querySelector('img')?.alt ?? '' })), Math.max(0, group.indexOf(link)));
  };
  doc.addEventListener('click', click);
  return () => doc.removeEventListener('click', click);
}

export function openLightbox(doc: Document, pictures: Array<{ src: string; alt: string }>, start = 0): HTMLDialogElement {
  closeLightbox(doc);
  const view = doc.createElement('dialog');
  view.className = 'studio-lightbox';
  view.setAttribute('aria-label', 'Imagen');
  view.innerHTML = '<button type="button" class="studio-lightbox__close" aria-label="Cerrar imagen">×</button><img class="studio-lightbox__img" alt="">'
    + (pictures.length > 1 ? '<button type="button" class="studio-lightbox__step" data-step="-1" aria-label="Imagen anterior">‹</button><button type="button" class="studio-lightbox__step" data-step="1" aria-label="Imagen siguiente">›</button><p class="studio-lightbox__count"></p>' : '');
  const img = view.querySelector('img') as HTMLImageElement, count = view.querySelector('.studio-lightbox__count');
  let at = start;
  const show = () => { img.src = pictures[at].src; img.alt = pictures[at].alt; if (count) count.textContent = `${at + 1} / ${pictures.length}`; };
  const step = (by: number) => { at = (at + by + pictures.length) % pictures.length; show(); };
  view.addEventListener('click', event => {
    const target = event.target as Element;
    if (target.closest('.studio-lightbox__close') || target === view) closeLightbox(doc);
    else { const by = target.closest('[data-step]')?.getAttribute('data-step'); if (by) step(Number(by)); }
  });
  view.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' && pictures.length > 1) step(1);
    if (event.key === 'ArrowLeft' && pictures.length > 1) step(-1);
  });
  // Escape closes the dialog natively; the close event removes it.
  view.addEventListener('close', () => view.remove());
  show();
  doc.body.append(view);
  if (typeof view.showModal === 'function') view.showModal(); else view.setAttribute('open', '');
  (view.querySelector('.studio-lightbox__close') as HTMLButtonElement).focus();
  return view;
}

export function closeLightbox(doc: Document = document): void {
  doc.querySelectorAll('dialog.studio-lightbox').forEach(view => { const dialog = view as HTMLDialogElement; if (dialog.open && typeof dialog.close === 'function') dialog.close(); dialog.remove(); });
}
