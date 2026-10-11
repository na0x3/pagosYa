/**
 * "Elige tu estilo" (spec docs/superpowers/specs/2026-10-11-elige-tu-estilo-design.md, amendment "two cards"): two
 * independent draws, one per card. Slot 0 is calm, on the playbook family the latest same-kind stores used least; slot 1
 * is bold, on the other family (full colour catalogue, loud header and hero). The calm card counts as heavily used, so
 * the bold card gets its own hero and colour world while the catalogue allows.
 */
import { frameForRun, parseFrameDraw, type FrameAvailable, type Palette } from './frame-draw';
import { PLAYBOOK, pickFamily, type PlaybookKind, type StyleFamily } from './playbook';

export type StyleMode = 'calm' | 'bold';
export type StyleSlot = { slot: number; mode: StyleMode; kind: PlaybookKind; family: StyleFamily; file: { path: string; content: string }; paragraph: string; dna?: { button: string; hover: string }; palette?: Palette; draw: ReturnType<typeof parseFrameDraw> };
export type StyleDrawsInput = { kind: PlaybookKind; brandColours: boolean; category: string; previous: Array<{ path: string; content: string }>; recent: Parameters<typeof frameForRun>[0]['recent']; available: FrameAvailable; request: string; random?: () => number;
  /** The families the latest same-kind stores used (`recentForKind(...).families`): the calm card takes the least used. */
  recentFamilies?: string[] };

/** How many cards a proposal offers: one calm, one bold. The ChatGPT bridge allows about two concurrent calls, one per lane. */
export const STYLE_CARDS = 2;

const TAKEN_WEIGHT = 50;

export function styleDraws(input: StyleDrawsInput): StyleSlot[] {
  const entry = PLAYBOOK[input.kind];
  const calm = pickFamily(entry, input.random ?? Math.random, input.recentFamilies ?? []);
  const plan: Array<{ mode: StyleMode; family: StyleFamily }> = [
    { mode: 'calm', family: calm },
    { mode: 'bold', family: entry.families.find(family => family.id !== calm.id) ?? calm },
  ];
  const taken: ReturnType<typeof parseFrameDraw>[] = [];
  return plan.map(({ mode, family }, slot) => {
    const recent = [...Array.from({ length: TAKEN_WEIGHT }, () => taken).flat(), ...input.recent];
    const run = frameForRun({ enabled: true, designEnabled: true, fresh: true, brandColours: input.brandColours, category: input.category, previous: input.previous, recent, available: input.available, request: input.request, random: input.random, playbook: { kind: input.kind, family, bold: mode === 'bold' }, boldStyle: mode === 'bold' });
    const draw = parseFrameDraw(run.file?.content);
    taken.push(draw);
    return { slot, mode, kind: input.kind, family, file: run.file!, paragraph: run.paragraph, ...(run.dna ? { dna: run.dna } : {}), ...(run.palette ? { palette: run.palette } : {}), draw };
  });
}

/** What the planner reads for one card: its slot, its mode, its drawn frame and design, and its playbook paragraph. */
/** `lane`: the slot is planned alone (spec 2026-10-11 speed-up), so its concept is the only one returned. */
export function styleSlotDirection(slot: StyleSlot, playbook: string, options: { lane?: boolean } = {}): string {
  const mode = slot.mode === 'calm' ? 'calm: a normal, professionally made website of this kind' : 'bold: poster type, colour fields and one memorable device';
  const build = options.lane ? 'Build the one concept you return on exactly this; the other card is planned separately:' : `Build concepts[${slot.slot}] on exactly this; no other concept uses it:`;
  return [`CONCEPT ${slot.slot + 1} of ${STYLE_CARDS} (${mode}). ${build}`, slot.paragraph, playbook].filter(text => text.trim()).join('\n');
}
