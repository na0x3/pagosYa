import type { LayoutBlock } from './source-section-library';
import type { ComposerProblem } from './source-composer';

/** Spec 2026-11-11 store composer: compose (twice at most), then look and correct (three rounds at most). Every side effect is
 *  injected; an error from compose (a spent quota) or a cancel stops the build, any trouble in the review keeps the last good home. */
export type ComposerDeps = {
  compose: (feedback: string[]) => Promise<{ answer: { blocks?: unknown[] } | null; microUsd: number }>;
  validate: (answer: { blocks?: unknown[] }) => LayoutBlock[];
  check: (layout: LayoutBlock[]) => string[];
  capture: (layout: LayoutBlock[]) => Promise<string[] | null>;
  review: (layout: LayoutBlock[], images: string[]) => Promise<{ problems: ComposerProblem[]; microUsd: number }>;
  apply: (layout: LayoutBlock[], problems: ComposerProblem[]) => { layout: LayoutBlock[]; applied: string[]; rewrite: number[] };
  rewrite: (layout: LayoutBlock[], at: number[]) => Promise<{ layout: LayoutBlock[]; microUsd: number }>;
  trace: (entry: Record<string, unknown>) => void;
  maxMicroUsd: number;
  rounds?: number;
  signal?: AbortSignal;
};
export type ComposerResult = { layout: LayoutBlock[] | null; answer: { blocks?: unknown[] } | null; spentMicroUsd: number; rounds: number;
  outcome: 'clean' | 'reviewed' | 'budget' | 'review-skipped' | 'fill' };

export async function runComposer(deps: ComposerDeps): Promise<ComposerResult> {
  const stop = () => { if (deps.signal?.aborted) throw new Error('El pedido se canceló.'); };
  let spent = 0;
  let feedback: string[] = [];
  let layout: LayoutBlock[] | null = null;
  let answer: { blocks?: unknown[] } | null = null;
  for (let attempt = 0; attempt < 2 && !layout; attempt++) {
    stop();
    const composed = await deps.compose(feedback);
    spent += composed.microUsd;
    if (!composed.answer) { deps.trace({ stage: 'compose', attempt, outcome: 'no-answer' }); break; }
    const candidate = deps.validate(composed.answer);
    const reasons = deps.check(candidate);
    deps.trace({ stage: 'compose', attempt, kept: candidate.map(block => block.type), reasons, spentMicroUsd: spent });
    if (reasons.length) { feedback = reasons; continue; }
    layout = candidate; answer = composed.answer;
  }
  if (!layout) return { layout: null, answer: null, spentMicroUsd: spent, rounds: 0, outcome: 'fill' };
  let outcome: ComposerResult['outcome'] = 'reviewed';
  let rounds = 0;
  for (let round = 1; round <= (deps.rounds ?? 3); round++) {
    stop();
    if (spent >= deps.maxMicroUsd) { outcome = 'budget'; break; }
    const images = await deps.capture(layout).catch(() => null);
    if (!images?.length) { outcome = 'review-skipped'; deps.trace({ stage: 'review', round, outcome: 'capture-failed' }); break; }
    let reviewed: { problems: ComposerProblem[]; microUsd: number };
    try { reviewed = await deps.review(layout, images); } catch (error) {
      stop();
      outcome = 'review-skipped'; deps.trace({ stage: 'review', round, outcome: 'failed', reason: String((error as Error)?.message ?? error).slice(0, 200) }); break;
    }
    spent += reviewed.microUsd; rounds = round;
    if (!reviewed.problems.length) { outcome = 'clean'; deps.trace({ stage: 'review', round, outcome: 'clean', spentMicroUsd: spent }); break; }
    const changed = deps.apply(layout, reviewed.problems);
    deps.trace({ stage: 'review', round, problems: reviewed.problems.map(entry => `${entry.problem} @${entry.at} ${entry.kind}=${entry.value}`), applied: changed.applied, spentMicroUsd: spent });
    if (!changed.applied.length) break;
    let next = changed.layout;
    if (changed.rewrite.length) { const written = await deps.rewrite(next, changed.rewrite); spent += written.microUsd; next = written.layout; }
    const reasons = deps.check(next);
    if (reasons.length) { deps.trace({ stage: 'review', round, outcome: 'change-refused', reasons }); break; }
    layout = next;
  }
  return { layout, answer, spentMicroUsd: spent, rounds, outcome };
}
