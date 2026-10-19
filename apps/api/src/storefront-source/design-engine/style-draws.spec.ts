import { photoPalettes, washedPalette } from './photo-palette';
import { PREMIUM_FONTS } from './style-draws';
import { SHOWN_CARDS_TIMEOUT_MS, SIGNATURE_DEVICES, styleDraws, styleSlotDirection, withinOr } from './style-draws';
import { FRAME_CATALOGUE, FRAME_DRAW_FILE, PALETTES, frameForRun, parseFrameDraw, type FrameAvailable } from './frame-draw';
import { COMMERCE_LEAN } from './commerce-draw';
import { PLAYBOOK, playbookDirection } from './playbook';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rich: FrameAvailable = { photos: 9, products: 9, facts: true };
const bare: FrameAvailable = { photos: 0, products: 0, facts: false };
const base = { kind: 'cafe-food' as const, brandColours: false, category: 'cafe-food', previous: [], recent: [], available: rich, request: 'Mi cafetería' };
const boldIds = (part: 'header' | 'hero') => FRAME_CATALOGUE[part].filter(entry => entry.bold).map(entry => entry.id);

const families = PLAYBOOK['cafe-food'].families;

it('returns exactly two slots: a calm one on the least-used family, then a bold one on the other family', () => {
  const slots = styleDraws({ ...base, random: seeded(3) });
  expect(slots.map(slot => slot.mode)).toEqual(['calm', 'bold']);
  expect(slots.map(slot => slot.slot)).toEqual([0, 1]);
  expect(slots[0].family.id).not.toBe(slots[1].family.id);
  // The calm card takes the family the latest same-kind stores used least, the bold card the other one.
  for (let seed = 1; seed < 10; seed++) {
    const [calm, bold] = styleDraws({ ...base, recentFamilies: [families[0].id, families[0].id, families[1].id], random: seeded(seed) });
    expect([calm.family.id, bold.family.id]).toEqual([families[1].id, families[0].id]);
    const [calm2, bold2] = styleDraws({ ...base, recentFamilies: [families[1].id], random: seeded(seed) });
    expect([calm2.family.id, bold2.family.id]).toEqual([families[0].id, families[1].id]);
  }
});

it('keeps the calm slot on its family palettes and gives the bold slot the full colour catalogue and bold parts', () => {
  for (let seed = 1; seed < 30; seed++) {
    const [calm, bold] = styleDraws({ ...base, random: seeded(seed) });
    expect(calm.family.palettes.map(p => p.id)).toContain(calm.palette!.id);
    expect(PALETTES.map(p => p.id)).toContain(bold.palette!.id);
    expect(boldIds('header')).toContain(bold.draw.header);
    expect(boldIds('hero')).toContain(bold.draw.hero);
  }
});

it('never gives the bold card the calm card\'s hero or palette', () => {
  for (let seed = 1; seed < 40; seed++) {
    const slots = styleDraws({ ...base, random: seeded(seed) });
    expect(new Set(slots.map(slot => slot.draw.hero)).size).toBe(2);
    expect(new Set(slots.map(slot => slot.palette!.id)).size).toBe(2);
  }
});

it('avoids the hero the store itself used last time', () => {
  const previous = [{ path: 'frame-draw.json', content: JSON.stringify({ hero: 'full-bleed', header: 'stacked', cart: 'word-count', footer: 'directory' }) }];
  for (let seed = 1; seed < 20; seed++) expect(styleDraws({ ...base, previous, random: seeded(seed) }).map(slot => slot.draw.hero)).not.toContain('full-bleed');
});

it('still returns two slots, calm then bold, for a store with no photos, products or facts', () => {
  const slots = styleDraws({ ...base, available: bare, random: seeded(5) });
  expect(slots.map(slot => slot.mode)).toEqual(['calm', 'bold']);
  for (const slot of slots) expect(['type-only', 'catalog-lead', 'illustration']).toContain(slot.draw.hero);
});

it('keeps confirmed brand colours: no drawn palette on any card', () => {
  for (const slot of styleDraws({ ...base, brandColours: true, random: seeded(2) })) expect(slot.palette).toBeUndefined();
});

