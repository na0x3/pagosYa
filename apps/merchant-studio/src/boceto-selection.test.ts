import { expect, it } from 'vitest';
import { normalizePicks, togglePick, PICK_MAX } from './boceto-selection';

it('later picks win: a pick drops earlier picks inside it and replaces an earlier pick around it', () => {
  expect(normalizePicks([{ id: 'h', path: 'copy/headline' }, { id: 'h', path: 'copy' }])).toEqual([{ id: 'h', path: 'copy' }]);
  expect(normalizePicks([{ id: 'h', path: '' }, { id: 'h', path: 'copy/sub' }])).toEqual([{ id: 'h', path: 'copy/sub' }]);
  expect(normalizePicks([{ id: 'h', path: 'copy/sub' }, { id: 's', path: '' }, { id: 'h', path: 'copy/sub' }])).toEqual([{ id: 's', path: '' }, { id: 'h', path: 'copy/sub' }]);
  // 'copy/subx' is not inside 'copy/sub'
  expect(normalizePicks([{ id: 'h', path: 'copy/sub' }, { id: 'h', path: 'copy/subx' }])).toHaveLength(2);
});

it('keeps at most 40, the latest', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ id: `b${i}`, path: '' }));
  expect(normalizePicks(many)).toEqual(many.slice(-PICK_MAX));
});

it('toggle adds a pick or removes it when already picked', () => {
  const a = { id: 'h', path: 'copy/sub' }, b = { id: 'h', path: 'copy/headline' };
  expect(togglePick([a], b)).toEqual([a, b]);
  expect(togglePick([a, b], a)).toEqual([b]);
});
