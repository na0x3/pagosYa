// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { closeLightbox, mountLightbox } from './source-lightbox';

let unmount = () => {};
afterEach(() => { unmount(); closeLightbox(document); document.body.innerHTML = ''; });

it('owner 2026-11-16: a picture in the conversation opens over the Studio with an × to close it, never a new page', () => {
  unmount = mountLightbox(document);
  document.body.innerHTML = '<div data-lightbox-group><a href="https://x.test/a.jpg" data-lightbox><img alt="A"></a><a href="https://x.test/b.jpg" data-lightbox><img alt="B"></a></div>';
  const link = document.querySelectorAll('a[data-lightbox]')[1] as HTMLAnchorElement;
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  const view = document.querySelector('dialog.studio-lightbox') as HTMLDialogElement;
  expect((view.querySelector('.studio-lightbox__img') as HTMLImageElement).src).toBe('https://x.test/b.jpg');
  expect(view.querySelector('.studio-lightbox__count')?.textContent).toBe('2 / 2');
  (view.querySelector('[data-step="1"]') as HTMLButtonElement).click();
  expect((view.querySelector('.studio-lightbox__img') as HTMLImageElement).src).toBe('https://x.test/a.jpg');
  (view.querySelector('.studio-lightbox__close') as HTMLButtonElement).click();
  expect(document.querySelector('dialog.studio-lightbox')).toBeNull();
});
