import type { StoreSiteDocument, StoreSitePage } from "./site-document";

type Product = { id: string; name: string; tags: string[]; imageUrls: string[] };
const words = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !["page", "para", "con", "los", "las", "del", "una", "the", "and"].includes(word))
  .map((word) => word.length > 4 ? word.replace(/s$/, "") : word);

/** Keep a page's catalog grounded in its declared selection, category or photos. */
export function storefrontPageProductIds(page: StoreSitePage, sections: StoreSiteDocument["sections"], products: Product[], pageIndex: number, explicit: string[] = []): string[] {
  const allowed = new Set(products.map((product) => product.id));
  const selected = [...new Set(explicit.filter((id) => allowed.has(id)))];
  if (selected.length) return selected;
  const pageWords = new Set(words(`${page.id} ${page.slug} ${page.label}`));
  const namedProducts = products.filter((product) => words(`${product.name} ${product.tags.join(" ")}`).some((word) => pageWords.has(word)));
  if (namedProducts.length) return namedProducts.map((product) => product.id);
  const pageMedia = new Set(sections.filter((section) => section.pageId === page.id)
    .flatMap((section) => [...section.mediaUrls, ...section.items.flatMap((item) => item.mediaUrl ? [item.mediaUrl] : [])]));
  const picturedProducts = products.filter((product) => product.imageUrls.some((url) => pageMedia.has(url)));
  if (picturedProducts.length) return picturedProducts.map((product) => product.id);
  return [...new Set(Array.from({ length: Math.min(4, products.length) }, (_, offset) => products[(pageIndex * 3 + offset) % products.length].id))];
}
