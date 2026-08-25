import { CheckoutEventEnvelope, CheckoutEventType } from "@pagosya/shared-types";

let parentOrigin: string | null = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
})();

export function configureParentOrigin(origin: string | null): void {
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && local)) parentOrigin = parsed.origin;
  } catch {
    // Invalid origins are ignored; postToParent will safely emit nothing.
  }
}

export function postToParent<T>(type: CheckoutEventType, payload: T): void {
  if (window.parent === window || !parentOrigin) return; // not embedded or no authenticated recipient
  const envelope: CheckoutEventEnvelope<T> = { source: "pagosya-checkout", type, payload };
  window.parent.postMessage(envelope, parentOrigin);
}

export function observeResize(target: HTMLElement): void {
  const report = () => postToParent("CHECKOUT_RESIZE", { height: target.scrollHeight });
  new ResizeObserver(report).observe(target);
  report();
}
