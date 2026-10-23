import type { BuildProgress } from './source-build-progress';
import { stepLines } from './source-step-words';

/**
 * What YAPI's glass window says (spec 2026-10-21 Part C). It only re-voices text YAPI already produced: the plan
 * («Voy a: …» details from plan_task), the step it is on, and its reply. No model call, no invented progress.
 * Owner 2026-10-21: «make yapi write less text» — at most four short plan lines and one short sentence per summary.
 */
export type Narration = { phase: 'plan' | 'work' | 'done' | 'stopped'; lines: string[] };

const PLAN = /^Voy a:\s*(.+)$/;
const PLAN_LINES = 4;
const LINE_CHARS = 70;
const SUMMARY_CHARS = 140;
const sentence = (text: string) => { const t = text.trim(); return /[.!?…:]$/.test(t) ? t : `${t}.`; };
/** «YAPI», «NOVIAS»: a word that starts with two capitals keeps them. */
const lowerFirst = (text: string) => /^\p{Lu}{2}/u.test(text) ? text : text.charAt(0).toLocaleLowerCase('es') + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
/** Cut at a word boundary, never mid-word. */
const shorten = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${(cut.lastIndexOf(' ') > max * 0.6 ? cut.slice(0, cut.lastIndexOf(' ')) : cut).replace(/[\s,;:.]+$/, '')}…`;
};
/** The first sentence of a longer text. */
const firstSentence = (text: string) => text.replace(/\s+/g, ' ').trim().match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text.trim();

/** A stop says why when the Studio knows (no credits, a validation error), and always that the store is unchanged. */
export function stoppedNarration(reason?: string): Narration {
  const why = reason?.replace(/\s+/g, ' ').trim().replace(/^YAPI no pudo terminar(?: el trabajo)?:\s*/i, '');
  if (!why) return { phase: 'stopped', lines: ['Me detuve antes de terminar. Tu tienda sigue como estaba.'] };
  const short = shorten(firstSentence(why), SUMMARY_CHARS);
  return { phase: 'stopped', lines: [`No pude terminar: ${sentence(lowerFirst(short))}`, 'Tu tienda sigue como estaba.'] };
}

/** With `plain` (YAPI in design mode, spec 2026-10-22 v2 §3) the current step is said in the merchant's words, never a file name. */
export function narrationFromProgress(progress: BuildProgress | null, plain = false): Narration {
  if (!progress) return { phase: 'work', lines: [] };
  if (progress.status === 'failed') return stoppedNarration();
  const planned = progress.steps.flatMap(step => (step.details ?? []).map(detail => detail?.label?.match(PLAN)?.[1]).filter((line): line is string => Boolean(line)));
  const plan = planned.slice(0, PLAN_LINES).map(line => sentence(shorten(line, LINE_CHARS)));
  if (planned.length > PLAN_LINES) plan.push(`Y ${planned.length - PLAN_LINES} ${planned.length - PLAN_LINES === 1 ? 'cosa' : 'cosas'} más.`);
  const lines = plan.length ? ['Voy a:', ...plan] : [];
  const running = [...progress.steps].reverse().find(step => step.status === 'running');
  // Pill mode: YAPI's plan and its steps share one stage in real runs; the newest plain step always shows under the plan.
  const now = plain && running ? stepLines(progress, 1)[0] : undefined;
  if (now) return { phase: 'work', lines: [...lines, `${now}…`] };
  if (running && (!plan.length || progress.steps.indexOf(running) > progress.steps.findIndex(step => (step.details ?? []).some(d => PLAN.test(d?.label ?? ''))))) {
    return { phase: 'work', lines: [...lines, `Ahora: ${lowerFirst(shorten(running.label.replace(/[.…]+$/, ''), LINE_CHARS))}…`] };
  }
  return { phase: plan.length ? 'plan' : 'work', lines };
}

export function narrationFromReply(text: string): Narration {
  const first = text.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  const done = /^listo[,.!:]?\s*/i.test(first);
  const rest = first.replace(/^listo[,.!:]?\s*/i, '');
  const line = upperFirst(shorten(rest, SUMMARY_CHARS));
  return { phase: 'done', lines: done ? ['Listo.', line].filter(Boolean) : [line] };
}

/** When each word of `text` appears, in milliseconds, at about `cps` characters a second. */
export function typingPlan(text: string, cps = 28): Array<{ word: string; at: number }> {
  let chars = 0;
  return text.split(/\s+/).filter(Boolean).map(word => {
    const at = Math.round((chars / cps) * 1000);
    chars += word.length + 1;
    return { word, at };
  });
}

/** The summary for a finished request: a saved change says «Listo» and what changed (YAPI's own words, one sentence);
 *  a reply without a change (a question, an answer) is that reply. Never the editor's boilerplate. */
export function narrationFromMessage(message: { content?: unknown; metadata?: Record<string, unknown> | null }): Narration {
  const meta = message.metadata ?? {};
  // A plan card shows its own lines below; the bubble only points at it (live check 2026-10-22).
  if (meta.plan) return { phase: 'done', lines: ['Te preparé un plan: míralo abajo y toca «Construir» o dime qué cambiar.'] };
  if (typeof meta.sourceRevision !== 'number') return narrationFromReply(String(message.content ?? ''));
  const own = [meta.agentSummary, meta.label].find(value => typeof value === 'string' && value.trim() && !/^r\d+$/i.test(value.trim())) as string | undefined;
  const change = own ? narrationFromReply(firstSentence(own)).lines.at(-1)! : '';
  const sections = Array.isArray(meta.agentSections) ? meta.agentSections.filter((s): s is string => typeof s === 'string' && Boolean(s.trim())).slice(0, 3) : [];
  return { phase: 'done', lines: ['Listo.', ...(change ? [sentence(change)] : []), ...(sections.length ? [`Incluye: ${sections.join(', ')}.`] : [])] };
}
