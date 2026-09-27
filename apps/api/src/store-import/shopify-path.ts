// Shopify answers /products/Café, /products/cafe%CC%81 and /products/café alike, so an old link may arrive in any of
// those spellings. Both the import (which stores the redirect) and the storefront (which looks it up) reduce a handle
// to one key: NFC, lower case. Letters of any script, digits and single hyphens; anything else is not redirected.
const HANDLE = /^[\p{Ll}\p{Lo}\p{Lm}\p{M}\p{Nd}]+(?:-[\p{Ll}\p{Lo}\p{Lm}\p{M}\p{Nd}]+)*$/u;

export function shopifyRedirectPath(kind: 'products' | 'collections', handle: string): string | null {
  const key = handle.normalize('NFC').toLowerCase();
  return HANDLE.test(key) && key.length <= 120 ? `/${kind}/${key}` : null;
}

/** /products/<h>, /collections/<h> and /collections/<c>/products/<h>, already percent-decoded, to the stored key. */
export function shopifyRequestPath(path: string): string | null {
  const match = /^\/(?:collections\/[^/]+\/)?(products|collections)\/([^/]+)\/?$/i.exec(path);
  return match ? shopifyRedirectPath(match[1].toLowerCase() as 'products' | 'collections', match[2]) : null;
}
