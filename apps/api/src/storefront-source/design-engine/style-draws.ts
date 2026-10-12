/**
 * "Elige tu estilo" (spec docs/superpowers/specs/2026-10-11-elige-tu-estilo-design.md, amendment "two cards"): two
 * independent draws, one per card. Slot 0 is calm, on the playbook family the latest same-kind stores used least; slot 1
 * is bold, on the other family (full colour catalogue, loud header and hero). The calm card counts as heavily used, so
 * the bold card gets its own hero and colour world while the catalogue allows.
 *
 * Variety (2026-10-11, "always the same two templates"): the history also holds the cards recent proposals SHOWED (built
 * or not), the draw takes any option within one use of the least used, the calm card rotates its family's font pairs and
 * the bold card draws one signature device.
 */
import { frameForRun, parseFrameDraw, type FrameAvailable, type Palette } from './frame-draw';
import { cartWordFor, drawCommerce, parseCommerceDraw, type CommerceDraw } from './commerce-draw';
import { PLAYBOOK, pickFamily, type PlaybookKind, type StyleFamily } from './playbook';

export type StyleMode = 'calm' | 'bold';

/** The bold card's one memorable device, drawn per card so bold heroes stop looking alike. */
export const SIGNATURE_DEVICES = {
  stamp: { label: 'a circular text stamp (inline SVG textPath) with the store\'s own words' },
  marquee: { label: 'a marquee band of the business\'s own words running across the page' },
  stickers: { label: 'a cluster of two or three tilted stickers with short real words from the brief' },
  numbers: { label: 'a row of oversized real numbers from the brief (hours, years, sizes, prices), never invented', needs: (available: FrameAvailable, numbers: number) => available.facts && numbers >= 2 },
  'torn-edge': { label: 'a torn-paper edge on the main photo', needs: (available: FrameAvailable) => available.photos >= 1 },
  polaroids: { label: 'a small stack of polaroid-framed photos, each slightly turned', needs: (available: FrameAvailable) => available.photos >= 1 },
  ticket: { label: 'a label or ticket tag (notched or punched) carrying a real detail' },
  'outline-wordmark': { label: 'a giant outline wordmark of the store name set behind the headline' },
} as const satisfies Record<string, { label: string; needs?: (available: FrameAvailable, numbers: number) => boolean }>;
export type SignatureDevice = keyof typeof SIGNATURE_DEVICES;
export const isSignatureDevice = (value: unknown): value is SignatureDevice => typeof value === 'string' && Object.prototype.hasOwnProperty.call(SIGNATURE_DEVICES, value);

export type StyleSlot = { slot: number; mode: StyleMode; kind: PlaybookKind; family: StyleFamily; file: { path: string; content: string }; paragraph: string; dna?: { button: string; hover: string }; palette?: Palette; draw: ReturnType<typeof parseFrameDraw>;
  /** Bold card: its drawn signature device. Saved with the proposal, so later proposals avoid it. */
  device?: SignatureDevice;
  /** Calm card: the family's font pair drawn for it. */
  fonts?: { display: string; text: string };
  /** Display fonts recent cards of this kind and mode showed, for the planner to stay off. */
  avoidDisplay?: string[];
  /** Account, checkout, fields and cart path drawn for this card (spec 2026-10-11 commerce surfaces). Saved in file and draw. */
  commerce?: CommerceDraw;
  /** The cart's word for this kind of business. */
  cartWord?: string };

/** One card a recent proposal showed (built or not): what `SourceProjectsService.recentStyleCards` reads back. */
export type ShownStyleCard = { kind?: string; mode: StyleMode; draw: ReturnType<typeof parseFrameDraw>; device?: string; display?: string;
  /** Shown to this merchant: counts past the spread, so the merchant never gets the same card part again while another fits. */
  mine?: boolean };

export type StyleDrawsInput = { kind: PlaybookKind; brandColours: boolean; category: string; previous: Array<{ path: string; content: string }>; recent: Parameters<typeof frameForRun>[0]['recent']; available: FrameAvailable; request: string; random?: () => number;
  /** The families the latest same-kind stores used (`recentForKind(...).families`): the calm card takes the least used. */
  recentFamilies?: string[];
  /** Cards recent proposals showed: the merchant's own and the same kind's across stores, newest first. */
  shown?: ShownStyleCard[];
  /** How many real numbers the brief gives (`numbersIn`): the numbers device needs two. */
  briefNumbers?: number };

/** How long a proposal waits for the shown-cards history before drawing without it. */
export const SHOWN_CARDS_TIMEOUT_MS = 1500;
/** `work()`'s result, or `fallback` when it throws, rejects or takes longer than `ms`. */
export async function withinOr<T>(work: () => Promise<T> | T, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms); });
  try { return await Promise.race([Promise.resolve().then(work).catch(() => fallback), late]); } finally { clearTimeout(timer); }
}

/** How many cards a proposal offers: one calm, one bold. The ChatGPT bridge allows about two concurrent calls, one per lane. */
export const STYLE_CARDS = 2;

const TAKEN_WEIGHT = 50;
/** Style cards take any option within this many uses of the least used one (ordinary runs: exactly the least used). */
const STYLE_SPREAD = 1;
const AVOID_FONTS = 6;

