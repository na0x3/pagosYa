/** Tier 2 of the product-link reader (spec 2026-10-18, decision 1): the page rendered in the guarded browser, returning its HTML
 *  (spike 2026-10-18: some shops fill their JSON-LD only after their scripts run). */
import { GUARDED_USER_AGENT, guardedRequestKind, withGuardedPage } from '../guarded-browser';

export const PRODUCT_SOURCE_USER_AGENT = GUARDED_USER_AGENT;
/** Kept for its spec: the guarded browser's request rules. */
export const productRenderRequestKind = guardedRequestKind;

/** The rendered page's HTML and final address, or null when it did not load. */
export async function renderProductPage(raw: string): Promise<{ url: string; html: string; status: number } | null> {
  return withGuardedPage(raw, { width: 1280, height: 900, timeMs: 30_000 }, async ({ page, initialUrl, status, refused }) => {
    if (refused) return { url: initialUrl, html: '', status: 403 };
    await page.waitForTimeout(4_000);
    return { url: page.url(), html: await page.content(), status };
  });
}
