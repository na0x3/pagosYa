/* Spec 2026-11-10 Merienda: Bake Me paints each flavour's row in its own colour. Here the colour comes from the product's own photo
 * (owner rule: colour from the brand or the product on screen, never invented): the photo's most common clear colour, leaving out
 * white, black and grey backgrounds. The row shows a light mix of it (CSS), so any colour stays calm. */

type Block = { type: string; products?: string[]; items?: Array<{ title: string; text?: string; value?: string }> } & Record<string, unknown>;

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

/** The photo's main clear colour from raw pixels (a small resize of it): pixels binned by hue and lightness, the fullest bin's
 *  average; null when under a tenth of the photo has any colour. */
export function photoTint(data: Buffer, channels: number): string | null {
  const bins = new Map<string, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let at = 0; at + 2 < data.length; at += channels) {
    const r = data[at], g = data[at + 1], b = data[at + 2];
    total++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 40 || min > 225 || max - min < 40) continue;
    const hue = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    const key = `${Math.floor(hue * 2)}:${Math.floor(max / 64)}`;
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bin.r += r; bin.g += g; bin.b += b; bin.n++;
    bins.set(key, bin);
  }
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < total * 0.1) return null;
  return `#${hex(best.r / best.n)}${hex(best.g / best.n)}${hex(best.b / best.n)}`;
}

/** Each products-rows block gets one item per product (its line kept) with the product's colour in `value`; a product without a
 *  clear colour, or photos that cannot be read, keeps the theme's own tints. */
export async function withRowTints<B extends Block>(layout: B[], tintOf: (name: string) => Promise<string | null>): Promise<B[]> {
  return Promise.all(layout.map(async block => {
    if (block.type !== 'products-rows' || !block.products?.length) return block;
    const items = await Promise.all(block.products.map(async title => {
      const line = block.items?.find(item => item.title === title)?.text;
      const tint = await tintOf(title).catch(() => null);
      return { title, ...(line ? { text: line } : {}), ...(tint ? { value: tint } : {}) };
    }));
    return { ...block, items };
  }));
}
