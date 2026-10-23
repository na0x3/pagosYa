/** YAPI in design mode (spec 2026-10-22 v2 §6): the tools bar steps back while the merchant looks at the store. */
export function fadeWhenIdle(bar: HTMLElement, opts: { delay?: number; doc?: Document } = {}): () => void {
  const doc = opts.doc ?? bar.ownerDocument;
  const delay = opts.delay ?? 3000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => { bar.classList.remove('is-idle'); clearTimeout(timer); timer = setTimeout(() => bar.classList.add('is-idle'), delay); };
  const events: Array<[EventTarget, string]> = [[bar, 'pointerenter'], [bar, 'pointermove'], [bar, 'focusin'], [doc, 'keydown']];
  for (const [target, name] of events) target.addEventListener(name, wake);
  wake();
  return () => { clearTimeout(timer); bar.classList.remove('is-idle'); for (const [target, name] of events) target.removeEventListener(name, wake); };
}
