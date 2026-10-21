import { describe, expect, it } from 'vitest';
import { narrationFromMessage, narrationFromProgress, narrationFromReply, stoppedNarration, typingPlan } from './source-narration';
import type { BuildProgress } from './source-build-progress';

const step = (label: string, status: 'running' | 'completed' | 'failed', details: string[] = []) => ({ stage: 'agent', label, startedAt: 1, status, details: details.map(label => ({ label })) });
const progress = (status: BuildProgress['status'], steps: BuildProgress['steps']): BuildProgress => ({ status, startedAt: 1, updatedAt: 2, steps });

describe('what the glass window says', () => {
  it('writes the plan YAPI made, one line per requirement', () => {
    const n = narrationFromProgress(progress('running', [step('Planificando', 'completed', ['Planificó 2 requisitos', 'Voy a: Cambiar el título', 'Voy a: Poner fotos.'])]));
    expect(n).toEqual({ phase: 'plan', lines: ['Esto es lo que voy a hacer:', 'Cambiar el título.', 'Poner fotos.'] });
  });
  it('keeps the plan and adds what it is doing now', () => {
    const n = narrationFromProgress(progress('running', [step('Planificando', 'completed', ['Voy a: Cambiar el título']), step('Diseñando la portada', 'running')]));
    expect(n.phase).toBe('work');
    expect(n.lines).toEqual(['Esto es lo que voy a hacer:', 'Cambiar el título.', 'Ahora: diseñando la portada…']);
  });
  it('says plainly when it stopped', () => {
    expect(narrationFromProgress(progress('failed', [step('Diseñando', 'failed')]))).toEqual(stoppedNarration());
    expect(stoppedNarration()).toEqual({ phase: 'stopped', lines: ['Me detuve antes de terminar. Tu tienda sigue como estaba.'] });
  });
  it('waits quietly before there is anything to say', () => {
    expect(narrationFromProgress(null)).toEqual({ phase: 'work', lines: [] });
  });
  it('turns the reply into a short summary', () => {
    expect(narrationFromReply('Listo, cambié el título a Tu calma.\n\nDetalle técnico: …')).toEqual({ phase: 'done', lines: ['Listo.', 'Cambié el título a Tu calma.'] });
    expect(narrationFromReply('¿Qué datos quieres en tu política?')).toEqual({ phase: 'done', lines: ['¿Qué datos quieres en tu política?'] });
    expect(narrationFromReply('x'.repeat(400)).lines[0].length).toBeLessThanOrEqual(321);
  });
  it('types word by word at about 28 characters a second', () => {
    const plan = typingPlan('Hola mundo', 28);
    expect(plan.map(w => w.word)).toEqual(['Hola', 'mundo']);
    expect(plan[1].at).toBeGreaterThanOrEqual(5 / 28 * 1000);
  });
});

describe('the summary speaks for YAPI, not for the editor', () => {
  it('a saved change says Listo, what changed, and where to see it', () => {
    const n = narrationFromMessage({ content: 'Guardé los cambios de tu tienda «Cambié el CTA». El editor comprobará…', metadata: { sourceRevision: 4, label: 'Cambié el texto del botón principal a «Ver clases»' } });
    expect(n).toEqual({ phase: 'done', lines: ['Listo.', 'Cambié el texto del botón principal a «Ver clases».', 'Ya está en tu vista previa. Publícalo cuando te guste.'] });
  });
  it('prefers the agent summary when there is one', () => {
    expect(narrationFromMessage({ content: 'x', metadata: { sourceRevision: 5, label: 'r5', agentSummary: 'Hice una portada nueva con tus fotos.' } }).lines[1]).toBe('Hice una portada nueva con tus fotos.');
  });
  it('a reply without changes is the answer itself', () => {
    expect(narrationFromMessage({ content: '¿Qué datos quieres en tu política?', metadata: {} })).toEqual({ phase: 'done', lines: ['¿Qué datos quieres en tu política?'] });
  });
});
