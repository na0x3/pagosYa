/** Keeps the merchant's own visits out of store audience analytics. */
import { storePreviewMode, storeOwnerMode } from "../preview-mode";

export const MERCHANT_STORE_VIEW_KEY_PREFIX = "pagosya_merchant_store_view_";

/**
 * The editor preview and dashboard's owner-only "open store" link mark this
 * browser as the merchant's device for the store. Later visits from the same
 * browser stay out of audience analytics even when the owner pastes the plain
 * public link into a new tab. Storage failure never makes an editor preview
 * count as a customer view.
 */
export function suppressStoreViewForMerchant(slug: string): boolean {
  const explicitMerchantView = storePreviewMode || storeOwnerMode;
  const key = `${MERCHANT_STORE_VIEW_KEY_PREFIX}${slug}`;
  try {
    if (explicitMerchantView) localStorage.setItem(key, "1");
    return explicitMerchantView || localStorage.getItem(key) === "1";
  } catch {
    return explicitMerchantView;
  }
}
