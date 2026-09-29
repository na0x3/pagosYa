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
