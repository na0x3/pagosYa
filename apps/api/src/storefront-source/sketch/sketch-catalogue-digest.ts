/** What the page's writer is allowed to know about the catalogue. The prompt used to carry
 * `data.items.map(item => item.name).slice(0, 30)` and nothing else, so every band that was not the catalog was
 * written from the brief alone and came out as virtue copy about nothing. A digest is a sample with enough
 * detail to write a true sentence about, plus aggregates that stay true for a catalogue too long to list.
 * It reads `data.items` and `data.categories` as sourceStoreConfigData shapes them, and it is total: the rows are
 * database JSON and the caller may hand it anything. */
export type DigestItem = {
  name: string; price?: string; discountPercent?: number; soldOut?: boolean;
  description?: string; category?: string; tags?: string[];
  /** "Tamaño: Chica, Grande": what distinguishes one variant of the product from another. */
  options?: string[];
  /** The merchant's own spec rows and highlights, which are the most specific true claims about a product. */
  facts?: string[];
};
export type CatalogueDigest = { items: DigestItem[]; totals: { count: number; priceLow?: string; priceHigh?: string; categories: string[] } };

const asRecord = (value: unknown): Record<string, unknown> | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max: number): string | undefined => {
  const out = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return out ? out.slice(0, max) : undefined;
};
const texts = (value: unknown, max: number, cap: number) => asArray(value).map(entry => text(entry, max)).filter((entry): entry is string => !!entry).slice(0, cap);
/** `amount` is an integer in minor units (cents), which is what the checkout divides by 100. */
const cents = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined);
const money = (amount: number, currency: string) => `${(amount / 100).toFixed(2)} ${currency}`;
const currencyOf = (record: Record<string, unknown>) => text(record.currency, 3)?.toUpperCase() ?? 'BOB';

function optionsOf(variants: unknown): string[] | undefined {
  const groups = new Map<string, Set<string>>();
  for (const variant of asArray(variants).slice(0, 256)) {
    for (const option of asArray(asRecord(variant)?.options)) {
      const name = text(asRecord(option)?.name, 24), value = text(asRecord(option)?.value, 24);
      if (name && value) groups.set(name, (groups.get(name) ?? new Set()).add(value));
    }
  }
  const out = [...groups].slice(0, 3).map(([name, values]) => `${name}: ${[...values].slice(0, 6).join(', ')}`);
  return out.length ? out : undefined;
}

function factsOf(item: Record<string, unknown>): string[] | undefined {
  const specs = asArray(item.specifications).map(row => { const r = asRecord(row); const label = text(r?.label, 24), value = text(r?.value, 40); return label && value ? `${label}: ${value}` : undefined; });
  const highlights = asArray(item.highlights).map(row => { const r = asRecord(row); const label = text(r?.label, 24); const detail = text(r?.detail, 40); return label ? (detail ? `${label}: ${detail}` : label) : undefined; });
  const out = [...specs, ...highlights].filter((fact): fact is string => !!fact).slice(0, 4);
  return out.length ? out : undefined;
}

/** Round-robin across categories, so a catalogue sorted by category does not spend the whole sample on its first
 * one and a headline written from the sample can be true about all of it. */
function spread<T>(buckets: T[][], limit: number): T[] {
  const out: T[] = [];
  for (let round = 0; out.length < limit; round++) {
    let took = false;
    for (const bucket of buckets) {
      if (round < bucket.length && out.length < limit) { out.push(bucket[round]); took = true; }
    }
    if (!took) break;
  }
  return out;
}

export function catalogueDigest(rawItems: unknown, rawCategories: unknown = [], limit = 20): CatalogueDigest {
  const names = new Map<string, string>();
  for (const category of asArray(rawCategories)) {
    const record = asRecord(category), id = text(record?.id, 80), name = text(record?.name, 40);
    if (id && name) names.set(id, name);
  }
  // A row with no name is not a product anyone could write about, so it is not counted as one either.
  const rows = asArray(rawItems).map(asRecord).filter((row): row is Record<string, unknown> => !!row && !!text(row.name, 80));

  const categoryOf = (row: Record<string, unknown>) => (typeof row.categoryId === 'string' ? names.get(row.categoryId) : undefined);
  const byCategory = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) byCategory.set(categoryOf(row) ?? '', [...(byCategory.get(categoryOf(row) ?? '') ?? []), row]);
  const ranked = [...byCategory].sort((a, b) => b[1].length - a[1].length);

  // Prices only compare within one currency; the commonest one stands for the catalogue.
  const priced = rows.flatMap(row => { const amount = cents(row.amount); return amount === undefined ? [] : [{ amount, currency: currencyOf(row) }]; });
  const tally = new Map<string, number>();
  for (const { currency } of priced) tally.set(currency, (tally.get(currency) ?? 0) + 1);
  const main = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  const amounts = priced.filter(({ currency }) => currency === main).map(({ amount }) => amount);

  const sample = spread(ranked.map(([, bucket]) => bucket), Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 20)));
  return {
    items: sample.map(row => {
      const amount = cents(row.amount);
      const discount = typeof row.discountPercent === 'number' && row.discountPercent > 0 && row.discountPercent <= 100 ? Math.round(row.discountPercent) : undefined;
      const tags = texts(row.tags, 24, 5);
      return {
        name: text(row.name, 80)!,
        ...(amount !== undefined ? { price: money(amount, currencyOf(row)) } : {}),
        ...(discount ? { discountPercent: discount } : {}),
        ...(row.stock === 0 ? { soldOut: true } : {}),
        ...(text(row.description, 160) ? { description: text(row.description, 160) } : {}),
        ...(categoryOf(row) ? { category: categoryOf(row) } : {}),
        ...(tags.length ? { tags } : {}),
        ...(optionsOf(row.variants) ? { options: optionsOf(row.variants) } : {}),
        ...(factsOf(row) ? { facts: factsOf(row) } : {}),
      };
    }),
    totals: {
      count: rows.length,
      ...(main && amounts.length ? { priceLow: money(Math.min(...amounts), main), priceHigh: money(Math.max(...amounts), main) } : {}),
      categories: ranked.map(([name]) => name).filter(Boolean).slice(0, 12),
    },
  };
}
