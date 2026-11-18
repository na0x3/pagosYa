import type { LayoutBlock } from './source-section-library';
import { composerTemplate, fillableTemplate, lookOptions, type ComposerProblem, type ComposerTemplate, type SectionFit } from './source-composer';
import type { TemplateRuleFinding } from './source-template-qa-rules';

/** Spec 2026-11-13 fill review (docs/YAPI_MIGRATION_PLAN.md §2): after section fill saves a template home, the home is rendered at a
 *  desktop and a phone width, read by the template rules and by the composer's reviewer, and corrected through the composer's own
 *  changes on the layout — data only: no stylesheet, component or template file changes here. */

export type FillReviewViewport = 'desktop' | 'phone';
export type FillReviewFinding = TemplateRuleFinding & { viewport: FillReviewViewport };
export type FillReviewRender = { findings: FillReviewFinding[]; images: string[] };

/** The changes this slice applies: «swap» needs a rewrite call and could bring back what a clean home took out, so it waits. */
export const FILL_REVIEW_CHANGES = ['look', 'photo', 'band', 'move', 'remove'] as const;

export const blocking = (findings: readonly FillReviewFinding[]) => findings.filter(finding => finding.severity === 'block');

/** What the review may change on this template: its section-fit entry when it has one (as the composer reads it), otherwise the
 *  home's own sections with the looks the template offers — the first section always counts as its signature. Read from data
 *  only, so no template needs a rule of its own. */
export function fillReviewTemplate(id: string, name: string, preset: { layout?: readonly LayoutBlock[]; choices?: { looks?: Readonly<Record<string, readonly string[]>> } } | undefined,
  fit: SectionFit, layout: readonly LayoutBlock[], canFill: (type: string) => boolean): ComposerTemplate {
  const found = composerTemplate(id, name, preset, fit);
  const looks: Record<string, string[]> = {};
  const add = (type: string, look?: string) => { if (!look) return; const list = (looks[type] ??= []); if (!list.includes(look)) list.push(look); };
  for (const block of [...(preset?.layout ?? []), ...layout]) add(block.type, block.look);
  for (const [type, list] of Object.entries(preset?.choices?.looks ?? {})) for (const look of list) add(type, look);
  if (found) {
    const template = fillableTemplate(found, canFill);
    return { ...template, allowed: [...new Set([...template.allowed, ...layout.map(block => block.type)])], looks: mergeLooks(template.looks, looks) };
  }
  return { id, name, signature: layout[0] ? [layout[0].type] : [], allowed: [...new Set(layout.map(block => block.type))], looks };
}

function mergeLooks(a: Record<string, string[]>, b: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [type, list] of [...Object.entries(a), ...Object.entries(b)]) out[type] = [...new Set([...(out[type] ?? []), ...list])];
  return out;
}

const photosOf = (block: LayoutBlock) => [block.photo, block.photo2, ...(block.items ?? []).map(item => (item as { photo?: string }).photo)].filter((photo): photo is string => Boolean(photo));

/** Rule findings with a fix that needs no model (the applier's guards still keep the cover, the grid and the signature):
 *  a band of words alone loses its colour when the colour is the band's, or goes; a section of words alone goes; a photo shown
 *  twice, or one the product grid already shows, takes a photo the home does not use yet. One change per section. */
export function ruleRepairs(findings: readonly FillReviewFinding[], layout: readonly LayoutBlock[], photos: readonly string[]): ComposerProblem[] {
  const out: ComposerProblem[] = [];
  const touched = new Set<number>();
  const used = new Set(layout.flatMap(photosOf));
  const unused = photos.map((url, index) => ({ url, index })).filter(photo => !used.has(photo.url));
  for (const finding of blocking(findings)) {
    const at = finding.at;
    if (at === null || !layout[at] || touched.has(at)) continue;
    const block = layout[at];
    let change: ComposerProblem | null = null;
    if (finding.rule === 'dark-text-band' || finding.rule === 'dark-colour-text-band') {
      change = block.band && block.band !== 'paper' ? { problem: finding.rule, at, kind: 'band', value: '' } : { problem: finding.rule, at, kind: 'remove', value: '' };
    } else if (finding.rule === 'text-only-band') {
      change = { problem: finding.rule, at, kind: 'remove', value: '' };
    } else if ((finding.rule === 'repeated-photo' || finding.rule === 'grid-photo-reused') && block.photo && unused.length) {
      const next = unused.shift()!;
      change = { problem: finding.rule, at, kind: 'photo', value: String(next.index) };
    }
    if (change) { out.push(change); touched.add(at); }
  }
  return out;
}

/** The reviewer's changes this slice keeps: known kinds only, on sections that exist, one per section, after the rule repairs;
 *  a look must be one the section offers on this template. */
export function reviewChanges(problems: readonly ComposerProblem[], layout: readonly LayoutBlock[], template: ComposerTemplate, taken: ReadonlySet<number>): ComposerProblem[] {
  const seen = new Set(taken);
  return problems.filter(problem => {
    if (!(FILL_REVIEW_CHANGES as readonly string[]).includes(problem.kind) || !layout[problem.at] || seen.has(problem.at)) return false;
    if (problem.kind === 'look' && !lookOptions(template, layout[problem.at].type).includes(problem.value)) return false;
    seen.add(problem.at);
    return true;
  });
}