it('writes a slot direction that names the slot, its mode and its drawn frame', () => {
  const [calm, bold] = styleDraws({ ...base, random: seeded(9) });
  const playbook = playbookDirection(PLAYBOOK['cafe-food'], bold.family, { bold: true, palette: bold.palette, freeFonts: true });
  expect(styleSlotDirection(calm, 'PLAYBOOK: calm')).toMatch(/^CONCEPT 1 of 2 \(calm/);
  expect(styleSlotDirection(bold, playbook)).toMatch(/^CONCEPT 2 of 2 \(bold/);
  expect(styleSlotDirection(bold, playbook)).toContain(bold.paragraph);
  // A lane plans this slot alone: same frame and playbook, but its one concept is concepts[0].
  expect(styleSlotDirection(bold, playbook, { lane: true })).toMatch(/^CONCEPT 2 of 2 \(bold: [^)]*\)\. Build the one concept you return on exactly this; the other card is planned separately:/);
  expect(styleSlotDirection(bold, playbook, { lane: true })).not.toContain('concepts[1]');
  expect(styleSlotDirection(bold, playbook, { lane: true })).toContain(bold.paragraph);
  expect(playbook).toContain('fonts free from the self-hosted catalogue');
  expect(playbook).not.toContain(`${bold.family.fonts[0].display} + `);
});

describe('variety across proposals (2026-10-11: "always the same two templates")', () => {
  const calmIds = (part: 'header' | 'hero') => FRAME_CATALOGUE[part].filter(entry => !entry.bold).map(entry => entry.id);
  /** The dev-DB situation: every calm header but info-bar and every calm hero but illustration already built once, so
   *  the old least-used rule landed on info-bar + illustration every time. */
  const stable = [
    ...calmIds('header').filter(id => id !== 'info-bar').map(header => ({ header, kind: 'cafe-food', family: 'cafe-shop' })),
    ...calmIds('hero').filter(id => id !== 'illustration').map(hero => ({ hero, kind: 'cafe-food', family: 'cafe-shop' })),
  ];
  const combo = (slot: { draw: { header?: string; hero?: string } }) => `${slot.draw.header}/${slot.draw.hero}`;

  it('avoids a calm card this merchant was shown, and a shown card joins the history like a built one', () => {
    const [first] = styleDraws({ ...base, random: seeded(4) });
    const shown = [{ kind: 'cafe-food', mode: 'calm' as const, draw: first.draw, mine: true }];
    for (let seed = 1; seed < 40; seed++) {
      const [calm] = styleDraws({ ...base, shown, random: seeded(seed) });
      expect(calm.draw.header).not.toBe(first.draw.header);
      expect(calm.draw.hero).not.toBe(first.draw.hero);
      // The family the merchant just saw on the calm card counts too: the next calm card takes the other one.
      expect(calm.family.id).not.toBe(first.family.id);
    }
    // Another store's shown card counts once, like a built store: shown twice, it is past the spread.
    const others = [{ kind: 'cafe-food', mode: 'calm' as const, draw: { header: 'info-bar' } }, { kind: 'cafe-food', mode: 'calm' as const, draw: { header: 'info-bar' } }];
    for (let seed = 1; seed < 40; seed++) expect(styleDraws({ ...base, shown: others, random: seeded(seed) })[0].draw.header).not.toBe('info-bar');
    expect(new Set(Array.from({ length: 40 }, (_, seed) => styleDraws({ ...base, shown: others.slice(0, 1), random: seeded(seed + 1) })[0].draw.header))).toContain('info-bar');
  });

  it('gives the calm slot at least three header/hero combinations over 30 seeds with a fixed history', () => {
    const combos = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) combos.add(combo(styleDraws({ ...base, recent: stable, random: seeded(seed) })[0]));
    expect(combos.size).toBeGreaterThanOrEqual(3);
    // The same history with the three identical shown calm cards of the dev DB: still varied, never that card again.
    const repeated = Array.from({ length: 3 }, () => ({ kind: 'cafe-food', mode: 'calm' as const, draw: { header: 'info-bar', hero: 'illustration', footer: 'directory', family: 'cafe-shop', kind: 'cafe-food' }, display: 'outfit', mine: true }));
    const after = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const [calm] = styleDraws({ ...base, recent: stable, shown: repeated, random: seeded(seed) });
      after.add(combo(calm));
      expect(combo(calm)).not.toBe('info-bar/illustration');
    }
    expect(after.size).toBeGreaterThanOrEqual(3);
  });

  it('rotates the calm card\'s font pairs and tells the planner which display fonts to avoid', () => {
    const shown = Array.from({ length: 2 }, () => ({ kind: 'cafe-food', mode: 'calm' as const, draw: { family: 'cafe-editorial' }, display: 'outfit', mine: true }));
    const displays = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const [calm] = styleDraws({ ...base, shown, recentFamilies: ['cafe-editorial', 'cafe-editorial'], random: seeded(seed) });
      expect(calm.family.id).toBe('cafe-shop');
      expect(calm.fonts!.display).not.toBe('outfit');
      expect(calm.family.fonts.map(pair => pair.display)).toContain(calm.fonts!.display);
      displays.add(calm.fonts!.display);
      const direction = styleSlotDirection(calm, playbookDirection(PLAYBOOK['cafe-food'], calm.family, { fonts: calm.fonts }), { lane: true });
      expect(direction).toContain('avoid these display fonts: outfit');
      expect(direction).toContain(`display ${calm.fonts!.display} with text ${calm.fonts!.text}`);
      // The playbook names the drawn pair alone, so the planner cannot fall back to the family's first font.
      expect(direction).toContain(`fonts ${calm.fonts!.display} + ${calm.fonts!.text},`);
    }
    // cafe-shop's pairs minus the outfit one just shown (2026-10-19: two premium pairs joined the family).
    // Only the family's premium pairs are drawn (2026-10-19), and they rotate.
    const premium = PLAYBOOK['cafe-food'].families.find(family => family.id === 'cafe-shop')!.fonts.filter(pair => PREMIUM_FONTS.has(pair.display) || PREMIUM_FONTS.has(pair.text)).map(pair => pair.display);
    expect([...displays].sort()).toEqual([...new Set(premium)].sort());
    // Without history the pair still rotates across seeds.
    const fresh = new Set(Array.from({ length: 30 }, (_, seed) => styleDraws({ ...base, recentFamilies: ['cafe-editorial'], random: seeded(seed + 1) })[0].fonts!.display));
    expect(fresh.size).toBeGreaterThanOrEqual(2);
  });

  it('draws a signature device for the bold card only, rotating and avoiding recent devices', () => {
    const all = Object.keys(SIGNATURE_DEVICES);
    const fresh = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const [calm, bold] = styleDraws({ ...base, random: seeded(seed) });
      expect(calm.device).toBeUndefined();
      expect(all).toContain(bold.device);
      fresh.add(bold.device!);
    }
    expect(fresh.size).toBeGreaterThanOrEqual(4);
    const recent = ['stamp', 'marquee', 'stickers', 'numbers', 'ticket'].map(device => ({ kind: 'cafe-food', mode: 'bold' as const, draw: {}, device }));
    for (let seed = 1; seed <= 30; seed++) expect(['torn-edge', 'outline-wordmark']).toContain(styleDraws({ ...base, shown: recent, random: seeded(seed) })[1].device);
    // Without photos or facts: never a photo device, never invented numbers.
    for (let seed = 1; seed <= 30; seed++) expect(['stamp', 'marquee', 'stickers', 'ticket', 'outline-wordmark']).toContain(styleDraws({ ...base, available: bare, random: seeded(seed) })[1].device);
    // The device rides on the slot (saved with the proposal) and in the bold lane's direction.
    const [, bold] = styleDraws({ ...base, random: seeded(3) });
    expect(styleSlotDirection(bold, 'PLAYBOOK', { lane: true })).toContain(`Signature device of this card (its one memorable move, drawn for it): ${SIGNATURE_DEVICES[bold.device!].label}`);
    expect(JSON.parse(JSON.stringify(bold)).device).toBe(bold.device);
  });

  it('chains: each proposal\'s shown bold device is avoided by the next', () => {
    const shown: Array<{ kind: string; mode: 'bold'; draw: Record<string, string>; device: string; mine: boolean }> = [];
    const devices: string[] = [];
    // Polaroids is a photo group: in rotation only when the merchant asked for a gallery (2026-10-15), so seven otherwise.
    for (let round = 0; round < 7; round++) {
      const [, bold] = styleDraws({ ...base, shown, briefNumbers: 2, random: seeded(round + 11) });
      devices.push(bold.device!);
      shown.unshift({ kind: 'cafe-food', mode: 'bold', draw: {}, device: bold.device!, mine: true });
    }
    expect(new Set(devices).size).toBe(7);
    expect(devices).not.toContain('polaroids');
  });
});

