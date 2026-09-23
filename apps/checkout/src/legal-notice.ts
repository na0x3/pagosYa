/**
 * pagosYa's own buyer terms, shown beside the Pay button. Paying is the
 * acceptance, so the confirm call carries the exact versions shown. While
 * nothing is published the notice is hidden and nothing is sent.
 */
export type BuyerLegal = { termsVersion: string; privacyVersion: string | null };

const SITE_BASE = "https://pagosya.bo";
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

function versionOf(value: unknown): string | null {
  const version = (value as { version?: unknown } | null)?.version;
  return typeof version === "string" && VERSION_PATTERN.test(version) ? version : null;
}

export function parseBuyerLegal(terms: unknown, privacy: unknown): BuyerLegal | null {
  const termsVersion = versionOf(terms);
  return termsVersion ? { termsVersion, privacyVersion: versionOf(privacy) } : null;
}

/** Never throws: an unreachable legal endpoint must not block a payment. */
export async function fetchBuyerLegal(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<BuyerLegal | null> {
  const read = async (slug: string): Promise<unknown> => {
    try {
      const response = await fetchImpl(`${apiBase}/legal/${slug}`);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  const [terms, privacy] = await Promise.all([read("buyer-terms"), read("privacy-policy")]);
  return parseBuyerLegal(terms, privacy);
}

export function legalNoticeHtml(legal: BuyerLegal | null, siteBase = SITE_BASE): string {
  if (!legal) return "";
  const terms = `<a href="${siteBase}/terminos/compradores?version=${encodeURIComponent(legal.termsVersion)}" target="_blank" rel="noopener">Términos</a>`;
  const privacy = legal.privacyVersion
    ? ` y la <a href="${siteBase}/privacidad?version=${encodeURIComponent(legal.privacyVersion)}" target="_blank" rel="noopener">Política de privacidad</a>`
    : "";
  return `<p class="legal-notice">Al pagar aceptas los ${terms}${privacy} de pagosYa.</p>`;
}

export function legalConfirmFields(legal: BuyerLegal | null): { buyerTermsVersion?: string; buyerPrivacyVersion?: string } {
  if (!legal) return {};
  return {
    buyerTermsVersion: legal.termsVersion,
    ...(legal.privacyVersion ? { buyerPrivacyVersion: legal.privacyVersion } : {}),
  };
}
