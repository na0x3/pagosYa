// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { assumedFactsCheck, pageLabel, renderAssumedFacts, type AssumedFactView } from './source-assumed-facts';

const FACT: AssumedFactView = { id: 'a1', text: 'tostado en <Caranavi>', kind: 'origin', status: 'assumed', pages: ['index.html', 'pages/carta.html'], unwrapped: ['pages/carta.html'] };

it('shows each fact, where it appears, and the three actions; escaped', () => {
  const html = renderAssumedFacts({ facts: [FACT], editing: null, locked: false });
  expect(html).toContain('Datos que YAPI supuso <span>1 por confirmar</span>');
  expect(html).toContain('tostado en &lt;Caranavi&gt;');
  expect(html).toContain('En Inicio, carta');
  expect(html).toContain('También aparece sin marcar en carta.');
  for (const action of ['data-fact-confirm="a1"', 'data-fact-edit="a1"', 'data-fact-remove="a1"']) expect(html).toContain(action);
  expect(renderAssumedFacts({ facts: [], editing: null, locked: false })).toBe('');
  expect(renderAssumedFacts({ facts: null, editing: null, locked: false })).toBe('');
});

it('opens the edit form for one fact, disables the actions while locked, and marks a confirmed fact', () => {
  expect(renderAssumedFacts({ facts: [FACT], editing: 'a1', locked: false })).toContain('data-fact-form="a1"');
  expect(renderAssumedFacts({ facts: [FACT], editing: null, locked: true })).toMatch(/data-fact-confirm="a1" disabled/);
  const done = renderAssumedFacts({ facts: [{ ...FACT, status: 'confirmed' }], editing: null, locked: false });
  expect(done).toContain('Confirmado');
  expect(done).not.toContain('data-fact-confirm');
  expect(done).not.toContain('por confirmar');
});

it('turns pending facts into a blocking check row, and nothing once they are settled', () => {
  expect(assumedFactsCheck([FACT])).toEqual({ label: 'Datos que YAPI supuso', status: 'failed', blocking: true, detail: 'Antes de publicar, confirma, corrige o quita el dato que YAPI supuso: «tostado en <Caranavi>». Está en «Datos que YAPI supuso».' });
  expect(assumedFactsCheck([{ ...FACT, status: 'confirmed' }])).toBeNull();
  expect(assumedFactsCheck(null)).toBeNull();
  expect(pageLabel('index.html')).toBe('Inicio');
});