it('draws the numbers device only when the brief gives at least two real numbers', () => {
  for (const briefNumbers of [undefined, 0, 1]) for (let seed = 1; seed <= 40; seed++) expect(styleDraws({ ...base, briefNumbers, random: seeded(seed) })[1].device).not.toBe('numbers');
  const recent = ['stamp', 'marquee', 'stickers', 'ticket', 'torn-edge', 'polaroids', 'outline-wordmark'].map(device => ({ kind: 'cafe-food', mode: 'bold' as const, draw: {}, device }));
  expect(styleDraws({ ...base, shown: recent, briefNumbers: 2, random: seeded(1) })[1].device).toBe('numbers');
  expect(styleDraws({ ...base, shown: recent, briefNumbers: 2, available: { ...base.available, facts: false }, random: seeded(1) })[1].device).not.toBe('numbers');
});

it('bounds the shown-cards lookup: a slow, failing or throwing lookup falls back to no history', async () => {
  jest.useFakeTimers();
  try {
    const slow = withinOr(() => new Promise<string[]>(() => undefined), SHOWN_CARDS_TIMEOUT_MS, ['fallback']);
    await jest.advanceTimersByTimeAsync(SHOWN_CARDS_TIMEOUT_MS - 1);
    let settled = false;
    void slow.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await slow).toEqual(['fallback']);
  } finally { jest.useRealTimers(); }
  expect(SHOWN_CARDS_TIMEOUT_MS).toBe(1500);
  expect(await withinOr(async () => ['fast'], 1500, [] as string[])).toEqual(['fast']);
  expect(await withinOr(async () => { throw new Error('db'); }, 1500, [] as string[])).toEqual([]);
  expect(await withinOr(() => { throw new Error('sync'); }, 1500, [] as string[])).toEqual([]);
});

