import { expect, it } from 'vitest';
import { QUICK_ACTIONS, createSelectionState, matchEditableText } from './source-selection';
import type { VisualField } from './source-visual-fields';

const field = (id: string, value: string, kind: VisualField['kind'] = 'text'): VisualField => ({ id, path: 'p', label: id, kind, value });

it('offers the six quick actions with Spanish, non-empty instructions', () => {
  expect(QUICK_ACTIONS.map(action => action.label)).toEqual(['Cambiar el texto', 'Hacer más grande', 'Mover arriba', 'Mover abajo', 'Duplicar', 'Ocultar']);
  for (const action of QUICK_ACTIONS) { expect(action.id).toBeTruthy(); expect(action.instruction.trim().length).toBeGreaterThan(10); }
  expect(QUICK_ACTIONS.find(action => action.id === 'move-up')!.instruction).toBe('Mueve esta sección una posición hacia arriba.');
});

it('matches exactly one text field by its whitespace-collapsed value', () => {
  const fields = [field('a', 'Hola  mundo'), field('b', 'Otro'), field('c', 'Hola mundo', 'image')];
  expect(matchEditableText(' Hola\n mundo ', fields)?.id).toBe('a');
  expect(matchEditableText('Nada', fields)).toBeNull();
  expect(matchEditableText(undefined, fields)).toBeNull();
  expect(matchEditableText('Otro', [...fields, field('d', 'Otro')])).toBeNull();
});

it('holds and clears the selection', () => {
  const state = createSelectionState();
  expect(state.get()).toBeNull();
  state.set({ sectionId: 'hero', label: 'Hola' });
  expect(state.get()).toEqual({ sectionId: 'hero', label: 'Hola' });
  state.clear();
  expect(state.get()).toBeNull();
});

// Point YAPI at a part of the page (spec 2026-11-05 point-at).
import { createViewingState, selectionChipLabel, selectionPayload, viewingPayload } from './source-selection';
const area = { points: [0, 0, 90, 0, 90, 90], rect: { x: 0, y: 0, width: 90, height: 90 }, sections: [{ page: 'home' as const, at: 1, label: 'Hola' }], texts: ['Hola'], photos: [], parts: [], width: 1280, pageQuery: 'index.html' };

it('keeps a template address and a circle, and sends them', () => {
  const state = createSelectionState();
  state.set({ sectionId: 'lb-1', label: 'Hola', at: 1, page: 'about' });
  expect(selectionPayload(state.get()!)).toEqual({ sectionId: 'lb-1', at: 1, page: 'about' });
  state.set({ sectionId: 'lb-1', label: 'Hola', area });
  expect(selectionPayload(state.get()!)).toEqual({ sectionId: 'lb-1', area });
  state.set({ sectionId: 'hero', label: 'Hola' });
  expect(selectionPayload(state.get()!)).toEqual({ sectionId: 'hero' });
});

it('labels a circle as a marked area', () => {
  expect(selectionChipLabel({ sectionId: 'lb-1', label: 'Hola' })).toBe('Hola');
  expect(selectionChipLabel({ sectionId: 'lb-1', label: 'Hola', area })).toBe('zona marcada · Hola');
});

it('remembers what the merchant is looking at until the page changes', () => {
  const viewing = createViewingState();
  viewing.set({ page: 'faq', at: 2, sectionId: 'lb-2', label: 'Preguntas' });
  expect(viewingPayload(viewing.get()!)).toEqual({ page: 'faq', at: 2, sectionId: 'lb-2' });
  viewing.clear();
  expect(viewing.get()).toBeNull();
});
