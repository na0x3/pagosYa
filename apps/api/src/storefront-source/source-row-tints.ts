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

/** Fuller hero (owner 2026-11-13 «i want the picture fuller in hero», after Amboras's purple and green heroes): a cover whose photo
 *  stands on a plain backdrop takes that backdrop's colour as its own ground, so the photo melts into the page and reads as one big
 *  picture; the words take the ink that reads on it. A busy photo (a scene) keeps the template's ground. */
export const GROUND_COVERS = new Set(['cover-split', 'cover-centered', 'cover-half', 'cover-ribbon', 'cover-mega', 'cover-poster']);
export type CoverGround = { hex: string; uniformity: number; width?: number; height?: number };
export async function withCoverGround<B extends Block>(layout: B[], backdropOf: (photo: string) => Promise<CoverGround | null>): Promise<B[]> {
  const at = layout.findIndex(block => GROUND_COVERS.has(block.type));
  const cover = layout[at];
  const photo = typeof cover?.photo === 'string' ? cover.photo : '';
  if (!cover || !photo) return layout;
  const ground = await backdropOf(photo).catch(() => null);
  // 2026-11-13 live: Lullu's pale grey sweep measured .53, the lemons scene .21 — half the edge in one colour is plain enough with the
  // template's soft edge fade.
  if (!ground || ground.uniformity < .5 || !/^#[0-9a-f]{6}$/i.test(ground.hex)) return layout;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(ground.hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const tone = .2126 * r + .7152 * g + .0722 * b > .32 ? 'light' : 'dark';
  return layout.map((block, index) => index === at ? { ...block, ground: ground.hex.toLowerCase(), groundTone: tone } : block);
}

/** Owner 2026-11-13 («variations of headers from full picture to half picture, or half picture and text with a background that
 *  matches it»): the home's first section becomes one of the normal heroes, chosen by its photo. A product on a plain backdrop: the
 *  half picture on that backdrop's own colour with the words beside it (words | picture or picture | words, by the store); a scene:
 *  the full picture with the words over it when the photo is big enough, else the same half picture on its edge colour. The words and photo stay; the template's own hero look and any products go. */
const HERO_SHAPES = new Set([...GROUND_COVERS, 'cover-full', 'cover-stage', 'cover-duo', 'cover-shoppable', 'hero-split']);
export type HeroGround = CoverGround & { tone: 'light' | 'dark' };
export async function withHeroShape<B extends Block>(layout: B[], seed: string, backdropOf: (photo: string) => Promise<CoverGround | null>): Promise<{ layout: B[]; ground?: HeroGround }> {
  const cover = layout[0];
  const photo = typeof cover?.photo === 'string' ? cover.photo : '';
  if (!cover || !photo || !HERO_SHAPES.has(cover.type)) return { layout };
  const ground = await backdropOf(photo).catch(() => null);
  // Owner 2026-11-13 («the hero with the products there… too overloaded»): a clean hero — no product cards, no shop pins.
  const { look: _look, ground: _ground, groundTone: _tone, products: _products, items: _items, ...words } = cover as Record<string, unknown>;
  // The full picture only for a photo that can fill the screen sharply (landscape, 1600 px or wider); every other photo is shown
  // whole on its own colour (owner 2026-11-13: «full picture with same colour background»), a busy one with rounded corners.
  const big = (ground?.width ?? 0) >= 1600 && (ground?.width ?? 0) > (ground?.height ?? 0);
  const coloured = ground && /^#[0-9a-f]{6}$/i.test(ground.hex);
  if (!coloured || (big && ground.uniformity < .5)) return { layout: [{ ...words, type: big || !coloured ? 'cover-full' : 'cover-split' } as unknown as B, ...layout.slice(1)] };
  const [r, g, b] = [1, 3, 5].map(i => parseInt(ground.hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const tone = .2126 * r + .7152 * g + .0722 * b > .32 ? 'light' as const : 'dark' as const;
  const side = [...seed].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 2 ? 'cover-half' : 'cover-split';
  const hex = ground.hex.toLowerCase();
  return { layout: [{ ...words, type: side, ground: hex, groundTone: tone, ...(ground.uniformity < .5 ? { look: 'framed' } : {}) } as unknown as B, ...layout.slice(1)], ground: { ...ground, hex, tone } };
}

/** Owner 2026-11-13 («i dont like these two pictures together»: Oh Belly's design board — a flat poster on top, a street photo below —
 *  cropped wide behind the newsletter box): a photo made of two parts never fills a background. Its signature is a hard seam with one
 *  side flat (a poster, a colour block). Pure: the photo's per-row and per-column mean colours, top-to-bottom / left-to-right. */
export function compositeSeam(rows: Array<readonly [number, number, number]>, cols: Array<readonly [number, number, number]>): boolean {
  const seam = (lines: Array<readonly [number, number, number]>) => {
    if (lines.length < 8) return false;
    const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let at = Math.floor(lines.length * .2); at < Math.ceil(lines.length * .8); at++) {
      if (dist(lines[at - 1], lines[at]) < 60) continue;
      // Flat: most of that side is one colour (a poster's ground; its big letters are the few rows that differ).
      const flat = (part: Array<readonly [number, number, number]>) => part.length >= 3 && part.filter(line => dist(line, part[0]) < 18).length >= part.length * .7;
      if (flat(lines.slice(0, at)) || flat(lines.slice(at))) return true;
    }
    return false;
  };
  return seam(rows) || seam(cols);
}

/** The sections that spread their photo across a whole band, where a two-part photo shows its seam. */
export const BACKGROUND_PHOTO_SECTIONS = new Set(['newsletter-split', 'cover-full', 'cover-stage', 'cover-video', 'promo-banner', 'closing-photo', 'story-overlay', 'marquee-photo', 'campaign-strip']);
export async function withPlainBackgrounds<B extends Block>(layout: B[], photos: readonly string[], isComposite: (photo: string) => Promise<boolean>): Promise<B[]> {
  const checked = new Map<string, Promise<boolean>>();
  const composite = (photo: string) => { if (!checked.has(photo)) checked.set(photo, isComposite(photo).catch(() => false)); return checked.get(photo)!; };
  const used = new Set(layout.flatMap(block => [block.photo, block.photo2].filter((photo): photo is string => typeof photo === 'string')));
  const out: B[] = [];
  for (const block of layout) {
    const photo = typeof block.photo === 'string' ? block.photo : '';
    if (!BACKGROUND_PHOTO_SECTIONS.has(block.type) || !photo || !(await composite(photo))) { out.push(block); continue; }
    let swap: string | undefined;
    for (const candidate of photos) if (!used.has(candidate) && !(await composite(candidate))) { swap = candidate; break; }
    swap ??= (await Promise.all(photos.map(async candidate => (candidate !== photo && !(await composite(candidate)) ? candidate : '')))).find(Boolean);
    if (swap) used.add(swap);
    out.push(swap ? { ...block, photo: swap } : block);
  }
  return out;
}