/** A corrected home is kept only if no rule fires more often than before, at either width (counted by rule and width, so a removed
 *  section shifting the numbers below it does not count as new). Deterministic: the reviewer steers, the rules decide. */
export function noWorse(before: readonly FillReviewFinding[], after: readonly FillReviewFinding[]): boolean {
  const count = (list: readonly FillReviewFinding[]) => blocking(list).reduce((map, finding) => {
    const key = `${finding.rule}@${finding.viewport}`;
    return map.set(key, (map.get(key) ?? 0) + 1);
  }, new Map<string, number>());
  const was = count(before);
  return [...count(after)].every(([key, n]) => n <= (was.get(key) ?? 0));
}

export type FillReviewDeps = {
  render: (layout: LayoutBlock[]) => Promise<FillReviewRender | null>;
  review: (layout: LayoutBlock[], images: string[], findings: FillReviewFinding[]) => Promise<{ problems: ComposerProblem[]; microUsd: number }>;
  apply: (layout: LayoutBlock[], problems: ComposerProblem[]) => { layout: LayoutBlock[]; applied: string[] };
  repairs: (findings: FillReviewFinding[], layout: LayoutBlock[]) => ComposerProblem[];
  pick: (problems: ComposerProblem[], layout: LayoutBlock[], taken: ReadonlySet<number>) => ComposerProblem[];
  /** An error that must stop the build instead of skipping the review (a spent quota). */
  fatal: (error: unknown) => boolean;
  trace: (entry: Record<string, unknown>) => void;
  maxMicroUsd: number;
  rounds?: number;
  signal?: AbortSignal;
};
export type FillReviewResult = {
  layout: LayoutBlock[]; changed: boolean; rounds: number; applied: string[]; spentMicroUsd: number;
  before: FillReviewFinding[]; after: FillReviewFinding[];
  outcome: 'clean' | 'improved' | 'unchanged' | 'refused' | 'budget' | 'skipped';
};

const reason = (error: unknown) => String((error as Error)?.message ?? error).slice(0, 200);

/** Render → read → correct → render again, at most `rounds` (2) times and under `maxMicroUsd`. A round is kept only when
 *  `noWorse`; a failed render or review keeps the home as it was. A cancel or a fatal error (spent quota) reaches the caller. */
export async function runFillReview(layout: LayoutBlock[], deps: FillReviewDeps): Promise<FillReviewResult> {
  const stop = () => { if (deps.signal?.aborted) throw new Error('El pedido se canceló.'); };
  const guarded = async <T>(stage: string, work: () => Promise<T>): Promise<T | null> => {
    try { return await work(); } catch (error) {
      stop();
      if (deps.fatal(error)) throw error;
      deps.trace({ stage, outcome: 'failed', reason: reason(error) });
      return null;
    }
  };
  stop();
  const first = await guarded('render', () => deps.render(layout));
  if (!first) return { layout, changed: false, rounds: 0, applied: [], spentMicroUsd: 0, before: [], after: [], outcome: 'skipped' };
  let current = layout;
  let seen = first;
  let spent = 0;
  let rounds = 0;
  const applied: string[] = [];
  let outcome: FillReviewResult['outcome'] = 'unchanged';
  const settle = () => (applied.length ? 'improved' : 'unchanged') as FillReviewResult['outcome'];
  for (let round = 1; round <= (deps.rounds ?? 2); round++) {
    stop();
    if (spent >= deps.maxMicroUsd) { outcome = applied.length ? 'improved' : 'budget'; break; }
    const fixes = deps.repairs(seen.findings, current);
    const reviewed = await guarded('review', () => deps.review(current, seen.images, seen.findings)) ?? { problems: [], microUsd: 0 };
    spent += reviewed.microUsd; rounds = round;
    const changes = [...fixes, ...deps.pick(reviewed.problems, current, new Set(fixes.map(fix => fix.at)))];
    deps.trace({ stage: 'review', round, findings: blocking(seen.findings).map(f => `${f.rule}@${f.viewport}:${f.at ?? '-'}`), changes: changes.map(c => `${c.kind}@${c.at}=${c.value}`), spentMicroUsd: spent });
    if (!changes.length) { outcome = applied.length ? 'improved' : blocking(seen.findings).length ? 'unchanged' : 'clean'; break; }
    const next = deps.apply(current, changes);
    if (!next.applied.length) { outcome = settle(); break; }
    const checked = await guarded('render', () => deps.render(next.layout));
    if (!checked) { outcome = settle(); break; }
    if (!noWorse(seen.findings, checked.findings)) {
      deps.trace({ stage: 'check', round, outcome: 'refused', after: blocking(checked.findings).map(f => `${f.rule}@${f.viewport}`) });
      outcome = applied.length ? 'improved' : 'refused';
      break;
    }
    current = next.layout; seen = checked; applied.push(...next.applied); outcome = 'improved';
  }
  return { layout: current, changed: applied.length > 0, rounds, applied, spentMicroUsd: spent, before: first.findings, after: seen.findings, outcome };
}
