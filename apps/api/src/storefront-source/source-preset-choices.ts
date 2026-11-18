/* Spec 2026-11-10 Merienda: a template style that comes out different for every store. A preset may list `choices` — font pairs,
 * values for some variant parts, and looks per section type — and each store gets one of each, drawn from its id: the same store
 * always gets the same parts (a rebuild does not reshuffle it), different stores spread over the combinations. The model never
 * designs; every value in a list is a part built and checked once (round 2: each style after its own real store; round 3: a long page and frame of its own; round 4: the cover, order and bands too; round 5: café, home, sport, flowers; polish: a footer per style). */

type Block = Readonly<Record<string, unknown>> & { readonly type?: unknown; readonly look?: unknown };
export type PresetChoices = {
  readonly fonts?: readonly string[];
  readonly variants?: Readonly<Record<string, readonly string[]>>;
  readonly looks?: Readonly<Record<string, readonly string[]>>;
  /** Owner 2026-11-10 («always the same»): whole page orders (each a permutation of the layout's indices), sections a store may draw
   *  another type for (the first block of that type; the list holds its own type too), and colour-band patterns by position. */
  readonly orders?: readonly (readonly number[])[];
  readonly swaps?: Readonly<Record<string, readonly string[]>>;
  readonly bands?: readonly Readonly<Record<string, string>>[];
};
type ChoosablePreset = { readonly fonts: string; readonly variants: Readonly<Record<string, string>>; readonly layout?: readonly Block[]; readonly choices?: PresetChoices };

/** FNV-1a over the seed and the list's name, so each list draws on its own, then mixed. */
function pick<T>(seed: string, list: string, values: readonly T[]): T | undefined {
  if (!values.length) return undefined;
  let hash = 0x811c9dc5;
  for (const char of `${seed}:${list}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  // Murmur's finaliser: seeds that differ in a few letters («tienda-uno», «tienda-dos») still land far apart.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0; hash = (hash ^ (hash >>> 13)) >>> 0; hash = Math.imul(hash, 0xc2b2ae35) >>> 0; hash = (hash ^ (hash >>> 16)) >>> 0;
  return values[hash % values.length];
}

export function drawPresetChoices<P extends ChoosablePreset>(preset: P, seed: string): P {
  const choices = preset.choices;
  if (!choices) return preset;
  const variants = { ...preset.variants };
  for (const [part, values] of Object.entries(choices.variants ?? {})) { const value = pick(seed, `v:${part}`, values); if (value) variants[part] = value; }
  // The page's order (a whole permutation, or the template's own), then one swapped section type, then the colour bands by position.
  const order = pick(seed, 'order', choices.orders ?? []);
  const whole = (list: readonly number[]) => !!preset.layout && list.length === preset.layout.length && new Set(list).size === list.length && list.every(at => at >= 0 && at < list.length);
  let blocks = preset.layout && order && whole(order) ? order.map(at => preset.layout![at]) : preset.layout;
  for (const [type, types] of Object.entries(choices.swaps ?? {})) {
    const swap = pick(seed, `swap:${type}`, types);
    const at = blocks?.findIndex(block => block.type === type) ?? -1;
    if (blocks && swap && swap !== type && at >= 0) blocks = blocks.map((block, n) => n === at ? { ...block, type: swap } : block);
  }
  const bands = pick(seed, 'bands', choices.bands ?? []);
  if (blocks && bands && Object.keys(bands).length) blocks = blocks.map((block, n) => bands[String(n)] ? { ...block, band: bands[String(n)] } : block);
  // A section used twice (two colour panels, two story cards) takes the drawn look first and the next one after, so they alternate.
  const seen = new Map<string, number>();
  const layout = blocks?.map(block => {
    const looks = typeof block.type === 'string' ? choices.looks?.[block.type] : undefined;
    const first = looks ? pick(seed, `look:${block.type}`, looks) : undefined;
    if (!looks || first === undefined) return block;
    const repeat = seen.get(block.type as string) ?? 0; seen.set(block.type as string, repeat + 1);
    return { ...block, look: looks[(looks.indexOf(first) + repeat) % looks.length] };
  });
  return { ...preset, fonts: pick(seed, 'fonts', choices.fonts ?? []) ?? preset.fonts, variants, ...(layout ? { layout } : {}) };
}
