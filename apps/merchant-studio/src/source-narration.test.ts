import { describe, expect, it } from 'vitest';
import { narrationFromMessage, narrationFromProgress, narrationFromReply, stoppedNarration, typingPlan } from './source-narration';
import type { BuildProgress } from './source-build-progress';

const step = (label: string, status: 'running' | 'completed' | 'failed', details: string[] = []) => ({ stage: 'agent', label, startedAt: 1, status, details: details.map(label => ({ label })) });
const progress = (status: BuildProgress['status'], steps: BuildProgress['steps']): BuildProgress => ({ status, startedAt: 1, updatedAt: 2, steps });

describe('what the glass window says', () => {
  it('writes the plan YAPI made, one line per requirement', () => {
    const n = narrationFromProgress(progress('running', [step('Planificando', 'completed', ['Planificó 2 requisitos', 'Voy a: Cambiar el título', 'Voy a: Poner fotos.'])]));
    expect(n).toEqual({ phase: 'plan', lines: ['Voy a:', 'Cambiar el título.', 'Poner fotos.'] });
  });
  it('keeps the plan and adds what it is doing now', () => {
    const n = narrationFromProgress(progress('running', [step('Planificando', 'completed', ['Voy a: Cambiar el título']), step('Diseñando la portada', 'running')]));
    expect(n.phase).toBe('work');
    expect(n.lines).toEqual(['Voy a:', 'Cambiar el título.', 'Ahora: diseñando la portada…']);
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
    expect(narrationFromReply('x'.repeat(400)).lines[0].length).toBeLessThanOrEqual(140);
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
    expect(n).toEqual({ phase: 'done', lines: ['Listo.', 'Cambié el texto del botón principal a «Ver clases».'] });
  });
  it('prefers the agent summary when there is one', () => {
    expect(narrationFromMessage({ content: 'x', metadata: { sourceRevision: 5, label: 'r5', agentSummary: 'Hice una portada nueva con tus fotos.' } }).lines[1]).toBe('Hice una portada nueva con tus fotos.');
  });
  it('a reply without changes is the answer itself', () => {
    expect(narrationFromMessage({ content: '¿Qué datos quieres en tu política?', metadata: {} })).toEqual({ phase: 'done', lines: ['¿Qué datos quieres en tu política?'] });
  });
});

describe('YAPI writes less (owner 2026-10-21)', () => {
  it('shows at most four short plan lines and counts the rest', () => {
    const many = ['Crear la página Novias con los cuatro vestidos de novia que elegiste para la colección', 'B', 'C', 'D', 'E', 'F'];
    const n = narrationFromProgress(progress('running', [step('Planificando', 'completed', many.map(line => `Voy a: ${line}`))]));
    expect(n.lines).toHaveLength(6);
    expect(n.lines[1].length).toBeLessThanOrEqual(71);
    expect(n.lines[1]).toMatch(/…\.?$/);
    expect(n.lines.at(-1)).toBe('Y 2 cosas más.');
  });
  it('a long failure keeps one short sentence and drops the «YAPI no pudo terminar» prefix', () => {
    const long = 'YAPI no pudo terminar el trabajo: Se construyó la dirección editorial, el Inicio y las páginas. El borrador no pudo validarse porque el proyecto superó el límite.';
    expect(stoppedNarration(long).lines).toEqual(['No pude terminar: se construyó la dirección editorial, el Inicio y las páginas.', 'Tu tienda sigue como estaba.']);
  });
  it('a summary lists at most three sections and has no closing boilerplate', () => {
    expect(narrationFromMessage({ content: 'x', metadata: { sourceRevision: 3, agentSummary: 'Hice tu portada. Y además otras cosas.', agentSections: ['A', 'B', 'C', 'D'] } }).lines).toEqual(['Listo.', 'Hice tu portada.', 'Incluye: A, B, C.']);
  });
});

it('a reason that starts with YAPI keeps its capitals', () => {
  expect(stoppedNarration('YAPI llegó al límite de uso de su modelo por ahora. Tu tienda sigue como estaba.').lines[0]).toBe('No pude terminar: YAPI llegó al límite de uso de su modelo por ahora.');
});