/** Uniform among the options used at most `spread` more than the least used. */
function rotate<T>(options: readonly T[], uses: (option: T) => number, random: () => number, spread: number): T {
  const counts = options.map(uses);
  const fewest = Math.min(...counts);
  const pool = options.filter((_, i) => counts[i] <= fewest + spread);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function styleDraws(input: StyleDrawsInput): StyleSlot[] {
  const entry = PLAYBOOK[input.kind];
  const random = input.random ?? Math.random;
  const shown = input.shown ?? [];
  const sameKind = shown.filter(card => card.kind === input.kind);
  // A shown card counts like a built store; one this merchant saw counts past the spread, like a redesign's own last draw.
  const weighted = <T>(cards: ShownStyleCard[], value: (card: ShownStyleCard) => T): T[] => cards.flatMap(card => Array.from({ length: card.mine ? 1 + STYLE_SPREAD : 1 }, () => value(card)));
  // A shown calm card counts for its family: the next proposal leans to the other one.
  const shownFamilies = weighted(sameKind.filter(card => card.mode === 'calm'), card => String(card.draw.family ?? '')).filter(Boolean);
  const calm = pickFamily(entry, random, [...(input.recentFamilies ?? []), ...shownFamilies]);
  const plan: Array<{ mode: StyleMode; family: StyleFamily }> = [
    { mode: 'calm', family: calm },
    { mode: 'bold', family: entry.families.find(family => family.id !== calm.id) ?? calm },
  ];
  const history = [...input.recent, ...weighted(shown, card => card.draw)];
  const displaysShown = (mode: StyleMode) => weighted(sameKind.filter(card => card.mode === mode && card.display), card => card.display!);
  const taken: ReturnType<typeof parseFrameDraw>[] = [];
  const slots: StyleSlot[] = plan.map(({ mode, family }, slot) => {
    const recent = [...Array.from({ length: TAKEN_WEIGHT }, () => taken).flat(), ...history];
    const run = frameForRun({ enabled: true, designEnabled: true, fresh: true, brandColours: input.brandColours, category: input.category, previous: input.previous, recent, available: input.available, request: input.request, random, playbook: { kind: input.kind, family, bold: mode === 'bold' }, boldStyle: mode === 'bold', spread: STYLE_SPREAD });
    const draw = parseFrameDraw(run.file?.content);
    taken.push(draw);
    const used = displaysShown(mode);
    let extra: Pick<StyleSlot, 'device' | 'fonts' | 'avoidDisplay'>;
    if (mode === 'calm') {
      // The family's font pairs rotate like the frame: the pair the latest cards of this kind showed least.
      const fonts = family.fonts.length ? rotate(family.fonts, pair => used.filter(id => id === pair.display).length, random, STYLE_SPREAD) : undefined;
      extra = { ...(fonts ? { fonts: { display: fonts.display, text: fonts.text } } : {}), avoidDisplay: [...new Set(used)].filter(id => id !== fonts?.display).slice(0, AVOID_FONTS) };
    } else {
      // The device avoids every recent one while a fresh one fits; ties are random.
      const devices = (Object.keys(SIGNATURE_DEVICES) as SignatureDevice[]).filter(id => { const needs = (SIGNATURE_DEVICES[id] as { needs?: (a: FrameAvailable, n: number) => boolean }).needs; return !needs || needs(input.available, input.briefNumbers ?? 0); });
      const recentDevices = weighted(shown, card => card.device);
      extra = { device: rotate(devices, id => recentDevices.filter(device => device === id).length, random, 0), avoidDisplay: [...new Set(used)].slice(0, AVOID_FONTS) };
    }
    return { slot, mode, kind: input.kind, family, file: run.file!, paragraph: run.paragraph, ...(run.dna ? { dna: run.dna } : {}), ...(run.palette ? { palette: run.palette } : {}), draw, ...extra };
  });
  // Commerce draws after every frame, so the header, hero and design each slot drew are unchanged by it.
  const commerceTaken: Array<Partial<CommerceDraw>> = [];
  const commerceHistory = history.map(parseCommerceDraw);
  const cartWord = cartWordFor(input.kind);
  const cartLine = cartWord ? `- Cart label: the header's cart reads «${cartWord}» followed by the count in [data-cart-count]; never another word for the cart.` : '';
  return slots.map(slot => {
    const commerce = drawCommerce(random, [...commerceTaken, ...commerceHistory], slot.mode, STYLE_SPREAD);
    commerceTaken.push(commerce);
    const saved = { ...JSON.parse(slot.file.content), ...commerce };
    return { ...slot, file: { ...slot.file, content: JSON.stringify(saved, null, 2) + '\n' }, draw: { ...slot.draw, ...commerce }, commerce, ...(cartWord ? { cartWord } : {}), paragraph: [slot.paragraph, cartLine].filter(Boolean).join('\n') };
  });
}

/** What the planner reads for one card: its slot, its mode, its drawn frame and design, and its playbook paragraph. */
/** `lane`: the slot is planned alone (spec 2026-10-11 speed-up), so its concept is the only one returned. */
export function styleSlotDirection(slot: StyleSlot, playbook: string, options: { lane?: boolean } = {}): string {
  const mode = slot.mode === 'calm' ? 'calm: a normal, professionally made website of this kind' : 'bold: poster type, colour fields and one memorable device';
  const build = options.lane ? 'Build the one concept you return on exactly this; the other card is planned separately:' : `Build concepts[${slot.slot}] on exactly this; no other concept uses it:`;
  const device = slot.mode === 'bold' && slot.device ? `- Signature device of this card (its one memorable move, drawn for it): ${SIGNATURE_DEVICES[slot.device].label}.` : '';
  const fonts = [
    slot.fonts ? `display ${slot.fonts.display} with text ${slot.fonts.text}` : '',
    slot.avoidDisplay?.length ? `avoid these display fonts: ${slot.avoidDisplay.join(', ')} (recent cards of this kind used them)` : '',
  ].filter(Boolean);
  return [`CONCEPT ${slot.slot + 1} of ${STYLE_CARDS} (${mode}). ${build}`, slot.paragraph, device, fonts.length ? `- Fonts for this card: ${fonts.join('; ')}.` : '', playbook].filter(text => text.trim()).join('\n');
}
