import type { BuildProgress } from './source-build-progress';

/**
 * What YAPI's glass window says (spec 2026-10-21 Part C). It only re-voices text YAPI already produced: the plan
 * («Voy a: …» details from plan_task), the step it is on, and its reply. No model call, no invented progress.
 */
export type Narration = { phase: 'plan' | 'work' | 'done' | 'stopped'; lines: string[] };

const PLAN = /^Voy a:\s*(.+)$/;
const sentence = (text: string) => { const t = text.trim(); return /[.!?…:]$/.test(t) ? t : `${t}.`; };
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('es') + text.slice(1);

export function stoppedNarration(): Narration {
  return { phase: 'stopped', lines: ['Me detuve antes de terminar. Tu tienda sigue como estaba.'] };
}

export function narrationFromProgress(progress: BuildProgress | null): Narration {
  if (!progress) return { phase: 'work', lines: [] };
  if (progress.status === 'failed') return stoppedNarration();
  const plan = progress.steps.flatMap(step => (step.details ?? []).map(detail => detail?.label?.match(PLAN)?.[1]).filter((line): line is string => Boolean(line)));
  const lines = plan.length ? ['Esto es lo que voy a hacer:', ...plan.map(sentence)] : [];
  const running = [...progress.steps].reverse().find(step => step.status === 'running');
  if (running && (!plan.length || progress.steps.indexOf(running) > progress.steps.findIndex(step => (step.details ?? []).some(d => PLAN.test(d?.label ?? ''))))) {
    return { phase: 'work', lines: [...lines, `Ahora: ${lowerFirst(running.label.replace(/[.…]+$/, ''))}…`] };
  }
  return { phase: plan.length ? 'plan' : 'work', lines };
}

export function narrationFromReply(text: string): Narration {
  const first = text.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  const done = /^listo[,.!:]?\s*/i.test(first);
  const rest = first.replace(/^listo[,.!:]?\s*/i, '');
  const body = rest.length > 320 ? `${rest.slice(0, 319).trimEnd()}…` : rest;
  const line = body.charAt(0).toLocaleUpperCase('es') + body.slice(1);
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

/** The summary for a finished request: a saved change says «Listo», what changed (YAPI's own words) and where to see
 *  it; a reply without a change (a question, an answer) is that reply. Never the editor's boilerplate. */
export function narrationFromMessage(message: { content?: unknown; metadata?: Record<string, unknown> | null }): Narration {
  const meta = message.metadata ?? {};
  if (typeof meta.sourceRevision !== 'number') return narrationFromReply(String(message.content ?? ''));
  const own = [meta.agentSummary, meta.label].find(value => typeof value === 'string' && value.trim() && !/^r\d+$/i.test(value.trim())) as string | undefined;
  const change = own ? narrationFromReply(own).lines.at(-1)! : '';
  return { phase: 'done', lines: ['Listo.', ...(change ? [sentence(change)] : []), 'Ya está en tu vista previa. Publícalo cuando te guste.'] };
}
