import { prepareSourceImage } from './source-images';
import { escapeHtml as escape } from './studio-ui';
import './source-photo-picker.css';

/** A saved photo of the store: its assets/ path and a src the dashboard can show (a data: URL of the saved bytes). */
export type PickerPhoto = { path: string; src: string };

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };

/** The store's saved photos as the snapshot lists them; inert data: URLs, never the store's own code. */
export function pickerPhotos(files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): PickerPhoto[] {
  return files.flatMap(file => {
    const path = file.path.replace(/^\//, '');
    const ext = /^assets\/[\w./-]+\.([a-z]+)$/i.exec(path)?.[1]?.toLowerCase();
    const mime = ext ? MIME[ext] : undefined;
    return mime && file.encoding === 'base64' && !/(?:^|\/)(?:icon|favicon|logo-mark)[^/]*$/i.test(path) ? [{ path, src: `data:${mime};base64,${file.content}` }] : [];
  });
}

/** «Cambiar foto» (owner 2026-11-17 «easy picture changing»): every saved photo of the store as a thumbnail, plus «Subir foto
 *  nueva». Choosing one swaps the clicked photo in the code directly — no YAPI call — and closes the picker. */
export function openPhotoPicker(options: { photos: PickerPhoto[]; current: string; choose: (path: string) => Promise<void>; upload: (file: File) => Promise<void> }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-picker';
  dialog.setAttribute('aria-labelledby', 'photo-picker-title');
  const current = options.current.replace(/^\//, '');
  dialog.innerHTML = `<header><h2 id="photo-picker-title">Cambiar foto</h2><button type="button" class="photo-picker__close" data-picker-close aria-label="Cerrar">×</button></header>
    <p class="photo-picker__help">Elige una foto de tu tienda o sube una nueva. Se cambia al instante, sin gastar créditos.</p>
    <label class="photo-picker__upload"><span>Subir foto nueva</span><small>JPG, PNG o WebP</small><input type="file" accept="image/jpeg,image/png,image/webp" data-picker-upload></label>
    <div class="photo-picker__grid" role="list">${options.photos.map(photo => `<button type="button" role="listitem" class="photo-picker__item" data-picker-photo="${escape(photo.path)}"${photo.path === current ? ' aria-current="true"' : ''} aria-label="${photo.path === current ? 'Foto actual' : 'Usar esta foto'}"><img src="${escape(photo.src)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>
    <p class="photo-picker__status" role="status" data-picker-status></p>`;
  document.body.append(dialog);
  const status = dialog.querySelector<HTMLElement>('[data-picker-status]')!;
  let busy = false;
  const close = () => { dialog.close(); dialog.remove(); };
  const run = async (work: () => Promise<void>, message: string) => {
    if (busy) return;
    busy = true; dialog.setAttribute('aria-busy', 'true'); status.textContent = message;
    try { await work(); close(); }
    catch (cause) { status.textContent = cause instanceof Error ? cause.message : 'No pudimos cambiar la foto.'; }
    finally { busy = false; dialog.removeAttribute('aria-busy'); }
  };
  dialog.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target === dialog || target.closest('[data-picker-close]')) { if (!busy) close(); return; }
    const item = target.closest<HTMLElement>('[data-picker-photo]');
    if (item && item.dataset.pickerPhoto !== current) void run(() => options.choose(item.dataset.pickerPhoto!), 'Cambiando la foto…');
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(); });
  dialog.querySelector<HTMLInputElement>('[data-picker-upload]')!.addEventListener('change', event => {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void run(async () => options.upload(await prepareSourceImage(file)), 'Subiendo la foto…');
  });
  dialog.showModal();
  return { close };
}
