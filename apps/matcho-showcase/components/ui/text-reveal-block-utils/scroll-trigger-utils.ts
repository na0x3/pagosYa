export function observeWindowResize(callback: () => void) {
  let frame = 0;
  const onResize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(callback);
  };
  window.addEventListener("resize", onResize, { passive: true });
  return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", onResize); };
}

export async function waitForScrollerReady(_scroller: Element | Window, eventName?: string) {
  if (!eventName) { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); return; }
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 500);
    window.addEventListener(eventName, () => { window.clearTimeout(timeout); resolve(); }, { once: true });
  });
}
