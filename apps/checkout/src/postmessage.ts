import { CheckoutEventEnvelope, CheckoutEventType } from "@pagosya/shared-types";

export function postToParent<T>(type: CheckoutEventType, payload: T): void {
  if (window.parent === window) return; // not embedded (standalone dev preview)
  const envelope: CheckoutEventEnvelope<T> = { source: "pagosya-checkout", type, payload };
  window.parent.postMessage(envelope, "*");
}

export function observeResize(target: HTMLElement): void {
  const report = () => postToParent("CHECKOUT_RESIZE", { height: target.scrollHeight });
  new ResizeObserver(report).observe(target);
  report();
}
