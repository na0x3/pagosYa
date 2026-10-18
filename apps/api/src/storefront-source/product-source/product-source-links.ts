/** Which link in the merchant's message is a product to sell (spec 2026-10-18 product link store, decisions 2 and 4). Pure. */
import { websiteCopyAsked } from '../website-copy/copy-intent';

const URLS = /https?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;
/** Shops whose links are products whatever their path. */
const MARKETPLACES = /(^|\.)(alibaba\.com|aliexpress\.[a-z.]+|1688\.com|temu\.com|amazon\.[a-z.]+|amzn\.to|a\.co|ebay\.[a-z.]+|mercadolibre\.[a-z.]+|mercadolivre\.com\.br|shein\.com|take\.app|etsy\.com|walmart\.com|dhgate\.com|made-in-china\.com)$/i;
/** A product page's path on any other shop: Shopify, WooCommerce, Tiendanube, Wix, VTEX and most others. */
const PRODUCT_PATH = /\/(?:products?|producto|productos|item|items|p|dp|gp\/product|tienda\/[^/]+|shop\/[^/]+)\/[^/?#]+|-g-\d+\.html|\/MLA-?\d+|\/MLB-?\d+|\/MCO-?\d+|\/MLM-?\d+/i;
/** Pages that need a login: never fetched, YAPI asks for screenshots and photos (decision 2). */
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|threads\.net)$/i;
/** «como esta / estilo / inspírate»: another site's look, which is sub-project B, not a product. */
const LOOK_WORDS = /(?<!\p{L})(como (?:esta|este|esa|ese)|igual (?:a|que)|estilo|insp[ií]r\w*|parecid[oa]|similar|referencia|like this|copia(?:r)? (?:la|su|esta) (?:estructura|web|p[aá]gina|dise[nñ]o))(?!\p{L})/iu;
/** Selling words win over look words: «quiero vender este producto como en esta página». */
const SELL_WORDS = /(?<!\p{L})(vend\w*|producto|art[ií]culo|importo|importar|revend\w*|dropshipping|proveedor)(?!\p{L})/iu;

export type ProductLink = { url: string; host: string; social: boolean };

function hostOf(raw: string): string | null {
  try { return new URL(/^www\./i.test(raw) ? `https://${raw}` : raw).hostname.toLowerCase(); } catch { return null; }
}

/** The one product link in this message, or null. Only the merchant's own words count: the Studio's wrapper text and earlier
 *  turns never do. */
export function productLinkIn(words: string): ProductLink | null {
  const text = words.replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '');
  const withoutUrls = text.replace(URLS, ' ');
  // Another site's look or a copy of it (sub-project B), unless the merchant says they sell what the link shows.
  if ((LOOK_WORDS.test(withoutUrls) || websiteCopyAsked(withoutUrls)) && !SELL_WORDS.test(withoutUrls)) return null;
  for (const match of text.match(URLS) || []) {
    const raw = match.replace(/[.,;!?\])}]+$/, '');
    const host = hostOf(raw);
    if (!host || raw.length > 2000) continue;
    const url = /^www\./i.test(raw) ? `https://${raw}` : raw;
    if (SOCIAL.test(host)) return { url, host, social: true };
    const path = new URL(url).pathname;
    if (/\.(?:png|jpe?g|webp|gif|svg|pdf|mp4|zip)$/i.test(path)) continue;
    if (MARKETPLACES.test(host) || PRODUCT_PATH.test(path)) return { url, host, social: false };
  }
  return null;
}

/** The site's name as the merchant knows it, for YAPI's replies. */
export function productSiteName(host: string): string {
  const known: Array<[RegExp, string]> = [[/alibaba\./, 'Alibaba'], [/aliexpress\./, 'AliExpress'], [/temu\./, 'Temu'], [/amazon\.|amzn\.to|^a\.co$/, 'Amazon'],
    [/mercadoli(?:bre|vre)\./, 'Mercado Libre'], [/facebook\.|fb\./, 'Facebook'], [/instagram\./, 'Instagram'], [/tiktok\./, 'TikTok'], [/shein\./, 'Shein'], [/ebay\./, 'eBay'], [/take\.app/, 'Take App']];
  return known.find(([pattern]) => pattern.test(host))?.[1] ?? host.replace(/^www\./, '');
}