describe('style cards draw the commerce surfaces', () => {
  it('each slot draws its mode\'s commerce, saved in its frame-draw file and draw', () => {
    for (let seed = 1; seed < 20; seed++) for (const slot of styleDraws({ ...base, random: seeded(seed) })) {
      expect(slot.commerce).toBeDefined();
      for (const [part, id] of Object.entries(slot.commerce!)) expect(COMMERCE_LEAN[slot.mode][part as keyof typeof COMMERCE_LEAN.calm]).toContain(id);
      expect(parseFrameDraw(slot.file.content)).toMatchObject(slot.commerce!);
      expect(slot.draw).toMatchObject(slot.commerce!);
    }
  });
  it('carries the kind\'s cart word into the slot and its paragraph', () => {
    const [calm] = styleDraws({ ...base, kind: 'clothing', random: seeded(2) });
    expect(calm.cartWord).toBe('Tu bolsa');
    expect(calm.paragraph).toContain('«Tu bolsa»');
  });
  it('avoids the commerce parts recent shown cards used', () => {
    const shown = Array.from({ length: 3 }, () => ({ kind: 'cafe-food', mode: 'calm' as const, draw: { account: 'card', checkout: 'columns', fields: 'boxed', cartSurface: 'drawer', added: 'toast' } as any }));
    for (let seed = 1; seed < 10; seed++) {
      const [calm] = styleDraws({ ...base, shown, random: seeded(seed) });
      expect(calm.commerce).toEqual({ account: 'minimal', checkout: 'steps', fields: 'underline', cartSurface: 'drawer', added: 'inline' });
    }
  });
});

