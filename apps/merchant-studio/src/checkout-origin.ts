/**
 * The checkout origin lives outside `api.ts` so modules that only need the
 * origin — `source-checks.ts` among them — do not have to import the api
 * client that imports them back. `api.ts` re-exports it, so the constant's
 * public name is unchanged.
 */
function configuredCheckoutOrigin(): string {
  if (import.meta.env.VITE_CHECKOUT_ORIGIN) return import.meta.env.VITE_CHECKOUT_ORIGIN;
  // Embedded Studio and its browser preview share the dashboard's connection settings.
  try {
    const saved = sessionStorage.getItem('pagosya_checkout_origin');
    if (saved) return saved;
  } catch { /* Storage may be unavailable in a restricted preview. */ }
  return 'http://localhost:5175'; // Port used by the repository's pnpm dev stack.
}
export const CHECKOUT_ORIGIN: string = configuredCheckoutOrigin();
