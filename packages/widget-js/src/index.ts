import { CheckoutEventEnvelope } from "@pagosya/shared-types";

export interface PagosYaOptions {
  /** Origin the checkout iframe is served from. Defaults to pagosYa's hosted checkout. */
  checkoutOrigin?: string;
}

export interface MountOptions {
  clientSecret: string;
  onSuccess?: (result: { paymentIntentId: string }) => void;
  onError?: (error: { paymentIntentId: string; message: string }) => void;
  onProcessing?: (info: { paymentIntentId: string }) => void;
  onCancel?: (info: { paymentIntentId: string }) => void;
}

export interface CheckoutInstance {
  unmount(): void;
}

const DEFAULT_CHECKOUT_ORIGIN = "https://checkout.pagosya.bo";

function isCheckoutEnvelope(data: unknown): data is CheckoutEventEnvelope {
  return typeof data === "object" && data !== null && (data as { source?: string }).source === "pagosya-checkout";
}

/**
 * `PagosYa(publishableKey)` — analogous to Stripe.js. The publishable key is
 * retained client-side only to scope test/live and as a defense-in-depth
 * check; all sensitive work happens inside the checkout iframe, never on the
 * merchant's page. See apps/checkout for the iframe implementation and
 * packages/shared-types/src/checkout-events.ts for the postMessage contract.
 */
function PagosYa(_publishableKey: string, options: PagosYaOptions = {}) {
  const checkoutOrigin = options.checkoutOrigin ?? DEFAULT_CHECKOUT_ORIGIN;

  function mount(selector: string | HTMLElement, mountOptions: MountOptions): CheckoutInstance {
    const target = typeof selector === "string" ? document.querySelector<HTMLElement>(selector) : selector;
    if (!target) throw new Error(`pagosYa: mount target "${selector}" not found`);

    const iframe = document.createElement("iframe");
    iframe.src = `${checkoutOrigin}/?client_secret=${encodeURIComponent(mountOptions.clientSecret)}`;
    iframe.style.border = "none";
    iframe.style.width = "100%";
    iframe.style.minHeight = "320px";
    iframe.setAttribute("title", "pagosYa checkout");
    target.appendChild(iframe);

    function handleMessage(event: MessageEvent) {
      // Anti-spoofing: only trust messages actually delivered from the
      // checkout origin, never derived from envelope contents.
      if (event.origin !== checkoutOrigin) return;
      if (!isCheckoutEnvelope(event.data)) return;

      const { type, payload } = event.data;
      switch (type) {
        case "CHECKOUT_RESIZE": {
          const { height } = payload as { height: number };
          iframe.style.height = `${height}px`;
          break;
        }
        case "PAYMENT_PROCESSING":
          mountOptions.onProcessing?.(payload as { paymentIntentId: string });
          break;
        case "PAYMENT_SUCCEEDED":
          mountOptions.onSuccess?.(payload as { paymentIntentId: string });
          break;
        case "PAYMENT_FAILED": {
          const { paymentIntentId, error } = payload as { paymentIntentId: string; error: { message: string } };
          mountOptions.onError?.({ paymentIntentId, message: error.message });
          break;
        }
        case "PAYMENT_CANCELED":
          mountOptions.onCancel?.(payload as { paymentIntentId: string });
          break;
      }
    }

    window.addEventListener("message", handleMessage);

    return {
      unmount() {
        window.removeEventListener("message", handleMessage);
        iframe.remove();
      },
    };
  }

  return { mount };
}

export default PagosYa;