describe('frameForRun keeps a saved commerce draw on an edit', () => {
  const run = { enabled: true, designEnabled: true, recent: [], available: rich, request: '' };
  it('returns the saved commerce, not fresh, with the kind\'s cart word', () => {
    const previous = [{ path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'stacked', kind: 'clothing', account: 'split', checkout: 'ticket', fields: 'pill', cartSurface: 'sheet', added: 'stamp' }) }];
    expect(frameForRun({ ...run, fresh: false, previous }).commerce).toEqual({ draw: { account: 'split', checkout: 'ticket', fields: 'pill', cartSurface: 'sheet', added: 'stamp' }, fresh: false, cartWord: 'Tu bolsa' });
    expect(frameForRun({ ...run, designEnabled: false, fresh: false, previous }).commerce?.draw.checkout).toBe('ticket');
  });
  it('returns no commerce for a saved draw without it; a fresh ordinary run draws its own (2026-10-15)', () => {
    const previous = [{ path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'stacked' }) }];
    expect(frameForRun({ ...run, fresh: false, previous }).commerce).toBeUndefined();
    expect(frameForRun({ ...run, fresh: true, previous: [] }).commerce).toMatchObject({ fresh: true, draw: { checkout: expect.any(String) } });
  });
});

// Owner 2026-10-18, after comparing today's POKEATE redo with the Sep-8 one: «do whatever you think will bring me back to
// those design choices by yapi … colors before had more to do and sections fit in perfectly». The bold card is YAPI's own.
describe('the authored bold card (authoredBold)', () => {
  const photoPalettes = { calm: PALETTES[0], bold: PALETTES[1] };
  it('draws only the platform-owned frame for the bold card: header and cart, no hero, footer, palette, design, device', () => {
    for (const seed of [1, 7, 42]) {
      const [calm, bold] = styleDraws({ ...base, photoPalettes, authoredBold: true, random: seeded(seed) });
      expect(bold).toMatchObject({ mode: 'bold', authored: true });
      expect(bold.palette).toBeUndefined();
      expect(bold.device).toBeUndefined();
      expect(bold.dna).toBeUndefined();
      expect(boldIds('header')).toContain(bold.draw.header);
      for (const part of ['hero', 'footer', 'palette', 'angle', 'structure', 'photos', 'button', 'hover', 'trust']) expect(bold.draw).not.toHaveProperty(part);
      expect(JSON.parse(bold.file.content)).not.toHaveProperty('hero');
      // The calm card is unchanged: the professional option keeps its draw and the photos' colours (light or washed, 2026-10-18).
      expect(calm.authored).toBeUndefined();
      expect([PALETTES[0].id, washedPalette(PALETTES[0]).id]).toContain(calm.palette!.id);
      expect(calm.draw.hero).toBeTruthy();
    }
  });
  it('hands YAPI the whole design in the bold card\'s direction', () => {
    const [, bold] = styleDraws({ ...base, authoredBold: true, random: seeded(3) });
    const direction = styleSlotDirection(bold, '', { lane: true });
    expect(direction).toMatch(/^CONCEPT 2 of 2 \(bold: YAPI's own design/);
    expect(direction).toContain("YAPI'S OWN DESIGN");
    expect(direction).toMatch(/business's own world/);
    expect(direction).not.toContain('Signature device');
    expect(direction).not.toMatch(/^- Hero:/m);
  });
  it('is off unless asked, so the drawn bold card is unchanged', () => {
    const [, bold] = styleDraws({ ...base, random: seeded(3) });
    expect(bold.authored).toBeUndefined();
    expect(bold.device).toBeDefined();
  });
});

describe('the calm card takes turns between the light and the washed photo page (2026-10-18)', () => {
  const light = photoPalettes({ photos: [{ dominant: ['#bb9483', '#63acc4'], uniformity: 0.2 } as any] })!;
  const shownWith = (palette: string) => [{ mode: 'calm' as const, draw: { palette } as any, mine: true }];
  it('follows a light calm card with a washed one, and a washed one with a light one', () => {
    const afterLight = styleDraws({ ...base, photoPalettes: light, shown: shownWith(light.calm.id), random: seeded(3) })[0];
    expect(afterLight.palette!.id).toBe(washedPalette(light.calm).id);
    const afterWashed = styleDraws({ ...base, photoPalettes: light, shown: shownWith(washedPalette(light.calm).id), random: seeded(3) })[0];
    expect(afterWashed.palette!.id).toBe(light.calm.id);
  });
});
